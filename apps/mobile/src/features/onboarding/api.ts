/**
 * The two calls this lane added, and why they are not in `src/lib/api.ts`.
 *
 * `lib/api.ts` belongs to another lane this wave and does not export its
 * request helper. `lib/community-api.ts` hit the same wall and carries its own
 * client for the same reason, with the same rules: the same base URL, the same
 * bearer header, the same envelope, and the server's own sentence repeated
 * rather than one invented here. When the lanes settle, these two belong in
 * `api.ts` beside `completeOnboardingRound4`.
 *
 * NEITHER CALL IS ALLOWED TO BLOCK ANYTHING. Both are courtesies: one picks up
 * what somebody told the website, the other records a risk answer that already
 * has a safe default. Every failure returns null or throws a typed error the
 * caller renders — onboarding does not stop because a lookup was slow.
 */
import { env } from '../../lib/env';
import { getAccessToken } from '../../lib/auth-token';
import type { RiskAnswer } from '../../lib/types';
import { parseIntent, type FunnelIntent } from './intent';

/** Same identifier `lib/api.ts` stamps on every request. See its header. */
const CLIENT_HEADER = { 'X-CheatCode-Client': 'app' } as const;

export type OnboardingApiError = { code: string; plain: string };

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!env.hasApi) throw { code: 'NO_API', plain: 'The service is not connected yet.' } as OnboardingApiError;
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}/api/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...CLIENT_HEADER,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: 'NETWORK', plain: "I couldn't reach the service just now. Check your connection and try again." } as OnboardingApiError;
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // A route the API lane has not deployed answers with Next's HTML 404, not
    // our envelope. `lib/api.ts` makes the same translation and for the same
    // reason: a JSON parse crash here would read as the app being broken.
    throw { code: res.ok ? 'BAD_RESPONSE' : 'NOT_FOUND', plain: 'That part of the service is not live yet.' } as OnboardingApiError;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message_plain?: string } } | null)?.error ?? {};
    throw {
      code: err.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'),
      plain: err.message_plain ?? 'Something went wrong. Please try again.',
    } as OnboardingApiError;
  }
  return json as T;
}

/**
 * `POST /onboarding/intent/claim` — what did this person tell the website?
 *
 * Called once, unconditionally, when onboarding opens with a session. Most
 * people never touched the funnel and get `null`, which is why a miss is not an
 * error and why this swallows everything: a prefill that fails is two extra
 * taps, and there is no version of that worth showing somebody an error screen
 * on the first minute of their account.
 *
 * The token is optional and is only ever a claim about INTENT. Who is asking is
 * settled by the bearer token above — see the route's own header.
 */
export async function claimFunnelIntent(token: string | null): Promise<FunnelIntent | null> {
  try {
    const res = await post<{ intent?: unknown }>('/onboarding/intent/claim', token ? { token } : {});
    return parseIntent(res.intent);
  } catch {
    return null;
  }
}

export type RiskConfirmation = {
  risk_answer: RiskAnswer;
  daily_loss_cap_usd: number;
  plain: string;
};

/**
 * `POST /onboarding/risk` — the risk answer, sent when it is actually given.
 *
 * This one DOES throw, because unlike the claim it is a thing somebody just
 * pressed a button to do, and a silent failure would leave them believing a cap
 * is in force that is not.
 */
export async function confirmRisk(answer: RiskAnswer): Promise<RiskConfirmation> {
  return post<RiskConfirmation>('/onboarding/risk', { risk_answer: answer });
}
