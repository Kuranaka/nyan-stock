import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPetProductMasters } from './petProductMaster.js';
import { CatalogQualitySnapshot } from './types.js';

test('pet product masters flatten product, variant, identity and retailer data', () => {
  const snapshot: CatalogQualitySnapshot = {
    products: [{
      id: 'product-1',
      normalized_name: 'テストフード 500g 2個入',
      base_product_name: 'テストフード 500g 2個入',
      brand: 'テストブランド',
      pet_group: 'cat',
      target_species: ['cat'],
      target_scope: 'species_specific',
      category_id: 'cat_food',
      subcategory_id: 'subcat_001',
      source_locale: 'ja-JP',
      confidence: 0.98,
      status: 'active',
      created_at: '2026-07-20T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
    }],
    variants: [{
      id: 'variant-1',
      product_id: 'product-1',
      variant_key: 'identity:jan::4901234567894',
      capacity_value: 500,
      capacity_unit: 'g',
      quantity: 2,
      created_at: '2026-07-20T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
    }],
    identityKeys: [{
      variant_id: 'variant-1',
      key_type: 'jan',
      namespace: '',
      normalized_value: '4901234567894',
    }],
    listings: [{
      id: 'raw-1',
      source: 'rakuten_ichiba',
      source_item_id: 'shop:item-1',
      shop_name: 'テストショップ',
      currency: 'JPY',
      market_code: 'JP',
      item_url: 'https://example.test/item',
      affiliate_url: 'https://example.test/affiliate',
      image_url: 'https://example.test/image.jpg',
      availability: true,
      fetched_at: '2026-07-22T00:00:00.000Z',
    }],
    productListings: [{
      product_id: 'product-1',
      variant_id: 'variant-1',
      raw_listing_id: 'raw-1',
      price: 1280,
      availability: true,
      linked_at: '2026-07-22T00:00:00.000Z',
    }],
    candidates: [],
    reviewQueue: [],
  };

  const result = buildPetProductMasters(snapshot);

  assert.equal(result.masters.length, 1);
  assert.equal(result.masters[0].id, 'pet-master-variant-1');
  assert.equal(result.masters[0].name, 'テストフード');
  assert.equal(result.masters[0].baseProductName, 'テストフード');
  assert.equal(result.masters[0].capacityValue, 500);
  assert.equal(result.masters[0].capacityUnit, 'g');
  assert.equal(result.masters[0].quantity, 2);
  assert.equal(result.masters[0].petGroup, 'cat');
  assert.equal(result.masters[0].categoryId, 'cat_food');
  assert.equal(result.masters[0].janCode, '4901234567894');
  assert.equal(result.masters[0].status, 'published');
  assert.equal(result.masters[0].imageUrl, 'https://example.test/image.jpg');
  assert.equal(result.masters[0].retailers[0].price, 1280);
});

test('legacy variants are excluded by default and can be included explicitly', () => {
  const snapshot: CatalogQualitySnapshot = {
    products: [{
      id: 'product-legacy', normalized_name: '旧商品', base_product_name: '旧商品',
      pet_group: 'dog', target_species: [], target_scope: 'group_wide',
      category_id: 'dog_food', subcategory_id: 'dog_dry_food', confidence: 1, status: 'draft',
    }],
    variants: [{ id: 'variant-legacy', product_id: 'product-legacy', variant_key: 'legacy:product-legacy:raw-1' }],
    identityKeys: [],
    listings: [],
    productListings: [],
    candidates: [],
    reviewQueue: [],
  };

  assert.deepEqual(buildPetProductMasters(snapshot).skippedLegacyVariantIds, ['variant-legacy']);
  assert.equal(buildPetProductMasters(snapshot, { includeLegacyVariants: true }).masters.length, 1);
});

test('inactive variants are retired even when their product is published', () => {
  const snapshot: CatalogQualitySnapshot = {
    products: [{
      id: 'product-inactive', normalized_name: '販売終了商品', base_product_name: '販売終了商品',
      pet_group: 'cat', target_species: ['cat'], target_scope: 'species_specific',
      category_id: 'cat_food', subcategory_id: 'cat_dry_food', confidence: 1, status: 'active',
    }],
    variants: [{
      id: 'variant-inactive', product_id: 'product-inactive',
      variant_key: 'fallback:product-inactive:500:g:1:main', status: 'inactive',
    }],
    identityKeys: [],
    listings: [],
    productListings: [],
    candidates: [],
    reviewQueue: [],
  };

  assert.equal(buildPetProductMasters(snapshot).masters[0].status, 'retired');
});

test('draft products are published by default and stay draft only when explicitly requested', () => {
  const snapshot: CatalogQualitySnapshot = {
    products: [{
      id: 'product-draft', normalized_name: '公開待ち商品', base_product_name: '公開待ち商品',
      pet_group: 'cat', target_species: ['cat'], target_scope: 'species_specific',
      category_id: 'cat_food', subcategory_id: 'cat_dry_food', confidence: 1, status: 'draft',
    }],
    variants: [{
      id: 'variant-draft', product_id: 'product-draft',
      variant_key: 'fallback:product-draft:-:-:1:-', status: 'active',
    }],
    identityKeys: [],
    listings: [],
    productListings: [],
    candidates: [],
    reviewQueue: [],
  };

  assert.equal(buildPetProductMasters(snapshot).masters[0].status, 'published');
  assert.equal(
    buildPetProductMasters(snapshot, { keepDraftProducts: true }).masters[0].status,
    'draft',
  );
});

test('identical variants of one product expose one published master and merge retailers', () => {
  const snapshot = duplicateVariantSnapshot();

  const result = buildPetProductMasters(snapshot);
  const published = result.masters.filter((master) => master.status === 'published');

  assert.equal(published.length, 1);
  assert.deepEqual(result.deduplicatedVariantIds, ['variant-2']);
  assert.deepEqual(
    published[0].retailers.map((retailer) => retailer.sourceItemId),
    ['shop:item-1', 'shop:item-2'],
  );
});

test('capacity and JAN differences remain separate published masters', () => {
  const snapshot = duplicateVariantSnapshot();
  snapshot.variants[1].capacity_value = 1_000;
  snapshot.identityKeys[1].normalized_value = '4901234567895';

  const result = buildPetProductMasters(snapshot);

  assert.equal(result.masters.filter((master) => master.status === 'published').length, 2);
  assert.deepEqual(result.deduplicatedVariantIds, []);
});

test('same-name SKUs in different classifications are not merged', () => {
  const snapshot = duplicateVariantSnapshot();
  snapshot.products.push({
    ...snapshot.products[0],
    id: 'product-2',
    pet_group: 'dog',
    target_species: ['dog'],
    category_id: 'dog_food',
    subcategory_id: 'dog_dry_food',
  });
  snapshot.variants[1].product_id = 'product-2';
  snapshot.productListings[1].product_id = 'product-2';

  const result = buildPetProductMasters(snapshot);

  assert.equal(result.masters.filter((master) => master.status === 'published').length, 2);
  assert.deepEqual(result.deduplicatedVariantIds, []);
});

function duplicateVariantSnapshot(): CatalogQualitySnapshot {
  return {
    products: [{
      id: 'product-1', normalized_name: '同じ商品', base_product_name: '同じ商品',
      pet_group: 'cat', target_species: ['cat'], target_scope: 'species_specific',
      category_id: 'cat_food', subcategory_id: 'cat_dry_food', confidence: 1, status: 'active',
    }],
    variants: [
      {
        id: 'variant-1', product_id: 'product-1', variant_key: 'fallback:product-1:500:g:1:-',
        capacity_value: 500, capacity_unit: 'g', quantity: 1, status: 'active',
      },
      {
        id: 'variant-2', product_id: 'product-1', variant_key: 'fallback:product-1:500:g:1:main',
        capacity_value: 500, capacity_unit: 'g', quantity: 1, status: 'active',
      },
    ],
    identityKeys: [
      { variant_id: 'variant-1', key_type: 'jan', normalized_value: '4901234567894' },
      { variant_id: 'variant-2', key_type: 'jan', normalized_value: '4901234567894' },
    ],
    listings: [
      {
        id: 'raw-1', source: 'rakuten_ichiba', source_item_id: 'shop:item-1', currency: 'JPY',
        item_url: 'https://example.test/1', fetched_at: '2026-07-20T00:00:00.000Z',
      },
      {
        id: 'raw-2', source: 'rakuten_ichiba', source_item_id: 'shop:item-2', currency: 'JPY',
        item_url: 'https://example.test/2', fetched_at: '2026-07-21T00:00:00.000Z',
      },
    ],
    productListings: [
      { product_id: 'product-1', variant_id: 'variant-1', raw_listing_id: 'raw-1' },
      { product_id: 'product-1', variant_id: 'variant-2', raw_listing_id: 'raw-2' },
    ],
    candidates: [],
    reviewQueue: [],
  };
}
