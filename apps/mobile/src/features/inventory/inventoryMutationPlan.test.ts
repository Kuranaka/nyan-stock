import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planInventoryItemDeletion,
  planPetRemovalFromInventory,
} from './inventoryMutationPlan.ts';
import type { InventoryItem, PurchaseHistory } from './inventoryTypes.ts';

function item(id: string, catId = 'pet-1', sharedCatIds?: string[]): InventoryItem {
  return {
    id,
    catId,
    sharedCatIds,
    name: id,
    category: 'other',
    amount: 1,
    unit: 'piece',
    purchaseDate: '2026-08-01',
    notifyBeforeDays: [],
    purchaseLinks: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function history(inventoryItemId: string): PurchaseHistory {
  return {
    id: `history-${inventoryItemId}`,
    inventoryItemId,
    purchasedAt: '2026-08-01',
    amount: 1,
    unit: 'piece',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

test('item deletion targets only the selected item and snapshots its history', () => {
  const plan = planInventoryItemDeletion(
    [item('delete-me'), item('other-device-item')],
    [history('delete-me'), history('other-device-item')],
    'delete-me',
  );

  assert.deepEqual(plan.deleteInventoryItemIds, ['delete-me']);
  assert.deepEqual(
    plan.nextItems.map((current) => current.id),
    ['other-device-item'],
  );
  assert.equal(plan.upsertPurchaseHistory[0]?.itemName, 'delete-me');
  assert.equal(plan.upsertPurchaseHistory.some((entry) => entry.inventoryItemId === 'other-device-item'), false);
});

test('pet deletion updates shared items and deletes only items owned solely by that pet', () => {
  const plan = planPetRemovalFromInventory(
    [item('only-pet'), item('shared', 'pet-1', ['pet-2']), item('unrelated', 'pet-3')],
    [],
    'pet-1',
    '2026-08-08T00:00:00.000Z',
  );

  assert.deepEqual(plan.deleteInventoryItemIds, ['only-pet']);
  assert.deepEqual(plan.upsertInventoryItems.map((current) => current.id), ['shared']);
  assert.equal(plan.upsertInventoryItems[0]?.catId, 'pet-2');
  assert.equal(plan.nextItems.find((current) => current.id === 'unrelated')?.catId, 'pet-3');
});
