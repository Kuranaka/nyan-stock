import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdBanner } from '@/components/AdBanner';
import { colors } from '@/constants/colors';
import { getGoogleMobileAdsPackage } from '@/features/ads/adMob';
import { getInventoryItemIdFromNotificationResponse } from '@/features/notifications/notificationService';
import { configureRevenueCat } from '@/features/subscription/subscriptionService';
import {
  householdRealtimeEventName,
  householdRealtimeResubscribeEventName,
  subscribeToHouseholdRealtime,
} from '@/features/sync/householdRealtime';

export default function RootLayout() {
  const router = useRouter();

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
    const googleMobileAds = getGoogleMobileAdsPackage();
    if (!googleMobileAds) return;

    void googleMobileAds
      .default()
      .setRequestConfiguration({
        maxAdContentRating: googleMobileAds.MaxAdContentRating.G,
      })
      .then(() => googleMobileAds.default().initialize())
      .catch((error: unknown) => {
        console.warn('[AdMob] initialization failed', error);
      });
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
            headerLeft: ({ canGoBack }) =>
              canGoBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="戻る"
                  hitSlop={12}
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
                >
                  <Text style={styles.backButtonText}>‹ 戻る</Text>
                </Pressable>
              ) : null,
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
          <Stack.Screen name="subscription" options={{ title: 'にゃんストック Plus' }} />
          <Stack.Screen name="privacy" options={{ title: 'プライバシーポリシー' }} />
          <Stack.Screen name="terms" options={{ title: '利用規約' }} />
          <Stack.Screen name="affiliate" options={{ title: 'アフィリエイトについて' }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
      </View>
      <AdBanner />
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
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 8,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backButtonText: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    transform: [{ translateY: -3 }],
  },
});
