import { detectAmount } from './detectAmount.js';
import { detectBrand } from './detectBrand.js';
import { detectCategory } from './detectCategory.js';
import { normalizeGtin, normalizeJanCode } from './normalizeJanCode.js';
import { ProductMaster, ProductProvider, RawProduct } from '../types.js';

const noiseWords = [
  '送料無料',
  '最安値',
  '税込',
  'ポイント',
  '正規品',
  'セット',
  'まとめ買い',
  '猫用',
  'キャットフード',
  'あす楽',
  '即納',
];

export function normalizeProductName(name: string): string {
  return removeNoiseWords(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/・,，.。()（）[\]【】"'“”]/g, '');
}

export function removeNoiseWords(name: string): string {
  return noiseWords.reduce((current, word) => current.replaceAll(word, ''), name.normalize('NFKC'));
}

export function buildSearchKeywords(product: ProductMaster): string[] {
  const values = [
    product.name,
    product.normalizedName,
    product.brand,
    product.maker,
    product.category,
    product.amount !== undefined && product.unit ? `${product.amount}${product.unit}` : undefined,
  ];
  const words = values
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/[\s　,，/・]+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
  return Array.from(new Set(words));
}

export function convertRawProductToProductMaster(raw: RawProduct): ProductMaster {
  const now = new Date().toISOString();
  const amount = raw.amount && raw.unit ? { amount: raw.amount, unit: raw.unit } : detectAmount(raw.rawName);
  const brand = raw.brand ?? detectBrand(raw.rawName);
  const category = detectCategory(`${raw.rawName} ${raw.categoryText ?? ''}`);
  const normalizedName = normalizeProductName(raw.rawName);
  const gtin = normalizeGtin(raw.gtin ?? raw.janCode);
  const janCode = normalizeJanCode(raw.janCode ?? raw.gtin);
  const product: ProductMaster = {
    id: createProductId(raw.provider, raw.externalId, normalizedName),
    name: removeNoiseWords(raw.rawName).trim(),
    normalizedName,
    brand,
    category,
    amount: amount?.amount,
    unit: amount?.unit,
    janCode,
    gtin,
    rakutenItemCode: raw.provider === 'rakuten' ? raw.externalId : undefined,
    yahooItemCode: raw.provider === 'yahoo' ? raw.externalId : undefined,
    imageUrl: raw.imageUrl,
    packageImageUrls: raw.imageUrl ? [raw.imageUrl] : [],
    purchaseLinks: {
      rakuten: raw.provider === 'rakuten' ? raw.url : undefined,
      yahoo: raw.provider === 'yahoo' ? raw.url : undefined,
    },
    searchKeywords: [],
    sources: [
      {
        provider: raw.provider,
        externalId: raw.externalId,
        janCode,
        gtin,
        url: raw.url,
        imageUrl: raw.imageUrl,
        rawName: raw.rawName,
        fetchedAt: raw.fetchedAt,
      },
    ],
    confidence: 0,
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  };
  product.searchKeywords = buildSearchKeywords(product);
  product.confidence = calculateConfidence(product);
  product.isVerified = product.confidence >= 80;
  return product;
}

export function mergeProductMasters(existing: ProductMaster, incoming: ProductMaster): ProductMaster {
  const sources = mergeSources(existing.sources, incoming.sources);
  const packageImageUrls = Array.from(
    new Set([...(existing.packageImageUrls ?? []), ...(incoming.packageImageUrls ?? [])].filter(Boolean)),
  );
  const merged: ProductMaster = {
    ...existing,
    name: pickLongerName(existing.name, incoming.name),
    brand: existing.brand ?? incoming.brand,
    maker: existing.maker ?? incoming.maker,
    category: existing.category === 'other' ? incoming.category : existing.category,
    amount: existing.amount ?? incoming.amount,
    unit: existing.unit ?? incoming.unit,
    janCode: existing.janCode ?? incoming.janCode,
    gtin: existing.gtin ?? incoming.gtin,
    asin: existing.asin ?? incoming.asin,
    rakutenItemCode: existing.rakutenItemCode ?? incoming.rakutenItemCode,
    yahooItemCode: existing.yahooItemCode ?? incoming.yahooItemCode,
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    packageImageUrls,
    purchaseLinks: {
      amazon: existing.purchaseLinks?.amazon ?? incoming.purchaseLinks?.amazon,
      rakuten: existing.purchaseLinks?.rakuten ?? incoming.purchaseLinks?.rakuten,
      yahoo: existing.purchaseLinks?.yahoo ?? incoming.purchaseLinks?.yahoo,
      official: existing.purchaseLinks?.official ?? incoming.purchaseLinks?.official,
    },
    sources,
    updatedAt: new Date().toISOString(),
  };
  merged.searchKeywords = buildSearchKeywords(merged);
  merged.confidence = calculateConfidence(merged);
  merged.isVerified = merged.confidence >= 80;
  return merged;
}

export function calculateConfidence(product: ProductMaster): number {
  const providers = new Set<ProductProvider>(product.sources.map((source) => source.provider));
  const score =
    (product.janCode ? 40 : 0) +
    (product.brand ? 10 : 0) +
    (product.amount !== undefined && product.unit ? 10 : 0) +
    (product.imageUrl || product.packageImageUrls?.length ? 5 : 0) +
    (providers.has('rakuten') && providers.has('yahoo') ? 20 : 0) +
    (product.category !== 'other' ? 10 : 0) +
    (product.normalizedName.length >= 8 ? 5 : 0);
  return Math.min(score, 100);
}

function createProductId(provider: ProductProvider, externalId: string, normalizedName: string): string {
  const base = `${provider}-${externalId || normalizedName}`.normalize('NFKC');
  return `pm-${base.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || Date.now()}`;
}

function mergeSources(
  existing: ProductMaster['sources'],
  incoming: ProductMaster['sources'],
): ProductMaster['sources'] {
  const byKey = new Map<string, ProductMaster['sources'][number]>();
  [...existing, ...incoming].forEach((source) => {
    byKey.set(`${source.provider}:${source.externalId ?? source.janCode ?? source.rawName}`, source);
  });
  return Array.from(byKey.values());
}

function pickLongerName(a: string, b: string): string {
  return removeNoiseWords(a).length >= removeNoiseWords(b).length ? a : b;
}
