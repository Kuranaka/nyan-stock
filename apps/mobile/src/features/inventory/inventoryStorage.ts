import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, differenceInCalendarDays, isValid, parseISO } from 'date-fns';

import { storageKeys } from '@/features/storageKeys';
import { getActiveHouseholdSnapshot, updateActiveHouseholdSnapshot } from '@/features/sync/householdSyncService';
import { nowIso } from '@/utils/date';

import { calculateEstimatedEndDate, calculateRemainingDays, getInventoryCatIds } from './inventoryLogic';
import { InventoryItem, LastingDaysReplenishMode, PurchaseHistory } from './inventoryTypes';

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) return snapshot.inventoryItems;

  const raw = await AsyncStorage.getItem(storageKeys.inventoryItems);
  return raw ? (JSON.parse(raw) as InventoryItem[]) : [];
}

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  const items = await getInventoryItems();
  return items.find((item) => item.id === id);
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  const estimatedEndDate = item.estimatedEndDate ?? calculateEstimatedEndDate(item);
  const normalized = {
    ...item,
    estimatedEndDate,
    updatedAt: nowIso(),
  };

  const snapshot = await updateActiveHouseholdSnapshot((current) => {
    const nextItems = current.inventoryItems.some((currentItem) => currentItem.id === item.id)
      ? current.inventoryItems.map((currentItem) => (currentItem.id === item.id ? normalized : currentItem))
      : [normalized, ...current.inventoryItems];
    return {
      ...current,
      inventoryItems: nextItems,
    };
  });
  if (snapshot) return;

  const items = await getInventoryItems();
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? normalized : current))
    : [normalized, ...items];
  await AsyncStorage.setItem(storageKeys.inventoryItems, JSON.stringify(next));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const snapshot = await updateActiveHouseholdSnapshot((current) => ({
    ...current,
    inventoryItems: current.inventoryItems.filter((item) => item.id !== id),
    purchaseHistory: current.purchaseHistory.filter((entry) => entry.inventoryItemId !== id),
  }));
  if (snapshot) return;

  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  await AsyncStorage.setItem(
    storageKeys.inventoryItems,
    JSON.stringify(items.filter((item) => item.id !== id)),
  );
  await AsyncStorage.setItem(
    storageKeys.purchaseHistory,
    JSON.stringify(history.filter((entry) => entry.inventoryItemId !== id)),
  );
}

export async function deleteInventoryItemsForCat(catId: string): Promise<void> {
  const snapshot = await updateActiveHouseholdSnapshot((current) => {
    const nextItems = removeCatFromInventoryItems(current.inventoryItems, catId);
    const nextItemIds = new Set(nextItems.map((item) => item.id));
    return {
      ...current,
      inventoryItems: nextItems,
      purchaseHistory: current.purchaseHistory.filter((entry) => nextItemIds.has(entry.inventoryItemId)),
    };
  });
  if (snapshot) return;

  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const nextItems = removeCatFromInventoryItems(items, catId);
  const nextItemIds = new Set(nextItems.map((item) => item.id));
  await AsyncStorage.setItem(
    storageKeys.inventoryItems,
    JSON.stringify(nextItems),
  );
  await AsyncStorage.setItem(
    storageKeys.purchaseHistory,
    JSON.stringify(history.filter((entry) => nextItemIds.has(entry.inventoryItemId))),
  );
}

export async function getPurchaseHistory(): Promise<PurchaseHistory[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) return snapshot.purchaseHistory;

  const raw = await AsyncStorage.getItem(storageKeys.purchaseHistory);
  return raw ? (JSON.parse(raw) as PurchaseHistory[]) : [];
}

export async function addPurchaseHistory(entry: PurchaseHistory): Promise<void> {
  const snapshot = await updateActiveHouseholdSnapshot((current) => ({
    ...current,
    purchaseHistory: [entry, ...current.purchaseHistory],
  }));
  if (snapshot) return;

  const history = await getPurchaseHistory();
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify([entry, ...history]));
}

export async function updatePurchaseHistoryPrice(id: string, price?: number): Promise<PurchaseHistory[]> {
  const snapshot = await updateActiveHouseholdSnapshot((current) => ({
    ...current,
    purchaseHistory: current.purchaseHistory.map((entry) => (entry.id === id ? { ...entry, price } : entry)),
  }));
  if (snapshot) return snapshot.purchaseHistory;

  const history = await getPurchaseHistory();
  const nextHistory = history.map((entry) => (entry.id === id ? { ...entry, price } : entry));
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
  const snapshot = await updateActiveHouseholdSnapshot((current) => ({
    ...current,
    inventoryItems: [],
    purchaseHistory: [],
  }));
  if (snapshot) return;

  await Promise.all([
    AsyncStorage.removeItem(storageKeys.inventoryItems),
    AsyncStorage.removeItem(storageKeys.purchaseHistory),
  ]);
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
