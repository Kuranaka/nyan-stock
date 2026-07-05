import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = loadEnv(path.join(process.cwd(), '.env'));

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const catsTable = env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_CATS_TABLE || 'household_cats';
const inventoryTable = env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_INVENTORY_ITEMS_TABLE || 'household_inventory_items';
const historyTable = env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_PURCHASE_HISTORY_TABLE || 'household_purchase_history';

if (!supabaseUrl || !supabaseAnonKey) {
  fail('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required in apps/mobile/.env');
}

const now = new Date().toISOString();
const catId = `smoke-cat-${Date.now()}`;
const itemId = `smoke-item-${Date.now()}`;
const historyId = `smoke-history-${Date.now()}`;

const owner = createSmokeClient();
const member = createSmokeClient();
const outsider = createSmokeClient();

try {
  await Promise.all([signInGuest(owner), signInGuest(member), signInGuest(outsider)]);

  const created = await rpcSingle(owner, 'create_household_with_owner');
  const householdId = created.household_id;
  const inviteCode = created.invite_code;
  assert(householdId && inviteCode, 'household RPC did not return household_id and invite_code');

  await upsert(owner, catsTable, 'household_id,id', {
    household_id: householdId,
    id: catId,
    payload: {
      id: catId,
      name: '同期テスト',
      gender: 'unknown',
      createdAt: now,
      updatedAt: now,
    },
    updated_at: now,
    updated_by: 'sync-smoke-owner',
  });

  const outsiderRows = await selectByHousehold(outsider, catsTable, householdId);
  assert(outsiderRows.length === 0, 'non-member could read household data');
  await assertDenied(
    upsert(outsider, catsTable, 'household_id,id', {
      household_id: householdId,
      id: `smoke-outsider-cat-${Date.now()}`,
      payload: {
        id: `smoke-outsider-cat-${Date.now()}`,
        name: '非メンバー',
        gender: 'unknown',
        createdAt: now,
        updatedAt: now,
      },
      updated_at: now,
      updated_by: 'sync-smoke-outsider',
    }),
    'non-member write was allowed',
  );

  const joined = await rpcSingle(member, 'join_household_by_invite_code', {
    p_invite_code: inviteCode,
  });
  assert(joined.household_id === householdId, 'member joined an unexpected household');

  await upsert(member, inventoryTable, 'household_id,id', {
    household_id: householdId,
    id: itemId,
    payload: {
      id: itemId,
      catId,
      name: '同期テスト在庫',
      category: 'dry_food',
      amount: 100,
      unit: 'g',
      purchaseDate: now.slice(0, 10),
      notifyBeforeDays: [7, 3, 1],
      purchaseLinks: {},
      createdAt: now,
      updatedAt: now,
    },
    updated_at: now,
    updated_by: 'sync-smoke-member',
  });
  await upsert(member, historyTable, 'household_id,id', {
    household_id: householdId,
    id: historyId,
    payload: {
      id: historyId,
      inventoryItemId: itemId,
      purchasedAt: now.slice(0, 10),
      amount: 100,
      unit: 'g',
      createdAt: now,
    },
    updated_at: now,
    updated_by: 'sync-smoke-member',
  });

  const [cats, items, history] = await Promise.all([
    selectByHousehold(member, catsTable, householdId),
    selectByHousehold(owner, inventoryTable, householdId),
    selectByHousehold(owner, historyTable, householdId),
  ]);
  assert(cats.some((row) => row.id === catId), 'member could not read owner cat row');
  assert(items.some((row) => row.id === itemId), 'owner could not read member inventory row');
  assert(history.some((row) => row.id === historyId), 'owner could not read member purchase history row');

  await assertRealtimeChange(owner, member, householdId);

  await Promise.all([
    removeById(owner, historyTable, householdId, historyId),
    removeById(owner, inventoryTable, householdId, itemId),
    removeById(owner, catsTable, householdId, catId),
  ]);

  disconnectAll();
  console.log(`Household auth sync smoke passed for ${inviteCode} (${householdId})`);
} catch (error) {
  disconnectAll();
  fail(error instanceof Error ? error.message : String(error));
}

function createSmokeClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function signInGuest(client) {
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`anonymous sign-in failed: ${error.message}`);
}

async function rpcSingle(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fn} returned no data`);
  return row;
}

async function assertRealtimeChange(writer, subscriber, householdId) {
  let channel;
  const realtimeCatId = `smoke-realtime-cat-${Date.now()}`;
  try {
    const { data } = await subscriber.auth.getSession();
    if (!data.session) throw new Error('member realtime session was missing');
    subscriber.realtime.setAuth(data.session.access_token);

    const eventPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('realtime postgres_changes event was not received'));
      }, 15000);

      channel = subscriber
        .channel(`smoke-household-sync:${householdId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: catsTable,
            filter: `household_id=eq.${householdId}`,
          },
          (payload) => {
            if (payload.new?.id === realtimeCatId || payload.old?.id === realtimeCatId) {
              clearTimeout(timeout);
              resolve();
            }
          },
        );
    });

    await subscribe(channel);
    await upsert(writer, catsTable, 'household_id,id', {
      household_id: householdId,
      id: realtimeCatId,
      payload: {
        id: realtimeCatId,
        name: '同期Realtimeテスト',
        gender: 'unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
      updated_by: 'sync-smoke-owner',
    });
    await eventPromise;
    await removeById(writer, catsTable, householdId, realtimeCatId);
  } finally {
    if (channel) await subscriber.removeChannel(channel);
  }
}

async function subscribe(channel) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('realtime subscription did not become active'));
    }, 15000);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        console.log('Realtime subscription active');
        resolve();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        reject(new Error(`realtime subscription failed with status ${status}`));
      }
    });
  });
}

async function upsert(client, table, onConflict, row) {
  const response = await fetch(`${rest(table)}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      ...(await headers(client)),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  await ensureOk(response, `upsert ${table}`);
}

async function selectByHousehold(client, table, householdId) {
  const response = await fetch(
    `${rest(table)}?household_id=eq.${encodeURIComponent(householdId)}&select=id,payload`,
    { headers: await headers(client) },
  );
  await ensureOk(response, `select ${table}`);
  return response.json();
}

async function removeById(client, table, householdId, id) {
  const response = await fetch(
    `${rest(table)}?household_id=eq.${encodeURIComponent(householdId)}&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        ...(await headers(client)),
        Prefer: 'return=minimal',
      },
    },
  );
  await ensureOk(response, `delete ${table}`);
}

async function headers(client) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Supabase session was missing');
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

async function assertDenied(promise, message) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(message);
}

async function ensureOk(response, action) {
  if (response.ok) return;
  const text = await response.text();
  throw new Error(`${action} failed with ${response.status}: ${text}`);
}

function rest(table) {
  return `${supabaseUrl}/rest/v1/${table}`;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function disconnectAll() {
  owner.realtime.disconnect();
  member.realtime.disconnect();
  outsider.realtime.disconnect();
}

function fail(message) {
  console.error(`Household sync smoke failed: ${message}`);
  process.exit(1);
}
