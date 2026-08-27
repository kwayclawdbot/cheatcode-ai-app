import { Platform } from 'react-native';

const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBase: process.env.EXPO_PUBLIC_API_BASE ?? '',
  fixtures: process.env.EXPO_PUBLIC_FIXTURES ?? '',
};

export const env = {
  ...raw,
  /** EXPO_PUBLIC_FIXTURES=1 → every screen renders from local fixtures, no network. */
  FIXTURES: raw.fixtures === '1' || raw.fixtures === 'true',
  /** No Supabase configured yet (SCHEMA lane hasn't published .env values). */
  hasSupabase: !!raw.supabaseUrl && !!raw.supabaseAnonKey,
  hasApi: !!raw.apiBase,
  isWeb: Platform.OS === 'web',
};

/** True when we must not touch the network at all. */
export const offlineMode = env.FIXTURES || !env.hasSupabase;
