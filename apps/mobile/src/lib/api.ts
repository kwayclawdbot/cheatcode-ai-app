import type {
  AlertDraftResponse, AlertsResponse, CreateConversationResponse, HomeResponse,
  ModeResponse, OnboardingCompleteRequest, OnboardingCompleteResponse, SetupsResponse,
} from '@cheatcode/shared';
import { env, offlineMode } from './env';
import { supabase } from './supabase';
import { getAccessToken, recoverSession, SESSION_EXPIRED_COPY } from './auth-token';
import { streamSSE, SSEHandlers } from './sse';
import {
  adaptAlertDetail, adaptAlertLifecycle, adaptAlertPreview, adaptAlerts, adaptCandles,
  adaptHome, adaptMe, adaptMemory, adaptNotifications, adaptQuoteLoose, adaptSearch,
  adaptSetupCard, adaptSetupDetail, adaptSymbolDetail, adaptTradeLanding,
} from './adapters';
import { adaptAlertsSimple, adaptHomeV5, adaptWorkspace, mergeSetupDetail } from './v5';
import {
  adaptAlertsRound4, adaptConversations, adaptExperience, adaptFocus, adaptKaiProfile,
  adaptRuleAdherence, adaptTickerPage,
} from './adapters';
import type {
  AlertDetail, AlertDraftPreview, AlertLifecycle, AlertsPayload, AlertsRound4, AlertsSimple,
  AlertTab, Candle, ConversationsPayload, Experience, ExplainLevel, FocusKey, GoalMode,
  GradedSetup, HomePayload, HomeV5, KaiProfile, Me, MemoryRow, NotificationRow, Quote,
  RuleAdherence, SearchResult, SetupDetail, SymbolDetail, SymbolWorkspace, TickerPage,
  TradeLanding,
} from './types';

export class ApiError extends Error {
  code: string;
  constructor(code: string, messagePlain: string) {
    super(messagePlain);
    this.code = code;
  }
}

async function authHeaders(token?: string | null): Promise<Record<string, string>> {
  if (!supabase) return {};
  const t = token ?? (await getAccessToken());
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
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
  // Expired/invalid token: refresh once and retry; if the refresh token is dead
  // too, recoverSession() signs out and the route gate shows sign-in.
  if (res.status === 401 && !retried && supabase) {
    const fresh = await recoverSession();
    if (fresh) return request<T>(path, init, true);
    throw new ApiError('UNAUTHENTICATED', SESSION_EXPIRED_COPY);
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

  /**
   * `context` (V5 / API-3) pins the object the sheet was opened over — the
   * system prompt then carries the order preview numbers, the position state,
   * the alert condition or the room summary, so Kai answers IN PLACE.
   * Older API builds ignore the extra key.
   */
  createConversation: (
    mode: GoalMode,
    pinned?: { symbols?: string[]; setup_ids?: string[] },
    context?: { kind: string; id?: string; symbol?: string },
  ) =>
    request<CreateConversationResponse>('/kai/conversations', {
      method: 'POST',
      body: JSON.stringify({ mode, pinned, ...(context ? { context } : null) }),
    }),

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

  /* ---------------- Round 3 · V5 consolidation ---------------- */

  /**
   * `GET /home?mode=` restructured: one opening line, ONE priority object with
   * ONE state-driven primary action, compact "also watching", briefing below.
   * The same call answers both shapes — see src/lib/v5.ts.
   */
  homeV5: async (mode: GoalMode): Promise<HomeV5> => {
    const raw = await request<unknown>(`/home?mode=${mode}`);
    const legacy = adaptHome(raw as HomeResponse);
    return adaptHomeV5(raw, {
      mode,
      market: legacy.market,
      briefing: legacy.briefing,
      leadSetup: legacy.lead_setup,
      watching: legacy.watching.map((w) => ({ id: w.id, symbol: w.symbol, label: w.label, value: w.value })),
      dailyRisk: legacy.daily_risk,
      degraded: legacy.degraded,
      degradedReason: legacy.degraded_reason,
      investNotice: legacy.invest_notice,
    });
  },

  /**
   * `GET /symbols/:symbol?mode=` → the one persistent asset workspace.
   * When the payload carries a setup id but not the setup's depth, the
   * round-2 `/setups/:id` detail is folded in so the module, Kai tab and Plan
   * tab are real rather than half-empty.
   */
  workspace: async (symbol: string, mode: GoalMode): Promise<SymbolWorkspace> => {
    const raw = await request<unknown>(`/symbols/${encodeURIComponent(symbol)}?mode=${mode}`);
    const w = adaptWorkspace(raw, symbol);
    const setupId = w.overview.setup_module?.id;
    if (!setupId || w.plan.suggested?.scenarios.length) return w;
    try {
      return mergeSetupDetail(w, await api.setupDetail(setupId));
    } catch {
      return w;   // the workspace still renders without the setup's depth
    }
  },

  /** `GET /alerts` → Attention · Monitoring · History (audit §6). */
  alertsSimple: async (): Promise<AlertsSimple> => {
    const raw = await request<unknown>('/alerts');
    return adaptAlertsSimple(raw, adaptAlertLifecycle(raw));
  },

  /* ---------------- Round 4 · alerts as trade objects ---------------- */

  /**
   * `GET /alerts?tab=` → the three top-level states (spec §1). A build that
   * does not know the tab param still answers the whole payload, which the
   * adapter splits, so this works against both API generations.
   */
  alertsRound4: async (tab?: AlertTab): Promise<AlertsRound4> =>
    adaptAlertsRound4(await request<unknown>(`/alerts${tab ? `?tab=${tab}` : ''}`)),

  /** `GET /kai/conversations?q=` — the Home drawer's search / pinned / recent. */
  conversations: async (q?: string): Promise<ConversationsPayload> =>
    adaptConversations(await request<unknown>(`/kai/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`)),

  /** `PATCH /kai/conversations/:id` — rename or pin. */
  patchConversation: (id: string, body: { title?: string; pinned?: boolean }) =>
    request<unknown>(`/kai/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  /** `GET /symbols/:symbol` → the ticker-page research payload (round-4 board). */
  tickerPage: async (symbol: string, mode: GoalMode): Promise<TickerPage> =>
    adaptTickerPage(await request<unknown>(`/symbols/${encodeURIComponent(symbol)}?mode=${mode}&view=ticker`), symbol),

  /** `GET /me` → the Account board's Kai profile + rule adherence. */
  kaiProfile: async (fallbackMode: GoalMode): Promise<{ profile: ReturnType<typeof adaptKaiProfile>; adherence: RuleAdherence | null }> => {
    const raw = await request<Record<string, unknown>>('/me');
    return {
      profile: adaptKaiProfile(raw.kai_profile ?? raw, fallbackMode),
      adherence: adaptRuleAdherence(raw.rule_adherence),
    };
  },

  /**
   * `POST /onboarding/complete` — round 4 adds `experience` (new|some|pro) and
   * `focus[]`. The server maps experience onto experience_level /
   * explanation_level, so Kai's voice follows the same answer.
   */
  completeOnboardingRound4: (body: Omit<OnboardingCompleteRequest, 'experience'> & { experience: Experience; focus: FocusKey[] }) =>
    request<OnboardingCompleteResponse>('/onboarding/complete', { method: 'POST', body: JSON.stringify(body) }),

  /** `PUT /settings` accepts experience + focus (round-4 personalize). */
  putKaiProfile: (body: { experience?: Experience; focus?: FocusKey[]; mode?: GoalMode }) =>
    request<unknown>('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  /** DEV_TOOLS=1 on the api-app only. */
  simulateClosedTrade: (symbol?: string) =>
    request<{ position_id?: string }>('/dev/simulate-closed-trade', {
      method: 'POST',
      body: JSON.stringify(symbol ? { symbol } : {}),
    }),
};

export type { ExplainLevel };
