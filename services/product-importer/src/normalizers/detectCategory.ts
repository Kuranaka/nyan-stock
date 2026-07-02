import { ProductCategory } from '../types.js';

const categoryRules: Array<{ category: ProductCategory; words: string[] }> = [
  { category: 'cat_litter', words: ['猫砂', '紙砂', '鉱物', 'システムトイレ', 'トイレ砂'] },
  { category: 'toilet_sheet', words: ['トイレシート', 'ペットシート', '消臭シート'] },
  { category: 'dry_food', words: ['ドライ', 'カリカリ', '総合栄養食'] },
  { category: 'wet_food', words: ['パウチ', '缶', 'ウェット'] },
  { category: 'treat', words: ['ちゅーる', 'ちゅ〜る', 'おやつ', 'スナック'] },
  { category: 'supplement', words: ['サプリ', 'サプリメント'] },
  { category: 'care', words: ['歯みがき', '歯磨き', 'ブラシ', '爪切り', '消臭袋', 'ウェットシート'] },
];

export function detectCategory(text: string): ProductCategory {
  const normalized = text.normalize('NFKC').toLowerCase();
  return categoryRules.find((rule) => rule.words.some((word) => normalized.includes(word.toLowerCase())))
    ?.category ?? 'other';
}
