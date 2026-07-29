import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relativePath) => readFile(path.join(mobileRoot, relativePath), 'utf8');
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));

const [
  appConfig,
  packageJson,
  easConfig,
  xcodeProject,
  androidGradle,
  infoPlist,
  androidManifest,
  inventoryForm,
  envExample,
  developmentEnvExample,
  suggestionShutdownMigration,
  homeScreen,
  authCallback,
  initialNotificationSetting,
  rootLayout,
  onboardingScreen,
  privacyManifest,
  settingsScreen,
] = await Promise.all([
  readJson('app.json'),
  readJson('package.json'),
  readJson('eas.json'),
  readText('ios/app.xcodeproj/project.pbxproj'),
  readText('android/app/build.gradle'),
  readText('ios/app/Info.plist'),
  readText('android/app/src/main/AndroidManifest.xml'),
  readText('src/screens/InventoryFormScreen.tsx'),
  readText('.env.example'),
  readText('.env.development.example'),
  readFile(
    path.resolve(
      mobileRoot,
      '../../supabase/migrations/20260726000004_disable_mobile_product_master_suggestions.sql',
    ),
    'utf8',
  ),
  readText('src/screens/HomeScreen.tsx'),
  readText('app/auth/callback.tsx'),
  readText('src/features/notifications/initialNotificationSetting.ts'),
  readText('app/_layout.tsx'),
  readText('src/screens/OnboardingScreen.tsx'),
  readText('ios/app/PrivacyInfo.xcprivacy'),
  readText('src/screens/SettingsScreen.tsx'),
]);

const errors = [];
const warnings = [];
const expo = appConfig.expo;
const appVersion = expo.version;

function check(condition, message) {
  if (!condition) errors.push(message);
}

check(/^\d+\.\d+\.\d+$/.test(appVersion), `app.json version is not x.y.z: ${appVersion}`);
check(packageJson.version === appVersion, 'package.json version does not match app.json');

const marketingVersions = [...xcodeProject.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(
  (match) => match[1],
);
check(
  marketingVersions.length > 0 && marketingVersions.every((version) => version === appVersion),
  `iOS MARKETING_VERSION does not consistently match ${appVersion}`,
);

const androidVersionName = androidGradle.match(/versionName\s+"([^"]+)"/)?.[1];
check(androidVersionName === appVersion, `Android versionName does not match ${appVersion}`);

const iosBundleIdentifier = xcodeProject.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)?.[1];
const androidApplicationId = androidGradle.match(/applicationId\s+'([^']+)'/)?.[1];
check(iosBundleIdentifier === expo.ios.bundleIdentifier, 'iOS bundle identifier is inconsistent');
check(androidApplicationId === expo.android.package, 'Android application ID is inconsistent');

check(easConfig.cli?.appVersionSource === 'remote', 'EAS appVersionSource must remain remote');
check(
  easConfig.build?.testflight?.distribution === 'store',
  'testflight must use store distribution',
);
check(
  easConfig.build?.testflight?.environment === 'production',
  'testflight must use production env',
);
check(easConfig.build?.testflight?.autoIncrement === true, 'testflight must auto-increment builds');
check(easConfig.build?.production?.autoIncrement === true, 'production must auto-increment builds');
check(
  packageJson.scripts?.['eas-build-pre-install'] ===
    'node scripts/validate-release-env.mjs && node scripts/validate-release-config.mjs',
  'EAS store builds must run release environment and source configuration validation',
);

const adsPlugin = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads',
);
const adsConfig = Array.isArray(adsPlugin) ? adsPlugin[1] : undefined;
const imagePickerPlugin = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
);
const imagePickerConfig = Array.isArray(imagePickerPlugin) ? imagePickerPlugin[1] : undefined;
check(
  imagePickerConfig?.microphonePermission === false,
  'expo-image-picker must disable the unused microphone permission',
);
check(
  imagePickerConfig?.cameraPermission === false,
  'expo-image-picker must disable the unused camera permission',
);
const blockedAndroidPermissions = new Set(expo.android.blockedPermissions ?? []);
const unusedAndroidPermissions = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];
unusedAndroidPermissions.forEach((permission) => {
  check(
    blockedAndroidPermissions.has(permission),
    `app.json must block the unused Android permission: ${permission}`,
  );
  const escapedPermission = permission.replaceAll('.', '\\s*\\.\\s*');
  check(
    new RegExp(
      `<uses-permission\\s+[^>]*android:name="${escapedPermission}"[^>]*tools:node="remove"[^>]*/?>`,
    ).test(androidManifest),
    `native AndroidManifest.xml must remove the unused permission: ${permission}`,
  );
});
check(
  !Object.hasOwn(expo.ios.infoPlist ?? {}, 'NSCameraUsageDescription'),
  'app.json must not declare the unused camera permission',
);
check(
  !infoPlist.includes('<key>NSCameraUsageDescription</key>'),
  'native Info.plist must not declare the unused camera permission',
);
const nativeIosAdMobId = infoPlist.match(
  /<key>GADApplicationIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
)?.[1];
const nativeAndroidAdMobId = androidManifest.match(
  /android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="([^"]+)"/,
)?.[1];
check(nativeIosAdMobId === adsConfig?.iosAppId, 'iOS AdMob app ID is inconsistent');
check(nativeAndroidAdMobId === adsConfig?.androidAppId, 'Android AdMob app ID is inconsistent');
check(
  adsConfig?.delayAppMeasurementInit === true,
  'AdMob app measurement must wait until the app completes consent and entitlement checks',
);
check(
  /<key>GADDelayAppMeasurementInit<\/key>\s*<true\/>/.test(infoPlist),
  'native iOS AdMob app measurement is not delayed',
);
check(
  /android:name="com\.google\.android\.gms\.ads\.DELAY_APP_MEASUREMENT_INIT"\s+android:value="true"/.test(
    androidManifest,
  ),
  'native Android AdMob app measurement is not delayed',
);

for (const dataType of [
  'NSPrivacyCollectedDataTypeBrowsingHistory',
  'NSPrivacyCollectedDataTypeSearchHistory',
]) {
  check(
    new RegExp(
      `<string>${dataType}<\\/string>\\s*<key>NSPrivacyCollectedDataTypeLinked<\\/key>\\s*<true\\/>`,
    ).test(privacyManifest),
    `${dataType} must remain linked in the iOS privacy manifest`,
  );
}

check(
  !inventoryForm.includes('collectUserProductSuggestion'),
  'Inventory registration must not upload product-master improvement suggestions',
);
check(
  !envExample.includes('SUPABASE_PRODUCT_MASTER_SUGGESTIONS') &&
    !developmentEnvExample.includes('SUPABASE_PRODUCT_MASTER_SUGGESTIONS'),
  'mobile env examples must not configure product-master suggestion uploads',
);
check(
  !envExample.includes('AUTH_FLOW_TYPE=implicit') &&
    !developmentEnvExample.includes('AUTH_FLOW_TYPE=implicit'),
  'mobile env examples must use the PKCE OAuth flow handled by the callback screen',
);
check(
  suggestionShutdownMigration.includes(
    'revoke all on table public.product_master_suggestions from anon, authenticated',
  ),
  'legacy product-master suggestion submissions must be disabled server-side',
);
check(
  homeScreen.includes('onboardingJustCompleted: true') &&
    homeScreen.includes('confirmInitialNotificationSetting(completedSettings'),
  'normal onboarding completion must trigger the one-time notification permission flow',
);
check(
  authCallback.includes('onboardingJustCompleted: true') &&
    authCallback.includes('confirmInitialNotificationSetting(completedSettings'),
  'OAuth callback onboarding completion must trigger the one-time notification permission flow',
);
check(
  initialNotificationSetting.includes('currentSettings.notificationPermissionPrompted') &&
    initialNotificationSetting.includes('!context.settingsAlreadySaved'),
  'initial notification permission flow must remain one-time and avoid surprising existing users',
);
check(
  rootLayout.includes('if (onboardingCompleted !== true)') &&
    rootLayout.includes('onboardingCompleted === true && shouldPrepareAds'),
  'RevenueCat and advertising consent must wait until onboarding is complete, and Plus must be resolved before ads',
);
check(
  onboardingScreen.includes("router.push('/privacy')") &&
    onboardingScreen.includes("router.push('/terms')"),
  'onboarding must expose privacy and terms before account creation or third-party SDK startup',
);
check(
  settingsScreen.includes('await getHouseholdSyncState()') &&
    settingsScreen.includes('if (currentSyncState)') &&
    settingsScreen.includes('共有中は初期化できません') &&
    settingsScreen.includes('onboardingCompleted: true') &&
    settingsScreen.includes('subscriptionPlan: currentSettings.subscriptionPlan'),
  'local data reset must preserve account/Plus state and must not detach an active shared space',
);

if (adsConfig?.androidAppId === 'ca-app-pub-3940256099942544~3347511713') {
  warnings.push(
    "Android still uses Google's sample AdMob app ID; replace it before Google Play release.",
  );
}

try {
  await access(path.join(mobileRoot, 'credentials.json'));
} catch {
  warnings.push(
    'credentials.json is missing even though the TestFlight profile uses local credentials.',
  );
}

if (errors.length > 0) {
  console.error('Release configuration errors:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`ok - release configuration is internally consistent for ${appVersion}`);
}

if (warnings.length > 0) {
  console.warn('External/platform follow-ups:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}
