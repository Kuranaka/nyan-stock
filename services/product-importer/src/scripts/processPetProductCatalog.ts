import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { forEachWithConcurrency } from '../petCatalog/boundedConcurrency.js';
import { loadSelectedProductSearchQueries, parseQuerySelectionOptions } from '../petCatalog/catalogCli.js';
import { normalizeRetailerListing } from '../petCatalog/normalizeListing.js';
import { loadNormalizationAliases } from '../petCatalog/normalizationAliases.js';
import { openPetCatalogRepository } from '../petCatalog/repository.js';
import { ProductCandidate, ReviewIssue } from '../petCatalog/types.js';

type ProcessPreview = {
  generatedAt: string;
  retailerListingsRaw: Array<{ id: string; searchQueryId: string; rawTitle: string }>;
  productCandidates: ProductCandidate[];
  productReviewQueue: Array<ReviewIssue & { candidateId: string; rawListingId: string; confidence: number }>;
};

const defaultWriteConcurrency = 8;
const maxWriteConcurrency = 32;

async function main(): Promise<void> {
  const { selection, dryRun, outputPath, concurrency } = parseOptions(process.argv.slice(2));
  const queries = await loadSelectedProductSearchQueries(selection);
  const aliases = await loadNormalizationAliases(
    path.join(config.repositoryRoot, 'services/product-importer/data/seed/pet-master/normalization_aliases_seed.csv'),
  );
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required.');
  const preview: ProcessPreview = {
    generatedAt: new Date().toISOString(),
    retailerListingsRaw: [],
    productCandidates: [],
    productReviewQueue: [],
  };
  let rawCount = 0;
  let candidateCount = 0;
  console.log(`[pet-catalog:process] write-concurrency=${dryRun ? 1 : concurrency}`);

  try {
    for (const [batchIndex, query] of queries.entries()) {
      const queryOffset = selection.offsetQueries + batchIndex;
      const listings = await repository.loadRawListings(query.id);
      rawCount += listings.length;
      console.log(`[pet-catalog:process] offset=${queryOffset} query=${query.id} raw=${listings.length}`);
      const normalized = listings.map((listing) => ({
        listing,
        candidate: normalizeRetailerListing(listing, query, aliases),
      }));
      candidateCount += normalized.length;
      if (!dryRun) {
        await forEachWithConcurrency(normalized, concurrency, async ({ candidate, listing }) => {
          await repository.upsertCandidate(candidate);
          await repository.replaceReviewIssues(candidate, listing, candidate.issues);
        });
      } else {
        for (const { candidate, listing } of normalized) {
          preview.retailerListingsRaw.push({ id: listing.id, searchQueryId: listing.searchQueryId, rawTitle: listing.rawTitle });
          preview.productCandidates.push(candidate);
          preview.productReviewQueue.push(...candidate.issues.map((issue) => ({
            ...issue,
            candidateId: candidate.id,
            rawListingId: listing.id,
            confidence: candidate.confidence,
          })));
        }
      }
    }
    if (!dryRun) {
      const exactMatches = await repository.resolveExactNameBrandMatches();
      console.log(`[pet-catalog:process] exact-name-brand-auto-approved=${exactMatches}`);
    }
  } finally {
    await repository.close();
  }

  if (dryRun) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(preview, null, 2)}\n`, 'utf8');
    console.log(`[pet-catalog:process] preview=${outputPath}`);
  }
  console.log(`[pet-catalog:process] completed queries=${queries.length} raw=${rawCount} candidates=${candidateCount}`);
}

function parseOptions(args: string[]): {
  selection: ReturnType<typeof parseQuerySelectionOptions>['selection'];
  dryRun: boolean;
  outputPath: string;
  concurrency: number;
} {
  const { selection, remaining } = parseQuerySelectionOptions(args);
  let dryRun = false;
  let outputPath = config.petCatalogOutputPath;
  let concurrency = defaultWriteConcurrency;
  for (const argument of remaining) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument.startsWith('--out=')) outputPath = path.resolve(argument.slice('--out='.length));
    else if (argument.startsWith('--concurrency=')) {
      concurrency = Number(argument.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > maxWriteConcurrency) {
        throw new Error(`--concurrency must be an integer between 1 and ${maxWriteConcurrency}.`);
      }
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return { selection, dryRun, outputPath, concurrency };
}

void main().catch((error) => {
  console.error('[pet-catalog:process] failed:', error);
  process.exitCode = 1;
});
