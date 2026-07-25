import { createHash } from 'node:crypto';

import { normalizeJanCode } from '../normalizers/normalizeJanCode.js';
import { detectBrand } from '../normalizers/detectBrand.js';
import { applyReviewIssuePolicy } from './issuePolicy.js';
import { findNormalizationAliases } from './normalizationAliases.js';
import {
  ClassificationEvidence,
  FeedingType,
  HabitatType,
  LifeStage,
  NormalizationAlias,
  PET_GROUPS,
  PetGroup,
  ProductCandidate,
  ProductSearchQuery,
  RetailerListingInput,
  ReviewIssue,
} from './types.js';

type EvidenceSource = 'title' | 'description';

type SpeciesRule = {
  code: string;
  petGroup: PetGroup;
  pattern: RegExp;
  parentCode?: string;
};

const speciesRules: SpeciesRule[] = [
  rule('syrian_hamster', 'small_animal', /ゴールデンハムスター|シリアンハムスター/i, 'hamster'),
  rule('roborovski_hamster', 'small_animal', /ロボロフスキー(?:ハムスター)?/i, 'hamster'),
  rule('chinese_hamster', 'small_animal', /チャイニーズハムスター/i, 'hamster'),
  rule('dwarf_hamster', 'small_animal', /ドワーフハムスター|ジャンガリアン(?:ハムスター)?|キャンベル(?:ハムスター)?/i, 'hamster'),
  rule('hamster', 'small_animal', /ハムスター/i),
  rule('gerbil', 'small_animal', /スナネズミ|ジャービル/i),
  rule('guinea_pig', 'small_animal', /モルモット/i),
  rule('chinchilla', 'small_animal', /チンチラ/i),
  rule('degu', 'small_animal', /デグー/i),
  rule('ferret', 'small_animal', /フェレット/i),
  rule('hedgehog', 'small_animal', /ハリネズミ/i),
  rule('sugar_glider', 'small_animal', /フクロモモンガ/i),
  rule('prairie_dog', 'small_animal', /プレーリードッグ/i),
  rule('squirrel', 'small_animal', /(?:^|[^ク])リス(?:用|向け|$|[\s、・])/i),
  rule('rabbit', 'rabbit', /うさぎ|ウサギ|兎|ラビット/i),
  rule('cat', 'cat', /猫|ネコ|キャット/i),
  rule('dog', 'dog', /犬|イヌ|ドッグ/i),
  rule('budgerigar', 'bird', /セキセイインコ/i),
  rule('cockatiel', 'bird', /オカメインコ/i),
  rule('lovebird', 'bird', /コザクラインコ|ボタンインコ|ラブバード/i),
  rule('java_sparrow', 'bird', /文鳥|ブンチョウ/i),
  rule('canary', 'bird', /カナリア/i),
  rule('chicken', 'bird', /ニワトリ|鶏用|チキン飼料/i),
  rule('quail', 'bird', /うずら|ウズラ/i),
  rule('finch', 'bird', /フィンチ|十姉妹/i),
  rule('parrot', 'bird', /オウム/i),
  rule('parakeet', 'bird', /インコ/i),
  rule('goldfish', 'aquarium', /金魚/i),
  rule('medaka', 'aquarium', /メダカ|めだか/i),
  rule('betta', 'aquarium', /ベタ(?:用|フード|飼料|$|[\s、・])/i),
  rule('tropical_fish', 'aquarium', /熱帯魚/i),
  rule('marine_fish', 'aquarium', /海水魚/i),
  rule('freshwater_fish', 'aquarium', /淡水魚/i),
  rule('shrimp', 'aquarium', /観賞(?:用)?エビ|シュリンプ/i),
  rule('crayfish', 'aquarium', /ザリガニ/i),
  rule('aquatic_plant', 'aquarium', /水草/i),
  rule('tortoise', 'reptile_amphibian', /リクガメ|陸ガメ/i),
  rule('aquatic_turtle', 'reptile_amphibian', /水棲(?:ガメ|亀)|水生(?:ガメ|亀)/i),
  rule('gecko', 'reptile_amphibian', /ヤモリ|ゲッコー|レオパ/i),
  rule('lizard', 'reptile_amphibian', /トカゲ|イグアナ/i),
  rule('snake', 'reptile_amphibian', /ヘビ|蛇用|スネーク/i),
  rule('axolotl', 'reptile_amphibian', /ウーパールーパー|アホロートル/i),
  rule('newt', 'reptile_amphibian', /イモリ/i),
  rule('salamander', 'reptile_amphibian', /サンショウウオ/i),
  rule('frog', 'reptile_amphibian', /カエル|蛙用|フロッグ/i),
  rule('rhinoceros_beetle', 'insect', /カブトムシ/i),
  rule('stag_beetle', 'insect', /クワガタ/i),
  rule('bell_cricket', 'insect', /スズムシ|鈴虫/i),
  rule('cricket', 'insect', /コオロギ/i),
  rule('mantis', 'insect', /カマキリ/i),
  rule('butterfly', 'insect', /蝶|チョウ用/i),
  rule('moth', 'insect', /蛾|ガ用/i),
  rule('ant', 'insect', /蟻|アリ用/i),
];

const groupRules: Array<{ petGroup: PetGroup; pattern: RegExp }> = [
  { petGroup: 'small_animal', pattern: /小動物|小型哺乳類/i },
  { petGroup: 'bird', pattern: /鳥用|小鳥|中型インコ|大型インコ|バードフード/i },
  { petGroup: 'aquarium', pattern: /観賞魚|アクアリウム|水槽用/i },
  { petGroup: 'reptile_amphibian', pattern: /爬虫類|両生類|テラリウム/i },
  { petGroup: 'insect', pattern: /昆虫用|昆虫飼育/i },
];

const apiCategoryRules: Array<{ petGroup: PetGroup; pattern: RegExp }> = [
  { petGroup: 'cat', pattern: /猫用品|キャット/i },
  { petGroup: 'dog', pattern: /犬用品|ドッグ/i },
  { petGroup: 'rabbit', pattern: /うさぎ用品|ラビット/i },
  { petGroup: 'small_animal', pattern: /小動物用品/i },
  { petGroup: 'bird', pattern: /鳥用品|バード/i },
  { petGroup: 'aquarium', pattern: /熱帯魚|観賞魚|アクアリウム/i },
  { petGroup: 'reptile_amphibian', pattern: /爬虫類|両生類/i },
  { petGroup: 'insect', pattern: /昆虫/i },
];

const packagePattern =
  /(?:内容量\s*[:：]?\s*)?(?:約|およそ)?\s*(?<!\d)(\d{1,7}(?:\.\d+)?)\s*(kg|g|mg|ml|mL|cc|l|L|ℓ)(?:\s*[×xX＊*]\s*(\d{1,6}|[一二三四五六七八九十百千]+)(?!\d)\s*(?:(?:個|コ|袋|本|缶|パック)\s*(?:入り?)?|セット\s*(?:入り?)?)?)?/i;
const suspiciousPackagePattern = /(?<!\d)\d{8,}\s*(?:kg|g|mg|ml|mL|cc|l|L|ℓ)(?=$|[\s,，、)）\-])/i;
const maxCapacityValue = 100_000_000;
const maxPackageQuantity = 100_000;
const packedItemCountPattern =
  /(?<![\d一二三四五六七八九十百千])(\d{1,6}|[一二三四五六七八九十百千]+)(?![\d一二三四五六七八九十百千])\s*(?:個|コ)\s*パック\s*(?:入り?)?/i;
const orphanedPackageOperatorPattern = /(?<![A-Za-z0-9])[×x＊*]+(?![A-Za-z0-9])/g;
const decorativeSymbolPattern = /[\u2460-\u24FF\u2500-\u257F\u25A0-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/gu;
const bracketedContentPattern =
  /\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|［[^［］]*］|\{[^{}]*\}|｛[^｛｝]*｝|【[^【】]*】|「[^「」]*」|『[^『』]*』|〔[^〔〕]*〕|〈[^〈〉]*〉|《[^《》]*》|<[^<>]*>|＜[^＜＞]*＞|〖[^〖〗]*〗|〘[^〘〙]*〙|〚[^〚〛]*〛/;
const commerceNoiseTokenPatterns = [
  /(?:^|\s)※\S*(?=\s|$)/g,
  /(?:^|\s)\S*(?:おまけ|お試し)\S*(?=\s|$)/gi,
  /(?:^|\s)\S*(?:ポイント|エントリー)\S*(?=\s|$)/gi,
  /(?:^|\s)\S*確率\S*(?=\s|$)/gi,
  /(?:^|\s)\S*(?:無料|安い|激安|格安)\S*(?=\s|$)/gi,
  /(?:^|\s)\S*クーポン\S*(?=\s|$)/gi,
  /(?:^|\s)\S*価格\S*(?=\s|$)/gi,
  /(?:^|\s)\S*限定\S*(?=\s|$)/gi,
  /(?:^|\s)\S*賞味期限\S*(?=\s|$)/gi,
  /(?:^|\s)\S*(?:\d{4}年\d{1,2}月(?:\d{1,2}日)?|\d{4}[./-]\d{1,2}(?:[./-]\d{1,2})?|\d{1,2}月\d{1,2}日|\d{1,2}[/-]\d{1,2}|\d{1,2}日|本日|当日|翌日)\S*(?:\s+\d{1,2}:\d{2}\S*)?(?=\s|$)/gi,
  /(?:^|\s)\S*(?:お|御)?一人様\S*(?=\s|$)/gi,
  /(?:^|\s)\S*配送\S*(?=\s|$)/gi,
];
const quantityPatterns = [
  /(?<![\d一二三四五六七八九十百千])(\d{1,6}|[一二三四五六七八九十百千]+)(?![\d一二三四五六七八九十百千])\s*セット\s*(?:入り?)?/i,
  /(?<![\d一二三四五六七八九十百千])(\d{1,6}|[一二三四五六七八九十百千]+)(?![\d一二三四五六七八九十百千])\s*(?:個|コ|袋|枚|本|缶|箱|パック|包)\s*(?:入り?|セット)/i,
  /(?:[×xX＊*]\s*)(\d{1,6}|[一二三四五六七八九十百千]+)(?![\d一二三四五六七八九十百千])\s*(?:(?:個|コ|袋|枚|本|缶|箱|パック|包)\s*(?:入り?)?|セット\s*(?:入り?)?)?/i,
  /(?<![\d一二三四五六七八九十百千])(\d{1,6}|[一二三四五六七八九十百千]+)(?![\d一二三四五六七八九十百千])\s*(?:個|コ|袋|枚|本|缶|箱|パック|包)(?![ぁ-んァ-ヶ一-龠A-Za-z0-9])/i,
];
const unitPriceNoticePattern =
  /(?:表示)?価格は\s*(?:\d+|[一二三四五六七八九十百千]+)\s*(?:個|コ|袋|枚|本|缶|箱|パック|包|セット)\s*(?:分)?\s*の?\s*(?:お値段|価格)です[。.]?/gi;
const promotionPatterns = [
  /[【\[][^】\]]*(?:送料無料|ポイント|セール|正規品|即納|あす楽|お徳用|お得|まとめ買い)[^】\]]*[】\]]/gi,
  /(?:\d+|[一二三四五六七八九十百千]+)\s*(?:個|コ|袋|枚|本|缶|箱|パック|包|セット)\s*分\s*お得/gi,
  /(?:送料無料|送料込|ポイント\s*\d+倍|あす楽|即納|正規品|限定セール|期間限定セール|お買い?得|(?:お)?徳用(?:サイズ|パック)?|お得用|まとめ買い)/gi,
  /(?:全国\s*(?:一律\s*)?送料|送料\s*全国\s*一律)\s*\d[\d,，]*\s*円\s*(?:対応)?/gi,
  /返品種別\s*[:：]?\s*[A-Z]/gi,
  /Yahoo!?(?:ショッピング)?\s*限定価格/gi,
  unitPriceNoticePattern,
  /(?:お|御)?一人様\s*(?:\d+|[一二三四五六七八九十百千]+)\s*(?:点|個|コ|本|袋|箱|セット)?\s*(?:限り|まで)/gi,
  /[※＊*]?\s*商品説明を\s*(?:よく|必ず)?\s*お読み(?:の)?上\s*[、,]?\s*(?:ご注文|ご購入|購入)\s*(?:ください|下さい)[。.]?/gi,
  /冷蔵\s*[★☆]*/gi,
  /(?:別途\s*)?クール(?:便)?手数料/gi,
  /(?:常温商品)?同梱不可/gi,
  /(?:代引(?:き)?|代金引換)不可/gi,
  /(?:北海道|沖縄|離島)(?:\s*[・、,，/]\s*(?:北海道|沖縄|離島))*\s*(?:配送|発送)?不可/gi,
  /(?:(?:\d+|[一二三四五六七八九十百千]+)\s*(?:個|コ|袋|枚|本|缶|箱|パック|包)?\s*)?セット\s*(?:入り?|販売|で\s*(?:販売)?)?/gi,
];

export function normalizeRetailerListing(
  listing: StoredListingLike,
  query: ProductSearchQuery,
  aliases: readonly NormalizationAlias[] = [],
): ProductCandidate {
  const normalizedTitle = listing.rawTitle.normalize('NFKC');
  const description = listing.rawDescription?.normalize('NFKC') ?? '';
  const categoryText = `${listing.genreName ?? ''} ${listing.genreId ?? ''}`.trim();
  const evidence: ClassificationEvidence = {
    petGroup: [],
    targetSpecies: [],
    targetSpeciesGroup: [],
    searchContext: { queryId: query.id, petGroup: query.petGroup, targetSpecies: query.targetSpecies },
    notes: ['検索条件は候補収集のメタデータであり、分類根拠・confidence加点には使用していない。'],
  };

  const titleSpecies = [
    ...detectSpecies(normalizedTitle, 'title', evidence),
    ...detectAliasSpecies(normalizedTitle, 'title', listing.contentLocale, aliases, evidence),
  ];
  const descriptionSpecies = [
    ...detectSpecies(description, 'description', evidence),
    ...detectAliasSpecies(description, 'description', listing.contentLocale, aliases, evidence),
  ];
  const targetSpecies = collapseGenericSpecies([...titleSpecies, ...descriptionSpecies]).sort();
  detectGroupEvidence(normalizedTitle, 'title', evidence);
  detectGroupEvidence(description, 'description', evidence);
  detectApiCategoryEvidence(categoryText, evidence);
  detectSpeciesGroups(normalizedTitle, 'title', evidence);
  detectSpeciesGroups(description, 'description', evidence);

  const candidateGroups = new Set<PetGroup>([
    ...evidence.petGroup.map((item) => item.value),
    ...targetSpecies.flatMap((code) => speciesRules.filter((item) => item.code === code).map((item) => item.petGroup)),
  ]);
  const petGroup = candidateGroups.size === 1 ? [...candidateGroups][0] : undefined;
  const targetSpeciesGroup = unique(evidence.targetSpeciesGroup.map((item) => item.value))[0];
  const targetScope = targetSpecies.length === 1 ? 'species_specific' : targetSpecies.length > 1 ? 'multi_species' : 'unconfirmed';
  const packageData = extractPackageData(normalizedTitle);
  const brandAlias = findNormalizationAliases(
    aliases,
    'brand',
    `${listing.brandName ?? ''} ${normalizedTitle}`,
    listing.contentLocale,
  )[0];
  const brand = brandAlias?.displayValue ?? cleanOptional(listing.brandName) ?? detectBrand(normalizedTitle);
  const brandIdentity = brandAlias?.canonicalValue ?? brand;
  const seriesAlias = findNormalizationAliases(aliases, 'series', normalizedTitle, listing.contentLocale, brandAlias?.canonicalValue)[0];
  const series = seriesAlias?.canonicalValue;
  const janCode = normalizeJanCode(listing.janCode);
  const baseProductName = normalizeBaseProductName(normalizedTitle, brand, janCode);
  const flavor = detectFlavor(normalizedTitle);
  const primaryIngredient = detectPrimaryIngredient(`${normalizedTitle} ${description}`);
  const productFunction = detectFunction(normalizedTitle);
  const purpose = detectPurpose(normalizedTitle);
  const targetAge = detectTargetAge(normalizedTitle);
  const lifeStage = detectLifeStage(normalizedTitle);
  const habitatType = detectHabitatType(`${normalizedTitle} ${description}`, targetSpecies);
  const feedingType = detectFeedingType(`${normalizedTitle} ${description}`);
  const targetSize = detectTargetSize(normalizedTitle);
  const packageType = /詰め替え|詰替え|つめかえ/.test(normalizedTitle) ? 'refill' : /本体/.test(normalizedTitle) ? 'main' : undefined;
  const canonicalKey = buildCanonicalKey({
    brand: brandIdentity,
    series,
    baseProductName,
    petGroup,
    targetSpecies,
    targetSpeciesGroup,
    targetAge,
    targetSize,
    lifeStage,
    feedingType,
    habitatType,
    flavor,
    primaryIngredient,
    purpose,
    productFunction,
  });
  const classificationConfidence = calculateClassificationConfidence({
    evidence,
    petGroup,
    targetSpecies,
    targetSpeciesGroup,
    brand,
    productFunction,
    habitatType,
    lifeStage,
    feedingType,
    candidateGroupCount: candidateGroups.size,
  });
  const mergeConfidence = calculateMergeConfidence({
    brand,
    baseProductName,
    petGroup,
    targetSpecies,
    variantSignalCount: [targetAge, targetSize, lifeStage, feedingType, habitatType, flavor, productFunction].filter(Boolean)
      .length,
  });
  const confidence = roundConfidence(Math.min(classificationConfidence, mergeConfidence));
  const issues = buildIssues({
    listing,
    query,
    evidence,
    petGroup,
    targetSpecies,
    targetSpeciesGroup,
    habitatType,
    lifeStage,
    feedingType,
    suspiciousPackageToken: packageData.suspiciousToken,
    confidence,
    candidateGroups,
  });
  const status = confidence >= 0.95 && issues.length === 0 ? 'merge_ready' : 'review_required';

  return applyReviewIssuePolicy({
    id: deterministicId('candidate', `${listing.source}:${listing.sourceItemId}:${query.id}`),
    rawListingId: listing.id,
    sourceLocale: listing.contentLocale,
    normalizedName: normalizeForDisplay(baseProductName),
    brand,
    series,
    baseProductName,
    petGroup,
    targetSpecies,
    targetSpeciesGroup,
    targetScope,
    targetSize,
    targetAge,
    lifeStage,
    habitatType,
    feedingType,
    flavor,
    primaryIngredient,
    purpose,
    productFunction,
    packageType,
    categoryId: query.categoryId,
    subcategoryId: query.subcategoryId,
    capacityValue: packageData.capacityValue,
    capacityUnit: packageData.capacityUnit,
    quantity: packageData.quantity,
    janCode,
    modelNumber: cleanOptional(listing.modelNumber),
    canonicalKey,
    classificationEvidence: evidence,
    classificationConfidence,
    mergeConfidence,
    confidence,
    status,
    issues,
  });
}

export function buildCanonicalKey(input: {
  brand?: string;
  series?: string;
  baseProductName: string;
  petGroup?: PetGroup;
  targetSpecies: string[];
  targetSpeciesGroup?: string;
  targetAge?: string;
  targetSize?: string;
  lifeStage?: LifeStage;
  feedingType?: FeedingType;
  habitatType?: HabitatType;
  flavor?: string;
  primaryIngredient?: string;
  purpose?: string;
  productFunction?: string;
}): string {
  return [
    input.brand,
    input.series,
    input.baseProductName,
    input.petGroup,
    [...input.targetSpecies].sort().join('|'),
    input.targetSpeciesGroup,
    input.targetAge,
    input.targetSize,
    input.lifeStage,
    input.feedingType,
    input.habitatType,
    input.flavor,
    input.primaryIngredient,
    input.purpose,
    input.productFunction,
  ]
    .map((value) => normalizeKeyPart(value))
    .join('::');
}

export function normalizeBaseProductName(title: string, brand?: string, janCode?: string): string {
  let result = title.normalize('NFKC').replace(/\|[\s\S]*$/, ' ');
  while (bracketedContentPattern.test(result)) result = result.replace(bracketedContentPattern, ' ');
  for (const pattern of commerceNoiseTokenPatterns) result = result.replace(pattern, ' ');
  for (const pattern of promotionPatterns) result = result.replace(pattern, ' ');
  while (packagePattern.test(result)) result = result.replace(packagePattern, ' ');
  while (packedItemCountPattern.test(result)) result = result.replace(packedItemCountPattern, ' ');
  for (const pattern of quantityPatterns) result = result.replace(pattern, ' ');
  result = result.replace(orphanedPackageOperatorPattern, ' ');
  result = result.replace(decorativeSymbolPattern, ' ');
  if (brand) result = result.replace(new RegExp(escapeRegExp(brand.normalize('NFKC')), 'ig'), ' ');
  if (janCode) result = result.replace(new RegExp(`(?<!\\d)${escapeRegExp(janCode)}(?!\\d)`, 'g'), ' ');
  return result
    .replace(/[（(［\[【「『〔〈《]\s*[）)］\]】」』〕〉》]/g, ' ')
    .replace(/[【】\[\]「」『』〔〕〈〉《》]/g, ' ')
    .replace(/[\s　]+/g, ' ')
    .replace(/^[\s・,/|｜-]+|[\s・,/|｜-]+$/g, '')
    .trim();
}

function detectSpecies(text: string, source: EvidenceSource, evidence: ClassificationEvidence): string[] {
  if (!text) return [];
  const matches: string[] = [];
  for (const item of speciesRules) {
    const match = text.match(item.pattern)?.[0];
    if (!match) continue;
    matches.push(item.code);
    evidence.targetSpecies.push({ value: item.code, source, matched: match });
    evidence.petGroup.push({ value: item.petGroup, source, matched: match });
  }
  return unique(matches);
}

function detectAliasSpecies(
  text: string,
  source: EvidenceSource,
  locale: string,
  aliases: readonly NormalizationAlias[],
  evidence: ClassificationEvidence,
): string[] {
  const matches = findNormalizationAliases(aliases, 'species', text, locale);
  for (const item of matches) {
    evidence.targetSpecies.push({ value: item.canonicalValue, source, matched: item.alias });
    if (item.contextValue && PET_GROUPS.includes(item.contextValue as PetGroup)) {
      evidence.petGroup.push({ value: item.contextValue as PetGroup, source, matched: item.alias });
    }
  }
  return matches.map((item) => item.canonicalValue);
}

function detectGroupEvidence(text: string, source: EvidenceSource, evidence: ClassificationEvidence): void {
  if (!text) return;
  for (const item of groupRules) {
    const match = text.match(item.pattern)?.[0];
    if (match) evidence.petGroup.push({ value: item.petGroup, source, matched: match });
  }
}

function detectApiCategoryEvidence(text: string, evidence: ClassificationEvidence): void {
  if (!text) return;
  for (const item of apiCategoryRules) {
    const match = text.match(item.pattern)?.[0];
    if (match) evidence.petGroup.push({ value: item.petGroup, source: 'api_category', matched: match });
  }
}

function detectSpeciesGroups(text: string, source: EvidenceSource, evidence: ClassificationEvidence): void {
  const rules: Array<[string, RegExp]> = [
    ['small_bird', /小鳥用|小型鳥用/i],
    ['medium_parrot', /中型インコ用|中型鳥用/i],
    ['large_parrot', /大型インコ用|大型鳥用/i],
  ];
  for (const [value, pattern] of rules) {
    const match = text.match(pattern)?.[0];
    if (match) evidence.targetSpeciesGroup.push({ value, source, matched: match });
  }
}

function collapseGenericSpecies(species: string[]): string[] {
  const values = new Set(species);
  if ([...values].some((value) => speciesRules.some((item) => item.code === value && item.parentCode === 'hamster'))) {
    values.delete('hamster');
  }
  if ([...values].some((value) => ['budgerigar', 'cockatiel', 'lovebird'].includes(value))) values.delete('parakeet');
  return [...values];
}

function extractPackageData(title: string): {
  capacityValue?: number;
  capacityUnit?: string;
  quantity?: number;
  suspiciousToken?: string;
} {
  const packageSource = title.replace(unitPriceNoticePattern, ' ');
  const capacity = packageSource.match(packagePattern);
  const quantity =
    quantityPatterns.map((pattern) => packageSource.match(pattern)?.[1]).find(Boolean) ??
    capacity?.[3] ??
    packageSource.match(packedItemCountPattern)?.[1];
  const capacityValue = capacity?.[1] ? Number(capacity[1]) : undefined;
  const quantityValue = quantity ? parseQuantityValue(quantity) : undefined;
  const validCapacity = capacityValue !== undefined && Number.isFinite(capacityValue) && capacityValue <= maxCapacityValue;
  const validQuantity = quantityValue !== undefined && Number.isInteger(quantityValue) && quantityValue <= maxPackageQuantity;
  return {
    capacityValue: validCapacity ? capacityValue : undefined,
    capacityUnit: validCapacity && capacity?.[2] ? normalizeCapacityUnit(capacity[2]) : undefined,
    quantity: validQuantity ? quantityValue : undefined,
    suspiciousToken:
      packageSource.match(suspiciousPackagePattern)?.[0] ??
      (!validCapacity && capacity?.[0] ? capacity[0] : undefined) ??
      (!validQuantity && quantity ? quantity : undefined),
  };
}

function parseQuantityValue(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Readonly<Record<string, number>> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const units: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let digit = 0;
  for (const character of value) {
    if (digits[character] !== undefined) {
      digit = digits[character];
      continue;
    }
    const unit = units[character];
    if (!unit) return undefined;
    total += (digit || 1) * unit;
    digit = 0;
  }
  const parsed = total + digit;
  return parsed > 0 ? parsed : undefined;
}

function detectFlavor(text: string): string | undefined {
  const explicit = text.match(/([ぁ-んァ-ヶ一-龠A-Za-z]+(?:味|風味|フレーバー))/)?.[1];
  if (explicit && explicit.length <= 30) return explicit;
  return ['チキン', 'ビーフ', 'まぐろ', 'マグロ', 'かつお', 'カツオ', 'サーモン', 'りんご', 'バナナ'].find(
    (value) => text.includes(value),
  );
}

function detectPrimaryIngredient(text: string): string | undefined {
  const ingredients: Array<[string, RegExp]> = [
    ['timothy', /チモシー/i],
    ['alfalfa', /アルファルファ/i],
    ['chicken', /鶏肉|チキン/i],
    ['beef', /牛肉|ビーフ/i],
    ['lamb', /羊肉|ラム(?:肉)?/i],
    ['salmon', /鮭|サーモン/i],
    ['tuna', /まぐろ|マグロ/i],
    ['bonito', /かつお|カツオ/i],
    ['millet', /粟|あわ|ミレット/i],
    ['sunflower_seed', /ひまわり(?:の)?種/i],
    ['mealworm', /ミルワーム/i],
    ['cricket', /コオロギ/i],
  ];
  return ingredients.find(([, pattern]) => pattern.test(text))?.[0];
}

function detectFunction(text: string): string | undefined {
  return ['毛球ケア', 'ビタミンC', 'デンタルケア', '消臭', '整腸', '免疫ケア', '体重管理', '水質調整', 'コケ抑制'].find(
    (value) => text.includes(value),
  );
}

function detectPurpose(text: string): string | undefined {
  const values: Array<[string, RegExp]> = [
    ['food', /フード|ペレット|飼料|ごはん|牧草|ゼリー/],
    ['bedding', /床材|巣材|マット/],
    ['toilet', /トイレ砂|トイレシート/],
    ['care', /ケア|サプリ|ビタミン|消臭/],
    ['filter_media', /ろ材|濾材|フィルター/],
  ];
  return values.find(([, pattern]) => pattern.test(text))?.[0];
}

function detectTargetAge(text: string): string | undefined {
  if (/子猫|子犬|幼鳥|ベビー|キトン|パピー/.test(text)) return 'juvenile';
  if (/シニア|高齢|老齢|\d+歳以上/.test(text)) return 'senior';
  if (/成猫|成犬|アダルト/.test(text)) return 'adult';
  if (/全年齢|オールステージ/.test(text)) return 'all_ages';
  return undefined;
}

function detectLifeStage(text: string): LifeStage | undefined {
  if (/卵用|卵期/.test(text)) return 'egg';
  if (/幼虫/.test(text)) return 'larva';
  if (/蛹|さなぎ/.test(text)) return 'pupa';
  if (/成虫/.test(text)) return 'adult';
  if (/全ステージ|全成長段階/.test(text)) return 'all_stages';
  if (/子猫|子犬|幼鳥|稚魚|ベビー/.test(text)) return 'juvenile';
  return undefined;
}

function detectHabitatType(text: string, targetSpecies: string[]): HabitatType | undefined {
  if (/淡水・海水両用|淡水海水両用|淡海両用/.test(text)) return 'both';
  if (/汽水/.test(text)) return 'brackish';
  if (/海水専用|海水用|海水魚/.test(text)) return 'marine';
  if (/淡水専用|淡水用|淡水魚/.test(text)) return 'freshwater';
  if (targetSpecies.some((value) => ['goldfish', 'medaka', 'betta', 'freshwater_fish', 'crayfish'].includes(value))) {
    return 'freshwater';
  }
  if (targetSpecies.includes('marine_fish')) return 'marine';
  return undefined;
}

function detectFeedingType(text: string): FeedingType | undefined {
  if (/草食/.test(text)) return 'herbivore';
  if (/肉食/.test(text)) return 'carnivore';
  if (/雑食/.test(text)) return 'omnivore';
  if (/昆虫食|食虫/.test(text)) return 'insectivore';
  if (/専用食|専用フード/.test(text)) return 'species_specific';
  return undefined;
}

function detectTargetSize(text: string): string | undefined {
  if (/小型(?:種|犬|鳥|インコ)|小粒/.test(text)) return 'small';
  if (/中型(?:種|犬|鳥|インコ)|中粒/.test(text)) return 'medium';
  if (/大型(?:種|犬|鳥|インコ)|大粒/.test(text)) return 'large';
  return undefined;
}

function calculateClassificationConfidence(input: {
  evidence: ClassificationEvidence;
  petGroup?: PetGroup;
  targetSpecies: string[];
  targetSpeciesGroup?: string;
  brand?: string;
  productFunction?: string;
  habitatType?: HabitatType;
  lifeStage?: LifeStage;
  feedingType?: FeedingType;
  candidateGroupCount: number;
}): number {
  const titleSpecies = input.evidence.targetSpecies.some((item) => item.source === 'title');
  const descriptionConfirmsSpecies = input.evidence.targetSpecies.some((item) => item.source === 'description');
  const titleGroup = input.evidence.petGroup.some((item) => item.source === 'title');
  const descriptionGroup = input.evidence.petGroup.some((item) => item.source === 'description');
  let score = 0.1;
  if (input.petGroup) score += 0.15;
  if (titleSpecies) score += 0.3;
  if (descriptionConfirmsSpecies) score += 0.15;
  if (!titleSpecies && (titleGroup || input.targetSpeciesGroup)) score += 0.1;
  if (descriptionGroup) score += 0.05;
  if (input.brand) score += 0.1;
  if (input.productFunction || input.habitatType || input.lifeStage || input.feedingType) score += 0.05;
  if (input.candidateGroupCount === 1) score += 0.1;
  if (input.targetSpecies.length === 0) score = Math.min(score, 0.74);
  if (input.candidateGroupCount !== 1) score = Math.min(score, 0.6);
  return roundConfidence(Math.min(score, 1));
}

function calculateMergeConfidence(input: {
  brand?: string;
  baseProductName: string;
  petGroup?: PetGroup;
  targetSpecies: string[];
  variantSignalCount: number;
}): number {
  const score =
    (input.brand ? 0.25 : 0) +
    (normalizeKeyPart(input.baseProductName).length >= 5 ? 0.35 : 0.15) +
    (input.petGroup ? 0.15 : 0) +
    (input.targetSpecies.length > 0 ? 0.15 : 0) +
    (input.variantSignalCount > 0 ? 0.1 : 0.05);
  return roundConfidence(Math.min(score, 1));
}

function buildIssues(input: {
  listing: StoredListingLike;
  query: ProductSearchQuery;
  evidence: ClassificationEvidence;
  petGroup?: PetGroup;
  targetSpecies: string[];
  targetSpeciesGroup?: string;
  habitatType?: HabitatType;
  lifeStage?: LifeStage;
  feedingType?: FeedingType;
  suspiciousPackageToken?: string;
  confidence: number;
  candidateGroups: Set<PetGroup>;
}): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const text = `${input.listing.rawTitle} ${input.listing.rawDescription ?? ''}`;
  const add = (issueType: ReviewIssue['issueType'], issueDetail: string, suggestedAction: string) => {
    if (!issues.some((item) => item.issueType === issueType)) issues.push({ issueType, issueDetail, suggestedAction });
  };
  if (input.candidateGroups.size > 1) {
    add('multiple_pet_groups_detected', `複数のpet_group候補を検出: ${[...input.candidateGroups].join(', ')}`, '公式の対象動物表記を確認する。');
  }
  if (input.candidateGroups.has('rabbit') && input.candidateGroups.has('small_animal')) {
    add('rabbit_or_small_animal_unclear', 'うさぎと小動物の両方を示す表記を検出した。', 'うさぎ専用か、具体的な小動物との共用品かを確認する。');
  }
  if (input.targetSpecies.length === 0) {
    add('target_species_unknown', '商品名・説明から具体的な対象種を確認できない。', 'メーカー公式の商品説明で対象種を確認する。');
  }
  if (input.petGroup === 'small_animal' && input.targetSpecies.length === 0) {
    add('small_animal_scope_unclear', '「小動物」以外の具体的な対象種が確認できない。', 'group_wideにせず、具体的な対象種が確認できるまで保留する。');
  }
  if (input.petGroup === 'bird' && input.targetSpecies.length === 0 && !input.targetSpeciesGroup) {
    add('bird_species_unknown', '鳥種・対象鳥サイズのいずれも確認できない。', '鳥種またはsmall/medium/largeの対象グループを確認する。');
  }
  if (input.petGroup === 'aquarium' && !input.habitatType && !input.targetSpecies.includes('aquatic_plant')) {
    add('freshwater_or_marine_unknown', '淡水・海水・汽水の適合性を確認できない。', 'メーカー仕様でhabitat_typeを確認する。');
  }
  if (input.petGroup === 'insect' && /フード|ゼリー|マット|菌糸|飼育材/.test(text) && !input.lifeStage) {
    add('life_stage_unknown', '昆虫用品の対象成長段階を確認できない。', '幼虫用・成虫用・全ステージ用の別を確認する。');
  }
  if (input.petGroup === 'reptile_amphibian' && /フード|餌|飼料/.test(text) && !input.feedingType) {
    add('feeding_type_unknown', '爬虫類・両生類フードの対象食性を確認できない。', '草食・肉食・雑食・昆虫食等を公式情報で確認する。');
  }
  if (input.suspiciousPackageToken) {
    add(
      'package_data_suspicious',
      `容量・入数として不正な表記候補「${input.suspiciousPackageToken}」を検出した。`,
      'JAN・型番と容量表記の連結を確認し、正しい容量・入数を販売情報へ設定する。',
    );
  }
  const negativeHit = input.query.negativeKeywords.find((word) => word && text.includes(word));
  if ((input.petGroup && input.petGroup !== input.query.petGroup) || negativeHit) {
    add(
      'possible_wrong_search_result',
      negativeHit
        ? `除外キーワード「${negativeHit}」を検出した。`
        : `検索pet_group=${input.query.petGroup}と判定pet_group=${input.petGroup}が一致しない。`,
      '検索結果として妥当か確認し、誤取得なら除外する。',
    );
  }
  if (input.confidence < 0.95) {
    add('variant_merge_uncertain', `分類・統合confidence=${input.confidence.toFixed(2)}`, 'バリエーション差と統合先を人手で確認する。');
  }
  return issues;
}

type StoredListingLike = RetailerListingInput & { id: string };

function rule(code: string, petGroup: PetGroup, pattern: RegExp, parentCode?: string): SpeciesRule {
  return { code, petGroup, pattern, parentCode };
}

function normalizeCapacityUnit(unit: string): string {
  const normalized = unit.toLowerCase();
  if (normalized === 'l' || normalized === 'ℓ') return 'L';
  if (normalized === 'ml' || normalized === 'cc') return 'ml';
  return normalized;
}

function normalizeForDisplay(value: string): string {
  return value.normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
}

function normalizeKeyPart(value: string | undefined): string {
  if (!value) return '-';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　\-_/・,，.。()（）[\]【】'"“”]/g, '');
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function cleanOptional(value: string | undefined): string | undefined {
  const normalized = value?.normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
  return normalized || undefined;
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
