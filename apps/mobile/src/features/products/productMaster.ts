import { productMasterSeed } from '@/data/productMaster.seed';
import { generatedProductMasterSeed } from '@/data/productMaster.generated';
import { InventoryCategory, InventoryUnit, PurchaseLinks } from '@/features/inventory/inventoryTypes';

import { ProductCategory, ProductMaster, ProductUnit } from './productTypes';

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

export function findProductsByKeyword(keyword: string): ProductMaster[] {
  const normalizedKeyword = normalizeProductName(keyword);
  if (!normalizedKeyword) return [];

  return getProductMasters()
    .map((product) => ({ product, score: scoreProduct(product, normalizedKeyword) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.product.confidence - a.product.confidence)
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

function scoreProduct(product: ProductMaster, normalizedKeyword: string): number {
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
