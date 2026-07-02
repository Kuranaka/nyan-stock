import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';

import { Cat } from './catTypes';

export async function getCats(): Promise<Cat[]> {
  const raw = await AsyncStorage.getItem(storageKeys.cats);
  return raw ? (JSON.parse(raw) as Cat[]) : [];
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
  const cats = await getCats();
  const next = cats.some((item) => item.id === cat.id)
    ? cats.map((item) => (item.id === cat.id ? cat : item))
    : [cat, ...cats];
  await AsyncStorage.setItem(storageKeys.cats, JSON.stringify(next));
}

export async function deleteCat(id: string): Promise<void> {
  const cats = await getCats();
  await AsyncStorage.setItem(storageKeys.cats, JSON.stringify(cats.filter((cat) => cat.id !== id)));
}

export async function clearCats(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.cats);
}
