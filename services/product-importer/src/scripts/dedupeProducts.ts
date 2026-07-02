import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { mergeProductMasters } from '../normalizers/normalizeProduct.js';
import { ProductMaster } from '../types.js';

export function dedupeProducts(products: ProductMaster[]): ProductMaster[] {
  return products.reduce<ProductMaster[]>((deduped, product) => {
    const index = deduped.findIndex((existing) => isDuplicate(existing, product));
    if (index === -1) return [...deduped, product];
    const next = [...deduped];
    next[index] = mergeProductMasters(next[index], product);
    return next;
  }, []);
}

export function isDuplicate(a: ProductMaster, b: ProductMaster): boolean {
  if (a.janCode && b.janCode && a.janCode === b.janCode) return true;
  if (
    a.normalizedName === b.normalizedName &&
    a.amount === b.amount &&
    a.unit === b.unit &&
    (a.brand ?? '') === (b.brand ?? '')
  ) {
    return true;
  }
  return similarity(a.normalizedName, b.normalizedName) >= 0.88;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aChars = new Set([...a]);
  const bChars = new Set([...b]);
  const intersection = [...aChars].filter((char) => bChars.has(char)).length;
  const union = new Set([...aChars, ...bChars]).size;
  return union === 0 ? 0 : intersection / union;
}

async function main() {
  const raw = await readFile(config.outputJsonPath, 'utf8');
  const products = JSON.parse(raw) as ProductMaster[];
  const deduped = dedupeProducts(products);
  await mkdir(path.dirname(config.outputJsonPath), { recursive: true });
  await writeFile(config.outputJsonPath, `${JSON.stringify(deduped, null, 2)}\n`, 'utf8');
  console.log(`[dedupe] ${products.length} -> ${deduped.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
