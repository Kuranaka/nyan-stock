import {
  InventoryCategory,
  InventoryUnit,
  PurchaseLinks,
} from '@/features/inventory/inventoryTypes';

import { PetProductGroup, PetProductMaster } from './productTypes';

export type ProductSearchOptions = {
  brand?: string;
  category?: InventoryCategory;
  petGroup?: PetProductGroup;
  limit?: number | null;
};

export type ProductSearchPage = {
  products: PetProductMaster[];
  nextCursor?: string;
  hasMore: boolean;
};

type SupabasePetProductMasterRow = {
  id: string;
  data?: PetProductMaster;
};

type SupabasePetProductMasterBrandRow = {
  brand?: string;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabasePetProductMasterTable =
  process.env.EXPO_PUBLIC_SUPABASE_PET_PRODUCT_MASTER_TABLE ?? 'pet_product_masters';

const defaultSearchPageSize = 20;
const maxSearchPageSize = 100;

export const petProductGroupLabels: Record<PetProductGroup, string> = {
  cat: '猫',
  dog: '犬',
  rabbit: 'うさぎ',
  small_animal: '小動物',
  bird: '鳥',
  aquarium: '観賞魚',
  reptile_amphibian: '爬虫類・両生類',
  insect: '昆虫',
};

export function normalizeProductName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/・,，.。()（）[\]【】]/g, '');
}

export async function findProductByJanCodeAsync(
  janCode: string,
): Promise<PetProductMaster | undefined> {
  const normalizedJanCode = janCode.normalize('NFKC').replace(/\D/g, '');
  if (!normalizedJanCode) return undefined;
  const page = await searchProductMasterPageAsync(normalizedJanCode, { limit: 1 });
  return page.products[0];
}

export async function findProductByIdAsync(id: string): Promise<PetProductMaster | undefined> {
  if (!id || !supabaseUrl || !supabaseAnonKey) return undefined;
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const table = encodeURIComponent(supabasePetProductMasterTable);
  const params = new URLSearchParams({
    select: 'id,data',
    status: 'eq.published',
    id: `eq.${id}`,
    limit: '1',
  });
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${params.toString()}`, {
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`pet_product_masters id lookup failed (${response.status})`);
  }
  const rows = (await response.json()) as SupabasePetProductMasterRow[];
  return rows.map((row) => row.data).find(isPetProductMaster);
}

export async function findProductsByKeywordAsync(
  keyword: string,
  options: ProductSearchOptions = {},
): Promise<PetProductMaster[]> {
  const page = await searchProductMasterPageAsync(keyword, options);
  return page.products;
}

export async function searchProductMasterPageAsync(
  keyword: string,
  options: ProductSearchOptions & { cursor?: string } = {},
): Promise<ProductSearchPage> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { products: [], hasMore: false };
  }

  const pageSize = normalizePageSize(options.limit);
  const normalizedJanCode = getExactJanSearch(keyword);
  const keywordTerms = normalizedJanCode ? [] : splitSearchTerms(keyword);
  const rows = await callSupabaseRpc<SupabasePetProductMasterRow[]>('search_pet_product_masters', {
    p_pet_group: options.petGroup ?? null,
    p_inventory_category: options.category ?? null,
    p_brand: options.brand ?? null,
    p_keyword_terms: keywordTerms.length > 0 ? keywordTerms : null,
    p_jan_code: normalizedJanCode ?? null,
    p_after_id: options.cursor ?? null,
    p_limit: pageSize + 1,
  });
  const products = rows
    .slice(0, pageSize)
    .map((row) => row.data)
    .filter(isPetProductMaster);
  const hasMore = rows.length > pageSize;

  return {
    products,
    hasMore,
    nextCursor: hasMore ? rows[pageSize - 1].id : undefined,
  };
}

export async function getProductMasterBrands(
  options: Pick<ProductSearchOptions, 'category' | 'petGroup'> = {},
): Promise<string[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];
  const rows = await callSupabaseRpc<SupabasePetProductMasterBrandRow[]>(
    'list_pet_product_master_brands',
    {
      p_pet_group: options.petGroup ?? null,
      p_inventory_category: options.category ?? null,
    },
  );
  return rows
    .map((row) => row.brand)
    .filter((brand): brand is string => Boolean(brand))
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function isPetProductMaster(product: PetProductMaster | undefined): product is PetProductMaster {
  return Boolean(
    product?.id &&
    product.name &&
    product.petGroup &&
    product.categoryId &&
    product.subcategoryId &&
    product.status === 'published',
  );
}

export function petProductToInventoryCategory(product: PetProductMaster): InventoryCategory {
  const category = `${product.categoryId} ${product.subcategoryId}`.toLowerCase();
  if (/therapeutic|medicine/.test(category)) return 'medicine';
  if (/supplementary_food|milk/.test(category)) return 'wet_food';
  if (
    /water_conditioner|dechlorinator|bacteria|algae_control|plant_fertilizer|co2_consumable|aquarium_salt/.test(
      category,
    )
  )
    return 'supplement';
  if (/supplement|vitamin|calcium|mineral|cuttlebone|grit/.test(category)) return 'supplement';
  if (/treat|jelly|honey/.test(category)) return 'treat';
  if (/wet_food|semi_moist/.test(category)) return 'wet_food';
  if (/litter|sheet|sand|bedding|substrate|mat|gravel|soil|leaf_mold/.test(category))
    return 'cat_litter';
  if (/food|feed|pellet|timothy|alfalfa|seed|formula|flake|granule|tablet/.test(category))
    return 'dry_food';
  if (
    /care|shampoo|conditioner|deodorizer|grooming|bath|toilet|waste|diaper|wet_tissue|chew_toy|activated_carbon|filter_media|water_test|hydration|humidity|water_replacement|lighting|heat_lamp|kinshi_bottle|spawning_wood/.test(
      category,
    )
  )
    return 'care';
  return 'other';
}

export function petProductAmountAndUnit(product: PetProductMaster): {
  amount?: number;
  unit?: InventoryUnit;
} {
  const unit = normalizeInventoryUnit(product.capacityUnit);
  if (!unit || product.capacityValue === undefined || product.capacityValue <= 0) return {};
  return { amount: product.capacityValue, unit };
}

export function productPurchaseLinksToInventoryLinks(product: PetProductMaster): PurchaseLinks {
  const rakutenRetailers = product.retailers.filter((retailer) =>
    retailer.source.startsWith('rakuten_'),
  );
  const yahoo = product.retailers.find((retailer) => retailer.source === 'yahoo_shopping');
  return {
    rakuten:
      rakutenRetailers.find((retailer) => retailer.affiliateUrl)?.affiliateUrl ??
      rakutenRetailers.find((retailer) => retailer.itemUrl)?.itemUrl,
    yahoo: yahoo?.itemUrl ?? yahoo?.affiliateUrl,
  };
}

export function getProductMasterPrice(product: PetProductMaster): number | undefined {
  const pricedRetailers = product.retailers.filter(
    (retailer) =>
      retailer.currency === 'JPY' &&
      retailer.price !== undefined &&
      Number.isFinite(retailer.price) &&
      retailer.price >= 0,
  );
  const retailer =
    pricedRetailers.find((candidate) => candidate.availability !== false) ?? pricedRetailers[0];
  return retailer?.price;
}

export function getProductMasterImageUrl(product: PetProductMaster): string | undefined {
  const candidates = [
    product.imageUrl,
    ...product.imageUrls,
    ...product.retailers.map((retailer) => retailer.imageUrl),
  ];
  return candidates.find((url) => url && /^https?:\/\//i.test(url));
}

export function getProductVariantLabel(
  product: PetProductMaster,
  options: { includeJan?: boolean } = {},
): string | undefined {
  const labels: string[] = [];
  if (
    product.capacityValue !== undefined &&
    product.capacityValue > 0 &&
    product.capacityUnit
  ) {
    labels.push(`${formatProductNumber(product.capacityValue)}${product.capacityUnit}`);
  }
  if (product.quantity !== undefined && product.quantity > 1) {
    labels.push(`${formatProductNumber(product.quantity)}個入`);
  }
  if (options.includeJan && product.janCode) labels.push(`JAN ${product.janCode}`);
  return labels.length > 0 ? labels.join(' ・ ') : undefined;
}

function formatProductNumber(value: number): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
}

function normalizeInventoryUnit(value?: string): InventoryUnit | undefined {
  const normalized = value?.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 'g';
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') return 'kg';
  if (normalized === 'ml' || normalized === 'milliliter' || normalized === 'milliliters')
    return 'ml';
  if (normalized === 'l' || normalized === 'liter' || normalized === 'liters') return 'L';
  if (['piece', 'pieces', '個', '枚', '本', '粒'].includes(normalized)) return 'piece';
  if (['bag', 'bags', '袋', 'パック'].includes(normalized)) return 'bag';
  return undefined;
}

function splitSearchTerms(keyword: string): string[] {
  return keyword.normalize('NFKC').trim().split(/\s+/).map(normalizeProductName).filter(Boolean);
}

function getExactJanSearch(keyword: string): string | undefined {
  const normalizedKeyword = keyword.normalize('NFKC').trim();
  const janCode = normalizedKeyword.replace(/\D/g, '');
  if (!/^[\d\s-]+$/.test(normalizedKeyword)) return undefined;
  return janCode.length === 8 || janCode.length === 13 ? janCode : undefined;
}

function normalizePageSize(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return defaultSearchPageSize;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), maxSearchPageSize);
}

function supabaseHeaders(): Record<string, string> {
  if (!supabaseAnonKey) return {};
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
}

async function callSupabaseRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase product master search is not configured.');
  }
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status})`);
  }
  return (await response.json()) as T;
}
