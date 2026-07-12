import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';
import {
  clearActiveHouseholdCats,
  deleteActiveHouseholdCat,
  getActiveHouseholdSnapshot,
  upsertActiveHouseholdCat,
} from '@/features/sync/householdSyncService';

import { Cat } from './catTypes';

let cachedCats: Cat[] | undefined;

export async function getCats(): Promise<Cat[]> {
  const snapshot = await getActiveHouseholdSnapshot();
  if (snapshot) {
    cachedCats = snapshot.cats;
    return snapshot.cats;
  }

  const raw = await AsyncStorage.getItem(storageKeys.cats);
  const cats = raw ? (JSON.parse(raw) as Cat[]) : [];
  cachedCats = cats;
  return cats;
}

export function getCachedCats(): Cat[] {
  return cachedCats ?? [];
}

export async function getPrimaryCat(): Promise<Cat | undefined> {
  const cats = await getCats();
  return cats[0];
}

export async function getCat(id: string): Promise<Cat | undefined> {
  const cats = await getCats();
  return cats.find((cat) => cat.id === id);
}

export async function saveCat(cat: Cat): Promise<void> {
  if (await upsertActiveHouseholdCat(cat)) {
    cachedCats = upsertCachedCat(cachedCats, cat);
    return;
  }

  const cats = await getCats();
  const next = cats.some((item) => item.id === cat.id)
    ? cats.map((item) => (item.id === cat.id ? cat : item))
    : [...cats, cat];
  cachedCats = next;
  await AsyncStorage.setItem(storageKeys.cats, JSON.stringify(next));
}

export async function deleteCat(id: string): Promise<void> {
  if (await deleteActiveHouseholdCat(id)) {
    cachedCats = cachedCats?.filter((cat) => cat.id !== id);
    return;
  }

  const cats = await getCats();
  const next = cats.filter((cat) => cat.id !== id);
  cachedCats = next;
  await AsyncStorage.setItem(storageKeys.cats, JSON.stringify(next));
}

export async function clearCats(): Promise<void> {
  cachedCats = undefined;
  if (await clearActiveHouseholdCats()) return;

  await AsyncStorage.removeItem(storageKeys.cats);
}

function upsertCachedCat(cats: Cat[] | undefined, cat: Cat): Cat[] {
  if (!cats) return [cat];
  return cats.some((item) => item.id === cat.id)
    ? cats.map((item) => (item.id === cat.id ? cat : item))
    : [...cats, cat];
}
