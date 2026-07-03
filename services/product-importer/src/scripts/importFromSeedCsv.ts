import { convertRawProductToProductMaster } from '../normalizers/normalizeProduct.js';
import { searchRakutenItemsByKeyword } from '../providers/rakuten.js';
import { searchYahooItemsByKeyword } from '../providers/yahoo.js';
import { upsertProductMasters } from '../repositories/productRepository.js';
import {
  buildSeedSearchKeyword,
  createSeedProductMaster,
  EnrichmentCandidate,
  loadSeedProductSeries,
  mergeSeedProductWithCandidates,
  scoreEnrichmentCandidate,
} from '../seedProducts.js';

type ImportOptions = {
  limit?: number;
  offset?: number;
  batchSize: number;
  dryRun: boolean;
  provider: 'both' | 'rakuten' | 'yahoo';
};

export async function importFromSeedCsv(options = parseOptions(process.argv.slice(2))): Promise<void> {
  const seedProducts = await loadSeedProductSeries();
  const targets = seedProducts.slice(options.offset ?? 0, options.limit ? (options.offset ?? 0) + options.limit : undefined);
  let pendingProducts = [];
  let normalizedCount = 0;

  console.log(
    `[import:seed] seed=${seedProducts.length} target=${targets.length} dryRun=${options.dryRun} provider=${options.provider}`,
  );

  for (const [index, seed] of targets.entries()) {
    const keyword = buildSeedSearchKeyword(seed);
    console.log(`[import:seed] ${index + 1}/${targets.length} ${seed.productId}: ${keyword}`);

    const [rakuten, yahoo] = await Promise.all([
      options.provider === 'both' || options.provider === 'rakuten' ? searchRakutenItemsByKeyword(keyword) : [],
      options.provider === 'both' || options.provider === 'yahoo' ? searchYahooItemsByKeyword(keyword) : [],
    ]);
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
    pendingProducts.push(enriched);
    normalizedCount += 1;

    const best = enrichmentCandidates.sort((a, b) => b.score - a.score)[0];
    console.log(
      [
        `[import:seed] candidates rakuten=${rakuten.length} yahoo=${yahoo.length}`,
        `bestScore=${best?.score ?? 0}`,
        `jan=${enriched.janCode ? 'yes' : 'no'}`,
        `image=${enriched.imageUrl ? 'yes' : 'no'}`,
        `links=${Object.keys(enriched.purchaseLinks ?? {}).filter((key) => Boolean(enriched.purchaseLinks?.[key as keyof typeof enriched.purchaseLinks])).join('/') || 'none'}`,
      ].join(' '),
    );

    if (!options.dryRun && pendingProducts.length >= options.batchSize) {
      const saved = await upsertProductMasters(pendingProducts);
      console.log(`[import:seed] batch saved=${pendingProducts.length} totalSaved=${saved.length}`);
      pendingProducts = [];
    }
  }

  if (options.dryRun) {
    console.log(`[import:seed] dry-run completed. normalized=${normalizedCount}`);
    return;
  }

  if (pendingProducts.length > 0) {
    const saved = await upsertProductMasters(pendingProducts);
    console.log(`[import:seed] batch saved=${pendingProducts.length} totalSaved=${saved.length}`);
  }
  console.log(`[import:seed] normalized=${normalizedCount}`);
}

function parseOptions(args: string[]): ImportOptions {
  const options: ImportOptions = {
    batchSize: 25,
    dryRun: false,
    provider: 'both',
  };

  args.forEach((arg) => {
    if (arg === '--dry-run') {
      options.dryRun = true;
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
