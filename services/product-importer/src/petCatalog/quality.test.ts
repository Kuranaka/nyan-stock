import assert from 'node:assert/strict';
import test from 'node:test';

import { runPetCatalogQualityChecks, runProductSearchQueryQualityChecks } from './quality.js';
import { CatalogQualitySnapshot, ProductSearchQuery } from './types.js';

test('quality checks catch unsafe taxonomy, merge and review states', () => {
  const snapshot: CatalogQualitySnapshot = {
    listings: [
      { id: 'raw-1', raw_title: '小動物用 フード 送料無料' },
      { id: 'raw-orphan', raw_title: 'orphan' },
    ],
    candidates: [
      {
        id: 'candidate-1',
        raw_listing_id: 'raw-1',
        target_species: ['rabbit'],
        confidence: 0.6,
        habitat_type: 'freshwater',
        classification_evidence: { searchContext: { targetSpecies: 'rabbit' }, petGroup: [], targetSpecies: [] },
      },
    ],
    products: [
      {
        id: 'product-1',
        canonical_key: 'duplicate',
        pet_group: 'small_animal',
        target_species: ['rabbit', 'ferret', 'guinea_pig', 'hamster'],
        target_scope: 'group_wide',
        purpose: 'food',
        base_product_name: '小動物用 フード 1kg 送料無料',
        habitat_type: 'marine',
      },
      {
        id: 'product-2',
        canonical_key: 'duplicate',
        pet_group: 'small_animal',
        target_species: ['hamster'],
        base_product_name: 'フード',
      },
    ],
    variants: [],
    identityKeys: [],
    productListings: [
      { product_id: 'product-1', raw_listing_id: 'raw-1', candidate_id: 'candidate-1' },
    ],
    reviewQueue: [],
  };
  const findings = runPetCatalogQualityChecks(snapshot);
  const byCheck = new Map(findings.map((finding) => [finding.check, finding.ids]));

  assert.deepEqual(byCheck.get('rabbit_classified_as_small_animal'), ['product-1']);
  assert.ok((byCheck.get('ferret_food_merged_with_herbivore') ?? []).includes('product-1'));
  assert.ok((byCheck.get('guinea_pig_food_merged_with_hamster') ?? []).includes('product-1'));
  assert.ok((byCheck.get('capacity_in_product_name') ?? []).includes('product-1'));
  assert.ok((byCheck.get('sales_copy_in_product_name') ?? []).includes('product-1'));
  assert.ok((byCheck.get('low_confidence_without_review') ?? []).includes('candidate-1'));
  assert.ok((byCheck.get('search_query_only_classification') ?? []).includes('candidate-1'));
  assert.ok((byCheck.get('raw_candidate_reference_missing') ?? []).includes('raw-orphan'));
  assert.equal((byCheck.get('canonical_key_duplicate') ?? []).length, 2);
  assert.ok((byCheck.get('freshwater_marine_merged') ?? []).includes('product-1'));
});

test('retained rejected products are ignored by active food classification checks', () => {
  const findings = runPetCatalogQualityChecks({
    listings: [],
    candidates: [],
    products: [{
      id: 'product-rejected-cross-species',
      pet_group: 'small_animal',
      target_species: ['ferret', 'guinea_pig', 'hamster'],
      target_scope: 'multi_species',
      category_id: 'small_animal_food',
      subcategory_id: 'small_animal_pellet',
      base_product_name: '小動物フード',
      status: 'rejected',
    }],
    variants: [],
    identityKeys: [],
    productListings: [],
    reviewQueue: [],
  });

  assert.equal(findings.some((finding) =>
    ['ferret_food_merged_with_herbivore', 'guinea_pig_food_merged_with_hamster'].includes(finding.check) &&
    finding.ids.includes('product-rejected-cross-species')),
  false);
});

test('model labels such as 7in1 LM-3 are not treated as capacity', () => {
  const findings = runPetCatalogQualityChecks({
    listings: [], candidates: [], variants: [], identityKeys: [], productListings: [], reviewQueue: [],
    products: [{
      id: 'product-model-label',
      normalized_name: 'ペットバリカン 吸引式 7in1 LM-3',
      base_product_name: 'ペットバリカン 吸引式 7in1 LM-3',
      pet_group: 'cat', target_species: ['cat'], target_scope: 'species_specific', status: 'draft',
    }],
  });

  assert.equal(findings.some((finding) =>
    finding.check === 'capacity_in_product_name' && finding.ids.includes('product-model-label')),
  false);
});

test('quality checks enforce issue disposition and candidate status consistency', () => {
  const snapshot: CatalogQualitySnapshot = {
    listings: [
      { id: 'raw-blocking' },
      { id: 'raw-reject' },
      { id: 'raw-non-blocking' },
    ],
    candidates: [
      { id: 'candidate-blocking', raw_listing_id: 'raw-blocking', status: 'merge_ready', confidence: 1 },
      { id: 'candidate-reject', raw_listing_id: 'raw-reject', status: 'review_required', confidence: 1 },
      { id: 'candidate-non-blocking', raw_listing_id: 'raw-non-blocking', status: 'merge_ready', confidence: 1 },
    ],
    products: [],
    variants: [],
    identityKeys: [],
    productListings: [],
    reviewQueue: [
      { candidate_id: 'candidate-blocking', issue_type: 'target_species_unknown', disposition: 'blocking', status: 'open' },
      { candidate_id: 'candidate-reject', issue_type: 'possible_wrong_search_result', disposition: 'reject', status: 'rejected' },
      { candidate_id: 'candidate-non-blocking', issue_type: 'package_data_suspicious', disposition: 'non_blocking', status: 'open' },
    ],
  };
  const byCheck = new Map(runPetCatalogQualityChecks(snapshot).map((finding) => [finding.check, finding.ids]));

  assert.deepEqual(byCheck.get('merge_ready_with_open_blocking_issue'), ['candidate-blocking']);
  assert.deepEqual(byCheck.get('reject_issue_candidate_not_rejected'), ['candidate-reject']);
  assert.deepEqual(byCheck.get('non_blocking_issue_left_open'), ['candidate-non-blocking:package_data_suspicious']);
});

test('quality checks enforce product variant and identity references', () => {
  const snapshot: CatalogQualitySnapshot = {
    listings: [{ id: 'raw-variant' }],
    candidates: [{ id: 'candidate-variant', raw_listing_id: 'raw-variant', confidence: 1 }],
    products: [{ id: 'product-variant', canonical_key: 'variant-product' }],
    variants: [{ id: 'variant-1', product_id: 'product-variant', jan_code: '4901234567894' }],
    identityKeys: [
      { variant_id: 'variant-1', key_type: 'jan', namespace: '', normalized_value: '4901234567894' },
      { variant_id: 'variant-1', key_type: 'jan', namespace: '', normalized_value: '4901234567895' },
    ],
    productListings: [
      { product_id: 'product-variant', raw_listing_id: 'raw-variant', candidate_id: 'candidate-variant' },
    ],
    reviewQueue: [],
  };
  const byCheck = new Map(runPetCatalogQualityChecks(snapshot).map((finding) => [finding.check, finding.ids]));

  assert.deepEqual(byCheck.get('product_listing_variant_reference_missing'), ['product-variant:raw-variant']);
  assert.equal(byCheck.has('jan_variant_identity_missing'), false);
  assert.deepEqual(byCheck.get('variant_multiple_jan_identities'), ['variant-1']);
});

test('strong variant identities keep classification disagreements visible without rejecting the merge', () => {
  const snapshot: CatalogQualitySnapshot = {
    listings: [{ id: 'raw-strong-identity' }],
    candidates: [
      {
        id: 'candidate-strong-identity',
        raw_listing_id: 'raw-strong-identity',
        target_species: ['hamster'],
        confidence: 1,
      },
    ],
    products: [
      {
        id: 'product-strong-identity',
        canonical_key: 'strong-identity-product',
        pet_group: 'small_animal',
        target_species: ['syrian_hamster'],
      },
    ],
    variants: [{ id: 'variant-strong-identity', product_id: 'product-strong-identity' }],
    identityKeys: [
      { variant_id: 'variant-strong-identity', key_type: 'jan', namespace: '', normalized_value: '4901234567894' },
    ],
    productListings: [
      {
        product_id: 'product-strong-identity',
        variant_id: 'variant-strong-identity',
        raw_listing_id: 'raw-strong-identity',
        candidate_id: 'candidate-strong-identity',
      },
    ],
    reviewQueue: [],
  };
  const byCheck = new Map(runPetCatalogQualityChecks(snapshot).map((finding) => [finding.check, finding]));

  assert.equal(byCheck.has('species_specific_products_merged'), false);
  assert.equal(byCheck.get('strong_identity_classification_disagreement')?.severity, 'warning');
  assert.equal(byCheck.get('strong_identity_classification_disagreement')?.ids.length, 1);
});

test('repeated model numbers at a field boundary are not treated as capacity', () => {
  const snapshot: CatalogQualitySnapshot = {
    listings: [],
    candidates: [],
    products: [
      {
        id: 'product-model-number',
        canonical_key: 'model-number-product',
        normalized_name: 'L8020 猫用デンタルケア L8020',
        base_product_name: 'L8020 猫用デンタルケア L8020',
      },
    ],
    variants: [],
    identityKeys: [],
    productListings: [],
    reviewQueue: [],
  };

  const checks = runPetCatalogQualityChecks(snapshot).map((finding) => finding.check);
  assert.equal(checks.includes('capacity_in_product_name'), false);
});

test('search query quality checks catch shallow, ambiguous, duplicate and unsafe queries', () => {
  const queries: ProductSearchQuery[] = [
    makeQuery({ id: 'query-1', maxPages: 2, negativeKeywords: [], targetSpecies: undefined }),
    makeQuery({ id: 'query-2', keyword: '淡水魚 フード', negativeKeywords: ['淡水魚'] }),
    makeQuery({ id: 'query-3', keyword: '淡水魚 フード' }),
    makeQuery({
      id: 'query-4',
      petGroup: 'reptile_amphibian',
      targetSpecies: 'gecko',
      categoryId: 'reptile_food',
      subcategoryId: 'reptile_food',
      keyword: 'ヤモリ フード',
    }),
  ];
  const findings = runProductSearchQueryQualityChecks(
    queries,
    new Set(['fish_food|fish_food', 'reptile_food|reptile_food']),
  );
  const byCheck = new Map(findings.map((finding) => [finding.check, finding.ids]));

  assert.deepEqual(byCheck.get('search_query_max_pages_too_low'), ['query-1']);
  assert.deepEqual(byCheck.get('enabled_search_query_target_missing'), ['query-1']);
  assert.deepEqual(byCheck.get('enabled_search_query_negative_keywords_missing'), ['query-1']);
  assert.deepEqual(byCheck.get('search_query_negative_keyword_conflict'), ['query-2']);
  assert.deepEqual(byCheck.get('duplicate_enabled_search_query'), ['query-2', 'query-3']);
  assert.deepEqual(byCheck.get('reptile_food_query_diet_missing'), ['query-4']);
});

function makeQuery(overrides: Partial<ProductSearchQuery>): ProductSearchQuery {
  return {
    id: 'query',
    petGroup: 'aquarium',
    targetSpecies: 'freshwater_fish',
    categoryId: 'fish_food',
    subcategoryId: 'fish_food',
    keyword: '淡水魚 フード',
    negativeKeywords: ['海水魚'],
    priority: 70,
    enabled: true,
    maxPages: 3,
    ...overrides,
    locale: overrides.locale ?? 'ja-JP',
    marketCode: overrides.marketCode ?? 'JP',
    currencyCode: overrides.currencyCode ?? 'JPY',
  };
}
