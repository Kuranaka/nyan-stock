import { CatalogQualitySnapshot, ProductSearchQuery, QualityFinding, QualityRow } from './types.js';

const capacityPattern = /\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|mL|L|ℓ)|\d+\s*(?:個|袋|枚|本|缶|箱|パック|包)\s*(?:入|入り|セット)/i;
const salesCopyPattern = /送料無料|送料込|ポイント\s*\d*倍|あす楽|即納|限定セール|まとめ買い|正規品/;
const reptileFoodQueryPattern = /フード|餌|飼料|ペレット|ゼリー/;
const reptileDietPattern = /草食|肉食|雑食|昆虫食/;
const pairedAquariumCategories = [
  'flake_food',
  'granule_food',
  'tablet_food',
  'frozen_food',
  'dried_food',
  'live_food',
  'water_conditioner',
  'dechlorinator',
  'bacteria',
  'algae_control',
  'fish_medicine',
  'aquarium_salt',
  'filter_media',
  'activated_carbon',
  'wool_mat',
  'water_test',
  'substrate',
  'gravel',
];

export function runProductSearchQueryQualityChecks(
  queries: ProductSearchQuery[],
  categoryPairs: ReadonlySet<string> = new Set(),
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const enabled = queries.filter((query) => query.enabled);

  add(
    findings,
    'duplicate_search_query_id',
    'error',
    duplicateIds(queries, (query) => query.id),
    'product_search_queriesのidが重複している。',
  );

  const semanticDuplicates = groupBy(enabled, (query) =>
    [query.petGroup, query.targetSpecies ?? '', query.targetSpeciesGroup ?? '', normalizeQueryKeyword(query.keyword)].join('|'),
  );
  add(
    findings,
    'duplicate_enabled_search_query',
    'error',
    [...semanticDuplicates.values()].filter((rows) => rows.length > 1).flatMap((rows) => rows.map((query) => query.id)),
    '同一対象・同一キーワードの有効な検索条件が重複している。API呼び出しが重複するため統合する。',
  );

  add(
    findings,
    'search_query_max_pages_too_low',
    'error',
    enabled.filter((query) => query.maxPages < requiredMaxPages(query.priority)).map((query) => query.id),
    '探索量ポリシーを満たさないmax_pages。priority 95以上は5、85以上は4、その他は3ページ以上が必要。',
  );
  add(
    findings,
    'search_query_max_pages_too_high',
    'warning',
    enabled.filter((query) => query.maxPages > 10).map((query) => query.id),
    'max_pagesが10を超えている。API上限・レート制限・実行時間を確認する。',
  );
  add(
    findings,
    'enabled_search_query_target_missing',
    'error',
    enabled.filter((query) => !query.targetSpecies && !query.targetSpeciesGroup).map((query) => query.id),
    '有効な検索条件にはtarget_speciesまたはtarget_species_groupが必要。',
  );
  add(
    findings,
    'enabled_search_query_negative_keywords_missing',
    'warning',
    enabled.filter((query) => query.negativeKeywords.length === 0).map((query) => query.id),
    '有効な検索条件にnegative_keywordsがない。隣接ペット種や人用品の誤取得条件を確認する。',
  );
  add(
    findings,
    'search_query_negative_keyword_conflict',
    'error',
    enabled
      .filter((query) => query.negativeKeywords.some((word) => normalizeQueryKeyword(query.keyword).includes(normalizeQueryKeyword(word))))
      .map((query) => query.id),
    '検索キーワード自身にnegative_keywordsが含まれている。正しい検索結果も誤取得扱いになる。',
  );

  if (categoryPairs.size > 0) {
    add(
      findings,
      'search_query_category_pair_missing',
      'error',
      queries
        .filter((query) => !categoryPairs.has(`${query.categoryId}|${query.subcategoryId}`))
        .map((query) => query.id),
      '検索条件のcategory_idとsubcategory_idの組が参照マスタに存在しない。',
    );
  }

  add(
    findings,
    'aquarium_search_query_habitat_missing',
    'error',
    enabled
      .filter((query) => query.petGroup === 'aquarium')
      .filter((query) => query.targetSpecies === 'freshwater_fish' || query.targetSpecies === 'marine_fish')
      .filter((query) => !(query.targetSpecies === 'freshwater_fish' ? /淡水/.test(query.keyword) : /海水/.test(query.keyword)))
      .map((query) => query.id),
    '淡水魚・海水魚向け検索条件のkeywordに淡水または海水の明示がない。',
  );

  const aquariumByCategory = groupBy(
    enabled.filter((query) => query.petGroup === 'aquarium'),
    (query) => query.categoryId,
  );
  const missingAquariumPairs: string[] = [];
  for (const categoryId of pairedAquariumCategories) {
    const categoryQueries = aquariumByCategory.get(categoryId) ?? [];
    for (const targetSpecies of ['freshwater_fish', 'marine_fish']) {
      if (!categoryQueries.some((query) => query.targetSpecies === targetSpecies)) {
        missingAquariumPairs.push(`${categoryId}:${targetSpecies}`);
      }
    }
  }
  add(
    findings,
    'aquarium_freshwater_marine_query_pair_missing',
    'error',
    missingAquariumPairs,
    '淡水用・海水用を分けるべき観賞魚カテゴリの検索条件が片方欠けている。',
  );

  add(
    findings,
    'reptile_food_query_diet_missing',
    'error',
    enabled
      .filter((query) => query.petGroup === 'reptile_amphibian' && reptileFoodQueryPattern.test(query.keyword))
      .filter((query) => !reptileDietPattern.test(query.keyword))
      .map((query) => query.id),
    '爬虫類・両生類のフード検索条件に草食・肉食・雑食・昆虫食の明示がない。',
  );

  return findings;
}

export function runPetCatalogQualityChecks(snapshot: CatalogQualitySnapshot): QualityFinding[] {
  const listingsById = new Map(snapshot.listings.map((row) => [string(row, 'id'), row]));
  const candidatesById = new Map(snapshot.candidates.map((row) => [string(row, 'id'), row]));
  const productsById = new Map(snapshot.products.map((row) => [string(row, 'id'), row]));
  const variantsById = new Map(snapshot.variants.map((row) => [string(row, 'id'), row]));
  const identityKeysByVariant = groupBy(snapshot.identityKeys, (row) => string(row, 'variant_id', 'variantId'));
  const linksByProduct = groupBy(snapshot.productListings, (row) => string(row, 'product_id', 'productId'));
  const reviewCandidateIds = new Set(snapshot.reviewQueue.map((row) => string(row, 'candidate_id', 'candidateId')));
  const productIdsByCanonical = groupBy(snapshot.products, (row) => string(row, 'canonical_key', 'canonicalKey'));

  const findings: QualityFinding[] = [];
  add(
    findings,
    'rabbit_classified_as_small_animal',
    'error',
    snapshot.products
      .filter((row) => string(row, 'pet_group', 'petGroup') === 'small_animal' && array(row, 'target_species', 'targetSpecies').includes('rabbit'))
      .map(id),
    'うさぎ商品をsmall_animalへ分類してはならない。',
  );
  add(
    findings,
    'small_animal_target_species_missing',
    'error',
    snapshot.products
      .filter((row) => string(row, 'pet_group', 'petGroup') === 'small_animal' && array(row, 'target_species', 'targetSpecies').length === 0)
      .map(id),
    'productsのsmall_animal商品には具体的なtarget_speciesが必要。',
  );
  add(
    findings,
    'small_animal_used_as_species',
    'error',
    [...snapshot.products, ...snapshot.candidates]
      .filter((row) => array(row, 'target_species', 'targetSpecies').includes('small_animal'))
      .map(id),
    'small_animalはpet_groupでありtarget_speciesではない。',
  );
  add(
    findings,
    'small_animal_group_wide_without_evidence',
    'error',
    snapshot.products
      .filter((product) => {
        if (string(product, 'pet_group', 'petGroup') !== 'small_animal' || string(product, 'target_scope', 'targetScope') !== 'group_wide') return false;
        const linkedListings = (linksByProduct.get(id(product)) ?? [])
          .map((link) => listingsById.get(string(link, 'raw_listing_id', 'rawListingId')))
          .filter((row): row is QualityRow => Boolean(row));
        return linkedListings.length === 0 || linkedListings.every((row) => {
          const text = `${string(row, 'raw_title', 'rawTitle')} ${string(row, 'raw_description', 'rawDescription')}`;
          return /小動物用/.test(text) && !/(ハムスター|スナネズミ|モルモット|チンチラ|デグー|フェレット|ハリネズミ|フクロモモンガ)/.test(text);
        });
      })
      .map(id),
    '「小動物用」だけを根拠にgroup_wideへしてはならない。',
  );

  const splitMultiSpecies = findPotentialSplitMultiSpecies(snapshot.products);
  add(
    findings,
    'multi_species_product_split',
    'warning',
    splitMultiSpecies,
    '同一ブランド・基本名の商品が対象種ごとに分割されている可能性。公式に共用品なら1プロダクトへ統合する。',
  );

  const mismatchedCandidateProducts: string[] = [];
  const birdVariantMismatch: string[] = [];
  const habitatMismatch: string[] = [];
  const feedingMismatch: string[] = [];
  const lifeStageMismatch: string[] = [];
  const strongIdentityClassificationMismatch: string[] = [];
  for (const link of snapshot.productListings) {
    const product = productsById.get(string(link, 'product_id', 'productId'));
    const candidate = candidatesById.get(string(link, 'candidate_id', 'candidateId'));
    if (!product || !candidate) continue;
    const speciesDiffers = !sameArray(
      array(product, 'target_species', 'targetSpecies'),
      array(candidate, 'target_species', 'targetSpecies'),
    );
    const birdDiffers =
      string(product, 'pet_group', 'petGroup') === 'bird' &&
      (string(product, 'target_species_group', 'targetSpeciesGroup') !== string(candidate, 'target_species_group', 'targetSpeciesGroup') ||
        string(product, 'target_size', 'targetSize') !== string(candidate, 'target_size', 'targetSize'));
    const habitatDiffers =
      string(product, 'habitat_type', 'habitatType') !== string(candidate, 'habitat_type', 'habitatType');
    const feedingDiffers =
      string(product, 'pet_group', 'petGroup') === 'reptile_amphibian' &&
      string(product, 'feeding_type', 'feedingType') !== string(candidate, 'feeding_type', 'feedingType');
    const lifeStageDiffers =
      string(product, 'pet_group', 'petGroup') === 'insect' &&
      string(product, 'life_stage', 'lifeStage') !== string(candidate, 'life_stage', 'lifeStage');
    const variantId = string(link, 'variant_id', 'variantId');
    const hasStrongIdentity = (identityKeysByVariant.get(variantId) ?? []).length > 0;
    if (hasStrongIdentity && (speciesDiffers || birdDiffers || habitatDiffers || feedingDiffers || lifeStageDiffers)) {
      strongIdentityClassificationMismatch.push(`${id(product)}:${variantId}:${id(candidate)}`);
      continue;
    }
    if (speciesDiffers) {
      mismatchedCandidateProducts.push(id(product));
    }
    if (birdDiffers) birdVariantMismatch.push(id(product));
    if (habitatDiffers) habitatMismatch.push(id(product));
    if (feedingDiffers) feedingMismatch.push(id(product));
    if (lifeStageDiffers) lifeStageMismatch.push(id(product));
  }
  add(findings, 'species_specific_products_merged', 'error', mismatchedCandidateProducts, '販売候補と統合先productsのtarget_speciesが一致しない。');
  add(findings, 'bird_variant_merged', 'error', birdVariantMismatch, '鳥種グループまたは対象サイズが異なる候補を統合している。');
  add(findings, 'freshwater_marine_merged', 'error', habitatMismatch, 'habitat_typeが異なる候補を統合している。');
  add(findings, 'reptile_feeding_type_merged', 'error', feedingMismatch, 'feeding_typeが異なる候補を統合している。');
  add(findings, 'insect_life_stage_merged', 'error', lifeStageMismatch, 'life_stageが異なる候補を統合している。');
  add(
    findings,
    'strong_identity_classification_disagreement',
    'warning',
    strongIdentityClassificationMismatch,
    '同じJAN/ブランドスコープ付き型番の候補間で分類結果が異なる。SKU統合は維持し、公式情報でproduct分類を確認する。',
  );

  add(
    findings,
    'ferret_food_merged_with_herbivore',
    'error',
    snapshot.products
      .filter((row) => isFood(row) && hasAllSpeciesClasses(row, ['ferret'], ['rabbit', 'guinea_pig', 'chinchilla', 'degu']))
      .map(id),
    'フェレット用フードを草食小動物用フードと統合している。',
  );
  add(
    findings,
    'guinea_pig_food_merged_with_hamster',
    'error',
    snapshot.products.filter((row) => isFood(row) && hasSpecies(row, 'guinea_pig') && hasSpecies(row, 'hamster')).map(id),
    'モルモット用フードとハムスター用フードを統合している。',
  );
  add(
    findings,
    'capacity_in_product_name',
    'error',
    snapshot.products
      .filter((row) => capacityPattern.test(`${string(row, 'normalized_name', 'normalizedName')} ${string(row, 'base_product_name', 'baseProductName')}`))
      .map(id),
    'productsの商品名に容量・入数が残っている。',
  );
  add(
    findings,
    'sales_copy_in_product_name',
    'error',
    snapshot.products
      .filter((row) => salesCopyPattern.test(`${string(row, 'normalized_name', 'normalizedName')} ${string(row, 'base_product_name', 'baseProductName')}`))
      .map(id),
    'productsの商品名に販売・配送・ポイント訴求が残っている。',
  );
  add(
    findings,
    'capacity_only_product_duplicate',
    'error',
    [...productIdsByCanonical.entries()].filter(([key, rows]) => key && rows.length > 1).flatMap(([, rows]) => rows.map(id)),
    '同一canonical keyのproductsが複数存在する。容量差は販売商品側で管理する。',
  );

  add(
    findings,
    'search_query_only_classification',
    'error',
    snapshot.candidates
      .filter((row) => {
        const evidence = object(row, 'classification_evidence', 'classificationEvidence');
        const petGroupEvidence = Array.isArray(evidence.petGroup) ? evidence.petGroup : [];
        const speciesEvidence = Array.isArray(evidence.targetSpecies) ? evidence.targetSpecies : [];
        const classified =
          Boolean(string(row, 'pet_group', 'petGroup')) || array(row, 'target_species', 'targetSpecies').length > 0;
        return classified && petGroupEvidence.length === 0 && speciesEvidence.length === 0 && Boolean(evidence.searchContext);
      })
      .map(id),
    '検索キーワード以外の分類根拠がない候補。',
  );
  add(
    findings,
    'low_confidence_without_review',
    'error',
    snapshot.candidates
      .filter((row) => number(row, 'confidence') < 0.95 && !reviewCandidateIds.has(id(row)))
      .map(id),
    'confidence 0.95未満の候補がreview_queueに存在しない。',
  );
  const openBlockingCandidateIds = new Set(
    snapshot.reviewQueue
      .filter((row) => string(row, 'disposition') === 'blocking' && string(row, 'status') === 'open')
      .map((row) => string(row, 'candidate_id', 'candidateId')),
  );
  add(
    findings,
    'merge_ready_with_open_blocking_issue',
    'error',
    snapshot.candidates
      .filter((row) => ['merge_ready', 'merged'].includes(string(row, 'status')) && openBlockingCandidateIds.has(id(row)))
      .map(id),
    'merge_readyまたはmerged候補に未解決のblocking issueが残っている。',
  );
  const rejectCandidateIds = new Set(
    snapshot.reviewQueue
      .filter((row) => string(row, 'disposition') === 'reject')
      .map((row) => string(row, 'candidate_id', 'candidateId')),
  );
  add(
    findings,
    'reject_issue_candidate_not_rejected',
    'error',
    snapshot.candidates
      .filter((row) => rejectCandidateIds.has(id(row)) && string(row, 'status') !== 'rejected')
      .map(id),
    'reject issueを持つ候補がrejectedになっていない。',
  );
  add(
    findings,
    'non_blocking_issue_left_open',
    'error',
    snapshot.reviewQueue
      .filter((row) => string(row, 'disposition') === 'non_blocking' && string(row, 'status') === 'open')
      .map((row) => `${string(row, 'candidate_id', 'candidateId')}:${string(row, 'issue_type', 'issueType')}`),
    'non_blocking issueがopenのまま残っている。自動resolvedにする。',
  );
  add(
    findings,
    'canonical_key_duplicate',
    'error',
    [...productIdsByCanonical.entries()].filter(([key, rows]) => key && rows.length > 1).flatMap(([, rows]) => rows.map(id)),
    'productsのcanonical keyが重複している。',
  );
  add(
    findings,
    'candidate_raw_reference_missing',
    'error',
    snapshot.candidates
      .filter((row) => !listingsById.has(string(row, 'raw_listing_id', 'rawListingId')))
      .map(id),
    'product_candidatesからretailer_listings_rawへの参照が欠けている。',
  );
  const candidateRawIds = new Set(snapshot.candidates.map((row) => string(row, 'raw_listing_id', 'rawListingId')));
  add(
    findings,
    'raw_candidate_reference_missing',
    'error',
    snapshot.listings.filter((row) => !candidateRawIds.has(id(row))).map(id),
    'retailer_listings_rawに対応するproduct_candidatesがない。',
  );
  add(
    findings,
    'product_listing_reference_missing',
    'error',
    snapshot.productListings
      .filter(
        (row) =>
          !productsById.has(string(row, 'product_id', 'productId')) ||
          !candidatesById.has(string(row, 'candidate_id', 'candidateId')) ||
          !listingsById.has(string(row, 'raw_listing_id', 'rawListingId')),
      )
      .map((row) => `${string(row, 'product_id', 'productId')}:${string(row, 'raw_listing_id', 'rawListingId')}`),
    'product_retailer_listingsの参照先が欠けている。',
  );
  add(
    findings,
    'variant_product_reference_missing',
    'error',
    snapshot.variants
      .filter((row) => !productsById.has(string(row, 'product_id', 'productId')))
      .map(id),
    'product_variantsからproductsへの参照が欠けている。',
  );
  add(
    findings,
    'identity_variant_reference_missing',
    'error',
    snapshot.identityKeys
      .filter((row) => !variantsById.has(string(row, 'variant_id', 'variantId')))
      .map((row) => `${string(row, 'key_type', 'keyType')}:${string(row, 'normalized_value', 'normalizedValue')}`),
    'product_identity_keysからproduct_variantsへの参照が欠けている。',
  );
  add(
    findings,
    'product_listing_variant_reference_missing',
    'error',
    snapshot.productListings
      .filter((row) => {
        const variantId = string(row, 'variant_id', 'variantId');
        return !variantId || !variantsById.has(variantId);
      })
      .map((row) => `${string(row, 'product_id', 'productId')}:${string(row, 'raw_listing_id', 'rawListingId')}`),
    'product_retailer_listingsにvariant参照がない。',
  );
  add(
    findings,
    'product_listing_variant_product_mismatch',
    'error',
    snapshot.productListings
      .filter((row) => {
        const variant = variantsById.get(string(row, 'variant_id', 'variantId'));
        return variant && string(variant, 'product_id', 'productId') !== string(row, 'product_id', 'productId');
      })
      .map((row) => `${string(row, 'product_id', 'productId')}:${string(row, 'variant_id', 'variantId')}`),
    'listingのproduct_idとvariantのproduct_idが一致しない。',
  );
  add(
    findings,
    'jan_variant_identity_missing',
    'error',
    snapshot.variants
      .filter((variant) => {
        const jan = string(variant, 'jan_code', 'janCode');
        if (!jan) return false;
        return !(identityKeysByVariant.get(id(variant)) ?? []).some(
          (key) => string(key, 'key_type', 'keyType') === 'jan' && string(key, 'normalized_value', 'normalizedValue') === jan.replace(/\D/g, ''),
        );
      })
      .map(id),
    'JANを持つvariantに対応するJAN identity keyがない。',
  );
  return findings;
}

function findPotentialSplitMultiSpecies(products: QualityRow[]): string[] {
  const groups = groupBy(products, (row) =>
    [
      string(row, 'brand'),
      stripSpeciesWords(string(row, 'base_product_name', 'baseProductName')),
      string(row, 'pet_group', 'petGroup'),
      string(row, 'flavor'),
      string(row, 'product_function', 'productFunction'),
      string(row, 'target_age', 'targetAge'),
    ].join('|'),
  );
  return [...groups.values()]
    .filter((rows) => rows.length > 1)
    .filter((rows) => rows.every((row) => array(row, 'target_species', 'targetSpecies').length === 1))
    .flatMap((rows) => rows.map(id));
}

function requiredMaxPages(priority: number): number {
  if (priority >= 95) return 5;
  if (priority >= 85) return 4;
  return 3;
}

function normalizeQueryKeyword(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　]+/g, ' ').trim();
}

function duplicateIds<T>(rows: T[], key: (row: T) => string): string[] {
  return [...groupBy(rows, key).values()]
    .filter((group) => group.length > 1)
    .flatMap((group) => group.map((row) => key(row)));
}

function stripSpeciesWords(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/ハムスター|スナネズミ|モルモット|チンチラ|デグー|フェレット|うさぎ|ウサギ|猫|犬|用/g, '')
    .replace(/[\s・/]+/g, '');
}

function isFood(row: QualityRow): boolean {
  return string(row, 'purpose') === 'food' || /フード|ペレット|飼料|牧草/.test(string(row, 'base_product_name', 'baseProductName'));
}

function hasSpecies(row: QualityRow, value: string): boolean {
  return array(row, 'target_species', 'targetSpecies').includes(value);
}

function hasAllSpeciesClasses(row: QualityRow, required: string[], alternatives: string[]): boolean {
  const values = array(row, 'target_species', 'targetSpecies');
  return required.every((value) => values.includes(value)) && alternatives.some((value) => values.includes(value));
}

function add(
  findings: QualityFinding[],
  check: string,
  severity: QualityFinding['severity'],
  rawIds: string[],
  detail: string,
): void {
  const ids = [...new Set(rawIds.filter(Boolean))];
  if (ids.length === 0) return;
  findings.push({ check, severity, ids, detail });
}

function id(row: QualityRow): string {
  return string(row, 'id', 'product_id', 'productId', 'candidate_id', 'candidateId');
}

function string(row: QualityRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function number(row: QualityRow, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function array(row: QualityRow, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) return value.map(String);
  }
  return [];
}

function object(row: QualityRow, ...keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function sameArray(left: string[], right: string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}
