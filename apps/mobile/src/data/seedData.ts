import { Cat } from '@/features/cats/catTypes';
import { saveCat } from '@/features/cats/catStorage';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import { saveInventoryItem } from '@/features/inventory/inventoryStorage';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { nowIso, todayIso } from '@/utils/date';
import { createId } from '@/utils/validation';

export function createSeedCat(): Cat {
  const now = nowIso();
  return {
    id: createId('cat'),
    name: 'ミルク',
    petType: 'cat',
    gender: 'unknown',
    memo: '開発用サンプルです',
    createdAt: now,
    updatedAt: now,
  };
}

export function createSeedInventory(catId: string): InventoryItem[] {
  const now = nowIso();
  const today = todayIso();
  return [
    {
      id: createId('item'),
      catId,
      name: 'いつものドライフード',
      category: 'dry_food',
      amount: 2000,
      unit: 'g',
      dailyUsage: 80,
      purchaseDate: today,
      openedDate: today,
      notifyBeforeDays: [7, 3, 1],
      purchaseLinks: {},
      memo: 'サンプル商品',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createId('item'),
      catId,
      name: '固まる猫砂',
      category: 'cat_litter',
      amount: 7,
      unit: 'L',
      dailyUsage: 0.5,
      purchaseDate: today,
      openedDate: today,
      notifyBeforeDays: [7, 3, 1],
      purchaseLinks: {},
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export async function insertSeedData(): Promise<{ cat: Cat; items: InventoryItem[] }> {
  const cat = createSeedCat();
  const items = createSeedInventory(cat.id);

  await saveCat(cat);
  await Promise.all(items.map((item) => saveInventoryItem(item)));
  const settings = await getSettings();
  await updateSettings({ onboardingCompleted: true, selectedCatId: settings.selectedCatId ?? cat.id });

  return { cat, items };
}
