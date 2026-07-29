type AuthUser = { id: string };
type HouseholdMember = { user_id: string };
type Household = { household_id: string };

import {
  buildManagedIconPath,
  isManagedUserIconPath,
  isSafeStorageSegment,
  isStorageFile,
  isStorageFolder,
  managedIconRoots,
  StorageObject,
} from '../_shared/icon-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const iconBucket = Deno.env.get('SUPABASE_ICON_BUCKET') ?? 'icons';
const listBatchSize = 100;
const deleteBatchSize = 100;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
    return json({ error: 'missing_configuration_or_authentication' }, 401);
  }

  try {
    const user = await getAuthenticatedUser(supabaseUrl, anonKey, accessToken);
    await deleteAccountData(supabaseUrl, serviceRoleKey, user.id);
    await deleteAuthUser(supabaseUrl, serviceRoleKey, user.id);
    return json({ deleted: true });
  } catch (error) {
    console.error('[delete-account] failed:', error);
    return json({ error: 'account_deletion_failed' }, 500);
  }
});

async function getAuthenticatedUser(url: string, anonKey: string, accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`user lookup failed: ${response.status}`);
  return (await response.json()) as AuthUser;
}

async function deleteAccountData(url: string, serviceRoleKey: string, userId: string): Promise<void> {
  await Promise.all([
    deleteRows(url, serviceRoleKey, 'support_inquiries', userId),
    deleteRows(url, serviceRoleKey, 'product_link_reports', userId),
    deleteRows(url, serviceRoleKey, 'product_master_suggestions', userId),
    deleteRows(url, serviceRoleKey, 'icon_references', userId, 'owner_user_id'),
    deleteOwnedUnsharedHouseholds(url, serviceRoleKey, userId),
    deleteUserIcons(url, serviceRoleKey, userId),
  ]);
}

async function deleteRows(
  url: string,
  serviceRoleKey: string,
  table: string,
  userId: string,
  column = 'user_id',
): Promise<void> {
  const response = await fetch(`${url}/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders(serviceRoleKey),
  });
  if (!response.ok) throw new Error(`${table} deletion failed: ${response.status}`);
}

async function deleteOwnedUnsharedHouseholds(url: string, serviceRoleKey: string, userId: string): Promise<void> {
  const households = await getRows<Household>(
    `${url}/rest/v1/households?created_by=eq.${encodeURIComponent(userId)}&select=household_id`,
    serviceRoleKey,
  );
  for (const household of households) {
    const members = await getRows<HouseholdMember>(
      `${url}/rest/v1/household_members?household_id=eq.${encodeURIComponent(household.household_id)}&select=user_id`,
      serviceRoleKey,
    );
    if (members.length !== 1 || members[0]?.user_id !== userId) continue;
    const response = await fetch(`${url}/rest/v1/households?household_id=eq.${encodeURIComponent(household.household_id)}`, {
      method: 'DELETE',
      headers: serviceHeaders(serviceRoleKey),
    });
    if (!response.ok) throw new Error(`household deletion failed: ${response.status}`);
  }
}

async function deleteUserIcons(url: string, serviceRoleKey: string, userId: string): Promise<void> {
  if (!isSafeStorageSegment(userId)) throw new Error('invalid authenticated user id');

  const paths: string[] = [];
  for (const root of managedIconRoots) {
    const ownerFolders = await listStorageFolder(url, serviceRoleKey, `${root}/${userId}`);
    for (const ownerFolder of ownerFolders.filter(isStorageFolder)) {
      const files = await listStorageFolder(url, serviceRoleKey, `${root}/${userId}/${ownerFolder.name}`);
      for (const file of files.filter(isStorageFile)) {
        const path = buildManagedIconPath(root, userId, ownerFolder.name, file.name);
        if (path && isManagedUserIconPath(path, userId)) paths.push(path);
      }
    }
  }

  for (let index = 0; index < paths.length; index += deleteBatchSize) {
    await deleteUserIconBatch(url, serviceRoleKey, userId, paths.slice(index, index + deleteBatchSize));
  }
}

async function listStorageFolder(url: string, serviceRoleKey: string, prefix: string): Promise<StorageObject[]> {
  const all: StorageObject[] = [];
  for (let offset = 0; ; offset += listBatchSize) {
    const response = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(iconBucket)}`, {
      method: 'POST',
      headers: { ...serviceHeaders(serviceRoleKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix,
        limit: listBatchSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!response.ok) throw new Error(`icon list failed: ${response.status}`);
    const rows = (await response.json()) as StorageObject[];
    all.push(...rows);
    if (rows.length < listBatchSize) return all;
  }
}

async function deleteUserIconBatch(
  url: string,
  serviceRoleKey: string,
  userId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  if (paths.length > deleteBatchSize || paths.some((path) => !isManagedUserIconPath(path, userId))) {
    throw new Error('refusing to delete unmanaged or cross-user icon paths');
  }
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(iconBucket)}`, {
    method: 'DELETE',
    headers: { ...serviceHeaders(serviceRoleKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) throw new Error(`icon deletion failed: ${response.status}`);
}

async function getRows<T>(endpoint: string, serviceRoleKey: string): Promise<T[]> {
  const response = await fetch(endpoint, { headers: serviceHeaders(serviceRoleKey) });
  if (!response.ok) throw new Error(`data lookup failed: ${response.status}`);
  return (await response.json()) as T[];
}

async function deleteAuthUser(url: string, serviceRoleKey: string, userId: string): Promise<void> {
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders(serviceRoleKey),
  });
  if (!response.ok) throw new Error(`auth user deletion failed: ${response.status}`);
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
