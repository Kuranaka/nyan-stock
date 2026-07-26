import { forEachWithKeyedConcurrency } from '../petCatalog/boundedConcurrency.js';
import { loadSelectedProductSearchQueries, parseQuerySelectionOptions } from '../petCatalog/catalogCli.js';
import { buildProductIdentityKeys, openPetCatalogRepository } from '../petCatalog/repository.js';
import { ProductCandidate, StoredRetailerListing } from '../petCatalog/types.js';

const defaultMergeConcurrency = 4;
const maxMergeConcurrency = 16;

async function main(): Promise<void> {
  const { selection, dryRun, concurrency } = parseOptions(process.argv.slice(2));
  const queries = await loadSelectedProductSearchQueries(selection);
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required.');
  const effectiveConcurrency = dryRun || !repository.supportsConcurrentWrites ? 1 : concurrency;
  let eligibleCount = 0;
  let mergedCount = 0;
  console.log(`[pet-catalog:merge] write-concurrency=${effectiveConcurrency}`);

  try {
    for (const [batchIndex, query] of queries.entries()) {
      const queryOffset = selection.offsetQueries + batchIndex;
      const rows = await repository.loadMergeReadyCandidates(query.id);
      eligibleCount += rows.length;
      console.log(`[pet-catalog:merge] offset=${queryOffset} query=${query.id} eligible=${rows.length}`);
      if (dryRun) continue;
      await forEachWithKeyedConcurrency(
        rows,
        effectiveConcurrency,
        ({ candidate, listing }) => mergeConflictKeys(candidate, listing),
        async ({ candidate, listing }) => {
          await repository.mergeCandidate(candidate, listing);
          mergedCount += 1;
        },
      );
    }
  } finally {
    await repository.close();
  }
  console.log(
    `[pet-catalog:merge] completed queries=${queries.length} eligible=${eligibleCount} ` +
      `merged=${dryRun ? 0 : mergedCount} dryRun=${dryRun}`,
  );
}

function parseOptions(args: string[]): {
  selection: ReturnType<typeof parseQuerySelectionOptions>['selection'];
  dryRun: boolean;
  concurrency: number;
} {
  const { selection, remaining } = parseQuerySelectionOptions(args);
  let dryRun = false;
  let concurrency = defaultMergeConcurrency;
  for (const argument of remaining) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument.startsWith('--concurrency=')) {
      concurrency = Number(argument.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > maxMergeConcurrency) {
        throw new Error(`--concurrency must be an integer between 1 and ${maxMergeConcurrency}.`);
      }
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return { selection, dryRun, concurrency };
}

function mergeConflictKeys(candidate: ProductCandidate, listing: StoredRetailerListing): string[] {
  const keys = [`canonical:${candidate.canonicalKey}`];
  for (const identity of buildProductIdentityKeys(candidate, listing)) {
    keys.push(`identity:${identity.keyType}:${identity.namespace}:${identity.normalizedValue}`);
  }
  return keys;
}

void main().catch((error) => {
  console.error('[pet-catalog:merge] failed:', error);
  process.exitCode = 1;
});
