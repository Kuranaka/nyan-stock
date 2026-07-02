const knownBrands = [
  'ロイヤルカナン',
  'ピュリナ',
  'ニュートロ',
  'ヒルズ',
  '銀のスプーン',
  'モンプチ',
  'カルカン',
  'シーバ',
  'ちゅ〜る',
  'ちゅーる',
  'チャオ',
  'CIAO',
  'デオトイレ',
  'ニャンとも',
  'ライオン',
  'アイリスオーヤマ',
  'トフカスサンド',
  'エバークリーン',
];

export function detectBrand(text: string): string | undefined {
  const normalized = text.normalize('NFKC').toLowerCase();
  return knownBrands.find((brand) => normalized.includes(brand.normalize('NFKC').toLowerCase()));
}
