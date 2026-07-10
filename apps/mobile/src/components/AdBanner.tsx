import { useRouter } from 'expo-router';
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

export function AdBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [adFailed, setAdFailed] = useState(false);
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | undefined>();
  const googleMobileAds = getGoogleMobileAdsPackage();
  const bannerUnitId =
    googleMobileAds && (__DEV__ || !productionBannerUnitId)
      ? googleMobileAds.TestIds.ADAPTIVE_BANNER
      : productionBannerUnitId;

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
      <View style={styles.banner}>
        {googleMobileAds && bannerUnitId && !adFailed ? (
          <googleMobileAds.BannerAd
            unitId={bannerUnitId}
            size={googleMobileAds.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            onAdFailedToLoad={() => setAdFailed(true)}
          />
        ) : (
          <Text style={styles.placeholderText}>
            {adFailed ? '広告を読み込めませんでした' : '開発ビルドで広告を表示します'}
          </Text>
        )}
      </View>
      <View style={styles.disclosureRow}>
        <View style={styles.badge} accessibilityLabel="広告">
          <Text style={styles.badgeText}>広告</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="広告とアフィリエイトについて"
          onPress={() => router.push('/affiliate')}
          style={({ pressed }) => [styles.disclosureButton, pressed && styles.disclosureButtonPressed]}
        >
          <Text style={styles.disclosureText} numberOfLines={1}>
            広告とアフィリエイトについて
          </Text>
        </Pressable>
      </View>
    </View>
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
  placeholderText: {
    color: colors.subText,
    fontSize: 12,
  },
  disclosureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 22,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },
  disclosureButton: {
    minHeight: 22,
    justifyContent: 'center',
  },
  disclosureButtonPressed: {
    opacity: 0.65,
  },
  disclosureText: {
    color: colors.subText,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
