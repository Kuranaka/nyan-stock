import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAllKeysetPages } from './keysetPagination.ts';

test('loads every row across the configured Supabase 1,000-row boundary', async () => {
  const source = Array.from({ length: 1_205 }, (_, index) => ({
    id: `row-${String(index).padStart(4, '0')}`,
  }));
  const cursors: (string | undefined)[] = [];

  const rows = await loadAllKeysetPages(async (afterId, limit) => {
    cursors.push(afterId);
    const start = afterId ? source.findIndex((row) => row.id === afterId) + 1 : 0;
    return source.slice(start, start + limit);
  }, 500);

  assert.deepEqual(rows, source);
  assert.deepEqual(cursors, [undefined, 'row-0499', 'row-0999']);
});

test('rejects a full page whose cursor does not advance', async () => {
  await assert.rejects(
    loadAllKeysetPages(async () => [{ id: 'same' }], 1),
    /did not advance/,
  );
});
