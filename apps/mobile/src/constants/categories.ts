import { InventoryCategory, InventoryUnit } from '@/features/inventory/inventoryTypes';

export const categoryLabels: Record<InventoryCategory, string> = {
  dry_food: 'ドライフード',
  wet_food: 'ウェットフード',
  treat: 'おやつ',
  cat_litter: '猫砂',
  supplement: 'サプリ',
  medicine: '薬',
  care: 'ケア用品',
  other: 'その他',
};

export const categories = Object.entries(categoryLabels).map(([value, label]) => ({
  value: value as InventoryCategory,
  label,
}));

export const units: InventoryUnit[] = ['g', 'kg', 'ml', 'L', 'piece', 'bag'];

export const unitLabels: Record<InventoryUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  piece: '個',
  bag: '袋',
};

export const defaultUnitByCategory: Record<InventoryCategory, InventoryUnit> = {
  dry_food: 'g',
  wet_food: 'piece',
  treat: 'g',
  cat_litter: 'L',
  supplement: 'piece',
  medicine: 'piece',
  care: 'piece',
  other: 'piece',
};
