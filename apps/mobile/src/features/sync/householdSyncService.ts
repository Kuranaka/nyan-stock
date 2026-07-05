import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAuthSession } from '@/features/auth/authStorage';
import { storageKeys } from '@/features/storageKeys';
import { nowIso } from '@/utils/date';

import { getHouseholdSyncState, saveHouseholdSyncState } from './householdSyncStorage';
import { HouseholdSnapshot, HouseholdSyncState, RemoteHouseholdSnapshot } from './householdSyncTypes';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const householdSnapshotsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_SNAPSHOTS_TABLE ?? 'household_snapshots';

type HouseholdSnapshotRow = {
  household_id: string;
  snapshot: HouseholdSnapshot;
  updated_at: string;
  updated_by?: string;
};

export function isHouseholdSyncConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function normalizeHouseholdId(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export async function isRemoteHouseholdDataActive(): Promise<boolean> {
  const state = await getHouseholdSyncState();
  return Boolean(state && isHouseholdSyncConfigured());
}

export async function createHouseholdSyncSpace(): Promise<HouseholdSyncState> {
  const householdId = createHouseholdId();
  const state: HouseholdSyncState = {
    householdId,
    joinedAt: nowIso(),
    createdBy: await getCurrentUserLabel(),
  };
  await saveHouseholdSyncState(state);
  await pushLocalSnapshotToHousehold(state);
  return (await getHouseholdSyncState()) ?? state;
}

export async function joinHouseholdSyncSpace(householdIdInput: string): Promise<HouseholdSyncState> {
  const householdId = normalizeHouseholdId(householdIdInput);
  if (!householdId) {
    throw new Error('共有コードを入力してください。');
  }

  const remote = await fetchRemoteSnapshot(householdId);
  if (!remote) {
    throw new Error('共有データが見つかりませんでした。共有コードを確認してください。');
  }

  const state: HouseholdSyncState = {
    householdId,
    joinedAt: nowIso(),
    lastPulledAt: nowIso(),
  };
  await applyRemoteSnapshot(remote.snapshot);
  await saveHouseholdSyncState(state);
  return state;
}

export async function pushCurrentHouseholdSnapshot(): Promise<HouseholdSyncState> {
  const state = await requireHouseholdSyncState();
  return pushLocalSnapshotToHousehold(state);
}

export async function pullCurrentHouseholdSnapshot(): Promise<HouseholdSyncState> {
  const state = await requireHouseholdSyncState();
  const remote = await fetchRemoteSnapshot(state.householdId);
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
  return fetchRemoteSnapshot(state.householdId);
}

export async function getActiveHouseholdSnapshot(): Promise<HouseholdSnapshot | undefined> {
  const state = await getHouseholdSyncState();
  if (!state || !isHouseholdSyncConfigured()) return undefined;

  const remote = await fetchRemoteSnapshot(state.householdId);
  if (!remote) {
    const snapshot = await createLocalSnapshot();
    await upsertRemoteSnapshot(state.householdId, snapshot, await getCurrentUserLabel());
    return snapshot;
  }

  await applyRemoteSnapshot(remote.snapshot);
  return remote.snapshot;
}

export async function updateActiveHouseholdSnapshot(
  mutator: (snapshot: HouseholdSnapshot) => HouseholdSnapshot,
): Promise<HouseholdSnapshot | undefined> {
  const state = await getHouseholdSyncState();
  if (!state || !isHouseholdSyncConfigured()) return undefined;

  const current = (await getActiveHouseholdSnapshot()) ?? createEmptySnapshot();
  const updatedBy = await getCurrentUserLabel();
  const next = {
    ...mutator(current),
    updatedAt: nowIso(),
    updatedBy,
  };
  await upsertRemoteSnapshot(state.householdId, next, updatedBy);
  await applyRemoteSnapshot(next);
  await saveHouseholdSyncState({ ...state, lastPushedAt: next.updatedAt });
  return next;
}

async function pushLocalSnapshotToHousehold(state: HouseholdSyncState): Promise<HouseholdSyncState> {
  const snapshot = await createLocalSnapshot();
  const updatedBy = await getCurrentUserLabel();
  await upsertRemoteSnapshot(state.householdId, snapshot, updatedBy);
  const nextState = { ...state, lastPushedAt: snapshot.updatedAt };
  await saveHouseholdSyncState(nextState);
  return nextState;
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

function createEmptySnapshot(): HouseholdSnapshot {
  return {
    cats: [],
    inventoryItems: [],
    purchaseHistory: [],
    updatedAt: nowIso(),
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
    headers: getSupabaseHeaders(),
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

async function upsertRemoteSnapshot(
  householdId: string,
  snapshot: HouseholdSnapshot,
  updatedBy?: string,
): Promise<void> {
  const existing = await fetchRemoteSnapshot(householdId);
  const body = JSON.stringify({
    household_id: householdId,
    snapshot,
    updated_at: snapshot.updatedAt,
    updated_by: updatedBy,
  });

  const response = await fetch(
    existing
      ? `${getRestEndpoint()}?household_id=eq.${encodeURIComponent(householdId)}`
      : getRestEndpoint(),
    {
      method: existing ? 'PATCH' : 'POST',
      headers: {
        ...getSupabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error('共有データを保存できませんでした。');
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
  const session = await getAuthSession();
  return session?.email ?? session?.name ?? session?.providerUserId;
}

function getRestEndpoint(): string {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabaseの共有設定が必要です。');
  }
  return `${supabaseUrl}/rest/v1/${householdSnapshotsTable}`;
}

function getSupabaseHeaders(): Record<string, string> {
  if (!supabaseAnonKey) {
    throw new Error('Supabaseの共有設定が必要です。');
  }
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
}

function createHouseholdId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `NYAN-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}
