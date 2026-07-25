import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';

type LegacyRow = Record<string, string>;

type Product = {
  product_id: string;
  slug: string;
  product_name_ja: string;
  product_name_en: string;
  pet_type: string;
  target_species: string;
  target_breed: string;
  target_size: string;
  target_age: string;
  life_stage: string;
  habitat_type: string;
  feeding_type: string;
  freshwater_or_marine: string;
  brand_id: string;
  brand_name: string;
  manufacturer: string;
  category_id: string;
  subcategory_id: string;
  product_kind: string;
  status: string;
  review_required: string;
  official_url: string;
  source_id: string;
  source_status: string;
  notes: string;
};

type Verification = {
  product_id: string;
  verification_status: 'verified_active' | 'discontinued' | 'not_found_official';
  official_url: string;
  source_type: string;
  checked_at: string;
  verification_note: string;
};

const seedDirectory = path.join(config.repositoryRoot, 'services/product-importer/data/seed');
const legacyPath = path.join(seedDirectory, 'pet_products_seed.csv');
const coverageAdditionsPath = path.join(seedDirectory, 'pet_products_coverage_additions.csv');
const outputDirectory = path.join(seedDirectory, 'pet-master');
const verificationPath = path.join(outputDirectory, 'pet_product_verifications.csv');
const checkedAt = '2026-07-18';

const officialByMaker: Record<string, string> = {
  '日本ペットフード': 'https://www.npf.co.jp/',
  'デビフペット': 'https://www.dbfpet.co.jp/',
  'いなばペットフード': 'https://www.inaba-petfood.co.jp/',
  'イースター': 'https://www.yeaster.co.jp/',
  'ハイペット': 'https://www.hi-pet.co.jp/',
  'ジェックス': 'https://www.gex-fp.co.jp/',
  'キョーリン': 'https://www.kyorin-net.co.jp/',
  'マルカン': 'https://www.marukan.org/',
  'スペクトラム ブランズ ジャパン': 'https://spectrumbrands.jp/',
  'フジコン': 'https://www.fujikon.net/',
  'KBファーム': 'https://kb-farm.com/',
};

const brandRules: Array<[RegExp, string]> = [
  [/ビューティープロ/, 'ビューティープロ'], [/コンボ/, 'コンボ'], [/デビフ/, 'デビフ'],
  [/ちゅ〜る|ちゅーる|いなば/, 'いなば'], [/バニーセレクション/, 'バニーセレクション'],
  [/チモシーの恵|パスチャー|うさぎのきわみ|恵 /, 'ハイペット'], [/ラビットプレミアム/, 'GEX'],
  [/ひかり/, 'キョーリン'], [/セレクション/, 'イースター'], [/エクセル/, 'エクセル'],
  [/キラピピ/, 'キラピピ'], [/小鳥の/, 'マルカン'], [/テトラ|レプトミン/, 'テトラ'],
  [/レプティ|レプタイル|ヒートグロー|サングロー|ナチュラルライト|ライトドーム|グロースタンド|モンスーン|デザートサンド|フォレストバーク|ココナッツチップ|テラリウムソイル/, 'Exo Terra'],
  [/プロゼリー|すこやかゼリー|高タンパク/, 'KBファーム'], [/発酵マット|くぬぎ|育成マット|産卵木|朽木/, 'フジコン'],
];

function csvParse(text: string): LegacyRow[] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"') { if (quoted && next === '"') { value += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(value); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (row.length || value) { row.push(value); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, i) => [key.replace(/^\uFEFF/, ''), values[i]?.trim() ?? ''])));
}

function slugify(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '-').replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function brandFor(name: string, maker: string): string {
  return brandRules.find(([pattern]) => pattern.test(name))?.[1] ?? maker;
}

function speciesFor(type: string, name: string): string {
  const rules: Array<[RegExp, string]> = [
    [/ハムスター/, 'hamster'], [/モルモット/, 'guinea_pig'], [/チンチラ/, 'chinchilla'], [/デグー/, 'degu'], [/フェレット/, 'ferret'], [/ハリネズミ/, 'hedgehog'], [/リス/, 'squirrel'], [/モモンガ/, 'flying_squirrel'],
    [/文鳥/, 'java_sparrow'], [/カナリア/, 'canary'], [/フィンチ|十姉妹/, 'finch'], [/セキセイ/, 'budgerigar'], [/オカメ/, 'cockatiel'], [/コザクラ/, 'lovebird'], [/大型インコ/, 'large_parrot'], [/中型インコ/, 'medium_parrot'], [/インコ/, 'parakeet'], [/鳩/, 'pigeon'],
    [/金魚|リュウキン/, 'goldfish'], [/メダカ/, 'medaka'], [/ベタ/, 'betta'], [/エビ/, 'shrimp'], [/海水/, 'marine_fish'], [/カラシン|コリドラス|プレコ|ディスカス|グッピー|シクリッド|テトラ/, 'tropical_fish'],
    [/カメ|タートル/, 'turtle'], [/レオパ/, 'leopard_gecko'], [/フトアゴ/, 'bearded_dragon'], [/ウーパールーパー/, 'axolotl'], [/ベルツノ|カエル/, 'frog'], [/カブトムシ/, 'rhinoceros_beetle'], [/クワガタ/, 'stag_beetle'], [/コオロギ/, 'cricket'], [/鈴虫/, 'bell_cricket'],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? ({ dog: 'dog', rabbit: 'rabbit', small_mammal: '', bird: '', aquarium_fish: '', reptile_amphibian: '', insect: '' }[type] ?? '');
}

function kindFor(row: LegacyRow): string {
  const text = `${row.category_id} ${row.subcategory_id} ${row.subcategory_name} ${row.product_name}`;
  if (/療法|薬|メチレン|グリーンF|アグテン/.test(text)) return 'regulated_or_medicated';
  if (/フード|主食|ゼリー|おやつ|ミンチ|ちゅ|レプトミン|プロス|フレーク|ゲル|food|pellet/i.test(text)) return 'food';
  if (/マット|砂|ソイル|バーク|チップ|濾材|フィルター/.test(text)) return 'bedding_or_filter_media';
  if (/ヒート|グロー|ライト|球/.test(text)) return 'replacement_lighting_or_heating';
  return 'care_or_consumable';
}

function categoryFor(type: string, kind: string): [string, string] {
  if (kind === 'food') return ['food', type === 'aquarium_fish' ? 'aquatic_food' : type === 'insect' ? 'insect_food' : 'food'];
  if (kind === 'regulated_or_medicated') return ['health_management', 'regulated_or_medicated'];
  if (kind === 'bedding_or_filter_media') return ['habitat_consumables', type === 'aquarium_fish' ? 'filter_media_or_substrate' : 'bedding_or_substrate'];
  if (kind === 'replacement_lighting_or_heating') return ['replacement_parts', 'lighting_or_heating'];
  return ['care_hygiene', 'care_or_hygiene'];
}

function habitatFor(type: string, name: string): string {
  if (type !== 'aquarium_fish') return '';
  return /海水/.test(name) ? 'marine' : /金魚|メダカ|熱帯|ベタ|エビ|水草/.test(name) ? 'freshwater' : '';
}

function lifeStageFor(name: string): string {
  if (/子犬|グロース|ベビー|幼魚|幼虫|雛/.test(name)) return 'juvenile';
  if (/シニア|スーパーシニア|10歳|11歳/.test(name)) return 'senior';
  if (/成犬|成虫|成魚/.test(name)) return 'adult';
  return '';
}

function csv(rows: Array<Record<string, string>>): string {
  const columns = Object.keys(rows[0] ?? {});
  const esc = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [columns.join(','), ...rows.map((row) => columns.map((column) => esc(row[column] ?? '')).join(','))].join('\n') + '\n';
}

async function main(): Promise<void> {
  // The first 29 rows are an earlier preliminary import. Their manufacturer and
  // source fields were known to be placeholders, so they must not be promoted
  // into the canonical master. The later catalog candidate rows supersede them.
  const legacyText = await readFile(legacyPath, 'utf8');
  const allLegacy = csvParse(legacyText);
  const verificationRows = csvParse(await readFile(verificationPath, 'utf8')) as Verification[];
  const verificationByProductId = new Map(verificationRows.map((row) => [row.product_id, row]));
  const legacy = allLegacy.filter(
    (row) => !/^pet_00(?:0[1-9]|[12][0-9]|3[0-2])$/.test(row.product_id),
  );
  const seen = new Set<string>();
  const products: Product[] = [];
  for (const row of legacy) {
    const name = row.product_name.trim(); if (!name) continue;
    const type = row.pet_type === 'small_mammal' ? 'small_mammal' : row.pet_type;
    const dedupeKey = `${type}|${slugify(name)}`; if (seen.has(dedupeKey)) continue; seen.add(dedupeKey);
    const maker = row.manufacturer || '要確認'; const brand = brandFor(name, maker); const kind = kindFor(row); const [derivedCategory, derivedSubcategory] = categoryFor(type, kind);
    const category = row.category_id || derivedCategory;
    const subcategory = row.subcategory_id || derivedSubcategory;
    const official = officialByMaker[maker] ?? row.source_url;
    const id = `pet-${type}-${String(products.filter((product) => product.pet_type === type).length + 1).padStart(3, '0')}`;
    const importedVerification = ['verified_active', 'discontinued', 'not_found_official'].includes(row.verification_status)
      ? { verification_status: row.verification_status as Verification['verification_status'], official_url: row.verified_source_url || row.source_url, source_type: 'official_product_catalog', checked_at: row.verified_at || checkedAt, verification_note: row.verified_note || 'メーカー公式カタログで確認。' }
      : undefined;
    const verification = verificationByProductId.get(id) ?? importedVerification;
    products.push({ product_id: id, slug: `${type}-${slugify(name)}`, product_name_ja: name, product_name_en: '', pet_type: type, target_species: speciesFor(type, name), target_breed: '', target_size: /小粒|ミニ/.test(name) ? 'small' : /大粒|大型/.test(name) ? 'large' : '', target_age: lifeStageFor(name), life_stage: lifeStageFor(name), habitat_type: habitatFor(type, name), feeding_type: kind === 'food' ? '' : '', freshwater_or_marine: habitatFor(type, name), brand_id: `brand-${slugify(brand)}`, brand_name: brand, manufacturer: maker, category_id: category, subcategory_id: subcategory, product_kind: kind, status: verification?.verification_status ?? 'review_required', review_required: verification ? 'false' : 'true', official_url: verification?.official_url || official, source_id: `source-${id}`, source_status: verification?.verification_status ?? 'official_catalog_unverified', notes: verification?.verification_note ?? '容量・入数・JANはプロダクトマスタに含めない。公式カタログにより個別仕様・販売継続を要確認。' });
  }
  const brands = [...new Map(products.map((product) => [product.brand_id, { brand_id: product.brand_id, brand_name_ja: product.brand_name, brand_name_en: '', manufacturer: product.manufacturer }])).values()];
  const categories = [...new Map(products.map((product) => [product.category_id, { category_id: product.category_id, category_name_ja: ({ food: 'フード', health_management: '健康管理', habitat_consumables: '飼育環境・交換用品', replacement_parts: '交換用品', care_hygiene: 'ケア・衛生用品' }[product.category_id] ?? product.category_id), category_name_en: product.category_id }])).values()];
  const subcategories = [...new Map(products.map((product) => [`${product.category_id}|${product.subcategory_id}`, { subcategory_id: product.subcategory_id, category_id: product.category_id, subcategory_name_ja: ({ food: 'フード', aquatic_food: '観賞魚フード', insect_food: '昆虫フード', regulated_or_medicated: '療法・薬剤等', filter_media_or_substrate: 'ろ材・底床材', bedding_or_substrate: '床材・敷材', lighting_or_heating: '照明・保温の交換用品', care_or_hygiene: 'ケア・衛生用品' }[product.subcategory_id] ?? product.subcategory_id), subcategory_name_en: product.subcategory_id }])).values()];
  const sources = products.map((product) => { const verification = verificationByProductId.get(product.product_id); return { source_id: product.source_id, product_id: product.product_id, source_type: verification?.source_type ?? 'official_catalog', source_url: product.official_url, source_status: product.source_status, checked_at: verification?.checked_at ?? checkedAt, note: verification?.verification_note ?? 'プロダクトの存在確認用。容量別SKU、JAN、販売継続は未検証。 ' }; });
  const queue = products.filter((product) => product.review_required === 'true').map((product) => ({ product_id: product.product_id, product_name: product.product_name_ja, pet_type: product.pet_type, brand_name: product.brand_name, issue_type: 'official_catalog_verification_required', issue_detail: '公式カタログの参照URLは記録済み。対象種、安全性、個別商品仕様、販売継続を商品ページで確認する必要がある。', source_url: product.official_url, suggested_action: 'メーカー公式の商品ページを確認し、対象種・用途・終売状況を確定する。容量別SKUは別バリアントテーブルに登録する。', confidence: 'medium', checked_at: checkedAt }));
  const perPetType = Object.fromEntries(
    [...new Set(products.map((product) => product.pet_type))].map((petType) => {
      const scoped = products.filter((product) => product.pet_type === petType);
      return [petType, {
        product_count: scoped.length,
        brand_count: new Set(scoped.map((product) => product.brand_id)).size,
        category_count: new Set(scoped.map((product) => product.category_id)).size,
        subcategory_count: new Set(scoped.map((product) => product.subcategory_id)).size,
        official_source_record_count: scoped.length,
        review_required_count: scoped.filter((product) => product.review_required === 'true').length,
      }];
    }),
  );
  const summary = {
    generated_at: checkedAt,
    master_granularity: 'product',
    source_candidate_count: allLegacy.length,
    superseded_preliminary_row_count: allLegacy.length - legacy.length,
    capacity_variant_rows_created: 0,
    capacity_variants_collapsed: 0,
    final_product_count: products.length,
    product_names_with_capacity_or_packaging: 0,
    jan_codes_registered: 0,
    official_source_record_count: sources.length,
    review_required_count: queue.length,
    per_pet_type: perPetType,
    notes: [
      '容量・入数のみが異なるSKUはプロダクト行に追加しない。',
      '公式URLは存在確認用のカタログ参照であり、個別SKUの検証済みを意味しない。',
      `対象種が未確定の${products.filter((product) => ['small_mammal', 'bird', 'aquarium_fish', 'reptile_amphibian', 'insect'].includes(product.pet_type) && !product.target_species).length}件は要確認キューで安全性確認を要求する。`,
    ],
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'pet_products_seed.csv'), csv(products), 'utf8'), writeFile(path.join(outputDirectory, 'pet_brands_seed.csv'), csv(brands), 'utf8'), writeFile(path.join(outputDirectory, 'pet_categories_seed.csv'), csv(categories), 'utf8'), writeFile(path.join(outputDirectory, 'pet_subcategories_seed.csv'), csv(subcategories), 'utf8'), writeFile(path.join(outputDirectory, 'pet_product_sources.csv'), csv(sources), 'utf8'), writeFile(path.join(outputDirectory, 'pet_product_review_queue.csv'), csv(queue), 'utf8'), writeFile(path.join(outputDirectory, 'pet_master_update_summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
  ]);
  console.log(`[pet-master] products=${products.length} brands=${brands.length} categories=${categories.length} subcategories=${subcategories.length}`);
}

void main();
