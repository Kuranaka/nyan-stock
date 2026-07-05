import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';
import { saveAuthSession } from '@/features/auth/authStorage';
import {
  createGoogleAuthSession,
  googleClientIds,
  hasAnyGoogleClientId,
} from '@/features/auth/googleAuth';
import { AuthSession } from '@/features/auth/authTypes';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onSignedIn?: (session: AuthSession) => void;
};

const fallbackGoogleClientId =
  googleClientIds.webClientId ??
  googleClientIds.iosClientId ??
  googleClientIds.androidClientId ??
  'missing-google-client-id';

export function SignInButtons({ onSignedIn }: Props) {
  const [busyProvider, setBusyProvider] = useState<'google' | 'apple' | undefined>();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    clientId: fallbackGoogleClientId,
    iosClientId: googleClientIds.iosClientId,
    androidClientId: googleClientIds.androidClientId,
    webClientId: googleClientIds.webClientId,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
    language: 'ja',
  });

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.authentication?.accessToken ?? response.params.access_token;
      if (!accessToken) {
        Alert.alert('Googleログインに失敗しました', 'アクセストークンを取得できませんでした。');
        setBusyProvider(undefined);
        return;
      }

      void createGoogleAuthSession(accessToken)
        .then(async (session) => {
          await saveAuthSession(session);
          onSignedIn?.(session);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
          Alert.alert('Googleログインに失敗しました', message);
        })
        .finally(() => setBusyProvider(undefined));
    }

    if (response?.type === 'error') {
      Alert.alert('Googleログインに失敗しました', response.error?.message ?? 'しばらくしてからもう一度お試しください。');
      setBusyProvider(undefined);
    }

    if (response?.type === 'cancel' || response?.type === 'dismiss') {
      setBusyProvider(undefined);
    }
  }, [onSignedIn, response]);

  const signInWithGoogle = useCallback(async () => {
    if (!hasAnyGoogleClientId()) {
      Alert.alert(
        'Googleログインの設定が必要です',
        '.env に EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID のいずれかを設定してください。',
      );
      return;
    }

    setBusyProvider('google');
    const result = await promptGoogleAsync();
    if (result.type !== 'success' && result.type !== 'opened') {
      setBusyProvider(undefined);
    }
  }, [promptGoogleAsync]);

  const signInWithApple = useCallback(async () => {
    setBusyProvider('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const formattedName = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName)
        : undefined;
      const session: AuthSession = {
        provider: 'apple',
        providerUserId: credential.user,
        email: credential.email ?? undefined,
        name: formattedName || undefined,
        signedInAt: new Date().toISOString(),
      };
      await saveAuthSession(session);
      onSignedIn?.(session);
    } catch (error: unknown) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
      if (code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Appleログインに失敗しました', 'しばらくしてからもう一度お試しください。');
      }
    } finally {
      setBusyProvider(undefined);
    }
  }, [onSignedIn]);

  return (
    <View style={styles.container}>
      <AppButton
        title={busyProvider === 'google' ? 'Googleでログイン中...' : 'Googleで続ける'}
        variant="secondary"
        disabled={!request || busyProvider !== undefined}
        onPress={() => void signInWithGoogle()}
      />
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          cornerRadius={14}
          style={styles.appleButton}
          onPress={() => void signInWithApple()}
        />
      ) : (
        <AppButton
          title={Platform.OS === 'ios' ? 'Appleで続ける' : 'Appleで続ける（iOSのみ）'}
          variant="secondary"
          disabled
          onPress={() => undefined}
        />
      )}
      <Text style={styles.caption}>ログインしても在庫データはこの端末内に保存されます。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  appleButton: {
    height: 48,
    width: '100%',
  },
  caption: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
