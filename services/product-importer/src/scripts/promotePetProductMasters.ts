import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type EnvironmentConfig = {
  name: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

type Options = {
  apply: boolean;
  sourceEnvironment: string;
  targetEnvironment: string;
  concurrency: number;
};

type Row = Record<string, unknown>;

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const selectPageSize = 1000;
const relationBatchSize = 100;
const writeBatchSize = 100;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.targetEnvironment !== 'production') {
    throw new Error('The target environment must be production.');
  }
  const source = loadEnvironment(options.sourceEnvironment);
  const target = loadEnvironment(options.targetEnvironment);
  const sourceProject = projectRef(source.supabaseUrl);
  const targetProject = projectRef(target.supabaseUrl);
  if (sourceProject === targetProject) throw new Error('Source and target Supabase projects must differ.');

  const masters = await selectAllByKeyset(source, 'pet_product_masters', 'id', 'status=eq.published');
  const productIds = unique(masters.map((row) => String(row.product_id ?? '')).filter(Boolean));
  const variantIds = unique(masters.map((row) => String(row.variant_id ?? '')).filter(Boolean));
  const products = await selectRowsByIds(source, 'products', 'id', productIds);
  const variants = await selectRowsByIds(source, 'product_variants', 'id', variantIds);
  const identities = await selectRowsByIds(source, 'product_identity_keys', 'variant_id', variantIds);
  const translations = await selectRowsByIds(source, 'product_translations', 'product_id', productIds);

  assertComplete('products', productIds, products.map((row) => String(row.id ?? '')));
  assertComplete('product_variants', variantIds, variants.map((row) => String(row.id ?? '')));

  console.log(
    `[pet-product-master:promote] source=${sourceProject} target=${targetProject} ` +
      `masters=${masters.length} products=${products.length} variants=${variants.length} ` +
      `identities=${identities.length} translations=${translations.length} apply=${options.apply}`,
  );
  if (!options.apply) return;

  await upsertRows(target, 'products', products, 'id', options.concurrency);
  await upsertRows(target, 'product_translations', translations, 'product_id,locale', options.concurrency);
  await upsertRows(target, 'product_variants', variants, 'id', options.concurrency);
  await upsertRows(
    target,
    'product_identity_keys',
    identities,
    'key_type,namespace,normalized_value',
    options.concurrency,
  );
  await upsertRows(target, 'pet_product_masters', masters, 'id', options.concurrency);

  const targetMasters = await selectAllByKeyset(target, 'pet_product_masters', 'id', 'status=eq.published', 'id');
  const sourceMasterIds = new Set(masters.map((row) => String(row.id ?? '')));
  const copiedCount = targetMasters.filter((row) => sourceMasterIds.has(String(row.id ?? ''))).length;
  if (copiedCount !== masters.length) {
    throw new Error(`Production verification failed: expected ${masters.length} copied masters, found ${copiedCount}.`);
  }
  console.log(
    `[pet-product-master:promote] completed copied=${copiedCount} ` +
      `productionPublished=${targetMasters.length}`,
  );
}

function parseOptions(args: string[]): Options {
  let apply = false;
  let sourceEnvironment = 'development';
  let targetEnvironment = 'production';
  let concurrency = 4;
  for (const argument of args) {
    if (argument === '--apply') apply = true;
    else if (argument.startsWith('--source=')) sourceEnvironment = argument.slice('--source='.length);
    else if (argument.startsWith('--target=')) targetEnvironment = argument.slice('--target='.length);
    else if (argument.startsWith('--concurrency=')) {
      concurrency = Number(argument.slice('--concurrency='.length));
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new Error('--concurrency must be an integer between 1 and 8.');
      }
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return { apply, sourceEnvironment, targetEnvironment, concurrency };
}

function loadEnvironment(name: string): EnvironmentConfig {
  const filePath = path.join(serviceDir, `.env.${name}`);
  if (!existsSync(filePath)) throw new Error(`Environment file not found: ${filePath}`);
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) values[key] = value;
  }
  const supabaseUrl = values.SUPABASE_URL;
  const serviceRoleKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`${filePath} must contain SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  }
  return { name, supabaseUrl: supabaseUrl.replace(/\/+$/, ''), serviceRoleKey };
}

async function selectAllByKeyset(
  environment: EnvironmentConfig,
  table: string,
  cursorColumn: string,
  filter?: string,
  columns = '*',
): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    const query = [
      `select=${encodeURIComponent(columns)}`,
      filter,
      cursor ? `${cursorColumn}=gt.${encodeURIComponent(cursor)}` : undefined,
      `order=${cursorColumn}.asc`,
      `limit=${selectPageSize}`,
    ].filter(Boolean).join('&');
    const page = await requestJson<Row[]>(environment, `${table}?${query}`);
    rows.push(...page);
    if (page.length < selectPageSize) break;
    cursor = String(page.at(-1)?.[cursorColumn] ?? '');
    if (!cursor) throw new Error(`${table} keyset pagination returned an empty cursor.`);
  }
  return rows;
}

async function selectRowsByIds(
  environment: EnvironmentConfig,
  table: string,
  column: string,
  ids: string[],
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += relationBatchSize) {
    const values = ids.slice(offset, offset + relationBatchSize).map(encodeURIComponent).join(',');
    rows.push(...await requestJson<Row[]>(environment, `${table}?select=*&${column}=in.(${values})`));
  }
  return rows;
}

async function upsertRows(
  environment: EnvironmentConfig,
  table: string,
  rows: Row[],
  conflictTarget: string,
  concurrency: number,
): Promise<void> {
  const batches: Row[][] = [];
  for (let offset = 0; offset < rows.length; offset += writeBatchSize) {
    batches.push(rows.slice(offset, offset + writeBatchSize));
  }
  let nextBatch = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    for (;;) {
      const index = nextBatch;
      nextBatch += 1;
      const batch = batches[index];
      if (!batch) return;
      await request(environment, `${table}?on_conflict=${encodeURIComponent(conflictTarget)}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
    }
  }));
  console.log(`[pet-product-master:promote] upserted table=${table} rows=${rows.length}`);
}

async function requestJson<T>(environment: EnvironmentConfig, endpoint: string): Promise<T> {
  const response = await request(environment, endpoint);
  return (await response.json()) as T;
}

async function request(
  environment: EnvironmentConfig,
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', environment.serviceRoleKey);
  headers.set('Authorization', `Bearer ${environment.serviceRoleKey}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let lastError: unknown;
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${environment.supabaseUrl}/rest/v1/${endpoint}`, { ...init, headers });
      if (response.ok) return response;
      const body = await response.text();
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
        throw new Error(`${environment.name} ${endpoint} failed ${response.status}: ${body}`);
      }
      lastError = new Error(`${response.status}: ${body}`);
    } catch (error) {
      lastError = error;
      if (attempt === 4) throw error;
    }
    await delay(500 * 2 ** attempt);
  }
  throw lastError;
}

function assertComplete(label: string, expectedIds: string[], actualIds: string[]): void {
  const actual = new Set(actualIds);
  const missing = expectedIds.filter((id) => !actual.has(id));
  if (missing.length > 0) throw new Error(`${label} is missing ${missing.length} referenced rows: ${missing.slice(0, 10).join(', ')}`);
}

function projectRef(url: string): string {
  return new URL(url).hostname.split('.')[0];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error) => {
  console.error('[pet-product-master:promote] failed:', error);
  process.exitCode = 1;
});
