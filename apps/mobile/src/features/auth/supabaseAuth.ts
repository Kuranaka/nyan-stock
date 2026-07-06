import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { clearAuthSession, getAuthSession, saveAuthSession } from './authStorage';
import { AuthProvider, AuthSession } from './authTypes';
import { isSupabaseConfigured, requireSupabaseClient } from '@/features/supabase/supabaseClient';

type OAuthProvider = Exclude<AuthProvider, 'guest'>;

export async function getSupabaseSession() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error('共有用セッションを確認できませんでした。');
  }
  return data.session;
}

export async function getCurrentAuthSession(): Promise<AuthSession | undefined> {
  if (!isSupabaseConfigured()) {
    return getAuthSession();
  }

  const session = await getSupabaseSession();
  if (!session) {
    await clearAuthSession();
    return undefined;
  }

  const cachedSession = await getAuthSession();
  if (cachedSession?.supabaseUserId === session.user.id) {
    return cachedSession;
  }

  const nextSession = createAuthSessionFromSupabaseSession(session);
  await saveAuthSession(nextSession);
  return nextSession;
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

  await saveAuthSession(createAuthSessionFromSupabaseSession(data.session));
  return data.session;
}

export async function signInWithSupabaseOAuth(provider: OAuthProvider): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const redirectTo = getOAuthRedirectUrl();
  console.log('[auth] Supabase OAuth redirect URL:', redirectTo);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: supabaseOAuthProviders[provider],
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    throw new Error(`${authProviderLabels[provider]}ログインを開始できませんでした。SupabaseのProvider設定を確認してください。`);
  }
  logOAuthStartUrl(data.url);

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new Error(`${authProviderLabels[provider]}ログインがキャンセルされました。`);
  }

  return completeSupabaseOAuthCallback(result.url, provider);
}

export async function completeSupabaseOAuthCallback(
  callbackUrl: string,
  fallbackProvider?: OAuthProvider,
): Promise<AuthSession> {
  const supabaseSession = await completeOAuthCallback(callbackUrl);
  const session = createAuthSessionFromSupabaseSession(supabaseSession, fallbackProvider);
  await saveAuthSession(session);
  return session;
}

async function completeOAuthCallback(callbackUrl: string): Promise<Session> {
  const client = requireSupabaseClient();
  const params = getCallbackParams(callbackUrl);
  const code = params.get('code');
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      throw new Error('Supabaseログインセッションを作成できませんでした。');
    }
    return data.session;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      throw new Error('Supabaseログインセッションを保存できませんでした。');
    }
    return data.session;
  }

  throw new Error('Supabaseログインの戻り値を確認できませんでした。');
}

export async function signOutSupabaseAuth(): Promise<void> {
  const client = requireSupabaseClient();
  await client.auth.signOut();
  await clearAuthSession();
}

function getStringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function createAuthSessionFromSupabaseSession(session: Session, fallbackProvider?: AuthProvider): AuthSession {
  const provider = getAuthProvider(session.user.app_metadata?.provider) ?? fallbackProvider ?? 'guest';
  return {
    provider,
    providerUserId:
      getStringMetadata(session.user.user_metadata?.provider_id) ??
      getStringMetadata(session.user.identities?.[0]?.id) ??
      session.user.id,
    supabaseUserId: session.user.id,
    email: session.user.email,
    name:
      getStringMetadata(session.user.user_metadata?.name) ??
      getStringMetadata(session.user.user_metadata?.full_name) ??
      (provider === 'guest' ? 'ゲスト' : undefined),
    photoUrl:
      getStringMetadata(session.user.user_metadata?.avatar_url) ??
      getStringMetadata(session.user.user_metadata?.picture),
    signedInAt: new Date().toISOString(),
  };
}

function getAuthProvider(value: unknown): AuthProvider | undefined {
  if (value === 'google' || value === 'apple' || value === 'x') return value;
  if (value === 'twitter') return 'x';
  if (value === 'anonymous') return 'guest';
  return undefined;
}

function getCallbackParams(callbackUrl: string): URLSearchParams {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });
  return params;
}

function logOAuthStartUrl(authUrl: string): void {
  try {
    const url = new URL(authUrl);
    console.log('[auth] Supabase OAuth host:', url.host);
    console.log('[auth] Supabase OAuth redirect_to:', url.searchParams.get('redirect_to'));
  } catch {
    console.log('[auth] Supabase OAuth URL could not be parsed.');
  }
}

const authProviderLabels = {
  google: 'Google',
  apple: 'Apple',
  x: 'X',
} satisfies Record<OAuthProvider, string>;

const supabaseOAuthProviders = {
  google: 'google',
  apple: 'apple',
  x: 'twitter',
} satisfies Record<OAuthProvider, 'google' | 'apple' | 'twitter'>;

function getOAuthRedirectUrl(): string {
  const configuredRedirectUrl = process.env.EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL?.trim();
  return (
    configuredRedirectUrl ||
    makeRedirectUri({
      native: 'nyanstock://auth/callback',
      path: 'auth/callback',
      scheme: 'nyanstock',
    })
  );
}
