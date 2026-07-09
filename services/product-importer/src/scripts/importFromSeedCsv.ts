import { convertRawProductToProductMaster } from '../normalizers/normalizeProduct.js';
import { searchRakutenItemsByKeyword } from '../providers/rakuten.js';
import { searchYahooItemsByKeyword } from '../providers/yahoo.js';
import {
  deleteProductMastersByIds,
  loadProductMasters,
  upsertProductMasters,
} from '../repositories/productRepository.js';
import {
  buildSeedSearchKeyword,
  createSeedProductMaster,
  EnrichmentCandidate,
  loadSeedProductSeries,
  mergeSeedProductWithCandidates,
  scoreEnrichmentCandidate,
} from '../seedProducts.js';
import { ProductMaster } from '../types.js';

type ImportOptions = {
  limit?: number;
  offset?: number;
  batchSize: number;
  dryRun: boolean;
  provider: 'both' | 'rakuten' | 'yahoo';
  skuMigration: boolean;
};

export async function importFromSeedCsv(options = parseOptions(process.argv.slice(2))): Promise<void> {
  const seedProducts = await loadSeedProductSeries();
  const existingProducts = options.dryRun ? [] : await loadProductMasters();
  const existingById = new Map(existingProducts.map((product) => [product.id, product]));
  const targets = seedProducts.slice(
    options.offset ?? 0,
    options.limit !== undefined ? (options.offset ?? 0) + options.limit : undefined,
  );
  let pendingProducts: ProductMaster[] = [];
  let normalizedCount = 0;

  console.log(
    `[import:seed] seed=${seedProducts.length} target=${targets.length} dryRun=${options.dryRun} provider=${options.provider}`,
  );

  for (const [index, seed] of targets.entries()) {
    const keyword = buildSeedSearchKeyword(seed);
    const requiredNameParts = [seed.brandName, seed.productName].filter((value) => value.trim().length > 0);
    console.log(`[import:seed] ${index + 1}/${targets.length} ${seed.productId}: ${keyword}`);

    const rakuten =
      options.provider === 'both' || options.provider === 'rakuten'
        ? await searchRakutenItemsByKeyword(keyword, { requiredNameParts })
        : [];
    const yahoo =
      options.provider === 'both' || options.provider === 'yahoo'
        ? await searchYahooItemsByKeyword(keyword, { requiredNameParts })
        : [];
    const rawCandidates = [...rakuten, ...yahoo];
    const enrichmentCandidates: EnrichmentCandidate[] = rawCandidates.map((raw) => {
      const product = convertRawProductToProductMaster(raw);
      return {
        product,
        score: scoreEnrichmentCandidate(seed, raw, product),
        price: raw.price,
      };
    });
    const seedProduct = createSeedProductMaster(seed);
    const enriched = mergeSeedProductWithCandidates(seedProduct, enrichmentCandidates);
    const reviewedSafeProduct = mergeImportedProductWithExistingReview(enriched, existingById.get(enriched.id));
    pendingProducts.push(reviewedSafeProduct);
    normalizedCount += 1;

    const best = enrichmentCandidates.sort((a, b) => b.score - a.score)[0];
    console.log(
      [
        `[import:seed] candidates rakuten=${rakuten.length} yahoo=${yahoo.length}`,
        `bestScore=${best?.score ?? 0}`,
        `jan=${reviewedSafeProduct.janCode ? 'yes' : 'no'}`,
        `image=${reviewedSafeProduct.imageUrl ? 'yes' : 'no'}`,
        `links=${Object.keys(reviewedSafeProduct.purchaseLinks ?? {}).filter((key) => Boolean(reviewedSafeProduct.purchaseLinks?.[key as keyof typeof reviewedSafeProduct.purchaseLinks])).join('/') || 'none'}`,
        `reviewPreserved=${existingById.has(enriched.id) ? 'yes' : 'no'}`,
      ].join(' '),
    );

    if (!options.dryRun && pendingProducts.length >= options.batchSize) {
      const saved = await upsertProductMasters(pendingProducts, { dedupe: false });
      console.log(`[import:seed] batch saved=${pendingProducts.length} totalSaved=${saved.length}`);
      pendingProducts = [];
    }
  }

  if (options.dryRun) {
    await deleteParentSeriesProductsForSkuMigration(seedProducts, targets, options);
    console.log(`[import:seed] dry-run completed. normalized=${normalizedCount}`);
    return;
  }

  if (pendingProducts.length > 0) {
    const saved = await upsertProductMasters(pendingProducts, { dedupe: false });
    console.log(`[import:seed] batch saved=${pendingProducts.length} totalSaved=${saved.length}`);
  }
  await deleteParentSeriesProductsForSkuMigration(seedProducts, targets, options);
  console.log(`[import:seed] normalized=${normalizedCount}`);
}

async function deleteParentSeriesProductsForSkuMigration(
  seedProducts: Awaited<ReturnType<typeof loadSeedProductSeries>>,
  targets: Awaited<ReturnType<typeof loadSeedProductSeries>>,
  options: ImportOptions,
): Promise<void> {
  if (!options.skuMigration) return;

  const parentProductIds = parentProductIdsForSkuMigration(seedProducts);
  const targetParentProductIds = parentProductIdsForSkuMigration(targets);
  const parentMasterIds = Array.from(parentProductIds).map((productId) => `pm-seed-${productId}`);
  const targetParentMasterIds = Array.from(targetParentProductIds).map((productId) => `pm-seed-${productId}`);
  const isPartialImport = options.limit !== undefined || options.offset !== undefined;

  console.log(
    `[import:seed] skuMigration parentSeries candidates=${parentMasterIds.length} targetCandidates=${targetParentMasterIds.length}`,
  );
  if (parentMasterIds.length > 0) {
    console.log(`[import:seed] skuMigration parentSeries sample=${parentMasterIds.slice(0, 10).join(', ')}`);
  }

  if (options.dryRun) {
    console.log('[import:seed] skuMigration dry-run: parent series products were not deleted.');
    return;
  }

  if (isPartialImport) {
    console.warn('[import:seed] skuMigration parent deletion skipped because --limit or --offset was used.');
    return;
  }

  await deleteProductMastersByIds(parentMasterIds);
  console.log(`[import:seed] skuMigration deleted parentSeries=${parentMasterIds.length}`);
}

function parentProductIdsForSkuMigration(seedProducts: Awaited<ReturnType<typeof loadSeedProductSeries>>): Set<string> {
  const seedProductIds = new Set(seedProducts.map((seed) => seed.productId));
  return new Set(
    seedProducts
      .map((seed) => seed.parentProductId)
      .filter((parentProductId): parentProductId is string => Boolean(parentProductId && !seedProductIds.has(parentProductId))),
  );
}

function mergeImportedProductWithExistingReview(
  incoming: ProductMaster,
  existing: ProductMaster | undefined,
): ProductMaster {
  if (!existing) return incoming;

  const purchaseLinks = {
    amazon: existing.purchaseLinks?.amazon ?? incoming.purchaseLinks?.amazon,
    rakuten: existing.purchaseLinks?.rakuten ?? incoming.purchaseLinks?.rakuten,
    yahoo: existing.purchaseLinks?.yahoo ?? incoming.purchaseLinks?.yahoo,
    official: existing.purchaseLinks?.official ?? incoming.purchaseLinks?.official,
  };
  const imageUrl = existing.imageUrl ?? incoming.imageUrl;
  const packageImageUrls = Array.from(
    new Set(
      [
        imageUrl,
        incoming.imageUrl,
        ...(incoming.packageImageUrls ?? []),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    ...incoming,
    category: existing.category,
    imageUrl,
    packageImageUrls,
    purchaseLinks,
    asin: existing.asin ?? incoming.asin,
    isVerified: existing.isVerified || incoming.isVerified,
    confidence: existing.isVerified ? Math.max(existing.confidence, incoming.confidence) : incoming.confidence,
  };
}

function parseOptions(args: string[]): ImportOptions {
  const options: ImportOptions = {
    batchSize: 25,
    dryRun: false,
    provider: 'both',
    skuMigration: false,
  };

  args.forEach((arg) => {
    if (arg === '--dry-run') {
      options.dryRun = true;
      return;
    }
    if (arg === '--sku-migration') {
      options.skuMigration = true;
      return;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length));
      return;
    }
    if (arg.startsWith('--offset=')) {
      options.offset = Number(arg.slice('--offset='.length));
      return;
    }
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
      return;
    }
    if (arg.startsWith('--provider=')) {
      const provider = arg.slice('--provider='.length);
      if (provider === 'both' || provider === 'rakuten' || provider === 'yahoo') {
        options.provider = provider;
      }
    }
  });

  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void importFromSeedCsv();
}
