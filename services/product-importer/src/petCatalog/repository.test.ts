import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductIdentityKeys,
  buildProductVariantKey,
  chunkSupabaseFilterValues,
  collectSupabasePages,
  fetchWithSupabaseRetry,
  SUPABASE_CONFLICT_TARGETS,
} from './repository.js';
import { ProductCandidate, StoredRetailerListing } from './types.js';

test('Supabase upsert conflict targets match the catalog primary and unique keys', () => {
  assert.deepEqual(SUPABASE_CONFLICT_TARGETS, {
    petGroups: 'code',
    petGroupTranslations: 'pet_group,locale',
    petSpecies: 'pet_group,code',
    petSpeciesTranslations: 'pet_group,species_code,locale',
    petSpeciesGroups: 'pet_group,code',
    petSpeciesGroupTranslations: 'pet_group,species_group_code,locale',
    petBrands: 'id',
    petBrandTranslations: 'brand_id,locale',
    petCategories: 'id',
    petCategoryTranslations: 'category_id,locale',
    petSubcategories: 'category_id,id',
    petSubcategoryTranslations: 'category_id,subcategory_id,locale',
    productSearchQueries: 'id',
    normalizationAliases: 'id',
    retailerListingsRaw: 'source,source_item_id,search_query_id',
    productCandidates: 'id',
    productReviewQueue: 'candidate_id,issue_type',
    products: 'canonical_key',
    productTranslations: 'product_id,locale',
    productVariants: 'variant_key',
    productIdentityKeys: 'key_type,namespace,normalized_value',
    productRetailerListings: 'product_id,raw_listing_id',
    petProductMasters: 'variant_id',
  });
});

test('Supabase requests retry transient network failures and then succeed', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const response = await fetchWithSupabaseRetry('https://example.test/rest/v1/products', {}, {
    maxRetries: 4,
    baseDelayMs: 100,
    fetchImpl: (async () => {
      attempts += 1;
      if (attempts === 1) {
        const cause = Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
        throw new TypeError('fetch failed', { cause });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [100]);
});

test('Supabase requests retry rate limits and server errors but not client errors', async () => {
  let retryableAttempts = 0;
  const retryable = await fetchWithSupabaseRetry('https://example.test/rest/v1/products', {}, {
    maxRetries: 4,
    baseDelayMs: 100,
    fetchImpl: (async () => {
      retryableAttempts += 1;
      return new Response('{}', { status: retryableAttempts === 1 ? 503 : 200 });
    }) as typeof fetch,
    sleep: async () => {},
  });

  let clientAttempts = 0;
  const clientError = await fetchWithSupabaseRetry('https://example.test/rest/v1/products', {}, {
    maxRetries: 4,
    baseDelayMs: 100,
    fetchImpl: (async () => {
      clientAttempts += 1;
      return new Response('{}', { status: 400 });
    }) as typeof fetch,
    sleep: async () => {},
  });

  assert.equal(retryable.status, 200);
  assert.equal(retryableAttempts, 2);
  assert.equal(clientError.status, 400);
  assert.equal(clientAttempts, 1);
});

test('Supabase requests retry transient JWT issued-at-future clock skew', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const response = await fetchWithSupabaseRetry('https://example.test/rest/v1/products', {}, {
    maxRetries: 4,
    baseDelayMs: 100,
    fetchImpl: (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 })
        : new Response('{}', { status: 200 });
    }) as typeof fetch,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [100]);
});

test('Supabase quality snapshots collect every 1000-row page', async () => {
  const source = Array.from({ length: 2_005 }, (_, index) => ({ id: index + 1 }));
  const requests: Array<{ offset: number; limit: number }> = [];

  const rows = await collectSupabasePages(async (offset, limit) => {
    requests.push({ offset, limit });
    return source.slice(offset, offset + limit);
  });

  assert.deepEqual(rows, source);
  assert.deepEqual(requests, [
    { offset: 0, limit: 1000 },
    { offset: 1000, limit: 1000 },
    { offset: 2000, limit: 1000 },
  ]);
});

test('Supabase pagination requests the terminating empty page for an exact multiple', async () => {
  const source = Array.from({ length: 2_000 }, (_, index) => index);
  const offsets: number[] = [];

  const rows = await collectSupabasePages(async (offset, limit) => {
    offsets.push(offset);
    return source.slice(offset, offset + limit);
  });

  assert.deepEqual(rows, source);
  assert.deepEqual(offsets, [0, 1000, 2000]);
});

test('Supabase relation filters are split into bounded batches', () => {
  const ids = Array.from({ length: 205 }, (_, index) => `raw-${index + 1}`);

  const chunks = chunkSupabaseFilterValues(ids, 100);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [100, 100, 5]);
  assert.deepEqual(chunks.flat(), ids);
  assert.throws(() => chunkSupabaseFilterValues(ids, 0), /positive integer/);
});

test('a valid JAN takes precedence over a brand-scoped model number', () => {
  const candidate = makeCandidate({ janCode: '4901234567894', modelNumber: 'ML－468', brand: 'テトラ' });
  const listing = makeListing();
  const keys = buildProductIdentityKeys(candidate, listing);

  assert.deepEqual(keys, [
    { keyType: 'jan', namespace: '', normalizedValue: '4901234567894', source: 'rakuten_product_navi', confidence: 1 },
  ]);
  assert.equal(buildProductVariantKey('product-1', candidate, listing, keys), 'identity:jan::4901234567894');
});

test('a brand-scoped model number remains a fallback identity when JAN is unavailable', () => {
  const candidate = makeCandidate({ modelNumber: 'ML－468', brand: 'テトラ' });
  const listing = makeListing();

  assert.deepEqual(buildProductIdentityKeys(candidate, listing), [
    { keyType: 'model_number', namespace: 'テトラ', normalizedValue: 'ml-468', source: 'rakuten_product_navi', confidence: 0.98 },
  ]);
});

test('capacity-only variants use different fallback keys without changing product identity', () => {
  const listing = makeListing();
  const small = makeCandidate({ capacityValue: 500, capacityUnit: 'g' });
  const large = makeCandidate({ capacityValue: 1000, capacityUnit: 'g' });

  assert.notEqual(
    buildProductVariantKey('product-1', small, listing, []),
    buildProductVariantKey('product-1', large, listing, []),
  );
});

function makeCandidate(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: 'candidate-test',
    rawListingId: 'raw-test',
    sourceLocale: 'ja-JP',
    normalizedName: 'テスト商品',
    baseProductName: 'テスト商品',
    petGroup: 'dog',
    targetSpecies: ['dog'],
    targetScope: 'species_specific',
    canonicalKey: 'test::product',
    classificationEvidence: {
      petGroup: [], targetSpecies: [], targetSpeciesGroup: [],
      searchContext: { queryId: 'query-test', petGroup: 'dog' }, notes: [],
    },
    classificationConfidence: 1,
    mergeConfidence: 1,
    confidence: 1,
    status: 'merge_ready',
    issues: [],
    ...overrides,
  };
}

function makeListing(): StoredRetailerListing {
  return {
    id: 'raw-test',
    source: 'rakuten_product_navi',
    sourceItemId: 'source-test',
    searchQueryId: 'query-test',
    searchPetGroup: 'dog',
    contentLocale: 'ja-JP',
    marketCode: 'JP',
    currencyCode: 'JPY',
    rawTitle: 'テスト商品',
    fetchedAt: '2026-07-20T00:00:00.000Z',
    rawJson: {},
  };
}
