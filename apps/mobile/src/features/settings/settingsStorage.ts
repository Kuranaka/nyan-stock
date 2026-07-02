import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';

import { AppSettings, defaultSettings } from './settingsTypes';

export async function getSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(storageKeys.settings);
  return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) } : defaultSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(storageKeys.settings, JSON.stringify(settings));
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export async function clearSettings(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.settings);
}
