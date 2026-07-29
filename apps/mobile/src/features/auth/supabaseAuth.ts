import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { clearAuthSession, getAuthSession, saveAuthSession } from './authStorage';
import { AuthProvider, AuthSession } from './authTypes';
import {
  clearSupabasePersistedAuthSession,
  isSupabaseConfigured,
  requireSupabaseClient,
} from '@/features/supabase/supabaseClient';

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
  const cachedProviderMatchesSupabase = isAnonymousSupabaseSession(session)
    ? cachedSession?.provider === 'guest'
    : cachedSession?.provider !== 'guest';
  if (cachedSession?.supabaseUserId === session.user.id && cachedProviderMatchesSupabase) {
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

export async function signInAsGuest(displayName?: string): Promise<Session> {
  const client = requireSupabaseClient();
  const guestName = displayName?.trim();
  const { data, error } = await client.auth.signInAnonymously({
    options: {
      data: guestName ? { name: guestName, full_name: guestName } : undefined,
    },
  });
  if (error || !data.session || !data.user) {
    console.warn('[auth] anonymous sign-in failed', error);
    throw new Error(buildGuestSignInErrorMessage(error));
  }

  await saveAuthSession(createAuthSessionFromSupabaseSession(data.session, 'guest', guestName));
  return data.session;
}

function buildGuestSignInErrorMessage(error: unknown): string {
  const details =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : undefined;
  const baseMessage =
    'ゲストアカウントを作成できませんでした。SupabaseのAuthentication > ProvidersでAnonymous sign-insが有効か確認してください。';

  return details ? `${baseMessage}\n\n詳細: ${details}` : baseMessage;
}

export async function signInWithSupabaseOAuth(provider: OAuthProvider): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const currentSession = await getSupabaseSession();
  const linkFromGuest =
    currentSession && isAnonymousSupabaseSession(currentSession) ? currentSession : undefined;
  const redirectTo = getOAuthRedirectUrl();
  console.log('[auth] Supabase OAuth redirect URL:', redirectTo);
  const credentials = {
    provider: supabaseOAuthProviders[provider],
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  } as const;
  const { data, error } = linkFromGuest
    ? await client.auth.linkIdentity(credentials)
    : await client.auth.signInWithOAuth(credentials);
  if (error || !data.url) {
    if (linkFromGuest) {
      throw new Error(buildIdentityLinkErrorMessage(provider, error));
    }
    throw new Error(
      `${authProviderLabels[provider]}ログインを開始できませんでした。SupabaseのProvider設定を確認してください。`,
    );
  }
  logOAuthStartUrl(data.url);

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new Error(`${authProviderLabels[provider]}ログインがキャンセルされました。`);
  }

  return completeSupabaseOAuthCallback(result.url, provider, linkFromGuest?.user.id);
}

export async function signInWithSupabaseAppleNative(): Promise<AuthSession> {
  const client = requireSupabaseClient();
  const currentSession = await getSupabaseSession();
  const linkFromGuest =
    currentSession && isAnonymousSupabaseSession(currentSession) ? currentSession : undefined;
  const nonce = createNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    nonce: hashedNonce,
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
  });

  if (!credential.identityToken) {
    throw new Error('Appleログインの認証情報を取得できませんでした。');
  }

  const appleTokenClaims = decodeJwtPayload(credential.identityToken);
  console.log('[auth] Apple id token aud:', appleTokenClaims?.aud);
  console.log('[auth] Apple id token iss:', appleTokenClaims?.iss);

  const appleCredentials = {
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  } as const;
  const { data, error } = linkFromGuest
    ? await client.auth.linkIdentity({
        provider: 'apple',
        token: credential.identityToken,
        nonce,
      })
    : await client.auth.signInWithIdToken(appleCredentials);

  if (error || !data.session) {
    if (linkFromGuest) {
      throw new Error(buildIdentityLinkErrorMessage('apple', error));
    }
    const message = getAuthErrorMessage(error);
    console.warn('[auth] Apple id token sign-in failed', {
      aud: appleTokenClaims?.aud,
      iss: appleTokenClaims?.iss,
      message,
    });
    throw new Error(`Supabaseログインセッションを作成できませんでした。\n\n詳細: ${message}`);
  }

  assertLinkedUserWasPreserved(linkFromGuest?.user.id, data.session.user.id);

  const session = createAuthSessionFromSupabaseSession(data.session, 'apple');
  await saveAuthSession(session);
  return session;
}

export async function completeSupabaseOAuthCallback(
  callbackUrl: string,
  fallbackProvider?: OAuthProvider,
  expectedLinkedUserId?: string,
): Promise<AuthSession> {
  const supabaseSession = await completeOAuthCallback(
    callbackUrl,
    expectedLinkedUserId ? fallbackProvider : undefined,
  );
  assertLinkedUserWasPreserved(expectedLinkedUserId, supabaseSession.user.id);
  const session = createAuthSessionFromSupabaseSession(supabaseSession, fallbackProvider);
  await saveAuthSession(session);
  return session;
}

async function completeOAuthCallback(
  callbackUrl: string,
  linkingProvider?: OAuthProvider,
): Promise<Session> {
  const client = requireSupabaseClient();
  assertTrustedOAuthCallbackUrl(callbackUrl);
  const params = getCallbackParams(callbackUrl);
  const callbackError = params.get('error_description') ?? params.get('error');
  if (callbackError) {
    if (linkingProvider) {
      throw new Error(
        buildIdentityLinkErrorMessage(linkingProvider, {
          code: params.get('error_code') ?? params.get('error'),
          message: callbackError,
        }),
      );
    }
    throw new Error('Supabaseログインを完了できませんでした。');
  }
  const code = params.get('code');
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      if (linkingProvider) {
        throw new Error(buildIdentityLinkErrorMessage(linkingProvider, error));
      }
      throw new Error('Supabaseログインセッションを作成できませんでした。');
    }
    return data.session;
  }

  throw new Error('Supabaseログインの戻り値を確認できませんでした。');
}

export async function signOutSupabaseAuth(): Promise<void> {
  const client = requireSupabaseClient();
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) {
      console.warn('[auth] local sign-out failed', error);
    }
  } catch (error) {
    console.warn('[auth] local sign-out failed', error);
  }
  await clearLocalAuthStateBestEffort('sign-out');
}

/**
 * Permanently removes the current Supabase account through the server-side
 * delete-account function. The service-role credential remains on the server.
 */
export async function deleteSupabaseAccount(): Promise<void> {
  const client = requireSupabaseClient();
  const { error } = await client.functions.invoke('delete-account', {
    method: 'POST',
  });
  if (error) {
    throw new Error(
      'アカウントを削除できませんでした。通信状況を確認して、しばらくしてからお試しください。',
    );
  }

  try {
    const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
    if (signOutError) {
      console.warn('[auth] local sign-out after account deletion failed', signOutError);
    }
  } catch (signOutError) {
    // The account may already be gone or the logout request may be offline.
    // The persisted Supabase and app sessions are still removed below.
    console.warn('[auth] local sign-out after account deletion failed', signOutError);
  }

  await clearLocalAuthStateBestEffort('account deletion');
}

async function clearLocalAuthStateBestEffort(context: string): Promise<void> {
  let pendingCleanups = [
    { label: 'Supabase persisted session', run: clearSupabasePersistedAuthSession },
    { label: 'app auth session', run: clearAuthSession },
  ];

  for (let attempt = 1; attempt <= 2 && pendingCleanups.length > 0; attempt += 1) {
    const results = await Promise.allSettled(pendingCleanups.map((cleanup) => cleanup.run()));
    pendingCleanups = pendingCleanups.filter((_, index) => results[index]?.status === 'rejected');
  }

  if (pendingCleanups.length > 0) {
    console.warn(
      `[auth] local cleanup after ${context} did not complete`,
      pendingCleanups.map((cleanup) => cleanup.label),
    );
  }
}

function assertLinkedUserWasPreserved(
  expectedSupabaseUserId: string | undefined,
  actualSupabaseUserId: string,
): void {
  if (expectedSupabaseUserId && actualSupabaseUserId !== expectedSupabaseUserId) {
    throw new Error(
      '安全のためアカウントの引き継ぎを中止しました。ゲストのまま利用を続けてください。',
    );
  }
}

function buildIdentityLinkErrorMessage(provider: OAuthProvider, error: unknown): string {
  const details = getAuthErrorMessage(error).toLowerCase();
  const providerLabel = authProviderLabels[provider];

  if (
    details.includes('identity_already_exists') ||
    details.includes('identity is already linked') ||
    details.includes('already been registered')
  ) {
    return `この${providerLabel}アカウントは、別のにゃんストックアカウントで使用されています。ゲストデータは変更していません。`;
  }

  if (details.includes('manual') && details.includes('link')) {
    return `${providerLabel}への引き継ぎ設定が完了していません。ゲストデータは変更していません。`;
  }

  return `${providerLabel}アカウントへ引き継げませんでした。ゲストデータは変更していません。`;
}

function getStringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function createAuthSessionFromSupabaseSession(
  session: Session,
  fallbackProvider?: AuthProvider,
  fallbackName?: string,
): AuthSession {
  const linkedIdentityProvider = session.user.identities
    ?.map((identity) => getAuthProvider(identity.provider))
    .find((provider) => provider && provider !== 'guest');
  const provider = isAnonymousSupabaseSession(session)
    ? 'guest'
    : (fallbackProvider ??
      getAuthProvider(session.user.app_metadata?.provider) ??
      linkedIdentityProvider ??
      'guest');
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
      fallbackName ??
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

function isAnonymousSupabaseSession(session: Session): boolean {
  return (
    session.user.is_anonymous === true ||
    getAuthProvider(session.user.app_metadata?.provider) === 'guest'
  );
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

function assertTrustedOAuthCallbackUrl(callbackUrl: string): void {
  const callback = new URL(callbackUrl);
  const isTrusted = getAllowedOAuthRedirectUrls().some((allowedUrl) => {
    const allowed = new URL(allowedUrl);
    return (
      callback.protocol === allowed.protocol &&
      callback.hostname === allowed.hostname &&
      callback.port === allowed.port &&
      normalizePathname(callback.pathname) === normalizePathname(allowed.pathname)
    );
  });

  if (!isTrusted) {
    throw new Error('Supabaseログインの戻り先を確認できませんでした。');
  }
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
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

function getAllowedOAuthRedirectUrls(): string[] {
  return Array.from(new Set([getOAuthRedirectUrl(), 'nyanstock://auth/callback'].filter(Boolean)));
}

function createNonce(length = 32): string {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
  const bytes = Crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) => charset[byte % charset.length]).join('');
}

function getAuthErrorMessage(error: unknown): string {
  if (!error) return 'セッションが空でした。';

  if (typeof error === 'object' && error !== null) {
    const details = error as {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      name?: unknown;
    };
    const parts = [
      typeof details.message === 'string' ? details.message : undefined,
      typeof details.code === 'string' ? `code=${details.code}` : undefined,
      typeof details.status === 'number' || typeof details.status === 'string'
        ? `status=${details.status}`
        : undefined,
      typeof details.name === 'string' ? `name=${details.name}` : undefined,
    ].filter(Boolean);
    if (parts.length) return parts.join(' / ');
  }

  return String(error);
}

function decodeJwtPayload(token: string): { aud?: unknown; iss?: unknown } | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(globalThis.atob(padded)) as { aud?: unknown; iss?: unknown };
  } catch {
    return undefined;
  }
}
