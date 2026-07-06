import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAuthFlowType = process.env.EXPO_PUBLIC_SUPABASE_AUTH_FLOW_TYPE === 'implicit' ? 'implicit' : 'pkce';

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: supabaseAuthFlowType,
          persistSession: true,
          storage: AsyncStorage,
        },
      })
    : undefined;

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
