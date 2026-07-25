import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadSelectedProductSearchQueries, parseQuerySelectionOptions } from '../petCatalog/catalogCli.js';
import { CatalogProviderName, collectRetailerListings } from '../petCatalog/providers.js';
import { openPetCatalogRepository } from '../petCatalog/repository.js';
import { RetailerListingInput, StoredRetailerListing } from '../petCatalog/types.js';

type CollectOptions = {
  providers: CatalogProviderName[];
  dryRun: boolean;
  outputPath: string;
};

async function main(): Promise<void> {
  const { selection, options } = parseOptions(process.argv.slice(2));
  const queries = await loadSelectedProductSearchQueries(selection);
  const repository = options.dryRun ? undefined : await openPetCatalogRepository();
  if (!options.dryRun && !repository) {
    throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required unless --dry-run is used.');
  }
  const preview: StoredRetailerListing[] = [];
  let rawCount = 0;

  try {
    if (repository) await repository.seedReferenceData();
    for (const [batchIndex, query] of queries.entries()) {
      const queryOffset = selection.offsetQueries + batchIndex;
      if (repository) await repository.upsertSearchQuery(query);
      console.log(`[pet-catalog:collect] offset=${queryOffset} query=${query.id} keyword="${query.keyword}"`);
      const listings = await collectRetailerListings(query, options.providers);
      rawCount += listings.length;
      for (const listing of listings) {
        if (repository) await repository.upsertRawListing(listing);
        else preview.push(localStoredListing(listing));
      }
      if (repository && listings.length > 0) {
        await repository.markSearchCompleted(query.id, new Date().toISOString());
      }
      console.log(`[pet-catalog:collect] offset=${queryOffset} query=${query.id} raw=${listings.length}`);
    }
  } finally {
    await repository?.close();
  }

  if (options.dryRun) {
    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(
      options.outputPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), queries, retailerListingsRaw: preview }, null, 2)}\n`,
      'utf8',
    );
    console.log(`[pet-catalog:collect] preview=${options.outputPath}`);
  }
  console.log(`[pet-catalog:collect] completed queries=${queries.length} raw=${rawCount}`);
}

function parseOptions(args: string[]): {
  selection: ReturnType<typeof parseQuerySelectionOptions>['selection'];
  options: CollectOptions;
} {
  const { selection, remaining } = parseQuerySelectionOptions(args);
  const options: CollectOptions = {
    providers: ['rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping'],
    dryRun: false,
    outputPath: config.petCatalogOutputPath,
  };
  for (const argument of remaining) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument.startsWith('--providers=')) {
      options.providers = argument.slice('--providers='.length).split(',').map((value) => value.trim()).filter(isProvider);
      if (options.providers.length === 0) throw new Error('--providers did not contain a supported provider.');
    } else if (argument.startsWith('--out=')) options.outputPath = path.resolve(argument.slice('--out='.length));
    else if (argument === '--reuse-raw' || argument === '--auto-merge-high-confidence') {
      throw new Error(`${argument} is no longer a collect option. Use process:pet-catalog or merge:pet-catalog.`);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return { selection, options };
}

function localStoredListing(listing: RetailerListingInput): StoredRetailerListing {
  return {
    ...listing,
    id: `preview-raw-${listing.source}-${listing.sourceItemId}-${listing.searchQueryId}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
  };
}

function isProvider(value: string): value is CatalogProviderName {
  return ['rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping'].includes(value);
}

void main().catch((error) => {
  console.error('[pet-catalog:collect] failed:', error);
  process.exitCode = 1;
});
