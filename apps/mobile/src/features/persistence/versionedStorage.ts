import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  decodeStorageJson,
  encodeStorageJson,
  StorageSchema,
  UnsupportedStorageVersionError,
} from './storageCodec';

export function storageRecoveryBackupKey(key: string): string {
  return `${key}:recovery-backup`;
}

export async function hasVersionedStorage(key: string): Promise<boolean> {
  return (await AsyncStorage.getItem(key)) !== null;
}

export async function readVersionedStorage<T>(key: string, schema: StorageSchema<T>): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return schema.fallback();

  try {
    const decoded = decodeStorageJson(raw, schema);
    if (decoded.shouldRewrite) {
      await AsyncStorage.multiSet([
        [storageRecoveryBackupKey(key), raw],
        [key, encodeStorageJson(decoded.value, schema)],
      ]);
    }
    return decoded.value;
  } catch (error) {
    if (error instanceof UnsupportedStorageVersionError) {
      console.warn(`[storage] ${key} uses a newer data version; preserving the original value.`);
      return schema.fallback();
    }

    const fallback = schema.fallback();
    console.warn(`[storage] ${key} was invalid; moved the original value to its recovery backup.`);
    await AsyncStorage.multiSet([
      [storageRecoveryBackupKey(key), raw],
      [key, encodeStorageJson(fallback, schema)],
    ]);
    return fallback;
  }
}

export async function writeVersionedStorage<T>(
  key: string,
  value: T,
  schema: StorageSchema<T>,
): Promise<void> {
  await AsyncStorage.setItem(key, encodeStorageJson(value, schema));
}

export async function writeVersionedStorageBatch(
  entries: { key: string; value: unknown; schema: StorageSchema<unknown> }[],
): Promise<void> {
  await AsyncStorage.multiSet(
    entries.map(({ key, value, schema }) => [key, encodeStorageJson(value, schema)]),
  );
}

export async function removeVersionedStorage(key: string): Promise<void> {
  await AsyncStorage.multiRemove([key, storageRecoveryBackupKey(key)]);
}
