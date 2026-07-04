import { convertRawProductToProductMaster } from '../normalizers/normalizeProduct.js';
import { searchRakutenItemsByKeyword } from '../providers/rakuten.js';
import { searchYahooItemsByKeyword } from '../providers/yahoo.js';
import { upsertProductMasters } from '../repositories/productRepository.js';
import { RawProduct } from '../types.js';

const keywords = [
  '猫 ドライフード',
  '猫 ウェットフード',
  '猫 おやつ',
  '猫 ちゅーる',
  '猫砂',
  '猫 システムトイレ 砂',
  '猫 トイレシート',
  '猫 歯みがき',
  '猫 サプリ',
];

export async function importProducts(targetKeywords = keywords): Promise<void> {
  const rawProducts: RawProduct[] = [];
  for (const keyword of targetKeywords) {
    console.log(`[import] keyword: ${keyword}`);
    const rakuten = await searchRakutenItemsByKeyword(keyword);
    const yahoo = await searchYahooItemsByKeyword(keyword);
    console.log(`[import] fetched rakuten=${rakuten.length} yahoo=${yahoo.length}`);
    rawProducts.push(...rakuten, ...yahoo);
  }

  const products = rawProducts.map(convertRawProductToProductMaster);
  const saved = await upsertProductMasters(products);
  console.log(`[import] raw=${rawProducts.length} normalized=${products.length} saved=${saved.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void importProducts();
}
