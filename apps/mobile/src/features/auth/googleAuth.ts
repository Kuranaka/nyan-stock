import { AuthSession } from './authTypes';

type GoogleUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export const googleClientIds = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

export function hasAnyGoogleClientId(): boolean {
  return Boolean(
    googleClientIds.iosClientId ||
      googleClientIds.androidClientId ||
      googleClientIds.webClientId,
  );
}

export async function createGoogleAuthSession(accessToken: string): Promise<AuthSession> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Googleアカウント情報を取得できませんでした。');
  }

  const user = (await response.json()) as GoogleUserInfo;
  return {
    provider: 'google',
    providerUserId: user.sub,
    email: user.email,
    name: user.name,
    photoUrl: user.picture,
    signedInAt: new Date().toISOString(),
  };
}
