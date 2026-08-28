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
  HomePayload, KaiActionPreview, MarketStatus, Quote, SetupState, WatchingItem,
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

/* ==================================================================== */
/* Round 2 adapters.                                                    */
/*                                                                      */
/* `packages/shared/api.ts` is owned by the API-2 lane and did not carry */
/* these shapes when this lane ran, so the round-2 payloads are narrowed */
/* from `unknown` here instead of imported. That is deliberate: a screen  */
/* must render whatever the endpoint actually returns and must never     */
/* throw on a branch the server has not shipped yet. When API-2 publishes */
/* the zod schemas, only this file changes.                              */
/* ==================================================================== */

import type {
  AlertDetail, AlertDraftPreview, AlertLifecycle, AlertMonitoring, AppSettings,
  Candle, Confirmation, ContinueItem, Evidence, Explain, ExplainLevel, GoalMode,
  Instrument, Me, MemoryRow, ModeLens, Mover, NewsItem, NotificationGroup,
  EntitlementFlag, NotificationRow, Profile, Quiz, Scenario, SearchResult, SetupDetail, StepperStep,
  SymbolDetail, TradeLanding,
} from './types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const nStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);

/** The one freshness rule that matters: an entitlement delay is a DELAY. */
export function adaptQuoteLoose(v: unknown): Quote | null {
  const q = obj(v);
  if (!Object.keys(q).length) return null;
  const reason = nStr(q.delay_reason) as Quote['delay_reason'];
  let f = freshnessOf(str(q.freshness, 'unknown'));
  if (reason === 'entitlement') f = 'delayed';
  return {
    symbol: nStr(q.symbol) ?? undefined,
    price: nNum(q.price),
    change: nNum(q.change),
    change_pct: nNum(q.change_pct),
    source_ts: nStr(q.source_ts),
    received_ts: nStr(q.received_ts),
    freshness: f,
    delay_reason: reason,
  };
}

export function adaptCandles(v: unknown): Candle[] {
  return arr(obj(v).candles ?? v)
    .map((raw) => {
      const c = obj(raw);
      const o = nNum(c.o ?? c.open);
      const h = nNum(c.h ?? c.high);
      const l = nNum(c.l ?? c.low);
      const close = nNum(c.c ?? c.close);
      if (o == null || h == null || l == null || close == null) return null;
      const t = c.t ?? c.ts ?? c.time;
      return {
        t: typeof t === 'number' ? new Date(t).toISOString() : str(t),
        o, h, l, c: close, v: nNum(c.v ?? c.volume),
      } as Candle;
    })
    .filter((c): c is Candle => c !== null);
}

/** The API says done|current|pending; the rail draws done|active|todo|failed. */
const STEP_STATE = (s: string): StepperStep['state'] =>
  s === 'done' ? 'done'
    : s === 'active' || s === 'current' ? 'active'
    : s === 'failed' || s === 'missed' ? 'failed'
    : 'todo';

function adaptStepper(v: unknown): StepperStep[] {
  const list = Array.isArray(v) ? v : arr(obj(v).steps);
  return list.map((raw) => {
    const s = obj(raw);
    return { label: str(s.label ?? s.text), state: STEP_STATE(str(s.state ?? s.status)) };
  }).filter((s) => s.label);
}

const EXPLAIN_EMPTY: Explain = { beginner: '', intermediate: '', advanced: '', family: '' };

function adaptExplain(v: unknown): Explain {
  const e = obj(v);
  const out = { ...EXPLAIN_EMPTY };
  (['beginner', 'intermediate', 'advanced', 'family'] as ExplainLevel[]).forEach((k) => {
    out[k] = str(e[k]);
  });
  return out;
}

function adaptConfirmations(v: unknown): Confirmation[] {
  return arr(v).map((raw) => {
    const c = obj(raw);
    return { label: str(c.label ?? c.text), ok: bool(c.ok), detail: nStr(c.detail ?? c.detail_plain) };
  }).filter((c) => c.label);
}

function adaptEvidenceList(v: unknown): Evidence[] {
  return arr(v).map((raw) => {
    const e = obj(raw);
    return { label: str(e.label ?? e.text), ok: bool(e.ok) };
  }).filter((e) => e.label);
}

function adaptScenarios(v: unknown): Scenario[] {
  return arr(v).map((raw): Scenario => {
    const s = obj(raw);
    const tone = str(s.tone ?? s.semantic);
    const usd = nNum(s.amount_usd ?? s.outcome_usd);
    return {
      label: str(s.label ?? s.title ?? s.name),
      // A zero outcome is not a number worth shouting — "nothing happens" is the
      // sentence, not "+$0".
      amount: nStr(s.amount) ?? (usd != null && usd !== 0 ? `${usd >= 0 ? '+' : '−'}$${Math.abs(usd).toFixed(0)}` : null),
      plain: str(s.plain ?? s.detail ?? s.text),
      tone: tone === 'good' || tone === 'positive' ? 'good' : tone === 'bad' || tone === 'risk' ? 'bad' : 'neutral',
    };
  }).filter((s) => s.label);
}

function adaptQuiz(v: unknown): Quiz | null {
  const q = obj(v);
  const options = arr(q.options).map((o) => str(o)).filter(Boolean);
  const question = str(q.q ?? q.question);
  if (!question || options.length < 2) return null;
  return {
    q: question,
    options,
    answer_idx: nNum(q.answer_idx) ?? 0,
    explanation: nStr(q.explanation ?? q.explanation_plain),
  };
}

/** GET /setups/:id → the three-view detail object. */
export function adaptSetupDetail(v: unknown, fallbackId: string): SetupDetail {
  const r = obj(v);
  const root = Object.keys(obj(r.setup)).length ? obj(r.setup) : r;
  const live = obj(r.live ?? root.live);
  const plan = obj(r.plan ?? root.plan);
  const learn = obj(r.learn ?? root.learn);
  const fit = obj(r.fit ?? root.fit);

  const intent = str(root.intent);
  const short = intent === 'sell_short' || intent === 'buy_to_cover' || str(root.direction) === 'short';
  const state = (STATE_MAP[str(live.state ?? root.state) as ApiSetupState] ?? 'watching') as SetupState;

  return {
    id: str(root.id ?? root.setup_id, fallbackId),
    symbol: str(root.symbol),
    name: nStr(root.name),
    grade_display: str(root.grade_display ?? root.grade_band, '—'),
    state,
    state_label: STATE_LABEL[state],
    direction: short ? 'short' : 'long',
    quote: adaptQuoteLoose(live.quote ?? root.quote),
    live: {
      stepper: adaptStepper(live.stepper),
      narration: (() => {
        const n = live.narration_plain ?? live.narration;
        if (typeof n === 'string') return n ? [{ text: n, time: null }] : [];
        return arr(n).map((raw) => {
          const l = obj(raw);
          return { text: str(l.text ?? l.plain), time: nStr(l.time ?? l.at) };
        }).filter((l) => l.text);
      })(),
      confirmations: adaptConfirmations(live.confirmations),
      technical: nStr(live.technical ?? root.thesis_technical),
    },
    plan: {
      entry_condition: nStr(plan.entry_plain ?? plan.entry_condition_plain) ?? nStr(plan.entry_condition),
      entry_zone: nStr(plan.entry_zone),
      entry: nNum(plan.entry ?? root.entry),
      stop: nNum(plan.stop ?? root.stop),
      invalidation: nStr(plan.invalidation_plain ?? plan.invalidation),
      targets: arr(plan.targets ?? root.targets).map((raw) => {
        const t = obj(raw);
        const price = nNum(t.price);
        return price == null ? null : { price, label: nStr(t.label) };
      }).filter((t): t is { price: number; label: string | null } => t !== null),
      size_suggestion: nStr(plan.size_suggestion_plain)
        ?? nStr(plan.size_suggestion)
        ?? nStr(obj(plan.size_suggestion).plain),
      scenarios: adaptScenarios(plan.scenarios),
      risk_reward: nStr(plan.risk_reward_plain)
        ?? nStr(plan.risk_reward)
        ?? (nNum(plan.risk_reward) != null ? `${nNum(plan.risk_reward)!.toFixed(2)} : 1` : null),
    },
    learn: {
      why_plain: str(learn.why_plain ?? root.thesis_plain),
      evidence: adaptEvidenceList(learn.evidence),
      similar_example: (() => {
        const s = learn.similar_example;
        if (typeof s === 'string') return s || null;
        const o = obj(s);
        const t = nStr(o.text ?? o.plain);
        return t;
      })(),
      quiz: adaptQuiz(learn.quiz),
    },
    explain: adaptExplain(r.explain ?? root.explain),
    fit: { ok: bool(fit.ok, true), reasons: arr(fit.reasons).map((x) => str(x)).filter(Boolean) },
    next_action: nStr(r.next_action) ?? nStr(obj(r.next_action).label) ?? nStr(root.next_action),
    discussion_room_id: nStr(root.discussion_room_id ?? r.discussion_room_id),
  };
}

/* ---------------- Alerts ---------------- */

const MONITORING = (v: unknown): AlertMonitoring | null => {
  const s = str(v);
  return s === 'not_armed' || s === 'armed_no_feed' || s === 'armed' || s === 'evaluating' || s === 'off' ? s : null;
};

/** Adds the round-2 fields the lifecycle list needs on top of adaptAlert. */
export function adaptAlertRow(raw: unknown): AlertRow {
  const a = obj(raw);
  const base = adaptAlert(a as unknown as ApiAlertRow);
  return {
    ...base,
    monitoring: MONITORING(a.monitoring),
    monitoring_plain: nStr(a.monitoring_plain),
    quote: adaptQuoteLoose(a.quote),
    value: (() => {
      const q = adaptQuoteLoose(a.quote);
      return q?.price != null ? q.price.toFixed(2) : base.value ?? null;
    })(),
  };
}

export function adaptAlertLifecycle(v: unknown): AlertLifecycle {
  const r = obj(v);
  const g = (k: string) => arr(r[k]).map(adaptAlertRow);
  return {
    needs_attention: g('needs_attention'),
    watching: g('watching'),
    active_trades: g('active_trades'),
    triggered: g('triggered'),
    history: g('history').length ? g('history') : g('resolved'),
    empty_copy: str(r.empty_copy, "Kai isn't watching anything for you yet."),
  };
}

function pairs(v: unknown): { label: string; value: string }[] {
  const o = obj(v);
  const list = arr(v);
  if (list.length) {
    return list.map((raw) => {
      const p = obj(raw);
      return { label: str(p.label ?? p.key), value: str(p.value) };
    }).filter((p) => p.label);
  }
  return Object.entries(o)
    .map(([label, val]) => {
      if (val == null) return null;
      if (Array.isArray(val)) {
        const items = val.filter((x) => x != null && typeof x !== 'object').map((x) => String(x).replace(/_/g, ' '));
        return items.length ? { label: label.replace(/_/g, ' '), value: items.join(', ') } : null;
      }
      if (typeof val === 'object') return null;
      return { label: label.replace(/_/g, ' '), value: String(val) };
    })
    .filter((p): p is { label: string; value: string } => p !== null);
}

/** Event kinds are machine names; the screen shows a sentence. */
const HISTORY_PLAIN: Record<string, string> = {
  created: 'You asked Kai to watch this.',
  alert_drafted: 'Kai drafted the condition.',
  alert_activated: 'Activated by you.',
  alert_paused: 'You paused it.',
  alert_resumed: 'You resumed it.',
  alert_cancelled: 'You cancelled it.',
  alert_triggered: 'The condition was met.',
  alert_edited: 'You changed the condition.',
};
const historyLabel = (h: Obj): string =>
  nStr(h.plain) ?? nStr(h.label) ?? (() => {
    const kind = str(h.event ?? h.kind);
    if (!kind) return '';
    return HISTORY_PLAIN[kind] ?? `${kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}.`;
  })();

export function adaptAlertDetail(v: unknown, fallbackId: string): AlertDetail {
  const r = obj(v);
  const a = Object.keys(obj(r.alert)).length ? obj(r.alert) : r;
  const refs = obj(a.refs);
  const cond = Object.keys(obj(r.structured)).length ? obj(r.structured) : obj(a.condition);
  const atom = obj(arr(cond.atoms)[0]);
  const symbol = str(refs.symbol) || str(atom.symbol);
  const op = str(atom.operator);
  const sign = op === 'below' || op === 'crosses_down' ? '<' : op === 'above' || op === 'crosses_up' ? '>' : '';
  const status = str(a.status, 'draft');
  return {
    id: str(a.id, fallbackId),
    symbol,
    natural_language: str(a.natural_language ?? a.summary_plain),
    // The plain sentence the server wrote for the condition beats the raw
    // sentence the user typed — it is what Kai actually understood.
    summary_plain: str(r.condition_plain ?? a.summary_plain ?? a.natural_language),
    status: (status === 'expired' ? 'resolved' : status) as AlertRow['status'],
    monitoring: MONITORING(r.monitoring ?? a.monitoring),
    monitoring_plain: nStr(r.monitoring_plain ?? a.monitoring_plain),
    condition_label: atom.value != null ? `${sign} ${String(atom.value)}`.trim() : null,
    structured: arr(cond.atoms).length
      ? arr(cond.atoms).map((raw) => {
          const at = obj(raw);
          return {
            label: `${str(at.symbol, 'Condition')} ${str(at.atom).replace(/_/g, ' ')}`.trim(),
            value: `${str(at.operator).replace(/_/g, ' ')} ${at.value ?? ''}`.trim(),
          };
        })
      : pairs(cond),
    data_dependency: pairs(r.data_dependency ?? a.data_dependency),
    history: arr(r.history ?? a.history).map((raw) => {
      const h = obj(raw);
      return { at: str(h.at ?? h.created_at), label: historyLabel(h) };
    }).filter((h) => h.label),
    trace: arr(r.origin ?? r.originating ?? r.trace).map((raw) => {
      const t = obj(raw);
      return { label: str(t.label), route: nStr(t.route) };
    }).filter((t) => t.label),
    quote: adaptQuoteLoose(r.quote ?? a.quote),
    created_at: nStr(a.created_at),
    expires_at: nStr(a.expires_at),
  };
}

export function adaptAlertPreview(v: unknown): AlertDraftPreview {
  const r = obj(v);
  const a = obj(r.alert);
  const preview = obj(obj(r.preview).payload);
  const cond = obj(a.condition ?? preview.condition);
  return {
    alert_id: str(a.id),
    natural_language: str(a.natural_language ?? preview.natural_language),
    summary_plain: str(preview.summary_plain ?? r.condition_plain ?? a.summary_plain ?? preview.plain_english),
    symbol: str(obj(a.refs).symbol ?? obj(arr(cond.atoms)[0]).symbol),
    structured: arr(cond.atoms).length
      ? arr(cond.atoms).map((raw) => {
          const at = obj(raw);
          return {
            label: `${str(at.symbol, 'Condition')} ${str(at.atom).replace(/_/g, ' ')}`.trim(),
            value: `${str(at.operator).replace(/_/g, ' ')} ${at.value ?? ''}`.trim(),
          };
        })
      : pairs(cond),
    degraded: bool(r.degraded),
  };
}

/* ---------------- Trade ---------------- */

function adaptInstrumentLoose(raw: unknown): Instrument {
  const i = obj(raw);
  const q = adaptQuoteLoose(i.quote);
  const changePct = nNum(i.change_pct) ?? q?.change_pct ?? null;
  return {
    symbol: str(i.symbol),
    name: str(i.name),
    last: nNum(i.last) ?? q?.price ?? null,
    change_pct: changePct,
    // The row draws its number from the quote, so the change has to live there
    // too — otherwise a percentage would render without its freshness.
    quote: q ? { ...q, change_pct: q.change_pct ?? changePct } : null,
  };
}

export function adaptTradeLanding(v: unknown): TradeLanding {
  const r = obj(v);
  const strip = obj(r.account_strip);
  const equity = nNum(strip.equity);
  const watchlists = arr(r.watchlists);
  const firstList = obj(watchlists[0]);
  return {
    account_strip: equity == null ? null : {
      equity,
      buying_power: nNum(strip.buying_power),
      change_pct: nNum(strip.change_pct),
      label: str(strip.label, 'PAPER').toUpperCase(),
    },
    // `label` is the CTA and `plain` is the sentence — the row leads with the
    // sentence, not with the verb on its own button.
    continue_items: arr(r.continue ?? r.continue_items).map((raw): ContinueItem => {
      const c = obj(raw);
      return {
        id: str(c.id),
        title: str(c.title ?? c.plain ?? c.label),
        detail: nStr(c.detail) ?? (nStr(c.title) ? nStr(c.plain) : null),
        cta: str(c.cta ?? c.label, 'Continue'),
        route: nStr(c.route),
      };
    }).filter((c) => c.title),
    kai_opportunities: arr(r.kai_opportunities).map((raw) => adaptSetupCard(raw as SetupCard)),
    watchlist: (arr(firstList.items).length ? arr(firstList.items) : arr(r.watchlist)).map(adaptInstrumentLoose).filter((i) => i.symbol),
    movers: arr(obj(r.markets).movers ?? r.movers).map((raw): Mover => adaptInstrumentLoose(raw)).filter((m) => m.symbol),
    catalysts: arr(r.catalysts).map((raw) => {
      const c = obj(raw);
      return { label: str(c.label ?? c.title), when: str(c.when ?? c.at) };
    }).filter((c) => c.label),
  };
}

export function adaptSearch(v: unknown, q: string): SearchResult[] {
  const r = obj(v);
  const out: SearchResult[] = arr(r.instruments ?? r.results).map((raw) => {
    const i = obj(raw);
    return { kind: 'instrument' as const, symbol: str(i.symbol), name: str(i.name), exchange: nStr(i.exchange) };
  }).filter((i) => i.symbol);
  const intent = obj(r.intent);
  if (str(intent.kind) === 'kai_question') out.push({ kind: 'kai_question', text: str(intent.text, q) });
  return out;
}

export function adaptSymbolDetail(v: unknown, symbol: string, mode: GoalMode): SymbolDetail {
  const r = obj(v);
  const header = obj(r.quote_header ?? r.header);
  const interp = obj(r.kai_interpretation);
  const ctx = obj(r.your_context);
  const community = obj(r.community);
  const chart = obj(r.chart);

  /** `lenses` is an array of per-mode reads; the one for the active mode also
   *  carries the setup id, which is how the page finds the object to open. */
  const MODE_LABELS: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };
  const rawLenses = Array.isArray(r.lenses ?? r.mode_lenses)
    ? (r.lenses ?? r.mode_lenses) as unknown[]
    : Object.entries(obj(r.mode_lenses ?? r.lenses)).map(([m, val]) => ({ mode: m, ...obj(val) }));

  /** Two server sentences often restate the same fact; say it once. */
  const joinOnce = (a: string | null, b: string | null): string => {
    if (!a) return b ?? '';
    if (!b) return a;
    const sentences = new Set(a.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean));
    const extra = b.split(/(?<=\.)\s+/).map((x) => x.trim()).filter((x) => x && !sentences.has(x));
    return extra.length ? `${a} ${extra.join(' ')}` : a;
  };

  const lenses: ModeLens[] = rawLenses.map((raw) => {
    const l = obj(raw);
    const m = str(l.mode) as GoalMode;
    const text = joinOnce(
      nStr(l.headline_plain ?? l.plain ?? l.text ?? l.thesis_plain),
      nStr(l.detail_plain),
    );
    return { mode: m, label: MODE_LABELS[m] ?? str(l.label, m), text: text || 'No active setup in this lens.' };
  }).filter((l) => l.mode);

  const activeLens = obj(rawLenses.find((raw) => str(obj(raw).mode) === mode));
  const setupId = nStr(activeLens.setup_id);

  /** Levels come off the chart annotations, which are semantic, never coloured. */
  const levels: SymbolDetail['levels'] = { entry: null, target: null, invalid: null, support: null };
  arr(chart.annotations ?? r.annotations).forEach((raw) => {
    const a = obj(raw);
    const price = nNum(a.price);
    if (price == null) return;
    const sem = str(a.semantic ?? a.kind ?? a.text).toLowerCase();
    if (sem.includes('entry')) levels.entry ??= price;
    else if (sem.includes('target')) levels.target ??= price;
    else if (sem.includes('invalid') || sem.includes('stop')) levels.invalid ??= price;
    else if (sem.includes('support')) levels.support ??= price;
  });
  const explicit = obj(r.levels);
  levels.entry ??= nNum(explicit.entry);
  levels.target ??= nNum(explicit.target);
  levels.invalid ??= nNum(explicit.invalid ?? explicit.invalidation);
  levels.support ??= nNum(explicit.support);

  const setupRaw = r.setup;
  const setup = Object.keys(obj(setupRaw)).length
    ? adaptSetupCard(setupRaw as SetupCard)
    : setupId
      ? ({
          id: setupId,
          symbol: str(r.symbol, symbol),
          grade_display: str(activeLens.grade_display, '—'),
          state: (STATE_MAP[str(activeLens.state) as ApiSetupState] ?? 'watching') as SetupState,
          state_label: STATE_LABEL[(STATE_MAP[str(activeLens.state) as ApiSetupState] ?? 'watching') as SetupState],
          direction: 'long',
          entry: levels.entry != null ? `> ${levels.entry}` : null,
          target: levels.target != null ? String(levels.target) : null,
          invalid: levels.invalid != null ? `< ${levels.invalid}` : null,
          risk_line: nStr(activeLens.detail_plain),
          next_action: 'Open setup',
          quote: adaptQuoteLoose(r.quote ?? header.quote),
        } as GradedSetup)
      : null;

  const interpText = nStr(interp.conclusion_plain ?? interp.text ?? interp.plain);

  return {
    symbol: str(r.symbol ?? header.symbol, symbol),
    name: nStr(r.name ?? header.name),
    exchange: nStr(r.exchange ?? header.exchange),
    quote: adaptQuoteLoose(r.quote ?? header.quote),
    setup,
    levels,
    kai_interpretation: interpText
      ? {
          text: joinOnce(interpText, nStr(interp.risk_plain)),
          grade: nStr(interp.grade ?? interp.grade_display),
          last_updated: nStr(interp.last_updated),
        }
      : null,
    your_context: {
      watchlisted: bool(ctx.watchlisted),
      alerts: arr(ctx.alerts).map((raw) => {
        const a = obj(raw);
        return { id: str(a.id), label: str(a.label ?? a.summary_plain ?? a.natural_language) };
      }).filter((a) => a.label),
      plans: arr(ctx.plans).map((p) => str(obj(p).label)).filter(Boolean),
    },
    evidence: {
      news: arr(obj(r.evidence).news).map((raw): NewsItem => {
        const n = obj(raw);
        const pub = n.publisher;
        return {
          id: str(n.id ?? n.url ?? n.title),
          title: str(n.title),
          source: nStr(n.source) ?? (typeof pub === 'string' ? pub : nStr(obj(pub).name)),
          published_utc: nStr(n.published_utc ?? n.published_at),
          url: nStr(n.url ?? n.article_url),
        };
      }).filter((n) => n.title),
    },
    community: { room_id: nStr(community.room_id ?? community.discussion_room_id), thread_summary: nStr(community.thread_summary) },
    lenses,
    candles: adaptCandles(r.candles ?? chart.candles),
  };
}

/* ---------------- Account ---------------- */

/**
 * Entitlement flags arrive as machine keys. These are the sentences a beginner
 * can read; an unknown key degrades to its humanised name rather than being
 * hidden, so a new flag is never silently invisible.
 */
const ENTITLEMENT_LABELS: Record<string, string> = {
  alerts_max_active: 'Alerts Kai watches at once',
  community_post_scope: 'Where you can post',
  broker_connect: 'Connect a real broker',
  options: 'Options',
  lms: 'Course library',
  kai_daily_budget: 'Questions for Kai each day',
  live_market_data: 'Real-time prices',
  paper_trading: 'Paper trading',
  kai_research: 'Full research reports',
};

const sentenceCase = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function adaptEntitlement(key: string, val: unknown): EntitlementFlag {
  const label = ENTITLEMENT_LABELS[key] ?? sentenceCase(key);
  if (typeof val === 'boolean') return { key, label, value_plain: val ? 'Included' : 'Premium', included: val };
  if (typeof val === 'number') {
    const unit = /daily|per_day|budget/.test(key) ? 'a day' : /max|limit/.test(key) ? 'at a time' : '';
    return { key, label, value_plain: `${val}${unit ? ` ${unit}` : ''}`, included: true };
  }
  if (typeof val === 'string') return { key, label, value_plain: sentenceCase(val), included: true };
  const f = obj(val);
  const premiumOnly = bool(f.premium, true) && !bool(f.free);
  return {
    key,
    label: str(f.label, label),
    value_plain: str(f.value_plain, premiumOnly ? 'Premium' : 'Included'),
    included: !premiumOnly,
  };
}

const EXPLAIN_LEVEL = (v: unknown): ExplainLevel => {
  const s = str(v);
  return s === 'beginner' || s === 'intermediate' || s === 'advanced' || s === 'family' ? s : 'beginner';
};

export function adaptMe(v: unknown): Me {
  const r = obj(v);
  const p = obj(r.profile);
  const rp = obj(r.risk_policy);
  const paper = obj(r.paper ?? r.paper_account ?? r.account);
  const sub = obj(r.subscription);
  // `prefs` is where the server keeps them; `settings` is the older name.
  const settings = Object.keys(obj(r.prefs)).length ? obj(r.prefs) : obj(r.settings);
  const prefs = obj(obj(p.onboarding).prefs ?? r.accessibility);
  const acc = obj(settings.accessibility ?? prefs);
  const equity = nNum(paper.equity) ?? nNum(paper.starting_balance);
  const tier = str(sub.tier ?? sub.plan, 'free');
  return {
    profile: {
      user_id: str(p.user_id),
      display_name: nStr(p.display_name),
      handle: nStr(p.handle),
      primary_mode: (nStr(p.primary_mode) as GoalMode | null) ?? null,
      involvement: (nStr(p.involvement) as Me['profile']['involvement']) ?? null,
      experience: nStr(p.experience),
      memory_enabled: bool(p.memory_enabled ?? r.memory_enabled, true),
      onboarding: obj(p.onboarding) as Profile['onboarding'],
    },
    risk_policy: {
      daily_loss_cap: nNum(rp.daily_loss_cap_usd ?? rp.daily_loss_cap) ?? 0,
      max_position_pct: nNum(rp.max_position_pct) ?? 0,
      involvement: (nStr(rp.involvement) as 'hands_on' | 'guided') ?? (nStr(p.involvement) as 'hands_on' | 'guided') ?? 'hands_on',
    },
    paper: equity == null ? null : {
      equity,
      cash: nNum(paper.cash),
      buying_power: nNum(paper.buying_power),
      starting_balance: nNum(paper.starting_balance),
      reset_count: nNum(paper.reset_count),
      last_reset_at: nStr(paper.last_reset_at),
      can_reset: bool(paper.can_reset, true),
    },
    subscription: {
      tier: tier === 'premium' ? 'premium' : 'free',
      status: nStr(sub.status),
      renews_at: nStr(sub.renews_at ?? sub.current_period_end),
      plain: nStr(sub.plain),
    },
    entitlements: (() => {
      const flags = r.entitlement_flags ?? r.entitlements;
      if (Array.isArray(flags)) {
        return flags.map((raw) => {
          const f = obj(raw);
          return adaptEntitlement(str(f.key ?? f.flag), f);
        }).filter((f) => f.key);
      }
      return Object.entries(obj(flags)).map(([key, val]) => adaptEntitlement(key, val));
    })(),
    memory_enabled: bool(r.memory_enabled ?? p.memory_enabled, true),
    settings: {
      explanation_level: EXPLAIN_LEVEL(settings.explanation_level ?? p.explanation_level),
      quiet_hours: obj(settings.quiet_hours) as AppSettings['quiet_hours'],
      notifications: obj(settings.notifications ?? r.notification_prefs) as AppSettings['notifications'],
      accessibility: { reduced_motion: bool(acc.reduced_motion), text_scale: nNum(acc.text_scale) ?? 1 },
    },
  };
}

const NGROUP = (v: unknown): NotificationGroup => {
  const s = str(v);
  return s === 'action_required' || s === 'changes' || s === 'fyi' ? s : 'fyi';
};

export function adaptNotifications(v: unknown): NotificationRow[] {
  return arr(obj(v).notifications ?? v).map((raw): NotificationRow => {
    const n = obj(raw);
    const payload = obj(n.payload);
    return {
      id: str(n.id),
      group: NGROUP(n.group ?? payload.group),
      title: str(payload.title ?? n.title ?? n.kind).replace(/_/g, ' '),
      body: nStr(payload.body ?? n.body ?? payload.message_plain),
      route: nStr(payload.route ?? n.route ?? payload.deep_link),
      created_at: nStr(n.created_at),
      read_at: nStr(n.read_at),
    };
  }).filter((n) => n.id);
}

export function adaptMemory(v: unknown): MemoryRow[] {
  return arr(obj(v).memory ?? obj(v).items ?? v).map((raw): MemoryRow => {
    const m = obj(raw);
    return {
      id: str(m.id),
      kind: str(m.kind, 'note'),
      content: str(m.content ?? m.text ?? obj(m.payload).text),
      created_at: nStr(m.created_at),
    };
  }).filter((m) => m.id && m.content);
}

/* ==================================================================== */
/* V5 — action_preview / alert_preview frames                            */
/* ==================================================================== */

/** Plain-language labels (audit §8) for the actions Kai may propose. */
const ACTION_LABEL: Record<string, string> = {
  draft_alert: 'Set an alert',
  open_setup: 'See why',
  build_plan: 'Build a plan',
  compare: 'Compare these',
  explain: 'See why',
  watch_setup: 'Watch this',
};

/**
 * `action_preview` (and the older `alert_preview`) → a tappable proposal.
 * Kai never executes; the sheet calls the real endpoint when the user taps.
 */
export function adaptActionPreview(env: KaiObjectEnvelope | null): KaiActionPreview | null {
  if (!env) return null;
  const p = (env.payload ?? {}) as Record<string, unknown>;

  if (env.type === 'alert_preview') {
    const symbol = typeof p.symbol === 'string' ? p.symbol : undefined;
    const summary = typeof p.summary_plain === 'string' ? p.summary_plain : null;
    return {
      action: 'draft_alert',
      label: 'Set an alert',
      summary_plain: summary,
      args: {
        alert_id: typeof p.alert_id === 'string' ? p.alert_id : undefined,
        natural_language: summary ?? '',
        symbol,
      },
    };
  }

  const raw = typeof p.action === 'string' ? p.action : '';
  const action = (ACTION_LABEL[raw] ? raw : 'explain') as KaiActionPreview['action'];
  return {
    action,
    label: typeof p.label === 'string' && p.label ? p.label : ACTION_LABEL[action],
    summary_plain: typeof p.summary_plain === 'string' ? p.summary_plain : null,
    args: (p.args && typeof p.args === 'object' ? p.args : {}) as Record<string, unknown>,
  };
}

/* ==================================================================== */
/* Round 4 adapters — alerts as trade objects, conversations, ticker     */
/* page, Kai profile. Written against packages/shared/api.ts (API-4) but */
/* tolerant: every field falls back rather than throwing, so an older or */
/* partially-deployed API still renders.                                 */
/* ==================================================================== */
import type {
  AlertCard, AlertCardState, AlertScoreComponent, AlertsRound4, ConversationRow,
  ConversationsPayload, Experience, FocusKey, KaiProfile, RuleAdherence,
  TickerMeter, TickerPage,
} from './types';

type R4Obj = Record<string, unknown>;
const r4obj = (v: unknown): R4Obj => (v && typeof v === 'object' ? (v as R4Obj) : {});
const r4arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const r4str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback);
const r4nul = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const r4num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r4bool = (v: unknown): boolean => v === true;
/**
 * A level cell is a NUMBER slot. When the server has only a sentence for it
 * ("No entry level is defined on this one yet."), the cell shows nothing and
 * the sentence moves to the note under the strip — a paragraph crammed into a
 * 70px cell is unreadable and hides the three levels that do have numbers.
 */
const r4short = (v: unknown, max = 14): string | null => {
  const t = typeof v === 'string' ? v.trim() : null;
  if (!t) return null;
  return t.length <= max ? t : null;
};

/** Levels are numbers on the wire; the card always shows them in mono. */
const r4price = (v: unknown): string | null => {
  const n = r4num(v);
  if (n == null) return r4nul(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

/** spec §5 — state → the ONE primary action label (client-side fallback). */
const PRIMARY_ACTION: Record<AlertCardState, string> = {
  watching: 'Open chart',
  forming: 'Keep watching',
  ready: 'Review trade',
  entry_reached: 'Open Trade Portal',
  planned: 'Prepare order',
  order_pending: 'Manage order',
  position_active: 'Manage trade',
  invalidated: 'See what changed',
  closed: 'Review outcome',
};

/** spec §1 — which of the three top-level states a card lives in. */
const STATE_TAB: Record<AlertCardState, 'active' | 'watching' | 'history'> = {
  watching: 'watching',
  forming: 'watching',
  ready: 'active',
  entry_reached: 'active',
  planned: 'active',
  order_pending: 'active',
  position_active: 'active',
  invalidated: 'active',
  closed: 'history',
};

const CARD_STATES = new Set<string>(Object.keys(PRIMARY_ACTION));

export function alertCardState(v: unknown): AlertCardState {
  const s = r4str(v).toLowerCase().replace(/[\s-]+/g, '_');
  if (CARD_STATES.has(s)) return s as AlertCardState;
  if (s === 'triggered' || s === 'entry') return 'entry_reached';
  if (s === 'executed' || s === 'resolved' || s === 'expired' || s === 'missed') return 'closed';
  if (s === 'active') return 'ready';
  if (s === 'monitoring') return 'watching';
  return 'watching';
}

export function primaryActionLabel(state: AlertCardState): string {
  return PRIMARY_ACTION[state];
}

/**
 * One scorecard row. `strength` is 0–5 SEGMENTS. If a legacy build ever sends
 * points, they are folded into segments HERE so no fraction can reach a screen
 * (spec §4 "Never display component fractions such as 18/20").
 */
function adaptScoreComponent(raw: unknown, i: number): AlertScoreComponent {
  const o = r4obj(raw);
  let strength = r4num(o.strength);
  if (strength == null) {
    const points = r4num(o.points);
    const max = r4num(o.max);
    strength = points != null && max != null && max > 0 ? Math.round((points / max) * 5) : 3;
  }
  const evidence = r4arr(o.evidence).map((e) => r4str(e)).filter(Boolean);
  return {
    key: r4str(o.key, `c${i}`),
    label: r4str(o.label, 'Component'),
    status: r4str(o.status, 'Neutral'),
    strength: Math.max(0, Math.min(5, Math.round(strength))),
    explanation: r4nul(o.explanation) ?? (evidence.length ? evidence.join(' · ') : null),
  };
}

/** `AlertCard` (packages/shared) → the card the screen draws. */
export function adaptAlertCard(raw: unknown, i = 0): AlertCard {
  const o = r4obj(raw);
  const identity = r4obj(o.identity);
  const grade = r4obj(o.grade);
  const event = r4obj(o.event);
  const quote = r4obj(o.quote);
  const plan = r4obj(o.trade_plan ?? o.trade);
  const fit = r4obj(o.fit);
  const community = r4obj(o.community);
  const action = r4obj(o.primary_action);
  const state = alertCardState(o.state ?? o.status);
  const targets = r4arr(plan.targets);
  const firstTarget = targets.length ? r4obj(targets[0]) : {};

  const symbol = r4str(identity.symbol ?? o.symbol, '—');
  const riskUsd = r4num(fit.est_risk_usd);
  const conflicts = r4arr(fit.conflicts).map((c) => r4str(c)).filter(Boolean);
  const sample = r4num(community.sample_size ?? community.sample);
  const sentiment = r4nul(community.sentiment);
  const bullish = sentiment ? Number((sentiment.match(/(\d{1,3})\s*%/) ?? [])[1] ?? NaN) : NaN;

  return {
    id: r4str(o.id, `alert-${i}`),
    symbol,
    company: r4str(identity.company_name ?? o.company, symbol),
    mode_label: r4str(identity.mode_label ?? o.mode_label, 'Day Trade'),
    direction_label: r4str(identity.direction ?? o.direction_label, 'Long'),
    instrument_label: r4nul(identity.instrument ?? o.instrument_label),
    alert_id: r4nul(o.alert_id) ?? r4nul(o.id),
    grade: r4str(grade.display ?? o.grade_display ?? o.grade, '—'),
    score: r4num(grade.score ?? o.score),
    state,
    state_label: r4str(o.state_label, state === 'watching' || state === 'forming' ? 'Watching' : 'Triggered'),
    triggered_at_label: r4nul(event.at_plain ?? o.triggered_at_label),
    headline: r4str(event.headline ?? o.headline ?? o.title, ''),
    what_changed: r4str(event.what_changed ?? o.what_changed ?? o.detail, ''),
    company_summary: r4nul(o.company_summary),
    trade: {
      direction: r4nul(plan.direction_plain ?? plan.direction ?? o.direction),
      current: r4price(quote.price ?? r4obj(o.quote).price),
      entry: r4price(plan.entry) ?? r4short(plan.entry_condition_plain),
      stop: r4price(plan.stop),
      target: r4price(firstTarget.price ?? plan.target),
      rr: r4num(plan.rr) != null ? `${(r4num(plan.rr) as number).toFixed(1)}:1` : r4short(plan.rr_plain, 10),
      hold: r4short(plan.expected_hold ?? plan.hold, 28),
      expires: r4short(plan.expires_plain ?? plan.expires, 20),
      note: [
        r4price(plan.entry) == null ? r4nul(plan.entry_condition_plain) : null,
        r4price(plan.stop) == null ? r4nul(plan.invalidation_plain) : null,
      ].filter(Boolean).join(' ') || null,
    },
    score_components: r4arr(o.score_components).map(adaptScoreComponent),
    kai_interpretation: r4nul(o.kai_interpretation ?? o.interpretation),
    fit: Object.keys(fit).length
      ? {
          risk_amount: riskUsd != null ? `$${Math.round(riskUsd).toLocaleString('en-US')}` : r4nul(fit.risk_amount),
          cap_line: fit.fits_cap === true ? 'fits daily cap' : fit.fits_cap === false ? 'over your daily cap' : r4nul(fit.cap_line),
          conflicts: conflicts.length ? conflicts.join(' · ') : 'No conflicts',
        }
      : null,
    community: Object.keys(community).length
      ? {
          sample: sample,
          bullish_pct: Number.isFinite(bullish) ? bullish : r4num(community.bullish_pct),
          common_level: r4price(community.common_level),
          verification: community.verified === true ? 'verified' : community.verified === false ? 'unverified' : r4nul(community.verification),
        }
      : null,
    progress: (() => {
      const p = r4obj(o.progress);
      const pct = r4num(p.pct);
      return pct != null ? { pct, label: r4str(p.label, '') } : null;
    })(),
    primary_action: { label: r4str(action.label, PRIMARY_ACTION[state]), kind: state },
    freshness_line: r4nul(quote.label_plain ?? o.freshness_line),
    outcome: (() => {
      const out = r4obj(o.outcome);
      return out.label ? { label: r4str(out.label, 'Outcome'), value: r4nul(out.value), tone: (r4str(out.tone, 'neutral') as 'good' | 'bad' | 'neutral') } : null;
    })(),
    resolved_label: r4nul(o.resolved_label ?? o.resolved_at_label),
  };
}

/**
 * `GET /alerts?tab=` answers with the requested tab's `cards` plus the counts
 * for all three tabs. Older builds answer with the whole grouped payload, so
 * both are folded into the same three lists here.
 */
export function adaptAlertsRound4(raw: unknown): AlertsRound4 {
  const o = r4obj(raw);
  const out: AlertsRound4 = {
    active: [], watching: [], history: [],
    counts: { active: 0, watching: 0, history: 0 },
    empty_copy: r4nul(o.card_empty_copy ?? o.empty_copy)
      ?? 'Nothing here yet. Kai will put an alert here the moment something changes.',
  };

  if (Array.isArray(o.cards)) {
    (o.cards as unknown[]).map(adaptAlertCard).forEach((c, i) => {
      const declared = r4str(r4obj((o.cards as unknown[])[i]).tab) as 'active' | 'watching' | 'history' | '';
      const tab = declared === 'active' || declared === 'watching' || declared === 'history' ? declared : STATE_TAB[c.state];
      out[tab].push(c);
    });
  } else {
    const pick = (...keys: string[]): unknown[] => {
      for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[];
      return [];
    };
    out.active = pick('active', 'needs_attention', 'attention').map(adaptAlertCard);
    out.watching = pick('watching', 'monitoring').map(adaptAlertCard);
    out.history = pick('history', 'resolved').map(adaptAlertCard);
  }

  out.counts = { active: out.active.length, watching: out.watching.length, history: out.history.length };
  r4arr(o.tabs).forEach((t) => {
    const chip = r4obj(t);
    const key = r4str(chip.key);
    const count = r4num(chip.count);
    if ((key === 'active' || key === 'watching' || key === 'history') && count != null) out.counts[key] = count;
  });
  const counts = r4obj(o.counts);
  (['active', 'watching', 'history'] as const).forEach((k) => {
    const n = r4num(counts[k]);
    if (n != null) out.counts[k] = n;
  });
  return out;
}

/** Merge a per-tab response into the lists already held (see useAlertsRound4). */
export function mergeAlertsTab(base: AlertsRound4, incoming: AlertsRound4, tab: 'active' | 'watching' | 'history'): AlertsRound4 {
  return {
    ...base,
    [tab]: incoming[tab],
    counts: incoming.counts,
    empty_copy: incoming.empty_copy ?? base.empty_copy,
  };
}

function adaptConversationRow(raw: unknown, i: number): ConversationRow {
  const o = r4obj(raw);
  return {
    id: r4str(o.id, `conv-${i}`),
    title: r4str(o.title, 'Untitled conversation'),
    pinned: r4bool(o.pinned),
    last_message_at: r4nul(o.last_message_at ?? o.updated_at ?? o.created_at),
  };
}

export function adaptConversations(raw: unknown): ConversationsPayload {
  const o = r4obj(raw);
  const pinnedList = r4arr(o.pinned).map(adaptConversationRow);
  const recentList = r4arr(o.recent).map(adaptConversationRow);
  if (pinnedList.length || recentList.length) return { pinned: pinnedList, recent: recentList };
  const flat = r4arr(o.conversations ?? o.items ?? raw).map(adaptConversationRow);
  return { pinned: flat.filter((c) => c.pinned), recent: flat.filter((c) => !c.pinned) };
}

/** `QualitativeMeter` → the ticker page's meter row. */
function adaptMeter(raw: unknown, label: string): TickerMeter {
  const o = r4obj(raw);
  return {
    label: r4str(o.label, label),
    status: r4str(o.status, 'Neutral'),
    strength: Math.max(0, Math.min(5, Math.round(r4num(o.strength) ?? 3))),
  };
}

/** The first level in a `PriceLevel[]`, as "Support 498". */
function adaptLevel(raw: unknown, prefix: string): string | null {
  const list = r4arr(raw);
  if (!list.length) {
    const one = r4price(raw);
    return one ? `${prefix} ${one}` : null;
  }
  const first = r4obj(list[0]);
  const price = r4price(first.price);
  return price ? `${prefix} ${price}` : null;
}

export function adaptTickerPage(raw: unknown, symbol: string): TickerPage {
  const o = r4obj(raw);
  const identity = r4obj(o.identity);
  const company = r4obj(o.company);
  const quote = r4obj(o.quote);
  const market = r4obj(o.market);
  const overview = r4obj(o.ticker_overview ?? o.overview);
  const technicals = r4obj(o.technicals);
  const kai = r4obj(o.kai_view);
  const community = r4obj(o.ticker_community ?? o.community);
  const alert = r4obj(o.active_alert);
  const circle = r4obj(community.circle);
  const timeframes = r4arr(o.chart_timeframes).map((t) => r4str(r4obj(t).label ?? r4obj(t).key)).filter(Boolean);

  return {
    symbol: r4str(identity.symbol ?? o.symbol, symbol),
    company: r4str(company.name ?? identity.name ?? o.company, symbol),
    quote: adaptQuoteLoose(Object.keys(quote).length ? quote : o.quote),
    market_label: r4str(market.label ?? o.market_label, 'market closed').toLowerCase(),
    starred: r4bool(identity.watchlisted ?? o.starred),
    chart: {
      points: r4arr(r4obj(o.chart_config ?? o.chart).points).filter((p): p is number => typeof p === 'number'),
      timeframes: timeframes.length ? timeframes : ['1D', '1W', '1M', '1Y'],
      selected: timeframes[0] ?? '1D',
    },
    kai_view: {
      take: r4str(kai.take ?? kai.text, ''),
      actions: (() => {
        const list = r4arr(kai.actions).map((a) => (typeof a === 'string' ? a : r4str(r4obj(a).label))).filter(Boolean);
        return list.length ? list : ['Ask Kai', 'Explain the chart', 'Compare'];
      })(),
    },
    overview: {
      summary: r4str(overview.summary ?? company.summary, ''),
      market_cap: r4nul(overview.market_cap_plain ?? company.market_cap_plain ?? overview.market_cap),
      next_earnings: r4nul(overview.next_earnings ?? company.next_earnings),
      pe: r4nul(overview.pe ?? company.pe),
      sector: r4nul(overview.sector ?? company.sector),
    },
    technicals: {
      meters: [
        adaptMeter(technicals.trend, 'Trend'),
        adaptMeter(technicals.momentum, 'Momentum'),
        adaptMeter(technicals.volatility, 'Volatility'),
      ],
      support: adaptLevel(technicals.support, 'Support'),
      resistance: adaptLevel(technicals.resistance, 'Resistance'),
    },
    community: {
      common_level: r4price(community.most_mentioned_level ?? community.common_level),
      posts_today: r4num(community.posts_today),
      bullish_pct: (() => {
        const sentiment = r4nul(community.sentiment);
        const m = sentiment ? Number((sentiment.match(/(\d{1,3})\s*%/) ?? [])[1] ?? NaN) : NaN;
        return Number.isFinite(m) ? m : r4num(community.bullish_pct);
      })(),
      sample: r4num(community.posts_today ?? community.sample),
      circle: circle.id
        ? { id: r4str(circle.id), label: `Open ${r4str(circle.name, `${symbol} circle`)}` }
        : null,
    },
    active_alert: alert.card_id || alert.alert_id || alert.id
      ? {
          id: r4str(alert.alert_id ?? alert.card_id ?? alert.id),
          grade: r4str(r4obj(alert.grade).display ?? alert.grade, '—'),
          score: r4num(r4obj(alert.grade).score),
          line: r4str(alert.plain ?? alert.line, 'One active alert'),
        }
      : null,
  };
}

const FOCUS_KEYS = new Set<string>(['tech', 'ai', 'energy', 'etf', 'crypto', 'earnings']);

export function adaptFocus(raw: unknown): FocusKey[] {
  // The API sends a FocusSummary object; older builds sent a plain array.
  const keys = Array.isArray(raw) ? raw : r4arr(r4obj(raw).keys);
  return keys.map((f) => r4str(f)).filter((f) => FOCUS_KEYS.has(f)) as FocusKey[];
}

export function adaptExperience(raw: unknown): Experience {
  const s = r4str(raw);
  if (s === 'pro' || s === 'advanced') return 'pro';
  if (s === 'some' || s === 'intermediate') return 'some';
  return 'new';
}

export function adaptKaiProfile(
  raw: unknown,
  fallbackMode: GoalMode,
): { mode: GoalMode; experience: Experience; focus: FocusKey[]; voice_line?: string } {
  const o = r4obj(raw);
  const mode = r4str(o.mode) as GoalMode;
  return {
    mode: mode === 'day_trade' || mode === 'swing' || mode === 'invest' ? mode : fallbackMode,
    experience: adaptExperience(o.experience ?? o.experience_level),
    focus: adaptFocus(o.focus),
    voice_line: r4nul(o.voice_line) ?? undefined,
  };
}

/**
 * `show:false` under three sessions — a ratio out of one or two is noise, so
 * the Account board simply does not draw the line (brief item 10).
 */
export function adaptRuleAdherence(raw: unknown): RuleAdherence | null {
  const o = r4obj(raw);
  const sessions = r4num(o.sessions);
  const followed = r4num(o.followed);
  if (sessions == null || followed == null) return null;
  if (o.show === false) return { sessions: 0, followed: 0 };
  return { sessions, followed };
}
