import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEstimatedEndDate,
  calculateMonthlyCost,
  calculateRemainingDays,
  getInventoryCatIds,
  isPurchaseHistoryVisible,
  sortInventoryItems,
} from './inventoryLogic.ts';
import type { InventoryItem, PurchaseHistory } from './inventoryTypes.ts';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-1',
    catId: 'pet-1',
    name: 'フード',
    category: 'dry_food',
    amount: 300,
    unit: 'g',
    dailyUsage: 30,
    purchaseDate: '2026-08-01',
    notifyBeforeDays: [3],
    purchaseLinks: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

test('usage estimates use the opened date when one is recorded', () => {
  assert.equal(calculateEstimatedEndDate(item({ openedDate: '2026-08-05' })), '2026-08-15');
});

test('lasting-days estimates keep using the purchase date until opened-date input exists', () => {
  assert.equal(
    calculateEstimatedEndDate(
      item({ estimationMode: 'lasting_days', lastingDays: 30, dailyUsage: undefined }),
    ),
    '2026-08-31',
  );
});

test('remaining days are deterministic for an explicit today', () => {
  assert.equal(
    calculateRemainingDays(item({ estimatedEndDate: '2026-08-20' }), new Date(2026, 7, 8)),
    12,
  );
});

test('monthly cost uses the selected estimation cycle', () => {
  assert.equal(calculateMonthlyCost(item({ price: 900 })), 2_700);
  assert.equal(
    calculateMonthlyCost(
      item({
        estimationMode: 'purchase_frequency',
        purchaseFrequencyDays: 20,
        estimatedEndDate: '2026-08-21',
        price: 1_000,
      }),
    ),
    1_500,
  );
});

test('shared pet IDs are unique and history snapshots remain visible after item deletion', () => {
  assert.deepEqual(getInventoryCatIds(item({ sharedCatIds: ['pet-2', 'pet-1'] })), [
    'pet-1',
    'pet-2',
  ]);
  const history: PurchaseHistory = {
    id: 'history-1',
    inventoryItemId: 'deleted-item',
    catIds: ['pet-2'],
    purchasedAt: '2026-08-01',
    amount: 1,
    unit: 'bag',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  assert.equal(isPurchaseHistoryVisible(history, 'pet-2', new Set()), true);
});

test('sorting puts the soonest known depletion first and unknown items last', () => {
  const sorted = sortInventoryItems([
    item({ id: 'unknown', name: '不明', dailyUsage: undefined }),
    item({ id: 'later', name: '後', estimatedEndDate: '2026-08-20' }),
    item({ id: 'sooner', name: '先', estimatedEndDate: '2026-08-10' }),
  ]);
  assert.deepEqual(
    sorted.map((current) => current.id),
    ['sooner', 'later', 'unknown'],
  );
});
