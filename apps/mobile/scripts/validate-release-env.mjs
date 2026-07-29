import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseProfiles = new Set(['testflight', 'production']);
const profile = process.env.EAS_BUILD_PROFILE;
const platform = process.env.EAS_BUILD_PLATFORM;

if (!releaseProfiles.has(profile ?? '')) {
  console.log(`release environment validation skipped for profile: ${profile ?? 'local'}`);
  process.exit(0);
}

const errors = [];
const value = (name) => process.env[name]?.trim();
const requireValue = (name) => {
  if (!value(name)) errors.push(`${name} is missing`);
};

requireValue('EXPO_PUBLIC_SUPABASE_URL');
requireValue('EXPO_PUBLIC_SUPABASE_ANON_KEY');
requireValue('EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL');
requireValue('EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID');
requireValue('RELEASE_SUPABASE_PROJECT_REF');

if (value('EXPO_PUBLIC_APP_ENV') !== 'production') {
  errors.push('EXPO_PUBLIC_APP_ENV must be production in a store build');
}

const authFlowType = value('EXPO_PUBLIC_SUPABASE_AUTH_FLOW_TYPE');
if (authFlowType && authFlowType !== 'pkce') {
  errors.push('EXPO_PUBLIC_SUPABASE_AUTH_FLOW_TYPE must be unset or pkce in a store build');
}

const supabaseUrl = value('EXPO_PUBLIC_SUPABASE_URL');
const supabaseUrlMatch = supabaseUrl?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
if (supabaseUrl && !supabaseUrlMatch) {
  errors.push('EXPO_PUBLIC_SUPABASE_URL must be an https://*.supabase.co URL');
}

const expectedSupabaseProjectRef = value('RELEASE_SUPABASE_PROJECT_REF');
if (expectedSupabaseProjectRef && !/^[a-z0-9-]+$/.test(expectedSupabaseProjectRef)) {
  errors.push('RELEASE_SUPABASE_PROJECT_REF must contain only lowercase letters, digits, or hyphens');
}
if (
  supabaseUrlMatch?.[1] &&
  expectedSupabaseProjectRef &&
  supabaseUrlMatch[1] !== expectedSupabaseProjectRef
) {
  errors.push('EXPO_PUBLIC_SUPABASE_URL does not match RELEASE_SUPABASE_PROJECT_REF');
}

if (value('EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL') !== 'nyanstock://auth/callback') {
  errors.push('EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL must be nyanstock://auth/callback');
}

const bannerUnitId = value('EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID');
if (bannerUnitId && !/^ca-app-pub-\d+\/\d+$/.test(bannerUnitId)) {
  errors.push('EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID is not a valid banner unit ID');
}
if (bannerUnitId?.startsWith('ca-app-pub-3940256099942544/')) {
  errors.push('EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID still uses a Google sample publisher ID');
}

if (value('EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID') !== 'nyanstock_plus') {
  errors.push('EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID must be nyanstock_plus');
}

if (value('EXPO_PUBLIC_REVENUECAT_DEBUG_LOGS') === 'true') {
  errors.push('EXPO_PUBLIC_REVENUECAT_DEBUG_LOGS must not be true in a store build');
}

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [appConfig, privacyManifest] = await Promise.all([
  readFile(path.join(mobileRoot, 'app.json'), 'utf8').then(JSON.parse),
  readFile(path.join(mobileRoot, 'ios/app/PrivacyInfo.xcprivacy'), 'utf8'),
]);
const adsPlugin = appConfig.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads',
);
const adsConfig = Array.isArray(adsPlugin) ? adsPlugin[1] : undefined;

if (platform === 'ios') {
  const revenueCatKey = value('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
  if (!revenueCatKey) errors.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing');
  if (revenueCatKey && !revenueCatKey.startsWith('appl_')) {
    errors.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY must be an Apple production public SDK key');
  }
  if (adsConfig?.iosAppId?.startsWith('ca-app-pub-3940256099942544~')) {
    errors.push('The iOS AdMob app ID still uses a Google sample publisher ID');
  }
  if (!/<key>NSPrivacyTracking<\/key>\s*<true\/>/.test(privacyManifest)) {
    errors.push(
      'iOS Privacy Manifest must enable NSPrivacyTracking while ATT-authorized personalized ads are supported',
    );
  }
  const trackingDomainsBlock = privacyManifest.match(
    /<key>NSPrivacyTrackingDomains<\/key>\s*<array>([\s\S]*?)<\/array>/,
  )?.[1];
  if (!trackingDomainsBlock || !/<string>[^<]+<\/string>/.test(trackingDomainsBlock)) {
    errors.push(
      'iOS Privacy Manifest must list the verified tracking domains used by Google Mobile Ads',
    );
  }
} else if (platform === 'android') {
  if (value('EXPO_PUBLIC_REVENUECAT_ENABLE_ANDROID') !== 'true') {
    errors.push('EXPO_PUBLIC_REVENUECAT_ENABLE_ANDROID must be true for an Android store build');
  }
  const revenueCatKey = value('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');
  if (!revenueCatKey) errors.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is missing');
  if (revenueCatKey && !revenueCatKey.startsWith('goog_')) {
    errors.push(
      'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY must be a Google production public SDK key',
    );
  }
  if (adsConfig?.androidAppId?.startsWith('ca-app-pub-3940256099942544~')) {
    errors.push('The Android AdMob app ID still uses a Google sample publisher ID');
  }
} else {
  errors.push('EAS_BUILD_PLATFORM must be ios or android');
}

if (errors.length > 0) {
  console.error(`Store build blocked: ${errors.length} release environment issue(s) found.`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`ok - ${profile} ${platform} release environment is configured`);
