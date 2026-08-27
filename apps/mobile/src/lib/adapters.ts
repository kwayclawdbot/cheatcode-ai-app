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
