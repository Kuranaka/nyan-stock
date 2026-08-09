import { storageKeys } from '@/features/storageKeys';
import { householdSyncStorageSchema } from '@/features/persistence/storageSchemas';
import {
  readVersionedStorage,
  removeVersionedStorage,
  writeVersionedStorage,
} from '@/features/persistence/versionedStorage';

import { HouseholdSyncState } from './householdSyncTypes';

export async function getHouseholdSyncState(): Promise<HouseholdSyncState | undefined> {
  return readVersionedStorage(storageKeys.householdSync, householdSyncStorageSchema);
}

export async function saveHouseholdSyncState(state: HouseholdSyncState): Promise<void> {
  await writeVersionedStorage(storageKeys.householdSync, state, householdSyncStorageSchema);
}

export async function clearHouseholdSyncState(): Promise<void> {
  await removeVersionedStorage(storageKeys.householdSync);
}
