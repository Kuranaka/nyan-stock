import { importProducts } from './importProducts.js';

const keywords = process.argv.slice(2);

if (keywords.length === 0) {
  console.error('Usage: npm run import:keyword -- "猫 ドライフード"');
  process.exitCode = 1;
} else {
  void importProducts(keywords);
}
