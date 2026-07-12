import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { buildSearchKeywords, calculateConfidence, normalizeProductName } from '../normalizers/normalizeProduct.js';
import { deleteProductMastersByIds, loadProductMasters, saveProductMasters } from '../repositories/productRepository.js';
import { ProductCategory, ProductMaster, ProductUnit } from '../types.js';

type ReviewDecision = {
  productId: string;
  status?: 'approved' | 'needs_fix' | 'rejected';
  name?: string;
  category?: ProductCategory;
  note?: string;
  imageUrl?: string;
  purchaseLinks?: ProductMaster['purchaseLinks'];
  product?: Partial<ProductMaster>;
};

type ReviewPayload = {
  reviewedAt?: string;
  totalProducts?: number;
  decisions: ReviewDecision[];
};

type ApplyOptions = {
  reviewPath: string;
  dryRun: boolean;
};

const defaultReviewPath = path.join(
  config.repositoryRoot,
  'services',
  'product-importer',
  'data',
  'generated',
  'productMaster.review-decisions.json',
);
const seedCsvPath = path.join(
  config.repositoryRoot,
  'services',
  'product-importer',
  'data',
  'seed',
  'cat_products_seed.csv',
);

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const payload = JSON.parse(await readFile(options.reviewPath, 'utf8')) as ReviewPayload;
  const products = await loadProductMasters();
  const byId = new Map(products.map((product) => [product.id, product]));
  const now = new Date().toISOString();
  let appliedCount = 0;
  let missingCount = 0;
  const rejectedIds: string[] = [];
  const rejectedSeedProductIds: string[] = [];
  const seedNamePatches = new Map<string, string>();

  payload.decisions.forEach((decision) => {
    const product = byId.get(decision.productId);
    if (!product) {
      const addedProduct = createProductFromDecision(decision, now);
      if (addedProduct) {
        byId.set(addedProduct.id, addedProduct);
        appliedCount += 1;
        return;
      }
      missingCount += 1;
      console.warn(`[review:apply] missing product: ${decision.productId}`);
      return;
    }

    if (decision.status === 'rejected') {
      byId.delete(product.id);
      rejectedIds.push(product.id);
      const seedProductId = seedProductIdFromProductMasterId(product.id);
      if (seedProductId) rejectedSeedProductIds.push(seedProductId);
      appliedCount += 1;
      return;
    }

    const next = applyDecision(product, decision, now);
    if (JSON.stringify(next) !== JSON.stringify(product)) {
      byId.set(product.id, next);
      const seedProductId = seedProductIdFromProductMasterId(product.id);
      const name = decision.name?.trim();
      if (seedProductId && name && name !== product.name) {
        seedNamePatches.set(seedProductId, name);
      }
      appliedCount += 1;
    }
  });

  if (!options.dryRun) {
    await deleteProductMastersByIds(rejectedIds);
    await removeSeedProductsByIds(rejectedSeedProductIds);
    await updateSeedProductNames(seedNamePatches);
    await saveProductMasters(Array.from(byId.values()));
  }
  console.log(
    `[review:apply] applied=${appliedCount} rejected=${rejectedIds.length} rejectedSeedRows=${rejectedSeedProductIds.length} renamedSeedRows=${seedNamePatches.size} missing=${missingCount} decisions=${payload.decisions.length} dryRun=${options.dryRun}`,
  );
}

function parseOptions(args: string[]): ApplyOptions {
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  return {
    reviewPath: fileArg ? path.resolve(fileArg.slice('--file='.length)) : defaultReviewPath,
    dryRun: args.includes('--dry-run'),
  };
}

function applyDecision(product: ProductMaster, decision: ReviewDecision, now: string): ProductMaster {
  const name = decision.name?.trim() || product.name;
  const normalizedName = name === product.name ? product.normalizedName : normalizeProductName(name);
  const category = isProductCategory(decision.category) ? decision.category : product.category;
  const hasImagePatch = Object.prototype.hasOwnProperty.call(decision, 'imageUrl');
  const imageUrl = hasImagePatch ? normalizeUrl(decision.imageUrl) : product.imageUrl;
  const purchaseLinks = mergePurchaseLinks(product.purchaseLinks, decision.purchaseLinks);
  // An explicitly cleared representative image means the product should have no
  // displayable package image. Keeping the old candidates makes the mobile app
  // fall back to them and appear as though the review change was ignored.
  const packageImageUrls = hasImagePatch
    ? imageUrl
      ? Array.from(new Set([imageUrl, ...(product.packageImageUrls ?? [])]))
      : []
    : product.packageImageUrls;

  const next: ProductMaster = {
    ...product,
    name,
    normalizedName,
    category,
    imageUrl,
    packageImageUrls,
    purchaseLinks,
    searchKeywords: buildSearchKeywords({ ...product, name, normalizedName, category }),
    isVerified:
      decision.status === 'approved'
        ? true
        : product.isVerified,
  };

  if (JSON.stringify(next) === JSON.stringify(product)) {
    return product;
  }

  return {
    ...next,
    updatedAt: now,
  };
}

function createProductFromDecision(decision: ReviewDecision, now: string): ProductMaster | undefined {
  const product = decision.product;
  const name = product?.name?.trim();
  if (!name) return undefined;

  const category = isProductCategory(product?.category) ? product.category : 'other';
  const amount = typeof product?.amount === 'number' && Number.isFinite(product.amount) ? product.amount : undefined;
  const unit = isProductUnit(product?.unit) ? product.unit : undefined;
  const imageUrl = normalizeUrl(decision.imageUrl ?? product?.imageUrl);
  const purchaseLinks = mergePurchaseLinks(product?.purchaseLinks, decision.purchaseLinks);
  const normalizedName = product?.normalizedName || normalizeProductName(name);
  const next: ProductMaster = {
    id: product?.id || decision.productId || `pm-manual-${Date.now()}`,
    name,
    normalizedName,
    brand: emptyToUndefined(product?.brand),
    maker: emptyToUndefined(product?.maker),
    category,
    description: emptyToUndefined(product?.description),
    amount,
    unit,
    janCode: normalizeDigits(product?.janCode),
    gtin: normalizeDigits(product?.gtin),
    asin: emptyToUndefined(product?.asin),
    imageUrl,
    packageImageUrls: imageUrl ? [imageUrl, ...(product?.packageImageUrls ?? [])] : (product?.packageImageUrls ?? []),
    visualKeywords: product?.visualKeywords ?? [],
    purchaseLinks,
    searchKeywords: [],
    sources: product?.sources?.length
      ? product.sources
      : [
          {
            provider: 'manual',
            externalId: product?.id || decision.productId,
            url: purchaseLinks?.official,
            imageUrl,
            rawName: name,
            fetchedAt: now,
          },
        ],
    confidence: 0,
    isVerified: decision.status === 'approved',
    createdAt: product?.createdAt || now,
    updatedAt: now,
  };
  next.searchKeywords = buildSearchKeywords(next);
  next.confidence = Math.max(calculateConfidence(next), decision.status === 'approved' ? 70 : 40);
  return next;
}

function mergePurchaseLinks(
  existing: ProductMaster['purchaseLinks'],
  incoming: ProductMaster['purchaseLinks'],
): ProductMaster['purchaseLinks'] {
  if (!incoming) return existing;
  return {
    amazon: linkValue(existing, incoming, 'amazon'),
    rakuten: linkValue(existing, incoming, 'rakuten'),
    yahoo: linkValue(existing, incoming, 'yahoo'),
    official: linkValue(existing, incoming, 'official'),
  };
}

function linkValue(
  existing: ProductMaster['purchaseLinks'],
  incoming: ProductMaster['purchaseLinks'],
  provider: keyof NonNullable<ProductMaster['purchaseLinks']>,
): string | undefined {
  if (!incoming || !Object.prototype.hasOwnProperty.call(incoming, provider)) {
    return existing?.[provider];
  }
  return normalizeUrl(incoming[provider]);
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//.test(trimmed)) return undefined;
  return trimmed;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeDigits(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '');
  return digits || undefined;
}

function isProductCategory(value: unknown): value is ProductCategory {
  return (
    value === 'dry_food' ||
    value === 'wet_food' ||
    value === 'treat' ||
    value === 'cat_litter' ||
    value === 'toilet_sheet' ||
    value === 'supplement' ||
    value === 'medicine' ||
    value === 'care' ||
    value === 'other'
  );
}

function isProductUnit(value: unknown): value is ProductUnit {
  return value === 'g' || value === 'kg' || value === 'ml' || value === 'L' || value === 'piece' || value === 'bag';
}

function seedProductIdFromProductMasterId(productMasterId: string): string | undefined {
  const prefix = 'pm-seed-';
  return productMasterId.startsWith(prefix) ? productMasterId.slice(prefix.length) : undefined;
}

async function removeSeedProductsByIds(productIds: string[]): Promise<void> {
  const ids = new Set(productIds);
  if (ids.size === 0) return;

  const csv = await readFile(seedCsvPath, 'utf8');
  const { header, rows } = parseCsv(csv);
  const nextRows = rows.filter((row) => !ids.has(row.product_id));
  const removedCount = rows.length - nextRows.length;
  if (removedCount === 0) return;

  await writeFile(seedCsvPath, stringifyCsv(header, nextRows), 'utf8');
  console.log(`[review:apply] removed seed csv rows: ${removedCount}`);
}

async function updateSeedProductNames(nameByProductId: Map<string, string>): Promise<void> {
  if (nameByProductId.size === 0) return;

  const csv = await readFile(seedCsvPath, 'utf8');
  const { header, rows } = parseCsv(csv);
  let updatedCount = 0;
  const nextRows = rows.map((row) => {
    const name = nameByProductId.get(row.product_id);
    if (!name || row.product_name === name) return row;
    updatedCount += 1;
    return { ...row, product_name: name };
  });
  if (updatedCount === 0) return;

  await writeFile(seedCsvPath, stringifyCsv(header, nextRows), 'utf8');
  console.log(`[review:apply] updated seed csv product names: ${updatedCount}`);
}

function parseCsv(csv: string): { header: string[]; rows: Record<string, string>[] } {
  const parsedRows = parseCsvRows(csv.replace(/^\uFEFF/, '')).filter((row) =>
    row.some((value) => value.trim().length > 0),
  );
  const [header = [], ...body] = parsedRows;
  return {
    header,
    rows: body.map((row) =>
      Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ''])),
    ),
  };
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

function stringifyCsv(header: string[], rows: Record<string, string>[]): string {
  const lines = [
    header.map(escapeCsvValue).join(','),
    ...rows.map((row) => header.map((key) => escapeCsvValue(row[key] ?? '')).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

function escapeCsvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

void main();
