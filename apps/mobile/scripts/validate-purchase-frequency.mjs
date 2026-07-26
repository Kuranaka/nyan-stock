import assert from 'node:assert/strict';

import { calculatePurchaseFrequencyPrediction } from '../src/features/inventory/purchaseFrequency.ts';

const itemId = 'item-1';

function history(id, purchasedAt, recordType = 'replenishment', inventoryItemId = itemId) {
  return {
    id,
    inventoryItemId,
    recordType,
    purchasedAt,
    amount: 0,
    unit: 'piece',
    createdAt: `${purchasedAt}T00:00:00.000Z`,
  };
}

assert.equal(
  calculatePurchaseFrequencyPrediction(itemId, [history('first', '2026-01-11')]),
  undefined,
  'a single replenishment must remain in learning state',
);

assert.deepEqual(
  calculatePurchaseFrequencyPrediction(itemId, [
    history('first', '2026-01-11'),
    history('second', '2026-01-31'),
  ]),
  { averageIntervalDays: 20, estimatedEndDate: '2026-02-20' },
  'prediction must start from the interval between the first two replenishments',
);

assert.deepEqual(
  calculatePurchaseFrequencyPrediction(itemId, [
    history('third', '2026-02-15'),
    history('first', '2026-01-11'),
    history('second', '2026-01-31'),
  ]),
  { averageIntervalDays: 18, estimatedEndDate: '2026-03-05' },
  'later replenishments must update the rounded average interval regardless of input order',
);

assert.equal(
  calculatePurchaseFrequencyPrediction(itemId, [
    history('manual', '2025-01-01', 'manual'),
    { ...history('legacy', '2025-06-01'), recordType: undefined },
    history('other-item', '2026-01-01', 'replenishment', 'item-2'),
    history('first', '2026-01-11'),
  ]),
  undefined,
  'manual, legacy, and other-item history must not count as replenishments',
);

assert.equal(
  calculatePurchaseFrequencyPrediction(itemId, [
    history('invalid', 'not-a-date'),
    history('same-day-1', '2026-01-11'),
    history('same-day-2', '2026-01-11'),
  ]),
  undefined,
  'invalid and duplicate dates must not create an interval',
);

const historyAfterDeletingSecondReplenishment = [
  history('first', '2026-01-11'),
  history('second', '2026-01-31'),
].filter((entry) => entry.id !== 'second');
assert.equal(
  calculatePurchaseFrequencyPrediction(itemId, historyAfterDeletingSecondReplenishment),
  undefined,
  'deleting down to one replenishment must return the item to learning state',
);

const historyAfterDeletingMiddleReplenishment = [
  history('first', '2026-01-11'),
  history('second', '2026-01-31'),
  history('third', '2026-02-15'),
].filter((entry) => entry.id !== 'second');
assert.deepEqual(
  calculatePurchaseFrequencyPrediction(itemId, historyAfterDeletingMiddleReplenishment),
  { averageIntervalDays: 35, estimatedEndDate: '2026-03-22' },
  'deleting a replenishment must rebuild the average and date from the remaining records',
);

console.log('ok - purchase frequency starts at two replenishments and rebuilds after deletion');
