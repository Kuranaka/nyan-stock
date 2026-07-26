import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { buildPetProductMasters } from '../petCatalog/petProductMaster.js';
import { openPetCatalogRepository } from '../petCatalog/repository.js';
import { PET_GROUPS, PetGroup } from '../petCatalog/types.js';

type Options = {
  dryRun: boolean;
  includeLegacyVariants: boolean;
  keepDraftProducts: boolean;
  petGroup?: PetGroup;
  limit?: number;
  outputPath: string;
  concurrency: number;
};

const defaultWriteConcurrency = 4;
const maxWriteConcurrency = 16;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required.');
  const writeConcurrency = repository.supportsConcurrentWrites ? options.concurrency : 1;

  try {
    const snapshot = await repository.loadPetProductMasterSnapshot({ petGroup: options.petGroup });
    const result = buildPetProductMasters(snapshot, options);
    assertUnique(result.masters.map((row) => row.id), 'pet product master id');
    assertUnique(result.masters.map((row) => row.variantId), 'variant id');
    if (result.invalidVariantIds.length > 0) {
      throw new Error(
        `[pet-product-master] invalid variants=${result.invalidVariantIds.length}: ` +
          result.invalidVariantIds.slice(0, 10).join(', '),
      );
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      filters: {
        petGroup: options.petGroup ?? null,
        includeLegacyVariants: options.includeLegacyVariants,
        keepDraftProducts: options.keepDraftProducts,
        limit: options.limit ?? null,
      },
      totals: {
        masters: result.masters.length,
        draft: result.masters.filter((row) => row.status === 'draft').length,
        published: result.masters.filter((row) => row.status === 'published').length,
        retired: result.masters.filter((row) => row.status === 'retired').length,
        skippedLegacyVariants: result.skippedLegacyVariantIds.length,
      },
      items: result.masters,
    };
    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    if (!options.dryRun) await repository.upsertPetProductMasters(result.masters, writeConcurrency);

    console.log(
      `[pet-product-master] masters=${payload.totals.masters} draft=${payload.totals.draft} ` +
        `published=${payload.totals.published} retired=${payload.totals.retired} ` +
        `skippedLegacy=${payload.totals.skippedLegacyVariants} dryRun=${options.dryRun} ` +
        `writeConcurrency=${options.dryRun ? 0 : writeConcurrency} preview=${options.outputPath}`,
    );
  } finally {
    await repository.close();
  }
}

function parseOptions(args: string[]): Options {
  let dryRun = false;
  let includeLegacyVariants = false;
  let keepDraftProducts = false;
  let petGroup: PetGroup | undefined;
  let limit: number | undefined;
  let concurrency = defaultWriteConcurrency;
  let outputPath = path.join(
    config.repositoryRoot,
    'services/product-importer/data/generated/petProductMaster.preview.json',
  );
  for (const argument of args) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument === '--include-legacy-variants') includeLegacyVariants = true;
    else if (argument === '--draft') keepDraftProducts = true;
    else if (argument.startsWith('--pet-group=')) {
      const value = argument.slice('--pet-group='.length);
      if (!PET_GROUPS.includes(value as PetGroup)) throw new Error(`Unknown pet group: ${value}`);
      petGroup = value as PetGroup;
    } else if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid --limit: ${argument}`);
      limit = value;
    } else if (argument.startsWith('--out=')) {
      outputPath = path.resolve(argument.slice('--out='.length));
    } else if (argument.startsWith('--concurrency=')) {
      concurrency = Number(argument.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > maxWriteConcurrency) {
        throw new Error(`--concurrency must be an integer between 1 and ${maxWriteConcurrency}.`);
      }
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return { dryRun, includeLegacyVariants, keepDraftProducts, petGroup, limit, outputPath, concurrency };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  if (duplicates.size > 0) throw new Error(`Duplicate ${label}: ${[...duplicates].slice(0, 10).join(', ')}`);
}

void main().catch((error) => {
  console.error('[pet-product-master] failed:', error);
  process.exitCode = 1;
});
