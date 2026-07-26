import { InventoryCategory, InventoryUnit } from '@/features/inventory/inventoryTypes';

export const categoryLabels: Record<InventoryCategory, string> = {
  dry_food: 'フード・主食',
  wet_food: '副食・補助食',
  treat: 'おやつ',
  cat_litter: 'トイレ・床材',
  supplement: 'サプリ・添加剤',
  medicine: '特別食',
  care: '飼育・ケア用品',
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
