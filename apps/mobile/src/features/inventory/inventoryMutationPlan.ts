import { getInventoryCatIds } from './inventoryLogic.ts';
import type { InventoryItem, PurchaseHistory } from './inventoryTypes';

export type InventoryMutationPlan = {
  nextItems: InventoryItem[];
  nextHistory: PurchaseHistory[];
  upsertInventoryItems: InventoryItem[];
  deleteInventoryItemIds: string[];
  upsertPurchaseHistory: PurchaseHistory[];
};

export function planInventoryItemDeletion(
  items: InventoryItem[],
  history: PurchaseHistory[],
  itemId: string,
): InventoryMutationPlan {
  const deletedItem = items.find((item) => item.id === itemId);
  const nextItems = items.filter((item) => item.id !== itemId);
  const nextHistory = deletedItem
    ? history.map((entry) =>
        entry.inventoryItemId === itemId
          ? withPurchaseHistorySnapshot(entry, deletedItem)
          : entry,
      )
    : history;

  return {
    nextItems,
    nextHistory,
    upsertInventoryItems: [],
    deleteInventoryItemIds: deletedItem ? [itemId] : [],
    upsertPurchaseHistory: changedEntries(history, nextHistory),
  };
}

export function planPetRemovalFromInventory(
  items: InventoryItem[],
  history: PurchaseHistory[],
  petId: string,
  updatedAt: string,
): InventoryMutationPlan {
  const nextItems = removePetFromInventoryItems(items, petId, updatedAt);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const nextHistory = history.map((entry) => {
    const item = itemsById.get(entry.inventoryItemId);
    return item && getInventoryCatIds(item).includes(petId)
      ? withPurchaseHistorySnapshot(entry, item)
      : entry;
  });
  const nextItemsById = new Map(nextItems.map((item) => [item.id, item]));
  const affectedItems = items.filter((item) => getInventoryCatIds(item).includes(petId));

  return {
    nextItems,
    nextHistory,
    upsertInventoryItems: affectedItems
      .map((item) => nextItemsById.get(item.id))
      .filter((item): item is InventoryItem => Boolean(item)),
    deleteInventoryItemIds: affectedItems
      .filter((item) => !nextItemsById.has(item.id))
      .map((item) => item.id),
    upsertPurchaseHistory: changedEntries(history, nextHistory),
  };
}

export function withPurchaseHistorySnapshot(
  entry: PurchaseHistory,
  item: InventoryItem,
): PurchaseHistory {
  return {
    ...entry,
    itemName: entry.itemName ?? item.name,
    itemCategory: entry.itemCategory ?? item.category,
    catIds: entry.catIds ?? getInventoryCatIds(item),
  };
}

function removePetFromInventoryItems(
  items: InventoryItem[],
  petId: string,
  updatedAt: string,
): InventoryItem[] {
  return items
    .map((item): InventoryItem | undefined => {
      const petIds = getInventoryCatIds(item).filter((currentPetId) => currentPetId !== petId);
      if (petIds.length === 0) return undefined;
      return {
        ...item,
        catId: petIds[0],
        sharedCatIds: petIds.length > 1 ? petIds.slice(1) : undefined,
        updatedAt,
      };
    })
    .filter((item): item is InventoryItem => Boolean(item));
}

function changedEntries<T>(before: T[], after: T[]): T[] {
  return after.filter((entry, index) => entry !== before[index]);
}
