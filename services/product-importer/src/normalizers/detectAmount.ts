import { ProductUnit } from '../types.js';

const unitMap: Record<string, ProductUnit> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  袋: 'bag',
  本: 'piece',
  個: 'piece',
  枚: 'piece',
};

export function detectAmount(text: string): { amount: number; unit: ProductUnit } | undefined {
  const normalized = text.normalize('NFKC').toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|袋|本|個|枚)(?:\s*[x×]\s*(\d+))?/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = unitMap[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || !unit) return undefined;

  // TODO: 複数個セットや「85g×12袋」は総量/単品量のどちらを採用するか用途別に精度改善する。
  return { amount, unit };
}
