import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

type IconKind = 'cats' | 'products';
type IconOwnerKind = 'cat' | 'inventory_item';

type PickAndUploadIconOptions = {
  kind: IconKind;
  ownerId: string;
};

export type PickAndUploadIconResult =
  | { status: 'uploaded'; url: string }
  | { status: 'cancelled' };

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const iconBucket = process.env.EXPO_PUBLIC_SUPABASE_ICON_BUCKET ?? 'icons';
const iconSize = 160;

export async function pickAndUploadIcon(options: PickAndUploadIconOptions): Promise<PickAndUploadIconResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('写真ライブラリへのアクセスが許可されていません。');
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ['images'],
    quality: 0.6,
  });

  if (picked.canceled || !picked.assets[0]) {
    return { status: 'cancelled' };
  }

  const icon = await ImageManipulator.manipulateAsync(
    picked.assets[0].uri,
    [{ resize: { width: iconSize, height: iconSize } }],
    {
      compress: 0.45,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const url = await uploadIcon(icon.uri, options);
  return { status: 'uploaded', url };
}

export function hasIconUploadStorage(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function saveIconReference(ownerKind: IconOwnerKind, ownerId: string, iconUrl?: string): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const storagePath = iconUrl ? getIconStoragePath(iconUrl) : undefined;
  if (!storagePath) {
    await clearIconReference(ownerKind, ownerId);
    return;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/icon_references`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      owner_kind: ownerKind,
      owner_id: ownerId,
      bucket_id: iconBucket,
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    console.warn(`[iconUpload] icon reference save failed ${response.status}: ${await response.text()}`);
  }
}

export async function clearIconReference(ownerKind: IconOwnerKind, ownerId: string): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/icon_references?owner_kind=eq.${encodeURIComponent(
    ownerKind,
  )}&owner_id=eq.${encodeURIComponent(ownerId)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    console.warn(`[iconUpload] icon reference clear failed ${response.status}: ${await response.text()}`);
  }
}

async function uploadIcon(uri: string, options: PickAndUploadIconOptions): Promise<string> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('アイコン保存先のSupabase設定がありません。');
  }

  const path = buildIconPath(options);
  const blob = await (await fetch(uri)).blob();
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${iconBucket}/${path}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(await buildUploadErrorMessage(response));
  }

  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${iconBucket}/${path}`;
}

async function buildUploadErrorMessage(response: Response): Promise<string> {
  const detail = await response.text();
  if (response.status === 404) {
    return 'アイコン保存先のiconsバケットが見つかりません。SupabaseでStorageバケットを作成してください。';
  }
  if (response.status === 401 || response.status === 403) {
    return 'アイコン保存先の権限がありません。Supabase Storageのアップロードポリシーを確認してください。';
  }
  if (response.status === 413) {
    return 'アイコン画像のサイズが大きすぎます。別の画像でお試しください。';
  }
  return `アイコン画像のアップロードに失敗しました。（${response.status}${detail ? `: ${detail}` : ''}）`;
}

function buildIconPath({ kind, ownerId }: PickAndUploadIconOptions): string {
  const safeOwnerId = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${kind}/${safeOwnerId}/${Date.now()}.jpg`;
}

function getIconStoragePath(iconUrl: string): string | undefined {
  if (!supabaseUrl) return undefined;
  const publicPrefix = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${iconBucket}/`;
  if (!iconUrl.startsWith(publicPrefix)) return undefined;
  return decodeURIComponent(iconUrl.slice(publicPrefix.length));
}
