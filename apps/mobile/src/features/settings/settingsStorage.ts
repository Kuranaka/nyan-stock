import { storageKeys } from '@/features/storageKeys';
import { settingsStorageSchema } from '@/features/persistence/storageSchemas';
import {
  hasVersionedStorage,
  readVersionedStorage,
  removeVersionedStorage,
  writeVersionedStorage,
} from '@/features/persistence/versionedStorage';

import { AppSettings } from './settingsTypes';

export const onboardingVisibilityEventName = 'nyan-stock:onboarding-visibility-changed';

export async function getSettings(): Promise<AppSettings> {
  return readVersionedStorage(storageKeys.settings, settingsStorageSchema);
}

export async function hasSavedSettings(): Promise<boolean> {
  return hasVersionedStorage(storageKeys.settings);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeVersionedStorage(storageKeys.settings, settings, settingsStorageSchema);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export async function clearSettings(): Promise<void> {
  await removeVersionedStorage(storageKeys.settings);
}
