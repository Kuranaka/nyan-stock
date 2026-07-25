import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadProductSearchQueries, parseCsv } from '../petCatalog/csv.js';
import { loadNormalizationAliases } from '../petCatalog/normalizationAliases.js';
import {
  CatalogBrandRow,
  CatalogCategoryRow,
  CatalogSubcategoryRow,
  openPetCatalogRepository,
} from '../petCatalog/repository.js';

async function main(): Promise<void> {
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required.');
  const seedDirectory = path.join(config.repositoryRoot, 'services/product-importer/data/seed');
  const petMasterDirectory = path.join(seedDirectory, 'pet-master');

  try {
    await repository.seedReferenceData();

    const brandRows = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_brands_seed.csv'), 'utf8'));
    const brands = brandRows.map<CatalogBrandRow>((row) => ({
      id: row.brand_id,
      nameJa: row.brand_name_ja,
      nameEn: row.brand_name_en || undefined,
      manufacturer: row.manufacturer || undefined,
      normalizedName: normalizeMasterName(row.brand_name_ja),
    }));
    for (const brand of brands) await repository.upsertBrand(brand);

    const petCategories = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_categories_seed.csv'), 'utf8'));
    const catCategories = parseCsv(await readFile(path.join(seedDirectory, 'cat_categories_seed.csv'), 'utf8'));
    const categories: CatalogCategoryRow[] = [
      ...petCategories.map((row, index) => ({
        id: row.category_id,
        nameJa: row.category_name_ja,
        nameEn: row.category_name_en || row.category_id,
        sortOrder: index + 100,
        enabled: true,
      })),
      ...catCategories.map((row, index) => ({
        id: row.category_id,
        nameJa: row.category_name,
        nameEn: row.category_id,
        sortOrder: Number(row.display_order) || index + 1,
        enabled: true,
      })),
    ];
    for (const category of uniqueById(categories)) await repository.upsertCategory(category);

    const petSubcategories = parseCsv(await readFile(path.join(petMasterDirectory, 'pet_subcategories_seed.csv'), 'utf8'));
    const catSubcategories = parseCsv(await readFile(path.join(seedDirectory, 'cat_subcategories_seed.csv'), 'utf8'));
    const subcategories: CatalogSubcategoryRow[] = [
      ...petSubcategories.map((row, index) => ({
        id: row.subcategory_id,
        categoryId: row.category_id,
        nameJa: row.subcategory_name_ja,
        nameEn: row.subcategory_name_en || row.subcategory_id,
        sortOrder: index + 100,
        enabled: true,
      })),
      ...catSubcategories.map((row, index) => ({
        id: row.subcategory_id,
        categoryId: row.category_id,
        nameJa: row.subcategory_name,
        nameEn: row.subcategory_id,
        sortOrder: Number(row.display_order) || index + 1,
        enabled: true,
      })),
    ];
    for (const subcategory of uniqueBy(subcategories, (row) => `${row.categoryId}|${row.id}`)) {
      await repository.upsertSubcategory(subcategory);
    }

    const queries = await loadProductSearchQueries(path.join(petMasterDirectory, 'product_search_queries.csv'));
    for (const query of queries) await repository.upsertSearchQuery(query);
    const aliases = await loadNormalizationAliases(path.join(petMasterDirectory, 'normalization_aliases_seed.csv'));
    await repository.upsertNormalizationAliases(aliases);

    console.log(
      `[pet-catalog:seed] groups/species seeded brands=${brands.length} categories=${categories.length} ` +
        `subcategories=${subcategories.length} queries=${queries.length} aliases=${aliases.length}`,
    );
  } finally {
    await repository.close();
  }
}

function normalizeMasterName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　\-_/・,，.。()（）[\]【】'"“”]/g, '');
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return uniqueBy(rows, (row) => row.id);
}

function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (!byId.has(value)) byId.set(value, row);
  }
  return [...byId.values()];
}

void main().catch((error) => {
  console.error('[pet-catalog:seed] failed:', error);
  process.exitCode = 1;
});
