import type { Session } from '@supabase/supabase-js';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';

import { clearAuthSession, saveAuthSession } from './authStorage';
import { AuthSession } from './authTypes';
import { requireSupabaseClient } from '@/features/supabase/supabaseClient';

type GoogleProfile = {
  providerUserId: string;
  email?: string;
  name?: string;
  photoUrl?: string;
};

export async function getSupabaseSession() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error('共有用セッションを確認できませんでした。');
  }
  return data.session;
}

export async function ensureSupabaseSessionForSharing(): Promise<Session> {
  const currentSession = await getSupabaseSession();
  if (currentSession) return currentSession;
  return signInAsGuest();
}

export async function signInAsGuest(): Promise<Session> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session || !data.user) {
    throw new Error('ゲストアカウントを作成できませんでした。SupabaseのAnonymous Auth設定を確認してください。');
  }

  await saveAuthSession({
    provider: 'guest',
    providerUserId: data.user.id,
    supabaseUserId: data.user.id,
    name: 'ゲスト',
    signedInAt: new Date().toISOString(),
  });
  return data.session;
}

export async function signInWithGoogleIdToken(idToken: string, profile: GoogleProfile): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error || !data.session || !data.user) {
    throw new Error('Googleアカウントで共有用セッションを作成できませんでした。');
  }

  const session: AuthSession = {
    provider: 'google',
    providerUserId: profile.providerUserId,
    supabaseUserId: data.user.id,
    email: data.user.email ?? profile.email,
    name: getStringMetadata(data.user.user_metadata?.name) ?? getStringMetadata(data.user.user_metadata?.full_name) ?? profile.name,
    photoUrl: getStringMetadata(data.user.user_metadata?.avatar_url) ?? profile.photoUrl,
    signedInAt: new Date().toISOString(),
  };
  await saveAuthSession(session);
  return session;
}

export async function signInWithAppleIdToken(
  idToken: string,
  credential: AppleAuthenticationCredential,
  formattedName?: string,
): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
  });
  if (error || !data.session || !data.user) {
    throw new Error('Appleアカウントで共有用セッションを作成できませんでした。');
  }

  const session: AuthSession = {
    provider: 'apple',
    providerUserId: credential.user,
    supabaseUserId: data.user.id,
    email: data.user.email ?? credential.email ?? undefined,
    name:
      (getStringMetadata(data.user.user_metadata?.name) ??
        getStringMetadata(data.user.user_metadata?.full_name) ??
        formattedName) ||
      undefined,
    signedInAt: new Date().toISOString(),
  };
  await saveAuthSession(session);
  return session;
}

export async function signOutSupabaseAuth(): Promise<void> {
  const client = requireSupabaseClient();
  await client.auth.signOut();
  await clearAuthSession();
}

function getStringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
