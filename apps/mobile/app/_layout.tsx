import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter, StyleSheet, View } from 'react-native';

import { AdBanner } from '@/components/AdBanner';
import { colors } from '@/constants/colors';
import {
  getGoogleMobileAdsPackage,
  prepareAdMobForAdRequests,
  requestAdPersonalizationPermission,
} from '@/features/ads/adMob';
import { getInventoryItemIdFromNotificationResponse } from '@/features/notifications/notificationService';
import { configureRevenueCat } from '@/features/subscription/subscriptionService';
import {
  householdRealtimeEventName,
  householdRealtimeResubscribeEventName,
  subscribeToHouseholdRealtime,
} from '@/features/sync/householdRealtime';

const productionBannerUnitId = process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID?.trim();

export default function RootLayout() {
  const router = useRouter();
  const [adRequestsReady, setAdRequestsReady] = useState(false);
  const [personalizedAdsAllowed, setPersonalizedAdsAllowed] = useState(false);

  useEffect(() => {
    const openInventoryItem = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const inventoryItemId = getInventoryItemIdFromNotificationResponse(response);
      if (!inventoryItemId) return;

      router.push({ pathname: '/inventory-detail', params: { id: inventoryItemId } });
      Notifications.clearLastNotificationResponse();
    };

    openInventoryItem(Notifications.getLastNotificationResponse());
    const responseListener = Notifications.addNotificationResponseReceivedListener(openInventoryItem);
    return () => {
      responseListener.remove();
    };
  }, [router]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const startSubscription = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      void subscribeToHouseholdRealtime(() => {
        DeviceEventEmitter.emit(householdRealtimeEventName);
      }).then((nextUnsubscribe) => {
        unsubscribe = nextUnsubscribe;
      });
    };

    startSubscription();
    const resubscribeListener = DeviceEventEmitter.addListener(
      householdRealtimeResubscribeEventName,
      startSubscription,
    );

    return () => {
      resubscribeListener.remove();
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    void configureRevenueCat().catch((error: unknown) => {
      console.warn('[RevenueCat] initialization failed', error);
    });
  }, []);

  useEffect(() => {
    let active = true;

    const prepareAds = async () => {
      if (!__DEV__ && !productionBannerUnitId) {
        if (active) setAdRequestsReady(true);
        return;
      }

      const googleMobileAds = getGoogleMobileAdsPackage();
      if (!googleMobileAds) {
        if (active) setAdRequestsReady(true);
        return;
      }

      try {
        const canRequestAds = await prepareAdMobForAdRequests();
        if (!canRequestAds) return;

        // UMP is shown first. ATT follows only after consent gathering, then
        // determines whether iOS requests may use the IDFA.
        const trackingAllowed = await requestAdPersonalizationPermission();

        await googleMobileAds.default().setRequestConfiguration({
          maxAdContentRating: googleMobileAds.MaxAdContentRating.G,
        });
        await googleMobileAds.default().initialize();
        if (active) {
          setPersonalizedAdsAllowed(trackingAllowed);
          setAdRequestsReady(true);
        }
      } catch (error) {
        console.warn('[AdMob] initialization failed', error);
      }
    };

    void prepareAds();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.stack}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            headerBackTitle: '戻る',
            headerBackButtonMenuEnabled: false,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="cat-profile" options={{ title: '猫プロフィール' }} />
          <Stack.Screen name="inventory-form" options={{ title: '商品登録' }} />
          <Stack.Screen name="barcode-scan" options={{ title: 'バーコード読み取り' }} />
          <Stack.Screen name="inventory-detail" options={{ title: '商品詳細' }} />
          <Stack.Screen name="cost-dashboard" options={{ title: '費用ダッシュボード' }} />
          <Stack.Screen name="purchase-history" options={{ title: '購入履歴' }} />
          <Stack.Screen name="settings" options={{ title: '設定' }} />
          <Stack.Screen name="help" options={{ title: 'ヘルプ' }} />
          <Stack.Screen name="subscription" options={{ title: 'にゃんストック Plus' }} />
          <Stack.Screen name="privacy" options={{ title: 'プライバシーポリシー' }} />
          <Stack.Screen name="terms" options={{ title: '利用規約' }} />
          <Stack.Screen name="affiliate" options={{ title: 'アフィリエイトについて' }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
      </View>
      <AdBanner adRequestsReady={adRequestsReady} personalizedAdsAllowed={personalizedAdsAllowed} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stack: {
    flex: 1,
  },
});
