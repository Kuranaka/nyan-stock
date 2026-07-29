import { PetProductMaster, PetProductMasterRetailer } from '../../../../packages/shared/src/index.js';

import { normalizeBaseProductName } from './normalizeListing.js';
import { CatalogQualitySnapshot, PET_GROUPS, QualityRow } from './types.js';

export type BuildPetProductMastersOptions = {
  petGroup?: string;
  includeLegacyVariants?: boolean;
  keepDraftProducts?: boolean;
  limit?: number;
  getSearchReadings?: (values: readonly string[]) => string[];
};

export type BuildPetProductMastersResult = {
  masters: PetProductMaster[];
  skippedLegacyVariantIds: string[];
  invalidVariantIds: string[];
  deduplicatedVariantIds: string[];
};

export function buildPetProductMasters(
  snapshot: CatalogQualitySnapshot,
  options: BuildPetProductMastersOptions = {},
): BuildPetProductMastersResult {
  const productsById = new Map(snapshot.products.map((row) => [string(row, 'id'), row]));
  const listingsById = new Map(snapshot.listings.map((row) => [string(row, 'id'), row]));
  const linksByVariant = groupBy(snapshot.productListings, (row) => string(row, 'variant_id', 'variantId'));
  const identitiesByVariant = groupBy(snapshot.identityKeys, (row) => string(row, 'variant_id', 'variantId'));
  const skippedLegacyVariantIds: string[] = [];
  const invalidVariantIds: string[] = [];
  const masters: PetProductMaster[] = [];

  for (const variant of snapshot.variants) {
    const variantId = string(variant, 'id');
    const variantKey = string(variant, 'variant_key', 'variantKey');
    if (!options.includeLegacyVariants && variantKey.startsWith('legacy:')) {
      skippedLegacyVariantIds.push(variantId);
      continue;
    }
    const product = productsById.get(string(variant, 'product_id', 'productId'));
    if (!product) {
      invalidVariantIds.push(variantId);
      continue;
    }
    const petGroup = string(product, 'pet_group', 'petGroup');
    if (options.petGroup && petGroup !== options.petGroup) continue;
    const categoryId = string(product, 'category_id', 'categoryId');
    const subcategoryId = string(product, 'subcategory_id', 'subcategoryId');
    const targetScope = string(product, 'target_scope', 'targetScope');
    if (
      !PET_GROUPS.includes(petGroup as (typeof PET_GROUPS)[number]) ||
      !categoryId ||
      !subcategoryId ||
      !['species_specific', 'multi_species', 'group_wide'].includes(targetScope)
    ) {
      invalidVariantIds.push(variantId);
      continue;
    }

    const links = linksByVariant.get(variantId) ?? [];
    const retailers = links
      .map((link) => retailerFromLink(link, listingsById.get(string(link, 'raw_listing_id', 'rawListingId'))))
      .filter((row): row is PetProductMasterRetailer => Boolean(row))
      .sort(compareRetailers);
    const identities = identitiesByVariant.get(variantId) ?? [];
    const janCode =
      string(variant, 'jan_code', 'janCode') ||
      string(identities.find((row) => string(row, 'key_type', 'keyType') === 'jan'), 'normalized_value', 'normalizedValue') ||
      undefined;
    const modelNumber =
      string(variant, 'model_number', 'modelNumber') ||
      string(identities.find((row) => string(row, 'key_type', 'keyType') === 'model_number'), 'normalized_value', 'normalizedValue') ||
      undefined;
    const storedBaseName = string(product, 'normalized_name', 'normalizedName') || string(product, 'base_product_name', 'baseProductName');
    const baseName = normalizeBaseProductName(storedBaseName) || storedBaseName.trim();
    const capacityValue = optionalNumber(variant, 'capacity_value', 'capacityValue');
    const capacityUnit = optionalString(variant, 'capacity_unit', 'capacityUnit');
    const quantity = optionalNumber(variant, 'quantity');
    // Capacity and quantity belong to the variant fields. Re-appending them to
    // the display name would undo product-name normalization and expose sales
    // listing text such as "2個入" in the app.
    const name = baseName.trim();
    const brand = optionalString(product, 'brand');
    const series = optionalString(product, 'series');
    const baseProductName =
      normalizeBaseProductName(string(product, 'base_product_name', 'baseProductName')) || baseName;
    const searchReadings = options.getSearchReadings?.(
      [name, baseProductName, brand, series].filter((value): value is string => Boolean(value)),
    );
    const imageUrls = unique(retailers.map((row) => row.imageUrl).filter((value): value is string => Boolean(value)));
    const marketCodes = unique(
      links
        .map((link) => listingsById.get(string(link, 'raw_listing_id', 'rawListingId')))
        .map((listing) => optionalString(listing, 'market_code', 'marketCode'))
        .filter((value): value is string => Boolean(value)),
    );
    const productStatus = string(product, 'status');
    const variantStatus = optionalString(variant, 'status') ?? 'active';
    const createdAt = earliestTimestamp([
      optionalString(product, 'created_at', 'createdAt'),
      optionalString(variant, 'created_at', 'createdAt'),
    ]);
    const updatedAt = latestTimestamp([
      optionalString(product, 'updated_at', 'updatedAt'),
      optionalString(variant, 'updated_at', 'updatedAt'),
      ...links.map((link) => optionalString(link, 'linked_at', 'linkedAt')),
      ...retailers.map((retailer) => retailer.fetchedAt),
    ]);

    masters.push({
      id: `pet-master-${variantId}`,
      productId: string(product, 'id'),
      variantId,
      name,
      normalizedName: normalizeName(name),
      baseProductName,
      brand,
      series,
      petGroup: petGroup as PetProductMaster['petGroup'],
      targetSpecies: stringArray(product, 'target_species', 'targetSpecies'),
      targetSpeciesGroup: optionalString(product, 'target_species_group', 'targetSpeciesGroup'),
      targetScope: targetScope as PetProductMaster['targetScope'],
      targetSize: optionalString(product, 'target_size', 'targetSize'),
      targetAge: optionalString(product, 'target_age', 'targetAge'),
      lifeStage: optionalString(product, 'life_stage', 'lifeStage'),
      habitatType: optionalString(product, 'habitat_type', 'habitatType'),
      feedingType: optionalString(product, 'feeding_type', 'feedingType'),
      categoryId,
      subcategoryId,
      purpose: optionalString(product, 'purpose'),
      productFunction: optionalString(product, 'product_function', 'productFunction'),
      flavor: optionalString(product, 'flavor'),
      primaryIngredient: optionalString(product, 'primary_ingredient', 'primaryIngredient'),
      capacityValue,
      capacityUnit,
      quantity,
      packageType: packageType(variant, product),
      janCode,
      modelNumber,
      imageUrl: imageUrls[0],
      imageUrls,
      searchReadings: searchReadings && searchReadings.length > 0 ? searchReadings : undefined,
      retailers,
      sourceLocale: optionalString(product, 'source_locale', 'sourceLocale') ?? 'ja-JP',
      marketCodes: marketCodes.length > 0 ? marketCodes : ['JP'],
      confidence: optionalNumber(product, 'confidence') ?? 0,
      status:
        productStatus === 'rejected' || variantStatus === 'inactive' || variantStatus === 'rejected'
          ? 'retired'
          : (productStatus === 'active' ||
                productStatus === 'approved' ||
                (!options.keepDraftProducts && productStatus === 'draft')) &&
              variantStatus === 'active'
            ? 'published'
            : 'draft',
      createdAt,
      updatedAt,
    });
  }

  const deduplicatedVariantIds = retireDuplicatePublishedMasters(masters);
  masters.sort((left, right) => left.petGroup.localeCompare(right.petGroup) || left.name.localeCompare(right.name, 'ja') || left.id.localeCompare(right.id));
  return {
    masters: options.limit === undefined ? masters : masters.slice(0, options.limit),
    skippedLegacyVariantIds,
    invalidVariantIds,
    deduplicatedVariantIds,
  };
}

function retireDuplicatePublishedMasters(masters: PetProductMaster[]): string[] {
  const deduplicatedVariantIds: string[] = [];

  // A product can acquire multiple fallback variants for the same sellable SKU
  // as listings are imported. Keep capacity, quantity, JAN and model differences,
  // but expose only one master when all of those fields are identical.
  retireDuplicateGroups(
    masters,
    (master) => JSON.stringify([
      master.productId,
      master.normalizedName,
      ...skuIdentity(master),
    ]),
    deduplicatedVariantIds,
  );

  // Products created independently can still represent the exact same SKU.
  // Cross-product retirement requires a strong identity plus identical product
  // classification so that same-name products for another pet/category survive.
  retireDuplicateGroups(
    masters,
    (master) => {
      if (!master.janCode && !master.modelNumber) return undefined;
      return JSON.stringify([
        master.normalizedName,
        ...skuIdentity(master),
        master.brand ?? '',
        master.series ?? '',
        master.petGroup,
        [...master.targetSpecies].sort(),
        master.targetSpeciesGroup ?? '',
        master.targetScope,
        master.targetSize ?? '',
        master.targetAge ?? '',
        master.lifeStage ?? '',
        master.habitatType ?? '',
        master.feedingType ?? '',
        master.categoryId,
        master.subcategoryId,
        master.purpose ?? '',
        master.productFunction ?? '',
        master.flavor ?? '',
        master.primaryIngredient ?? '',
      ]);
    },
    deduplicatedVariantIds,
  );

  return deduplicatedVariantIds;
}

function retireDuplicateGroups(
  masters: PetProductMaster[],
  keyFor: (master: PetProductMaster) => string | undefined,
  deduplicatedVariantIds: string[],
): void {
  const groups = new Map<string, PetProductMaster[]>();
  for (const master of masters) {
    if (master.status !== 'published') continue;
    const key = keyFor(master);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), master]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keeper, ...duplicates] = [...group].sort(compareCanonicalMaster);
    mergeMasterSources(keeper, group);
    for (const duplicate of duplicates) {
      duplicate.status = 'retired';
      deduplicatedVariantIds.push(duplicate.variantId);
    }
  }
}

function skuIdentity(master: PetProductMaster): unknown[] {
  return [
    master.janCode ?? '',
    master.modelNumber ?? '',
    master.capacityValue ?? null,
    master.capacityUnit ?? '',
    master.quantity ?? null,
    master.packageType ?? '',
  ];
}

function compareCanonicalMaster(left: PetProductMaster, right: PetProductMaster): number {
  return right.retailers.length - left.retailers.length ||
    right.imageUrls.length - left.imageUrls.length ||
    right.confidence - left.confidence ||
    left.id.localeCompare(right.id);
}

function mergeMasterSources(keeper: PetProductMaster, group: PetProductMaster[]): void {
  const retailers = group.flatMap((master) => master.retailers).sort(compareRetailers);
  const seenRetailers = new Set<string>();
  keeper.retailers = retailers.filter((retailer) => {
    const key = `${retailer.source}:${retailer.sourceItemId}`;
    if (seenRetailers.has(key)) return false;
    seenRetailers.add(key);
    return true;
  });
  keeper.imageUrls = unique(
    group.flatMap((master) => [master.imageUrl, ...master.imageUrls])
      .concat(keeper.retailers.map((retailer) => retailer.imageUrl))
      .filter((value): value is string => Boolean(value)),
  );
  keeper.imageUrl = keeper.imageUrls[0];
  keeper.marketCodes = unique(group.flatMap((master) => master.marketCodes));
  keeper.createdAt = earliestTimestamp(group.map((master) => master.createdAt));
  keeper.updatedAt = latestTimestamp(group.map((master) => master.updatedAt));
}

function retailerFromLink(link: QualityRow, listing: QualityRow | undefined): PetProductMasterRetailer | undefined {
  if (!listing) return undefined;
  const source = string(listing, 'source');
  if (!['rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping'].includes(source)) return undefined;
  return {
    source: source as PetProductMasterRetailer['source'],
    sourceItemId: string(listing, 'source_item_id', 'sourceItemId'),
    shopName: optionalString(listing, 'shop_name', 'shopName'),
    price: optionalNumber(link, 'price') ?? optionalNumber(listing, 'price'),
    currency: optionalString(listing, 'currency', 'currencyCode') ?? 'JPY',
    itemUrl: optionalString(link, 'item_url', 'itemUrl') ?? optionalString(listing, 'item_url', 'itemUrl'),
    affiliateUrl: optionalString(link, 'affiliate_url', 'affiliateUrl') ?? optionalString(listing, 'affiliate_url', 'affiliateUrl'),
    imageUrl: optionalString(listing, 'image_url', 'imageUrl'),
    availability: optionalBoolean(link, 'availability') ?? optionalBoolean(listing, 'availability'),
    fetchedAt: optionalString(listing, 'fetched_at', 'fetchedAt') ?? new Date(0).toISOString(),
  };
}

function compareRetailers(left: PetProductMasterRetailer, right: PetProductMasterRetailer): number {
  const sourceOrder = { rakuten_product_navi: 0, rakuten_ichiba: 1, yahoo_shopping: 2 } as const;
  return Number(right.availability ?? false) - Number(left.availability ?? false) ||
    sourceOrder[left.source] - sourceOrder[right.source] ||
    (left.price ?? Number.MAX_SAFE_INTEGER) - (right.price ?? Number.MAX_SAFE_INTEGER) ||
    left.sourceItemId.localeCompare(right.sourceItemId);
}

function packageType(variant: QualityRow, product: QualityRow): 'main' | 'refill' | undefined {
  const value = optionalString(variant, 'package_type', 'packageType') ?? optionalString(product, 'package_type', 'packageType');
  return value === 'main' || value === 'refill' ? value : undefined;
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　\-_/・,，.。()（）[\]【】'"“”]/g, '');
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}

function string(row: QualityRow | undefined, ...keys: string[]): string {
  if (!row) return '';
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return '';
}

function optionalString(row: QualityRow | undefined, ...keys: string[]): string | undefined {
  return string(row, ...keys).trim() || undefined;
}

function optionalNumber(row: QualityRow | undefined, ...keys: string[]): number | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalBoolean(row: QualityRow | undefined, ...keys: string[]): boolean | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function stringArray(row: QualityRow, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
  }
  return [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function earliestTimestamp(values: Array<string | undefined>): string {
  return sortedTimestamps(values)[0] ?? new Date(0).toISOString();
}

function latestTimestamp(values: Array<string | undefined>): string {
  return sortedTimestamps(values).at(-1) ?? new Date(0).toISOString();
}

function sortedTimestamps(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value)))).sort();
}
