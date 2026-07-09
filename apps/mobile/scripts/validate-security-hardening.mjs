import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const consolidatedMigration = 'supabase/migrations/20260709000000_nyan_stock_schema.sql';

const checks = [
  {
    name: 'household hardening migration drops permissive anon policies',
    file: consolidatedMigration,
    assert: (source) => {
      const hardeningSource = sourceAfter(source, 'Source: 20260706000000_security_hardening_after_initial_sync.sql');
      for (const policyName of [
        'Anon households read',
        'Anon household cats create',
        'Anon household inventory update',
        'Anon household purchase history delete',
        'Anon household snapshot update',
      ]) {
        assert(hardeningSource.includes(`drop policy if exists "${policyName}"`), `${policyName} is not dropped`);
      }
      assert(!/create policy "Anon household/.test(hardeningSource), 'anon household policies are recreated');
      assert(hardeningSource.includes('public.is_household_member(household_id)'), 'household membership policy is missing');
    },
  },
  {
    name: 'OAuth callback does not accept token-bearing implicit sessions',
    file: 'apps/mobile/src/features/auth/supabaseAuth.ts',
    assert: (source) => {
      assert(source.includes('assertTrustedOAuthCallbackUrl(callbackUrl)'), 'callback URL trust check is missing');
      assert(!source.includes('client.auth.setSession'), 'implicit access_token callbacks are still accepted');
      assert(source.includes('exchangeCodeForSession(code)'), 'PKCE code exchange is missing');
    },
  },
  {
    name: 'Supabase Auth defaults to PKCE',
    file: 'apps/mobile/src/features/supabase/supabaseClient.ts',
    assert: (source) => {
      assert(source.includes("? 'implicit' : 'pkce'"), 'PKCE is not the default auth flow');
    },
  },
  {
    name: 'icon hardening migration requires authenticated owner folder',
    file: consolidatedMigration,
    assert: (source) => {
      const hardeningSource = sourceAfter(source, 'Source: 20260706000000_security_hardening_after_initial_sync.sql');
      assert(!/create policy "Anon icon/.test(hardeningSource), 'anon icon policies are recreated');
      assert(hardeningSource.includes('owner_user_id = auth.uid()'), 'icon references are not owner-scoped');
      assert(hardeningSource.includes('(storage.foldername(name))[2] = auth.uid()::text'), 'storage object path is not owner-scoped');
      assert(hardeningSource.includes('delete from public.icon_references'), 'unowned legacy icon references are not removed');
    },
  },
  {
    name: 'cleanup function requires ICON_CLEANUP_SECRET',
    file: 'supabase/functions/cleanup-unused-icons/index.ts',
    assert: (source) => {
      assert(source.includes("return json({ error: 'missing_cleanup_secret' }, 500)"), 'missing secret does not stop cleanup');
      assert(source.includes("return json({ error: 'unauthorized' }, 401)"), 'invalid bearer token is not rejected');
    },
  },
  {
    name: 'CSV export neutralizes spreadsheet formulas',
    file: 'services/product-importer/src/scripts/exportProductMasterCsv.ts',
    assert: (source) => {
      assert(source.includes('escapeSpreadsheetFormula'), 'spreadsheet formula escaping helper is missing');
      assert(source.includes("/^[=+\\-@\\t\\r\\n]/"), 'formula-triggering prefixes are not covered');
    },
  },
];

for (const check of checks) {
  const source = fs.readFileSync(path.join(repoRoot, check.file), 'utf8');
  check.assert(source);
  console.log(`ok - ${check.name}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert(markerIndex >= 0, `${marker} marker is missing`);
  return source.slice(markerIndex);
}
