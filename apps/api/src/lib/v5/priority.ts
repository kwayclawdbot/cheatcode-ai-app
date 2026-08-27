/**
 * Home's one priority object and its one primary action (V5 H1 / audit §4).
 *
 * The rule this file exists to enforce: Home shows ONE thing that needs the
 * user, and its button label is decided by the STATE of that thing, not by the
 * screen it lives on. A client must never re-derive "Watch this" vs "Review
 * setup" — if two surfaces can disagree about what the next step is, they will.
 *
 * Order of precedence, most urgent first, and each one is urgent for a
 * different reason:
 *   1. a position sitting on its stop        — real money, right now
 *   2. an alert that fired                   — a condition the user chose fired
 *   3. a setup that has met every condition  — the thing they were waiting for
 *   4. an armed plan                         — the decision is already made
 *   5. an invalidated setup they follow      — a thesis died; that is news
 *   6. a setup still forming                 — the honest "nothing yet"
 *   7. the portfolio itself                  — when nothing else needs them
 *
 * Nothing here manufactures urgency. When there is genuinely nothing, the
 * priority says so plainly rather than promoting something to fill the space.
 */
import type { AlsoWatchingRow, HomePriority, OpenPositionRow, PlainAction, Quote } from '@shared/api';
import { STATE_ACTION_LABEL } from '@shared/api';
import { quoteFromSnapshot } from '../market';
import { derivedEnvelope } from '../kai/objects';
import { levels } from '../setups';
import type { SetupRow } from '../kai/context';

export type PriorityInputs = {
  userId: string;
  setups: SetupRow[];
  positions: OpenPositionRow[];
  triggeredAlerts: { id: string; symbol: string | null; natural_language: string | null; created_at: string }[];
  armedPlans: { id: string; symbol: string; entry: number | null; stop: number | null }[];
  equity: number | null;
  dayChange: number | null;
};

function action(label: string, route: string | null, act: string): PlainAction {
  return { action: act, label, route, primary: true, enabled: true, hint: null };
}

function secondary(label: string, route: string | null, act: string): PlainAction {
  return { action: act, label, route, primary: false, enabled: true, hint: null };
}

export function labelForState(state: string): string {
  return STATE_ACTION_LABEL[state] ?? 'Review setup';
}

export function choosePriority(input: PriorityInputs): HomePriority | null {
  // 1. a position under pressure
  const atRisk = input.positions.find((p) => p.health === 'at_risk');
  if (atRisk) {
    return {
      kind: 'position',
      id: atRisk.id,
      symbol: atRisk.symbol,
      state: 'active',
      headline: `${atRisk.symbol} is testing your exit level`,
      subhead: atRisk.plain,
      detail_plain: atRisk.health_plain,
      quote: null,
      grade_display: null,
      object: null,
      primary_action: action('Manage', `/position/${atRisk.id}`, 'manage_position'),
      secondary_actions: [
        secondary('Exit now', `/position/${atRisk.id}?close=1`, 'exit_now'),
        secondary('Ask Kai', null, 'ask_kai'),
      ],
    };
  }

  // 2. an alert that fired
  const fired = input.triggeredAlerts[0];
  if (fired) {
    const sym = fired.symbol;
    return {
      kind: 'alert',
      id: fired.id,
      symbol: sym,
      state: 'triggered',
      headline: sym ? `${sym} hit the level you were watching` : 'One of your watches hit',
      subhead: fired.natural_language,
      detail_plain: `${fired.natural_language ?? 'A condition you set'} — this is the moment you asked to be told about.`,
      quote: null,
      grade_display: null,
      object: null,
      primary_action: action(sym ? `Open ${sym}` : 'Open the watch', sym ? `/symbol/${sym}` : `/alert/${fired.id}`, 'open_symbol'),
      secondary_actions: [secondary('Ask Kai', null, 'ask_kai'), secondary('See the watch', `/alert/${fired.id}`, 'open_alert')],
    };
  }

  // 3. a setup that has met everything
  const ready = input.setups.find((s) => s.state === 'ready');
  if (ready) return fromSetup(ready, input.userId);

  // 4. an armed plan
  const plan = input.armedPlans[0];
  if (plan) {
    return {
      kind: 'setup',
      id: plan.id,
      symbol: plan.symbol,
      state: 'planned',
      headline: `Your ${plan.symbol} plan is armed`,
      subhead: plan.entry === null ? null : `Entry $${plan.entry}${plan.stop === null ? '' : ` · out at $${plan.stop}`}`,
      detail_plain:
        'The decision is already made and written down. Nothing has been bought — the order is still yours to place.',
      quote: null,
      grade_display: null,
      object: null,
      primary_action: action('Buy', `/order/new?symbol=${plan.symbol}&side=buy_to_open&plan=${plan.id}`, 'buy'),
      secondary_actions: [secondary('See the plan', `/plan/${plan.id}`, 'open_plan'), secondary('Ask Kai', null, 'ask_kai')],
    };
  }

  // 5. a thesis that died
  const dead = input.setups.find((s) => s.state === 'invalidated');
  if (dead) return fromSetup(dead, input.userId);

  // 6. something still forming
  const forming = input.setups.find((s) => s.state === 'forming' || s.state === 'watching' || s.state === 'discovered');
  if (forming) return fromSetup(forming, input.userId);

  // 7. the portfolio
  if (input.positions.length) {
    const total = input.positions.reduce((a, p) => a + (p.unrealized_pnl ?? 0), 0);
    return {
      kind: 'portfolio',
      id: null,
      symbol: null,
      state: 'active',
      headline: `${input.positions.length} position${input.positions.length === 1 ? '' : 's'} open, nothing needs you`,
      subhead: `${total >= 0 ? 'Up' : 'Down'} $${Math.abs(Math.round(total * 100) / 100)} on paper`,
      detail_plain: 'Every stop is where you put it and nothing has changed enough to act on. Doing nothing is the move.',
      quote: null,
      grade_display: null,
      object: null,
      primary_action: action('Manage', '/trade', 'open_trade'),
      secondary_actions: [secondary('Ask Kai', null, 'ask_kai')],
    };
  }

  return null;
}

function fromSetup(row: SetupRow, userId: string): HomePriority {
  const { entry, stop } = levels(row);
  const state = String(row.state);
  const quote = quoteFromSnapshot(row.symbol, row.quote_snapshot) as Quote;

  const detail =
    state === 'invalidated'
      ? `${row.thesis_plain ?? `The ${row.symbol} idea`} — the level it leaned on gave way, so the idea is off. Nothing to do except understand why.`
      : state === 'ready'
        ? `${row.thesis_plain ?? `${row.symbol} is set up`} Everything I defined has happened${entry === null ? '' : ` at $${entry}`}${stop === null ? '' : `, and it fails below $${stop}`}. Your move.`
        : `${row.thesis_plain ?? `${row.symbol} is on my list`}${entry === null ? '' : ` It triggers at $${entry}`}${stop === null ? '' : ` and fails at $${stop}`}. Not there yet.`;

  return {
    kind: 'setup',
    id: row.id,
    symbol: row.symbol,
    state,
    headline:
      state === 'ready'
        ? `${row.symbol} has met every condition`
        : state === 'invalidated'
          ? `${row.symbol} is off — the level failed`
          : `${row.symbol} is building`,
    subhead: row.grade_display ? `Grade ${row.grade_display}` : null,
    detail_plain: detail,
    quote,
    grade_display: row.grade_display,
    object: derivedEnvelope(row, userId),
    primary_action: action(
      labelForState(state),
      `/symbol/${row.symbol}?tab=overview&setup=${row.id}`,
      state === 'ready' ? 'review_setup' : state === 'invalidated' ? 'review_change' : 'watch_this'
    ),
    secondary_actions: [
      secondary('See why', `/symbol/${row.symbol}?tab=kai&setup=${row.id}`, 'see_why'),
      secondary('Ask Kai', null, 'ask_kai'),
    ],
  };
}

export function alsoWatching(input: {
  userId: string;
  setups: SetupRow[];
  positions: OpenPositionRow[];
  priority: HomePriority | null;
  cap?: number;
}): AlsoWatchingRow[] {
  const out: AlsoWatchingRow[] = [];
  const takenId = input.priority?.id ?? null;

  for (const p of input.positions) {
    if (p.id === takenId) continue;
    out.push({
      kind: 'position',
      id: p.id,
      symbol: p.symbol,
      plain: p.plain,
      quote: null,
      route: `/position/${p.id}`,
    });
  }

  for (const s of input.setups) {
    if (s.id === takenId) continue;
    const state = String(s.state);
    out.push({
      kind: 'setup',
      id: s.id,
      symbol: s.symbol,
      plain:
        state === 'invalidated'
          ? 'Off — the level failed'
          : state === 'ready'
            ? 'Conditions met — your move'
            : state === 'forming'
              ? 'Confirmation building'
              : 'Watching',
      quote: quoteFromSnapshot(s.symbol, s.quote_snapshot) as Quote,
      route: `/symbol/${s.symbol}?tab=overview&setup=${s.id}`,
    });
  }

  return out.slice(0, input.cap ?? 6);
}
