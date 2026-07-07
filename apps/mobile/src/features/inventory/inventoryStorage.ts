import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, differenceInCalendarDays, isValid, parseISO } from 'date-fns';

import { storageKeys } from '@/features/storageKeys';
import {
  clearActiveHouseholdInventoryData,
  deleteActiveHouseholdInventoryItem,
  getActiveHouseholdSnapshot,
  syncActiveHouseholdInventoryAndHistory,
  upsertActiveHouseholdInventoryItem,
  upsertActiveHouseholdPurchaseHistory,
} from '@/features/sync/householdSyncService';
import { nowIso } from '@/utils/date';

import { calculateEstimatedEndDate, calculateRemainingDays, getInventoryCatIds } from './inventoryLogic';
import { InventoryItem, LastingDaysReplenishMode, PurchaseHistory } from './inventoryTypes';

let cachedInventoryItems: InventoryItem[] | undefined;
let cachedPurchaseHistory: PurchaseHistory[] | undefined;

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) {
    cachedInventoryItems = snapshot.inventoryItems;
    return snapshot.inventoryItems;
  }

  const raw = await AsyncStorage.getItem(storageKeys.inventoryItems);
  const items = raw ? (JSON.parse(raw) as InventoryItem[]) : [];
  cachedInventoryItems = items;
  return items;
}

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  const items = await getInventoryItems();
  return items.find((item) => item.id === id);
}

export function getCachedInventoryItem(id: string): InventoryItem | undefined {
  return cachedInventoryItems?.find((item) => item.id === id);
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  const estimatedEndDate = item.estimatedEndDate ?? calculateEstimatedEndDate(item);
  const normalized = {
    ...item,
    estimatedEndDate,
    updatedAt: nowIso(),
  };

  if (await upsertActiveHouseholdInventoryItem(normalized)) {
    cachedInventoryItems = upsertCachedInventoryItem(cachedInventoryItems, normalized);
    return;
  }

  const items = await getInventoryItems();
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? normalized : current))
    : [normalized, ...items];
  cachedInventoryItems = next;
  await AsyncStorage.setItem(storageKeys.inventoryItems, JSON.stringify(next));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (await deleteActiveHouseholdInventoryItem(id)) {
    cachedInventoryItems = cachedInventoryItems?.filter((item) => item.id !== id);
    cachedPurchaseHistory = cachedPurchaseHistory?.filter((entry) => entry.inventoryItemId !== id);
    return;
  }

  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  await AsyncStorage.setItem(
    storageKeys.inventoryItems,
    JSON.stringify(items.filter((item) => item.id !== id)),
  );
  cachedInventoryItems = items.filter((item) => item.id !== id);
  await AsyncStorage.setItem(
    storageKeys.purchaseHistory,
    JSON.stringify(history.filter((entry) => entry.inventoryItemId !== id)),
  );
  cachedPurchaseHistory = history.filter((entry) => entry.inventoryItemId !== id);
}

export async function deleteInventoryItemsForCat(catId: string): Promise<void> {
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const nextItems = removeCatFromInventoryItems(items, catId);
  const nextItemIds = new Set(nextItems.map((item) => item.id));
  const nextHistory = history.filter((entry) => nextItemIds.has(entry.inventoryItemId));
  cachedInventoryItems = nextItems;
  cachedPurchaseHistory = nextHistory;
  if (await syncActiveHouseholdInventoryAndHistory(nextItems, nextHistory)) return;

  await AsyncStorage.setItem(
    storageKeys.inventoryItems,
    JSON.stringify(nextItems),
  );
  await AsyncStorage.setItem(
    storageKeys.purchaseHistory,
    JSON.stringify(nextHistory),
  );
}

export async function getPurchaseHistory(): Promise<PurchaseHistory[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) {
    cachedPurchaseHistory = snapshot.purchaseHistory;
    return snapshot.purchaseHistory;
  }

  const raw = await AsyncStorage.getItem(storageKeys.purchaseHistory);
  const history = raw ? (JSON.parse(raw) as PurchaseHistory[]) : [];
  cachedPurchaseHistory = history;
  return history;
}

export async function addPurchaseHistory(entry: PurchaseHistory): Promise<void> {
  if (await upsertActiveHouseholdPurchaseHistory(entry)) {
    cachedPurchaseHistory = [entry, ...(cachedPurchaseHistory ?? [])];
    return;
  }

  const history = await getPurchaseHistory();
  const nextHistory = [entry, ...history];
  cachedPurchaseHistory = nextHistory;
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify(nextHistory));
}

export async function updatePurchaseHistoryPrice(id: string, price?: number): Promise<PurchaseHistory[]> {
  const history = await getPurchaseHistory();
  const nextHistory = history.map((entry) => (entry.id === id ? { ...entry, price } : entry));
  const changedEntry = nextHistory.find((entry) => entry.id === id);
  if (changedEntry && (await upsertActiveHouseholdPurchaseHistory(changedEntry))) return nextHistory;

  cachedPurchaseHistory = nextHistory;
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify(nextHistory));
  return nextHistory;
}

export async function replenishInventoryItem(
  item: InventoryItem,
  history: PurchaseHistory,
  resetOpenedDate: boolean,
  lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
): Promise<InventoryItem> {
  const allHistory = await getPurchaseHistory();
  const itemHistory = allHistory.filter((entry) => entry.inventoryItemId === item.id);
  const estimatedEndDate = calculateReplenishedEstimatedEndDate(
    item,
    history,
    lastingDaysReplenishMode,
    itemHistory,
  );
  const nextItem: InventoryItem = {
    ...item,
    amount: history.amount,
    unit: history.unit,
    purchaseDate: history.purchasedAt,
    openedDate: resetOpenedDate ? history.purchasedAt : item.openedDate,
    estimatedEndDate,
    updatedAt: nowIso(),
  };
  await saveInventoryItem(nextItem);
  await addPurchaseHistory(history);
  return nextItem;
}

export async function clearInventoryData(): Promise<void> {
  cachedInventoryItems = undefined;
  cachedPurchaseHistory = undefined;
  if (await clearActiveHouseholdInventoryData()) return;

  await Promise.all([
    AsyncStorage.removeItem(storageKeys.inventoryItems),
    AsyncStorage.removeItem(storageKeys.purchaseHistory),
  ]);
}

function upsertCachedInventoryItem(items: InventoryItem[] | undefined, item: InventoryItem): InventoryItem[] {
  if (!items) return [item];
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function removeCatFromInventoryItems(items: InventoryItem[], catId: string): InventoryItem[] {
  return items
    .map((item): InventoryItem | undefined => {
      const catIds = getInventoryCatIds(item).filter((currentCatId) => currentCatId !== catId);
      if (catIds.length === 0) return undefined;
      return {
        ...item,
        catId: catIds[0],
        sharedCatIds: catIds.length > 1 ? catIds.slice(1) : undefined,
        updatedAt: nowIso(),
      };
    })
    .filter((item): item is InventoryItem => Boolean(item));
}

function calculateReplenishedEstimatedEndDate(
  item: InventoryItem,
  history: PurchaseHistory,
  lastingDaysReplenishMode: LastingDaysReplenishMode,
  itemHistory: PurchaseHistory[],
): string | undefined {
  const replenishedAt = parseISO(history.purchasedAt);
  const remainingDays = Math.max(0, calculateRemainingDays(item, replenishedAt) ?? 0);

  if (item.estimationMode === 'lasting_days' && item.lastingDays && item.lastingDays > 0) {
    const nextDays =
      lastingDaysReplenishMode === 'add_remaining'
        ? remainingDays + item.lastingDays
        : item.lastingDays;
    return addDays(replenishedAt, nextDays).toISOString().slice(0, 10);
  }

  if ((!item.estimationMode || item.estimationMode === 'usage') && item.dailyUsage && item.dailyUsage > 0) {
    const addedDays = Math.ceil(history.amount / item.dailyUsage);
    return addDays(replenishedAt, remainingDays + addedDays).toISOString().slice(0, 10);
  }

  if (item.estimationMode === 'purchase_frequency') {
    return calculatePurchaseFrequencyEstimatedEndDate(item, history, itemHistory);
  }

  return undefined;
}

function calculatePurchaseFrequencyEstimatedEndDate(
  item: InventoryItem,
  newHistory: PurchaseHistory,
  itemHistory: PurchaseHistory[],
): string | undefined {
  const purchaseDates = [item.purchaseDate, ...itemHistory.map((entry) => entry.purchasedAt), newHistory.purchasedAt]
    .map((date) => parseISO(date))
    .filter(isValid)
    .sort((a, b) => a.getTime() - b.getTime());

  if (purchaseDates.length < 2) return undefined;

  const intervals = purchaseDates
    .slice(1)
    .map((date, index) => differenceInCalendarDays(date, purchaseDates[index]))
    .filter((days) => days > 0);

  if (intervals.length === 0) return undefined;

  const averageIntervalDays = Math.max(
    1,
    Math.round(intervals.reduce((total, days) => total + days, 0) / intervals.length),
  );
  const latestPurchaseDate = purchaseDates[purchaseDates.length - 1];
  return addDays(latestPurchaseDate, averageIntervalDays).toISOString().slice(0, 10);
}
