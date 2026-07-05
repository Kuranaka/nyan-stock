import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';

import { AuthSession } from './authTypes';

export async function getAuthSession(): Promise<AuthSession | undefined> {
  const raw = await AsyncStorage.getItem(storageKeys.authSession);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return undefined;
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await AsyncStorage.setItem(storageKeys.authSession, JSON.stringify(session));
}

export async function clearAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.authSession);
}
