import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, format, parseISO } from 'date-fns';

import { storageKeys } from '@/features/storageKeys';
import {
  clearActiveHouseholdInventoryData,
  deleteActiveHouseholdPurchaseHistory,
  getActiveHouseholdSnapshot,
  syncActiveHouseholdInventoryAndHistory,
  upsertActiveHouseholdInventoryItem,
  upsertActiveHouseholdPurchaseHistory,
} from '@/features/sync/householdSyncService';
import { nowIso } from '@/utils/date';

import {
  calculateEstimatedEndDate,
  calculateRemainingDays,
  getInventoryCatIds,
} from './inventoryLogic';
import { calculatePurchaseFrequencyPrediction } from './purchaseFrequency';
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
  const hasPurchaseFrequencyPrediction = Boolean(
    item.estimationMode === 'purchase_frequency' &&
    item.estimatedEndDate &&
    item.purchaseFrequencyDays &&
    Number.isFinite(item.purchaseFrequencyDays) &&
    item.purchaseFrequencyDays > 0,
  );
  const estimatedEndDate =
    item.estimationMode === 'purchase_frequency'
      ? hasPurchaseFrequencyPrediction
        ? item.estimatedEndDate
        : undefined
      : (item.estimatedEndDate ?? calculateEstimatedEndDate(item));
  const normalized = {
    ...item,
    estimatedEndDate,
    purchaseFrequencyDays: hasPurchaseFrequencyPrediction ? item.purchaseFrequencyDays : undefined,
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
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const deletedItem = items.find((item) => item.id === id);
  const nextItems = items.filter((item) => item.id !== id);
  const nextHistory = deletedItem
    ? history.map((entry) =>
        entry.inventoryItemId === id ? withPurchaseHistorySnapshot(entry, deletedItem) : entry,
      )
    : history;
  cachedInventoryItems = nextItems;
  cachedPurchaseHistory = nextHistory;

  if (await syncActiveHouseholdInventoryAndHistory(nextItems, nextHistory)) return;

  await AsyncStorage.multiSet([
    [storageKeys.inventoryItems, JSON.stringify(nextItems)],
    [storageKeys.purchaseHistory, JSON.stringify(nextHistory)],
  ]);
}

export async function deleteInventoryItemsForCat(catId: string): Promise<void> {
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const nextItems = removeCatFromInventoryItems(items, catId);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const nextHistory = history.map((entry) => {
    const item = itemsById.get(entry.inventoryItemId);
    return item && getInventoryCatIds(item).includes(catId)
      ? withPurchaseHistorySnapshot(entry, item)
      : entry;
  });
  cachedInventoryItems = nextItems;
  cachedPurchaseHistory = nextHistory;
  if (await syncActiveHouseholdInventoryAndHistory(nextItems, nextHistory)) return;

  await AsyncStorage.setItem(storageKeys.inventoryItems, JSON.stringify(nextItems));
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify(nextHistory));
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
  const item = await getInventoryItem(entry.inventoryItemId);
  const normalized = item ? withPurchaseHistorySnapshot(entry, item) : entry;

  if (await upsertActiveHouseholdPurchaseHistory(normalized)) {
    cachedPurchaseHistory = [normalized, ...(cachedPurchaseHistory ?? [])];
    return;
  }

  const history = await getPurchaseHistory();
  const nextHistory = [normalized, ...history];
  cachedPurchaseHistory = nextHistory;
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify(nextHistory));
}

export async function updatePurchaseHistoryPrice(
  id: string,
  price?: number,
): Promise<PurchaseHistory[]> {
  const history = await getPurchaseHistory();
  const nextHistory = history.map((entry) => (entry.id === id ? { ...entry, price } : entry));
  const changedEntry = nextHistory.find((entry) => entry.id === id);
  if (changedEntry && (await upsertActiveHouseholdPurchaseHistory(changedEntry)))
    return nextHistory;

  cachedPurchaseHistory = nextHistory;
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify(nextHistory));
  return nextHistory;
}

export async function deletePurchaseHistory(id: string): Promise<PurchaseHistory[]> {
  const [history, items] = await Promise.all([getPurchaseHistory(), getInventoryItems()]);
  const deletedEntry = history.find((entry) => entry.id === id);
  const nextHistory = history.filter((entry) => entry.id !== id);
  cachedPurchaseHistory = nextHistory;

  const itemToRecalculate =
    deletedEntry?.recordType === 'replenishment'
      ? items.find(
          (item) =>
            item.id === deletedEntry.inventoryItemId &&
            item.estimationMode === 'purchase_frequency',
        )
      : undefined;
  if (itemToRecalculate) {
    const nextItem = rebuildPurchaseFrequencyPrediction(itemToRecalculate, nextHistory);
    const nextItems = items.map((item) => (item.id === nextItem.id ? nextItem : item));
    cachedInventoryItems = nextItems;

    const [itemSyncResult, historyDeleteResult] = await Promise.allSettled([
      upsertActiveHouseholdInventoryItem(nextItem),
      deleteActiveHouseholdPurchaseHistory(id),
    ]);
    const syncedItem = itemSyncResult.status === 'fulfilled' && itemSyncResult.value;
    const deletedRemoteHistory =
      historyDeleteResult.status === 'fulfilled' && historyDeleteResult.value;
    if (syncedItem && deletedRemoteHistory) {
      return nextHistory;
    }
    const usesLocalStorage =
      itemSyncResult.status === 'fulfilled' &&
      !itemSyncResult.value &&
      historyDeleteResult.status === 'fulfilled' &&
      !historyDeleteResult.value;
    if (!usesLocalStorage) {
      const reconciliation = await reconcilePurchaseFrequencyHistoryDeletion(
        id,
        itemToRecalculate.id,
      );
      if (reconciliation?.deletionPersisted) return reconciliation.history;

      const mutationError =
        itemSyncResult.status === 'rejected'
          ? itemSyncResult.reason
          : historyDeleteResult.status === 'rejected'
            ? historyDeleteResult.reason
            : undefined;
      throw mutationError instanceof Error
        ? mutationError
        : new Error('共有データを保存できませんでした。');
    }

    await AsyncStorage.multiSet([
      [storageKeys.inventoryItems, JSON.stringify(nextItems)],
      [storageKeys.purchaseHistory, JSON.stringify(nextHistory)],
    ]);
    return nextHistory;
  }

  if (await deleteActiveHouseholdPurchaseHistory(id)) return nextHistory;

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
  const replenishmentHistory = withPurchaseHistorySnapshot(
    {
      ...history,
      recordType: 'replenishment',
    },
    item,
  );
  const purchaseFrequencyPrediction =
    item.estimationMode === 'purchase_frequency'
      ? calculatePurchaseFrequencyPrediction(item.id, [...allHistory, replenishmentHistory])
      : undefined;
  const estimatedEndDate =
    item.estimationMode === 'purchase_frequency'
      ? purchaseFrequencyPrediction?.estimatedEndDate
      : calculateReplenishedEstimatedEndDate(item, replenishmentHistory, lastingDaysReplenishMode);
  const nextItem: InventoryItem = {
    ...item,
    amount: replenishmentHistory.amount,
    unit: replenishmentHistory.unit,
    purchaseDate: replenishmentHistory.purchasedAt,
    openedDate: resetOpenedDate ? replenishmentHistory.purchasedAt : item.openedDate,
    estimatedEndDate,
    purchaseFrequencyDays:
      item.estimationMode === 'purchase_frequency'
        ? purchaseFrequencyPrediction?.averageIntervalDays
        : undefined,
    updatedAt: nowIso(),
  };
  await saveInventoryItem(nextItem);
  await addPurchaseHistory(replenishmentHistory);
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

function upsertCachedInventoryItem(
  items: InventoryItem[] | undefined,
  item: InventoryItem,
): InventoryItem[] {
  if (!items) return [item];
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function withPurchaseHistorySnapshot(entry: PurchaseHistory, item: InventoryItem): PurchaseHistory {
  return {
    ...entry,
    itemName: entry.itemName ?? item.name,
    itemCategory: entry.itemCategory ?? item.category,
    catIds: entry.catIds ?? getInventoryCatIds(item),
  };
}

function rebuildPurchaseFrequencyPrediction(
  item: InventoryItem,
  history: PurchaseHistory[],
): InventoryItem {
  const prediction = calculatePurchaseFrequencyPrediction(item.id, history);
  return {
    ...item,
    estimatedEndDate: prediction?.estimatedEndDate,
    purchaseFrequencyDays: prediction?.averageIntervalDays,
    updatedAt: nowIso(),
  };
}

async function reconcilePurchaseFrequencyHistoryDeletion(
  deletedHistoryId: string,
  inventoryItemId: string,
): Promise<{ deletionPersisted: boolean; history: PurchaseHistory[] } | undefined> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (!snapshot) return undefined;

  const deletionPersisted = !snapshot.purchaseHistory.some(
    (entry) => entry.id === deletedHistoryId,
  );
  const remoteItem = snapshot.inventoryItems.find((item) => item.id === inventoryItemId);
  let nextItems = snapshot.inventoryItems;
  if (remoteItem?.estimationMode === 'purchase_frequency') {
    const reconciledItem = rebuildPurchaseFrequencyPrediction(remoteItem, snapshot.purchaseHistory);
    if (!(await upsertActiveHouseholdInventoryItem(reconciledItem))) return undefined;
    nextItems = snapshot.inventoryItems.map((item) =>
      item.id === reconciledItem.id ? reconciledItem : item,
    );
  }

  cachedInventoryItems = nextItems;
  cachedPurchaseHistory = snapshot.purchaseHistory;
  return { deletionPersisted, history: snapshot.purchaseHistory };
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
): string | undefined {
  const replenishedAt = parseISO(history.purchasedAt);
  const remainingDays = Math.max(0, calculateRemainingDays(item, replenishedAt) ?? 0);

  if (item.estimationMode === 'lasting_days' && item.lastingDays && item.lastingDays > 0) {
    const nextDays =
      lastingDaysReplenishMode === 'add_remaining'
        ? remainingDays + item.lastingDays
        : item.lastingDays;
    return format(addDays(replenishedAt, nextDays), 'yyyy-MM-dd');
  }

  if (
    (!item.estimationMode || item.estimationMode === 'usage') &&
    item.dailyUsage &&
    item.dailyUsage > 0
  ) {
    const addedDays = Math.ceil(history.amount / item.dailyUsage);
    return format(addDays(replenishedAt, remainingDays + addedDays), 'yyyy-MM-dd');
  }

  return undefined;
}
