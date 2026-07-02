import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { dedupeProducts } from '../scripts/dedupeProducts.js';
import { ProductMaster } from '../types.js';

export async function loadProductMasters(): Promise<ProductMaster[]> {
  if (config.databaseUrl) {
    console.warn('[repository] DATABASE_URL is set, but DB persistence is not implemented yet. Using JSON fallback.');
  }
  try {
    const raw = await readFile(config.outputJsonPath, 'utf8');
    return JSON.parse(raw) as ProductMaster[];
  } catch {
    return [];
  }
}

export async function saveProductMasters(products: ProductMaster[]): Promise<void> {
  if (config.databaseUrl) {
    console.warn('[repository] DATABASE_URL is set, but DB persistence is not implemented yet. Using JSON fallback.');
  }
  await mkdir(path.dirname(config.outputJsonPath), { recursive: true });
  await writeFile(config.outputJsonPath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
}

export async function upsertProductMasters(incoming: ProductMaster[]): Promise<ProductMaster[]> {
  const existing = await loadProductMasters();
  const next = dedupeProducts([...existing, ...incoming]);
  await saveProductMasters(next);
  return next;
}
