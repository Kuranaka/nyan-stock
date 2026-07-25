import assert from 'node:assert/strict';
import test from 'node:test';

import { forEachWithConcurrency, forEachWithKeyedConcurrency } from './boundedConcurrency.js';

test('bounded concurrency processes every item without exceeding the limit', async () => {
  let active = 0;
  let peak = 0;
  const processed: number[] = [];

  await forEachWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    processed.push(item);
    active -= 1;
  });

  assert.equal(peak, 3);
  assert.deepEqual([...processed].sort((left, right) => left - right), [1, 2, 3, 4, 5, 6]);
});

test('bounded concurrency rejects invalid limits', async () => {
  await assert.rejects(() => forEachWithConcurrency([1], 0, async () => {}), /positive integer/);
});

test('keyed concurrency never overlaps items that share a conflict key', async () => {
  const activeKeys = new Set<string>();
  let peak = 0;
  let active = 0;
  const items = [
    { id: 1, keys: ['product-a'] },
    { id: 2, keys: ['product-a'] },
    { id: 3, keys: ['product-b'] },
    { id: 4, keys: ['product-c', 'jan-1'] },
    { id: 5, keys: ['product-d', 'jan-1'] },
  ];

  await forEachWithKeyedConcurrency(
    items,
    3,
    (item) => item.keys,
    async (item) => {
      assert.equal(item.keys.some((key) => activeKeys.has(key)), false);
      for (const key of item.keys) activeKeys.add(key);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      for (const key of item.keys) activeKeys.delete(key);
    },
  );

  assert.equal(peak, 3);
});
