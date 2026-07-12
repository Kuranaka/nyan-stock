import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { getGoogleMobileAdsPackage } from '@/features/ads/adMob';
import {
  getSubscriptionEntitlement,
  SubscriptionEntitlement,
  subscriptionChangedEventName,
} from '@/features/subscription/subscriptionService';

const productionBannerUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID;
const shortcutHiddenPathnames = new Set(['/inventory-form', '/cat-profile']);

export function AdBanner({
  adRequestsReady,
  personalizedAdsAllowed,
  showShortcuts,
}: {
  adRequestsReady: boolean;
  personalizedAdsAllowed: boolean;
  showShortcuts: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [adFailed, setAdFailed] = useState(false);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | undefined>();
  const googleMobileAds = getGoogleMobileAdsPackage();
  const bannerUnitId = adRequestsReady && googleMobileAds
    ? __DEV__
      ? googleMobileAds.TestIds.ADAPTIVE_BANNER
      : productionBannerUnitId
    : undefined;
  const shouldShowShortcuts = showShortcuts && !shortcutHiddenPathnames.has(pathname);

  useEffect(() => {
    void getSubscriptionEntitlement().then(setEntitlement);
    const listener = DeviceEventEmitter.addListener(
      subscriptionChangedEventName,
      (next: SubscriptionEntitlement) => setEntitlement(next),
    );
    return () => listener.remove();
  }, []);

  if (entitlement && !entitlement.shouldShowAds) {
    return null;
  }

  return (
    <View style={[styles.safeArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {bannerUnitId && googleMobileAds && !adFailed ? (
        <View style={styles.banner}>
          <googleMobileAds.BannerAd
            unitId={bannerUnitId}
            size={googleMobileAds.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            // UMP still limits the request in regions where the user has not
            // consented. On iOS, ATT denial additionally forces a non-personalized request.
            requestOptions={{ requestNonPersonalizedAdsOnly: !personalizedAdsAllowed }}
            onAdFailedToLoad={(error) => {
              console.warn('[AdMob] banner failed to load', error);
              setAdFailed(true);
            }}
          />
        </View>
      ) : null}
      {shouldShowShortcuts ? (
        <View style={styles.shortcutRow}>
          <ShortcutButton
            icon="⌂"
            label="在庫一覧"
            selected={pathname === '/'}
            onPress={() => {
              if (pathname !== '/') router.dismissTo('/');
            }}
          />
          <ShortcutButton
            icon="¥"
            label="費用確認"
            selected={pathname === '/cost-dashboard'}
            onPress={() => {
              if (pathname !== '/cost-dashboard') router.dismissTo('/cost-dashboard');
            }}
          />
          <ShortcutButton
            icon="⚙"
            label="設定"
            selected={pathname === '/settings'}
            onPress={() => {
              if (pathname !== '/settings') router.dismissTo('/settings');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ShortcutButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcutButton,
        selected && styles.shortcutButtonSelected,
        pressed && !selected && styles.shortcutButtonPressed,
      ]}
    >
      <Text style={[styles.shortcutIcon, selected && styles.shortcutIconSelected]} numberOfLines={1}>
        {icon}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  banner: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  shortcutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 38,
  },
  shortcutButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
  },
  shortcutButtonPressed: {
    opacity: 0.72,
  },
  shortcutButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  shortcutIcon: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  shortcutIconSelected: {
    color: colors.card,
  },
});
