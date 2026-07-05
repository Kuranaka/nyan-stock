import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.js';
import {
  buildSearchKeywords,
  calculateConfidence,
  normalizeProductName,
} from './normalizers/normalizeProduct.js';
import { ProductCategory, ProductMaster, ProductProvider, RawProduct } from './types.js';

export type SeedProductSeries = {
  productId: string;
  productName: string;
  brandId: string;
  brandName: string;
  manufacturer: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  productType: string;
  variationsOrTarget: string;
  priority: string;
  note: string;
  sourceUrl: string;
  isActive: boolean;
};

export type EnrichmentCandidate = {
  product: ProductMaster;
  score: number;
  price?: number;
};

const defaultSeedCsvPath = path.join(config.repositoryRoot, 'services', 'product-importer', 'data', 'seed', 'cat_products_seed.csv');

export async function loadSeedProductSeries(csvPath = defaultSeedCsvPath): Promise<SeedProductSeries[]> {
  const csv = await readFile(csvPath, 'utf8');
  return parseCsv(csv)
    .map(mapSeedRow)
    .filter((product) => product.isActive);
}

export function createSeedProductMaster(seed: SeedProductSeries): ProductMaster {
  const now = new Date().toISOString();
  const normalizedName = normalizeProductName(seed.productName);
  const product: ProductMaster = {
    id: `pm-seed-${seed.productId}`,
    name: seed.productName,
    normalizedName,
    brand: seed.brandName || undefined,
    maker: seed.manufacturer || undefined,
    category: mapSeedCategory(seed),
    description: buildDescription(seed),
    purchaseLinks: {
      official: seed.sourceUrl || undefined,
    },
    packageImageUrls: [],
    visualKeywords: buildVisualKeywords(seed),
    searchKeywords: [],
    sources: [
      {
        provider: 'official',
        externalId: seed.productId,
        url: seed.sourceUrl || undefined,
        rawName: seed.productName,
        fetchedAt: now,
      },
    ],
    confidence: 0,
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  };
  product.searchKeywords = buildSearchKeywords(product);
  product.confidence = calculateSeedConfidence(product, seed);
  return product;
}

export function buildSeedSearchKeyword(seed: SeedProductSeries): string {
  const nameIncludesBrand = normalizeProductName(seed.productName).includes(normalizeProductName(seed.brandName));
  const keyword = [nameIncludesBrand ? undefined : seed.brandName, seed.productName]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim();
  return sanitizeSearchKeyword(keyword);
}

function sanitizeSearchKeyword(keyword: string): string {
  return keyword
    .normalize('NFKC')
    .replace(/[\\/|｜]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mergeSeedProductWithCandidates(
  seedProduct: ProductMaster,
  candidates: EnrichmentCandidate[],
): ProductMaster {
  const now = new Date().toISOString();
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const usable = ranked.filter((candidate) => candidate.score >= 30);
  const sources = mergeSources(seedProduct.sources, usable.flatMap((candidate) => candidate.product.sources));
  const packageImageUrls = Array.from(
    new Set(
      [
        ...(seedProduct.packageImageUrls ?? []),
        ...usable.flatMap((candidate) => candidate.product.packageImageUrls ?? []),
      ].filter(Boolean),
    ),
  );
  const rakuten = firstProviderProduct(usable, 'rakuten');
  const yahoo = firstProviderProduct(usable, 'yahoo');
  const janSource = usable.find((candidate) => candidate.product.janCode)?.product;
  const imageSource = usable.find((candidate) => candidate.product.imageUrl)?.product;
  const amountSource = usable.find((candidate) => candidate.product.amount !== undefined && candidate.product.unit)?.product;

  const merged: ProductMaster = {
    ...seedProduct,
    amount: seedProduct.amount ?? amountSource?.amount,
    unit: seedProduct.unit ?? amountSource?.unit,
    janCode: seedProduct.janCode ?? janSource?.janCode,
    gtin: seedProduct.gtin ?? janSource?.gtin,
    rakutenItemCode: seedProduct.rakutenItemCode ?? rakuten?.rakutenItemCode,
    yahooItemCode: seedProduct.yahooItemCode ?? yahoo?.yahooItemCode,
    imageUrl: seedProduct.imageUrl ?? imageSource?.imageUrl,
    packageImageUrls,
    purchaseLinks: {
      official: seedProduct.purchaseLinks?.official,
      rakuten: seedProduct.purchaseLinks?.rakuten ?? rakuten?.purchaseLinks?.rakuten,
      yahoo: seedProduct.purchaseLinks?.yahoo ?? yahoo?.purchaseLinks?.yahoo,
    },
    sources,
    updatedAt: now,
  };
  merged.searchKeywords = buildSearchKeywords(merged);
  merged.confidence = calculateSeedConfidence(merged);
  merged.isVerified = merged.confidence >= 80;
  return merged;
}

export function scoreEnrichmentCandidate(seed: SeedProductSeries, raw: RawProduct, product: ProductMaster): number {
  const seedName = normalizeProductName(seed.productName);
  const rawName = normalizeProductName(raw.rawName);
  const seedBrand = normalizeProductName(seed.brandName);
  const rawBrand = normalizeProductName(raw.brand ?? product.brand ?? raw.rawName);
  let score = 0;

  if (rawName.includes(seedName)) score += 45;
  if (seedName.includes(rawName)) score += 25;
  if (seedBrand && rawBrand.includes(seedBrand)) score += 20;
  if (product.category === mapSeedCategory(seed)) score += 10;
  if (product.janCode) score += 10;
  if (product.imageUrl) score += 5;
  if (product.purchaseLinks?.rakuten || product.purchaseLinks?.yahoo) score += 5;

  return Math.min(score, 100);
}

function parseCsv(csv: string): Record<string, string>[] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, '')).filter((row) =>
    row.some((value) => value.trim().length > 0),
  );
  const [header = [], ...body] = rows;
  return body.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ''])),
  );
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function mapSeedRow(row: Record<string, string>): SeedProductSeries {
  return {
    productId: row.product_id,
    productName: row.product_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    manufacturer: row.manufacturer,
    categoryId: row.category_id,
    categoryName: row.category_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    productType: row.product_type,
    variationsOrTarget: row.variations_or_target,
    priority: row.priority,
    note: row.note,
    sourceUrl: row.source_url,
    isActive: row.is_active === 'true',
  };
}

function mapSeedCategory(seed: SeedProductSeries): ProductCategory {
  if (seed.subcategoryName.includes('ドライフード')) return 'dry_food';
  if (seed.subcategoryName.includes('ウェットフード')) return 'wet_food';
  if (seed.subcategoryName.includes('トイレ用シート') || seed.subcategoryName.includes('マット')) return 'toilet_sheet';
  if (seed.subcategoryName.includes('猫砂') || seed.subcategoryName.includes('チップ')) return 'cat_litter';
  if (seed.subcategoryName.includes('サプリ')) return 'supplement';
  if (seed.subcategoryName.includes('療法食')) return 'medicine';
  if (seed.categoryId === 'cat_treat' || seed.subcategoryName.includes('おやつ')) return 'treat';
  if (seed.categoryId === 'cat_care_cleaning') return 'care';
  return 'other';
}

function buildDescription(seed: SeedProductSeries): string | undefined {
  const values = [seed.subcategoryName, seed.productType, seed.variationsOrTarget, seed.note].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : undefined;
}

function buildVisualKeywords(seed: SeedProductSeries): string[] {
  return Array.from(
    new Set(
      [seed.brandName, seed.productName, seed.manufacturer, seed.subcategoryName, seed.variationsOrTarget]
        .filter(Boolean)
        .flatMap((value) => value.split(/[\s　/・、]+/))
        .map((value) => value.trim())
        .filter((value) => value.length >= 2),
    ),
  );
}

function calculateSeedConfidence(product: ProductMaster, seed?: SeedProductSeries): number {
  const base = calculateConfidence(product);
  const seedBonus = seed?.priority === 'A' ? 10 : 5;
  return Math.min(base + seedBonus, 100);
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

function firstProviderProduct(
  candidates: EnrichmentCandidate[],
  provider: ProductProvider,
): ProductMaster | undefined {
  return candidates.find((candidate) =>
    candidate.product.sources.some((source) => source.provider === provider),
  )?.product;
}
