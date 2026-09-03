/**
 * Loading the Alerts feed: every card the user has, in one pass.
 *
 * ONE QUERY PER TABLE, NOT ONE PER CARD. Alerts, setups, plans, working orders,
 * open positions and company profiles are each read once and joined in memory.
 * A tab with twelve cards costs the same number of round trips as a tab with
 * one, and the grouped Polygon snapshot means it costs the same number of
 * market-data requests too.
 *
 * SORTING (spec §1 "Sorting")
 *   Active     required action, then severity, then freshness.
 *   Watching   distance to the condition, then grade, then expiry.
 *   History    most recently resolved first.
 *
 * A card is built for a setup with no alert when the user is FOLLOWING it, and
 * — SWING-1, owner decision — for the alerts the product itself SENT: the live
 * ones on Active, the resolved back catalogue with its result on History. That
 * is still not a scanner dump: an engine candidate nobody was told about
 * belongs on Home, but an alert that went out is by definition the user's.
 */
import {
  type AlertCard,
  type AlertCardState,
  type AlertTab,
  type AppMode,
  type CompanyProfile,
  type MarketQuote,
  type OpenPositionRow,
} from '@shared/api';
import { serviceClient } from '../db';
import { resolveQuotes } from '../market/polygon';
import { getCompanyProfiles } from '../market/profile';
import { loadProfile, loadRiskPolicy, type SetupRow } from '../kai/context';
import { loadOpenPositions } from '../execution/positions-view';
import { loadPaperAccount } from '../execution/engine';
import { levels, isLong } from '../setups';
import { communitySentiment } from '../v5/workspace';
import { loadFollowMarks } from '../v5/attention';
import { buildCard, communityBlock, deriveState, reconcileVersion, NO_COMMUNITY } from './alert-cards';
import { alertIdentity } from './alert-identity';
import { proportionalSlots } from './history-slots';
import { hasAlertVersionColumns } from './schema-probe';

const ALERT_COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at,updated_at';

/**
 * What the alert is about, in order of authority: the `symbol` column 0021
 * added, then the parsed condition, then `refs`. A client hint is never
 * consulted directly — it only ever reached the row through the parse.
 */
function symbolOf(row: Record<string, unknown>): string | null {
  if (typeof row.symbol === 'string' && row.symbol.trim()) return row.symbol.trim().toUpperCase();
  const id = alertIdentity({
    condition: row.condition,
    dataDependency: row.data_dependency,
    refs: (row.refs as { symbol?: string; level?: number } | null) ?? null,
  });
  return id.symbol;
}

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id,discussion_room_id';

/**
 * How many of the sent alerts each tab carries. Active is the live window (a
 * swing pick expires at +5 sessions, so this is naturally small); History is
 * the recent back catalogue, not the whole archive.
 */
const MORNING_ACTIVE_LIMIT = 12;
const MORNING_HISTORY_LIMIT = 25;


export type FeedResult = {
  cards: AlertCard[];
  counts: Record<AlertTab, number>;
  degraded: boolean;
  degraded_reason: string | null;
};

/** Every card the user has, across all three tabs. Filter after, not before. */
export async function loadAlertCards(opts: { userId: string; requestId?: string }): Promise<FeedResult> {
  const db = serviceClient();
  const userId = opts.userId;

  const profile = await loadProfile(userId);
  const mode = profile.primary_mode as AppMode;

  // 0021 adds `alerts.symbol`; read it when it is there so the row itself is
  // the answer, and fall back to parsing the condition when it is not.
  const alertCols = (await hasAlertVersionColumns()) ? `${ALERT_COLUMNS},symbol,lifecycle_state,version,grade_snapshot,score_snapshot` : ALERT_COLUMNS;

  const [alertsRes, positions, plansRes, ordersRes, risk, account] = await Promise.all([
    db.from('alerts').select(alertCols).eq('user_id', userId).order('created_at', { ascending: false }),
    loadOpenPositions({ userId }),
    db
      .from('trade_plans')
      .select('id,symbol,status,setup_id,created_at')
      .eq('user_id', userId)
      .in('status', ['draft', 'planned', 'active'])
      .order('created_at', { ascending: false }),
    db
      .from('orders')
      .select('id,symbol,status,created_at')
      .eq('user_id', userId)
      .in('status', ['submitted', 'accepted', 'partially_filled'])
      .order('created_at', { ascending: false }),
    loadRiskPolicy(userId),
    loadPaperAccount(userId),
  ]);

  const alertRows = (alertsRes.data ?? []) as unknown as Record<string, unknown>[];
  const planRows = (plansRes.data ?? []) as Record<string, unknown>[];
  const orderRows = (ordersRes.data ?? []) as Record<string, unknown>[];

  // Which setups do we need? Everything referenced by an alert, plus everything
  // the user is actually following, plus everything a position came from.
  const marks = await loadFollowMarks(userId, positions.rows);
  const setupIds = new Set<string>();
  for (const a of alertRows) {
    const refs = (a.refs as Record<string, unknown>) ?? {};
    if (typeof refs.setup_id === 'string') setupIds.add(refs.setup_id);
  }
  for (const id of marks.setupIds) setupIds.add(id);
  for (const p of positions.rows) if (p.origin_setup_id) setupIds.add(p.origin_setup_id);
  for (const p of planRows) if (typeof p.setup_id === 'string') setupIds.add(p.setup_id);

  const setupsRes = setupIds.size
    ? await db.from('setups').select(SETUP_COLUMNS).in('id', [...setupIds])
    : { data: [] };
  const setupById = new Map<string, SetupRow>();
  for (const s of ((setupsRes.data ?? []) as unknown as SetupRow[])) setupById.set(s.id, s);

  /*
   * THE MORNING ALERTS — the one exception to "Alerts is the user's own list".
   *
   * Owner decision, SWING-1: the app must POPULATE with what Kai actually
   * called. These are not a scanner dump of everything the engine can see; they
   * are the alerts the product SENT, and the two tabs answer two different
   * questions about them:
   *
   *   Active   what Kai is calling right now, as a full card that stands on its
   *            own — grade, levels, thesis, catalyst, scorecard.
   *   History  the back catalogue with its result attached. This is where the
   *            measured record becomes visible instead of being a claim.
   *
   * Bounded on purpose. A tab is a decision surface, not an archive: the live
   * ones, and the last few weeks of resolved ones, newest first.
   */
  const [liveMorning, resolvedMorning] = await Promise.all([
    db.from('setups').select(SETUP_COLUMNS)
      .eq('mode', 'swing')
      .eq('quote_snapshot->>origin', 'kai_sms_scanner')
      // Owner ruling: shorts are History only. The ingest already makes that
      // structural — a short is written `expired` and can never hold a live
      // state — so this clause is a belt, not the mechanism. Both have to be
      // true for a short to reach Active, and neither is.
      .eq('intent', 'buy_to_open')
      .in('state', ['discovered', 'watching', 'forming', 'ready'])
      .order('valid_until', { ascending: false })
      .limit(MORNING_ACTIVE_LIMIT),
    resolvedMorningByDirection(db),
  ]);
  const morningLive = (liveMorning.data ?? []) as unknown as SetupRow[];
  const morningResolved = resolvedMorning;

  // Symbols we need quotes and profiles for.
  const symbols = new Set<string>();
  for (const a of alertRows) {
    const sym = symbolOf(a);
    if (sym) symbols.add(sym);
  }
  for (const s of setupById.values()) symbols.add(s.symbol);
  for (const p of positions.rows) symbols.add(p.symbol);
  // A live morning card shows the current price against the published trigger,
  // so it needs a quote. A resolved one does not — its story is already told,
  // and asking for 25 more quotes to render a date and a percentage would be
  // spending market data on nothing.
  for (const s of morningLive) symbols.add(s.symbol);

  // A watch typed in plain language names no setup, but the app already has a
  // graded view of that symbol — the same one the ticker page and Home show.
  // Attaching it gives the card its grade, its levels and its scorecard instead
  // of an "ungraded" medallion on a symbol we plainly do grade.
  //
  // IT DOES NOT DRIVE THE LIFECYCLE. A setup the user never followed dying does
  // not invalidate a condition the user wrote for themselves: `deriveState` is
  // only given the setup an alert explicitly REFERENCES. See the loop below.
  const bestSetupBySymbol = new Map<string, SetupRow>();
  if (symbols.size) {
    const live = await db
      .from('setups')
      .select(SETUP_COLUMNS)
      .in('symbol', [...symbols])
      .in('state', ['discovered', 'watching', 'forming', 'ready'])
      .order('score', { ascending: false, nullsFirst: false });
    for (const row of ((live.data ?? []) as unknown as SetupRow[])) {
      const current = bestSetupBySymbol.get(row.symbol);
      // Prefer the user's own mode, then the higher score.
      const better =
        !current ||
        (row.mode === mode && current.mode !== mode) ||
        (row.mode === current.mode && (row.score ?? -1) > (current.score ?? -1));
      if (better) bestSetupBySymbol.set(row.symbol, row);
    }
  }

  const symbolList = [...symbols];
  const profileList = [...new Set([...symbolList, ...morningResolved.map((s) => s.symbol)])];
  const [snap, profiles] = await Promise.all([
    symbolList.length ? resolveQuotes(symbolList, { preferIntraday: true }) : Promise.resolve({ quotes: [], degraded: false, degraded_reason: null }),
    getCompanyProfiles(profileList),
  ]);
  const quoteBy = new Map<string, MarketQuote>();
  for (const q of snap.quotes) quoteBy.set(q.symbol, q);

  const positionBy = new Map<string, OpenPositionRow>();
  for (const p of positions.rows) positionBy.set(p.symbol, p);
  const planBySymbol = new Map<string, string>();
  for (const p of planRows) if (!planBySymbol.has(String(p.symbol))) planBySymbol.set(String(p.symbol), String(p.id));
  const orderBySymbol = new Map<string, string>();
  for (const o of orderRows) if (!orderBySymbol.has(String(o.symbol))) orderBySymbol.set(String(o.symbol), String(o.id));

  const equity = account?.equity ?? null;
  const cards: AlertCard[] = [];
  const seenSymbols = new Set<string>();

  /* ---- cards from alerts --------------------------------------------- */
  for (const row of alertRows) {
    const refs = (row.refs as Record<string, unknown>) ?? {};
    const symbol = symbolOf(row);
    if (!symbol) continue;
    // A draft is a watch the user has not armed. It is not a trade object yet.
    if (String(row.status) === 'draft') continue;

    // Two different setups on purpose (see bestSetupBySymbol above):
    //   linkedSetup  — the one this alert REFERENCES. Only this one may move the
    //                  card to invalidated or closed.
    //   setup        — what the card DISPLAYS: the linked one, or the symbol's
    //                  best live setup when the watch was typed in plain English.
    const linkedSetup = typeof refs.setup_id === 'string' ? (setupById.get(refs.setup_id) ?? null) : null;
    const setup = linkedSetup ?? bestSetupBySymbol.get(symbol) ?? null;
    const quote = quoteBy.get(symbol) ?? fallbackQuote(symbol);
    const position = positionBy.get(symbol) ?? null;
    const planId = planBySymbol.get(symbol) ?? null;
    const orderId = orderBySymbol.get(symbol) ?? null;

    const state = deriveState({
      setup: linkedSetup,
      alertStatus: String(row.status),
      triggered: String(row.status) === 'triggered',
      hasPlan: Boolean(planId),
      hasWorkingOrder: Boolean(orderId),
      position,
      closed: String(row.status) === 'expired' || String(row.status) === 'cancelled',
      entryReached: entryReached(linkedSetup, quote.price),
    });

    const card = await assemble({
      id: `alert:${String(row.id)}`,
      kind: 'alert',
      alertId: String(row.id),
      setup,
      symbol,
      mode,
      userMode: mode,
      quote,
      state,
      risk,
      equity,
      planId,
      orderId,
      position,
      naturalLanguage: (row.natural_language as string) ?? null,
      triggeredAt: String(row.status) === 'triggered' ? ((row.updated_at as string) ?? String(row.created_at)) : null,
      createdAt: String(row.created_at),
      expiresAt: (row.expires_at as string) ?? null,
      row,
      userId,
      requestId: opts.requestId,
      profiles,
      openPositions: positions.rows.length,
    });
    cards.push(card);
    seenSymbols.add(symbol);
  }

  /* ---- cards from followed setups with no alert of their own ---------- */
  for (const setup of setupById.values()) {
    if (seenSymbols.has(setup.symbol)) continue;
    if (!marks.setupIds.has(setup.id) && !marks.symbols.has(setup.symbol)) continue;
    const symbol = setup.symbol;
    const quote = quoteBy.get(symbol) ?? fallbackQuote(symbol);
    const position = positionBy.get(symbol) ?? null;
    const planId = planBySymbol.get(symbol) ?? null;
    const orderId = orderBySymbol.get(symbol) ?? null;

    const state = deriveState({
      setup,
      alertStatus: null,
      triggered: false,
      hasPlan: Boolean(planId),
      hasWorkingOrder: Boolean(orderId),
      position,
      closed: false,
      entryReached: entryReached(setup, quote.price),
    });

    cards.push(
      await assemble({
        id: `setup:${setup.id}`,
        kind: 'setup',
        alertId: null,
        setup,
        symbol,
        mode,
        userMode: mode,
        quote,
        state,
        risk,
        equity,
        planId,
        orderId,
        position,
        naturalLanguage: null,
        triggeredAt: null,
        createdAt: new Date().toISOString(),
        expiresAt: setup.valid_until,
        row: null,
        userId,
        requestId: opts.requestId,
        profiles,
        openPositions: positions.rows.length,
      })
    );
    seenSymbols.add(symbol);
  }

  /* ---- the morning alerts Kai is calling now --------------------------- */
  for (const setup of morningLive) {
    if (seenSymbols.has(setup.symbol)) continue;
    const quote = quoteBy.get(setup.symbol) ?? fallbackQuote(setup.symbol);
    const position = positionBy.get(setup.symbol) ?? null;
    const planId = planBySymbol.get(setup.symbol) ?? null;
    const orderId = orderBySymbol.get(setup.symbol) ?? null;
    cards.push(
      await assemble({
        id: `setup:${setup.id}`,
        kind: 'setup',
        alertId: null,
        setup,
        symbol: setup.symbol,
        mode: setup.mode,
        userMode: mode,
        quote,
        state: deriveState({
          setup,
          alertStatus: null,
          triggered: false,
          hasPlan: Boolean(planId),
          hasWorkingOrder: Boolean(orderId),
          position,
          closed: false,
          entryReached: entryReached(setup, quote.price),
        }),
        risk,
        equity,
        planId,
        orderId,
        position,
        naturalLanguage: null,
        triggeredAt: null,
        createdAt: setupSentAt(setup),
        expiresAt: setup.valid_until,
        row: null,
        userId,
        requestId: opts.requestId,
        profiles,
        openPositions: positions.rows.length,
      })
    );
    seenSymbols.add(setup.symbol);
  }

  /* ---- the back catalogue, with what each one did ---------------------- */
  for (const setup of morningResolved) {
    // A resolved pick is a record, not a claim on a symbol: two calls on the
    // same ticker weeks apart are two different things that happened, so these
    // are keyed by setup and NOT collapsed by symbol the way live cards are.
    const quote = fallbackQuote(setup.symbol);
    cards.push(
      await assemble({
        id: `setup:${setup.id}`,
        kind: 'setup',
        alertId: null,
        setup,
        symbol: setup.symbol,
        mode: setup.mode,
        userMode: mode,
        quote,
        state: setup.state === 'invalidated' ? 'invalidated' : 'closed',
        risk,
        equity,
        planId: null,
        orderId: null,
        position: null,
        naturalLanguage: null,
        triggeredAt: setupSentAt(setup),
        createdAt: setupSentAt(setup),
        resolvedAt: setup.valid_until,
        expiresAt: setup.valid_until,
        row: null,
        userId,
        requestId: opts.requestId,
        profiles,
        openPositions: positions.rows.length,
      })
    );
  }

  /* ---- position events as Active cards (spec §1) ---------------------- */
  for (const p of positions.rows) {
    if (seenSymbols.has(p.symbol)) continue;
    const quote = quoteBy.get(p.symbol) ?? fallbackQuote(p.symbol);
    const setup = p.origin_setup_id ? (setupById.get(p.origin_setup_id) ?? null) : null;
    cards.push(
      await assemble({
        id: `position:${p.id}`,
        kind: 'position',
        alertId: null,
        setup,
        symbol: p.symbol,
        mode: p.mode,
        userMode: mode,
        quote,
        state: 'position_active',
        risk,
        equity,
        planId: p.origin_plan_id,
        orderId: orderBySymbol.get(p.symbol) ?? null,
        position: p,
        naturalLanguage: null,
        triggeredAt: p.opened_at,
        createdAt: p.opened_at,
        expiresAt: null,
        row: null,
        userId,
        requestId: opts.requestId,
        profiles,
        openPositions: positions.rows.length,
      })
    );
    seenSymbols.add(p.symbol);
  }

  const counts: Record<AlertTab, number> = { active: 0, watching: 0, history: 0 };
  for (const c of cards) counts[c.tab] += 1;

  return {
    cards: sortCards(cards),
    counts,
    degraded: snap.degraded || positions.degraded,
    degraded_reason: snap.degraded_reason ?? positions.degraded_reason,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function fallbackQuote(symbol: string): MarketQuote {
  return {
    symbol,
    price: null,
    source_ts: null,
    received_ts: null,
    freshness: 'stale',
    delay_reason: 'feed_gap',
    prev_close: null,
    change: null,
    change_pct: null,
    label_plain: 'No current price for this one.',
    session: 'closed',
  };
}

/**
 * Every family the SMS product has ever sent, in proportion. Two reads per
 * family: a count and a page. The counts are what make the proportion real
 * rather than an assumption about which family fired most recently.
 *
 * NO `mode` FILTER. The intraday families are `day_trade` records — 317 of the
 * 826 picks — and scoping this to `swing` is exactly how they would be imported
 * and then never seen. `origin = kai_sms_scanner` is the correct boundary: it
 * means "an alert this product actually sent".
 */
const HISTORY_FAMILIES = [
  'swing_long', 'swing_short', 'intraday_long', 'intraday_short', 'legacy_long', 'legacy_short',
] as const;

async function resolvedMorningByDirection(db: ReturnType<typeof serviceClient>): Promise<SetupRow[]> {
  const page = (family: string) => db.from('setups').select(SETUP_COLUMNS)
    .eq('quote_snapshot->>origin', 'kai_sms_scanner')
    .in('state', ['expired', 'invalidated'])
    .eq('score_components->>family', family)
    .order('valid_until', { ascending: false })
    .limit(MORNING_HISTORY_LIMIT);

  const count = (family: string) => db.from('setups')
    .select('id', { count: 'exact', head: true })
    .eq('quote_snapshot->>origin', 'kai_sms_scanner')
    .in('state', ['expired', 'invalidated'])
    .eq('score_components->>family', family);

  const [pages, counts] = await Promise.all([
    Promise.all(HISTORY_FAMILIES.map((f) => page(f))),
    Promise.all(HISTORY_FAMILIES.map((f) => count(f))),
  ]);

  const slots = proportionalSlots(counts.map((c) => c.count ?? 0), MORNING_HISTORY_LIMIT);
  const rows = pages.flatMap((p, i) => ((p.data ?? []) as unknown as SetupRow[]).slice(0, slots[i]));
  // Newest first once merged, so the tab still reads chronologically.
  return rows.sort((a, b) => String(b.valid_until ?? '').localeCompare(String(a.valid_until ?? '')));
}

/** When the alert actually went out, off the snapshot the ingest stamped. */
function setupSentAt(setup: SetupRow): string {
  const snap = (setup.quote_snapshot ?? {}) as Record<string, unknown>;
  const ts = snap.source_ts;
  return typeof ts === 'string' && ts ? ts : new Date().toISOString();
}

/** Verified against a real quote, never assumed from the setup's own state. */
function entryReached(setup: SetupRow | null, price: number | null): boolean {
  if (!setup || price === null) return false;
  const { entry } = levels(setup);
  if (entry === null) return false;
  return isLong(setup.intent) ? price >= entry : price <= entry;
}

type AssembleArgs = {
  id: string;
  kind: AlertCard['kind'];
  alertId: string | null;
  setup: SetupRow | null;
  symbol: string;
  /** The mode this card's IDEA belongs to. */
  mode: AppMode;
  /** The mode the USER is in right now. */
  userMode: AppMode;
  quote: MarketQuote;
  state: AlertCardState;
  risk: Awaited<ReturnType<typeof loadRiskPolicy>>;
  equity: number | null;
  planId: string | null;
  orderId: string | null;
  position: OpenPositionRow | null;
  naturalLanguage: string | null;
  triggeredAt: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  expiresAt: string | null;
  row: Record<string, unknown> | null;
  userId: string;
  requestId?: string;
  profiles: Map<string, CompanyProfile>;
  openPositions: number;
};

async function assemble(a: AssembleArgs): Promise<AlertCard> {
  const roomId = (a.setup as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;
  const sentiment = roomId ? await communitySentiment(a.symbol, [roomId]) : null;
  const community = sentiment
    ? communityBlock({
        sampleSize: sentiment.sample,
        commonLevel: null,
        sentiment: sentiment.label,
        verified: null,
        roomId,
      })
    : { ...NO_COMMUNITY, room_id: roomId };

  const card = buildCard({
    id: a.id,
    kind: a.kind,
    alertId: a.alertId,
    setup: a.setup,
    symbol: a.symbol,
    mode: a.setup?.mode ?? a.mode,
    userMode: a.userMode,
    profile: a.profiles.get(a.symbol) ?? null,
    quote: a.quote,
    state: a.state,
    risk: a.risk,
    equity: a.equity,
    planId: a.planId,
    orderId: a.orderId,
    position: a.position,
    naturalLanguage: a.naturalLanguage,
    triggeredAt: a.triggeredAt,
    createdAt: a.createdAt,
    resolvedAt: a.resolvedAt ?? null,
    expiresAt: a.expiresAt,
    community,
    version: 1,
    gradedAt: null,
    history: [],
    openPositionsCount: a.openPositions,
  });

  // Only an alert row has somewhere to keep its versions. The same write turns
  // the row into a real trade object: 0021's `symbol`, `mode`, `setup_id`,
  // `plan_id`, `position_id`, `lifecycle_state`, `trade_plan`, `event` and
  // `chart_context` are all filled in from what the card just computed, so the
  // database row and the card can never disagree about what this alert is.
  if (a.alertId && a.row) {
    const v = await reconcileVersion({
      alertId: a.alertId,
      userId: a.userId,
      row: a.row,
      grade: card.grade,
      components: card.score_components,
      state: card.state,
      symbol: a.symbol,
      mode: card.identity.mode,
      setupId: a.setup?.id ?? null,
      planId: a.planId,
      positionId: a.position?.id ?? null,
      tradePlan: card.trade_plan,
      event: card.event,
      chartContext: {
        symbol: a.symbol,
        timeframe: card.identity.mode === 'day_trade' ? '5m' : '1d',
        setup_id: a.setup?.id ?? null,
        alert_id: a.alertId,
        plan_id: a.planId,
        trigger_ts: a.triggeredAt,
      },
      requestId: a.requestId,
    });
    return { ...card, version: v.version, graded_at: v.graded_at, detail: { ...card.detail, event_history: v.history } };
  }
  return card;
}

/** Spec §1 "Sorting". Each tab reads by the thing that matters in that tab. */
export function sortCards(cards: AlertCard[]): AlertCard[] {
  const SEVERITY: Record<AlertCardState, number> = {
    position_active: 0,
    order_pending: 1,
    entry_reached: 2,
    ready: 3,
    planned: 4,
    invalidated: 5,
    forming: 6,
    watching: 7,
    closed: 8,
  };

  const distance = (c: AlertCard): number => {
    const entry = c.trade_plan.entry;
    const price = c.quote.price;
    if (entry === null || price === null) return Number.POSITIVE_INFINITY;
    return Math.abs(entry - price) / entry;
  };

  const at = (c: AlertCard) => new Date(c.event.triggered_at ?? c.created_at).getTime();

  return [...cards].sort((a, b) => {
    if (a.tab !== b.tab) return 0; // callers filter by tab first; keep stable across tabs
    if (a.tab === 'active') {
      return SEVERITY[a.state] - SEVERITY[b.state] || at(b) - at(a);
    }
    if (a.tab === 'watching') {
      const d = distance(a) - distance(b);
      if (Number.isFinite(d) && d !== 0) return d;
      return (b.grade.score ?? -1) - (a.grade.score ?? -1);
    }
    return at(b) - at(a);
  });
}
