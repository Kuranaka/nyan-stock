import AsyncStorage from '@react-native-async-storage/async-storage';

import { ensureSupabaseSessionForSharing, getCurrentAuthSession, getSupabaseSession } from '@/features/auth/supabaseAuth';
import { Cat } from '@/features/cats/catTypes';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { storageKeys } from '@/features/storageKeys';
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
  requireSupabaseClient,
} from '@/features/supabase/supabaseClient';
import { nowIso } from '@/utils/date';

import { getHouseholdSyncState, saveHouseholdSyncState } from './householdSyncStorage';
import { HouseholdSnapshot, HouseholdSyncState, RemoteHouseholdSnapshot } from './householdSyncTypes';

const householdSnapshotsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_SNAPSHOTS_TABLE ?? 'household_snapshots';

type HouseholdSnapshotRow = {
  household_id: string;
  snapshot: HouseholdSnapshot;
  updated_at: string;
  updated_by?: string;
};

type HouseholdRow = {
  household_id: string;
  invite_code?: string;
  updated_at: string;
  updated_by?: string;
};

type HouseholdMembershipResult = {
  household_id: string;
  invite_code: string;
};

type HouseholdMemberRow = {
  member_user_id: string;
  role: 'owner' | 'member';
  display_name?: string | null;
  joined_at: string;
};

export type HouseholdMember = {
  userId: string;
  role: 'owner' | 'member';
  displayName?: string;
  joinedAt: string;
};

type HouseholdEntityRow<T> = {
  id: string;
  household_id: string;
  payload: T;
  updated_at: string;
  updated_by?: string;
};

const householdsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLDS_TABLE ?? 'households';
const householdCatsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_CATS_TABLE ?? 'household_cats';
const householdInventoryItemsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_INVENTORY_ITEMS_TABLE ?? 'household_inventory_items';
const householdPurchaseHistoryTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_PURCHASE_HISTORY_TABLE ?? 'household_purchase_history';

export function isHouseholdSyncConfigured(): boolean {
  return isSupabaseConfigured();
}

export function normalizeHouseholdId(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export async function isRemoteHouseholdDataActive(): Promise<boolean> {
  const state = await getHouseholdSyncState();
  return Boolean(state && isHouseholdSyncConfigured());
}

export async function createHouseholdSyncSpace(): Promise<HouseholdSyncState> {
  await requireSignedInAccountForHouseholdCreation();
  const { household_id: householdId, invite_code: inviteCode } = await createRemoteHouseholdWithOwner();
  const state: HouseholdSyncState = {
    householdId,
    inviteCode,
    joinedAt: nowIso(),
    createdBy: await getCurrentUserLabel(),
    joinedBy: await getCurrentUserLabel(),
  };
  await saveHouseholdSyncState(state);
  await pushLocalSnapshotToHousehold(state);
  return (await getHouseholdSyncState()) ?? state;
}

async function requireSignedInAccountForHouseholdCreation(): Promise<void> {
  const authSession = await getCurrentAuthSession();
  if (!authSession || authSession.provider === 'guest') {
    throw new Error('共有コードを作成するにはGoogleまたはAppleでログインしてください。共有コードで参加する場合はゲストでも利用できます。');
  }

  const supabaseSession = await getSupabaseSession();
  if (!supabaseSession) {
    throw new Error('共有コードを作成するにはGoogleまたはAppleでログインしてください。');
  }
}

export async function joinHouseholdSyncSpace(
  householdIdInput: string,
  participantNameInput?: string,
): Promise<HouseholdSyncState> {
  const inviteCode = normalizeHouseholdId(householdIdInput);
  if (!inviteCode) {
    throw new Error('共有コードを入力してください。');
  }
  const participantName = participantNameInput?.trim();

  await ensureSupabaseSessionForSharing();
  const { household_id: householdId, invite_code: joinedInviteCode } = await joinRemoteHouseholdByInviteCode(
    inviteCode,
    participantName,
  );
  const remote = await fetchRemoteHouseholdData(householdId);
  if (!remote) {
    throw new Error('共有データが見つかりませんでした。共有コードを確認してください。');
  }
  const state: HouseholdSyncState = {
    householdId,
    inviteCode: joinedInviteCode,
    joinedAt: nowIso(),
    joinedBy: participantName || (await getCurrentUserLabel()),
    lastPulledAt: nowIso(),
  };
  await applyRemoteSnapshot(remote.snapshot);
  await saveHouseholdSyncState(state);
  return state;
}

/** Invalidates the current invite code without removing existing members. */
export async function regenerateHouseholdInviteCode(): Promise<HouseholdSyncState> {
  const state = await requireHouseholdSyncState();
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('regenerate_household_invite_code', {
    p_household_id: state.householdId,
  });
  if (error) {
    logSupabaseRpcError('regenerate_household_invite_code', error);
    throw new Error('共有コードを再発行できませんでした。作成者としてログインしているか確認してください。');
  }
  const result = parseMembershipResult(data, '共有コードを再発行できませんでした。');
  const nextState = { ...state, inviteCode: result.invite_code };
  await saveHouseholdSyncState(nextState);
  return nextState;
}

export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  const state = await requireHouseholdSyncState();
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('list_household_members', { p_household_id: state.householdId });
  if (error) {
    logSupabaseRpcError('list_household_members', error);
    throw new Error('参加者一覧を取得できませんでした。');
  }
  return ((data ?? []) as HouseholdMemberRow[])
    .filter((member) => member.member_user_id && (member.role === 'owner' || member.role === 'member'))
    .map((member) => ({
      userId: member.member_user_id,
      role: member.role,
      displayName: member.display_name?.trim() || undefined,
      joinedAt: member.joined_at,
    }));
}

export async function removeHouseholdMember(memberUserId: string): Promise<void> {
  const state = await requireHouseholdSyncState();
  const client = requireSupabaseClient();
  const { error } = await client.rpc('remove_household_member', {
    p_household_id: state.householdId,
    p_member_user_id: memberUserId,
  });
  if (error) {
    logSupabaseRpcError('remove_household_member', error);
    throw new Error('参加者を共有スペースから外せませんでした。');
  }
}

export async function pushCurrentHouseholdSnapshot(): Promise<HouseholdSyncState> {
  const state = await requireHouseholdSyncState();
  return pushLocalSnapshotToHousehold(state);
}

export async function pullCurrentHouseholdSnapshot(): Promise<HouseholdSyncState> {
  const state = await requireHouseholdSyncState();
  const remote = await fetchRemoteHouseholdData(state.householdId);
  if (!remote) {
    throw new Error('共有データが見つかりませんでした。');
  }

  const pulledAt = nowIso();
  await applyRemoteSnapshot(remote.snapshot);
  const nextState = { ...state, lastPulledAt: pulledAt };
  await saveHouseholdSyncState(nextState);
  return nextState;
}

export async function getCurrentRemoteSnapshot(): Promise<RemoteHouseholdSnapshot | undefined> {
  const state = await getHouseholdSyncState();
  if (!state) return undefined;
  return fetchRemoteHouseholdData(state.householdId);
}

export async function getActiveHouseholdSnapshot(): Promise<HouseholdSnapshot | undefined> {
  const state = await getHouseholdSyncState();
  if (!state || !isHouseholdSyncConfigured()) return undefined;

  const remote = await fetchRemoteHouseholdData(state.householdId);
  if (!remote) {
    const snapshot = await createLocalSnapshot();
    await upsertNormalizedSnapshot(state.householdId, snapshot, await getCurrentUserLabel());
    return snapshot;
  }

  await applyRemoteSnapshot(remote.snapshot);
  return remote.snapshot;
}

export async function upsertActiveHouseholdCat(cat: Cat): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, cat.updatedAt, updatedBy),
    upsertEntityRow(householdCatsTable, state.householdId, cat.id, cat, cat.updatedAt, updatedBy),
  ]);
  await patchLocalCache(storageKeys.cats, (cats: Cat[]) =>
    cats.some((item) => item.id === cat.id)
      ? cats.map((item) => (item.id === cat.id ? cat : item))
      : [cat, ...cats],
  );
  await saveHouseholdSyncState({ ...state, lastPushedAt: cat.updatedAt });
  return true;
}

export async function deleteActiveHouseholdCat(id: string): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    deleteEntityRow(householdCatsTable, state.householdId, id),
  ]);
  await patchLocalCache(storageKeys.cats, (cats: Cat[]) => cats.filter((cat) => cat.id !== id));
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

export async function clearActiveHouseholdCats(): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const rows = await fetchEntityRows<Cat>(householdCatsTable, state.householdId);
  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    ...rows.map((row) => deleteEntityRow(householdCatsTable, state.householdId, row.id)),
  ]);
  await AsyncStorage.removeItem(storageKeys.cats);
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

export async function upsertActiveHouseholdInventoryItem(item: InventoryItem): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, item.updatedAt, updatedBy),
    upsertEntityRow(householdInventoryItemsTable, state.householdId, item.id, item, item.updatedAt, updatedBy),
  ]);
  await patchLocalCache(storageKeys.inventoryItems, (items: InventoryItem[]) =>
    items.some((current) => current.id === item.id)
      ? items.map((current) => (current.id === item.id ? item : current))
      : [item, ...items],
  );
  await saveHouseholdSyncState({ ...state, lastPushedAt: item.updatedAt });
  return true;
}

export async function deleteActiveHouseholdInventoryItem(id: string): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    deleteEntityRow(householdInventoryItemsTable, state.householdId, id),
  ]);
  await patchLocalCache(storageKeys.inventoryItems, (items: InventoryItem[]) => items.filter((item) => item.id !== id));
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

export async function upsertActiveHouseholdPurchaseHistory(entry: PurchaseHistory): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const updatedAt = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, updatedAt, updatedBy),
    upsertEntityRow(householdPurchaseHistoryTable, state.householdId, entry.id, entry, updatedAt, updatedBy),
  ]);
  await patchLocalCache(storageKeys.purchaseHistory, (history: PurchaseHistory[]) =>
    history.some((current) => current.id === entry.id)
      ? history.map((current) => (current.id === entry.id ? entry : current))
      : [entry, ...history],
  );
  await saveHouseholdSyncState({ ...state, lastPushedAt: updatedAt });
  return true;
}

export async function deleteActiveHouseholdPurchaseHistory(id: string): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    deleteEntityRow(householdPurchaseHistoryTable, state.householdId, id),
  ]);
  await patchLocalCache(storageKeys.purchaseHistory, (history: PurchaseHistory[]) =>
    history.filter((entry) => entry.id !== id),
  );
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

export async function syncActiveHouseholdInventoryAndHistory(
  inventoryItems: InventoryItem[],
  purchaseHistory: PurchaseHistory[],
): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    syncEntityRows(
      householdInventoryItemsTable,
      state.householdId,
      inventoryItems,
      (item) => item.id,
      updatedBy,
    ),
    syncEntityRows(
      householdPurchaseHistoryTable,
      state.householdId,
      purchaseHistory,
      (entry) => entry.id,
      updatedBy,
    ),
  ]);
  await AsyncStorage.multiSet([
    [storageKeys.inventoryItems, JSON.stringify(inventoryItems)],
    [storageKeys.purchaseHistory, JSON.stringify(purchaseHistory)],
  ]);
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

export async function clearActiveHouseholdInventoryData(): Promise<boolean> {
  const state = await getActiveState();
  if (!state) return false;

  const [inventoryRows, historyRows] = await Promise.all([
    fetchEntityRows<InventoryItem>(householdInventoryItemsTable, state.householdId),
    fetchEntityRows<PurchaseHistory>(householdPurchaseHistoryTable, state.householdId),
  ]);
  const now = nowIso();
  const updatedBy = await getCurrentUserLabel();
  await Promise.all([
    upsertHousehold(state.householdId, now, updatedBy),
    ...inventoryRows.map((row) => deleteEntityRow(householdInventoryItemsTable, state.householdId, row.id)),
    ...historyRows.map((row) => deleteEntityRow(householdPurchaseHistoryTable, state.householdId, row.id)),
  ]);
  await Promise.all([
    AsyncStorage.removeItem(storageKeys.inventoryItems),
    AsyncStorage.removeItem(storageKeys.purchaseHistory),
  ]);
  await saveHouseholdSyncState({ ...state, lastPushedAt: now });
  return true;
}

async function pushLocalSnapshotToHousehold(state: HouseholdSyncState): Promise<HouseholdSyncState> {
  const snapshot = await createLocalSnapshot();
  const updatedBy = await getCurrentUserLabel();
  await upsertNormalizedSnapshot(state.householdId, snapshot, updatedBy);
  const nextState = { ...state, lastPushedAt: snapshot.updatedAt };
  await saveHouseholdSyncState(nextState);
  return nextState;
}

async function createRemoteHouseholdWithOwner(): Promise<HouseholdMembershipResult> {
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('create_household_with_owner');
  if (error) {
    logSupabaseRpcError('create_household_with_owner', error);
    throw new Error('共有スペースを作成できませんでした。Supabaseの共有権限設定を確認してください。');
  }
  return parseMembershipResult(data, '共有スペースを作成できませんでした。');
}

async function joinRemoteHouseholdByInviteCode(
  inviteCode: string,
  participantName?: string,
): Promise<HouseholdMembershipResult> {
  const client = requireSupabaseClient();
  const { data, error } = await client.rpc('join_household_by_invite_code', {
    p_invite_code: inviteCode,
    p_display_name: participantName,
  });
  if (error) {
    logSupabaseRpcError('join_household_by_invite_code', error);
    throw new Error('共有スペースに参加できませんでした。共有コードを確認してください。');
  }
  return parseMembershipResult(data, '共有スペースに参加できませんでした。');
}

function logSupabaseRpcError(
  rpcName: string,
  error: { code?: string; details?: string; hint?: string; message?: string },
): void {
  console.warn(`[sync] ${rpcName} failed`, {
    code: error.code,
    details: error.details,
    hint: error.hint,
    message: error.message,
  });
}

function parseMembershipResult(data: unknown, fallbackMessage: string): HouseholdMembershipResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error(fallbackMessage);
  }
  const householdId = (row as { household_id?: unknown }).household_id;
  const inviteCode = (row as { invite_code?: unknown }).invite_code;
  if (typeof householdId !== 'string' || typeof inviteCode !== 'string') {
    throw new Error(fallbackMessage);
  }
  return { household_id: householdId, invite_code: inviteCode };
}

async function createLocalSnapshot(): Promise<HouseholdSnapshot> {
  const [catsRaw, inventoryItemsRaw, purchaseHistoryRaw] = await Promise.all([
    AsyncStorage.getItem(storageKeys.cats),
    AsyncStorage.getItem(storageKeys.inventoryItems),
    AsyncStorage.getItem(storageKeys.purchaseHistory),
  ]);
  return {
    cats: catsRaw ? JSON.parse(catsRaw) : [],
    inventoryItems: inventoryItemsRaw ? JSON.parse(inventoryItemsRaw) : [],
    purchaseHistory: purchaseHistoryRaw ? JSON.parse(purchaseHistoryRaw) : [],
    updatedAt: nowIso(),
    updatedBy: await getCurrentUserLabel(),
  };
}

async function applyRemoteSnapshot(snapshot: HouseholdSnapshot): Promise<void> {
  await AsyncStorage.multiSet([
    [storageKeys.cats, JSON.stringify(snapshot.cats ?? [])],
    [storageKeys.inventoryItems, JSON.stringify(snapshot.inventoryItems ?? [])],
    [storageKeys.purchaseHistory, JSON.stringify(snapshot.purchaseHistory ?? [])],
  ]);
}

async function fetchRemoteSnapshot(householdId: string): Promise<RemoteHouseholdSnapshot | undefined> {
  const endpoint = `${getRestEndpoint()}?household_id=eq.${encodeURIComponent(householdId)}&select=household_id,snapshot,updated_at,updated_by&limit=1`;
  const response = await fetch(endpoint, {
    headers: await getSupabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('共有データを取得できませんでした。');
  }

  const rows = (await response.json()) as HouseholdSnapshotRow[];
  const row = rows[0];
  if (!row) return undefined;

  return {
    householdId: row.household_id,
    snapshot: row.snapshot,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function fetchHousehold(householdId: string): Promise<HouseholdRow | undefined> {
  const endpoint = `${getRestEndpoint(householdsTable)}?household_id=eq.${encodeURIComponent(householdId)}&select=household_id,invite_code,updated_at,updated_by&limit=1`;
  const response = await fetch(endpoint, {
    headers: await getSupabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('共有データを取得できませんでした。');
  }

  const rows = (await response.json()) as HouseholdRow[];
  return rows[0];
}

async function fetchRemoteHouseholdData(householdId: string): Promise<RemoteHouseholdSnapshot | undefined> {
  const household = await fetchHousehold(householdId);
  if (household) {
    return fetchNormalizedSnapshot(householdId);
  }

  const legacySnapshot = await fetchRemoteSnapshot(householdId);
  if (!legacySnapshot) return undefined;

  await upsertNormalizedSnapshot(
    householdId,
    legacySnapshot.snapshot,
    legacySnapshot.updatedBy ?? legacySnapshot.snapshot.updatedBy,
  );
  return legacySnapshot;
}

async function fetchNormalizedSnapshot(householdId: string): Promise<RemoteHouseholdSnapshot> {
  const [cats, inventoryItems, purchaseHistory, household] = await Promise.all([
    fetchEntityPayloads<Cat>(householdCatsTable, householdId),
    fetchEntityPayloads<InventoryItem>(householdInventoryItemsTable, householdId),
    fetchEntityPayloads<PurchaseHistory>(householdPurchaseHistoryTable, householdId),
    fetchHousehold(householdId),
  ]);
  const updatedAt = household?.updated_at ?? nowIso();
  return {
    householdId,
    snapshot: {
      cats,
      inventoryItems,
      purchaseHistory,
      updatedAt,
      updatedBy: household?.updated_by,
    },
    updatedAt,
    updatedBy: household?.updated_by,
  };
}

async function fetchEntityPayloads<T>(tableName: string, householdId: string): Promise<T[]> {
  const endpoint = `${getRestEndpoint(tableName)}?household_id=eq.${encodeURIComponent(householdId)}&select=id,payload,updated_at&order=updated_at.desc`;
  const response = await fetch(endpoint, {
    headers: await getSupabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('共有データを取得できませんでした。');
  }

  const rows = (await response.json()) as HouseholdEntityRow<T>[];
  return rows.map((row) => row.payload);
}

async function upsertNormalizedSnapshot(
  householdId: string,
  snapshot: HouseholdSnapshot,
  updatedBy?: string,
): Promise<void> {
  await upsertHousehold(householdId, snapshot.updatedAt, updatedBy);
  await Promise.all([
    syncEntityRows(householdCatsTable, householdId, snapshot.cats, (cat) => cat.id, updatedBy),
    syncEntityRows(
      householdInventoryItemsTable,
      householdId,
      snapshot.inventoryItems,
      (item) => item.id,
      updatedBy,
    ),
    syncEntityRows(
      householdPurchaseHistoryTable,
      householdId,
      snapshot.purchaseHistory,
      (entry) => entry.id,
      updatedBy,
    ),
  ]);
}

async function upsertHousehold(
  householdId: string,
  updatedAt: string,
  updatedBy?: string,
): Promise<void> {
  const body = JSON.stringify({
    updated_at: updatedAt,
    updated_by: updatedBy,
  });
  const response = await fetch(`${getRestEndpoint(householdsTable)}?household_id=eq.${encodeURIComponent(householdId)}`, {
    method: 'PATCH',
    headers: {
      ...(await getSupabaseHeaders()),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body,
  });

  if (!response.ok) {
    await logSupabaseRestError('update household', response);
    throw new Error('共有スペースを保存できませんでした。');
  }
}

async function upsertEntityRow<T>(
  tableName: string,
  householdId: string,
  id: string,
  payload: T,
  updatedAt: string,
  updatedBy?: string,
): Promise<void> {
  const body = JSON.stringify({
    id,
    household_id: householdId,
    payload,
    updated_at: updatedAt,
    updated_by: updatedBy,
  });
  const response = await fetch(`${getRestEndpoint(tableName)}?on_conflict=household_id,id`, {
    method: 'POST',
    headers: {
      ...(await getSupabaseHeaders()),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body,
  });

  if (!response.ok) {
    await logSupabaseRestError(`upsert ${tableName}`, response);
    throw new Error('共有データを保存できませんでした。');
  }
}

async function getActiveState(): Promise<HouseholdSyncState | undefined> {
  const state = await getHouseholdSyncState();
  if (!state || !isHouseholdSyncConfigured()) return undefined;
  const session = await getSupabaseSession();
  if (!session) {
    throw new Error('共有同期にはログインまたはゲスト利用が必要です。設定画面から共有コードで再参加してください。');
  }
  return state;
}

async function patchLocalCache<T>(
  key: string,
  patch: (items: T[]) => T[],
): Promise<void> {
  const raw = await AsyncStorage.getItem(key);
  const current = raw ? (JSON.parse(raw) as T[]) : [];
  await AsyncStorage.setItem(key, JSON.stringify(patch(current)));
}

async function syncEntityRows<T>(
  tableName: string,
  householdId: string,
  records: T[],
  getId: (record: T) => string,
  updatedBy?: string,
): Promise<void> {
  const existingRows = await fetchEntityRows<T>(tableName, householdId);
  const nextIds = new Set(records.map(getId));
  const deletedIds = existingRows.map((row) => row.id).filter((id) => !nextIds.has(id));

  await Promise.all(deletedIds.map((id) => deleteEntityRow(tableName, householdId, id)));

  if (records.length === 0) return;

  const now = nowIso();
  const body = JSON.stringify(
    records.map((record) => ({
      id: getId(record),
      household_id: householdId,
      payload: record,
      updated_at: getRecordUpdatedAt(record) ?? now,
      updated_by: updatedBy,
    })),
  );
  const response = await fetch(`${getRestEndpoint(tableName)}?on_conflict=household_id,id`, {
    method: 'POST',
    headers: {
      ...(await getSupabaseHeaders()),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body,
  });

  if (!response.ok) {
    await logSupabaseRestError(`sync ${tableName}`, response);
    throw new Error('共有データを保存できませんでした。');
  }
}

async function logSupabaseRestError(operation: string, response: Response): Promise<void> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    try {
      body = await response.clone().text();
    } catch {
      body = undefined;
    }
  }
  console.warn(`[sync] ${operation} failed`, {
    body,
    status: response.status,
    statusText: response.statusText,
  });
}

function getRecordUpdatedAt(record: unknown): string | undefined {
  if (!record || typeof record !== 'object' || !('updatedAt' in record)) return undefined;
  const updatedAt = (record as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === 'string' ? updatedAt : undefined;
}

async function fetchEntityRows<T>(
  tableName: string,
  householdId: string,
): Promise<HouseholdEntityRow<T>[]> {
  const endpoint = `${getRestEndpoint(tableName)}?household_id=eq.${encodeURIComponent(householdId)}&select=id,payload,updated_at`;
  const response = await fetch(endpoint, {
    headers: await getSupabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error('共有データを取得できませんでした。');
  }

  return (await response.json()) as HouseholdEntityRow<T>[];
}

async function deleteEntityRow(
  tableName: string,
  householdId: string,
  id: string,
): Promise<void> {
  const endpoint = `${getRestEndpoint(tableName)}?household_id=eq.${encodeURIComponent(householdId)}&id=eq.${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      ...(await getSupabaseHeaders()),
      Prefer: 'return=minimal',
    },
  });

  if (!response.ok) {
    throw new Error('共有データを削除できませんでした。');
  }
}

async function requireHouseholdSyncState(): Promise<HouseholdSyncState> {
  const state = await getHouseholdSyncState();
  if (!state) {
    throw new Error('共有スペースが未設定です。');
  }
  return state;
}

async function getCurrentUserLabel(): Promise<string | undefined> {
  const session = await getCurrentAuthSession();
  return session?.supabaseUserId ?? session?.providerUserId ?? session?.name;
}

function getRestEndpoint(tableName: string = householdSnapshotsTable): string {
  return `${getSupabaseUrl()}/rest/v1/${tableName}`;
}

async function getSupabaseHeaders(): Promise<Record<string, string>> {
  const session = await getSupabaseSession();
  if (!session) {
    throw new Error('共有同期にはログインまたはゲスト利用が必要です。');
  }
  const supabaseAnonKey = getSupabaseAnonKey();
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${session.access_token}`,
  };
}
