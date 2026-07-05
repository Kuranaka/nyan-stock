import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadProductMasters, saveProductMasters } from '../repositories/productRepository.js';
import { ProductMaster } from '../types.js';

type ReviewDecision = {
  productId: string;
  status?: 'approved' | 'needs_fix' | 'rejected';
  note?: string;
  imageUrl?: string;
  purchaseLinks?: ProductMaster['purchaseLinks'];
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

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const payload = JSON.parse(await readFile(options.reviewPath, 'utf8')) as ReviewPayload;
  const products = await loadProductMasters();
  const byId = new Map(products.map((product) => [product.id, product]));
  const now = new Date().toISOString();
  let appliedCount = 0;
  let missingCount = 0;

  payload.decisions.forEach((decision) => {
    const product = byId.get(decision.productId);
    if (!product) {
      missingCount += 1;
      console.warn(`[review:apply] missing product: ${decision.productId}`);
      return;
    }

    const next = applyDecision(product, decision, now);
    if (JSON.stringify(next) !== JSON.stringify(product)) {
      byId.set(product.id, next);
      appliedCount += 1;
    }
  });

  if (!options.dryRun) {
    await saveProductMasters(Array.from(byId.values()));
  }
  console.log(
    `[review:apply] applied=${appliedCount} missing=${missingCount} decisions=${payload.decisions.length} dryRun=${options.dryRun}`,
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
  const hasImagePatch = Object.prototype.hasOwnProperty.call(decision, 'imageUrl');
  const imageUrl = hasImagePatch ? normalizeUrl(decision.imageUrl) : product.imageUrl;
  const purchaseLinks = mergePurchaseLinks(product.purchaseLinks, decision.purchaseLinks);
  const packageImageUrls = imageUrl
    ? Array.from(new Set([imageUrl, ...(product.packageImageUrls ?? [])]))
    : product.packageImageUrls;

  const next: ProductMaster = {
    ...product,
    imageUrl,
    packageImageUrls,
    purchaseLinks,
    isVerified:
      decision.status === 'approved'
        ? true
        : decision.status === 'rejected'
          ? false
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

void main();
