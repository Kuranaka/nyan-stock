import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { dedupeProducts } from '../scripts/dedupeProducts.js';
import { ProductMaster } from '../types.js';

type UpsertProductMasterOptions = {
  dedupe?: boolean;
};

export async function loadProductMasters(): Promise<ProductMaster[]> {
  if (config.databaseUrl) {
    return loadFromPostgres();
  }
  if (hasSupabaseConfig()) {
    return loadFromSupabase();
  }
  try {
    const raw = await readFile(config.outputJsonPath, 'utf8');
    return JSON.parse(raw) as ProductMaster[];
  } catch {
    return [];
  }
}

export async function saveProductMasters(products: ProductMaster[]): Promise<void> {
  if (config.databaseUrl) {
    await saveToPostgres(products);
    return;
  }
  if (hasSupabaseConfig()) {
    await saveToSupabase(products);
    return;
  }
  await mkdir(path.dirname(config.outputJsonPath), { recursive: true });
  await writeFile(config.outputJsonPath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
  console.log(`[repository] saved product masters: ${config.outputJsonPath}`);
}

export async function deleteProductMastersByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (config.databaseUrl) {
    await deleteFromPostgres(ids);
    return;
  }
  if (hasSupabaseConfig()) {
    await deleteFromSupabase(ids);
    return;
  }

  const existing = await loadProductMasters();
  await saveProductMasters(existing.filter((product) => !ids.includes(product.id)));
}

export async function upsertProductMasters(
  incoming: ProductMaster[],
  options: UpsertProductMasterOptions = {},
): Promise<ProductMaster[]> {
  const existing = await loadProductMasters();
  const next = options.dedupe === false ? upsertById(existing, incoming) : dedupeProducts([...existing, ...incoming]);
  await saveProductMasters(next);
  return next;
}

function upsertById(existing: ProductMaster[], incoming: ProductMaster[]): ProductMaster[] {
  const byId = new Map(existing.map((product) => [product.id, product]));
  incoming.forEach((product) => {
    byId.set(product.id, product);
  });
  return Array.from(byId.values());
}

async function loadFromPostgres(): Promise<ProductMaster[]> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await ensurePostgresSchema(client);
    const result = await client.query('select data from product_masters order by updated_at desc');
    return result.rows.map((row: { data: ProductMaster }) => row.data);
  } finally {
    await client.end();
  }
}

async function saveToPostgres(products: ProductMaster[]): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await ensurePostgresSchema(client);
    await client.query('begin');
    for (const product of products) {
      await client.query(
        `insert into product_masters (id, data, updated_at)
         values ($1, $2::jsonb, $3)
         on conflict (id) do update
         set data = excluded.data,
             updated_at = excluded.updated_at`,
        [product.id, JSON.stringify(product), product.updatedAt],
      );
    }
    await client.query('commit');
    console.log(`[repository] saved product masters to PostgreSQL: ${products.length}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

async function ensurePostgresSchema(client: PostgresClient): Promise<void> {
  await client.query(`
    create table if not exists product_masters (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null
    )
  `);
}

async function deleteFromPostgres(ids: string[]): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await ensurePostgresSchema(client);
    await client.query('delete from product_masters where id = any($1)', [ids]);
    console.log(`[repository] deleted product masters from PostgreSQL: ${ids.length}`);
  } finally {
    await client.end();
  }
}

async function loadFromSupabase(): Promise<ProductMaster[]> {
  const response = await fetch(supabaseEndpoint('select=data&order=updated_at.desc'), {
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(`[repository] Supabase load failed ${response.status}: ${await response.text()}`);
  }
  const rows = (await response.json()) as Array<{ data: ProductMaster }>;
  return rows.map((row) => row.data);
}

async function saveToSupabase(products: ProductMaster[]): Promise<void> {
  const rows = products.map((product) => ({
    id: product.id,
    data: product,
    updated_at: product.updatedAt,
  }));
  const response = await fetch(supabaseEndpoint('on_conflict=id'), {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`[repository] Supabase save failed ${response.status}: ${await response.text()}`);
  }
  console.log(`[repository] saved product masters to Supabase: ${products.length}`);
}

async function deleteFromSupabase(ids: string[]): Promise<void> {
  const chunkSize = 100;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const response = await fetch(supabaseEndpoint(`id=in.(${chunk.map(encodeURIComponent).join(',')})`), {
      method: 'DELETE',
      headers: supabaseHeaders(),
    });
    if (!response.ok) {
      throw new Error(`[repository] Supabase delete failed ${response.status}: ${await response.text()}`);
    }
  }
  console.log(`[repository] deleted product masters from Supabase: ${ids.length}`);
}

function hasSupabaseConfig(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

function supabaseEndpoint(query: string): string {
  return `${config.supabaseUrl}/rest/v1/${config.supabaseProductMasterTable}?${query}`;
}

function supabaseHeaders(): Record<string, string> {
  const key = config.supabaseServiceRoleKey ?? '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

type PostgresClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};
