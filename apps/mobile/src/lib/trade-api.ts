/**
 * Paper-execution API client (lane MOBILE-B): trade landing, plans, orders,
 * positions.
 *
 * `src/lib/api.ts` belongs to lane MOBILE-A and does not export its request
 * helper, so this file carries its own — same Authorization header, same
 * 401-refresh-and-retry, same plain-English envelope errors. It reuses A's
 * loose adapters (`adaptQuoteLoose`, `adaptSetupCard`) rather than copying them.
 *
 * API-3 is landing `/plans`, `/orders`, `/positions/:id`, `/positions/:id/close`
 * and the restructured `/trade/landing` in parallel. Two rules follow:
 *
 *   1. Every adapter reads the NEW shape when it is there and derives the same
 *      view model from the round-2 shape when it is not — so Trade shows real
 *      balances, watchlists and movers today.
 *   2. On a live account a missing endpoint is an honest error
 *      ('That part of the service is not live yet'), never a fixture. Sample
 *      orders and sample positions rendered against a real account would be
 *      fabricated records. Fixtures appear only when EXPO_PUBLIC_FIXTURES=1 or
 *      nothing is configured.
 *
 * PAPER ONLY: no broker, no SnapTrade, nothing that says "submit to broker".
 */
import { env, offlineMode } from './env';
import { supabase } from './supabase';
import { getAccessToken, recoverSession, SESSION_EXPIRED_COPY } from './auth-token';
import { adaptQuoteLoose, adaptSetupCard } from './adapters';
import type { GoalMode, Instrument, Mover, Quote } from './types';
import type {
  ExitStyle, OrderDuration, OrderPreview, OrderRow, OrderSide, OrderStatus, OrderTicket,
  OrderType, Plan, PlanActionName, RiskCheck, RiskFinding, RiskVerdict,
} from '../features/orders/types';
import { SIDE_LABEL } from '../features/orders/types';
import type { PositionDetail, PositionRow, PositionsPayload } from '../features/positions/types';
import type { NeedsActionItem, TradeAccount, TradeLandingV2 } from '../features/trade/types';
import {
  clockLabel, fixtureAcceptedOrder, fixtureFilledOrder, fixtureOpenOrders, fixturePlan,
  fixturePreviewAdvisory, fixturePreviewBlocker, fixturePreviewPass,
} from '../features/orders/fixtures';
import {
  fixtureClosedPositions, fixturePositionDetail, fixturePositions,
} from '../features/positions/fixtures';
import { fixtureLanding } from '../features/trade/fixtures';

export class TradeApiError extends Error {
  code: string;
  constructor(code: string, messagePlain: string) {
    super(messagePlain);
    this.code = code;
  }
}

/** True when this endpoint simply has not shipped on this stack yet. */
export const notLiveYet = (e: unknown) =>
  e instanceof TradeApiError && (e.code === 'NOT_FOUND' || e.code === 'NO_API');

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const t = await getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  if (!env.hasApi) throw new TradeApiError('NO_API', 'The service is not connected yet.');
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new TradeApiError('NETWORK', "I couldn't reach the service just now. Check your connection and try again.");
  }
  if (res.status === 401 && !retried && supabase) {
    const fresh = await recoverSession();
    if (fresh) return request<T>(path, init, true);
    throw new TradeApiError('UNAUTHENTICATED', SESSION_EXPIRED_COPY);
  }
  const text = await res.text();
  type Envelope = { error?: { code?: string; message_plain?: string } };
  let json: Envelope | null = null;
  try {
    json = text ? (JSON.parse(text) as Envelope) : null;
  } catch {
    if (!res.ok) throw new TradeApiError(res.status === 404 ? 'NOT_FOUND' : 'INTERNAL', 'That part of the service is not live yet.');
    throw new TradeApiError('BAD_RESPONSE', 'The service sent something I could not read.');
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new TradeApiError(
      err.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'),
      err.message_plain ?? 'Something went wrong. Please try again.',
    );
  }
  return json as T;
}

const live = () => !offlineMode && env.hasApi;

/** Fixtures only: how many times an order has been read (accepted → filled). */
const fixtureOrderReads = new Map<string, number>();

/* ------------------------------------------------------------------ */
/* Loose readers — API-3 shapes are still moving                        */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
/** first non-null of several candidate keys */
const pick = (r: Rec, ...keys: string[]): unknown => {
  for (const k of keys) if (r[k] != null) return r[k];
  return null;
};

const SIDES: OrderSide[] = ['buy_to_open', 'sell_to_close', 'sell_short', 'buy_to_cover'];
function readSide(v: unknown, fallback: OrderSide = 'buy_to_open'): OrderSide {
  const s = str(v).toLowerCase();
  if ((SIDES as string[]).includes(s)) return s as OrderSide;
  if (s === 'buy') return 'buy_to_open';
  if (s === 'sell') return 'sell_to_close';
  if (s === 'short') return 'sell_short';
  if (s === 'cover') return 'buy_to_cover';
  return fallback;
}

const readType = (v: unknown): OrderType => {
  const s = str(v).toLowerCase();
  return s === 'limit' || s === 'stop' ? s : 'market';
};
const readDuration = (v: unknown): OrderDuration => (str(v).toLowerCase() === 'gtc' ? 'gtc' : 'day');

const STATUSES: OrderStatus[] = [
  'draft', 'previewed', 'submitted', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected',
];
const readStatus = (v: unknown): OrderStatus => {
  const s = str(v).toLowerCase();
  return (STATUSES as string[]).includes(s) ? (s as OrderStatus) : 'submitted';
};

/**
 * Status copy. `accepted` and `filled` must never share a sentence — the whole
 * point of the round-3 rule is that a user can see the difference at a glance.
 */
const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Not sent',
  previewed: 'Not sent',
  submitted: 'Sent',
  accepted: 'Accepted — waiting to fill',
  partially_filled: 'Partly filled',
  filled: 'Filled',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Adapters — API-3 shapes (packages/shared/api.ts) with round-2 fallbacks */
/* ------------------------------------------------------------------ */

function adaptQuote(v: unknown): Quote | null {
  if (!v) return null;
  try {
    return adaptQuoteLoose(v as never) ?? null;
  } catch {
    const q = obj(v);
    const p = num(pick(q, 'price', 'last', 'mark'));
    return p == null ? null : { price: p, freshness: 'unknown' };
  }
}

function adaptInstrument(v: unknown): Instrument {
  const r = obj(v);
  const q = adaptQuote(r.quote ?? r);
  return {
    symbol: str(pick(r, 'symbol', 'ticker')).toUpperCase(),
    name: str(r.name),
    last: num(pick(r, 'last', 'price')) ?? q?.price ?? null,
    change_pct: num(pick(r, 'change_pct', 'changePct')) ?? q?.change_pct ?? null,
    quote: q,
  };
}

/** shared `RiskCheck` rows: `{ key, label, status, plain, code, dismissible }`. */
const finding = (x: unknown): RiskFinding => {
  if (typeof x === 'string') return { code: 'NOTE', message: x };
  const f = obj(x);
  return {
    code: str(pick(f, 'code', 'key'), 'NOTE'),
    message: str(pick(f, 'plain', 'message_plain', 'message', 'text')),
  };
};

/**
 * Kai's verdict on an order.
 *
 * The server sends `advisories[]` and `blockers[]` alongside `checks[]`, plus
 * `can_submit`. The verdict is DERIVED from those rather than trusted from a
 * single field: a server that said "ok" while handing us an advisory would put
 * a green tick on a real caution, which is exactly what round 3 set out to fix.
 */
function adaptRisk(src: Rec): RiskCheck {
  const checks = arr(pick(src, 'checks'));
  const declaredAdv = arr(pick(src, 'advisories', 'warnings'));
  const declaredBlk = arr(pick(src, 'blockers', 'errors'));

  const byStatus = (want: string) =>
    checks.filter((c) => str(obj(c).status).toLowerCase() === want);

  const advisories = (declaredAdv.length ? declaredAdv : byStatus('advisory'))
    .map(finding).filter((f) => f.message);
  const blockers = (declaredBlk.length ? declaredBlk : byStatus('blocker'))
    .map(finding).filter((f) => f.message);

  const canSubmit = pick(src, 'can_submit');
  let verdict: RiskVerdict = 'pass';
  if (blockers.length || canSubmit === false) verdict = 'blocker';
  else if (advisories.length) verdict = 'advisory';

  const riskBlock = obj(pick(src, 'risk'));
  const headline =
    str(pick(riskBlock, 'plain'))
    || str(pick(src, 'headline', 'summary', 'plain'))
    || blockers[0]?.message
    || advisories[0]?.message
    || 'This order fits the rules you set.';

  return { verdict, headline, advisories, blockers };
}

function adaptPreview(v: unknown, ticket?: OrderTicket): OrderPreview {
  const r = obj(v);
  const p = obj(pick(r, 'preview', 'order_preview'));
  const src: Rec = Object.keys(p).length ? { ...r, ...p } : r;
  const est = obj(pick(src, 'estimate'));
  const riskBlock = obj(pick(src, 'risk'));
  const bracket = obj(pick(src, 'bracket'));
  const account = obj(pick(src, 'account', 'account_strip'));

  const quote = adaptQuote(pick(src, 'quote', 'mark_quote'));
  const side = readSide(pick(src, 'side', 'position_effect'), ticket?.side ?? 'buy_to_open');
  const qty = num(pick(src, 'qty', 'quantity', 'shares')) ?? ticket?.qty ?? null;
  const total = num(pick(est, 'total', 'notional')) ?? num(pick(src, 'est_cost', 'estimated_cost', 'notional'));
  const stop = num(pick(riskBlock, 'stop')) ?? num(pick(bracket, 'stop')) ?? num(pick(src, 'stop_attached'));
  const target = num(pick(riskBlock, 'target'))
    ?? num(obj(arr(pick(bracket, 'targets'))[0]).price)
    ?? num(pick(src, 'first_target'));
  const maxLoss = num(pick(riskBlock, 'max_loss_usd')) ?? num(pick(src, 'max_loss', 'max_planned_loss'));
  const confirm = str(pick(src, 'confirm_label'));

  return {
    preview_id: str(pick(src, 'preview_id', 'id')),
    symbol: str(pick(src, 'symbol'), ticket?.symbol ?? '').toUpperCase(),
    name: str(pick(src, 'name', 'company')) || null,
    exchange: str(pick(src, 'exchange')) || null,
    side,
    side_label: str(pick(src, 'side_label')) || SIDE_LABEL[side],
    qty,
    fractional: bool(pick(src, 'fractional'), (qty ?? 0) % 1 !== 0),
    order_type: readType(pick(src, 'type', 'order_type')),
    limit_price: num(pick(src, 'limit_price', 'limit')),
    stop_price: num(pick(src, 'stop_price')),
    duration: readDuration(pick(src, 'duration', 'time_in_force')),
    est_cost: total,
    est_fees: num(pick(est, 'fees')) ?? num(pick(src, 'est_fees')) ?? 0,
    buying_power: num(pick(est, 'buying_power')) ?? num(pick(src, 'buying_power')) ?? num(account.buying_power),
    buying_power_after: num(pick(est, 'buying_power_after')) ?? num(pick(src, 'buying_power_after')),
    quote,
    quote_clock: str(pick(src, 'quote_clock'))
      || clockLabel(quote?.source_ts ? new Date(quote.source_ts) : new Date()),
    risk: adaptRisk(src),
    stop_attached: stop,
    first_target: target,
    max_loss: maxLoss,
    max_loss_pct: num(pick(src, 'max_loss_pct'))
      ?? (maxLoss != null && total ? (maxLoss / total) * 100 : null),
    expires_at: str(pick(src, 'expires_at'))
      || (num(pick(src, 'expires_in_s')) != null
        ? new Date(Date.now() + (num(pick(src, 'expires_in_s')) ?? 0) * 1000).toISOString()
        : null),
    account_label: str(pick(src, 'account_label')) || 'Practice · Individual',
    account_kind: str(pick(src, 'account_kind'), str(account.kind, 'paper')) === 'broker' ? 'broker' : 'paper',
    connected: bool(pick(src, 'connected'), true),
    /** Never let a server label say "broker" on a paper order. */
    confirm_label: confirm && !/broker/i.test(confirm) ? confirm : null,
    disclosures: [
      ...arr(pick(src, 'disclosures')).map((d) => str(d)),
      str(pick(src, 'paper_plain')),
    ].filter(Boolean),
    hard_stop_plain: str(pick(riskBlock, 'hard_stop_plain')) || null,
    footer_plain: str(pick(src, 'footer_plain')) || null,
  };
}

function adaptOrder(v: unknown): OrderRow {
  const r = obj(v);
  const o = obj(pick(r, 'order'));
  const src: Rec = Object.keys(o).length ? { ...r, ...o } : r;
  const status = readStatus(pick(src, 'status', 'state'));
  const side = readSide(pick(src, 'side', 'position_effect'));
  const qty = num(pick(src, 'qty', 'quantity'));
  const filled = num(pick(src, 'filled_qty', 'filled_quantity')) ?? (status === 'filled' ? qty : 0);
  const avg = num(pick(src, 'avg_fill_price', 'filled_avg_price', 'fill_price'));
  const limit = num(pick(src, 'limit_price', 'limit'));
  const detail = str(pick(src, 'plain', 'status_detail', 'message_plain')) || (
    status === 'accepted'
      ? limit != null
        ? `Your limit is $${limit.toFixed(2)}. It fills when the price comes to it.`
        : 'Sent and accepted. It has not filled yet.'
      : status === 'filled' && avg != null
        ? `Filled at $${avg.toFixed(2)} on a delayed price.`
        : ''
  );
  return {
    id: str(pick(src, 'id', 'order_id')),
    symbol: str(pick(src, 'symbol')).toUpperCase(),
    side,
    side_label: str(pick(src, 'side_label')) || SIDE_LABEL[side],
    qty,
    filled_qty: filled,
    order_type: readType(pick(src, 'type', 'order_type')),
    limit_price: limit,
    stop_price: num(pick(src, 'stop_price')),
    duration: readDuration(pick(src, 'duration', 'time_in_force')),
    status,
    status_label: str(pick(src, 'status_plain', 'status_label')) || STATUS_LABEL[status],
    status_detail: detail || null,
    avg_fill_price: avg,
    submitted_at: str(pick(src, 'accepted_at', 'submitted_at', 'created_at')) || null,
    filled_at: str(pick(src, 'filled_at')) || null,
    position_id: str(pick(src, 'position_id')) || null,
    paper: str(pick(src, 'driver', 'account_kind'), 'paper') !== 'broker',
  };
}

/** Sentence for the P/L line: "in 2h" / "held 3 days". */
function heldLabel(from: string | null, to: string | null): string | null {
  if (!from) return null;
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mins = Math.max(0, Math.round((b - a) / 60_000));
  if (mins < 60) return to ? `held ${mins}m` : `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return to ? `held ${hrs}h` : `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `held ${days} day${days === 1 ? '' : 's'}`;
}

const FRESHNESS = ['live', 'delayed', 'stale', 'closed', 'unknown'] as const;

function adaptPosition(v: unknown): PositionRow {
  const r = obj(v);
  const side = str(pick(r, 'direction', 'side'), 'long') === 'short' ? 'short' : 'long';
  const qty = num(pick(r, 'qty', 'quantity'));
  const entry = num(pick(r, 'avg_cost', 'avg_entry', 'avg_price', 'entry_price'));
  const markTs = str(pick(r, 'mark_ts')) || null;
  const markFresh = str(pick(r, 'mark_freshness'));
  const mark = num(pick(r, 'mark_price', 'mark'));

  // OpenPositionRow carries the mark as three loose fields rather than a Quote;
  // Price/FreshnessMark need a Quote, so one is composed here.
  const quote: Quote | null = adaptQuote(pick(r, 'quote'))
    ?? (mark != null
      ? {
        symbol: str(pick(r, 'symbol')).toUpperCase(),
        price: mark,
        source_ts: markTs,
        freshness: (FRESHNESS as readonly string[]).includes(markFresh)
          ? (markFresh as Quote['freshness']) : 'unknown',
        delay_reason: markFresh === 'delayed' ? 'entitlement' : null,
      }
      : null);

  const closedAt = str(pick(r, 'closed_at')) || null;
  const status: 'open' | 'closed' = closedAt ? 'closed' : 'open';
  const stop = num(pick(r, 'stop', 'stop_price'));
  const target = num(pick(r, 'target', 'first_target'));
  const realized = num(pick(r, 'realized_pnl'));

  let unreal = num(pick(r, 'unrealized_pnl'));
  if (unreal == null && qty != null && entry != null && mark != null && status === 'open') {
    unreal = (side === 'short' ? entry - mark : mark - entry) * qty;
  }
  let unrealPct = num(pick(r, 'unrealized_pct', 'unrealized_pnl_pct'));
  if (unrealPct == null && unreal != null && qty != null && entry) unrealPct = (unreal / (qty * entry)) * 100;

  const declaredHealth = str(pick(r, 'health')).toLowerCase();
  let health: PositionRow['health'] =
    status === 'closed' ? 'closed'
      : declaredHealth === 'at_risk' || declaredHealth === 'risk' ? 'at_risk'
        : 'healthy';
  let detail = str(pick(r, 'pnl_detail')) || heldLabel(str(pick(r, 'opened_at')) || null, closedAt);
  if (status === 'open' && stop != null && mark != null && stop !== 0) {
    const away = Math.abs((mark - stop) / stop) * 100;
    if (!declaredHealth || declaredHealth === 'unknown') health = away <= 2 ? 'at_risk' : 'healthy';
    if (away <= 5) detail = `${away.toFixed(away < 1 ? 1 : 0)}% from stop`;
  }

  const kaiLine = str(pick(r, 'health_plain', 'kai_line', 'plain', 'plain_english')) || null;
  return {
    id: str(pick(r, 'id', 'position_id')),
    symbol: str(pick(r, 'symbol')).toUpperCase(),
    name: str(pick(r, 'name')) || null,
    side,
    qty,
    avg_entry: entry,
    notional: num(pick(r, 'notional', 'cost_basis')) ?? (qty != null && entry != null ? qty * entry : null),
    mark_price: mark,
    mark_ts: markTs ?? quote?.source_ts ?? null,
    quote,
    unrealized_pnl: unreal,
    unrealized_pnl_pct: unrealPct,
    realized_pnl: realized,
    day_pnl: num(pick(r, 'day_pnl')),
    pnl_detail: detail,
    stop,
    target,
    health,
    health_label: health === 'closed' ? 'Closed' : health === 'at_risk' ? 'At risk' : 'Healthy',
    kai_line: kaiLine,
    nothing_to_do: bool(pick(r, 'nothing_to_do'), health === 'healthy' && status === 'open'),
    status,
    opened_at: str(pick(r, 'opened_at')) || null,
    closed_at: closedAt,
    origin_plan_id: str(pick(r, 'origin_plan_id', 'plan_id')) || null,
    origin_setup_id: str(pick(r, 'origin_setup_id', 'setup_id')) || null,
    exit_style: str(pick(r, 'exit_style')) === 'alert_assisted' ? 'alert_assisted'
      : str(pick(r, 'exit_style')) === 'auto' ? 'auto' : null,
    debrief_id: str(pick(r, 'debrief_id')) || null,
    has_debrief: bool(pick(r, 'has_debrief'), !!str(pick(r, 'debrief_id'))),
    simulated: bool(pick(r, 'simulated')),
    paper: str(pick(r, 'account_kind'), 'paper') !== 'broker',
  };
}

/** `Scenario[]` → the two dollar figures the plan tiles show. */
function scenarioPair(v: unknown): { up: number | null; down: number | null } {
  const rows = arr(v).map(obj);
  if (!rows.length) return { up: null, down: null };
  const up = rows.find((s) => str(s.semantic) === 'positive');
  const down = rows.find((s) => str(s.semantic) === 'risk');
  return { up: num(pick(up ?? {}, 'outcome_usd')), down: num(pick(down ?? {}, 'outcome_usd')) };
}

function adaptPlan(v: unknown, fallbackSymbol = ''): Plan {
  const r = obj(v);
  const p = obj(pick(r, 'plan'));
  const src: Rec = Object.keys(p).length ? { ...r, ...p } : r;
  const targets = arr(pick(src, 'targets'))
    .map((t) => num(typeof t === 'object' && t !== null ? obj(t).price : t))
    .filter((n): n is number => n != null);
  const size = obj(pick(src, 'size', 'size_suggestion'));
  const cap = obj(pick(src, 'daily_risk', 'daily_cap'));
  const intent = str(pick(src, 'intent'));
  const side: 'long' | 'short' =
    intent === 'sell_short' || intent === 'buy_to_cover' ? 'short'
      : str(pick(src, 'side', 'direction')) === 'short' ? 'short' : 'long';
  const entry = num(pick(src, 'entry', 'entry_price'));
  const stop = num(pick(src, 'stop', 'stop_price'));
  // A zero size is not a size. The server returns 0 shares when the position
  // would break the user's own position limit, and rendering that as "$0" reads
  // like a bug — it is surfaced as "no size yet" plus the server's reason.
  const zeroToNull = (n: number | null) => (n != null && n > 0 ? n : null);
  const shares = zeroToNull(num(pick(size, 'shares', 'qty')) ?? num(pick(src, 'size_shares', 'qty')));
  const notional = zeroToNull(num(pick(size, 'notional', 'usd')) ?? num(pick(src, 'size_notional')))
    ?? (shares != null && entry != null ? shares * entry : null);

  const pair = scenarioPair(pick(src, 'scenarios'));
  const ifTarget = pair.up
    ?? num(pick(src, 'if_target'))
    ?? (shares != null && entry != null && targets[0] != null
      ? (side === 'short' ? entry - targets[0] : targets[0] - entry) * shares : null);
  const ifStopped = pair.down
    ?? num(pick(src, 'if_stopped'))
    ?? (num(pick(size, 'max_loss_usd')) != null ? -Math.abs(num(pick(size, 'max_loss_usd')) as number) : null)
    ?? (shares != null && entry != null && stop != null
      ? -Math.abs((side === 'short' ? stop - entry : entry - stop) * shares) : null);

  const status = str(pick(src, 'status'), 'draft');
  const orderState = pick(src, 'order_state');
  return {
    id: str(pick(src, 'id', 'plan_id')) || null,
    symbol: str(pick(src, 'symbol'), fallbackSymbol).toUpperCase(),
    name: str(pick(src, 'name')) || null,
    side,
    entry,
    stop,
    targets,
    size_shares: shares,
    size_notional: notional,
    size_plain: str(pick(size, 'plain')) || null,
    rr: num(pick(src, 'rr', 'r_multiple'))
      ?? (ifTarget != null && ifStopped ? Math.abs(ifTarget / ifStopped) : null),
    if_target: ifTarget,
    if_stopped: ifStopped,
    daily_cap: {
      cap: num(pick(cap, 'cap', 'daily_loss_cap', 'limit')),
      used: num(pick(cap, 'used', 'daily_risk_used')),
    },
    exit_style: str(pick(src, 'exit_style')) === 'alert_assisted' ? 'alert_assisted' : 'auto',
    status: (['draft', 'active', 'cancelled', 'filled'] as string[]).includes(status)
      ? (status as Plan['status'])
      : status === 'planned' ? 'draft' : 'active',
    quote: adaptQuote(pick(src, 'quote')),
    setup_id: str(pick(src, 'setup_id', 'origin_setup_id')) || null,
    order_state: typeof orderState === 'string'
      ? orderState
      : str(pick(obj(orderState), 'plain')) || str(pick(src, 'stop_attaches_plain')) || null,
  };
}

function adaptAccount(v: unknown): TradeAccount | null {
  const r = obj(v);
  if (!Object.keys(r).length) return null;
  return {
    value: num(pick(r, 'value', 'equity', 'total_value')),
    day_change: num(pick(r, 'day_change', 'change', 'day_pnl')),
    day_change_pct: num(pick(r, 'day_change_pct', 'change_pct')),
    buying_power: num(pick(r, 'buying_power')),
    kind: str(pick(r, 'kind'), 'paper') === 'broker' ? 'broker' : 'paper',
    label: str(pick(r, 'label'), 'PAPER').toUpperCase(),
    plain: str(pick(r, 'plain')) || null,
  };
}

function adaptNeedsAction(v: unknown): NeedsActionItem {
  const r = obj(v);
  const kindRaw = str(pick(r, 'kind'));
  const kind: NeedsActionItem['kind'] =
    kindRaw.includes('order') ? 'order'
      : kindRaw.includes('position') ? 'position'
        : kindRaw.includes('plan') ? 'plan'
          : kindRaw.includes('setup') ? 'setup' : 'alert';
  return {
    id: str(pick(r, 'id')),
    kind,
    symbol: str(pick(r, 'symbol')) || null,
    title: str(pick(r, 'headline', 'title', 'plain')),
    detail: str(pick(r, 'plain', 'detail', 'sub')) || null,
    action_label: str(pick(r, 'action_label', 'label'), 'Review'),
    route: str(pick(r, 'route')),
    tone: kind === 'position' || kind === 'alert' ? 'gold' : 'volt',
  };
}

function adaptLanding(v: unknown): TradeLandingV2 {
  const r = obj(v);
  const markets = obj(r.markets);
  const watchlists = arr(r.watchlists);
  const firstList = obj(watchlists[0]);
  const positionsRaw = arr(pick(r, 'positions') ?? obj(r.positions_snapshot).open);
  const ordersRaw = arr(pick(r, 'open_orders', 'pending_orders'));
  const needsRaw = arr(pick(r, 'needs_action') ?? r.continue);
  const discovery = obj(r.discovery);

  return {
    account: adaptAccount(pick(r, 'account', 'account_strip')),
    positions: positionsRaw.map(adaptPosition).filter((p) => p.symbol),
    open_orders: ordersRaw.map(adaptOrder).filter((o) => o.symbol),
    needs_action: needsRaw.map(adaptNeedsAction).filter((n) => n.title && n.route),
    watchlist: (arr(firstList.items).length ? arr(firstList.items) : arr(r.watchlist))
      .map(adaptInstrument).filter((i) => i.symbol),
    recent: arr(pick(r, 'recent', 'recent_symbols')).map(adaptInstrument).filter((i) => i.symbol),
    discovery: {
      movers: (arr(pick(discovery, 'movers') ?? markets.movers ?? r.movers) as unknown[])
        .map((m): Mover => adaptInstrument(m)).filter((m) => m.symbol),
      catalysts: arr(pick(discovery, 'catalysts') ?? r.catalysts).map((c) => {
        const o2 = obj(c);
        return { label: str(pick(o2, 'label', 'title')), when: str(pick(o2, 'when', 'at')) };
      }).filter((c) => c.label),
    },
    kai_opportunities: arr(r.kai_opportunities).map((raw) => adaptSetupCard(raw as never)),
    notices: arr(r.notices).map((n) => str(n)).filter(Boolean),
    market_quote: adaptQuote(obj(r.market).quote),
  };
}

/* ------------------------------------------------------------------ */
/* Client                                                               */
/* ------------------------------------------------------------------ */

const idempotencyKey = () =>
  `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** `OrderTicket` → `OrderPreviewRequest` (shared/api.ts). */
function previewBody(t: OrderTicket): Record<string, unknown> {
  return {
    symbol: t.symbol,
    side: t.side,
    type: t.order_type,
    duration: t.duration,
    // qty wins: the ticket has already turned dollars into whole shares, and
    // sending both would let the server re-derive a different number.
    ...(t.qty != null ? { qty: t.qty } : t.amount != null ? { notional: t.amount } : null),
    ...(t.limit_price != null ? { limit_price: t.limit_price } : null),
    ...(t.stop_price != null ? { stop_price: t.stop_price } : null),
    ...(t.plan_id ? { plan_id: t.plan_id } : null),
    ...(t.setup_id ? { setup_id: t.setup_id } : null),
  };
}

export const tradeApi = {
  /** False in fixtures mode or before the env is wired. */
  available: live,

  landing: async (mode: GoalMode): Promise<TradeLandingV2> => {
    if (!live()) return fixtureLanding();
    return adaptLanding(await request<unknown>(`/trade/landing?mode=${mode}`));
  },

  /* -------- positions -------- */

  positions: async (status: 'open' | 'closed' | 'all' = 'open'): Promise<PositionsPayload> => {
    if (!live()) return status === 'closed' ? fixtureClosedPositions() : fixturePositions();
    const r = obj(await request<unknown>(`/positions?status=${status}`));
    // `PositionsV5Response` keeps the round-2 closed rows on `positions` and puts
    // the marked open ones on `open`.
    const openRows = arr(pick(r, 'open')).map(adaptPosition).filter((p) => p.symbol);
    const closedRows = arr(pick(r, 'positions')).map(adaptPosition).filter((p) => p.symbol);
    const rows = status === 'closed'
      ? closedRows
      : status === 'open'
        ? (openRows.length ? openRows : closedRows.filter((p) => p.status === 'open'))
        : [...openRows, ...closedRows.filter((c) => !openRows.some((o) => o.id === c.id))];

    const risk = obj(pick(r, 'daily_risk'));
    const totals = obj(pick(r, 'totals'));
    const dayPnl = rows.reduce((s, p) => s + (p.day_pnl ?? 0), 0);
    const today = rows.some((p) => p.day_pnl != null)
      ? dayPnl
      : num(pick(totals, 'unrealized_pnl')) != null || num(pick(totals, 'realized_today')) != null
        ? (num(pick(totals, 'unrealized_pnl')) ?? 0) + (num(pick(totals, 'realized_today')) ?? 0)
        : rows.length
          ? rows.reduce((s, p) => s + (p.unrealized_pnl ?? p.realized_pnl ?? 0), 0)
          : null;

    return {
      positions: rows,
      today_pnl: today,
      open_count: num(pick(totals, 'open_count')) ?? rows.filter((p) => p.status === 'open').length,
      daily_risk: {
        cap: num(pick(risk, 'cap', 'daily_loss_cap')),
        used: num(pick(risk, 'used', 'daily_risk_used')),
      },
      empty_copy: str(r.empty_copy)
        || (status === 'closed'
          ? 'Nothing closed yet.'
          : 'No open positions. When a paper order fills, it shows up here.'),
    };
  },

  position: async (id: string): Promise<PositionDetail> => {
    if (!live()) return fixturePositionDetail(id);
    const raw = obj(await request<unknown>(`/positions/${encodeURIComponent(id)}`));
    const posRaw = obj(pick(raw, 'position') ?? raw);
    // `closed`, `closed_at` and `realized_pnl` sit beside the position, not in it.
    const base = adaptPosition({
      ...posRaw,
      closed_at: pick(raw, 'closed_at') ?? posRaw.closed_at ?? null,
      realized_pnl: pick(raw, 'realized_pnl') ?? posRaw.realized_pnl ?? null,
      debrief_id: pick(raw, 'debrief_id') ?? posRaw.debrief_id ?? null,
      quote: pick(raw, 'quote') ?? posRaw.quote ?? null,
    });
    const plan = obj(pick(raw, 'plan'));
    const planTargets = arr(pick(plan, 'targets'));
    return {
      ...base,
      plan_entry: num(pick(plan, 'entry')) ?? base.avg_entry,
      plan_stop: num(pick(plan, 'stop')) ?? base.stop,
      plan_target: num(obj(planTargets[0]).price ?? planTargets[0]) ?? base.target,
      plan_id: str(pick(plan, 'id')) || base.origin_plan_id,
      plan_vs_now: arr(pick(raw, 'plan_vs_now')).map((row) => {
        const e = obj(row);
        return {
          label: str(pick(e, 'label')),
          planned: str(pick(e, 'planned')),
          now: str(pick(e, 'now')),
          semantic: str(pick(e, 'semantic'), 'neutral') as PositionDetail['plan_vs_now'][number]['semantic'],
        };
      }).filter((row) => row.label),
      history: arr(pick(raw, 'history', 'events')).map((h) => {
        const e = obj(h);
        return {
          label: str(pick(e, 'plain', 'label')) || str(pick(e, 'kind', 'type')),
          detail: str(pick(e, 'detail')) || null,
          at: str(pick(e, 'at', 'created_at')) || null,
        };
      }).filter((h) => h.label),
    };
  },

  /**
   * "Exit now" is two steps by design: `POST /positions/:id/close` with
   * `confirm:false` returns a normal order preview, and nothing is sent until
   * the user confirms it on the review screen like any other order.
   */
  closePreview: async (p: PositionRow): Promise<OrderPreview> => {
    const side: OrderSide = p.side === 'short' ? 'buy_to_cover' : 'sell_to_close';
    if (!live()) {
      const f = fixturePreviewPass();
      return {
        ...f,
        preview_id: `prev-close-${p.id}`,
        symbol: p.symbol,
        name: p.name,
        side,
        side_label: SIDE_LABEL[side],
        qty: p.qty,
        order_type: 'market',
        limit_price: null,
        est_cost: p.notional,
        stop_attached: null,
        first_target: null,
        max_loss: null,
        max_loss_pct: null,
        risk: {
          verdict: 'pass',
          headline: `Closing ${p.symbol} realises ${(p.unrealized_pnl ?? 0) >= 0 ? 'a gain' : 'a loss'} of $${Math.abs(p.unrealized_pnl ?? 0).toFixed(2)}.`,
          advisories: [], blockers: [],
        },
      };
    }
    const raw = obj(await request<unknown>(`/positions/${encodeURIComponent(p.id)}/close`, {
      method: 'POST',
      body: JSON.stringify({ confirm: false }),
    }));
    const ticket: OrderTicket = {
      symbol: p.symbol, side, qty: p.qty, amount: null,
      order_type: 'market', limit_price: null, stop_price: null,
      duration: 'day', plan_id: p.origin_plan_id, setup_id: p.origin_setup_id,
    };
    return adaptPreview(pick(raw, 'preview') ?? raw, ticket);
  },

  /* -------- orders -------- */

  preview: async (t: OrderTicket): Promise<OrderPreview> => {
    if (!live()) {
      // Fixtures cover all three verdicts so the proof can shoot each one.
      const which = t.setup_id ?? '';
      const f = which.includes('blocker') ? fixturePreviewBlocker()
        : which.includes('pass') ? fixturePreviewPass()
          : fixturePreviewAdvisory();
      return {
        ...f,
        symbol: t.symbol || f.symbol,
        side: t.side,
        side_label: SIDE_LABEL[t.side],
        qty: t.qty ?? (t.amount != null && f.quote?.price ? t.amount / f.quote.price : f.qty),
        fractional: t.amount != null,
        order_type: t.order_type,
        limit_price: t.limit_price,
        stop_price: t.stop_price,
        duration: t.duration,
        est_cost: t.amount ?? (t.qty != null && (t.limit_price ?? f.quote?.price)
          ? t.qty * (t.limit_price ?? f.quote?.price ?? 0) : f.est_cost),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        quote_clock: clockLabel(),
      };
    }
    return adaptPreview(await request<unknown>('/orders/preview', {
      method: 'POST', body: JSON.stringify(previewBody(t)),
    }), t);
  },

  submit: async (previewId: string, key?: string): Promise<OrderRow> => {
    if (!live()) return fixtureAcceptedOrder();
    return adaptOrder(await request<unknown>('/orders/submit', {
      method: 'POST',
      body: JSON.stringify({ preview_id: previewId, idempotency_key: key ?? idempotencyKey() }),
    }));
  },

  order: async (id: string): Promise<OrderRow> => {
    if (!live()) {
      // Fixtures walk the same two states a real resting limit walks: the first
      // read is the accepted order, the next one is the fill. Nothing here is a
      // shortcut — it is the accepted-is-not-filled rule, rehearsed.
      const reads = (fixtureOrderReads.get(id) ?? 0) + 1;
      fixtureOrderReads.set(id, reads);
      if (reads <= 2) return { ...fixtureAcceptedOrder(), id };
      return { ...fixtureFilledOrder(), id };
    }
    return adaptOrder(await request<unknown>(`/orders/${encodeURIComponent(id)}`));
  },

  orders: async (status?: string): Promise<OrderRow[]> => {
    if (!live()) return fixtureOpenOrders();
    const r = obj(await request<unknown>(`/orders${status ? `?status=${status}` : ''}`));
    return arr(pick(r, 'orders') ?? r).map(adaptOrder).filter((o) => o.symbol);
  },

  cancelOrder: async (id: string): Promise<OrderRow> => {
    if (!live()) return { ...fixtureAcceptedOrder(), status: 'cancelled', status_label: 'Cancelled', status_detail: null };
    return adaptOrder(await request<unknown>(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }));
  },

  /* -------- plans -------- */

  createPlan: async (body: Record<string, unknown>): Promise<Plan> => {
    if (!live()) return { ...fixturePlan(str(body.symbol, 'META')), status: 'draft' };
    return adaptPlan(await request<unknown>('/plans', { method: 'POST', body: JSON.stringify(body) }), str(body.symbol));
  },

  plan: async (id: string): Promise<Plan> => {
    if (!live()) return fixturePlan();
    return adaptPlan(await request<unknown>(`/plans/${encodeURIComponent(id)}`));
  },

  planAction: async (id: string, action: PlanActionName, payload?: Record<string, unknown>): Promise<Plan> => {
    if (!live()) {
      const p = fixturePlan();
      if (action === 'adjust_stop' && payload?.stop != null) p.stop = num(payload.stop);
      if (action === 'adjust_target' && payload?.targets != null) p.targets = arr(payload.targets).map((t) => num(t) ?? 0);
      if (action === 'set_exit_style') p.exit_style = (payload?.exit_style as ExitStyle) ?? 'auto';
      if (action === 'activate') p.status = 'active';
      if (action === 'cancel') p.status = 'cancelled';
      return p;
    }
    return adaptPlan(await request<unknown>(`/plans/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, ...(payload ?? {}) }),
    }));
  },

  /**
   * The numbers a NEW plan starts from: the workspace's `plan.suggested` block
   * (entry, stop, targets, a size computed against the user's risk policy, and
   * the two scenarios). Nothing is invented locally — when the server has no
   * levels, the fields come back null and the plan screen asks for them.
   */
  suggestedPlan: async (symbol: string, mode: GoalMode, setupId?: string | null): Promise<Plan> => {
    if (!live()) return { ...fixturePlan(symbol), id: null, status: 'draft', setup_id: setupId ?? null };
    const raw = obj(await request<unknown>(`/symbols/${encodeURIComponent(symbol)}?mode=${mode}`));
    const planBlock = obj(pick(raw, 'plan'));
    const suggested = obj(pick(planBlock, 'suggested'));
    const existing = obj(pick(planBlock, 'existing_plan'));
    const levels = obj(pick(raw, 'levels') ?? obj(pick(raw, 'overview')).key_levels);
    const setup = obj(pick(raw, 'setup') ?? obj(pick(raw, 'overview')).setup_module);

    const merged: Rec = {
      symbol,
      name: pick(raw, 'name') ?? obj(pick(raw, 'identity')).name,
      intent: pick(existing, 'intent') ?? pick(setup, 'intent'),
      side: str(pick(setup, 'direction'), 'long'),
      entry: pick(suggested, 'entry') ?? pick(levels, 'entry'),
      stop: pick(suggested, 'stop') ?? pick(levels, 'invalid') ?? pick(levels, 'stop'),
      targets: arr(pick(suggested, 'targets')).length
        ? pick(suggested, 'targets')
        : [pick(levels, 'target')].filter((t) => t != null),
      size: pick(suggested, 'size'),
      scenarios: pick(suggested, 'scenarios'),
      rr: pick(suggested, 'rr'),
      daily_risk: pick(planBlock, 'daily_risk') ?? pick(raw, 'daily_risk'),
      exit_style: pick(existing, 'exit_style'),
      quote: pick(raw, 'quote'),
      setup_id: setupId ?? str(pick(setup, 'id')) ?? null,
      order_state: pick(planBlock, 'order_state'),
      stop_attaches_plain: pick(suggested, 'stop_attaches_plain'),
      id: pick(existing, 'id'),
      status: 'draft',
    };
    return adaptPlan(merged, symbol);
  },
};

export { adaptOrder, adaptPosition, adaptPreview, adaptPlan };

/* ==================================================================== */
/* Round 4 — the chart-first Trade Portal (spec 10 §6/§7)                */
/*                                                                       */
/* `GET /trade/portal/:symbol?alert=&setup=&ctx=` is API-4's endpoint and */
/* is still landing while this ships. Everything below reads the new      */
/* payload when it is there, degrades to the pieces that already exist    */
/* (`/symbols/:symbol`, `/positions`, `/orders`) when it is not, and only */
/* ever shows fixtures in fixtures mode.                                  */
/* ==================================================================== */

import type {
  Annotation, AnnotationKind, AnnotationProvenance, AnnotationStatus, PortalAlert,
  PortalCommunity, PortalContext, PortalPlan, PortalTimeframe, ScoreComponent, TradePortal,
  ExecutionState,
} from '../features/portal/types';
import { PORTAL_TIMEFRAMES } from '../features/portal/types';
import { fixturePortal } from '../features/portal/fixtures';
import { fixtureCandles, fixtureCandlesDaily } from './fixtures';
import type { Candle } from './types';

const ANNOTATION_KINDS: AnnotationKind[] = [
  'trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance', 'note',
];
const readKind = (v: unknown): AnnotationKind => {
  const s = str(v).toLowerCase();
  return (ANNOTATION_KINDS as string[]).includes(s) ? (s as AnnotationKind) : 'note';
};
const readProvenance = (v: unknown): AnnotationProvenance => {
  const s = str(v).toLowerCase();
  return s === 'user' || s === 'community' || s === 'plan' ? (s as AnnotationProvenance) : 'kai';
};
const readAnnStatus = (v: unknown): AnnotationStatus => {
  const s = str(v).toLowerCase();
  return s === 'invalidated' || s === 'hidden' || s === 'deleted' ? (s as AnnotationStatus) : 'valid';
};
const readTf = (v: unknown, d: PortalTimeframe = '15m'): PortalTimeframe => {
  const s = str(v);
  const norm = s === '1d' || s === '1D' || s === 'd' ? 'D' : s;
  return (PORTAL_TIMEFRAMES as string[]).includes(norm) ? (norm as PortalTimeframe) : d;
};

export function adaptAnnotation(v: unknown, fallbackSymbol = ''): Annotation {
  const r = obj(v);
  const range = arr(pick(r, 'range', 'prices'));
  return {
    id: str(pick(r, 'id')) || `ann-${Math.random().toString(36).slice(2, 9)}`,
    symbol: str(pick(r, 'symbol'), fallbackSymbol).toUpperCase(),
    timeframe: pick(r, 'timeframe') ? readTf(pick(r, 'timeframe')) : null,
    kind: readKind(pick(r, 'kind', 'semantic', 'type')),
    price: num(pick(r, 'price')) ?? num(range[0]),
    price2: num(pick(r, 'price2', 'price_high')) ?? num(range[1]),
    ts_from: str(pick(r, 'ts_from', 'ts')) || null,
    ts_to: str(pick(r, 'ts_to')) || null,
    text: str(pick(r, 'text', 'label')) || null,
    reason: str(pick(r, 'reason', 'reason_plain', 'rationale_plain')) || null,
    provenance: readProvenance(pick(r, 'provenance', 'source')),
    status: readAnnStatus(pick(r, 'status', 'lifecycle')),
    source_alert_id: str(pick(r, 'source_alert_id', 'alert_id')) || null,
    source_setup_id: str(pick(r, 'source_setup_id', 'setup_id')) || null,
    source_plan_id: str(pick(r, 'source_plan_id', 'plan_id')) || null,
    created_at: str(pick(r, 'created_at')) || null,
    updated_at: str(pick(r, 'updated_at')) || null,
  };
}

function adaptScoreComponents(v: unknown): ScoreComponent[] {
  return arr(v).map((raw) => {
    const c = obj(raw);
    // Spec §4: internal points never cross the wire as a fraction. If a legacy
    // payload still sends points/max we convert to segments and drop the numbers.
    const points = num(pick(c, 'signal_strength', 'strength'));
    const legacy = num(pick(c, 'points'));
    const legacyMax = num(pick(c, 'max_points', 'max'));
    const strength = points != null
      ? Math.max(0, Math.min(5, Math.round(points)))
      : legacy != null && legacyMax
        ? Math.max(0, Math.min(5, Math.round((legacy / legacyMax) * 5)))
        : 0;
    return {
      key: str(pick(c, 'key')) || str(pick(c, 'label')).toLowerCase(),
      label: str(pick(c, 'label')),
      status: str(pick(c, 'qualitative_status', 'status')) || 'Neutral',
      strength,
      explanation: str(pick(c, 'explanation', 'plain')) || null,
    };
  }).filter((c) => c.label);
}

function adaptPortalAlert(v: unknown, symbol: string): PortalAlert | null {
  const r = obj(v);
  const id = str(pick(r, 'id', 'alert_id'));
  if (!id) return null;
  const identity = obj(pick(r, 'identity'));
  const grade = obj(pick(r, 'grade'));
  const plan = obj(pick(r, 'trade_plan', 'plan'));
  const targets = arr(pick(plan, 'targets'));
  const evt = obj(pick(r, 'event'));
  const detail = obj(pick(r, 'detail'));
  const action = obj(pick(r, 'primary_action', 'action'));
  const community = obj(pick(r, 'community'));
  const fit = obj(pick(r, 'fit'));
  const rr = num(pick(plan, 'rr'));

  return {
    id,
    symbol: str(pick(identity, 'symbol') ?? pick(r, 'symbol'), symbol).toUpperCase(),
    company: str(pick(identity, 'company_name', 'name') ?? pick(r, 'name')) || null,
    mode: str(pick(identity, 'mode_label', 'mode') ?? pick(r, 'mode')) || null,
    // `direction_plain` is a sentence ("Long — you make money if it goes up");
    // the identity strip wants the word, not the lesson.
    direction: str(pick(identity, 'direction') ?? pick(plan, 'direction') ?? pick(r, 'direction')) || null,
    instrument: str(pick(identity, 'instrument') ?? pick(r, 'instrument')) || null,
    // The medallion is an object on the wire; the letter and the 0-100 score
    // are two separate fields and the score never competes with the letter.
    grade_display: str(pick(grade, 'display') ?? pick(r, 'grade_display')) || null,
    score: num(pick(grade, 'score')) ?? num(pick(r, 'score')),
    state: str(pick(r, 'state'), 'watching'),
    state_label: str(pick(r, 'state_label')) || str(pick(r, 'state'), 'Watching'),
    headline: str(pick(evt, 'headline') ?? pick(r, 'headline', 'title')),
    what_changed: str(pick(evt, 'what_changed') ?? pick(r, 'what_changed')) || null,
    triggered_at: str(pick(evt, 'at_plain') ?? pick(evt, 'triggered_at', 'at') ?? pick(r, 'triggered_at', 'created_at')) || null,
    company_summary: str(pick(r, 'company_summary')) || null,
    condition: str(pick(plan, 'entry_condition_plain') ?? pick(r, 'condition', 'condition_plain')) || null,
    condition_met: bool(pick(r, 'condition_met'), !['watching', 'forming'].includes(str(pick(r, 'state')))),
    entry: num(pick(plan, 'entry')) ?? num(pick(r, 'entry')),
    entry_high: num(pick(plan, 'entry_high', 'entry_zone_high')),
    stop: num(pick(plan, 'stop')) ?? num(pick(r, 'stop')),
    target: num(obj(targets[0]).price ?? targets[0]) ?? num(pick(r, 'target')),
    rr: str(pick(plan, 'rr_plain')) || (rr != null ? `${rr.toFixed(1)} : 1` : null),
    hold: str(pick(plan, 'expected_hold', 'hold')) || null,
    expires_plain: str(pick(plan, 'expires_plain', 'expiration_plain') ?? pick(r, 'expires_plain')) || null,
    score_components: adaptScoreComponents(pick(r, 'score_components')),
    kai_interpretation: [str(pick(r, 'kai_interpretation', 'interpretation_plain')), str(pick(r, 'kai_disclosure'))]
      .filter(Boolean).join(' ') || null,
    fit_plain: str(pick(fit, 'plain') ?? pick(r, 'fit_plain')) || null,
    community_plain: str(pick(community, 'plain') ?? pick(r, 'community_plain')) || null,
    events: arr(pick(detail, 'event_history') ?? pick(r, 'events', 'event_history')).map((e) => {
      const x = obj(e);
      const to = str(pick(x, 'to_state'));
      const at = str(pick(x, 'at', 'clock', 'created_at'));
      return {
        label: str(pick(x, 'plain', 'label')),
        at: at ? (at.length > 16 ? at.slice(11, 16) : at) : null,
        tone: (to === 'invalidated' || to === 'closed'
          ? 'warn'
          : to && to !== 'watching' ? 'good' : 'neutral') as 'neutral' | 'good' | 'warn',
      };
    }).filter((e) => e.label),
    primary_action: str(pick(action, 'label'))
      ? { label: str(pick(action, 'label')), route: str(pick(action, 'route', 'href')) || null }
      : null,
  };
}

function adaptPortalPlan(v: unknown, symbol: string): PortalPlan | null {
  const r = obj(v);
  if (!Object.keys(r).length) return null;
  const suggested = obj(pick(r, 'suggested') ?? r);
  const existing = obj(pick(r, 'existing_plan'));
  const cap = obj(pick(r, 'daily_risk', 'daily_cap'));
  const actions = arr(pick(r, 'actions'));
  const action = obj(pick(r, 'action', 'primary_action') ?? actions.find((a) => bool(obj(a).primary)) ?? actions[0]);
  const targets = arr(pick(suggested, 'targets'))
    .map((t) => num(obj(t).price ?? t))
    .filter((n): n is number => n != null);
  const entry = num(pick(suggested, 'entry'));
  const id = str(pick(existing, 'id') ?? pick(r, 'id', 'plan_id')) || null;
  const size = obj(pick(suggested, 'size'));
  const rr = num(pick(suggested, 'rr'));

  if (entry == null && !targets.length && !id) {
    return {
      id: null, entry: null, stop: null, targets: [], rr: null, size_plain: null,
      risk_dollars: null, daily_cap: null, stop_attaches_plain: null,
      action: { label: 'Build a plan', route: `/plan/new?symbol=${encodeURIComponent(symbol)}` },
      empty_plain: str(pick(r, 'plain')) || `Kai has no entry, stop or target for ${symbol} at the moment.`,
    };
  }
  return {
    id,
    entry,
    stop: num(pick(suggested, 'stop')),
    targets,
    rr: str(pick(suggested, 'rr_plain')) || (rr != null ? `${rr.toFixed(1)} : 1` : null),
    size_plain: str(pick(size, 'plain')) || str(pick(suggested, 'size_plain')) || null,
    risk_dollars: num(pick(size, 'risk_usd', 'est_risk_usd')) ?? num(pick(suggested, 'risk_dollars', 'max_loss')),
    daily_cap: Object.keys(cap).length ? { used: num(pick(cap, 'used')), cap: num(pick(cap, 'cap')) } : null,
    stop_attaches_plain: str(pick(suggested, 'stop_attaches_plain')) || null,
    action: str(pick(action, 'label'))
      ? { label: str(pick(action, 'label')), route: str(pick(action, 'route')) || `/plan/new?symbol=${encodeURIComponent(symbol)}` }
      : id
        ? { label: 'Review order', route: `/order/new?symbol=${encodeURIComponent(symbol)}&side=buy_to_open&plan=${encodeURIComponent(id)}` }
        : { label: 'Build a plan', route: `/plan/new?symbol=${encodeURIComponent(symbol)}` },
    empty_plain: null,
  };
}

function adaptPortalCommunity(v: unknown): PortalCommunity | null {
  const r = obj(v);
  if (!Object.keys(r).length) return null;
  const circle = obj(pick(r, 'circle'));
  const sentiment = obj(pick(r, 'sentiment'));
  const split = obj(pick(sentiment, 'split'));
  return {
    room_id: str(pick(r, 'room_id')) || null,
    circle_id: str(pick(circle, 'id') ?? pick(r, 'circle_id', 'setup_room_id')) || null,
    circle_name: str(pick(circle, 'name')) || null,
    summary: str(pick(r, 'plain', 'summary', 'thread_summary')) || null,
    message_count: num(pick(sentiment, 'sample')) ?? num(pick(r, 'message_count', 'messages_today')),
    bullish_pct: num(pick(split, 'bullish')) ?? num(pick(r, 'bullish_pct', 'sentiment_pct')),
    common_level: num(pick(r, 'most_mentioned_level', 'common_level')),
    label_plain: str(pick(r, 'label_plain')) || null,
    claims: arr(pick(r, 'verified_claims')).map((c) => {
      const x = obj(c);
      return { claim: str(pick(x, 'claim')), verdict: str(pick(x, 'verdict')), plain: str(pick(x, 'plain')) };
    }).filter((c) => c.claim || c.plain),
    messages: arr(pick(r, 'messages', 'recent')).map((m) => {
      const x = obj(m);
      const author = obj(pick(x, 'author'));
      const name = str(pick(author, 'display_name', 'name') ?? pick(x, 'author_name'), 'Member');
      return {
        id: str(pick(x, 'id')) || `${name}-${str(pick(x, 'created_at'))}`,
        author: name,
        initial: (name.trim()[0] ?? '?').toUpperCase(),
        role: str(pick(x, 'role_plain') ?? arr(pick(author, 'role_labels'))[0]) || null,
        at: str(pick(x, 'clock', 'created_at')) || null,
        body: str(pick(x, 'body', 'text')),
        is_kai: bool(pick(author, 'is_kai') ?? pick(x, 'is_kai')),
        verified_plain: str(pick(x, 'verified_plain')) || null,
      };
    }).filter((m) => m.body),
  };
}

const EXEC_STATES: ExecutionState[] = [
  'watching', 'forming', 'ready', 'entry_reached', 'planned',
  'order_pending', 'position_active', 'invalidated', 'closed', 'none',
];
const EXEC_LABEL: Record<ExecutionState, string> = {
  watching: 'Watching', forming: 'Forming', ready: 'Ready', entry_reached: 'Entry reached',
  planned: 'Planned', order_pending: 'Order pending', position_active: 'Position open',
  invalidated: 'Invalidated', closed: 'Closed', none: '',
};
/** Spec §5 "Primary actions by state" — the one table the CTA is driven by. */
const EXEC_ACTION: Record<ExecutionState, string | null> = {
  watching: 'Open chart', forming: 'Keep watching', ready: 'Review trade',
  entry_reached: 'Review trade', planned: 'Prepare order', order_pending: 'Manage order',
  position_active: 'Manage trade', invalidated: 'See what changed', closed: 'Review outcome',
  none: null,
};

/** Portal timeframes this stack answered 400 for; asked once, then avoided. */
const unsupportedTf = new Set<PortalTimeframe>();

async function fetchCandles(symbol: string, tf: string, from: string, to: string): Promise<Candle[]> {
  const r = obj(await request<unknown>(`/market/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}&from=${from}&to=${to}`));
  return arr(pick(r, 'candles')).map((c) => {
    const x = obj(c);
    return {
      t: str(pick(x, 't', 'ts')),
      o: num(pick(x, 'o', 'open')) ?? 0,
      h: num(pick(x, 'h', 'high')) ?? 0,
      l: num(pick(x, 'l', 'low')) ?? 0,
      c: num(pick(x, 'c', 'close')) ?? 0,
      v: num(pick(x, 'v', 'volume')),
    };
  }).filter((c) => c.t && c.c);
}

export const portalApi = {
  available: live,

  /**
   * The portal payload. Falls back to the round-3 `/symbols/:symbol` workspace
   * when API-4's endpoint is not deployed, so the chart, levels and plan are
   * real long before the new route exists.
   */
  portal: async (
    symbol: string,
    opts: { alert?: string | null; setup?: string | null; ctx?: PortalContext | null; mode?: GoalMode } = {},
  ): Promise<TradePortal> => {
    const sym = symbol.toUpperCase();
    if (!live()) return { ...fixturePortal(sym, opts.ctx), symbol: sym };

    const qs = new URLSearchParams();
    if (opts.alert) qs.set('alert', opts.alert);
    if (opts.setup) qs.set('setup', opts.setup);
    if (opts.ctx) qs.set('ctx', opts.ctx);
    if (opts.mode) qs.set('mode', opts.mode);

    let raw: Rec;
    let degraded = false;
    try {
      raw = obj(await request<unknown>(`/trade/portal/${encodeURIComponent(sym)}${qs.toString() ? `?${qs}` : ''}`));
    } catch (e) {
      if (!notLiveYet(e)) throw e;
      degraded = true;
      raw = obj(await request<unknown>(`/symbols/${encodeURIComponent(sym)}?mode=${opts.mode ?? 'day_trade'}`));
    }

    const identity = obj(pick(raw, 'identity'));
    const chart = obj(pick(raw, 'chart_config', 'chart'));
    const contexts = obj(pick(raw, 'contexts'));
    const kai = obj(pick(contexts, 'kai') ?? pick(raw, 'kai'));
    const exec = obj(pick(raw, 'execution'));
    const drawers = obj(pick(raw, 'drawers'));
    const state = ((): ExecutionState => {
      const v = str(pick(exec, 'state'));
      return (EXEC_STATES as string[]).includes(v) ? (v as ExecutionState) : 'none';
    })();
    const execAction = obj(pick(exec, 'primary_action', 'action'));
    const quote = adaptQuoteLoose(pick(raw, 'quote'));

    const alertBlock = pick(contexts, 'alert') ?? pick(raw, 'alert');
    const planBlock = pick(contexts, 'plan') ?? pick(raw, 'plan');
    const commBlock = pick(contexts, 'community') ?? pick(raw, 'community');

    const annotations = arr(pick(raw, 'annotations') ?? pick(chart, 'annotations'))
      .map((a) => adaptAnnotation(a, sym))
      .filter((a) => a.status !== 'deleted');

    // The watchlist rows carry a bare `price`; recents carry a whole quote.
    const symList = (v: unknown) => arr(v).map((it) => {
      const row = obj(it);
      const bare = num(pick(row, 'price'));
      return {
        symbol: str(pick(row, 'symbol')).toUpperCase(),
        name: str(pick(row, 'name')) || null,
        quote: adaptQuoteLoose(pick(row, 'quote'))
          ?? (bare != null
            ? { symbol: str(pick(row, 'symbol')).toUpperCase(), price: bare, change: null, change_pct: null, source_ts: null, freshness: quote?.freshness ?? 'unknown', delay_reason: quote?.delay_reason ?? null }
            : null),
      };
    }).filter((it) => it.symbol);

    const fallbackAction = ((): { label: string; route: string } | null => {
      const label = EXEC_ACTION[state];
      if (!label) return null;
      if (state === 'order_pending') return { label, route: '/trade' };
      if (state === 'position_active') return { label, route: '/position' };
      return { label, route: `/plan/new?symbol=${encodeURIComponent(sym)}` };
    })();

    return {
      symbol: sym,
      name: str(pick(identity, 'name') ?? pick(raw, 'name')) || null,
      instrument: str(pick(identity, 'instrument')) || null,
      mode: str(pick(identity, 'mode') ?? pick(raw, 'mode')) || null,
      quote,
      market_state: str(pick(obj(pick(raw, 'market')), 'label_plain', 'state_plain', 'plain') ?? pick(raw, 'market_state')) || null,
      paper: bool(pick(exec, 'paper') ?? pick(raw, 'paper'), true),
      starred: bool(pick(identity, 'watchlisted') ?? pick(raw, 'starred', 'watchlisted')),
      chart: {
        timeframe: readTf(pick(chart, 'timeframe', 'default_timeframe')),
        timeframes: (() => {
          // `timeframes` is [{key,label}] on the round-4 payload and a bare
          // string list on the older one. Both read the same here.
          const list = arr(pick(chart, 'timeframes'))
            .map((t) => (typeof t === 'string' ? t : pick(obj(t), 'key', 'value')))
            .filter((t) => typeof t === 'string' && (PORTAL_TIMEFRAMES as string[]).includes(t === '1d' ? 'D' : (t as string)))
            .map((t) => readTf(t, '15m'));
          return list.length ? Array.from(new Set(list)) : PORTAL_TIMEFRAMES;
        })(),
        focus_ts: str(pick(chart, 'focus_ts', 'trigger_ts')) || null,
      },
      annotations,
      kai: {
        conversation_id: str(pick(kai, 'conversation_id')) || null,
        opening_message: str(pick(kai, 'opening_message', 'opening')) || null,
      },
      alert: adaptPortalAlert(alertBlock, sym),
      plan: adaptPortalPlan(planBlock, sym),
      community: adaptPortalCommunity(commBlock),
      execution: {
        state,
        label: str(pick(exec, 'label', 'state_label')) || EXEC_LABEL[state],
        action: str(pick(execAction, 'label'))
          ? { label: str(pick(execAction, 'label')), route: str(pick(execAction, 'route')) || `/plan/new?symbol=${encodeURIComponent(sym)}` }
          : fallbackAction,
        detail_plain: str(pick(exec, 'detail_plain', 'capability_plain', 'plain')) || null,
        order: pick(exec, 'order') ? adaptOrder(pick(exec, 'order')) : null,
        position: pick(exec, 'position') ? adaptPosition(pick(exec, 'position')) : null,
      },
      drawers: {
        // The portal's account block names its fields `equity`/`cash`; the
        // round-3 adapter already understands both.
        account: adaptAccount(pick(drawers, 'account')),
        positions: arr(pick(drawers, 'positions')).map(adaptPosition).filter((p) => p.symbol),
        open_orders: arr(pick(drawers, 'open_orders', 'orders')).map(adaptOrder).filter((o) => o.symbol),
        watchlist: symList(pick(drawers, 'watchlist')),
        recent: symList(pick(drawers, 'recent')),
      },
      is_fixture: false,
      notice: degraded
        ? 'The portal service is not live on this stack yet — the chart, levels and plan come from the symbol endpoint.'
        : null,
    };
  },

  /**
   * Bars for one portal timeframe. `/market/candles` currently understands
   * `1d` and `5m`; anything finer or coarser is requested as-is first and
   * falls back to the nearest supported resolution, labelled honestly.
   */
  candles: async (symbol: string, tf: PortalTimeframe): Promise<{ candles: Candle[]; exact: boolean }> => {
    if (!live()) return { candles: tf === 'D' || tf === '4h' ? fixtureCandlesDaily : fixtureCandles, exact: true };
    const spanDays: Record<PortalTimeframe, number> = { '1m': 2, '5m': 5, '15m': 10, '1h': 30, '4h': 90, D: 180 };
    const wire: Record<PortalTimeframe, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', D: '1d' };
    const fallback: Record<PortalTimeframe, '5m' | '1d'> = { '1m': '5m', '5m': '5m', '15m': '5m', '1h': '1d', '4h': '1d', D: '1d' };
    const to = new Date().toISOString().slice(0, 10);
    const fromD = new Date();
    fromD.setUTCDate(fromD.getUTCDate() - spanDays[tf]);
    const from = fromD.toISOString().slice(0, 10);

    // A resolution this stack does not serve answers 400. Remember that so the
    // portal stops re-asking on every timeframe switch.
    if (unsupportedTf.has(tf)) {
      try {
        return { candles: await fetchCandles(symbol, fallback[tf], from, to), exact: false };
      } catch {
        return { candles: [], exact: false };
      }
    }

    const fetchTf = (t: string) => fetchCandles(symbol, t, from, to);

    try {
      return { candles: await fetchTf(wire[tf]), exact: true };
    } catch {
      unsupportedTf.add(tf);
      try {
        return { candles: await fetchTf(fallback[tf]), exact: fallback[tf] === wire[tf] };
      } catch {
        return { candles: [], exact: false };
      }
    }
  },

  annotations: async (symbol: string): Promise<Annotation[]> => {
    if (!live()) return [];
    const r = await request<unknown>(`/annotations?symbol=${encodeURIComponent(symbol)}`);
    const list = Array.isArray(r) ? r : arr(pick(obj(r), 'annotations'));
    return list.map((a) => adaptAnnotation(a, symbol)).filter((a) => a.status !== 'deleted');
  },

  createAnnotation: async (body: {
    symbol: string; kind: AnnotationKind; price: number; price2?: number | null;
    timeframe?: PortalTimeframe | null; text?: string | null; reason?: string | null;
  }): Promise<Annotation> => {
    const r = await request<unknown>('/annotations', { method: 'POST', body: JSON.stringify(body) });
    return adaptAnnotation(obj(pick(obj(r), 'annotation')) ?? r, body.symbol);
  },

  /** Hide, delete or retitle one annotation. The user owns every Kai line. */
  patchAnnotation: async (id: string, patch: { status?: AnnotationStatus; text?: string }): Promise<void> => {
    if (!live()) return;
    await request<unknown>(`/annotations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
};
