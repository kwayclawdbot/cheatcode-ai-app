import type {
  AlertDraftResponse, AlertsResponse, CreateConversationResponse, HomeResponse,
  ModeResponse, OnboardingCompleteRequest, OnboardingCompleteResponse, SetupsResponse,
} from '@cheatcode/shared';
import { env, offlineMode } from './env';
import { supabase } from './supabase';
import { streamSSE, SSEHandlers } from './sse';
import {
  adaptAlertDetail, adaptAlertLifecycle, adaptAlertPreview, adaptAlerts, adaptCandles,
  adaptHome, adaptMe, adaptMemory, adaptNotifications, adaptQuoteLoose, adaptSearch,
  adaptSetupCard, adaptSetupDetail, adaptSymbolDetail, adaptTradeLanding,
} from './adapters';
import type {
  AlertDetail, AlertDraftPreview, AlertLifecycle, AlertsPayload, Candle, ExplainLevel,
  GoalMode, GradedSetup, HomePayload, Me, MemoryRow, NotificationRow, Quote,
  SearchResult, SetupDetail, SymbolDetail, TradeLanding,
} from './types';

export class ApiError extends Error {
  code: string;
  constructor(code: string, messagePlain: string) {
    super(messagePlain);
    this.code = code;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.hasApi) throw new ApiError('NO_API', 'The service is not connected yet.');
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('NETWORK', "I couldn't reach the service just now. Check your connection and try again.");
  }
  const text = await res.text();
  // A route the API lane has not deployed yet answers with Next's HTML 404,
  // not our envelope — that must be a typed error, not a JSON parse crash.
  type Envelope = { error?: { code?: string; message_plain?: string } };
  let json: Envelope | null = null;
  try {
    json = text ? (JSON.parse(text) as Envelope) : null;
  } catch {
    if (!res.ok) throw new ApiError(res.status === 404 ? 'NOT_FOUND' : 'INTERNAL', 'That part of the service is not live yet.');
    throw new ApiError('BAD_RESPONSE', 'The service sent something I could not read.');
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    const code = err.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL');
    throw new ApiError(code, err.message_plain ?? 'Something went wrong. Please try again.');
  }
  return json as T;
}

export const api = {
  /** False in fixtures mode or before the env is wired — screens fall back to fixtures. */
  available: () => !offlineMode && env.hasApi,

  home: async (mode: GoalMode): Promise<HomePayload> =>
    adaptHome(await request<HomeResponse>(`/home?mode=${mode}`)),

  setups: async (mode: GoalMode, state?: string): Promise<GradedSetup[]> => {
    const r = await request<SetupsResponse>(`/setups?mode=${mode}${state ? `&state=${state}` : ''}`);
    return (r.setups ?? []).map(adaptSetupCard);
  },

  alerts: async (): Promise<AlertsPayload & { empty_copy: string }> =>
    adaptAlerts(await request<AlertsResponse>('/alerts')),

  completeOnboarding: (body: OnboardingCompleteRequest) =>
    request<OnboardingCompleteResponse>('/onboarding/complete', { method: 'POST', body: JSON.stringify(body) }),

  setMode: (mode: GoalMode) =>
    request<ModeResponse>('/mode', { method: 'PUT', body: JSON.stringify({ mode }) }),

  draftAlert: (natural_language: string, refs: { symbol?: string; setup_id?: string; level?: number }) =>
    request<AlertDraftResponse>('/alerts/draft', { method: 'POST', body: JSON.stringify({ natural_language, refs }) }),

  createConversation: (mode: GoalMode, pinned?: { symbols?: string[]; setup_ids?: string[] }) =>
    request<CreateConversationResponse>('/kai/conversations', { method: 'POST', body: JSON.stringify({ mode, pinned }) }),

  streamMessage: async (conversationId: string, content: string, h: SSEHandlers, signal?: AbortSignal) =>
    streamSSE(
      `${env.apiBase}/api/v1/kai/conversations/${conversationId}/messages`,
      { headers: await authHeaders(), body: JSON.stringify({ content }), signal },
      h,
    ),

  /* ---------------- Round 2 ---------------- */

  setupDetail: async (id: string): Promise<SetupDetail> =>
    adaptSetupDetail(await request<unknown>(`/setups/${encodeURIComponent(id)}`), id),

  /** Adds the setup to Watching and drafts the default ready-alert. */
  followSetup: (id: string) =>
    request<unknown>(`/setups/${encodeURIComponent(id)}/follow`, { method: 'POST', body: '{}' }),

  alertsLifecycle: async (): Promise<AlertLifecycle> =>
    adaptAlertLifecycle(await request<unknown>('/alerts')),

  alertDetail: async (id: string): Promise<AlertDetail> =>
    adaptAlertDetail(await request<unknown>(`/alerts/${encodeURIComponent(id)}`), id),

  /** Draft → active. Throws ApiError('ENTITLEMENT_REQUIRED') at the tier limit. */
  activateAlert: (draftId: string) =>
    request<unknown>('/alerts', { method: 'POST', body: JSON.stringify({ draft_id: draftId }) }),

  alertAction: (id: string, action: 'pause' | 'resume' | 'cancel' | 'edit', naturalLanguage?: string) =>
    request<unknown>(`/alerts/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify(naturalLanguage ? { action, natural_language: naturalLanguage } : { action }),
    }),

  draftAlertPreview: async (naturalLanguage: string, refs: { symbol?: string; setup_id?: string; level?: number }): Promise<AlertDraftPreview> =>
    adaptAlertPreview(await request<unknown>('/alerts/draft', { method: 'POST', body: JSON.stringify({ natural_language: naturalLanguage, refs }) })),

  tradeLanding: async (mode: GoalMode): Promise<TradeLanding> =>
    adaptTradeLanding(await request<unknown>(`/trade/landing?mode=${mode}`)),

  search: async (q: string): Promise<SearchResult[]> =>
    adaptSearch(await request<unknown>(`/trade/search?q=${encodeURIComponent(q)}`), q),

  symbolDetail: async (symbol: string, mode: GoalMode): Promise<SymbolDetail> =>
    adaptSymbolDetail(await request<unknown>(`/symbols/${encodeURIComponent(symbol)}?mode=${mode}`), symbol, mode),

  candles: async (symbol: string, tf: '1d' | '5m', from?: string, to?: string): Promise<Candle[]> => {
    const qs = new URLSearchParams({ symbol, tf });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return adaptCandles(await request<unknown>(`/market/candles?${qs.toString()}`));
  },

  snapshot: async (symbols: string[]): Promise<Record<string, Quote | null>> => {
    const r = await request<Record<string, unknown>>(`/market/snapshot?symbols=${encodeURIComponent(symbols.join(','))}`);
    const src = (r && typeof r === 'object' && 'quotes' in r ? (r as { quotes: unknown }).quotes : r) as Record<string, unknown>;
    const out: Record<string, Quote | null> = {};
    Object.entries(src ?? {}).forEach(([k, v]) => { out[k] = adaptQuoteLoose(v); });
    return out;
  },

  addToWatchlist: (symbol: string) =>
    request<unknown>('/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),

  removeFromWatchlist: (symbol: string) =>
    request<unknown>(`/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),

  me: async (): Promise<Me> => adaptMe(await request<unknown>('/me')),

  putSettings: (body: Record<string, unknown>) =>
    request<unknown>('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  memory: async (): Promise<MemoryRow[]> => adaptMemory(await request<unknown>('/memory')),

  deleteMemory: (id: string) => request<unknown>(`/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  deleteAllMemory: () => request<unknown>('/memory', { method: 'DELETE' }),

  putMemorySettings: (enabled: boolean) =>
    request<unknown>('/memory/settings', { method: 'PUT', body: JSON.stringify({ memory_enabled: enabled }) }),

  resetPaper: () => request<unknown>('/paper/reset', { method: 'POST', body: '{}' }),

  notifications: async (group?: string): Promise<NotificationRow[]> =>
    adaptNotifications(await request<unknown>(`/notifications${group ? `?group=${group}` : ''}`)),

  markNotificationRead: (id: string) =>
    request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }),

  /** Returns a Stripe Checkout url, or throws ApiError('BILLING_NOT_CONFIGURED'). */
  billingCheckout: () =>
    request<{ url?: string }>('/billing/checkout', { method: 'POST', body: '{}' }),

  /** DEV_TOOLS=1 on the api-app only. */
  simulateClosedTrade: (symbol?: string) =>
    request<{ position_id?: string }>('/dev/simulate-closed-trade', {
      method: 'POST',
      body: JSON.stringify(symbol ? { symbol } : {}),
    }),
};

export type { ExplainLevel };
