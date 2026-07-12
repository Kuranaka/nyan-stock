import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceDir, '..', '..');
const environment = process.env.PRODUCT_IMPORTER_ENV ?? 'development';
const envPath = path.join(serviceDir, `.env.${environment}`);

loadLocalEnv(envPath);

export const config = {
  repositoryRoot,
  environment,
  rakutenApplicationId: process.env.RAKUTEN_APPLICATION_ID,
  rakutenAccessKey: process.env.RAKUTEN_ACCESS_KEY,
  yahooClientId: process.env.YAHOO_CLIENT_ID,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseProductMasterTable: process.env.SUPABASE_PRODUCT_MASTER_TABLE ?? 'product_masters',
  requestDelayMs: Number(process.env.PRODUCT_IMPORT_REQUEST_DELAY_MS ?? 1000),
  yahooRequestIntervalMs: Number(process.env.YAHOO_REQUEST_INTERVAL_MS ?? 2200),
  yahooRateLimitRetryDelayMs: Number(process.env.YAHOO_RATE_LIMIT_RETRY_DELAY_MS ?? 60_000),
  yahooMaxRetries: Number(process.env.YAHOO_MAX_RETRIES ?? 3),
  outputJsonPath:
    process.env.PRODUCT_MASTER_OUTPUT_PATH ??
    path.join(serviceDir, 'data', 'generated', 'productMaster.generated.json'),
};

export function delay(ms = config.requestDelayMs): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function warnMissingEnv(scope: string, names: string[]): void {
  if (names.length === 0) return;
  console.warn(`[${scope}] Missing environment variable(s): ${names.join(', ')}.`);
}

function loadLocalEnv(filePath: string): void {
  // `.env` remains a backwards-compatible fallback while existing local
  // setups are migrated. New setups must use an explicit environment file.
  const resolvedPath = existsSync(filePath) ? filePath : path.join(serviceDir, '.env');
  if (!existsSync(resolvedPath)) return;

  const lines = readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}
