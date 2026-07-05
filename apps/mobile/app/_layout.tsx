import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="cat-profile" options={{ title: '猫プロフィール' }} />
        <Stack.Screen name="inventory-form" options={{ title: '商品登録' }} />
        <Stack.Screen name="barcode-scan" options={{ title: 'バーコード読み取り' }} />
        <Stack.Screen name="inventory-detail" options={{ title: '商品詳細' }} />
        <Stack.Screen name="cost-dashboard" options={{ title: '費用ダッシュボード' }} />
        <Stack.Screen name="purchase-history" options={{ title: '購入履歴' }} />
        <Stack.Screen name="settings" options={{ title: '設定' }} />
        <Stack.Screen name="privacy" options={{ title: 'プライバシーポリシー' }} />
        <Stack.Screen name="terms" options={{ title: '利用規約' }} />
        <Stack.Screen name="affiliate" options={{ title: 'アフィリエイトについて' }} />
      </Stack>
    </>
  );
}
