import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { loadProductSearchQueries, parseCsv } from './csv.js';
import { petGroupSeeds, petSpeciesGroupSeeds, petSpeciesSeeds } from './masterData.js';
import { runProductSearchQueryQualityChecks } from './quality.js';

const seedDirectory = path.resolve('data/seed');
const petMasterDirectory = path.join(seedDirectory, 'pet-master');

test('pet taxonomy seeds contain every required top-level group without rabbit duplication', async () => {
  assert.deepEqual(
    petGroupSeeds.map((item) => item.code),
    ['cat', 'dog', 'rabbit', 'small_animal', 'bird', 'aquarium', 'reptile_amphibian', 'insect'],
  );
  assert.ok(petSpeciesSeeds.some((item) => item.petGroup === 'rabbit' && item.code === 'rabbit'));
  assert.equal(petSpeciesSeeds.some((item) => item.petGroup === 'small_animal' && item.code === 'rabbit'), false);
  assert.deepEqual(
    petSpeciesGroupSeeds.filter((item) => item.petGroup === 'bird').map((item) => item.code),
    ['small_bird', 'medium_parrot', 'large_parrot'],
  );

  const csvGroups = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_groups_seed.csv'), 'utf8'));
  const csvSpecies = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_species_seed.csv'), 'utf8'));
  assert.deepEqual(csvGroups.map((row) => row.code), petGroupSeeds.map((item) => item.code));
  assert.equal(csvSpecies.some((row) => row.pet_group === 'small_animal' && row.code === 'rabbit'), false);
});

test('search query master is species-oriented and references existing category pairs', async () => {
  const queries = await loadProductSearchQueries(path.join(petMasterDirectory, 'product_search_queries.csv'));
  const petSubcategories = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_subcategories_seed.csv'), 'utf8'));
  const catSubcategories = parseCsv(await readFile(path.join(seedDirectory, 'cat_subcategories_seed.csv'), 'utf8'));
  const categoryPairs = new Set([
    ...petSubcategories.map((row) => `${row.category_id}|${row.subcategory_id}`),
    ...catSubcategories.map((row) => `${row.category_id}|${row.subcategory_id}`),
  ]);

  assert.ok(queries.length >= 260);
  assert.ok(queries.every((query) => query.locale === 'ja-JP'));
  assert.ok(queries.every((query) => query.marketCode === 'JP'));
  assert.ok(queries.every((query) => query.currencyCode === 'JPY'));
  assert.equal(new Set(queries.map((query) => query.id)).size, queries.length);
  assert.ok(queries.some((query) => query.petGroup === 'rabbit' && query.keyword === 'うさぎ ペレット'));
  assert.ok(queries.some((query) => query.targetSpecies === 'hamster' && query.keyword === 'ハムスター 床材'));
  assert.ok(queries.some((query) => query.targetSpecies === 'guinea_pig' && query.keyword === 'モルモット ビタミンC'));
  assert.ok(queries.some((query) => query.targetSpecies === 'ferret' && query.keyword === 'フェレット フード'));
  assert.ok(queries.some((query) => query.petGroup === 'small_animal' && !query.targetSpecies && query.priority < 50));
  assert.deepEqual(
    queries.filter((query) => !categoryPairs.has(`${query.categoryId}|${query.subcategoryId}`)).map((query) => query.id),
    [],
  );
  assert.deepEqual(runProductSearchQueryQualityChecks(queries, categoryPairs), []);

  const enabled = queries.filter((query) => query.enabled);
  assert.deepEqual(
    ['psq-tortoise-herbivore-food', 'psq-frog-carnivore-food'].filter(
      (id) => queries.find((query) => query.id === id)?.enabled !== false,
    ),
    [],
  );
  assert.equal(queries.find((query) => query.id === 'psq-tortoise-food')?.maxPages, 6);
  assert.equal(queries.find((query) => query.id === 'psq-frog-food')?.maxPages, 6);
  assertCategoryCoverage(enabled, 'dog', [
    'dog_food', 'semi_moist_food', 'therapeutic_food', 'dental_care', 'supplement',
    'milk', 'pet_sheets', 'diapers', 'deodorizer', 'shampoo', 'conditioner', 'ear_care', 'eye_care',
    'paw_care', 'flea_tick_care', 'wet_tissues', 'waste_bags', 'toilet',
  ]);
  assertKeywords(enabled, 'dog', [
    /ドライフード/, /ウェットフード/, /子犬用/, /成犬用/, /シニア用/, /犬種別/,
    /小型犬用/, /中型犬用/, /大型犬用/, /おやつ/, /マナーウェア/, /おむつ/, /歯磨き/,
  ]);

  assertCategoryCoverage(enabled, 'rabbit', [
    'main_pellet', 'timothy', 'alfalfa', 'supplementary_food', 'supplement', 'hairball_care',
    'chew_toy', 'toilet_litter', 'toilet_sheets', 'bedding', 'deodorizer', 'grooming',
    'shampoo_towel', 'water_replacement',
  ]);
  assertKeywords(enabled, 'rabbit', [/主食用/, /牧草/, /おやつ/, /毛球ケア/, /給水器/]);

  assertCategoryCoverage(enabled, 'small_animal', [
    'small_mammal_food', 'pellet', 'mixed_food', 'timothy', 'treat', 'milk', 'supplement',
    'chew_toy', 'bedding', 'nesting_material', 'toilet_litter', 'bathing_sand', 'deodorizer',
    'hairball_care', 'dental_care', 'grooming',
  ]);
  assert.deepEqual(
    enabled.filter((query) => query.petGroup === 'small_animal' && !query.targetSpecies).map((query) => query.id),
    [],
  );

  assertCategoryCoverage(enabled, 'bird', [
    'seed', 'bird_food', 'mixed_food', 'formula', 'chick_food', 'supplement', 'calcium', 'grit',
    'cuttlebone', 'mineral', 'bedding', 'sand', 'deodorizer', 'bath',
  ]);
  assertKeywords(enabled, 'bird', [/シード/, /ペレット/, /混合フード/, /フォーミュラ/, /雛/, /ボレー粉/, /敷紙/, /水浴び/]);
  assert.deepEqual(
    enabled
      .filter((query) => query.petGroup === 'bird' && !query.targetSpecies && !query.targetSpeciesGroup)
      .map((query) => query.id),
    [],
  );

  const pairedAquariumCategories = [
    'flake_food', 'granule_food', 'tablet_food', 'frozen_food', 'dried_food', 'live_food',
    'water_conditioner', 'dechlorinator', 'bacteria', 'algae_control', 'fish_medicine',
    'aquarium_salt', 'filter_media', 'activated_carbon', 'wool_mat', 'water_test', 'substrate', 'gravel',
  ];
  for (const categoryId of pairedAquariumCategories) {
    const categoryQueries = enabled.filter((query) => query.petGroup === 'aquarium' && query.categoryId === categoryId);
    assert.ok(categoryQueries.some((query) => query.targetSpecies === 'freshwater_fish'), `${categoryId}: freshwater missing`);
    assert.ok(categoryQueries.some((query) => query.targetSpecies === 'marine_fish'), `${categoryId}: marine missing`);
  }
  assertCategoryCoverage(enabled, 'aquarium', [
    ...pairedAquariumCategories, 'fry_food', 'fish_supplies', 'betta_food',
    'marine_food', 'shrimp_food', 'soil', 'plant_fertilizer', 'co2_consumable',
  ]);
  assertKeywords(enabled, 'aquarium', [/稚魚用/, /金魚/, /メダカ/, /ベタ/, /海水魚/, /エビ用/]);

  assertCategoryCoverage(enabled, 'reptile_amphibian', [
    'reptile_amphibian_supplies', 'pellet', 'frozen_food', 'dried_food', 'live_food', 'insect_food',
    'calcium', 'vitamin', 'supplement', 'water_conditioner', 'soil', 'coconut_substrate', 'sand',
    'deodorizer', 'shedding_care', 'reptile_jelly', 'uv_lighting', 'heat_lamp', 'filter_media',
  ]);
  assert.deepEqual(
    enabled.filter((query) => query.petGroup === 'reptile_amphibian' && !query.targetSpecies).map((query) => query.id),
    [],
  );
  assert.deepEqual(
    enabled
      .filter((query) => query.petGroup === 'reptile_amphibian' && /フード|飼料|ペレット|冷凍餌|乾燥餌|活餌/.test(query.keyword))
      .filter((query) => !/草食|肉食|雑食|昆虫食/.test(query.keyword))
      .map((query) => query.id),
    [],
  );

  assertCategoryCoverage(enabled, 'insect', [
    'insect_supplies', 'adult_mat', 'fermented_mat', 'kinshi_bottle', 'spawning_wood', 'burial_mat',
    'case_bedding', 'leaf_mold', 'insect_honey', 'cricket_food', 'bell_cricket_food', 'calcium',
    'hydration', 'humidity', 'deodorizer',
  ]);
  assert.deepEqual(enabled.filter((query) => query.petGroup === 'insect' && !query.targetSpecies).map((query) => query.id), []);
});

test('CSV parser preserves quoted commas in raw master values', () => {
  assert.deepEqual(parseCsv('id,note\n1,"a,b"\n'), [{ id: '1', note: 'a,b' }]);
});

function assertCategoryCoverage(
  queries: Awaited<ReturnType<typeof loadProductSearchQueries>>,
  petGroup: Awaited<ReturnType<typeof loadProductSearchQueries>>[number]['petGroup'],
  categoryIds: string[],
): void {
  const present = new Set(queries.filter((query) => query.petGroup === petGroup).map((query) => query.categoryId));
  assert.deepEqual(categoryIds.filter((categoryId) => !present.has(categoryId)), []);
}

function assertKeywords(
  queries: Awaited<ReturnType<typeof loadProductSearchQueries>>,
  petGroup: Awaited<ReturnType<typeof loadProductSearchQueries>>[number]['petGroup'],
  patterns: RegExp[],
): void {
  const keywords = queries.filter((query) => query.petGroup === petGroup).map((query) => query.keyword);
  assert.deepEqual(patterns.filter((pattern) => !keywords.some((keyword) => pattern.test(keyword))).map(String), []);
}
