import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCanonicalKey, normalizeRetailerListing } from './normalizeListing.js';
import { ProductSearchQuery, RetailerListingInput, StoredRetailerListing } from './types.js';

test('capacity and quantity stay on the listing candidate but do not split the canonical product', () => {
  const query = makeQuery('small_animal', 'hamster', 'ハムスター フード');
  const small = normalizeRetailerListing(
    makeListing('ブランドA ハムスターフード 500g', 'ハムスター専用フードです。', query, { brandName: 'ブランドA' }),
    query,
  );
  const large = normalizeRetailerListing(
    makeListing('ブランドA ハムスターフード 1kg×3袋 送料無料', 'ハムスター専用フードです。', query, {
      brandName: 'ブランドA',
      sourceItemId: 'large',
    }),
    query,
  );
  const approximate = normalizeRetailerListing(
    makeListing('ブランドA ハムスターフード 1L (約705g)', 'ハムスター専用フードです。', query, {
      brandName: 'ブランドA',
      sourceItemId: 'approximate',
    }),
    query,
  );

  assert.equal(small.capacityValue, 500);
  assert.equal(small.capacityUnit, 'g');
  assert.equal(large.capacityValue, 1);
  assert.equal(large.capacityUnit, 'kg');
  assert.equal(large.quantity, 3);
  assert.equal(small.canonicalKey, large.canonicalKey);
  assert.equal(small.canonicalKey, approximate.canonicalKey);
  assert.doesNotMatch(large.baseProductName, /1kg|3袋|送料無料/);
  assert.doesNotMatch(approximate.baseProductName, /1L|約705g|\(\s*\)/);
});

test('JAN followed by an ML-prefixed model number is not parsed as capacity', () => {
  const query = {
    ...makeQuery('rabbit', 'rabbit', 'うさぎ 牧草'),
    negativeKeywords: ['フィーダー', 'かじり木'],
  };
  const candidate = normalizeRetailerListing(
    makeListing(
      'サンライズ 4906456577973 ML－468 うさぎの牧草用かじり木フィーダー L',
      'うさぎ用の牧草フィーダーです。',
      query,
      { brandName: 'サンライズ', janCode: '4906456577973' },
    ),
    query,
  );

  assert.equal(candidate.capacityValue, undefined);
  assert.equal(candidate.capacityUnit, undefined);
  assert.equal(candidate.janCode, '4906456577973');
  assert.doesNotMatch(candidate.baseProductName, /4906456577973/);
  assert.match(candidate.baseProductName, /ML-468/);
  assert.equal(candidate.status, 'rejected');
  assert.ok(candidate.issues.some((issue) => issue.issueType === 'package_data_suspicious'));
  assert.ok(candidate.issues.some((issue) => issue.issueType === 'possible_wrong_search_result'));
});

test('package counts are removed without leaving 入り fragments', () => {
  const query = makeQuery('rabbit', 'rabbit', 'うさぎ おやつ');
  const twoPack = normalizeRetailerListing(
    makeListing('うさぎ用 にんじんおやつ (二個入り)', 'うさぎ用です。', query, { sourceItemId: 'two-pack' }),
    query,
  );
  const twentyBags = normalizeRetailerListing(
    makeListing('うさぎ用 チモシー 20g×20袋入', 'うさぎ用です。', query, { sourceItemId: 'twenty-bags' }),
    query,
  );
  const fourPieces = normalizeRetailerListing(
    makeListing('うさぎ用 かじり木 (4コ入)', 'うさぎ用です。', query, { sourceItemId: 'four-pieces' }),
    query,
  );
  const fourHalfWidthPieces = normalizeRetailerListing(
    makeListing('うさぎ用 かじり木 4ｺ入り', 'うさぎ用です。', query, { sourceItemId: 'four-half-width-pieces' }),
    query,
  );
  const twentySets = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ (20セット入り)', 'うさぎ用です。', query, { sourceItemId: 'twenty-sets' }),
    query,
  );
  const twentyCapacitySets = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ 20g×20セット入り', 'うさぎ用です。', query, { sourceItemId: 'twenty-capacity-sets' }),
    query,
  );
  const oneFullWidthSet = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ １セットで', 'うさぎ用です。', query, { sourceItemId: 'one-full-width-set' }),
    query,
  );
  const twoItemPack = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ 2個パック', 'うさぎ用です。', query, { sourceItemId: 'two-item-pack' }),
    query,
  );
  const twoByThreeBagsWithAsciiX = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ 2個 x 3袋', 'うさぎ用です。', query, { sourceItemId: 'two-by-three-ascii-x' }),
    query,
  );
  const twoByThreeBagsWithAsterisk = normalizeRetailerListing(
    makeListing('うさぎ用 牧草おやつ 2個 * 3袋', 'うさぎ用です。', query, { sourceItemId: 'two-by-three-asterisk' }),
    query,
  );
  const slashFortySheets = normalizeRetailerListing(
    makeListing('猫用 システムトイレ 消臭シート /40枚入 ペットシーツ', '猫用です。', makeQuery('cat', 'cat', '猫 シーツ'), {
      sourceItemId: 'slash-forty-sheets',
    }),
    makeQuery('cat', 'cat', '猫 シーツ'),
  );
  const multipleSlashSheetCounts = normalizeRetailerListing(
    makeListing(
      'ファインキャット 炭の消臭シート 猫用 20枚入/40枚入 ペットシーツ',
      '猫用です。',
      makeQuery('cat', 'cat', '猫 シーツ'),
      { sourceItemId: 'multiple-slash-sheet-counts' },
    ),
    makeQuery('cat', 'cat', '猫 シーツ'),
  );

  assert.equal(twoPack.quantity, 2);
  assert.doesNotMatch(twoPack.baseProductName, /二個|入り|\(\s*り\s*\)/);
  assert.equal(twentyBags.capacityValue, 20);
  assert.equal(twentyBags.capacityUnit, 'g');
  assert.equal(twentyBags.quantity, 20);
  assert.doesNotMatch(twentyBags.baseProductName, /20g|20袋|袋入|(?:^|\s)入(?:$|\s)/);
  for (const candidate of [fourPieces, fourHalfWidthPieces]) {
    assert.equal(candidate.quantity, 4);
    assert.doesNotMatch(candidate.baseProductName, /4コ|コ入|入り|[（(]\s*[）)]/);
  }
  assert.equal(twentySets.quantity, 20);
  assert.doesNotMatch(twentySets.baseProductName, /20セット|セット入り|(?:^|\s)入り(?:$|\s)/);
  assert.equal(twentyCapacitySets.capacityValue, 20);
  assert.equal(twentyCapacitySets.capacityUnit, 'g');
  assert.equal(twentyCapacitySets.quantity, 20);
  assert.doesNotMatch(twentyCapacitySets.baseProductName, /20g|20セット|セット入り|(?:^|\s)入り(?:$|\s)/);
  assert.equal(oneFullWidthSet.quantity, 1);
  assert.equal(oneFullWidthSet.baseProductName, 'うさぎ用 牧草おやつ');
  assert.doesNotMatch(oneFullWidthSet.baseProductName, /(?:^|\s)1(?:$|\s)|セット|(?:^|\s)で(?:$|\s)/);
  assert.equal(twoItemPack.quantity, 2);
  assert.equal(twoItemPack.baseProductName, 'うさぎ用 牧草おやつ');
  for (const candidate of [twoByThreeBagsWithAsciiX, twoByThreeBagsWithAsterisk]) {
    assert.equal(candidate.quantity, 3);
    assert.equal(candidate.baseProductName, 'うさぎ用 牧草おやつ');
    assert.doesNotMatch(candidate.baseProductName, /[×x＊*]/);
  }
  assert.equal(slashFortySheets.quantity, 40);
  assert.equal(slashFortySheets.baseProductName, '猫用 システムトイレ 消臭シート ペットシーツ');
  assert.doesNotMatch(multipleSlashSheetCounts.baseProductName, /20枚|40枚|枚入|[/／]/);
  assert.equal(multipleSlashSheetCounts.baseProductName, 'ファインキャット 炭の消臭シート 猫用 ペットシーツ');
  assert.equal(multipleSlashSheetCounts.quantity, undefined);
  assert.ok(multipleSlashSheetCounts.issues.some((issue) => issue.issueType === 'package_data_suspicious'));
});

test('standalone uppercase X in a product name is preserved', () => {
  const query = makeQuery('aquarium', undefined, 'アクアリウム 活性炭');
  const candidate = normalizeRetailerListing(
    makeListing('Organic X オーガニックX 有機物吸着剤 1000ml', '淡水・海水用です。', query),
    query,
  );

  assert.equal(candidate.baseProductName, 'Organic X オーガニックX 有機物吸着剤');
});

test('all supported brackets and their contents are removed from the base product name', () => {
  const query = makeQuery('cat', 'cat', '猫 おやつ');
  const candidate = normalizeRetailerListing(
    makeListing(
      '猫用おやつ（限定まぐろ味） プレミアム (旧パッケージ【在庫限り】) [旧] ［終売］ {訳あり} ｛特価｝ 【通販限定】 「まぐろ味」 『増量』 〔見本〕 〈注意〉 《正規品》 <旧仕様> ＜販路限定＞ 〖広告〗 〘補足〙 〚注記〛 20g',
      '猫用のおやつです。',
      query,
    ),
    query,
  );

  assert.equal(candidate.capacityValue, 20);
  assert.equal(candidate.capacityUnit, 'g');
  assert.equal(candidate.baseProductName, '猫用おやつ プレミアム');
  assert.doesNotMatch(
    candidate.baseProductName,
    /[（）()[\]［］{}｛｝【】「」『』〔〕〈〉《》<>＜＞〖〗〘〙〚〛]|限定まぐろ味|旧パッケージ|在庫限り|通販限定/,
  );
});

test('commerce and dated noise tokens are removed as whole phrases', () => {
  const query = makeQuery('cat', 'cat', '猫 ケア');
  const candidate = normalizeRetailerListing(
    makeListing(
      '7/5 20:00〜 最大400円クーポン ポイント10倍 要エントリー 当選確率2倍 送料無料 激安セール 格安品 とても安い 猫用 毎日キレイ ケアシート お試しサイズ おまけ付き 特別価格 数量限定 賞味期限 2027年5月 お一人様2点限り 最短翌日配送 ※画像はイメージです 20枚',
      '猫用ケアシートです。',
      query,
    ),
    query,
  );

  assert.equal(candidate.quantity, 20);
  assert.equal(candidate.baseProductName, '猫用 毎日キレイ ケアシート');
  assert.doesNotMatch(
    candidate.baseProductName,
    /7\/5|20:00|クーポン|ポイント|エントリー|確率|無料|安い|激安|格安|お試し|おまけ|価格|限定|賞味期限|2027年5月|一人様|配送|※|画像はイメージ/,
  );
});

test('decorative symbols are removed without deleting meaningful ASCII operators', () => {
  const query = makeQuery('cat', 'cat', '猫 ケア');
  const candidate = normalizeRetailerListing(
    makeListing('♢ △ ★ ◇ ◆ ☆ 猫用 Ag+ ケア&シート 20枚', '猫用ケアシートです。', query),
    query,
  );

  assert.equal(candidate.quantity, 20);
  assert.equal(candidate.baseProductName, '猫用 Ag+ ケア&シート');
  assert.doesNotMatch(candidate.baseProductName, /[♢△★◇◆☆]/);
});

test('a pipe and everything to its right are removed from the base product name', () => {
  const query = makeQuery('cat', 'cat', '猫 ケア');
  const halfWidth = normalizeRetailerListing(
    makeListing('猫用 ケアシート 20枚 | 送料無料 商品説明', '猫用ケアシートです。', query),
    query,
  );
  const fullWidth = normalizeRetailerListing(
    makeListing('猫用 ケアシート 20枚 ｜ 右側の補足', '猫用ケアシートです。', query, { sourceItemId: 'full-width-pipe' }),
    query,
  );

  for (const candidate of [halfWidth, fullWidth]) {
    assert.equal(candidate.quantity, 20);
    assert.equal(candidate.baseProductName, '猫用 ケアシート');
    assert.doesNotMatch(candidate.baseProductName, /[|｜]|送料無料|商品説明|右側の補足/);
  }
});

test('shipping and refrigerated-distribution noise is removed', () => {
  const query = makeQuery('insect', undefined, '昆虫 菌糸ビン');
  const refrigerated = normalizeRetailerListing(
    makeListing(
      '冷蔵★菌糸ビン　Ｇ−ｐｏｔ　５５０ｃｃ　１０本　別途クール手数料　常温商品同梱不可',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'refrigerated-kinshi' },
    ),
    query,
  );
  const restrictedShipping = normalizeRetailerListing(
    makeListing(
      '代引不可 北海道・沖縄・離島配送不可 昆虫ゼリー 50個入',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'shipping-restricted' },
    ),
    query,
  );
  const purchaseNotice = normalizeRetailerListing(
    makeListing(
      '昆虫ゼリー お一人様10点限り ※商品説明をよくお読みの上、ご注文下さい。',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'purchase-notice' },
    ),
    query,
  );
  const purchaseNoticeVariant = normalizeRetailerListing(
    makeListing(
      '昆虫マット 御一人様二点まで 商品説明を必ずお読みの上、ご購入ください',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'purchase-notice-variant' },
    ),
    query,
  );
  const valuePromotion = normalizeRetailerListing(
    makeListing(
      '昆虫ゼリー お買い得 徳用 1個分お得',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'value-promotion' },
    ),
    query,
  );
  const valuePromotionVariant = normalizeRetailerListing(
    makeListing(
      '昆虫マット お買得 お徳用パック 二袋分お得',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'value-promotion-variant' },
    ),
    query,
  );
  const emptyJapaneseBrackets = normalizeRetailerListing(
    makeListing(
      '「代引不可」〔同梱不可〕昆虫ゼリー 『徳用』',
      '昆虫飼育用です。',
      query,
      { sourceItemId: 'empty-japanese-brackets' },
    ),
    query,
  );
  const nationwideShipping = normalizeRetailerListing(
    makeListing(
      '【全国送料350円対応】 三晃商会 ウェルバランス 小鳥のためのビタミンミネラル 20g F451',
      '小鳥用です。',
      makeQuery('bird', undefined, '鳥 サプリメント'),
      { sourceItemId: 'nationwide-shipping', brandName: '三晃商会' },
    ),
    makeQuery('bird', undefined, '鳥 サプリメント'),
  );
  const channelAndPriceNotice = normalizeRetailerListing(
    makeListing(
      '返品種別A Yahoo!限定価格 小鳥用ビタミン 価格は1個のお値段です',
      '小鳥用です。',
      makeQuery('bird', undefined, '鳥 サプリメント'),
      { sourceItemId: 'channel-price-notice' },
    ),
    makeQuery('bird', undefined, '鳥 サプリメント'),
  );

  assert.equal(refrigerated.capacityValue, 550);
  assert.equal(refrigerated.capacityUnit, 'ml');
  assert.equal(refrigerated.quantity, 10);
  assert.equal(refrigerated.baseProductName, '菌糸ビン G−pot');
  assert.doesNotMatch(refrigerated.baseProductName, /冷蔵|[★☆]|クール手数料|同梱不可/);
  assert.equal(restrictedShipping.quantity, 50);
  assert.equal(restrictedShipping.baseProductName, '昆虫ゼリー');
  assert.equal(purchaseNotice.baseProductName, '昆虫ゼリー');
  assert.equal(purchaseNoticeVariant.baseProductName, '昆虫マット');
  assert.equal(valuePromotion.baseProductName, '昆虫ゼリー');
  assert.equal(valuePromotionVariant.baseProductName, '昆虫マット');
  assert.equal(emptyJapaneseBrackets.baseProductName, '昆虫ゼリー');
  assert.doesNotMatch(emptyJapaneseBrackets.baseProductName, /[「」『』〔〕〈〉《》]/);
  assert.equal(nationwideShipping.capacityValue, 20);
  assert.equal(nationwideShipping.capacityUnit, 'g');
  assert.equal(nationwideShipping.baseProductName, 'ウェルバランス 小鳥のためのビタミンミネラル F451');
  assert.doesNotMatch(nationwideShipping.baseProductName, /全国|送料|350円|【|】/);
  assert.equal(channelAndPriceNotice.quantity, undefined);
  assert.equal(channelAndPriceNotice.baseProductName, '小鳥用ビタミン');
  assert.doesNotMatch(channelAndPriceNotice.baseProductName, /返品種別|Yahoo|限定価格|お値段/);
});

test('rabbit is an independent pet group and never becomes small_animal from the query', () => {
  const query = makeQuery('rabbit', 'rabbit', 'うさぎ ペレット');
  const candidate = normalizeRetailerListing(
    makeListing('ラビットブランド うさぎ専用ペレット 800g', 'うさぎ専用のペレットです。', query, {
      brandName: 'ラビットブランド',
    }),
    query,
  );
  assert.equal(candidate.petGroup, 'rabbit');
  assert.deepEqual(candidate.targetSpecies, ['rabbit']);
  assert.equal(candidate.targetScope, 'species_specific');
});

test('low-confidence small_animal label alone stays unconfirmed and is rejected', () => {
  const query = makeQuery('small_animal', undefined, '小動物 床材');
  const candidate = normalizeRetailerListing(
    makeListing('天然木 小動物用 床材 1kg', '小動物用です。', query),
    query,
  );
  assert.equal(candidate.petGroup, 'small_animal');
  assert.deepEqual(candidate.targetSpecies, []);
  assert.equal(candidate.targetScope, 'unconfirmed');
  assert.equal(candidate.status, 'rejected');
  assert.ok(candidate.issues.some((issue) => issue.issueType === 'small_animal_scope_unclear'));
  assert.ok(candidate.issues.some((issue) => issue.disposition === 'reject'));
});

test('multiple explicitly named species remain one multi-species product', () => {
  const query = makeQuery('small_animal', 'hamster', 'ハムスター フード');
  const candidate = normalizeRetailerListing(
    makeListing('ブランドB ハムスター・スナネズミ用フード 300g', 'ハムスター、スナネズミに対応。', query, {
      brandName: 'ブランドB',
    }),
    query,
  );
  assert.deepEqual(candidate.targetSpecies, ['gerbil', 'hamster']);
  assert.equal(candidate.targetScope, 'multi_species');
  assert.match(candidate.canonicalKey, /gerbil\|hamster/);
});

test('cross-group products remain eligible for each explicitly named search pet group', () => {
  const catQuery = makeQuery('cat', 'cat', '犬 猫 おやつ');
  const dogQuery = makeQuery('dog', 'dog', '犬 猫 おやつ');
  catQuery.negativeKeywords = ['犬', 'ドッグ'];
  dogQuery.negativeKeywords = ['猫', 'キャット'];
  const title = '犬猫用 デンタルおやつ 50g';
  const description = '犬と猫の両方に使えます。';

  const catCandidate = normalizeRetailerListing(
    makeListing(title, description, catQuery, { sourceItemId: 'dog-cat-treat-for-cat-search' }),
    catQuery,
  );
  const dogCandidate = normalizeRetailerListing(
    makeListing(title, description, dogQuery, { sourceItemId: 'dog-cat-treat-for-dog-search' }),
    dogQuery,
  );

  assert.equal(catCandidate.petGroup, 'cat');
  assert.deepEqual(catCandidate.targetSpecies, ['cat']);
  assert.doesNotMatch(catCandidate.issues.map((issue) => issue.issueType).join(' '), /multiple_pet_groups_detected/);
  assert.notEqual(catCandidate.status, 'rejected');
  assert.equal(dogCandidate.petGroup, 'dog');
  assert.deepEqual(dogCandidate.targetSpecies, ['dog']);
  assert.doesNotMatch(dogCandidate.issues.map((issue) => issue.issueType).join(' '), /multiple_pet_groups_detected/);
  assert.notEqual(dogCandidate.status, 'rejected');
});

test('a cross-group result is rejected when the searched species is not explicitly named', () => {
  const query = makeQuery('small_animal', 'ferret', 'フェレット おやつ');
  const candidate = normalizeRetailerListing(
    makeListing('犬猫ハムスター用 デンタルおやつ', '犬、猫、ハムスターに使えます。', query, {
      sourceItemId: 'cross-group-without-ferret',
    }),
    query,
  );

  assert.equal(candidate.status, 'rejected');
  assert.ok(candidate.issues.some((issue) => issue.issueType === 'multiple_pet_groups_detected'));
});

test('a title emptied by normalization is rejected instead of being merged', () => {
  const query = makeQuery('cat', 'cat', '猫用品');
  const candidate = normalizeRetailerListing(
    makeListing('【送料無料】テストブランド', '猫用の商品です。', query, {
      brandName: 'テストブランド',
      janCode: '4901234567894',
      sourceItemId: 'empty-normalized-name',
    }),
    query,
  );

  assert.equal(candidate.baseProductName, '');
  assert.equal(candidate.status, 'rejected');
  assert.ok(candidate.issues.some((issue) => issue.issueType === 'base_product_name_missing'));
});

test('an explicit title species overrides unrelated species mentioned in the description', () => {
  const query = makeQuery('small_animal', 'ferret', 'フェレット おやつ');
  const candidate = normalizeRetailerListing(
    makeListing(
      'フェレットのパパイアスティック 50g',
      '関連商品としてチンチラ用、モルモット用のおやつも販売しています。',
      query,
    ),
    query,
  );

  assert.deepEqual(candidate.targetSpecies, ['ferret']);
  assert.equal(candidate.petGroup, 'small_animal');
  assert.equal(candidate.targetScope, 'species_specific');
});

test('title habitat takes precedence over conflicting retailer description copy', () => {
  const query = makeQuery('aquarium', 'freshwater_fish', '淡水魚 水質調整剤');
  const candidate = normalizeRetailerListing(
    makeListing(
      '淡水用 コケ抑制剤 100ml',
      '関連商品には海水魚用、海水専用タイプもあります。',
      query,
    ),
    query,
  );

  assert.equal(candidate.habitatType, 'freshwater');
});

test('search target is recorded but is not used as classification evidence', () => {
  const query = makeQuery('small_animal', 'hamster', 'ハムスター 床材');
  const candidate = normalizeRetailerListing(
    makeListing('天然木ふんわり床材 1kg', '吸湿性のある床材です。', query),
    query,
  );
  assert.equal(candidate.petGroup, undefined);
  assert.deepEqual(candidate.targetSpecies, []);
  assert.deepEqual(candidate.classificationEvidence.targetSpecies, []);
  assert.equal(candidate.classificationEvidence.searchContext.targetSpecies, 'hamster');
  assert.ok(candidate.confidence < 0.75);
});

test('habitat, feeding type, life stage and bird size are canonical split dimensions', () => {
  const base = {
    brand: 'ブランドC',
    baseProductName: 'ベーシックフード',
    targetSpecies: ['other_aquarium'],
    petGroup: 'aquarium' as const,
  };
  const freshwater = buildCanonicalKey({ ...base, habitatType: 'freshwater' });
  const marine = buildCanonicalKey({ ...base, habitatType: 'marine' });
  assert.notEqual(freshwater, marine);

  const timothy = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'ベーシックペレット',
    petGroup: 'rabbit',
    targetSpecies: ['rabbit'],
    primaryIngredient: 'timothy',
    purpose: 'food',
  });
  const alfalfa = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'ベーシックペレット',
    petGroup: 'rabbit',
    targetSpecies: ['rabbit'],
    primaryIngredient: 'alfalfa',
    purpose: 'food',
  });
  assert.notEqual(timothy, alfalfa);

  const larva = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: '昆虫マット',
    petGroup: 'insect',
    targetSpecies: ['rhinoceros_beetle'],
    lifeStage: 'larva',
  });
  const adult = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: '昆虫マット',
    petGroup: 'insect',
    targetSpecies: ['rhinoceros_beetle'],
    lifeStage: 'adult',
  });
  assert.notEqual(larva, adult);

  const herbivore = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'レプタイルフード',
    petGroup: 'reptile_amphibian',
    targetSpecies: ['lizard'],
    feedingType: 'herbivore',
  });
  const insectivore = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'レプタイルフード',
    petGroup: 'reptile_amphibian',
    targetSpecies: ['lizard'],
    feedingType: 'insectivore',
  });
  assert.notEqual(herbivore, insectivore);

  const smallBird = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'バードフード',
    petGroup: 'bird',
    targetSpecies: [],
    targetSpeciesGroup: 'small_bird',
  });
  const largeParrot = buildCanonicalKey({
    brand: 'ブランドC',
    baseProductName: 'バードフード',
    petGroup: 'bird',
    targetSpecies: [],
    targetSpeciesGroup: 'large_parrot',
  });
  assert.notEqual(smallBird, largeParrot);
});

function makeQuery(
  petGroup: ProductSearchQuery['petGroup'],
  targetSpecies: string | undefined,
  keyword: string,
): ProductSearchQuery {
  return {
    id: `query-${petGroup}-${targetSpecies ?? 'broad'}`,
    petGroup,
    targetSpecies,
    categoryId: 'test-category',
    subcategoryId: 'test-subcategory',
    keyword,
    negativeKeywords: [],
    priority: 100,
    enabled: true,
    maxPages: 1,
    locale: 'ja-JP',
    marketCode: 'JP',
    currencyCode: 'JPY',
  };
}

function makeListing(
  rawTitle: string,
  rawDescription: string,
  query: ProductSearchQuery,
  overrides: Partial<RetailerListingInput> = {},
): StoredRetailerListing {
  return {
    id: `raw-${overrides.sourceItemId ?? '1'}`,
    source: 'rakuten_ichiba',
    sourceItemId: '1',
    searchQueryId: query.id,
    searchPetGroup: query.petGroup,
    searchTargetSpecies: query.targetSpecies,
    contentLocale: query.locale,
    marketCode: query.marketCode,
    currencyCode: query.currencyCode,
    rawTitle,
    rawDescription,
    fetchedAt: '2026-07-19T00:00:00.000Z',
    rawJson: {},
    ...overrides,
  };
}
