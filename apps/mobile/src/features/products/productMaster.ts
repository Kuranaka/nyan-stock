import { productMasterSeed } from '@/data/productMaster.seed';
import { generatedProductMasterSeed } from '@/data/productMaster.generated';
import { InventoryCategory, InventoryUnit, PurchaseLinks } from '@/features/inventory/inventoryTypes';

import { ProductCategory, ProductMaster, ProductUnit } from './productTypes';

type ProductSearchOptions = {
  brand?: string;
  category?: ProductCategory;
  limit?: number;
};

type SupabaseProductMasterRow = {
  data?: ProductMaster;
};

type ProductMasterSearchResponse = {
  items?: ProductMaster[];
  error?: string;
};

const productCategorySortOrder: ProductCategory[] = [
  'dry_food',
  'wet_food',
  'treat',
  'cat_litter',
  'toilet_sheet',
  'supplement',
  'medicine',
  'care',
  'other',
];

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseProductMasterTable = process.env.EXPO_PUBLIC_SUPABASE_PRODUCT_MASTER_TABLE ?? 'product_masters';
const purchaseLinkSearchFunctionUrl = process.env.EXPO_PUBLIC_PURCHASE_LINK_SEARCH_FUNCTION_URL;

let cachedRemoteProductMasters: ProductMaster[] | undefined;

export const productCategoryLabels: Record<ProductCategory, string> = {
  dry_food: 'ドライフード',
  wet_food: 'ウェットフード',
  treat: 'おやつ',
  cat_litter: '猫砂',
  toilet_sheet: 'トイレシート',
  supplement: 'サプリ',
  medicine: '療養食',
  care: 'ケア用品',
  other: 'その他',
};

export function normalizeProductName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/・,，.。()（）[\]【】]/g, '');
}

export function findProductByJanCode(janCode: string): ProductMaster | undefined {
  const normalizedJanCode = janCode.replace(/\D/g, '');
  if (!normalizedJanCode) return undefined;
  return getProductMasters().find((product) => product.janCode === normalizedJanCode || product.gtin === normalizedJanCode);
}

export async function findProductByJanCodeAsync(janCode: string): Promise<ProductMaster | undefined> {
  const normalizedJanCode = janCode.replace(/\D/g, '');
  if (!normalizedJanCode) return undefined;
  const products = await getProductMastersAsync();
  return products.find((product) => product.janCode === normalizedJanCode || product.gtin === normalizedJanCode);
}

export async function findProductByIdAsync(id: string): Promise<ProductMaster | undefined> {
  const products = await getProductMastersAsync();
  return products.find((product) => product.id === id);
}

export function findProductsByKeyword(keyword: string, options: ProductSearchOptions = {}): ProductMaster[] {
  return searchProductMasters(getProductMasters(), keyword, options);
}

export async function findProductsByKeywordAsync(
  keyword: string,
  options: ProductSearchOptions = {},
): Promise<ProductMaster[]> {
  const products = await getProductMastersAsync();
  return searchProductMasters(products, keyword, options);
}

export async function getProductMasterBrands(options: Pick<ProductSearchOptions, 'category'> = {}): Promise<string[]> {
  const products = await getProductMastersAsync();
  return Array.from(
    new Set(
      products
        .filter((product) => !options.category || product.category === options.category)
        .map((product) => product.brand)
        .filter((brand): brand is string => Boolean(brand)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ja'));
}

async function getProductMastersAsync(): Promise<ProductMaster[]> {
  const remoteProducts = await loadSupabaseProductMasters();
  if (remoteProducts.length > 0) {
    return remoteProducts;
  }
  return getProductMasters();
}

async function loadSupabaseProductMasters(): Promise<ProductMaster[]> {
  if (cachedRemoteProductMasters) return cachedRemoteProductMasters;
  if (!supabaseAnonKey) return [];

  const edgeFunctionProducts = await loadProductMastersFromEdgeFunction();
  if (edgeFunctionProducts.length > 0) {
    cachedRemoteProductMasters = edgeFunctionProducts;
    return cachedRemoteProductMasters;
  }

  if (!supabaseUrl) return [];

  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const table = encodeURIComponent(supabaseProductMasterTable);
  const endpoint = `${baseUrl}/rest/v1/${table}?select=data&limit=1000&order=updated_at.desc`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    if (!response.ok) {
      console.warn(`[productMaster] Supabase load failed ${response.status}. Falling back to local seed.`);
      return [];
    }
    const rows = (await response.json()) as SupabaseProductMasterRow[];
    cachedRemoteProductMasters = rows
      .map((row) => row.data)
      .filter((product): product is ProductMaster => Boolean(product?.id && product.name));
    return cachedRemoteProductMasters;
  } catch (error) {
    console.warn('[productMaster] Supabase load failed. Falling back to local seed.', error);
    return [];
  }
}

async function loadProductMastersFromEdgeFunction(): Promise<ProductMaster[]> {
  const endpoint = getPurchaseLinkSearchEndpoint();
  if (!endpoint || !supabaseAnonKey) return [];

  try {
    const response = await fetch(`${endpoint}?mode=product_master_search`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    const body = (await response.json()) as ProductMasterSearchResponse;
    if (!response.ok || body.error) {
      return [];
    }
    return (body.items ?? []).filter((product): product is ProductMaster => Boolean(product?.id && product.name));
  } catch {
    return [];
  }
}

function getPurchaseLinkSearchEndpoint(): string | undefined {
  if (purchaseLinkSearchFunctionUrl) return purchaseLinkSearchFunctionUrl.replace(/\/+$/, '');
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/purchase-link-search`;
}

function searchProductMasters(
  products: ProductMaster[],
  keyword: string,
  options: ProductSearchOptions = {},
): ProductMaster[] {
  const normalizedKeyword = normalizeProductName(keyword);
  const normalizedJanCode = keyword.replace(/\D/g, '');
  const limit = options.limit ?? 20;

  return products
    .filter((product) => !options.category || product.category === options.category)
    .filter((product) => !options.brand || product.brand === options.brand)
    .map((product) => ({ product, score: scoreProduct(product, normalizedKeyword, normalizedJanCode) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareProductsByCategoryAndMaker(a.product, b.product))
    .slice(0, limit)
    .map(({ product }) => product);
}

function getProductMasters(): ProductMaster[] {
  return [...generatedProductMasterSeed, ...productMasterSeed];
}

export function productCategoryToInventoryCategory(category: ProductCategory): InventoryCategory {
  if (category === 'toilet_sheet') return 'cat_litter';
  return category;
}

export function productUnitToInventoryUnit(unit: ProductUnit): InventoryUnit {
  return unit;
}

export function productPurchaseLinksToInventoryLinks(product: ProductMaster): PurchaseLinks {
  return {
    amazon: product.purchaseLinks?.amazon,
    rakuten: product.purchaseLinks?.rakuten,
    yahoo: product.purchaseLinks?.yahoo,
    other: product.purchaseLinks?.official,
  };
}

export function getProductMasterImageUrl(product: ProductMaster): string | undefined {
  const candidates = [product.imageUrl, ...(product.packageImageUrls ?? [])];
  return candidates.find((url) => url && /^https?:\/\//i.test(url));
}

function scoreProduct(product: ProductMaster, normalizedKeyword: string, normalizedJanCode: string): number {
  if (!normalizedKeyword) return Math.max(product.confidence, 1);
  if (normalizedJanCode && (product.janCode === normalizedJanCode || product.gtin === normalizedJanCode)) {
    return 1000 + product.confidence;
  }

  const normalizedFields = [
    product.normalizedName,
    normalizeProductName(product.name),
    product.brand ? normalizeProductName(product.brand) : '',
    product.maker ? normalizeProductName(product.maker) : '',
    ...product.searchKeywords.map(normalizeProductName),
  ].filter(Boolean);

  return normalizedFields.reduce((score, field) => {
    if (field === normalizedKeyword) return score + 20;
    if (field.includes(normalizedKeyword)) return score + 8;
    if (normalizedKeyword.includes(field)) return score + 3;
    return score;
  }, 0);
}

function compareProductsByCategoryAndMaker(a: ProductMaster, b: ProductMaster): number {
  return (
    categorySortIndex(a.category) - categorySortIndex(b.category) ||
    productMakerLabel(a).localeCompare(productMakerLabel(b), 'ja') ||
    a.name.localeCompare(b.name, 'ja')
  );
}

function categorySortIndex(category: ProductCategory): number {
  const index = productCategorySortOrder.indexOf(category);
  return index === -1 ? productCategorySortOrder.length : index;
}

function productMakerLabel(product: ProductMaster): string {
  return product.maker ?? product.brand ?? '';
}
