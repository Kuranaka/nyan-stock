import {
  buildManagedIconPath,
  isManagedIconPath,
  isManagedUserIconPath,
  isOlderThanCutoff,
  isSafeStorageSegment,
  isStorageFile,
  isStorageFolder,
} from './icon-storage.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('managed icon paths require the exact root/user/owner/file shape', () => {
  const path = buildManagedIconPath('cats', 'user-1', 'owner-1', '123.jpg');
  assert(path === 'cats/user-1/owner-1/123.jpg', 'valid path was not built');
  assert(isManagedIconPath(path), 'valid path was rejected');
  assert(isManagedUserIconPath(path, 'user-1'), 'owned path was rejected');
  assert(!isManagedUserIconPath(path, 'user-2'), 'another user path was accepted');
  assert(!isManagedIconPath('avatars/user-1/owner-1/123.jpg'), 'unmanaged root was accepted');
  assert(!isManagedIconPath('cats/user-1/owner-1/nested/123.jpg'), 'nested path was accepted');
  assert(!isManagedIconPath('cats/user-1/../123.jpg'), 'traversal path was accepted');
});

Deno.test('storage entries distinguish folders from files', () => {
  assert(isStorageFolder({ id: null, name: 'user-1' }), 'folder was rejected');
  assert(!isStorageFolder({ id: 'file-id', name: 'user-1' }), 'file was accepted as folder');
  assert(isStorageFile({ id: 'file-id', name: '123.jpg' }), 'file was rejected');
  assert(!isStorageFile({ id: null, name: '123.jpg' }), 'folder was accepted as file');
  assert(!isStorageFile({ id: 'file-id', name: '.emptyFolderPlaceholder' }), 'placeholder was accepted');
});

Deno.test('unsafe storage segments and files without a valid old timestamp are rejected', () => {
  assert(!isSafeStorageSegment('..'), 'traversal segment was accepted');
  assert(!isSafeStorageSegment('nested/file'), 'nested segment was accepted');
  assert(
    isOlderThanCutoff({ name: 'old.jpg', created_at: '2026-01-01T00:00:00.000Z' }, '2026-02-01T00:00:00.000Z'),
    'old file was rejected',
  );
  assert(
    !isOlderThanCutoff({ name: 'new.jpg', created_at: '2026-03-01T00:00:00.000Z' }, '2026-02-01T00:00:00.000Z'),
    'new file was accepted',
  );
  assert(!isOlderThanCutoff({ name: 'unknown.jpg' }, '2026-02-01T00:00:00.000Z'), 'undated file was accepted');
});
