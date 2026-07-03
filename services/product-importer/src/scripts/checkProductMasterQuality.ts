import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { normalizeProductName } from '../normalizers/normalizeProduct.js';
import { ProductCategory, ProductMaster, ProductProvider } from '../types.js';

type QualityReport = {
  sourcePath: string;
  total: number;
  byCategory: Record<ProductCategory, number>;
  byProvider: Partial<Record<ProductProvider, number>>;
  confidence: {
    average: number;
    min: number;
    max: number;
    verified: number;
    buckets: Record<'under40' | 'from40To59' | 'from60To79' | 'from80', number>;
  };
  missing: {
    brand: number;
    amountOrUnit: number;
    janOrGtin: number;
    image: number;
    purchaseLink: number;
    searchKeywords: number;
    sources: number;
  };
  suspicious: {
    categoryOther: number;
    longName: number;
    longNormalizedName: number;
    noiseWordInName: number;
    invalidConfidence: number;
  };
  duplicateCandidates: {
    byJanOrGtin: DuplicateGroup[];
    byIdentityKey: DuplicateGroup[];
    bySimilarName: SimilarNameCandidate[];
  };
  topBrands: Array<{ brand: string; count: number }>;
  samples: {
    categoryOther: ProductSample[];
    missingBrand: ProductSample[];
    missingAmount: ProductSample[];
    missingJanOrGtin: ProductSample[];
    noisyName: ProductSample[];
    lowConfidence: ProductSample[];
  };
};

type DuplicateGroup = {
  key: string;
  count: number;
  products: ProductSample[];
};

type SimilarNameCandidate = {
  similarity: number;
  products: [ProductSample, ProductSample];
};

type ProductSample = {
  id: string;
  name: string;
  brand?: string;
  category: ProductCategory;
  amount?: number;
  unit?: string;
  confidence: number;
  providers: ProductProvider[];
};

const categories: ProductCategory[] = [
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
const noisePattern = /(送料無料|クーポン|ポイント|最安値|税込|あす楽|即納|まとめ買い|セットは更にお得|最大\d+円)/;
const reportPath = path.join(path.dirname(config.outputJsonPath), 'productMaster.quality.json');

async function main() {
  const products = JSON.parse(await readFile(config.outputJsonPath, 'utf8')) as ProductMaster[];
  const report = buildQualityReport(products);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printSummary(report);
}

export function buildQualityReport(products: ProductMaster[]): QualityReport {
  return {
    sourcePath: relativeToRepository(config.outputJsonPath),
    total: products.length,
    byCategory: countByCategory(products),
    byProvider: countByProvider(products),
    confidence: summarizeConfidence(products),
    missing: {
      brand: products.filter((product) => !product.brand).length,
      amountOrUnit: products.filter((product) => product.amount === undefined || !product.unit).length,
      janOrGtin: products.filter((product) => !product.janCode && !product.gtin).length,
      image: products.filter((product) => !product.imageUrl && !product.packageImageUrls?.length).length,
      purchaseLink: products.filter((product) => !hasPurchaseLink(product)).length,
      searchKeywords: products.filter((product) => product.searchKeywords.length === 0).length,
      sources: products.filter((product) => product.sources.length === 0).length,
    },
    suspicious: {
      categoryOther: products.filter((product) => product.category === 'other').length,
      longName: products.filter((product) => product.name.length > 80).length,
      longNormalizedName: products.filter((product) => product.normalizedName.length > 80).length,
      noiseWordInName: products.filter((product) => noisePattern.test(product.name)).length,
      invalidConfidence: products.filter((product) => product.confidence < 0 || product.confidence > 100).length,
    },
    duplicateCandidates: {
      byJanOrGtin: duplicateGroups(products, productJanKey),
      byIdentityKey: duplicateGroups(products, productIdentityKey),
      bySimilarName: similarNameCandidates(products),
    },
    topBrands: topBrands(products),
    samples: {
      categoryOther: samples(products.filter((product) => product.category === 'other')),
      missingBrand: samples(products.filter((product) => !product.brand)),
      missingAmount: samples(products.filter((product) => product.amount === undefined || !product.unit)),
      missingJanOrGtin: samples(products.filter((product) => !product.janCode && !product.gtin)),
      noisyName: samples(products.filter((product) => noisePattern.test(product.name))),
      lowConfidence: samples(products.filter((product) => product.confidence < 50)),
    },
  };
}

function countByCategory(products: ProductMaster[]): Record<ProductCategory, number> {
  return categories.reduce(
    (counts, category) => ({
      ...counts,
      [category]: products.filter((product) => product.category === category).length,
    }),
    {} as Record<ProductCategory, number>,
  );
}

function countByProvider(products: ProductMaster[]): Partial<Record<ProductProvider, number>> {
  return products.reduce<Partial<Record<ProductProvider, number>>>((counts, product) => {
    product.sources.forEach((source) => {
      counts[source.provider] = (counts[source.provider] ?? 0) + 1;
    });
    return counts;
  }, {});
}

function summarizeConfidence(products: ProductMaster[]): QualityReport['confidence'] {
  const values = products.map((product) => product.confidence);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    average: products.length ? Math.round((sum / products.length) * 10) / 10 : 0,
    min: products.length ? Math.min(...values) : 0,
    max: products.length ? Math.max(...values) : 0,
    verified: products.filter((product) => product.isVerified).length,
    buckets: {
      under40: products.filter((product) => product.confidence < 40).length,
      from40To59: products.filter((product) => product.confidence >= 40 && product.confidence < 60).length,
      from60To79: products.filter((product) => product.confidence >= 60 && product.confidence < 80).length,
      from80: products.filter((product) => product.confidence >= 80).length,
    },
  };
}

function duplicateGroups(
  products: ProductMaster[],
  keyOf: (product: ProductMaster) => string | undefined,
): DuplicateGroup[] {
  const groups = new Map<string, ProductMaster[]>();
  products.forEach((product) => {
    const key = keyOf(product);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  });
  return [...groups.entries()]
    .filter(([, groupedProducts]) => groupedProducts.length > 1)
    .map(([key, groupedProducts]) => ({
      key,
      count: groupedProducts.length,
      products: samples(groupedProducts, 5),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function productJanKey(product: ProductMaster): string | undefined {
  return product.janCode ?? product.gtin;
}

function productIdentityKey(product: ProductMaster): string | undefined {
  if (!product.normalizedName) return undefined;
  return [
    product.normalizedName,
    product.amount ?? '',
    product.unit ?? '',
    product.brand ? normalizeProductName(product.brand) : '',
  ].join('|');
}

function similarNameCandidates(products: ProductMaster[]): SimilarNameCandidate[] {
  const candidates: SimilarNameCandidate[] = [];
  for (let i = 0; i < products.length; i += 1) {
    for (let j = i + 1; j < products.length; j += 1) {
      const a = products[i];
      const b = products[j];
      if (productIdentityKey(a) === productIdentityKey(b)) continue;
      if (a.category !== b.category) continue;
      const similarity = jaccard(a.normalizedName, b.normalizedName);
      if (similarity >= 0.9) {
        candidates.push({ similarity: Math.round(similarity * 1000) / 1000, products: [sample(a), sample(b)] });
      }
    }
  }
  return candidates.sort((a, b) => b.similarity - a.similarity).slice(0, 30);
}

function jaccard(a: string, b: string): number {
  const aChars = new Set([...a]);
  const bChars = new Set([...b]);
  const intersection = [...aChars].filter((char) => bChars.has(char)).length;
  const union = new Set([...aChars, ...bChars]).size;
  return union === 0 ? 0 : intersection / union;
}

function topBrands(products: ProductMaster[]): Array<{ brand: string; count: number }> {
  const counts = new Map<string, number>();
  products.forEach((product) => {
    if (!product.brand) return;
    counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function samples(products: ProductMaster[], limit = 10): ProductSample[] {
  return products.slice(0, limit).map(sample);
}

function sample(product: ProductMaster): ProductSample {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    amount: product.amount,
    unit: product.unit,
    confidence: product.confidence,
    providers: Array.from(new Set(product.sources.map((source) => source.provider))),
  };
}

function hasPurchaseLink(product: ProductMaster): boolean {
  return Boolean(
    product.purchaseLinks?.amazon ||
      product.purchaseLinks?.rakuten ||
      product.purchaseLinks?.yahoo ||
      product.purchaseLinks?.official,
  );
}

function printSummary(report: QualityReport): void {
  console.log(`[quality] total=${report.total}`);
  console.log(
    `[quality] confidence avg=${report.confidence.average} min=${report.confidence.min} max=${report.confidence.max} verified=${report.confidence.verified}`,
  );
  console.log(`[quality] categories=${JSON.stringify(report.byCategory)}`);
  console.log(`[quality] providers=${JSON.stringify(report.byProvider)}`);
  console.log(`[quality] missing=${JSON.stringify(report.missing)}`);
  console.log(`[quality] suspicious=${JSON.stringify(report.suspicious)}`);
  console.log(
    `[quality] duplicateCandidates jan=${report.duplicateCandidates.byJanOrGtin.length} identity=${report.duplicateCandidates.byIdentityKey.length} similar=${report.duplicateCandidates.bySimilarName.length}`,
  );
  console.log(`[quality] report=${reportPath}`);
}

function relativeToRepository(filePath: string): string {
  return path.relative(config.repositoryRoot, filePath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
