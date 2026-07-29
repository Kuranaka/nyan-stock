import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import homeShortcutIcon from '@/assets/shortcut-icons/home.png';
import costShortcutIcon from '@/assets/shortcut-icons/cost.png';
import settingsShortcutIcon from '@/assets/shortcut-icons/settings.png';
import { getGoogleMobileAdsPackage } from '@/features/ads/adMob';

const productionBannerUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID;
const shortcutVisiblePathnames = new Set(['/', '/cost-dashboard', '/settings']);
const adVisiblePathnames = new Set(['/', '/cost-dashboard']);

export function AdBanner({
  adRequestsReady,
  personalizedAdsAllowed,
  show,
}: {
  adRequestsReady: boolean;
  personalizedAdsAllowed: boolean;
  show: boolean;
}) {
  const pathname = usePathname();
  const [adFailed, setAdFailed] = useState(false);
  const googleMobileAds = getGoogleMobileAdsPackage();
  const bannerUnitId =
    adRequestsReady && googleMobileAds
      ? __DEV__
        ? googleMobileAds.TestIds.ADAPTIVE_BANNER
        : productionBannerUnitId
      : undefined;
  if (!show || !adVisiblePathnames.has(pathname) || !bannerUnitId || !googleMobileAds || adFailed) {
    return null;
  }

  return (
    <View style={styles.adContainer}>
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
    </View>
  );
}

export function BottomShortcuts({ show }: { show: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const shouldShowShortcuts = show && shortcutVisiblePathnames.has(pathname);

  if (!shouldShowShortcuts) return null;

  return (
    <View style={[styles.shortcutSafeArea, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.shortcutRow}>
        <ShortcutButton
          icon={homeShortcutIcon}
          label="在庫"
          selected={pathname === '/'}
          onPress={() => {
            if (pathname !== '/') router.dismissTo('/');
          }}
        />
        <ShortcutButton
          label="追加"
          onPress={() => {
            router.push('/inventory-form');
          }}
        />
        <ShortcutButton
          icon={costShortcutIcon}
          label="費用"
          selected={pathname === '/cost-dashboard'}
          onPress={() => {
            if (pathname !== '/cost-dashboard') router.dismissTo('/cost-dashboard');
          }}
        />
        <ShortcutButton
          icon={settingsShortcutIcon}
          label="設定"
          selected={pathname === '/settings'}
          onPress={() => {
            if (pathname !== '/settings') router.dismissTo('/settings');
          }}
        />
      </View>
    </View>
  );
}

function ShortcutButton({
  icon,
  label,
  selected = false,
  onPress,
}: {
  icon?: ImageSourcePropType;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcutButton,
        selected && styles.shortcutButtonSelected,
        pressed && !selected && styles.shortcutButtonPressed,
      ]}
    >
      {icon ? (
        <Image
          accessible={false}
          source={icon}
          style={[styles.shortcutIcon, selected && styles.shortcutIconSelected]}
          resizeMode="contain"
        />
      ) : (
        <View accessible={false} style={styles.shortcutAddIcon}>
          <View style={styles.shortcutAddIconHorizontal} />
          <View style={styles.shortcutAddIconVertical} />
        </View>
      )}
      <Text style={[styles.shortcutLabel, selected && styles.shortcutLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  adContainer: {
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
  shortcutSafeArea: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    paddingHorizontal: 8,
    paddingTop: 6,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  shortcutRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'space-between',
    minHeight: 54,
  },
  shortcutButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 2,
    paddingVertical: 5,
  },
  shortcutButtonPressed: {
    backgroundColor: colors.muted,
  },
  shortcutButtonSelected: {
    backgroundColor: colors.primaryLight,
  },
  shortcutIcon: {
    height: 23,
    tintColor: colors.subText,
    width: 23,
  },
  shortcutIconSelected: {
    tintColor: colors.primaryDark,
  },
  shortcutAddIcon: {
    alignItems: 'center',
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  shortcutAddIconHorizontal: {
    backgroundColor: colors.subText,
    borderRadius: 1,
    height: 2,
    width: 19,
  },
  shortcutAddIconVertical: {
    backgroundColor: colors.subText,
    borderRadius: 1,
    height: 19,
    position: 'absolute',
    width: 2,
  },
  shortcutLabel: {
    color: colors.subText,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  shortcutLabelSelected: {
    color: colors.primaryDark,
  },
});
