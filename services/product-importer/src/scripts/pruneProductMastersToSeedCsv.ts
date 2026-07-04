import { readFile, writeFile } from 'node:fs/promises';

import { config } from '../config.js';
import { deleteProductMastersByIds, loadProductMasters } from '../repositories/productRepository.js';
import { loadSeedProductSeries } from '../seedProducts.js';
import { ProductMaster } from '../types.js';

export async function pruneProductMastersToSeedCsv(dryRun = process.argv.includes('--dry-run')): Promise<void> {
  const localJson = process.argv.includes('--local-json');
  const [seedProducts, products] = await Promise.all([
    loadSeedProductSeries(),
    localJson ? loadLocalJsonProductMasters() : loadProductMasters(),
  ]);
  const activeSeedProductIds = new Set(seedProducts.map((seed) => seed.productId));
  const removableProducts = products.filter((product) => !hasSeedSource(product, activeSeedProductIds));
  const keepProducts = products.filter((product) => hasSeedSource(product, activeSeedProductIds));

  console.log(
    [
      `[prune:seed] seed=${activeSeedProductIds.size}`,
      `existing=${products.length}`,
      `keep=${keepProducts.length}`,
      `delete=${removableProducts.length}`,
      `dryRun=${dryRun}`,
      `target=${localJson ? 'local-json' : 'repository'}`,
    ].join(' '),
  );

  removableProducts.slice(0, 20).forEach((product) => {
    console.log(`[prune:seed] delete candidate: ${product.id} ${product.name}`);
  });
  if (removableProducts.length > 20) {
    console.log(`[prune:seed] ...and ${removableProducts.length - 20} more`);
  }

  if (dryRun) return;

  if (localJson) {
    await writeFile(config.outputJsonPath, `${JSON.stringify(keepProducts, null, 2)}\n`, 'utf8');
    console.log(`[prune:seed] wrote local json: ${config.outputJsonPath}`);
    return;
  }

  await deleteProductMastersByIds(removableProducts.map((product) => product.id));
  console.log(`[prune:seed] deleted=${removableProducts.length}`);
}

async function loadLocalJsonProductMasters(): Promise<ProductMaster[]> {
  return JSON.parse(await readFile(config.outputJsonPath, 'utf8')) as ProductMaster[];
}

function hasSeedSource(product: ProductMaster, seedProductIds: Set<string>): boolean {
  return product.sources.some((source) => source.provider === 'official' && Boolean(source.externalId && seedProductIds.has(source.externalId)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void pruneProductMastersToSeedCsv();
}
