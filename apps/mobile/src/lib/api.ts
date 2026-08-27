import type {
  AlertDraftResponse, AlertsResponse, CreateConversationResponse, HomeResponse,
  ModeResponse, OnboardingCompleteRequest, OnboardingCompleteResponse, SetupsResponse,
} from '@cheatcode/shared';
import { env, offlineMode } from './env';
import { supabase } from './supabase';
import { streamSSE, SSEHandlers } from './sse';
import { adaptAlerts, adaptHome, adaptSetupCard } from './adapters';
import type { AlertsPayload, GoalMode, GradedSetup, HomePayload } from './types';

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
  const res = await fetch(`${env.apiBase}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(err.code ?? 'INTERNAL', err.message_plain ?? 'Something went wrong. Please try again.');
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
};
