/**
 * Web preview fallback.
 *
 * AdMob is native-only. Keeping a web-specific module lets Expo render the
 * mobile UI in a browser without bundling native Google Mobile Ads internals.
 */
export function getGoogleMobileAdsPackage(): null {
  return null;
}

export async function prepareAdMobForAdRequests(): Promise<boolean> {
  return false;
}

export async function requestAdPersonalizationPermission(): Promise<boolean> {
  return false;
}

export async function showAdMobPrivacyOptions(): Promise<void> {
  throw new Error('Webプレビューでは広告のプライバシー設定を開けません。');
}

export async function areAdMobPrivacyOptionsRequired(): Promise<boolean> {
  return false;
}
