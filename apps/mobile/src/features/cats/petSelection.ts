import { allPetsSelectionKey } from '@/features/settings/settingsTypes';

import { Cat } from './catTypes';

export function resolveSelectedCatId(cats: Cat[], storedCatId?: string): string | undefined {
  if (storedCatId === allPetsSelectionKey) return undefined;
  if (cats.some((cat) => cat.id === storedCatId)) return storedCatId;
  return cats.length === 1 ? cats[0]?.id : undefined;
}

export function toStoredCatId(catId?: string): string {
  return catId ?? allPetsSelectionKey;
}
