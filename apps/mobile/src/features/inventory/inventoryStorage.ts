import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';
import { nowIso } from '@/utils/date';

import { calculateEstimatedEndDate } from './inventoryLogic';
import { InventoryItem, PurchaseHistory } from './inventoryTypes';

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const raw = await AsyncStorage.getItem(storageKeys.inventoryItems);
  return raw ? (JSON.parse(raw) as InventoryItem[]) : [];
}

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  const items = await getInventoryItems();
  return items.find((item) => item.id === id);
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  const items = await getInventoryItems();
  const normalized = {
    ...item,
    estimatedEndDate: calculateEstimatedEndDate(item),
    updatedAt: nowIso(),
  };
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? normalized : current))
    : [normalized, ...items];
  await AsyncStorage.setItem(storageKeys.inventoryItems, JSON.stringify(next));
}

export async function deleteInventoryItem(id: string): Promise<void> {
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
  const [items, history] = await Promise.all([getInventoryItems(), getPurchaseHistory()]);
  const deletedItemIds = new Set(items.filter((item) => item.catId === catId).map((item) => item.id));
  await AsyncStorage.setItem(
    storageKeys.inventoryItems,
    JSON.stringify(items.filter((item) => item.catId !== catId)),
  );
  await AsyncStorage.setItem(
    storageKeys.purchaseHistory,
    JSON.stringify(history.filter((entry) => !deletedItemIds.has(entry.inventoryItemId))),
  );
}

export async function getPurchaseHistory(): Promise<PurchaseHistory[]> {
  const raw = await AsyncStorage.getItem(storageKeys.purchaseHistory);
  return raw ? (JSON.parse(raw) as PurchaseHistory[]) : [];
}

export async function addPurchaseHistory(entry: PurchaseHistory): Promise<void> {
  const history = await getPurchaseHistory();
  await AsyncStorage.setItem(storageKeys.purchaseHistory, JSON.stringify([entry, ...history]));
}

export async function replenishInventoryItem(
  item: InventoryItem,
  history: PurchaseHistory,
  resetOpenedDate: boolean,
): Promise<InventoryItem> {
  const nextItem: InventoryItem = {
    ...item,
    amount: history.amount,
    unit: history.unit,
    purchaseDate: history.purchasedAt,
    openedDate: resetOpenedDate ? history.purchasedAt : item.openedDate,
    updatedAt: nowIso(),
  };
  nextItem.estimatedEndDate = calculateEstimatedEndDate(nextItem);
  await saveInventoryItem(nextItem);
  await addPurchaseHistory(history);
  return nextItem;
}

export async function clearInventoryData(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(storageKeys.inventoryItems),
    AsyncStorage.removeItem(storageKeys.purchaseHistory),
  ]);
}
