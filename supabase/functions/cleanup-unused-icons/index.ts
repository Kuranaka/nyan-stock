type StorageObject = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type IconReference = {
  storage_path: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const iconBucket = Deno.env.get('SUPABASE_ICON_BUCKET') ?? 'icons';
const referenceTable = Deno.env.get('SUPABASE_ICON_REFERENCE_TABLE') ?? 'icon_references';
const defaultGraceDays = Number(Deno.env.get('ICON_CLEANUP_GRACE_DAYS') ?? 14);
const deleteBatchSize = 100;
const listBatchSize = 100;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const cleanupSecret = Deno.env.get('ICON_CLEANUP_SECRET');
  if (!cleanupSecret) {
    return json({ error: 'missing_cleanup_secret' }, 500);
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== cleanupSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'missing_supabase_secrets' }, 500);
    }

    const body = await readJsonBody(request);
    const graceDays = normalizeGraceDays(body?.graceDays);
    const dryRun = body?.dryRun === true;
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();

    const [objects, references] = await Promise.all([
      loadOldIconObjects(supabaseUrl, serviceRoleKey, cutoff),
      loadIconReferences(supabaseUrl, serviceRoleKey),
    ]);
    const activePaths = new Set(references.map((reference) => reference.storage_path));
    const unusedPaths = objects
      .map((object) => object.name)
      .filter((name) => isManagedIconPath(name) && !activePaths.has(name));

    if (!dryRun) {
      for (let index = 0; index < unusedPaths.length; index += deleteBatchSize) {
        const batch = unusedPaths.slice(index, index + deleteBatchSize);
        await deleteStorageObjects(supabaseUrl, serviceRoleKey, batch);
      }
    }

    return json({
      bucket: iconBucket,
      graceDays,
      cutoff,
      dryRun,
      scanned: objects.length,
      deleted: dryRun ? 0 : unusedPaths.length,
      candidates: unusedPaths.length,
    });
  } catch (error) {
    console.error('[cleanup-unused-icons] failed:', error);
    return json({ error: 'cleanup_failed', message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function loadOldIconObjects(
  supabaseUrl: string,
  serviceRoleKey: string,
  cutoff: string,
): Promise<StorageObject[]> {
  const managedObjects: StorageObject[] = [];
  for (const root of ['cats', 'products']) {
    const ownerFolders = (await listStorageFolder(supabaseUrl, serviceRoleKey, root)).filter(
      (entry) => !entry.name.includes('.'),
    );
    for (const folder of ownerFolders) {
      const files = await listStorageFolder(supabaseUrl, serviceRoleKey, `${root}/${folder.name}`);
      files.forEach((file) => {
        const createdAt = file.created_at ?? file.updated_at;
        if (createdAt && createdAt < cutoff) {
          managedObjects.push({
            ...file,
            name: `${root}/${folder.name}/${file.name}`,
          });
        }
      });
    }
  }
  return managedObjects;
}

async function listStorageFolder(
  supabaseUrl: string,
  serviceRoleKey: string,
  prefix: string,
): Promise<StorageObject[]> {
  const all: StorageObject[] = [];
  for (let offset = 0; ; offset += listBatchSize) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${iconBucket}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders(serviceRoleKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix,
        limit: listBatchSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!response.ok) {
      throw new Error(`storage object list failed ${response.status}: ${await response.text()}`);
    }
    const rows = (await response.json()) as StorageObject[];
    all.push(...rows);
    if (rows.length < listBatchSize) return all;
  }
}

async function loadIconReferences(supabaseUrl: string, serviceRoleKey: string): Promise<IconReference[]> {
  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
    referenceTable,
  )}?bucket_id=eq.${encodeURIComponent(iconBucket)}&select=storage_path`;
  const response = await fetch(endpoint, {
    headers: supabaseHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`icon reference read failed ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as IconReference[];
}

async function deleteStorageObjects(
  supabaseUrl: string,
  serviceRoleKey: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${iconBucket}`, {
    method: 'DELETE',
    headers: {
      ...supabaseHeaders(serviceRoleKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) {
    throw new Error(`storage object delete failed ${response.status}: ${await response.text()}`);
  }
}

function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function readJsonBody(request: Request): Promise<{ graceDays?: unknown; dryRun?: unknown } | undefined> {
  try {
    return (await request.json()) as { graceDays?: unknown; dryRun?: unknown };
  } catch {
    return undefined;
  }
}

function normalizeGraceDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return defaultGraceDays;
  return Math.min(Math.floor(value), 365);
}

function isManagedIconPath(path: string): boolean {
  return path.startsWith('cats/') || path.startsWith('products/');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
