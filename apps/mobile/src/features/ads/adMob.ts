import type { ComponentType } from 'react';
import { NativeModules, Platform } from 'react-native';
import * as TrackingTransparency from 'expo-tracking-transparency';

type BannerAdProps = {
  unitId: string;
  size: string;
  requestOptions?: {
    requestNonPersonalizedAdsOnly?: boolean;
  };
  onAdFailedToLoad?: (error: unknown) => void;
};

type AdsConsentInfo = {
  canRequestAds: boolean;
  privacyOptionsRequirementStatus: 'UNKNOWN' | 'REQUIRED' | 'NOT_REQUIRED';
};

type MobileAdsInstance = {
  initialize: () => Promise<unknown>;
  setRequestConfiguration: (configuration: { maxAdContentRating: string }) => Promise<void>;
};

type GoogleMobileAdsPackage = {
  default: () => MobileAdsInstance;
  BannerAd: ComponentType<BannerAdProps>;
  BannerAdSize: {
    ANCHORED_ADAPTIVE_BANNER: string;
  };
  MaxAdContentRating: {
    G: string;
  };
  TestIds: {
    ADAPTIVE_BANNER: string;
  };
  AdsConsent: {
    gatherConsent: () => Promise<AdsConsentInfo>;
    showPrivacyOptionsForm: () => Promise<unknown>;
  };
};

let cachedPackage: GoogleMobileAdsPackage | null | undefined;

export function getGoogleMobileAdsPackage(): GoogleMobileAdsPackage | null {
  if (cachedPackage !== undefined) return cachedPackage;

  if (!NativeModules.RNGoogleMobileAdsModule) {
    cachedPackage = null;
    return cachedPackage;
  }

  try {
    // Native code is unavailable in Expo Go, so load this only after confirming the module exists.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    cachedPackage = require('react-native-google-mobile-ads') as GoogleMobileAdsPackage;
  } catch (error) {
    console.warn('[AdMob] native module unavailable', error);
    cachedPackage = null;
  }

  return cachedPackage;
}

/**
 * Obtains the UMP consent decision before the first ad request.  A failed or
 * incomplete consent flow deliberately blocks requests so a release cannot
 * silently fall back to personalized advertising.
 */
export async function prepareAdMobForAdRequests(): Promise<boolean> {
  const googleMobileAds = getGoogleMobileAdsPackage();
  if (!googleMobileAds) return false;

  const consentInfo = await googleMobileAds.AdsConsent.gatherConsent();
  return consentInfo.canRequestAds;
}

/**
 * ATT is an iOS-only authorization. Android personalization is governed by
 * the UMP consent signal returned by AdMob; on iOS, do not request a
 * personalized ad unless the user has also allowed access to the IDFA.
 */
export async function requestAdPersonalizationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;

  const current = await TrackingTransparency.getTrackingPermissionsAsync();
  if (current.granted) return true;
  if (current.status !== 'undetermined') return false;

  const requested = await TrackingTransparency.requestTrackingPermissionsAsync();
  return requested.granted;
}

export async function showAdMobPrivacyOptions(): Promise<void> {
  const googleMobileAds = getGoogleMobileAdsPackage();
  if (!googleMobileAds) {
    throw new Error('この環境では広告のプライバシー設定を開けません。');
  }

  await googleMobileAds.AdsConsent.showPrivacyOptionsForm();
}
