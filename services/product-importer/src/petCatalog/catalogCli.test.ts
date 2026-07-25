import assert from 'node:assert/strict';
import test from 'node:test';

import { parseQuerySelectionOptions } from './catalogCli.js';

test('catalog pipeline commands share query filters and leave stage-specific options untouched', () => {
  const { selection, remaining } = parseQuerySelectionOptions([
    '--query-id=psq-dog-adult-food',
    '--pet-group=dog',
    '--offset=12',
    '--limit-queries=5',
    '--dry-run',
  ]);

  assert.deepEqual([...selection.queryIds], ['psq-dog-adult-food']);
  assert.equal(selection.petGroup, 'dog');
  assert.equal(selection.offsetQueries, 12);
  assert.equal(selection.limitQueries, 5);
  assert.deepEqual(remaining, ['--dry-run']);
});

test('catalog pipeline query offset rejects negative values', () => {
  assert.throws(() => parseQuerySelectionOptions(['--offset-queries=-1']), /non-negative integer/);
});
