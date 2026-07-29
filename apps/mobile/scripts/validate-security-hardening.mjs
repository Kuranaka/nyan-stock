import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const consolidatedMigration = 'supabase/migrations/20260709000000_nyan_stock_schema.sql';

const checks = [
  {
    name: 'household hardening migration drops permissive anon policies',
    file: consolidatedMigration,
    assert: (source) => {
      const hardeningSource = sourceAfter(
        source,
        'Source: 20260706000000_security_hardening_after_initial_sync.sql',
      );
      for (const policyName of [
        'Anon households read',
        'Anon household cats create',
        'Anon household inventory update',
        'Anon household purchase history delete',
        'Anon household snapshot update',
      ]) {
        assert(
          hardeningSource.includes(`drop policy if exists "${policyName}"`),
          `${policyName} is not dropped`,
        );
      }
      assert(
        !/create policy "Anon household/.test(hardeningSource),
        'anon household policies are recreated',
      );
      assert(
        hardeningSource.includes('public.is_household_member(household_id)'),
        'household membership policy is missing',
      );
    },
  },
  {
    name: 'OAuth callback does not accept token-bearing implicit sessions',
    file: 'apps/mobile/src/features/auth/supabaseAuth.ts',
    assert: (source) => {
      assert(
        source.includes('assertTrustedOAuthCallbackUrl(callbackUrl)'),
        'callback URL trust check is missing',
      );
      assert(
        !source.includes('client.auth.setSession'),
        'implicit access_token callbacks are still accepted',
      );
      assert(source.includes('exchangeCodeForSession(code)'), 'PKCE code exchange is missing');
      assert(
        source.includes('? await client.auth.linkIdentity(credentials)'),
        'anonymous OAuth users are not upgraded with identity linking',
      );
      assert(
        source.includes("? await client.auth.linkIdentity({\n        provider: 'apple'"),
        'anonymous native Apple users are not upgraded with identity linking',
      );
      assert(
        source.includes('assertLinkedUserWasPreserved'),
        'identity linking does not verify that the Supabase user ID is preserved',
      );
    },
  },
  {
    name: 'account deletion clears both app and persisted Supabase sessions',
    file: 'apps/mobile/src/features/auth/supabaseAuth.ts',
    assert: (source) => {
      assert(
        source.includes("client.auth.signOut({ scope: 'local' })"),
        'account deletion does not attempt a local-scoped Supabase sign-out',
      );
      assert(
        source.includes("await clearLocalAuthStateBestEffort('account deletion')"),
        'account deletion does not complete local cleanup',
      );
      assert(
        source.includes("await clearLocalAuthStateBestEffort('sign-out')"),
        'sign-out does not complete local cleanup',
      );
      assert(
        source.includes('run: clearSupabasePersistedAuthSession') &&
          source.includes('run: clearAuthSession'),
        'local auth cleanup does not cover both persisted session stores',
      );
    },
  },
  {
    name: 'Supabase Auth defaults to PKCE',
    file: 'apps/mobile/src/features/supabase/supabaseClient.ts',
    assert: (source) => {
      assert(source.includes("? 'implicit' : 'pkce'"), 'PKCE is not the default auth flow');
      assert(
        source.includes('storageKey: supabaseAuthStorageKey'),
        'the persisted Supabase auth key is not explicit',
      );
      assert(
        source.includes('AsyncStorage.multiRemove([') &&
          source.includes('`${supabaseAuthStorageKey}-code-verifier`') &&
          source.includes('`${supabaseAuthStorageKey}-user`'),
        'persisted Supabase auth cleanup is incomplete',
      );
    },
  },
  {
    name: 'icon hardening migration requires authenticated owner folder',
    file: consolidatedMigration,
    assert: (source) => {
      const hardeningSource = sourceAfter(
        source,
        'Source: 20260706000000_security_hardening_after_initial_sync.sql',
      );
      assert(!/create policy "Anon icon/.test(hardeningSource), 'anon icon policies are recreated');
      assert(
        hardeningSource.includes('owner_user_id = auth.uid()'),
        'icon references are not owner-scoped',
      );
      assert(
        hardeningSource.includes('(storage.foldername(name))[2] = auth.uid()::text'),
        'storage object path is not owner-scoped',
      );
      assert(
        hardeningSource.includes('delete from public.icon_references'),
        'unowned legacy icon references are not removed',
      );
    },
  },
  {
    name: 'cleanup function requires ICON_CLEANUP_SECRET',
    file: 'supabase/functions/cleanup-unused-icons/index.ts',
    assert: (source) => {
      assert(
        source.includes("return json({ error: 'missing_cleanup_secret' }, 500)"),
        'missing secret does not stop cleanup',
      );
      assert(
        source.includes("return json({ error: 'unauthorized' }, 401)"),
        'invalid bearer token is not rejected',
      );
    },
  },
  {
    name: 'icon deletion is constrained to the current four-level managed path',
    file: 'supabase/functions/_shared/icon-storage.ts',
    assert: (source) => {
      assert(
        source.includes("managedIconRoots = ['cats', 'products']"),
        'managed icon roots changed unexpectedly',
      );
      assert(source.includes('rest.length === 0'), 'icon path depth is not exact');
      assert(source.includes("path.split('/')[1] === userId"), 'user ownership check is missing');
    },
  },
  {
    name: 'account deletion traverses owner folders and keeps 100-object limits',
    file: 'supabase/functions/delete-account/index.ts',
    assert: (source) => {
      assert(
        source.includes('ownerFolders.filter(isStorageFolder)'),
        'account deletion does not traverse owner folders',
      );
      assert(
        source.includes('files.filter(isStorageFile)'),
        'account deletion does not enumerate icon files',
      );
      assert(
        source.includes('isManagedUserIconPath(path, userId)'),
        'account deletion is not owner-scoped',
      );
      assert(
        source.includes('const listBatchSize = 100'),
        'account deletion list page size is not capped at 100',
      );
      assert(
        source.includes('const deleteBatchSize = 100'),
        'account deletion batch size is not capped at 100',
      );
    },
  },
  {
    name: 'unused icon cleanup traverses user and owner folders before grace filtering',
    file: 'supabase/functions/cleanup-unused-icons/index.ts',
    assert: (source) => {
      assert(source.includes('const userFolders ='), 'cleanup does not enumerate user folders');
      assert(source.includes('const ownerFolders ='), 'cleanup does not enumerate owner folders');
      assert(
        source.includes('files.filter(isStorageFile)'),
        'cleanup does not enumerate icon files',
      );
      assert(
        source.includes('isOlderThanCutoff(object, cutoff)'),
        'cleanup grace-period check is missing',
      );
      assert(
        source.includes('const listBatchSize = 100'),
        'cleanup list page size is not capped at 100',
      );
      assert(
        source.includes('const deleteBatchSize = 100'),
        'cleanup batch size is not capped at 100',
      );
    },
  },
  {
    name: 'CSV export neutralizes spreadsheet formulas',
    file: 'services/product-importer/src/scripts/exportProductMasterCsv.ts',
    assert: (source) => {
      assert(
        source.includes('escapeSpreadsheetFormula'),
        'spreadsheet formula escaping helper is missing',
      );
      assert(
        source.includes('/^[=+\\-@\\t\\r\\n]/'),
        'formula-triggering prefixes are not covered',
      );
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
