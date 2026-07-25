import assert from 'node:assert/strict';
import test from 'node:test';

import { selectProductSearchQueries } from './querySelection.js';
import { ProductSearchQuery } from './types.js';

test('query offset is applied after enabled, pet group and priority sorting', () => {
  const selected = selectProductSearchQueries(
    [
      makeQuery('dog-low', 'dog', 80),
      makeQuery('rabbit-high', 'rabbit', 100),
      makeQuery('dog-high-b', 'dog', 100),
      makeQuery('dog-disabled', 'dog', 110, false),
      makeQuery('dog-high-a', 'dog', 100),
      makeQuery('dog-medium', 'dog', 90),
    ],
    {
      queryIds: new Set(),
      petGroup: 'dog',
      offsetQueries: 1,
      limitQueries: 2,
    },
  );

  assert.deepEqual(selected.map((query) => query.id), ['dog-high-b', 'dog-medium']);
});

test('query offset without a limit returns every remaining query', () => {
  const selected = selectProductSearchQueries(
    [makeQuery('query-c', 'dog', 80), makeQuery('query-a', 'dog', 100), makeQuery('query-b', 'dog', 90)],
    { queryIds: new Set(), offsetQueries: 1 },
  );

  assert.deepEqual(selected.map((query) => query.id), ['query-b', 'query-c']);
});

function makeQuery(id: string, petGroup: ProductSearchQuery['petGroup'], priority: number, enabled = true): ProductSearchQuery {
  return {
    id,
    petGroup,
    targetSpecies: petGroup,
    categoryId: 'category',
    subcategoryId: 'subcategory',
    keyword: id,
    negativeKeywords: ['exclude'],
    priority,
    enabled,
    maxPages: 3,
    locale: 'ja-JP',
    marketCode: 'JP',
    currencyCode: 'JPY',
  };
}
