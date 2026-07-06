import { useCallback, useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';
import { AuthSession } from '@/features/auth/authTypes';
import { signInWithSupabaseOAuth } from '@/features/auth/supabaseAuth';
import { householdRealtimeResubscribeEventName } from '@/features/sync/householdRealtime';
import { activateSignedInAccountHouseholdSync } from '@/features/sync/householdSyncService';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onSignedIn?: (session: AuthSession) => void;
};

export function SignInButtons({ onSignedIn }: Props) {
  const [busyProvider, setBusyProvider] = useState<'google' | 'apple' | undefined>();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setBusyProvider('google');
    try {
      const session = await signInWithSupabaseOAuth('google');
      await activateAccountSyncAfterLogin();
      onSignedIn?.(session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
      Alert.alert('Googleログインに失敗しました', message);
    } finally {
      setBusyProvider(undefined);
    }
  }, [onSignedIn]);

  const signInWithApple = useCallback(async () => {
    setBusyProvider('apple');
    try {
      const session = await signInWithSupabaseOAuth('apple');
      await activateAccountSyncAfterLogin();
      onSignedIn?.(session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
      Alert.alert('Appleログインに失敗しました', message);
    } finally {
      setBusyProvider(undefined);
    }
  }, [onSignedIn]);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        disabled={busyProvider !== undefined}
        style={({ pressed }) => [
          styles.googleButton,
          busyProvider !== undefined && styles.disabled,
          pressed && busyProvider === undefined && styles.pressed,
        ]}
        onPress={() => void signInWithGoogle()}
      >
        <View style={styles.googleIcon}>
          <Text style={styles.googleIconText}>G</Text>
        </View>
        <Text style={styles.googleButtonText}>
          {busyProvider === 'google' ? 'Googleでログイン中...' : 'Googleでログイン'}
        </Text>
      </Pressable>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          cornerRadius={14}
          style={styles.appleButton}
          onPress={() => void signInWithApple()}
        />
      ) : (
        <AppButton
          title={Platform.OS === 'ios' ? 'Appleでログイン' : 'Appleでログイン（iOSのみ）'}
          variant="secondary"
          disabled
          onPress={() => undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  googleIcon: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    width: 24,
  },
  googleIconText: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  appleButton: {
    height: 48,
    width: '100%',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
});

async function activateAccountSyncAfterLogin(): Promise<void> {
  const result = await activateSignedInAccountHouseholdSync({
    onRemoteDataWillOverwriteLocal: () =>
      new Promise((resolve) => {
        Alert.alert(
          'ログイン先のデータを取り込みます',
          'このアカウントにはすでにSupabase側のデータがあります。この端末の猫プロフィール、在庫、購入履歴はログイン先アカウントのデータで上書きされます。',
          [{ text: 'OK', onPress: () => resolve() }],
        );
      }),
  });
  if (result.state) {
    DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
  }
}
