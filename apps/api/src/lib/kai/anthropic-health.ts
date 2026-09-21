/**
 * CAN KAI ACTUALLY ANSWER RIGHT NOW — asked with a real (tiny) model call.
 *
 * THE GAP THIS CLOSES. The old check listed models, which only proves the key
 * is accepted. When the account ran out of credit every model call failed with
 * `400 "Your credit balance is too low"` while listing models still worked, so
 * `/api/v1/health` said `anthropic: true` through the whole outage. Only a call
 * that asks the model for something sees that failure.
 *
 * WHAT IT COSTS. One message on the cheapest model the app already uses
 * (Haiku 4.5), one output token. A healthy answer is cached for five minutes,
 * so a monitor polling every ten seconds pays for one probe per five minutes —
 * a few thousandths of a cent an hour. A failed answer costs nothing (the
 * provider does not bill a refused call) and is cached for one minute, so a
 * top-up shows up quickly.
 *
 * FIVE ANSWERS, each with a sentence the owner can read:
 *   ok            the model answered
 *   invalid_key   401/403 — the key is wrong or revoked
 *   no_credit     400 naming the credit balance — top up the account
 *   rate_limited  429/529 — busy; answers are slow or failing for now
 *   unreachable   no answer, a server error, or something unexpected
 *
 * Only `invalid_key` and `no_credit` make the service unhealthy. A timeout or a
 * busy provider is reported but does not flip the whole service red — a check
 * that flaps on a dropped packet teaches everyone to ignore it.
 */
import { env } from '../env';
import { log } from '../log';
import { HAIKU_4_5 } from './models';

export type AnthropicStatus = 'ok' | 'invalid_key' | 'no_credit' | 'rate_limited' | 'unreachable';

export type AnthropicHealth = {
  status: AnthropicStatus;
  /** False only when Kai certainly cannot answer: bad key or no credit. */
  healthy: boolean;
  message: string;
  /** HTTP status the provider gave, when it gave one. */
  http_status: number | null;
  checked_at: string;
  /** True when this answer came from the cache rather than a fresh probe. */
  cached: boolean;
};

export const PROBE_MODEL = HAIKU_4_5;
export const OK_TTL_MS = 5 * 60_000;
export const FAIL_TTL_MS = 60_000;

const MESSAGES: Record<AnthropicStatus, string> = {
  ok: 'Kai can answer. The model replied to a test message.',
  invalid_key: 'Kai cannot answer: the Anthropic key was refused. It is wrong, revoked or missing.',
  no_credit: 'Kai cannot answer: the Anthropic account is out of credit. Top up the balance to bring Kai back.',
  rate_limited: 'Anthropic is busy or rate-limiting us right now. Some answers may be slow or fail until it clears.',
  unreachable: 'We could not get an answer from Anthropic just now. This is often a brief network problem.',
};

/** Read a status and an error body into one of the five answers. Pure; tested. */
export function classify(httpStatus: number | null, bodyText: string): AnthropicStatus {
  if (httpStatus === null) return 'unreachable';
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  if (httpStatus === 401 || httpStatus === 403) return 'invalid_key';
  if (httpStatus === 429 || httpStatus === 529) return 'rate_limited';
  // The credit error has come back as a 400 invalid_request_error; a 402 is
  // included in case the provider ever uses the status that means it.
  if ((httpStatus === 400 || httpStatus === 402) && /credit balance|billing|purchase credits/i.test(bodyText)) {
    return 'no_credit';
  }
  return 'unreachable';
}

export async function probeAnthropic(opts: {
  key: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<AnthropicHealth> {
  const at = new Date((opts.now ?? Date.now)()).toISOString();
  const done = (status: AnthropicStatus, http: number | null, detail?: string): AnthropicHealth => ({
    status,
    healthy: status !== 'invalid_key' && status !== 'no_credit',
    message: detail ? `${MESSAGES[status]} (${detail})` : MESSAGES[status],
    http_status: http,
    checked_at: at,
    cached: false,
  });
  if (!opts.key) return done('invalid_key', null, 'no key is set');
  let http: number | null = null;
  let body = '';
  try {
    const res = await (opts.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': opts.key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: PROBE_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    http = res.status;
    if (!res.ok) body = await res.text().catch(() => '');
  } catch (e) {
    log('warn', 'health', 'anthropic.probe_threw', { message: e instanceof Error ? e.message : String(e) });
    return done('unreachable', null);
  }
  const status = classify(http, body);
  if (status !== 'ok') {
    log(status === 'rate_limited' || status === 'unreachable' ? 'warn' : 'error', 'health', 'anthropic.probe_failed', {
      status,
      http_status: http,
      // The provider's own error sentence, never our key.
      provider_message: providerMessage(body),
    });
  }
  return done(status, http, status === 'unreachable' && http !== null ? `HTTP ${http}` : undefined);
}

function providerMessage(body: string): string | null {
  try {
    const m = (JSON.parse(body) as { error?: { message?: unknown } })?.error?.message;
    return typeof m === 'string' ? m.slice(0, 200) : null;
  } catch {
    return body ? body.slice(0, 200) : null;
  }
}

/* ------------------------------------------------------------------ */
/* The cached answer the health route reads                            */
/* ------------------------------------------------------------------ */

let last: AnthropicHealth | null = null;
let lastAt = 0;
let pending: Promise<AnthropicHealth> | null = null;

export async function anthropicHealth(opts?: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  key?: string;
}): Promise<AnthropicHealth> {
  const now = (opts?.now ?? Date.now)();
  if (last) {
    const ttl = last.status === 'ok' ? OK_TTL_MS : FAIL_TTL_MS;
    if (now - lastAt < ttl) return { ...last, cached: true };
  }
  // Two monitors hitting a cold cache at once make one probe, not two.
  if (!pending) {
    pending = probeAnthropic({
      key: opts && 'key' in opts ? opts.key : env('ANTHROPIC_API_KEY'),
      fetchImpl: opts?.fetchImpl,
      now: opts?.now,
    })
      .then((h) => {
        last = h;
        lastAt = now;
        return h;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** For tests: forget the cached answer. */
export function resetAnthropicHealthCache(): void {
  last = null;
  lastAt = 0;
  pending = null;
}
