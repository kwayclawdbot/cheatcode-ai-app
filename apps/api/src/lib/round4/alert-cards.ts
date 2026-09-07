/**
 * Alerts as complete trade objects (spec §1–§5, §9).
 *
 * THE IDEA THIS FILE IMPLEMENTS
 * An alert is not a notification with a symbol attached. It is the whole
 * decision: what happened, to which company, how good the setup is, where you
 * would get in, where you would be wrong, what it costs you, what the room
 * thinks, and the ONE thing to do next. The card has to be understandable
 * without opening the chart (spec §2), so everything it needs is assembled
 * here and nothing is left for the client to derive.
 *
 * WHERE A CARD COMES FROM
 * Three sources, one shape:
 *   - an `alerts` row the user armed (usually carrying `refs.setup_id`);
 *   - a `setups` row the user is following that has no alert of its own;
 *   - an open `positions` row, which surfaces as an Active card because a
 *     position event is an actionable event — but management still lives in
 *     Trade (spec §1: "position management remains inside Trade"), so its
 *     primary action routes into the Portal, never into a second position
 *     screen inside Alerts.
 *
 * THE STATE MACHINE (spec §9 "Lifecycle")
 * The card's `state` is NOT `alerts.status`. `status` is about the watch;
 * `state` is about the trade. It is derived, in this order, from the strongest
 * fact available: an open position beats a working order beats a saved plan
 * beats a verified trigger beats the setup's own state. Deriving it means a
 * card cannot drift out of sync with the books — there is no second copy of the
 * truth to go stale.
 *
 * VERSIONING (spec §9 "A later grade change creates a new version")
 * Every card computes a grade fingerprint. When it differs from the snapshot
 * stored on the alert, the version is bumped and the OLD snapshot is pushed
 * onto the history rather than overwritten. The columns for this belong to
 * SCHEMA-4; until they land the same records live in `alerts.refs.round4`,
 * which is user-scoped jsonb that already exists. See `schema-probe.ts`.
 */
import {
  ALERT_LIFECYCLE_STATE,
  ALERT_STATE_ACTION,
  ALERT_STATE_TAB,
  COMMUNITY_LABEL_PLAIN,
  NOT_A_GUARANTEE_PLAIN,
  // A value, not just a type: the row's contracts are validated with it before
  // they reach a card, so a malformed one is dropped rather than drawn.
  AlertOptionContract,
  type AlertScores,
  type AlertCard,
  type AlertCardState,
  type AlertCardOutcome,
  type AlertCommunity,
  type AlertEvent,
  type AlertFit,
  type AlertTradePlan,
  type AppMode,
  type CompanyProfile,
  type FamilyPerformance,
  type GradeMedallion,
  type MarketQuote,
  type OpenPositionRow,
  type PlainAction,
  type Scenario,
  type ScoreComponent,
} from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { isLong, levels, sizeSuggestion, scenarios as setupScenarios } from '../setups';
import type { RiskPolicyRow, SetupRow } from '../kai/context';
import { medallion, gradeFingerprint, scoreComponents, UNGRADED } from './grade';
import { hasAlertEventsTable, hasAlertVersionColumns } from './schema-probe';

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const MODE_LABEL: Record<AppMode, string> = {
  day_trade: 'Day Trade',
  swing: 'Swing',
  invest: 'Invest',
};

const STATE_LABEL: Record<AlertCardState, string> = {
  watching: 'Watching',
  forming: 'Forming',
  ready: 'Ready',
  entry_reached: 'Entry reached',
  planned: 'Planned',
  order_pending: 'Order pending',
  position_active: 'Position active',
  invalidated: 'Invalidated',
  closed: 'Closed',
};

const EXPECTED_HOLD: Record<AppMode, string> = {
  day_trade: 'Intraday — out by the close',
  swing: 'Days to a few weeks',
  invest: 'Months to years',
};

function directionLabel(intent: string): { direction: string; plain: string } {
  switch (intent) {
    case 'buy_to_open':
      return { direction: 'long', plain: 'Long — you make money if it goes up.' };
    case 'sell_short':
      return { direction: 'short', plain: 'Short — you make money if it goes down.' };
    case 'sell_to_close':
      return { direction: 'reduce', plain: 'Reduce — this is about getting out, not in.' };
    case 'buy_to_cover':
      return { direction: 'cover', plain: 'Cover — this closes a short.' };
    default:
      return { direction: intent, plain: intent };
  }
}

function act(action: string, label: string, route: string | null, primary = false, enabled = true, hint: string | null = null): PlainAction {
  return { action, label, route, primary, enabled, hint };
}

/* ------------------------------------------------------------------ */
/* State derivation (spec §9)                                          */
/* ------------------------------------------------------------------ */

export type CardFacts = {
  setup: SetupRow | null;
  alertStatus: string | null;
  /** A verified trigger event — the ONLY thing that moves Watching → Active. */
  triggered: boolean;
  hasPlan: boolean;
  hasWorkingOrder: boolean;
  position: OpenPositionRow | null;
  closed: boolean;
  /** Price has reached the entry level, verified against a real quote. */
  entryReached: boolean;
};

/**
 * Strongest fact wins. Read top to bottom: this is the lifecycle table from
 * spec §9 written as code, and the order is the rule.
 */
export function deriveState(f: CardFacts): AlertCardState {
  if (f.position) return 'position_active';
  if (f.hasWorkingOrder) return 'order_pending';
  if (f.closed) return 'closed';
  const setupState = f.setup?.state ?? null;
  if (setupState === 'invalidated') return 'invalidated';
  if (setupState === 'expired') return 'closed';
  if (f.alertStatus === 'expired' || f.alertStatus === 'cancelled') return 'closed';
  if (f.hasPlan) return 'planned';
  if (f.triggered || f.entryReached) return 'entry_reached';
  if (setupState === 'ready') return 'ready';
  if (setupState === 'forming') return 'forming';
  return 'watching';
}

/* ------------------------------------------------------------------ */
/* Versioned grade snapshots                                            */
/* ------------------------------------------------------------------ */

export type VersionState = {
  version: number;
  graded_at: string | null;
  history: AlertEvent[];
};

type StoredRound4 = {
  version?: number;
  grade_snapshot?: GradeMedallion & { graded_at?: string };
  score_snapshot?: ScoreComponent[];
  graded_at?: string;
  history?: AlertEvent[];
  state?: AlertCardState;
};

/**
 * Where the version state lives. 0021 gives `alerts` real columns for it
 * (`version`, `grade_snapshot`, `score_snapshot`, `lifecycle_state`) and an
 * append-only `alert_events` table for the timeline. Before that migration the
 * same records live in `alerts.refs.round4`, which is user-scoped jsonb that
 * already exists — so versioning works on either schema and a mid-flight
 * migration cannot lose an alert's history.
 */
function storedFrom(row: Record<string, unknown>, hasColumns: boolean): StoredRound4 {
  if (hasColumns && row.grade_snapshot) {
    const snap = row.grade_snapshot as GradeMedallion & { graded_at?: string };
    return {
      version: Number(row.version ?? 1),
      grade_snapshot: snap,
      score_snapshot: (row.score_snapshot as ScoreComponent[]) ?? undefined,
      graded_at: snap.graded_at,
      state: LIFECYCLE_TO_CARD[String(row.lifecycle_state ?? '')] ?? undefined,
    };
  }
  const refs = (row.refs as Record<string, unknown>) ?? {};
  return ((refs.round4 as StoredRound4) ?? {}) as StoredRound4;
}

/** 0021's smaller vocabulary, read back into the card's. */
const LIFECYCLE_TO_CARD: Record<string, AlertCardState> = {
  watching: 'watching',
  active: 'ready',
  planned: 'planned',
  order_pending: 'order_pending',
  position_active: 'position_active',
  invalidated: 'invalidated',
  closed: 'closed',
  expired: 'closed',
  dismissed: 'closed',
  cancelled: 'closed',
  missed: 'closed',
};

/** The alert's timeline, newest last. Empty when 0021 has not landed. */
async function loadEvents(alertId: string): Promise<AlertEvent[]> {
  if (!(await hasAlertEventsTable())) return [];
  try {
    const { data } = await serviceClient()
      .from('alert_events')
      .select('seq,type,from_state,to_state,source,version,payload,created_at')
      .eq('alert_id', alertId)
      .order('seq', { ascending: true })
      .limit(50);
    return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      at: String(e.created_at),
      from_state: (LIFECYCLE_TO_CARD[String(e.from_state ?? '')] ?? null) as AlertCardState | null,
      to_state: LIFECYCLE_TO_CARD[String(e.to_state ?? '')] ?? 'watching',
      source: String(e.source ?? 'system'),
      plain: String(((e.payload as Record<string, unknown>) ?? {}).plain ?? String(e.type)),
    }));
  } catch {
    return [];
  }
}

async function appendEvent(
  alertId: string,
  e: { type: string; from: AlertCardState | null; to: AlertCardState; source: string; version: number; plain: string }
): Promise<void> {
  if (!(await hasAlertEventsTable())) return;
  try {
    await serviceClient().from('alert_events').insert({
      alert_id: alertId,
      seq: 0, // the trigger assigns it under a lock on the parent row
      type: e.type,
      from_state: e.from ? ALERT_LIFECYCLE_STATE[e.from] : null,
      to_state: ALERT_LIFECYCLE_STATE[e.to],
      source: e.source,
      version: e.version,
      payload: { plain: e.plain },
    });
  } catch {
    /* a missed timeline row must never fail a read */
  }
}

/**
 * Persist the version + snapshot when the grade or the state has moved.
 *
 * A grade change makes a NEW version and writes a `graded` event; the previous
 * snapshot is not overwritten in the timeline, only on the row (spec §9:
 * "a later grade change creates a new version rather than rewriting history").
 * A state change writes a `state_change` event and does NOT bump the version —
 * the version is about the GRADE, which is the thing a user could otherwise be
 * shown a silently edited copy of.
 */
export async function reconcileVersion(opts: {
  alertId: string;
  userId: string;
  row: Record<string, unknown>;
  grade: GradeMedallion;
  components: ScoreComponent[];
  state: AlertCardState;
  symbol?: string;
  mode?: AppMode;
  setupId?: string | null;
  planId?: string | null;
  positionId?: string | null;
  tradePlan?: unknown;
  event?: unknown;
  chartContext?: unknown;
  requestId?: string;
}): Promise<VersionState> {
  const hasCols = await hasAlertVersionColumns();
  const stored = storedFrom(opts.row, hasCols);
  const now = new Date().toISOString();

  const previousGrade = stored.grade_snapshot ?? null;
  const first = previousGrade === null;
  const gradeMoved = previousGrade !== null && gradeFingerprint(previousGrade) !== gradeFingerprint(opts.grade);
  const stateMoved = stored.state !== undefined && stored.state !== opts.state;

  const version = (stored.version ?? 0) + (gradeMoved || first ? 1 : 0);
  const gradedAt = gradeMoved || first ? now : (stored.graded_at ?? now);

  if (!gradeMoved && !first && !stateMoved) {
    return { version: stored.version ?? 1, graded_at: stored.graded_at ?? null, history: await loadEvents(opts.alertId) };
  }

  try {
    const db = serviceClient();
    const refsBase = ((opts.row.refs as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const round4: StoredRound4 = {
      version,
      grade_snapshot: { ...opts.grade, graded_at: gradedAt },
      score_snapshot: opts.components,
      graded_at: gradedAt,
      state: opts.state,
    };
    const patch: Record<string, unknown> = { refs: { ...refsBase, round4 } };

    if (hasCols) {
      patch.version = version;
      patch.grade_snapshot = { ...opts.grade, graded_at: gradedAt };
      patch.score_snapshot = opts.components;
      patch.lifecycle_state = ALERT_LIFECYCLE_STATE[opts.state];
      if (stateMoved || first) patch.state_changed_at = now;
      // `tab` is a GENERATED column — never written, only read.
      if (opts.symbol) patch.symbol = opts.symbol;
      if (opts.mode) patch.mode = opts.mode;
      if (opts.setupId !== undefined) patch.setup_id = opts.setupId;
      if (opts.planId !== undefined) patch.plan_id = opts.planId;
      if (opts.positionId !== undefined) patch.position_id = opts.positionId;
      if (opts.tradePlan !== undefined) patch.trade_plan = opts.tradePlan;
      if (opts.event !== undefined) patch.event = opts.event;
      if (opts.chartContext !== undefined) patch.chart_context = opts.chartContext;
    }

    await db.from('alerts').update(patch).eq('id', opts.alertId).eq('user_id', opts.userId);
  } catch (e) {
    // A snapshot we could not store is not a reason to fail the read. The card
    // still renders; it just has not learned its new version yet.
    log('warn', opts.requestId ?? '-', 'alert_card.version_store_failed', {
      alert_id: opts.alertId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (first) {
    await appendEvent(opts.alertId, {
      type: 'graded',
      from: null,
      to: opts.state,
      source: 'system',
      version,
      plain: `Graded ${opts.grade.display ?? 'ungraded'}${opts.grade.score === null ? '' : ` (${opts.grade.score} out of 100)`}. This is version ${version}.`,
    });
  } else if (gradeMoved) {
    await appendEvent(opts.alertId, {
      type: 'graded',
      from: stored.state ?? null,
      to: opts.state,
      source: 'system',
      version,
      plain:
        previousGrade?.display === opts.grade.display
          ? `The grade is still ${opts.grade.display ?? 'ungraded'}, but the score behind it moved from ${previousGrade?.score ?? '—'} to ${opts.grade.score ?? '—'}. Version ${version}; the earlier one is kept.`
          : `The grade moved from ${previousGrade?.display ?? 'ungraded'} to ${opts.grade.display ?? 'ungraded'}. Version ${version}; the earlier one is kept.`,
    });
  }
  if (stateMoved) {
    await appendEvent(opts.alertId, {
      type: 'state_change',
      from: stored.state ?? null,
      to: opts.state,
      source: 'market',
      version,
      plain: `${STATE_LABEL[stored.state as AlertCardState] ?? 'This'} became ${STATE_LABEL[opts.state]}.`,
    });
  }

  return { version, graded_at: gradedAt, history: await loadEvents(opts.alertId) };
}

/* ------------------------------------------------------------------ */
/* Card assembly                                                        */
/* ------------------------------------------------------------------ */

export type BuildCardInput = {
  id: string;
  kind: AlertCard['kind'];
  alertId: string | null;
  setup: SetupRow | null;
  symbol: string;
  /** The SETUP's mode — what kind of idea this is. */
  mode: AppMode;
  /** The mode the USER is in. The two differing is a real conflict on the card. */
  userMode: AppMode;
  profile: CompanyProfile | null;
  quote: MarketQuote;
  state: AlertCardState;
  risk: RiskPolicyRow | null;
  equity: number | null;
  planId: string | null;
  orderId: string | null;
  position: OpenPositionRow | null;
  naturalLanguage: string | null;
  triggeredAt: string | null;
  createdAt: string;
  /** When it finished, for a History row. Falls back to the trigger, then creation. */
  resolvedAt?: string | null;
  expiresAt: string | null;
  community: AlertCommunity;
  version: number;
  gradedAt: string | null;
  history: AlertEvent[];
  news?: { label: string; at: string | null; url: string | null }[];
  openPositionsCount?: number;
};

function whenPlain(at: string | null): string {
  if (!at) return 'no timestamp on this one';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'no timestamp on this one';
  return `${d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} ET`;
}

/** The ET date the alert actually went out, off the snapshot the engine stamped. */
function sentOn(setup: SetupRow): string | null {
  const snap = (setup.quote_snapshot ?? {}) as Record<string, unknown>;
  const iso = typeof snap.et_date === 'string' ? snap.et_date : null;
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function headlineFor(input: BuildCardInput): { headline: string; what_changed: string } {
  const s = input.symbol;
  const setup = input.setup;
  const lv = setup ? levels(setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
  const price = input.quote.price;

  switch (input.state) {
    case 'position_active':
      return {
        headline: `${s} — you are in this one`,
        what_changed: input.position
          ? `${input.position.direction === 'long' ? 'Long' : 'Short'} ${input.position.qty} from $${input.position.avg_cost}. ${input.position.plain}`
          : 'A position is open on this symbol.',
      };
    case 'order_pending':
      return {
        headline: `${s} — an order is working`,
        what_changed: 'The order is with the paper book and has not filled. Accepted is not filled.',
      };
    case 'planned':
      return {
        headline: `${s} — the plan is written down`,
        what_changed: 'Entry, exit and size are decided. Nothing has been sent anywhere.',
      };
    case 'entry_reached':
      return {
        headline: lv.entry !== null ? `${s} reached $${lv.entry}` : `${s} hit the level you were watching`,
        what_changed:
          lv.entry !== null && price !== null
            ? `Last print $${price} against a trigger of $${lv.entry}. This is the moment you asked to be told about.`
            : input.naturalLanguage ?? 'The condition you set has happened.',
      };
    case 'ready':
      return {
        headline: `${s} — every condition is met`,
        what_changed: setup?.thesis_plain ?? 'Everything I defined for this one has happened. It is your move now.',
      };
    case 'forming':
      return {
        headline: `${s} — confirmation is building`,
        what_changed: 'The shape is there and the confirmation I want has not arrived yet.',
      };
    case 'invalidated':
      return {
        headline: `${s} — this one is off`,
        what_changed:
          lv.stop !== null
            ? `The level the whole idea leaned on, $${lv.stop}, gave way. I have dropped it.`
            : 'The level the idea depended on gave way.',
      };
    case 'closed': {
      // A History row exists to say WHAT WAS CALLED and what it did. Where the
      // setup still carries the call — the published trigger and the reason —
      // say that, because "this is here for the record" is not a record.
      const called = lv.entry !== null ? `Called at $${lv.entry}` : 'Called';
      const when = setup ? sentOn(setup) : null;
      const why = setup?.thesis_technical ?? setup?.thesis_plain ?? null;
      return {
        headline: `${s} — finished`,
        what_changed: setup
          ? `${called}${when ? ` on ${when}` : ''}${why ? `. ${why}` : '.'}`
          : 'This is here for the record, with the original alert and what happened to it.',
      };
    }
    default:
      return {
        headline: input.naturalLanguage ? `${s} — ${input.naturalLanguage}` : `${s} — I am watching this`,
        what_changed:
          lv.entry !== null && price !== null
            ? `Last print $${price}. I am waiting for $${lv.entry}.`
            : 'Nothing has triggered yet. This is a complete idea waiting on its condition.',
      };
  }
}

function tradePlanFor(input: BuildCardInput): AlertTradePlan {
  const setup = input.setup;
  const lv = setup ? levels(setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
  const long = setup ? isLong(setup.intent) : true;
  const dir = directionLabel(setup?.intent ?? 'buy_to_open');
  const size = setup ? sizeSuggestion(setup, input.risk, input.equity) : null;

  return {
    direction: dir.direction,
    direction_plain: dir.plain,
    entry: lv.entry,
    entry_condition_plain:
      lv.entry === null
        ? 'No entry level is defined on this one yet.'
        : // "The condition has been met" is a claim about PRICE, so it is checked
          // against the quote rather than against the setup's own state label.
          // A row that says `ready` while the last print is $30 below the trigger
          // would otherwise put a false confirmation on the card.
          `${long ? 'Above' : 'Below'} $${lv.entry}${
            input.quote.price !== null && (long ? input.quote.price >= lv.entry : input.quote.price <= lv.entry)
              ? ' — reached'
              : ''
          }.`,
    stop: lv.stop,
    invalidation_plain:
      lv.stop === null
        ? 'There is no invalidation level on this one, which is why I will not size it.'
        : `It is wrong ${long ? 'below' : 'above'} $${lv.stop}. That is where the idea stops being an idea.`,
    targets: lv.targets,
    rr: lv.rr,
    rr_plain:
      lv.rr === null
        ? 'I cannot work out reward against risk without both an entry and an invalidation.'
        : `${lv.rr} to 1 — you stand to make ${lv.rr} times what you would lose if the level fails.`,
    expected_hold: EXPECTED_HOLD[input.mode],
    expires_at: input.expiresAt ?? setup?.valid_until ?? null,
    expires_plain:
      input.expiresAt ?? setup?.valid_until
        ? `Stale after ${whenPlain(input.expiresAt ?? setup?.valid_until ?? null)}.`
        : 'No expiry set on this one.',
    size,
  };
}

/**
 * What the user already holds in this name, as a share of the account. Marked
 * at the last print when there is one, at cost when there is not — and the copy
 * says which, because "12% of the account" computed off a stale mark is a
 * different sentence from one computed off a live one.
 */
function concentrationPlain(input: BuildCardInput): string | null {
  const p = input.position;
  if (!p || !input.equity) return null;
  const mark = p.mark_price ?? p.avg_cost;
  const value = Math.round(mark * p.qty * 100) / 100;
  const pct = Math.round((value / input.equity) * 100);
  return `You already hold $${value} of ${input.symbol}, about ${pct}% of the account, marked ${p.mark_price === null ? 'at cost because there is no current price' : `at the last ${p.mark_freshness} print`}.`;
}

function fitFor(input: BuildCardInput, plan: AlertTradePlan): AlertFit {
  const conflicts: string[] = [];
  const cap = input.risk?.daily_loss_cap_usd ?? null;
  const maxOpen = input.risk?.max_open_positions ?? null;
  const minRr = input.risk?.min_reward_risk ?? null;
  const risk = plan.size?.max_loss_usd ?? null;

  const fitsCap = risk === null || cap === null ? null : risk <= cap;
  if (fitsCap === false) conflicts.push(`This would risk $${risk}, and your daily limit is $${cap}.`);
  if (minRr !== null && plan.rr !== null && plan.rr < minRr) {
    conflicts.push(`Reward against risk is ${plan.rr} to 1 and your rule asks for ${minRr} to 1.`);
  }
  if (maxOpen !== null && (input.openPositionsCount ?? 0) >= maxOpen) {
    conflicts.push(`You already have ${input.openPositionsCount} positions open and your limit is ${maxOpen}.`);
  }
  if (input.mode !== input.userMode) {
    conflicts.push(
      `This is a ${MODE_LABEL[input.mode]} idea and you are in ${MODE_LABEL[input.userMode]} mode.`
    );
  }
  // A size of zero is the single most important thing on this card and it must
  // never read as "inside your rules". `sizeSuggestion` already writes the
  // reason in plain English — one share risking more than the whole daily cap,
  // or a reward:risk below the user's minimum — so it is quoted verbatim rather
  // than re-summarised into something vaguer.
  if (plan.size && (plan.size.shares === null || plan.size.shares < 1 || !plan.size.within_policy)) {
    conflicts.push(plan.size.plain);
  }

  return {
    est_risk_usd: risk,
    fits_cap: fitsCap,
    concentration_plain: concentrationPlain(input),
    conflicts,
    plain:
      risk === null
        ? 'I cannot size this one, so I cannot tell you what it would cost you.'
        : conflicts.length
          ? conflicts[0]
          : `About $${risk} at risk on ${plan.size?.shares ?? 0} share${plan.size?.shares === 1 ? '' : 's'} — inside your rules.`,
  };
}

function interpretationFor(input: BuildCardInput, plan: AlertTradePlan): string {
  const setup = input.setup;
  if (!setup) {
    return input.state === 'position_active'
      ? 'This is a live position, so the decision now is whether the reason you took it still holds.'
      : 'I am watching the condition you wrote. I have no graded setup behind it, so I have no view of my own to add.';
  }
  const why = setup.thesis_plain ?? `${input.symbol} is on my list.`;
  // The scanner's thesis usually already names both levels. Repeating them
  // produces "It fails below $537.27. … It fails at $537.27." on the card, which
  // reads as a machine talking to itself — so each sentence is added only when
  // its number is not already in the thesis.
  const mentions = (n: number | null) => n !== null && why.includes(String(n));
  const parts = [why];
  if (plan.entry === null) parts.push('There is no trigger level on this one yet.');
  else if (!mentions(plan.entry)) {
    parts.push(`It is confirmed ${plan.direction === 'short' ? 'below' : 'above'} $${plan.entry}.`);
  }
  if (plan.stop === null) parts.push('There is no invalidation level yet.');
  else if (!mentions(plan.stop)) parts.push(`It fails at $${plan.stop}.`);
  return parts.join(' ');
}

function scenariosFor(input: BuildCardInput, plan: AlertTradePlan): Scenario[] {
  if (!input.setup || !plan.size) return [];
  return setupScenarios(input.setup, plan.size);
}

function primaryActionFor(input: BuildCardInput): { primary: PlainAction; secondary: PlainAction[] } {
  const s = input.symbol;
  const spec = ALERT_STATE_ACTION[input.state];
  const alertParam = input.alertId ? `?alert=${input.alertId}&ctx=alert` : '?ctx=kai';

  // Every primary action routes into the Trade Portal (spec §6: "There is no
  // generic alert-detail screen"). The context differs, the destination does not.
  const routeByState: Record<AlertCardState, string> = {
    watching: `/trade/${s}${alertParam}`,
    forming: `/trade/${s}${alertParam}`,
    ready: `/trade/${s}${input.alertId ? `?alert=${input.alertId}&ctx=alert` : '?ctx=plan'}`,
    entry_reached: `/trade/${s}${alertParam}`,
    planned: `/trade/${s}${input.planId ? `?plan=${input.planId}&ctx=plan` : '?ctx=plan'}`,
    order_pending: `/trade/${s}${input.orderId ? `?order=${input.orderId}&ctx=plan` : '?ctx=plan'}`,
    position_active: `/trade/${s}${input.position ? `?position=${input.position.id}&ctx=plan` : '?ctx=plan'}`,
    invalidated: `/trade/${s}${alertParam}`,
    closed: input.position ? `/position/${input.position.id}` : `/trade/${s}${alertParam}`,
  };

  const primary = act(spec.action, spec.label, routeByState[input.state], true, true, spec.destination);

  const secondary: PlainAction[] = [act('ask_kai', 'Ask Kai', null)];
  if (input.setup) secondary.push(act('open_symbol', `Open ${s}`, `/symbol/${s}`));
  if (input.alertId && (input.state === 'watching' || input.state === 'forming')) {
    secondary.push(act('pause', 'Pause this watch', null));
  }
  if (input.community.room_id) secondary.push(act('open_room', 'Open the discussion', `/room/${input.community.room_id}`));

  return { primary, secondary };
}

/**
 * The family's real record, stamped onto the setup by whatever produced it
 * (SWING-1's ingest writes it into `score_components.family_performance`, the
 * same jsonb `seed` and `source` already live in).
 *
 * It is read, never computed here: this is a card builder, and a win rate the
 * card invented at render time would be a different number every request. An
 * engine with no graded record yet returns null and the card shows no line —
 * absence is the honest answer, a zero would not be.
 */
export function familyPerformanceOf(setup: { score_components?: unknown } | null): FamilyPerformance | null {
  const raw = (setup?.score_components as Record<string, unknown> | null | undefined)?.family_performance;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const n = Number(o.n);
  const wins = Number(o.wins);
  const win_pct = Number(o.win_pct);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(wins) || !Number.isFinite(win_pct)) return null;
  return {
    family: String(o.family ?? 'This family'),
    n,
    wins,
    win_pct,
    horizon: String(o.horizon ?? ''),
    as_of: typeof o.as_of === 'string' && o.as_of ? o.as_of : null,
    plain: String(o.plain ?? ''),
  };
}

/**
 * What this one alert actually did, read off the setup the engine graded.
 *
 * Only on a resolved card, and only where the engine recorded a result. A live
 * alert has no outcome, and one whose window closed unmeasured has none either
 * — both come back null and the row stays silent rather than printing a zero.
 *
 * The tone is the SIGN, never the size. Five picks in the source corpus carry
 * impossible returns from an `alert_price` captured against unadjusted bars; a
 * sign survives that and a magnitude does not, so the number is shown as the
 * engine recorded it and the colour is decided by the sign alone.
 */
/**
 * The columns migration 0041 added, as much of `SetupRow` as this file needs.
 * Everything optional: a caller that selected an older column list carries none
 * of them, and that has to read as "not measured" rather than as an error.
 */
type TrackedSetup = {
  score_components?: unknown;
  intent?: string;
  peak_price?: number | null;
  peak_gain_pct?: number | null;
  high_basis?: string | null;
  low_basis?: string | null;
  contract_cost?: number | null;
  contract_peak?: number | null;
  contract_peak_multiple?: number | null;
  contract_expiry_value?: number | null;
};

/** A price the way the History row wants to read it. Two decimals always —
 *  "$27.9" beside "$28.65" looks like a different kind of number. */
function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * A number, or null — and NULL AND ZERO ARE NOT THE SAME THING HERE.
 *
 * `Number(null)` is `0` and `Number.isFinite(0)` is `true`, so the obvious
 * `Number.isFinite(Number(x))` test says "yes, measured" for every column that
 * has not been written yet. It did exactly that: before this existed, every
 * scored History row printed "expired $0.00" because its ungraded
 * `contract_expiry_value` came through as a real zero.
 *
 * The distinction matters most for the one value that can HONESTLY be zero: an
 * option that expired worthless is worth $0.00, and that is a fact worth
 * printing. It must not be indistinguishable from one nobody has graded.
 */
function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The clauses of the muted line, minus the ones that had nothing to say. */
function joinBasis(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

/**
 * The peak the tracker actually watched, as a price.
 *
 * `peak_price` is generated by the database from the direction on the row, so
 * the only thing left to decide here is what to CALL it — and on a short the
 * favourable extreme is the low, which is why the label differs. The basis
 * comes from whichever raw extreme fed the generated column, for the same
 * reason: a short's peak is its low, so a short's peak basis is `low_basis`.
 */
function trackedPeakOf(
  setup: TrackedSetup | null
): { price: string; label: string; note: string; gain: number | null } | null {
  if (!setup) return null;
  const p = Number(setup.peak_price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const short = setup.intent === 'sell_short' || setup.intent === 'buy_to_cover';
  const basis = short ? setup.low_basis : setup.high_basis;
  const gain = Number(setup.peak_gain_pct);
  return {
    price: money(p),
    label: short ? 'Stock low' : 'Peak',
    // Said out loud because the two are not the same claim. A daily-bar high is
    // a real high dated to a session; a session high was seen within about five
    // minutes of happening. Neither is a lie and only one is tick-level.
    note: basis === 'daily_bar' ? 'peak from daily bars' : 'peak seen live',
    gain: Number.isFinite(gain) ? gain : null,
  };
}

/**
 * The contract's own story, for a day trade that named one — the owner's line:
 * "peak $27.91 · expired $28.65".
 *
 * These are the OPTION's prices, never the underlying's, and the wording says
 * "contract" so the two can never be read as the same number. Null until the
 * expiry has actually been graded; a contract still running has no expired
 * value and gets no invented one.
 */
function contractLine(setup: TrackedSetup | null): string | null {
  if (!setup) return null;
  const peak = Number(setup.contract_peak);
  const expired = Number(setup.contract_expiry_value);
  const hasPeak = Number.isFinite(peak) && peak > 0;
  const hasExpired = Number.isFinite(expired);
  if (!hasPeak && !hasExpired) return null;

  const mult = Number(setup.contract_peak_multiple);
  const peakPart = hasPeak
    ? `contract peak ${money(peak)}${Number.isFinite(mult) && mult > 0 ? ` (${mult.toFixed(1)}x cost)` : ''}`
    : null;
  const expiredPart = hasExpired ? `expired ${money(expired)}` : null;
  return joinBasis([peakPart, expiredPart]);
}

/**
 * A row the engine never graded but that WAS measured — the four
 * unusual-options replays once their contracts are graded, and any future fire
 * in a family the scorer does not score.
 *
 * `value` stays NULL on purpose. The result cell is for a GRADE, and no grade
 * exists here; the History row only draws that cell when a value is present, so
 * absence is preserved exactly as ae5ff2f asserted it. What is added is the one
 * thing that IS now known — what it reached — and the muted line saying that no
 * result was graded, so a peak with no result beside it cannot be misread as a
 * result.
 */
function measuredOnly(
  setup: TrackedSetup | null,
  tracked: ReturnType<typeof trackedPeakOf>,
  contract: string | null
): AlertCardOutcome {
  return {
    label: 'While it ran',
    value: null,
    tone: 'neutral',
    plain:
      'Nobody graded this one. These are the prices it actually reached while it was live, and nothing else is claimed about it.',
    peak: tracked ? tracked.price : null,
    peak_label: tracked ? tracked.label : null,
    basis: joinBasis([tracked ? tracked.note : null, contract, 'no result was graded']),
  };
}

export function outcomeOf(
  setup: TrackedSetup | null,
  state: AlertCardState,
): AlertCardOutcome | null {
  if (state !== 'closed' && state !== 'invalidated') return null;

  /**
   * THE PEAK IS NOW A PRICE, where one was actually watched.
   *
   * `peak_price` is a GENERATED column (0041): the database already chose the
   * high or the low from the direction on the row, so there is nothing to
   * negate here and no second chance to get the frame wrong. It is read, never
   * computed — which is the entire reason it is generated.
   *
   * `tracked` is built BEFORE the engine outcome is looked at, because the two
   * are independent. A row can have a measured peak and no grade (the four
   * unusual-options replays, which the engine never scored), a grade and no
   * peak (everything called before tracking existed), or both.
   */
  const tracked = trackedPeakOf(setup);

  const raw = (setup?.score_components as Record<string, unknown> | null | undefined)?.outcome;
  const hasEngineOutcome =
    !!raw && typeof raw === 'object' &&
    ((raw as Record<string, unknown>).win_5d === true ||
      (raw as Record<string, unknown>).win_5d === false);

  // Neither a grade, nor a watched peak, nor a graded contract: nothing was
  // measured, so nothing is shown. The row stays silent, exactly as it did
  // before this function learned about prices — absent is still absent.
  if (!hasEngineOutcome) {
    const contract = contractLine(setup);
    if (!tracked && !contract) return null;
    return measuredOnly(setup, tracked, contract);
  }

  const o = raw as Record<string, unknown>;
  const gain = Number(o.gain_5d_pct);
  const won = o.win_5d === true;
  const short = setup?.intent === 'sell_short';

  // `gain_5d_pct` is the POSITION's return, already sign-corrected for direction
  // by `alert_outcomes.py`. Printing it raw on a short would read as the stock
  // going UP when the short worked, so a short row shows the PRICE move and the
  // colour still comes from whether the call was right.
  const shown = short ? -gain : gain;

  /**
   * The best it ever got — `mfe_5d_pct`, which `alert_outcomes.py` writes as
   * the POSITION's maximum favourable excursion off intraday highs and lows,
   * clamped at or above zero and already sign-corrected for direction.
   *
   * It is put into the same frame as `value` before it is shown. On a long that
   * is the number as stored. On a short `value` is the STOCK's move by
   * deliberate decision above, so the peak is the stock's intraday LOW and is
   * negated to match — a row carrying "+2.2%" as the result and "+7.4%" as the
   * peak would be two numbers in opposite frames, and the reader has no way to
   * tell. It is only drawn where the excursion was actually measured; a peak
   * nobody computed stays null and the cell is absent.
   */
  const mfe = Number(o.mfe_5d_pct);
  const hasPeak = Number.isFinite(mfe);
  const peakShown = short ? -mfe : mfe;

  return {
    label: short ? 'Five sessions on, the stock' : 'Five sessions on, close to close',
    value: Number.isFinite(shown)
      ? `${shown > 0 ? '+' : ''}${shown.toFixed(1)}%`
      : (short ? (won ? 'Lower' : 'Higher') : (won ? 'Higher' : 'Lower')),
    tone: won ? 'good' : 'bad',
    plain: typeof o.plain === 'string' && o.plain
      ? o.plain
      : `Five sessions on, this closed ${won ? 'higher' : 'lower'} than the price it was called at.`,
    // A WATCHED PRICE BEATS A REMEMBERED PERCENTAGE. Where the tracker actually
    // followed this call, the peak is the price it reached — which is what the
    // owner asked for and what a member would have seen on their screen. Where
    // it did not (every call made before tracking existed), the engine's
    // `mfe_5d_pct` still answers, exactly as it did before.
    peak: tracked ? tracked.price : hasPeak ? `${peakShown > 0 ? '+' : ''}${peakShown.toFixed(1)}%` : null,
    peak_label: tracked ? tracked.label : hasPeak ? (short ? 'Stock low' : 'Peak') : null,
    // One line, and it has to do the work the paragraph used to: which frame the
    // numbers are in, how the peak was measured, and that nobody managed the
    // position. A daily-bar peak says so here rather than passing itself off as
    // something seen tick by tick.
    basis: joinBasis([
      short ? "The stock's move, close to close" : 'Close to close',
      tracked ? tracked.note : hasPeak ? 'peak intraday' : null,
      contractLine(setup),
      'not a managed trade',
    ]),
  };
}

/**
 * The window every measured outcome covers.
 *
 * It is a constant because the measurement is one: `alert_outcomes.py` scores
 * `gain_5d_pct` / `win_5d` close to close over five sessions, for every family
 * it scores at all. `outcomeOf` above already writes "Five sessions on" into
 * the label from the same fact; this is the same claim as a number, and if the
 * scorer ever grows a second horizon both have to move together.
 */
const MEASURED_HOLD = '5 sessions';

/**
 * How long it was held, alert to resolution.
 *
 * Calendar days in New York, because that is the only thing the two timestamps
 * on the row can support exactly. Counting SESSIONS would read better beside a
 * five-session result and would need a market calendar this function does not
 * have; a holiday would quietly make it wrong by one, and a number that is
 * quietly wrong by one is worse than a coarser number that is right.
 *
 * Either timestamp missing → null, and the cell is absent rather than zero.
 */
export function heldPlain(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const etDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const days = Math.round(
    (Date.parse(`${etDay(b)}T00:00:00Z`) - Date.parse(`${etDay(a)}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return 'Intraday';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * A rehearsal — the live loop re-run over stored tape from a past session.
 *
 * The flag is written by the UOA ingest into both jsonb blobs. It used to reach
 * the reader only as the first sentence of the narration, which was fine while
 * History printed narration and is not fine now that it prints numbers.
 */
function isReplaySetup(setup: SetupRow | null): boolean {
  if (!setup) return false;
  const comps = (setup.score_components ?? {}) as Record<string, unknown>;
  const snap = (setup.quote_snapshot ?? {}) as Record<string, unknown>;
  return comps.is_replay === true || snap.is_replay === true;
}

/**
 * Why a card carries no medallion — when the honest answer is not "not yet".
 *
 * The app imports every alert the SMS product has ever sent, and grades exactly
 * one family of them (`kai_long`). A short, or a five-minute opening-range
 * break, is ungraded PERMANENTLY and by decision: the grade is calibrated on
 * the long swing family and would be a number with no measurement behind it
 * anywhere else. "Not graded yet" would promise a grade that is not coming.
 */
function ungradedReason(setup: SetupRow): string | null {
  const components = (setup.score_components ?? {}) as Record<string, unknown>;

  // The unusual-options-activity family is ungraded for a different reason to
  // the scanner families below it, and the difference matters. Those are
  // ungraded because the grader was never calibrated on them. This one is
  // ungraded because the engine does not issue a grade AT ALL — it reads one
  // signal and reports it. Saying "not graded yet" would promise a letter that
  // is not coming; saying nothing would let the blank read as an oversight.
  if (components.family === 'uoa_day_trade') {
    return 'Not graded. This alert comes from a single measurement — unusual options flow — and that '
      + 'engine issues no letter grade. A grade here would be an opinion nothing produced.';
  }

  if (components.source !== 'kai_sms_scanner') return null;
  if (components.live_family !== false) return null;
  return setup.mode === 'day_trade'
    ? 'Not graded. This was an intraday alert, and the grade is calibrated on the swing family only.'
    : 'Not graded. This family is kept as a record of what was sent, and the grade is calibrated on the long swing family only.';
}

/**
 * The contracts the producing engine named, if it named any.
 *
 * Read straight off the row the ingest wrote — this function does not choose a
 * contract, rank one, or fill a gap. An engine that named nothing produces
 * null here and the card's whole options section is absent, which is the
 * difference between "nothing qualified" and "we have not looked".
 */
function recommendedOptionsOf(setup: SetupRow | null): AlertOptionContract[] | null {
  if (!setup) return null;
  const raw = ((setup.score_components ?? {}) as Record<string, unknown>).recommended_options;
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: AlertOptionContract[] = [];
  for (const item of raw) {
    const parsed = AlertOptionContract.safeParse(item);
    // A contract missing a strike, an expiry or a side is not a contract. It is
    // dropped rather than drawn with dashes in it.
    if (parsed.success) out.push(parsed.data);
  }
  return out.length ? out : null;
}

/**
 * The 0-100 bars, where the engine behind this row actually measured one.
 *
 * ABSENT IS NOT ZERO. Only keys the producer wrote are passed through; a bar
 * the engine never looked at stays null and is not drawn. Sending zero would
 * render "we did not measure trend" identically to "trend is as weak as it
 * gets", which are opposite claims.
 */
function barScoresOf(setup: SetupRow | null): AlertScores | null {
  if (!setup) return null;
  const raw = ((setup.score_components ?? {}) as Record<string, unknown>).scores;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const one = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  };
  const scores: AlertScores = {
    trend: one(src.trend),
    rr: one(src.rr),
    options_activity: one(src.options_activity),
  };
  return scores.trend === null && scores.rr === null && scores.options_activity === null
    ? null
    : scores;
}

/** Assemble one card. Pure — every input has already been loaded. */
export function buildCard(input: BuildCardInput): AlertCard {
  const setup = input.setup;
  const grade: GradeMedallion = setup
    ? medallion({
        display: setup.grade_display,
        band: setup.grade_band,
        score: setup.score,
        ungradedPlain: ungradedReason(setup),
      })
    : UNGRADED;
  const lv = setup ? levels(setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
  const components = setup
    ? scoreComponents({
        mode: setup.mode,
        components: setup.score_components,
        rr: lv.rr,
        minRr: input.risk?.min_reward_risk ?? null,
      })
    : [];

  const plan = tradePlanFor(input);
  const { headline, what_changed } = headlineFor(input);
  const { primary, secondary } = primaryActionFor(input);
  const dir = directionLabel(setup?.intent ?? (input.position?.direction === 'short' ? 'sell_short' : 'buy_to_open'));
  const resolvedOutcome = outcomeOf(setup, input.state);
  /*
   * Read ONCE, because two things now depend on it: the contracts the card
   * carries, and the instrument its identity line claims. Calling the function
   * twice would let those two drift apart on a row the parser half-rejects.
   */
  const contracts = recommendedOptionsOf(setup);

  return {
    id: input.id,
    kind: input.kind,
    alert_id: input.alertId,
    setup_id: setup?.id ?? null,
    plan_id: input.planId,
    order_id: input.orderId,
    position_id: input.position?.id ?? null,

    identity: {
      symbol: input.symbol,
      company_name: input.profile?.name ?? null,
      logo_url: input.profile?.logo_url ?? null,
      mode: input.mode,
      mode_label: MODE_LABEL[input.mode],
      direction: dir.direction,
      /*
       * WHAT THE ALERT IS ACTUALLY ABOUT. This was the string 'equity' for
       * every card, including the ones whose entire content is an options
       * contract — so a day-trade card read "Meta Platforms · Day Trade ·
       * Short · equity" above a put. The identity line was contradicting the
       * body of its own card.
       *
       * The contracts decide it, not the mode: the swing scanner writes none,
       * the options-flow engine always writes one, and reading the data means
       * this line cannot disagree with what is drawn underneath it.
       */
      instrument: contracts?.length ? 'options' : 'equity',
    },

    grade,
    score_components: components,
    family_performance: familyPerformanceOf(setup),
    recommended_options: contracts,
    scores: barScoresOf(setup),

    state: input.state,
    state_label: STATE_LABEL[input.state],
    tab: ALERT_STATE_TAB[input.state],

    event: {
      headline,
      what_changed,
      triggered_at: input.triggeredAt,
      at_plain: whenPlain(input.triggeredAt ?? input.createdAt),
    },

    company_summary: input.profile?.summary ?? null,

    quote: {
      symbol: input.quote.symbol,
      price: input.quote.price,
      source_ts: input.quote.source_ts,
      received_ts: input.quote.received_ts,
      freshness: input.quote.freshness,
      label_plain: input.quote.label_plain,
    },
    trade_plan: plan,

    kai_interpretation: interpretationFor(input, plan),
    kai_disclosure: NOT_A_GUARANTEE_PLAIN,

    fit: fitFor(input, plan),
    community: input.community,

    outcome: resolvedOutcome,
    resolved_label: input.state === 'closed' || input.state === 'invalidated'
      ? whenPlain(input.resolvedAt ?? input.triggeredAt ?? input.createdAt)
      : null,
    /**
     * How long the RESULT covers — which is not always how long the alert was
     * live, and the difference is the whole reason this is not one expression.
     *
     * `valid_until` is when the idea went stale. On an intraday family that is
     * the session close, so a row whose result is a five-session close-to-close
     * measurement would have printed "Intraday" beside it — a hold and a result
     * describing different spans, sat next to each other with no way to tell.
     * Where a measurement exists, the hold is the measurement's own window;
     * only where nothing was measured does the alert's own life answer.
     */
    held: input.state === 'closed' || input.state === 'invalidated'
      ? (resolvedOutcome
        ? MEASURED_HOLD
        : heldPlain(input.triggeredAt ?? input.createdAt, input.resolvedAt ?? null))
      : null,
    replay: isReplaySetup(setup),

    primary_action: primary,
    secondary_actions: secondary,

    detail: {
      thesis_plain: setup?.thesis_plain ?? null,
      thesis_technical: setup?.thesis_technical ?? null,
      scenarios: scenariosFor(input, plan),
      evidence: components.flatMap((c) => c.evidence),
      sources: input.news ?? [],
      event_history: input.history,
    },

    version: input.version,
    graded_at: input.gradedAt,
    created_at: input.createdAt,
  };
}

export const NO_COMMUNITY: AlertCommunity = {
  sample_size: 0,
  common_level: null,
  sentiment: null,
  verified: null,
  room_id: null,
  plain: 'Nobody has written down an idea about this one yet.',
};

export function communityBlock(opts: {
  sampleSize: number;
  commonLevel: number | null;
  sentiment: string | null;
  verified: boolean | null;
  roomId: string | null;
}): AlertCommunity {
  if (opts.sampleSize === 0) return { ...NO_COMMUNITY, room_id: opts.roomId };
  const parts = [`${opts.sampleSize} member${opts.sampleSize === 1 ? '' : 's'} have posted an idea on this`];
  if (opts.commonLevel !== null) parts.push(`most of them around $${opts.commonLevel}`);
  if (opts.sentiment) parts.push(opts.sentiment);
  return {
    sample_size: opts.sampleSize,
    common_level: opts.commonLevel,
    sentiment: opts.sentiment,
    verified: opts.verified,
    room_id: opts.roomId,
    plain: `${parts.join(', ')}. ${COMMUNITY_LABEL_PLAIN}`,
  };
}

export { STATE_LABEL };
