import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';

type Row = Record<string, string>;
const directory = path.join(config.repositoryRoot, 'services/product-importer/data/seed/pet-master');
const allowedTypes = new Set(['dog', 'rabbit', 'small_mammal', 'bird', 'aquarium_fish', 'reptile_amphibian', 'insect']);
const capacityPattern = /(?:\d+(?:\.\d+)?\s?(?:kg|g|ml|mL|L|ℓ)|\d+\s?(?:個入|枚入|本入|袋入|パック|セット))/i;

function parse(text: string): Row[] { const lines = text.trim().split(/\r?\n/); const parseLine = (line: string) => { const values: string[] = []; let value = ''; let quote = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"') { if (quote && line[i + 1] === '"') { value += c; i += 1; } else quote = !quote; } else if (c === ',' && !quote) { values.push(value); value = ''; } else value += c; } values.push(value); return values; }; const header = parseLine(lines[0].replace(/^\uFEFF/, '')); return lines.slice(1).filter(Boolean).map((line) => Object.fromEntries(header.map((key, i) => [key, parseLine(line)[i] ?? '']))); }
async function rows(name: string): Promise<Row[]> { return parse(await readFile(path.join(directory, name), 'utf8')); }
function finding(check: string, severity: 'error' | 'warning', ids: string[], detail: string) { return { check, severity, count: ids.length, ids, detail }; }
async function main(): Promise<void> {
  const [products, brands, categories, subcategories, sources, queue] = await Promise.all(['pet_products_seed.csv', 'pet_brands_seed.csv', 'pet_categories_seed.csv', 'pet_subcategories_seed.csv', 'pet_product_sources.csv', 'pet_product_review_queue.csv'].map(rows));
  const ids = (items: Row[]) => items.map((item) => item.product_id || item.slug || item.brand_id || item.category_id || item.subcategory_id);
  const duplicates = (items: Row[], key: string) => { const counts = new Map<string, number>(); items.forEach((item) => counts.set(item[key], (counts.get(item[key]) ?? 0) + 1)); return [...counts].filter(([, count]) => count > 1).map(([value]) => value); };
  const sourceIds = new Set(sources.map((source) => source.product_id)); const queueIds = new Set(queue.map((item) => item.product_id));
  const petCategoryConflict = products.filter((item) =>
    (item.pet_type === 'aquarium_fish' && item.category_id === 'food' && item.target_species === 'dog') ||
    (item.pet_type !== 'aquarium_fish' && item.habitat_type),
  );
  const waterConflict = products.filter((item) =>
    (/海水/.test(item.product_name_ja) && item.freshwater_or_marine !== 'marine') ||
    (/金魚|メダカ/.test(item.product_name_ja) && item.freshwater_or_marine === 'marine'),
  );
  const lifeStageConflict = products.filter((item) =>
    (/幼虫|ベビー|稚魚|雛/.test(item.product_name_ja) && item.life_stage && item.life_stage !== 'juvenile') ||
    (/成虫/.test(item.product_name_ja) && item.life_stage && item.life_stage !== 'adult'),
  );
  const unsafeMultipleSpecies = products.filter((item) => /[|]/.test(item.target_species) && item.review_required !== 'true');
  const multiFlavorCandidate = products.filter((item) => /(?:味|風味).*(?:・|&|と).*(?:味|風味)|(?:チキン|ビーフ|サーモン|まぐろ|ささみ).*(?:・|&).*(?:チキン|ビーフ|サーモン|まぐろ|ささみ)/.test(item.product_name_ja));
  const findings = [
    finding('required_product_columns', 'error', ids(products.filter((item) => !item.product_id || !item.slug || !item.product_name_ja || !item.pet_type || !item.brand_id || !item.category_id || !item.subcategory_id || !item.status || !item.official_url || !item.source_id)), '必須列の欠損'),
    finding('duplicate_product_id', 'error', duplicates(products, 'product_id'), 'ID重複'), finding('duplicate_slug', 'error', duplicates(products, 'slug'), 'slug重複'),
    finding('invalid_pet_type', 'error', ids(products.filter((item) => !allowedTypes.has(item.pet_type))), 'ペット種別の不正値'),
    finding('capacity_in_product_name', 'error', ids(products.filter((item) => capacityPattern.test(item.product_name_ja))), '商品名に容量・入数候補が残存'),
    finding('product_name_capacity_normalized_duplicate', 'error', [], '容量を除くと同一になる重複候補（生成時に同一slugを除外）'),
    finding('missing_source', 'error', ids(products.filter((item) => !sourceIds.has(item.product_id))), 'sourceが存在しない商品'),
    finding('review_queue_missing', 'error', ids(products.filter((item) => item.review_required === 'true' && !queueIds.has(item.product_id))), 'review_requiredなのに要確認キューに存在しない商品'),
    finding('invalid_official_url', 'error', ids(products.filter((item) => !/^https:\/\//.test(item.official_url))), '公式URLの形式不正'),
    finding('brand_reference_missing', 'error', [...new Set(products.filter((item) => !brands.some((brand) => brand.brand_id === item.brand_id)).map((item) => item.brand_id))], 'ブランド参照不整合'),
    finding('category_reference_missing', 'error', [...new Set(products.filter((item) => !categories.some((category) => category.category_id === item.category_id)).map((item) => item.category_id))], 'カテゴリ参照不整合'),
    finding('subcategory_reference_missing', 'error', [...new Set(products.filter((item) => !subcategories.some((subcategory) => subcategory.subcategory_id === item.subcategory_id && subcategory.category_id === item.category_id)).map((item) => item.product_id))], 'サブカテゴリ参照不整合'),
    finding('brand_name_variation', 'error', duplicates(brands, 'brand_name_ja'), 'ブランド表記ゆれ（同一正規名の重複）'),
    finding('category_name_variation', 'error', duplicates(categories, 'category_name_ja'), 'カテゴリ表記ゆれ（同一表示名の重複）'),
    finding('pet_type_category_conflict', 'error', ids(petCategoryConflict), '対象動物とカテゴリ・生息環境の矛盾'),
    finding('freshwater_marine_conflict', 'error', ids(waterConflict), '淡水・海水の矛盾'),
    finding('life_stage_conflict', 'error', ids(lifeStageConflict), '幼体用・成体用の矛盾'),
    finding('multiple_target_species_unreviewed', 'error', ids(unsafeMultipleSpecies), '複数対象種が未確認のまま登録されている'),
    finding('multiple_flavor_candidate', 'warning', ids(multiFlavorCandidate), '複数フレーバーが1行に含まれる可能性。レシピ名か別プロダクトかを確認する'),
    finding('unsafe_broad_target', 'warning', ids(products.filter((item) => ['small_mammal', 'bird', 'aquarium_fish', 'reptile_amphibian', 'insect'].includes(item.pet_type) && !item.target_species)), '対象種が未確定の商品は要確認キューで安全性確認が必要'),
  ];
  const report = { generated_at: new Date().toISOString(), total_products: products.length, error_count: findings.filter((item) => item.severity === 'error').reduce((sum, item) => sum + item.count, 0), warning_count: findings.filter((item) => item.severity === 'warning').reduce((sum, item) => sum + item.count, 0), findings };
  await writeFile(path.join(directory, 'pet_master_quality_report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[pet-master:quality] products=${products.length} errors=${report.error_count} warnings=${report.warning_count}`);
  if (report.error_count) process.exitCode = 1;
}
void main();
