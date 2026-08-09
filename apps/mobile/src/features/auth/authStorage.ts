import { storageKeys } from '@/features/storageKeys';
import { authSessionStorageSchema } from '@/features/persistence/storageSchemas';
import {
  readVersionedStorage,
  removeVersionedStorage,
  writeVersionedStorage,
} from '@/features/persistence/versionedStorage';

import { AuthSession } from './authTypes';

export async function getAuthSession(): Promise<AuthSession | undefined> {
  return readVersionedStorage(storageKeys.authSession, authSessionStorageSchema);
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await writeVersionedStorage(storageKeys.authSession, session, authSessionStorageSchema);
}

export async function clearAuthSession(): Promise<void> {
  await removeVersionedStorage(storageKeys.authSession);
}
