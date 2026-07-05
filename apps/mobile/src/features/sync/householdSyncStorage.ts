import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/features/storageKeys';

import { HouseholdSyncState } from './householdSyncTypes';

export async function getHouseholdSyncState(): Promise<HouseholdSyncState | undefined> {
  const raw = await AsyncStorage.getItem(storageKeys.householdSync);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as HouseholdSyncState;
  } catch {
    return undefined;
  }
}

export async function saveHouseholdSyncState(state: HouseholdSyncState): Promise<void> {
  await AsyncStorage.setItem(storageKeys.householdSync, JSON.stringify(state));
}

export async function clearHouseholdSyncState(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.householdSync);
}
