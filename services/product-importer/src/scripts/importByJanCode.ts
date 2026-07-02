import { convertRawProductToProductMaster } from '../normalizers/normalizeProduct.js';
import { searchGs1ByJanCode } from '../providers/gs1.js';
import { searchYahooItemsByJanCode } from '../providers/yahoo.js';
import { upsertProductMasters } from '../repositories/productRepository.js';

const janCode = process.argv[2]?.replace(/\D/g, '');

async function main() {
  if (!janCode) {
    console.error('Usage: npm run import:jan -- 4901133719203');
    process.exitCode = 1;
    return;
  }
  const rawProducts = [...(await searchYahooItemsByJanCode(janCode)), ...(await searchGs1ByJanCode(janCode))];
  const products = rawProducts.map(convertRawProductToProductMaster);
  const saved = await upsertProductMasters(products);
  console.log(`[import:jan] jan=${janCode} raw=${rawProducts.length} saved=${saved.length}`);
}

void main();
