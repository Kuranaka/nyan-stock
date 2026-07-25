import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadProductSearchQueries, parseCsv } from '../petCatalog/csv.js';
import { runPetCatalogQualityChecks, runProductSearchQueryQualityChecks } from '../petCatalog/quality.js';
import { openPetCatalogRepository } from '../petCatalog/repository.js';
import { CatalogQualitySnapshot, QualityRow } from '../petCatalog/types.js';

async function main(): Promise<void> {
  const inputPath = readOption('--input=');
  const outputPath = path.resolve(
    readOption('--out=') ??
      path.join(config.repositoryRoot, 'services/product-importer/data/generated/petCatalog.quality.json'),
  );
  const snapshot = inputPath ? await loadPreview(path.resolve(inputPath)) : await loadDatabaseSnapshot();
  const { queries, categoryPairs } = await loadSearchQueryMaster();
  const findings = [
    ...runPetCatalogQualityChecks(snapshot),
    ...runProductSearchQueryQualityChecks(queries, categoryPairs),
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      rawListings: snapshot.listings.length,
      candidates: snapshot.candidates.length,
      products: snapshot.products.length,
      productVariants: snapshot.variants.length,
      productIdentityKeys: snapshot.identityKeys.length,
      productRetailerListings: snapshot.productListings.length,
      reviewQueue: snapshot.reviewQueue.length,
      searchQueries: queries.length,
    },
    errorCount: findings.filter((item) => item.severity === 'error').reduce((sum, item) => sum + item.ids.length, 0),
    warningCount: findings.filter((item) => item.severity === 'warning').reduce((sum, item) => sum + item.ids.length, 0),
    findings,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[pet-catalog:quality] errors=${report.errorCount} warnings=${report.warningCount} report=${outputPath}`);
  if (report.errorCount > 0) process.exitCode = 1;
}

async function loadSearchQueryMaster(): Promise<{
  queries: Awaited<ReturnType<typeof loadProductSearchQueries>>;
  categoryPairs: Set<string>;
}> {
  const seedDirectory = path.join(config.repositoryRoot, 'services/product-importer/data/seed');
  const petMasterDirectory = path.join(seedDirectory, 'pet-master');
  const queries = await loadProductSearchQueries(path.join(petMasterDirectory, 'product_search_queries.csv'));
  const petSubcategories = parseCsv(
    await readFile(path.join(petMasterDirectory, 'pet_subcategories_seed.csv'), 'utf8'),
  );
  const catSubcategories = parseCsv(await readFile(path.join(seedDirectory, 'cat_subcategories_seed.csv'), 'utf8'));
  const categoryPairs = new Set(
    [...petSubcategories, ...catSubcategories].map((row) => `${row.category_id}|${row.subcategory_id}`),
  );
  return { queries, categoryPairs };
}

async function loadDatabaseSnapshot(): Promise<CatalogQualitySnapshot> {
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required unless --input is used.');
  try {
    return await repository.loadQualitySnapshot();
  } finally {
    await repository.close();
  }
}

async function loadPreview(filePath: string): Promise<CatalogQualitySnapshot> {
  const value = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  return {
    listings: rows(value.retailerListingsRaw),
    candidates: rows(value.productCandidates),
    products: rows(value.products),
    variants: rows(value.productVariants),
    identityKeys: rows(value.productIdentityKeys),
    productListings: rows(value.productRetailerListings),
    reviewQueue: rows(value.productReviewQueue),
  };
}

function rows(value: unknown): QualityRow[] {
  return Array.isArray(value) ? (value as QualityRow[]) : [];
}

function readOption(prefix: string): string | undefined {
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

void main().catch((error) => {
  console.error('[pet-catalog:quality] failed:', error);
  process.exitCode = 1;
});
