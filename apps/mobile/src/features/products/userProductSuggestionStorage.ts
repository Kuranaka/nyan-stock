import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';

import { UserProductSuggestion } from './productTypes';

export async function getUserProductSuggestions(): Promise<UserProductSuggestion[]> {
  const raw = await AsyncStorage.getItem(storageKeys.userProductSuggestions);
  return raw ? (JSON.parse(raw) as UserProductSuggestion[]) : [];
}

export async function saveUserProductSuggestion(suggestion: UserProductSuggestion): Promise<void> {
  const suggestions = await getUserProductSuggestions();
  const next = suggestions.some((current) => current.id === suggestion.id)
    ? suggestions.map((current) => (current.id === suggestion.id ? suggestion : current))
    : [suggestion, ...suggestions];
  await AsyncStorage.setItem(storageKeys.userProductSuggestions, JSON.stringify(next));
}
