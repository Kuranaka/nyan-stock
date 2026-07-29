import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAuthFlowType =
  process.env.EXPO_PUBLIC_SUPABASE_AUTH_FLOW_TYPE === 'implicit' ? 'implicit' : 'pkce';
const supabaseAuthStorageKey = supabaseUrl
  ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  : undefined;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: supabaseAuthFlowType,
          persistSession: true,
          storage: AsyncStorage,
          // Keep Supabase's existing default key explicit so account deletion can
          // remove the persisted session even if the user no longer exists remotely.
          storageKey: supabaseAuthStorageKey,
        },
      })
    : undefined;

export async function clearSupabasePersistedAuthSession(): Promise<void> {
  if (!supabaseAuthStorageKey) return;

  await AsyncStorage.multiRemove([
    supabaseAuthStorageKey,
    `${supabaseAuthStorageKey}-code-verifier`,
    `${supabaseAuthStorageKey}-user`,
  ]);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseUrl(): string {
  if (!supabaseUrl) {
    throw new Error('Supabase URLの設定が必要です。');
  }
  return supabaseUrl;
}

export function getSupabaseAnonKey(): string {
  if (!supabaseAnonKey) {
    throw new Error('Supabase Anon Keyの設定が必要です。');
  }
  return supabaseAnonKey;
}

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabaseの共有設定が必要です。');
  }
  return supabase;
}
