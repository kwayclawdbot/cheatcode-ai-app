/**
 * Contract → view-model adapters.
 *
 * `packages/shared/api.ts` is the API lane's canonical contract. The client
 * imports it TYPE-ONLY (zod stays server-side; the import is erased at build,
 * so Metro never has to resolve outside apps/mobile).
 *
 * Everything the screens render goes through here, so a contract change is a
 * one-file change on this lane.
 */
import type {
  AlertRow as ApiAlertRow,
  AlertsResponse,
  BriefingPayload,
  GradedSetupPayload,
  HomeResponse,
  KaiObjectEnvelope,
  MarketBlock,
  SetupCard,
  SetupState as ApiSetupState,
  WatchingItem as ApiWatchingItem,
} from '@cheatcode/shared';
import type {
  AlertRow, AlertsPayload, Briefing, BriefingLine, Freshness, GradedSetup,
  HomePayload, MarketStatus, Quote, SetupState, WatchingItem,
} from './types';

const money = (n: number | null | undefined) =>
  n == null ? null : `$${Math.round(n).toLocaleString('en-US')}`;

const num = (n: number | null | undefined) =>
  n == null ? null : String(Number.isInteger(n) ? n : Number(n.toFixed(2)));

export const freshnessOf = (f: string | null | undefined): Freshness =>
  f === 'live' || f === 'delayed' || f === 'stale' ? f : 'unknown';

/** The API's six-state setup enum → the five the object card draws. */
const STATE_MAP: Record<ApiSetupState, SetupState> = {
  discovered: 'watching',
  watching: 'watching',
  forming: 'forming',
  ready: 'ready',
  invalidated: 'invalidated',
  expired: 'expired',
};
const STATE_LABEL: Record<SetupState, string> = {
  forming: 'Forming', ready: 'Ready', confirmed: 'Confirmed', triggered: 'Triggered',
  invalidated: 'Invalidated', expired: 'Expired', watching: 'Watching',
};

export function adaptQuote(q: GradedSetupPayload['quote'] | null | undefined): Quote | null {
  if (!q) return null;
  return {
    symbol: q.symbol,
    price: q.price,
    source_ts: q.source_ts,
    received_ts: q.received_ts,
    freshness: freshnessOf(q.freshness),
  };
}

export function adaptMarket(m: MarketBlock): MarketStatus {
  const status = m.status === 'after' ? 'post' : m.status;
  return {
    status: status as MarketStatus['status'],
    label: m.label_plain,
    session_ts: m.session_ts,
    freshness: freshnessOf(m.freshness),
  };
}

/** graded_setup payload → the SetupObject view model. */
export function adaptGradedSetup(env: KaiObjectEnvelope | null, fallbackId = 'lead'): GradedSetup | null {
  if (!env) return null;
  const p = env.payload as GradedSetupPayload;
  if (!p || !p.symbol) return null;
  const short = p.intent === 'sell_short' || p.intent === 'buy_to_cover';
  const state = STATE_MAP[p.state] ?? 'watching';
  const target = p.targets?.[0]?.price ?? null;
  return {
    id: p.setup_id ?? env.id ?? fallbackId,
    symbol: p.symbol,
    grade_display: p.grade_display ?? p.grade_band ?? '—',
    state,
    state_label: STATE_LABEL[state],
    direction: short ? 'short' : 'long',
    entry: p.entry != null ? `${short ? '<' : '>'} ${num(p.entry)}` : null,
    target: num(target),
    invalid: p.stop != null ? `${short ? '>' : '<'} ${num(p.stop)}` : null,
    risk_line: p.risk_plain || p.next_action || null,
    next_action: p.next_action ? 'Open setup' : 'Open setup',
    quote: adaptQuote(p.quote),
  };
}

/** GET /setups card → the same view model, so one component draws both. */
export function adaptSetupCard(c: SetupCard): GradedSetup {
  const short = c.intent === 'sell_short' || c.intent === 'buy_to_cover';
  const state = STATE_MAP[c.state] ?? 'watching';
  return {
    id: c.id,
    symbol: c.symbol,
    grade_display: c.grade_display ?? c.grade_band ?? '—',
    state,
    state_label: STATE_LABEL[state],
    direction: short ? 'short' : 'long',
    entry: c.entry != null ? `${short ? '<' : '>'} ${num(c.entry)}` : null,
    target: num(c.targets?.[0]?.price ?? null),
    invalid: c.stop != null ? `${short ? '>' : '<'} ${num(c.stop)}` : null,
    risk_line: c.risk?.plain ?? null,
    next_action: c.next_action?.label ?? 'Open setup',
    quote: adaptQuote(c.quote),
  };
}

const TONE: Record<BriefingPayload['lines'][number]['emphasis'], BriefingLine['tone']> = {
  neutral: 'quiet',
  attention: 'attention',
  risk: 'attention',
  positive: 'market',
};

export function adaptBriefing(env: KaiObjectEnvelope | null): Briefing | null {
  if (!env) return null;
  const p = env.payload as BriefingPayload;
  if (!p?.lines?.length) return null;
  const when = new Date(env.created_at);
  const hhmm = Number.isNaN(when.getTime())
    ? ''
    : ` · ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })}`;
  return {
    id: env.id,
    title: `MORNING REPORT${hhmm}`,
    headline: p.headline,
    lines: p.lines.map((l) => ({ tone: TONE[l.emphasis] ?? 'quiet', text: l.text })),
  };
}

export function adaptWatching(items: ApiWatchingItem[]): WatchingItem[] {
  return items.map((w) => ({
    id: w.setup_id,
    symbol: w.symbol,
    label: `${w.symbol} · ${w.next_action}`,
    value: w.quote?.price != null ? w.quote.price.toFixed(2) : null,
    kind: 'level',
    quote: adaptQuote(w.quote),
  }));
}

export function adaptHome(r: HomeResponse): HomePayload {
  return {
    market: adaptMarket(r.market),
    briefing: adaptBriefing(r.briefing),
    lead_setup: adaptGradedSetup(r.lead_setup),
    watching: adaptWatching(r.watching),
    daily_risk: {
      cap: r.daily_risk.cap ?? 0,
      used: r.daily_risk.used,
      remaining: r.daily_risk.remaining ?? 0,
    },
    degraded: r.degraded,
    degraded_reason: r.degraded_reason,
    invest_notice: r.invest_mode_notice,
  };
}

/** alerts rows carry structured conditions; the list needs a level + a title. */
function conditionLabel(a: ApiAlertRow): string | null {
  const c = a.condition as { atoms?: { operator?: string; value?: unknown }[] } | undefined;
  const atom = c?.atoms?.[0];
  if (!atom || atom.value == null) return null;
  const op = atom.operator;
  const sign = op === 'below' || op === 'crosses_down' ? '<' : op === 'above' || op === 'crosses_up' ? '>' : '';
  return `${sign} ${atom.value}`.trim();
}

function symbolOf(a: ApiAlertRow): string {
  const refs = (a.refs ?? {}) as { symbol?: string };
  if (refs.symbol) return refs.symbol;
  const c = a.condition as { atoms?: { symbol?: string }[] } | undefined;
  return c?.atoms?.[0]?.symbol ?? '';
}

export function adaptAlert(a: ApiAlertRow): AlertRow {
  return {
    id: a.id,
    symbol: symbolOf(a),
    title: a.summary_plain || a.natural_language || 'Alert',
    detail: null,
    status: a.status === 'expired' ? 'resolved' : a.status,
    condition_label: conditionLabel(a),
    value: null,
    meta: a.next_action?.action === 'activate' ? null : null,
    quote: null,
  };
}

export function adaptAlerts(r: AlertsResponse): AlertsPayload & { empty_copy: string } {
  return {
    needs_attention: r.needs_attention.map(adaptAlert),
    watching: r.watching.map(adaptAlert),
    resolved: r.resolved.map(adaptAlert),
    empty_copy: r.empty_copy,
  };
}

export { money };
