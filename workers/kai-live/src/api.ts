/**
 * The worker's client for `apps/api`.
 *
 * WHY THE WORKER TALKS HTTP TO THE API INSTEAD OF DOING THE WORK ITSELF.
 * Three things this show needs already exist, correct, in `apps/api/src/lib`:
 * the Polygon cache-and-refill (`market/polygon.ts`), the deterministic
 * technicals (`market/technicals.ts`), and the setup derivations that turn a
 * `setups` row into levels, evidence and plain English (`setups.ts`). A second
 * implementation of any of them in this process is a second set of numbers that
 * can disagree with the app — and "the show said 227.92 and the app says
 * 227.90" is a credibility problem, not a rounding problem.
 *
 * So the worker owns the SHOW and the API owns the NUMBERS. The three endpoints
 * under `/api/v1/live/internal/**` are authenticated with `INTERNAL_SECRET` —
 * no user, no bearer token, 404 when the secret is unset — exactly like the
 * paper tick.
 */
import { config } from './config.ts';
import { log } from './log.ts';

export type RundownLevels = {
  entry: number | null;
  stop: number | null;
  targets: { price: number; label?: string | null }[];
  perShare: number | null;
  rr: number | null;
};

/** One thing the show could talk about, with everything needed to talk about it. */
export type Candidate = {
  source: 'setup' | 'request' | 'winner' | 'watchlist';
  symbol: string;
  headline: string;
  /** Ranking within its source tier. Higher first. */
  rank: number;
  setup_id: string | null;
  alert_id: string | null;
  request_id: string | null;
  intent: string | null;
  long: boolean;
  state: string | null;
  grade_band: string | null;
  grade_display: string | null;
  thesis_plain: string | null;
  narration: string | null;
  why_plain: string | null;
  levels: RundownLevels;
  evidence: { label: string; ok: boolean; detail_plain: string | null }[];
  scenarios: { name: string; plain: string; outcome_usd: number | null; semantic: string }[];
  support: { price: number; plain: string }[];
  resistance: { price: number; plain: string }[];
  /** Only on `winner`: what actually happened, so the show can grade it. */
  outcome: { gain_pct: number | null; plain: string } | null;
  quote: { price: number | null; freshness: string } | null;
  valid_until: string | null;
};

export type MarketTf = {
  timeframe: string;
  candles: { ts: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }[];
  technicals: {
    trend: { label: string; status: string; strength: number; plain: string };
    momentum: { label: string; status: string; strength: number; plain: string };
    volatility: { label: string; status: string; strength: number; plain: string };
    support: { price: number; plain: string }[];
    resistance: { price: number; plain: string }[];
    computed_from: { bars: number; freshness: string; plain: string };
  } | null;
  first_ts: string | null;
  last_ts: string | null;
  degraded: boolean;
};

export type MarketBundle = {
  symbol: string;
  company: { name: string | null; summary: string | null; sector: string | null; market_cap_plain: string | null };
  quote: { price: number | null; change_pct: number | null; freshness: string };
  timeframes: MarketTf[];
  prior_session: { from: string; to: string } | null;
  /** Reported quarters, newest first. Empty when the plan or calendar says nothing. */
  fundamentals: FinancialQuarter[];
  /** Recent headlines, newest first, each with Polygon's own read on it. */
  news: NewsHeadline[];
  degraded: boolean;
  degraded_reason: string | null;
};

export type FinancialQuarter = {
  fiscal_period: string;
  fiscal_year: string;
  end_date: string;
  filing_date: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_basic: number | null;
  eps_diluted: number | null;
};

export type NewsHeadline = {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  published_utc: string;
  description: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  sentiment_reasoning: string | null;
};

export type NewAnnotation = {
  symbol: string;
  timeframe: string;
  kind: string;
  price?: number | null;
  price2?: number | null;
  ts_from?: string | null;
  ts_to?: string | null;
  text?: string | null;
  reason?: string | null;
  source_setup_id?: string | null;
  source_alert_id?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function internal<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = config.internalSecret();
  if (!secret) throw new ApiError('INTERNAL_SECRET is not set — the worker cannot reach the API.', 0);
  const url = `${config.apiBase()}/api/v1/live/internal${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'x-internal-secret': secret,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    log('warn', 'api.error', { path, status: res.status, body: text.slice(0, 300) });
    throw new ApiError(`${path} answered ${res.status}`, res.status);
  }
  return JSON.parse(text) as T;
}

/** Everything the show could talk about, already ranked, already derived. */
export async function fetchRundown(opts: { mode: string; limit?: number; exclude?: string[] }): Promise<{
  candidates: Candidate[];
  degraded: boolean;
  degraded_reason: string | null;
}> {
  const q = new URLSearchParams({ mode: opts.mode, limit: String(opts.limit ?? 12) });
  if (opts.exclude?.length) q.set('exclude', opts.exclude.join(','));
  return internal(`/rundown?${q.toString()}`);
}

/** Candles + technicals + company, per timeframe, top-down. */
export async function fetchMarket(symbol: string, tfs: string[]): Promise<MarketBundle> {
  const q = new URLSearchParams({ symbol, tfs: tfs.join(',') });
  return internal(`/market?${q.toString()}`);
}

/**
 * Persist Kai's marks and get the rows back.
 *
 * The rows are what the resolver puts on a `ChartFrame`, which is why the show
 * cannot draw a level that was never stored: an annotation the API refused to
 * create simply does not come back, and a marker with no row is dropped.
 */
export async function createAnnotations(
  annotations: NewAnnotation[]
): Promise<{ annotations: Record<string, unknown>[]; degraded: boolean; degraded_reason: string | null }> {
  return internal('/annotations', { method: 'POST', body: JSON.stringify({ annotations }) });
}

/** Mark a subscriber request as presented (or skipped) once it has aired. */
export async function settleRequest(id: string, status: 'presented' | 'skipped', segmentId?: string): Promise<void> {
  await internal('/requests/settle', {
    method: 'POST',
    body: JSON.stringify({ id, status, segment_id: segmentId ?? null }),
  });
}

/** Is the API reachable and configured for us at all? Checked before a run. */
export async function apiReachable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await internal<{ ok: boolean; polygon: boolean; anthropic: boolean; annotations: boolean }>('/ping');
    return {
      ok: r.ok,
      detail: `polygon=${r.polygon} anthropic=${r.anthropic} annotations=${r.annotations}`,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
