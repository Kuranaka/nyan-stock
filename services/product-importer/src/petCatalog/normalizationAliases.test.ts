import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { normalizeRetailerListing } from './normalizeListing.js';
import { findNormalizationAliases, loadNormalizationAliases } from './normalizationAliases.js';
import { parseCsv } from './csv.js';
import { petSpeciesSeeds } from './masterData.js';
import { ProductSearchQuery, StoredRetailerListing } from './types.js';

const aliasFile = path.resolve('data/seed/pet-master/normalization_aliases_seed.csv');

test('normalization alias master contains species, brand and series aliases', async () => {
  const aliases = await loadNormalizationAliases(aliasFile);
  assert.equal(new Set(aliases.map((item) => item.id)).size, aliases.length);
  assert.ok(aliases.some((item) => item.aliasType === 'species' && item.canonicalValue === 'budgerigar'));
  assert.ok(aliases.some((item) => item.aliasType === 'brand' && item.canonicalValue === 'brand-テトラ'));
  assert.ok(aliases.some((item) => item.aliasType === 'series' && item.canonicalValue === 'reptomin'));
});

test('alias canonical values reference existing species and brands', async () => {
  const aliases = await loadNormalizationAliases(aliasFile);
  const brandRows = parseCsv(await readFile(path.resolve('data/seed/pet-master/pet_brands_seed.csv'), 'utf8'));
  const brandIds = new Set(brandRows.map((row) => row.brand_id));
  const speciesKeys = new Set(petSpeciesSeeds.map((row) => `${row.petGroup}|${row.code}`));

  assert.deepEqual(
    aliases
      .filter((item) => item.aliasType === 'brand' && !brandIds.has(item.canonicalValue))
      .map((item) => item.id),
    [],
  );
  assert.deepEqual(
    aliases
      .filter((item) => item.aliasType === 'series' && item.contextValue && !brandIds.has(item.contextValue))
      .map((item) => item.id),
    [],
  );
  assert.deepEqual(
    aliases
      .filter((item) => item.aliasType === 'species')
      .filter((item) => !item.contextValue || !speciesKeys.has(`${item.contextValue}|${item.canonicalValue}`))
      .map((item) => item.id),
    [],
  );
});

test('English species aliases and brand aliases participate in normalization', async () => {
  const aliases = await loadNormalizationAliases(aliasFile);
  const query = makeQuery('bird', 'bird_food', 'bird_pellet');
  const listing = makeListing('ROYAL CANIN Budgie Food', query);
  const candidate = normalizeRetailerListing(listing, query, aliases);

  assert.equal(candidate.brand, 'ロイヤルカナン ジャポン');
  assert.deepEqual(candidate.targetSpecies, ['budgerigar']);
  assert.equal(candidate.petGroup, 'bird');
});

test('series aliases honor their brand context', async () => {
  const aliases = await loadNormalizationAliases(aliasFile);
  const tetra = findNormalizationAliases(aliases, 'series', 'TETRA ReptoMin 100g', 'en', 'brand-テトラ');
  const otherBrand = findNormalizationAliases(aliases, 'series', 'TETRA ReptoMin 100g', 'en', 'brand-gex');

  assert.equal(tetra[0]?.canonicalValue, 'reptomin');
  assert.equal(otherBrand.length, 0);
});

function makeQuery(petGroup: ProductSearchQuery['petGroup'], categoryId: string, subcategoryId: string): ProductSearchQuery {
  return {
    id: 'query-alias-test',
    petGroup,
    categoryId,
    subcategoryId,
    keyword: 'test',
    negativeKeywords: [],
    priority: 100,
    enabled: true,
    maxPages: 1,
    locale: 'ja-JP',
    marketCode: 'JP',
    currencyCode: 'JPY',
  };
}

function makeListing(rawTitle: string, query: ProductSearchQuery): StoredRetailerListing {
  return {
    id: 'raw-alias-test',
    source: 'rakuten_product_navi',
    sourceItemId: 'alias-test',
    searchQueryId: query.id,
    searchPetGroup: query.petGroup,
    contentLocale: 'ja-JP',
    marketCode: 'JP',
    currencyCode: 'JPY',
    rawTitle,
    fetchedAt: '2026-07-20T00:00:00.000Z',
    rawJson: {},
  };
}
