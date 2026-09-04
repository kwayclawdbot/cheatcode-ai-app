import { Platform } from 'react-native';

const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiBase: process.env.EXPO_PUBLIC_API_BASE ?? '',
  fixtures: process.env.EXPO_PUBLIC_FIXTURES ?? '',
  devTools: process.env.EXPO_PUBLIC_DEV_TOOLS ?? '',
  tradeV2: process.env.EXPO_PUBLIC_TRADE_V2 ?? '',
};

export const env = {
  ...raw,
  /** EXPO_PUBLIC_FIXTURES=1 → every screen renders from local fixtures, no network. */
  FIXTURES: raw.fixtures === '1' || raw.fixtures === 'true',
  /** No Supabase configured yet (SCHEMA lane hasn't published .env values). */
  hasSupabase: !!raw.supabaseUrl && !!raw.supabaseAnonKey,
  hasApi: !!raw.apiBase,
  /** EXPO_PUBLIC_DEV_TOOLS=1 → the account screen shows the simulate-trade button. */
  DEV_TOOLS: raw.devTools === '1' || raw.devTools === 'true',
  /**
   * EXPO_PUBLIC_TRADE_V2=1 → `/trade/:symbol` opens the three-beat Trade section
   * (look → decide → take) instead of the round-4 portal.
   *
   * OFF BY DEFAULT ON PURPOSE. The old portal keeps working, on the same route,
   * until the owner has seen the new one and chosen between them. `?v=2` on the
   * URL overrides this either way, so the new screen can be looked at without a
   * rebuild and the old one can be reached again while the flag is on.
   */
  TRADE_V2: raw.tradeV2 === '1' || raw.tradeV2 === 'true',
  isWeb: Platform.OS === 'web',
};

/** True when we must not touch the network at all. */
export const offlineMode = env.FIXTURES || !env.hasSupabase;
