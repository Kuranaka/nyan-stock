import { addDays, format, parseISO } from 'date-fns';

import {
  inventoryItemsStorageSchema,
  purchaseHistoryStorageSchema,
} from '@/features/persistence/storageSchemas';
import {
  readVersionedStorage,
  removeVersionedStorage,
  writeVersionedStorage,
  writeVersionedStorageBatch,
} from '@/features/persistence/versionedStorage';
import { storageKeys } from '@/features/storageKeys';
import {
  applyActiveHouseholdInventoryMutation,
  clearActiveHouseholdInventoryData,
  deleteActiveHouseholdPurchaseHistory,
  getActiveHouseholdSnapshot,
  upsertActiveHouseholdInventoryItem,
  upsertActiveHouseholdPurchaseHistory,
} from '@/features/sync/householdSyncService';
import { nowIso } from '@/utils/date';

import {
  calculateEstimatedEndDate,
  calculateRemainingDays,
} from './inventoryLogic';
import { calculatePurchaseFrequencyPrediction } from './purchaseFrequency';
import {
  planInventoryItemDeletion,
  planPetRemovalFromInventory,
  withPurchaseHistorySnapshot,
} from './inventoryMutationPlan';
import { InventoryItem, LastingDaysReplenishMode, PurchaseHistory } from './inventoryTypes';

let cachedInventoryItems: InventoryItem[] | undefined;
let cachedPurchaseHistory: PurchaseHistory[] | undefined;

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) {
    cachedInventoryItems = snapshot.inventoryItems;
    return snapshot.inventoryItems;
  }

  const items = await readVersionedStorage(storageKeys.inventoryItems, inventoryItemsStorageSchema);
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
  await writeVersionedStorage(storageKeys.inventoryItems, next, inventoryItemsStorageSchema);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const plan = planInventoryItemDeletion(items, history, id);

  await persistInventoryMutation(
    {
      deleteInventoryItemIds: plan.deleteInventoryItemIds,
      upsertPurchaseHistory: plan.upsertPurchaseHistory,
    },
    plan.nextItems,
    plan.nextHistory,
  );
}

export async function deleteInventoryItemsForCat(catId: string): Promise<void> {
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const plan = planPetRemovalFromInventory(items, history, catId, nowIso());

  await persistInventoryMutation(
    {
      upsertInventoryItems: plan.upsertInventoryItems,
      deleteInventoryItemIds: plan.deleteInventoryItemIds,
      upsertPurchaseHistory: plan.upsertPurchaseHistory,
    },
    plan.nextItems,
    plan.nextHistory,
  );
}

export async function getPurchaseHistory(): Promise<PurchaseHistory[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) {
    cachedPurchaseHistory = snapshot.purchaseHistory;
    return snapshot.purchaseHistory;
  }

  const history = await readVersionedStorage(
    storageKeys.purchaseHistory,
    purchaseHistoryStorageSchema,
  );
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
  await writeVersionedStorage(
    storageKeys.purchaseHistory,
    nextHistory,
    purchaseHistoryStorageSchema,
  );
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
  await writeVersionedStorage(
    storageKeys.purchaseHistory,
    nextHistory,
    purchaseHistoryStorageSchema,
  );
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
    await persistInventoryMutation(
      { upsertInventoryItems: [nextItem], deletePurchaseHistoryIds: [id] },
      nextItems,
      nextHistory,
    );
    return nextHistory;
  }

  if (await deleteActiveHouseholdPurchaseHistory(id)) return nextHistory;

  await writeVersionedStorage(
    storageKeys.purchaseHistory,
    nextHistory,
    purchaseHistoryStorageSchema,
  );
  return nextHistory;
}

export async function replenishInventoryItem(
  item: InventoryItem,
  history: PurchaseHistory,
  resetOpenedDate: boolean,
  lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
): Promise<InventoryItem> {
  const [allHistory, allItems] = await Promise.all([getPurchaseHistory(), getInventoryItems()]);
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
  const nextItems = allItems.some((current) => current.id === nextItem.id)
    ? allItems.map((current) => (current.id === nextItem.id ? nextItem : current))
    : [nextItem, ...allItems];
  const nextHistory = allHistory.some((entry) => entry.id === replenishmentHistory.id)
    ? allHistory.map((entry) =>
        entry.id === replenishmentHistory.id ? replenishmentHistory : entry,
      )
    : [replenishmentHistory, ...allHistory];
  await persistInventoryMutation(
    {
      upsertInventoryItems: [nextItem],
      upsertPurchaseHistory: [replenishmentHistory],
    },
    nextItems,
    nextHistory,
  );
  return nextItem;
}

export async function clearInventoryData(): Promise<void> {
  cachedInventoryItems = undefined;
  cachedPurchaseHistory = undefined;
  if (await clearActiveHouseholdInventoryData()) return;

  await Promise.all([
    removeVersionedStorage(storageKeys.inventoryItems),
    removeVersionedStorage(storageKeys.purchaseHistory),
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

async function persistInventoryMutation(
  mutation: Parameters<typeof applyActiveHouseholdInventoryMutation>[0],
  nextItems: InventoryItem[],
  nextHistory: PurchaseHistory[],
): Promise<void> {
  await applyActiveHouseholdInventoryMutation(mutation);
  cachedInventoryItems = nextItems;
  cachedPurchaseHistory = nextHistory;
  await writeVersionedStorageBatch([
    {
      key: storageKeys.inventoryItems,
      value: nextItems,
      schema: inventoryItemsStorageSchema,
    },
    {
      key: storageKeys.purchaseHistory,
      value: nextHistory,
      schema: purchaseHistoryStorageSchema,
    },
  ]);
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
