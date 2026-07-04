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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseProductMasterTable = process.env.EXPO_PUBLIC_SUPABASE_PRODUCT_MASTER_TABLE ?? 'product_masters';

let cachedRemoteProductMasters: ProductMaster[] | undefined;

export const productCategoryLabels: Record<ProductCategory, string> = {
  dry_food: 'ドライフード',
  wet_food: 'ウェットフード',
  treat: 'おやつ',
  cat_litter: '猫砂',
  toilet_sheet: 'トイレシート',
  supplement: 'サプリ',
  medicine: '薬',
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
  if (!supabaseUrl || !supabaseAnonKey) return [];

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
    .sort((a, b) => b.score - a.score || b.product.confidence - a.product.confidence)
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
