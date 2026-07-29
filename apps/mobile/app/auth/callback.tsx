import { useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { completeSupabaseOAuthCallback } from '@/features/auth/supabaseAuth';
import { confirmInitialNotificationSetting } from '@/features/notifications/initialNotificationSetting';
import { updateSettings } from '@/features/settings/settingsStorage';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const linkedUrl = Linking.useURL();
  const callbackUrl = useMemo(() => getCurrentCallbackUrl(linkedUrl), [linkedUrl]);
  const [message, setMessage] = useState('ログイン情報を確認しています...');

  useEffect(() => {
    if (!callbackUrl) return;

    let cancelled = false;

    const completeSignIn = async () => {
      try {
        await completeSupabaseOAuthCallback(callbackUrl);
        setMessage('ログインを完了しています...');
        const completedSettings = await updateSettings({ onboardingCompleted: true });
        await confirmInitialNotificationSetting(completedSettings, {
          onboardingJustCompleted: true,
          settingsAlreadySaved: true,
        });
        if (!cancelled) {
          router.replace('/cat-profile');
        }
      } catch (error: unknown) {
        const nextMessage =
          error instanceof Error
            ? error.message
            : 'ログインを完了できませんでした。もう一度お試しください。';
        if (!cancelled) {
          setMessage(nextMessage);
        }
      }
    };

    void completeSignIn();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

function getCurrentCallbackUrl(linkedUrl: string | null): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }
  return linkedUrl ?? undefined;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
});
