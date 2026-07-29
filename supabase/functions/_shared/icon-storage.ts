export const managedIconRoots = ['cats', 'products'] as const;

export type ManagedIconRoot = (typeof managedIconRoots)[number];

export type StorageObject = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

const emptyFolderPlaceholder = '.emptyFolderPlaceholder';

export function isSafeStorageSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  );
}

export function isStorageFolder(object: StorageObject): boolean {
  return object.id === null && isSafeStorageSegment(object.name);
}

export function isStorageFile(object: StorageObject): boolean {
  return (
    typeof object.id === 'string' &&
    object.id.length > 0 &&
    object.name !== emptyFolderPlaceholder &&
    isSafeStorageSegment(object.name)
  );
}

export function buildManagedIconPath(
  root: ManagedIconRoot,
  userId: string,
  ownerId: string,
  fileName: string,
): string | undefined {
  if (![userId, ownerId, fileName].every(isSafeStorageSegment) || fileName === emptyFolderPlaceholder) {
    return undefined;
  }
  return `${root}/${userId}/${ownerId}/${fileName}`;
}

export function isManagedIconPath(path: string): boolean {
  const [root, userId, ownerId, fileName, ...rest] = path.split('/');
  return (
    rest.length === 0 &&
    managedIconRoots.includes(root as ManagedIconRoot) &&
    Boolean(buildManagedIconPath(root as ManagedIconRoot, userId, ownerId, fileName))
  );
}

export function isManagedUserIconPath(path: string, userId: string): boolean {
  if (!isSafeStorageSegment(userId) || !isManagedIconPath(path)) return false;
  return path.split('/')[1] === userId;
}

export function isOlderThanCutoff(object: StorageObject, cutoff: string): boolean {
  const timestamp = object.created_at ?? object.updated_at;
  if (!timestamp) return false;
  const timestampMs = Date.parse(timestamp);
  const cutoffMs = Date.parse(cutoff);
  return Number.isFinite(timestampMs) && Number.isFinite(cutoffMs) && timestampMs < cutoffMs;
}
