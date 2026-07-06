import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadProductMasters } from '../repositories/productRepository.js';
import { ProductMaster } from '../types.js';

const defaultOutputPath = path.join(
  config.repositoryRoot,
  'services',
  'product-importer',
  'data',
  'generated',
  'productMaster.generated.csv',
);

const columns = [
  'id',
  'name',
  'normalized_name',
  'brand',
  'maker',
  'category',
  'description',
  'amount',
  'unit',
  'jan_code',
  'gtin',
  'asin',
  'rakuten_item_code',
  'yahoo_item_code',
  'image_url',
  'package_image_urls',
  'visual_keywords',
  'amazon_url',
  'rakuten_url',
  'yahoo_url',
  'official_url',
  'search_keywords',
  'source_providers',
  'source_urls',
  'is_verified',
  'created_at',
  'updated_at',
] as const;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const products = options.localJson ? await loadFromLocalJson() : await loadProductMasters();
  const csv = toCsv(products);

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${csv}\n`, 'utf8');
  console.log(`[export:csv] exported ${products.length} products to ${options.outputPath}`);
}

function parseOptions(args: string[]): { outputPath: string; localJson: boolean } {
  const outArg = args.find((arg) => arg.startsWith('--out='));
  return {
    outputPath: outArg ? path.resolve(outArg.slice('--out='.length)) : defaultOutputPath,
    localJson: args.includes('--local-json'),
  };
}

async function loadFromLocalJson(): Promise<ProductMaster[]> {
  const raw = await readFile(config.outputJsonPath, 'utf8');
  return JSON.parse(raw) as ProductMaster[];
}

function toCsv(products: ProductMaster[]): string {
  const rows = products.map((product) => columns.map((column) => csvEscape(valueForColumn(product, column))).join(','));
  return [columns.join(','), ...rows].join('\n');
}

function valueForColumn(product: ProductMaster, column: (typeof columns)[number]): string {
  switch (column) {
    case 'id':
      return product.id;
    case 'name':
      return product.name;
    case 'normalized_name':
      return product.normalizedName;
    case 'brand':
      return product.brand ?? '';
    case 'maker':
      return product.maker ?? '';
    case 'category':
      return product.category;
    case 'description':
      return product.description ?? '';
    case 'amount':
      return product.amount?.toString() ?? '';
    case 'unit':
      return product.unit ?? '';
    case 'jan_code':
      return product.janCode ?? '';
    case 'gtin':
      return product.gtin ?? '';
    case 'asin':
      return product.asin ?? '';
    case 'rakuten_item_code':
      return product.rakutenItemCode ?? '';
    case 'yahoo_item_code':
      return product.yahooItemCode ?? '';
    case 'image_url':
      return product.imageUrl ?? '';
    case 'package_image_urls':
      return joinList(product.packageImageUrls);
    case 'visual_keywords':
      return joinList(product.visualKeywords);
    case 'amazon_url':
      return product.purchaseLinks?.amazon ?? '';
    case 'rakuten_url':
      return product.purchaseLinks?.rakuten ?? '';
    case 'yahoo_url':
      return product.purchaseLinks?.yahoo ?? '';
    case 'official_url':
      return product.purchaseLinks?.official ?? '';
    case 'search_keywords':
      return joinList(product.searchKeywords);
    case 'source_providers':
      return joinList(product.sources.map((source) => source.provider));
    case 'source_urls':
      return joinList(product.sources.map((source) => source.url).filter(Boolean));
    case 'is_verified':
      return product.isVerified ? 'true' : 'false';
    case 'created_at':
      return product.createdAt;
    case 'updated_at':
      return product.updatedAt;
  }
}

function joinList(values: Array<string | undefined> | undefined): string {
  return (values ?? []).filter(Boolean).join('|');
}

function csvEscape(value: string): string {
  const safeValue = escapeSpreadsheetFormula(value);
  if (!/[",\n\r]/.test(safeValue)) return safeValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function escapeSpreadsheetFormula(value: string): string {
  if (!/^[=+\-@\t\r\n]/.test(value)) return value;
  return `'${value}`;
}

void main();
