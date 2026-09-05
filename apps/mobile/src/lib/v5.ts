/**
 * V5 view models — Home priority, the asset workspace, simplified Alerts.
 *
 * These live next to `adapters.ts` rather than inside it because they do two
 * jobs the round-2 adapters do not:
 *   1. read the RESTRUCTURED API-3 payload when it is there, and
 *   2. derive the identical view model from the round-2 payload when it isn't,
 *      so every screen renders against the stack that exists today.
 * Nothing here invents a number. A field the server cannot supply is null and
 * the screen says so.
 */
import { adaptCandles, adaptQuoteLoose, adaptSetupCard, freshnessOf } from './adapters';
import { suggestedLevels } from '../features/orders/plan-read';
import type {
  AlertRow, AlertsSimple, AlsoWatchingRow, AttentionAlert, Candle, GoalMode, GradedSetup,
  HomePriority, HomeV5, MarketStatus, MonitoringRow, PlanNumbers, PositionModule,
  PrimaryAction, PriorityKind, Quote, ResearchRef, Scenario, SetupDetail, SetupModule,
  SetupState, SymbolWorkspace, WorkspaceHistoryItem,
} from './types';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const nStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const fmt = (n: number | null | undefined): string | null =>
  n == null ? null : String(Number.isInteger(n) ? n : Number(n.toFixed(2)));

/* ==================================================================== */
/* State-driven labels (brief §3 + §7). Plain language, never taxonomy.  */
/* ==================================================================== */

/**
 * The one table the whole app reads its primary label from.
 * Forming → Watch this · Approaching/Ready → Review setup · Planned → Buy ·
 * Active → Manage · Invalidated → Review what changed.
 */
export function primaryActionFor(
  state: SetupState | 'planned' | 'active' | null | undefined,
  ctx: { symbol: string; setupId?: string | null; planId?: string | null; positionId?: string | null },
): PrimaryAction {
  const sym = encodeURIComponent(ctx.symbol);
  const setupQ = ctx.setupId ? `&setup=${encodeURIComponent(ctx.setupId)}` : '';
  switch (state) {
    case 'forming':
      return { label: 'Watch this', route: `/symbol/${sym}?tab=overview${setupQ}` };
    case 'ready':
    case 'confirmed':
      return { label: 'Review setup', route: `/symbol/${sym}?tab=overview${setupQ}` };
    case 'planned':
      return { label: 'Buy', route: `/order/new?symbol=${sym}&side=buy_to_open${ctx.planId ? `&plan=${encodeURIComponent(ctx.planId)}` : ''}${setupQ}` };
    case 'triggered':
    case 'active':
      return ctx.positionId
        ? { label: 'Manage', route: `/position/${encodeURIComponent(ctx.positionId)}` }
        : { label: 'Review setup', route: `/symbol/${sym}?tab=overview${setupQ}` };
    case 'invalidated':
      return { label: 'Review what changed', route: `/symbol/${sym}?tab=overview${setupQ}` };
    default:
      return { label: 'Review setup', route: `/symbol/${sym}?tab=overview${setupQ}` };
  }
}

/** Priority header line, e.g. "Approaching entry". Label + tone, never colour alone. */
export function stateHeadline(state: SetupState | null | undefined): { label: string; tone: HomePriority['state_tone'] } {
  switch (state) {
    case 'forming': return { label: 'Approaching entry', tone: 'market' };
    case 'ready': return { label: 'Ready to enter', tone: 'positive' };
    case 'confirmed': return { label: 'Confirmed', tone: 'positive' };
    case 'triggered': return { label: 'In progress', tone: 'positive' };
    case 'invalidated': return { label: 'Invalidated', tone: 'risk' };
    case 'expired': return { label: 'Expired', tone: 'neutral' };
    default: return { label: 'Watching', tone: 'neutral' };
  }
}

/** "Setup forming" / "Setup ready" — the module's own heading. */
export function setupModuleHeading(state: SetupState | null | undefined): string {
  switch (state) {
    case 'forming': return 'Setup forming';
    case 'ready': return 'Setup ready';
    case 'confirmed': return 'Setup confirmed';
    case 'triggered': return 'Setup triggered';
    case 'invalidated': return 'Setup invalidated';
    case 'expired': return 'Setup expired';
    default: return 'Setup watching';
  }
}

/** The one honest sentence under the Buy/Sell bar. */
export function setupNote(state: SetupState | null | undefined, hasPosition: boolean): string {
  if (hasPosition) return 'You hold this — Sell closes your position.';
  switch (state) {
    case 'forming': return 'Setup forming — Kai suggests waiting for confirmation';
    case 'ready':
    case 'confirmed': return 'Conditions are met — size it before you buy';
    case 'invalidated': return 'The idea is invalidated — nothing to buy here';
    default: return 'Paper orders only · fills use delayed prices';
  }
}

/** "0.4% away" — arithmetic on two numbers the server already sent. */
export function distanceLabel(price: number | null | undefined, level: number | null | undefined): string | null {
  if (price == null || level == null || level === 0) return null;
  const pct = Math.abs((price - level) / level) * 100;
  if (!Number.isFinite(pct)) return null;
  return `${pct < 0.05 ? '<0.1' : pct.toFixed(1)}% away`;
}

/* ==================================================================== */
/* Home V5                                                              */
/* ==================================================================== */

function priorityFromSetup(s: GradedSetup, levels: HomePriority['levels'], candles: Candle[]): HomePriority {
  const head = stateHeadline(s.state);
  const price = s.quote?.price ?? null;
  const dist = distanceLabel(price, levels.entry);
  return {
    kind: 'setup',
    id: s.id,
    symbol: s.symbol,
    grade_display: s.grade_display,
    state_label: head.label,
    state_tone: head.tone,
    title: null,
    detail: s.risk_line ?? null,
    chart_note: levels.entry != null
      ? `Entry ${fmt(levels.entry)}${dist ? ` · ${dist}` : ''}`
      : null,
    levels,
    quote: s.quote ?? null,
    candles,
    primary_action: primaryActionFor(s.state, { symbol: s.symbol, setupId: s.id }),
  };
}

const numFromLevelString = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const m = v.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/**
 * The restructured `priority` block (packages/shared `HomePriority`).
 * The server owns the state-driven label; the client never re-derives it.
 * Levels come off the pinned `object` envelope (a graded_setup payload).
 */
function adaptPriorityBlock(v: unknown): HomePriority | null {
  const p = obj(v);
  const kindRaw = str(p.kind);
  if (!kindRaw) return null;
  const kind = (['setup', 'alert', 'position', 'portfolio'].includes(kindRaw) ? kindRaw : 'setup') as PriorityKind;
  const action = obj(p.primary_action);
  const symbol = nStr(p.symbol);
  const payload = obj(obj(p.object).payload);
  const quote = adaptQuoteLoose(p.quote ?? payload.quote);
  const state = str(p.state ?? payload.state) as SetupState;

  const levels = {
    entry: nNum(payload.entry),
    target: nNum(obj(arr(payload.targets)[0]).price),
    invalid: nNum(payload.stop),
  };

  // The server's own headline is the state pill; `subhead` is the callout.
  const head = stateHeadline(state);
  const chartNote = nStr(p.subhead)
    ?? (levels.entry != null
      ? `Entry ${fmt(levels.entry)}${distanceLabel(quote?.price ?? null, levels.entry) ? ` · ${distanceLabel(quote?.price ?? null, levels.entry)}` : ''}`
      : null);

  return {
    kind,
    id: str(p.id ?? payload.setup_id, 'priority'),
    symbol,
    grade_display: nStr(p.grade_display ?? payload.grade_display ?? payload.grade_band),
    // `headline` is Kai's sentence about the object; the pill is the state.
    state_label: state ? head.label : nStr(p.subhead),
    state_tone: head.tone,
    title: symbol ? nStr(p.headline) : (nStr(p.headline) ?? null),
    detail: nStr(p.detail_plain ?? payload.risk_plain ?? payload.thesis_plain),
    chart_note: chartNote,
    levels,
    quote,
    candles: adaptCandles(p.candles),
    primary_action: nStr(action.label) && nStr(action.route)
      ? { label: str(action.label), route: str(action.route) }
      : primaryActionFor(state, { symbol: symbol ?? '', setupId: nStr(p.id), positionId: kind === 'position' ? nStr(p.id) : null }),
  };
}

function adaptAlsoWatching(v: unknown): AlsoWatchingRow[] {
  const out: AlsoWatchingRow[] = [];
  arr(v).forEach((raw, i) => {
    const w = obj(raw);
    const symbol = str(w.symbol);
    if (!symbol) return;
    const text = nStr(w.plain ?? w.text ?? w.next_action ?? w.label ?? w.summary_plain) ?? '';
    const tone: AlsoWatchingRow['tone'] =
      str(w.tone) === 'attention' || /invalid|attention|risk|slipp|needs/i.test(text) ? 'attention' : 'neutral';
    const route = nStr(w.route) ?? (obj(w.action).route ? str(obj(w.action).route) : null);
    out.push({
      id: str(w.id, `${symbol}-${i}`),
      symbol,
      text,
      tone,
      // Only an item that needs a decision gets a word next to it — the rest
      // are context, not chores (audit §9).
      action: tone === 'attention'
        ? { label: nStr(obj(w.action).label) ?? 'Review', route: route ?? `/symbol/${encodeURIComponent(symbol)}?tab=overview` }
        : null,
    });
  });
  return out;
}

/**
 * `GET /home?mode=` → the V5 hierarchy.
 * Reads `opening_line` / `priority` / `also_watching` when API-3 sends them,
 * otherwise builds the same three things out of the round-2 briefing +
 * lead_setup + watching that the endpoint already returns.
 */
export function adaptHomeV5(
  v: unknown,
  fallback: { mode: GoalMode; market: MarketStatus; briefing: HomeV5['briefing']; leadSetup: GradedSetup | null; watching: { id: string; symbol: string; label: string; value?: string | null }[]; dailyRisk: HomeV5['daily_risk']; degraded?: boolean; degradedReason?: string | null; investNotice?: string | null },
): HomeV5 {
  const r = obj(v);

  const priority = adaptPriorityBlock(r.priority) ?? (fallback.leadSetup
    ? priorityFromSetup(
        fallback.leadSetup,
        {
          entry: numFromLevelString(fallback.leadSetup.entry),
          target: numFromLevelString(fallback.leadSetup.target),
          invalid: numFromLevelString(fallback.leadSetup.invalid),
        },
        adaptCandles(r.candles),
      )
    : null);

  const also = adaptAlsoWatching(r.also_watching).length
    ? adaptAlsoWatching(r.also_watching)
    : fallback.watching.map((w) => ({
        id: w.id,
        symbol: w.symbol,
        text: [w.label, w.value].filter(Boolean).join(' · '),
        tone: /invalid|slipp|attention|risk/i.test(w.label) ? 'attention' as const : 'neutral' as const,
        action: /invalid|slipp|attention|risk/i.test(w.label)
          ? { label: 'Review', route: `/symbol/${encodeURIComponent(w.symbol)}?tab=overview` }
          : null,
      }));

  // Kai's opening line: the server's, else the briefing's headline, else a
  // sentence built only out of facts we actually have.
  const opening = nStr(r.opening_line)
    ?? fallback.briefing?.headline
    ?? (priority
      ? `${priority.symbol ?? 'One idea'} needs your attention.`
      : 'Nothing needs a decision right now.');

  return {
    mode: (nStr(r.mode) as GoalMode) ?? fallback.mode,
    market: fallback.market,
    opening_line: opening,
    priority,
    also_watching: also,
    briefing: fallback.briefing,
    daily_risk: fallback.dailyRisk,
    degraded: fallback.degraded,
    degraded_reason: fallback.degradedReason ?? null,
    invest_notice: fallback.investNotice ?? null,
  };
}

/* ==================================================================== */
/* Asset workspace                                                      */
/* ==================================================================== */

function adaptResearchRefs(v: unknown): ResearchRef[] {
  const out: ResearchRef[] = [];
  arr(v).forEach((raw, i) => {
    const n = obj(raw);
    const title = nStr(n.label ?? n.title ?? n.headline ?? n.text);
    if (!title) return;
    out.push({
      id: str(n.id, `ref-${i}`),
      title,
      source: nStr(n.detail_plain ?? n.source ?? n.publisher),
      url: nStr(n.url),
      published_utc: nStr(n.at ?? n.published_utc ?? n.published_at),
    });
  });
  return out;
}

/** `Scenario` on the wire is {name, plain, outcome_usd, semantic}. */
function adaptScenarioList(v: unknown): Scenario[] {
  const out: Scenario[] = [];
  arr(v).forEach((raw) => {
    const s = obj(raw);
    const plain = nStr(s.plain ?? s.text ?? s.summary_plain);
    const label = nStr(s.name ?? s.label) ?? (plain ? 'If it plays out' : null);
    if (!plain || !label) return;
    const sem = str(s.semantic ?? s.tone ?? s.kind);
    const tone: Scenario['tone'] = sem === 'positive' || sem === 'good' ? 'good'
      : sem === 'risk' || sem === 'bad' ? 'bad' : 'neutral';
    const usd = nNum(s.outcome_usd);
    const amount = nStr(s.amount) ?? (usd != null ? `${usd >= 0 ? '+' : '−'}$${Math.abs(usd).toFixed(0)}` : null);
    out.push({ label, plain, amount, tone });
  });
  return out;
}

function adaptPositionModule(v: unknown): PositionModule | null {
  const p = obj(v);
  const id = nStr(p.position_id ?? p.id);
  if (!id) return null;
  const health = str(p.health);
  return {
    id,
    qty: nNum(p.qty ?? p.quantity),
    avg_price: nNum(p.avg_cost ?? p.avg_price ?? p.average_price),
    unrealized_pnl: nNum(p.unrealized_pnl ?? p.unrealized_pl),
    health_label: nStr(p.health_label)
      ?? (health === 'healthy' ? 'Healthy' : health === 'at_risk' ? 'At risk' : null),
    stop: nNum(p.stop),
    target: nNum(p.target) ?? nNum(obj(arr(p.targets)[0]).price),
    plain: nStr(p.plain ?? p.summary_plain),
  };
}

/** `PlainAction[]` → the one action with a given `action` name. */
function findAction(list: unknown, ...names: string[]): { label: string; route: string | null; hint: string | null } | null {
  for (const raw of arr(list)) {
    const a = obj(raw);
    if (names.includes(str(a.action))) {
      return { label: str(a.label), route: nStr(a.route), hint: nStr(a.hint) };
    }
  }
  return null;
}

/**
 * `GET /symbols/:symbol?mode=` → the workspace.
 * Accepts BOTH the restructured payload (identity/overview/kai/plan/community/
 * history/actions) and the round-2 one, so a screen never blanks out while the
 * two lanes are landing at slightly different times.
 */
export function adaptWorkspace(v: unknown, symbol: string): SymbolWorkspace {
  const r = obj(v);
  const identity = obj(r.identity);
  const overview = obj(r.overview);
  const kai = obj(r.kai);
  const interp = obj(kai.interpretation);
  const plan = obj(r.plan);
  const community = obj(r.community);
  const ctx = obj(r.your_context);
  const chart = obj(r.chart_config ?? r.chart);

  const quote = adaptQuoteLoose(r.quote ?? identity.quote ?? obj(r.quote_header).quote);

  /* levels — annotations and key_levels are semantic, never coloured */
  const levels: SymbolWorkspace['overview']['key_levels'] = { entry: null, target: null, invalid: null, support: null };
  const readLevel = (raw: unknown) => {
    const a = obj(raw);
    const price = nNum(a.price ?? a.value);
    if (price == null) return;
    const sem = str(a.semantic ?? a.kind ?? a.label ?? a.text).toLowerCase();
    if (sem.includes('entry')) levels.entry ??= price;
    else if (sem.includes('target')) levels.target ??= price;
    else if (sem.includes('invalid') || sem.includes('stop')) levels.invalid ??= price;
    else if (sem.includes('support')) levels.support ??= price;
  };
  arr(overview.key_levels).forEach(readLevel);
  arr(chart.annotations ?? r.annotations).forEach(readLevel);
  const explicit = obj(r.levels);
  levels.entry ??= nNum(explicit.entry);
  levels.target ??= nNum(explicit.target);
  levels.invalid ??= nNum(explicit.invalid ?? explicit.invalidation ?? explicit.stop);
  levels.support ??= nNum(explicit.support);

  /* the setup MODULE */
  const setupRaw = obj(overview.setup_module ?? overview.setup ?? r.setup);
  let setupModule: SetupModule | null = null;
  if (Object.keys(setupRaw).length) {
    const s = setupRaw;
    const id = str(s.setup_id ?? s.id, 'setup');
    const state = (str(s.state, 'watching') as SetupState);
    const entryNum = nNum(s.entry) ?? levels.entry;
    const stopNum = nNum(s.stop) ?? levels.invalid;
    const targetNum = nNum(obj(arr(s.targets)[0]).price) ?? levels.target;
    const short = str(s.intent).startsWith('sell') || str(s.direction) === 'short';
    const primary = findAction(s.actions, 'watch', 'follow', 'review', 'buy', 'manage');
    levels.entry ??= entryNum;
    levels.invalid ??= stopNum;
    levels.target ??= targetNum;
    setupModule = {
      id,
      state,
      state_label: setupModuleHeading(state),
      grade_display: str(s.grade_display ?? s.grade_band, '—'),
      distance_label: (() => {
        const d = distanceLabel(quote?.price ?? null, entryNum);
        return d ? d.replace(' away', ' from entry') : null;
      })(),
      entry: entryNum != null ? `${short ? '<' : '>'} ${fmt(entryNum)}` : nStr(s.entry),
      target: fmt(targetNum) ?? nStr(s.target),
      invalid: stopNum != null ? `${short ? '>' : '<'} ${fmt(stopNum)}` : nStr(s.invalid),
      primary_action: primary?.label && primary.route
        ? { label: primary.label, route: primary.route }
        : primaryActionFor(state, { symbol, setupId: id }),
      note: nStr(s.headline_plain ?? s.risk_plain ?? s.risk_line),
      following: bool(s.following ?? ctx.following),
    };
  }

  const position = adaptPositionModule(overview.position ?? r.position);
  const watchlisted = bool(identity.watchlisted ?? overview.watchlist ?? ctx.watchlisted ?? r.watchlisted);

  const contextLine = nStr(identity.status_line ?? r.context_line)
    ?? [watchlisted ? 'Watching' : 'Not on your list', position ? 'position open' : 'no position'].join(' · ');

  /* plan */
  const planSuggested = obj(plan.suggested ?? plan.suggestion);
  const planTargets = arr(planSuggested.targets)
    .map((t) => nNum(obj(t).price) ?? nNum(t))
    .filter((n): n is number => n != null);
  /*
   * THE SAME REFUSAL AS THE PLAN SCREEN, because this tab shows the same
   * three tiles. `/symbols/:symbol` used to fill its suggested entry with the
   * last traded price on a symbol with no setup; the route no longer does, and
   * this drops it anyway in case the phone is talking to an older API. An
   * entry with no invalidation goes out along with the entry — half a plan on
   * a screen is read as a plan.
   */
  const offered = suggestedLevels({
    symbol: str(r.symbol ?? identity.symbol),
    entry: nNum(planSuggested.entry) ?? levels.entry ?? null,
    stop: nNum(planSuggested.stop) ?? levels.invalid ?? null,
    targets: planTargets.length ? planTargets : (levels.target != null ? [levels.target] : []),
    noPlanPlain: nStr(planSuggested.no_plan_plain),
  });
  const suggested: PlanNumbers | null = Object.keys(planSuggested).length || levels.entry != null
    ? {
        entry: offered.entry,
        stop: offered.stop,
        targets: offered.targets,
        no_plan_plain: offered.noPlanPlain,
        size: nStr(obj(planSuggested.size).plain) ?? nStr(planSuggested.size_plain),
        rr: nStr(planSuggested.rr_plain)
          ?? (nNum(planSuggested.rr) != null ? `${nNum(planSuggested.rr)!.toFixed(1)} : 1` : null),
        scenarios: adaptScenarioList(planSuggested.scenarios),
      }
    : null;

  const dailyRiskRaw = obj(plan.daily_risk ?? r.daily_risk);

  /* community */
  const sentimentRaw = obj(community.sentiment);
  const splitRaw = obj(sentimentRaw.split);
  const sentiment = Object.keys(sentimentRaw).length
    ? {
        sample: nNum(sentimentRaw.sample) ?? 0,
        split: nNum(splitRaw.bullish) ?? nNum(sentimentRaw.split) ?? 0,
        label: str(sentimentRaw.label, 'mixed'),
      }
    : null;

  const hasPosition = !!position;
  const state = setupModule?.state ?? null;
  const buyAction = findAction(r.actions, 'buy', 'buy_to_open');
  const sellAction = findAction(r.actions, 'sell', 'sell_to_close', 'sell_short');

  return {
    symbol: str(identity.symbol ?? r.symbol, symbol),
    name: nStr(identity.name ?? r.name),
    exchange: nStr(r.exchange),
    quote,
    context_line: contextLine,
    watchlisted,
    candles: adaptCandles(r.candles ?? chart.candles),
    overview: {
      setup_module: setupModule,
      position,
      key_levels: levels,
      what_changed: arr(overview.what_changed).map((x) => str(obj(x).plain ?? obj(x).text ?? x)).filter(Boolean),
      volume_note: nStr(overview.volume_note),
    },
    kai: {
      interpretation: nStr(interp.conclusion_plain)
        ?? nStr(kai.interpretation)
        ?? nStr(obj(r.kai_interpretation).text),
      grade: nStr(kai.grade ?? interp.grade_display) ?? setupModule?.grade_display ?? null,
      last_updated: nStr(interp.last_updated ?? kai.last_updated),
      scenarios: adaptScenarioList(kai.scenarios),
      research_refs: adaptResearchRefs(kai.research_refs ?? obj(r.evidence).news ?? r.news),
    },
    plan: {
      existing_plan_id: nStr(obj(plan.existing_plan).id ?? plan.plan_id)
        ?? (arr(ctx.plans)[0] ? str(obj(arr(ctx.plans)[0]).id ?? arr(ctx.plans)[0]) : null),
      suggested,
      order_state: nStr(obj(plan.order_state).plain),
      daily_risk: Object.keys(dailyRiskRaw).length
        ? { cap: nNum(dailyRiskRaw.cap) ?? 0, used: nNum(dailyRiskRaw.used) ?? 0, remaining: nNum(dailyRiskRaw.remaining) ?? 0 }
        : null,
    },
    community: {
      room_id: nStr(community.room_id ?? identity.room_id),
      thread_summary: nStr(community.thread_summary ?? community.summary_plain),
      sentiment,
      verified_claims: arr(community.verified_claims)
        .map((c) => str(obj(c).plain ?? obj(c).claim ?? c))
        .filter(Boolean),
      message_count: nNum(community.message_count ?? community.count) ?? sentiment?.sample ?? null,
    },
    history: arr(r.history).map((raw, i): WorkspaceHistoryItem => {
      const h = obj(raw);
      return { id: str(h.id, `h${i}`), label: str(h.plain ?? h.label ?? h.text), at: nStr(h.at ?? h.created_at), route: nStr(h.route) };
    }).filter((h) => h.label),
    actions: {
      buy_label: buyAction?.label ?? (hasPosition ? 'Buy more' : 'Buy'),
      sell_label: sellAction?.label ?? 'Sell',
      buy_side: 'buy_to_open',
      sell_side: hasPosition ? 'sell_to_close' : 'sell_short',
      note: nStr(obj(plan.suggested).stop_attaches_plain) && hasPosition
        ? setupNote(state, hasPosition)
        : setupNote(state, hasPosition),
    },
  };
}

/**
 * Fold the round-2 `/setups/:id` detail into the workspace so the setup module,
 * Kai tab and Plan tab are fully populated on the stack that exists today.
 */
export function mergeSetupDetail(w: SymbolWorkspace, d: SetupDetail | null): SymbolWorkspace {
  if (!d) return w;
  const entryNum = d.plan.entry ?? w.overview.key_levels.entry;
  const stopNum = d.plan.stop ?? w.overview.key_levels.invalid;
  const targetNum = d.plan.targets[0]?.price ?? w.overview.key_levels.target;
  const short = d.direction === 'short';

  const setup_module: SetupModule = {
    id: d.id,
    state: d.state,
    state_label: setupModuleHeading(d.state),
    grade_display: d.grade_display,
    distance_label: distanceLabel(w.quote?.price ?? d.quote?.price ?? null, entryNum),
    entry: entryNum != null ? `${short ? '<' : '>'} ${fmt(entryNum)}` : w.overview.setup_module?.entry ?? null,
    target: fmt(targetNum) ?? w.overview.setup_module?.target ?? null,
    invalid: stopNum != null ? `${short ? '>' : '<'} ${fmt(stopNum)}` : w.overview.setup_module?.invalid ?? null,
    primary_action: primaryActionFor(d.state, { symbol: w.symbol, setupId: d.id }),
    note: d.plan.entry_condition ?? d.next_action ?? w.overview.setup_module?.note ?? null,
    following: w.overview.setup_module?.following ?? false,
  };

  return {
    ...w,
    overview: {
      ...w.overview,
      setup_module,
      key_levels: {
        entry: w.overview.key_levels.entry ?? entryNum ?? null,
        target: w.overview.key_levels.target ?? targetNum ?? null,
        invalid: w.overview.key_levels.invalid ?? stopNum ?? null,
        support: w.overview.key_levels.support ?? null,
      },
      what_changed: w.overview.what_changed.length
        ? w.overview.what_changed
        : d.live.narration.map((n) => n.text).slice(0, 3),
    },
    kai: {
      interpretation: w.kai.interpretation ?? d.learn.why_plain ?? null,
      grade: w.kai.grade ?? d.grade_display,
      last_updated: w.kai.last_updated,
      scenarios: w.kai.scenarios.length ? w.kai.scenarios : d.plan.scenarios,
      research_refs: w.kai.research_refs.length
        ? w.kai.research_refs
        : d.learn.evidence.map((e, i) => ({ id: `ev-${i}`, title: e.label, source: e.ok ? 'Confirmed' : 'Not confirmed yet', url: null, published_utc: null })),
    },
    plan: {
      ...w.plan,
      suggested: w.plan.suggested?.scenarios.length
        ? w.plan.suggested
        : {
            entry: entryNum ?? null,
            stop: stopNum ?? null,
            targets: d.plan.targets.map((t) => t.price),
            size: d.plan.size_suggestion ?? null,
            rr: d.plan.risk_reward ?? null,
            scenarios: d.plan.scenarios,
          },
    },
    community: {
      ...w.community,
      room_id: w.community.room_id ?? d.discussion_room_id ?? null,
    },
    actions: {
      ...w.actions,
      note: setupNote(d.state, !!w.overview.position),
    },
  };
}

/* ==================================================================== */
/* Alerts, simplified                                                   */
/* ==================================================================== */

const toneForValue = (v: string | null | undefined): MonitoringRow['value_tone'] => {
  if (!v) return 'neutral';
  if (/^\+/.test(v)) return 'positive';
  if (/^-|^−/.test(v)) return 'risk';
  if (/^\d/.test(v)) return 'market';
  return 'neutral';
};

function attentionFrom(a: AlertRow): AttentionAlert {
  return {
    id: a.id,
    symbol: a.symbol || a.title,
    message: a.detail || a.title,
    grade_change: a.grade_change ?? null,
    age: a.age ?? null,
    quote: a.quote ?? null,
  };
}

function monitoringFrom(a: AlertRow): MonitoringRow {
  const value = a.value ?? a.meta ?? null;
  return {
    id: a.id,
    symbol: a.symbol || '—',
    condition: a.condition_label ? `${a.title}` : a.title,
    value,
    value_tone: toneForValue(value),
    route: `/alert/${encodeURIComponent(a.id)}`,
    quote: a.quote ?? null,
    status: a.status,
  };
}

/**
 * `GET /alerts` → Attention · Monitoring · History.
 * The five internal states collapse to three (audit §6): needs_attention +
 * triggered → attention; watching + active_trades → monitoring (a position's
 * monitoring event is a ROW here, the position itself lives in Trade).
 */
export function adaptAlertsSimple(v: unknown, lifecycleFallback: {
  needs_attention: AlertRow[]; watching: AlertRow[]; active_trades: AlertRow[]; triggered: AlertRow[]; history: AlertRow[]; empty_copy: string;
}): AlertsSimple {
  const r = obj(v);

  const attentionRaw = arr(r.attention);
  const monitoringRaw = arr(r.monitoring);
  const historyRaw = arr(r.history);

  const attention: AttentionAlert[] = attentionRaw.length
    ? attentionRaw.map((raw, i): AttentionAlert => {
        const a = obj(raw);
        const alert = obj(a.alert);
        return {
          id: str(a.id, `att-${i}`),
          symbol: str(a.symbol ?? obj(alert.refs).symbol, '—'),
          // `detail_plain` is the sentence; `headline` is the short label.
          message: str(a.detail_plain ?? a.headline ?? alert.summary_plain, 'Needs a decision'),
          grade_change: nStr(a.grade_change),
          age: nStr(a.age) ?? ago(nStr(a.at)),
          quote: adaptQuoteLoose(a.quote ?? alert.quote),
        };
      })
    : [...lifecycleFallback.needs_attention, ...lifecycleFallback.triggered].map(attentionFrom);

  const monitoring: MonitoringRow[] = monitoringRaw.length
    ? monitoringRaw.map((raw, i): MonitoringRow => {
        const m = obj(raw);
        const value = nStr(m.value_plain ?? m.value);
        return {
          id: str(m.id, `mon-${i}`),
          symbol: str(m.symbol ?? obj(m.refs).symbol, '—'),
          condition: str(m.condition_plain ?? m.condition ?? m.summary_plain ?? m.natural_language, 'Watching'),
          value,
          value_tone: (str(m.value_tone) as MonitoringRow['value_tone']) || toneForValue(value),
          route: nStr(m.route)
            ?? (nStr(m.position_id) ? `/position/${encodeURIComponent(str(m.position_id))}` : null)
            ?? (nStr(m.alert_id) ? `/alert/${encodeURIComponent(str(m.alert_id))}` : null),
          quote: adaptQuoteLoose(m.quote),
          status: (str(m.status) as AlertRow['status']) || undefined,
        };
      })
    : [...lifecycleFallback.watching, ...lifecycleFallback.active_trades].map(monitoringFrom);

  // History rows are `{id, symbol, headline, detail_plain, at, route}` on the
  // wire; the list draws them with the round-2 AlertRow view model.
  const history: AlertRow[] = historyRaw.length
    ? historyRaw.map((raw, i): AlertRow => {
        const h = obj(raw);
        return {
          id: str(h.id, `hist-${i}`),
          symbol: str(h.symbol, ''),
          title: str(h.headline ?? h.detail_plain, 'Finished'),
          detail: nStr(h.detail_plain),
          status: 'resolved',
          value: null,
          meta: ago(nStr(h.at)) || null,
          quote: null,
        };
      })
    : lifecycleFallback.history;

  return {
    attention,
    monitoring,
    history,
    empty_copy: nStr(r.empty_copy) ?? lifecycleFallback.empty_copy,
  };
}

/** "4m ago" from an ISO timestamp; empty when there isn't one. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

export { fmt as formatLevel, numFromLevelString };
export type { Quote };
export { freshnessOf };
