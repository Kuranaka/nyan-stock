import type { ComponentType } from 'react';
import { NativeModules } from 'react-native';

type BannerAdProps = {
  unitId: string;
  size: string;
  onAdFailedToLoad?: (error: unknown) => void;
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
