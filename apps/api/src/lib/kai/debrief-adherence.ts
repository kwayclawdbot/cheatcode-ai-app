/**
 * DID YOU FOLLOW YOUR OWN PLAN?
 *
 * The debrief already answered "did you have a plan" (`computeReceipt`). It has
 * never answered the narrower and more useful question the review board asks:
 * the plan said enter at 178.40, stop at 171.90, take profit at 195.00 — and
 * then what did you actually do? Three lines, one headline, and a hand-off into
 * the exercise for whichever leg slipped.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HONESTY RULE, WHICH IS THE WHOLE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 * This screen judges the member, so an ABSENT FACT MAY NEVER BE A FAILURE. A
 * plan with no target written down did not miss its target — there was nothing
 * to miss, and the line says exactly that (`not_planned`). `not_planned` is
 * excluded from the headline's verdict, never produces a practice hand-off, and
 * is deliberately NOT expressible in `ProcessReceiptItem`, whose `ok` boolean
 * would have to call it either a pass or a failure and would be lying either
 * way. That is why this block exists beside the receipt instead of inside it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO CLAIM
 * ─────────────────────────────────────────────────────────────────────────────
 * The concept board reads "Stop respected — price never touched your stop."
 * We do not have the intraday price path here; we have plans, orders, fills and
 * plan events. So the sentence written is the one the evidence supports: the
 * stop was never moved and the exit landed on the right side of it. Claiming
 * anything about ticks nobody stored would be inventing evidence to make a
 * kinder sentence, which is the same sin as inventing a number.
 *
 * Everything here is computed. Nothing on this path reaches a model.
 */
import type { AdherenceCheck, AdherencePractice, PlanAdherence } from '@shared/api';
import type { DebriefSources } from './debrief';

/**
 * How far off a planned level still counts as "followed".
 *
 * Relative, because 0.10 is a rounding error on NVDA and a third of the range
 * on a $2 stock. 0.25% is roughly one tick of slippage on a liquid name — wide
 * enough that a market order filling through the level is not called a
 * deviation, tight enough that entering a dollar late still is.
 */
const TOLERANCE = 0.0025;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.abs(b) * TOLERANCE;

/** Two decimals, no currency symbol — the caller's sentence supplies that. */
const money = (n: number): string => n.toFixed(2);

export type AdherenceFacts = {
  direction: 'long' | 'short';
  /** What the plan said, or null where the plan was silent. */
  plannedEntry: number | null;
  plannedStop: number | null;
  plannedTarget: number | null;
  /** What happened. `actualEntry` is the position's average cost. */
  actualEntry: number | null;
  actualExit: number | null;
  /** True when a plan event recorded the stop being moved after the fact. */
  stopMoved: boolean;
  /** False when there was no plan row at all. */
  hasPlan: boolean;
};

/* ------------------------------------------------------------------ */
/* Reading the facts off the sources                                    */
/* ------------------------------------------------------------------ */

/** `entry_condition` is free-shaped JSON; these are the keys plans actually write. */
export function entryLevel(entryCondition: Record<string, unknown> | null): number | null {
  if (!entryCondition) return null;
  for (const k of ['level', 'price', 'trigger', 'above', 'below', 'value']) {
    const v = Number(entryCondition[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

/** The FIRST target only. "Did you take profit where you said" is about that one. */
export function firstTarget(raw: unknown): number | null {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const t of arr) {
    if (typeof t === 'number' && Number.isFinite(t)) return t;
    if (t && typeof t === 'object') {
      const o = t as Record<string, unknown>;
      const price = Number(o.price ?? o.level ?? o.value ?? o.target);
      if (Number.isFinite(price)) return price;
    }
  }
  return null;
}

const CLOSING_SIDES = new Set(['sell_to_close', 'buy_to_cover']);

/**
 * The average price of the fills that CLOSED the position.
 *
 * Weighted, because a scaled-out exit has no single price and picking the first
 * or the best one would flatter or damn the member arbitrarily. Null when no
 * closing fill was recorded — which is a missing fact, not a zero.
 */
export function exitPrice(s: DebriefSources): number | null {
  const closingIds = new Set(s.orders.filter((o) => CLOSING_SIDES.has(o.side)).map((o) => o.id));
  const fills = s.fills.filter((f) => closingIds.has(f.order_id));
  if (!fills.length) return null;
  let qty = 0;
  let notional = 0;
  for (const f of fills) {
    if (!Number.isFinite(f.qty) || !Number.isFinite(f.price) || f.qty <= 0) continue;
    qty += f.qty;
    notional += f.qty * f.price;
  }
  return qty > 0 ? notional / qty : null;
}

/** A stop that MOVED after the plan was written is a deviation the events record. */
export function stopWasMoved(s: DebriefSources): boolean {
  return s.planEvents.some((e) => {
    if (!/stop/i.test(e.type)) {
      const changed = e.payload?.changed;
      const field = e.payload?.field;
      const moved =
        (Array.isArray(changed) && changed.some((c) => typeof c === 'string' && /stop/i.test(c))) ||
        (typeof field === 'string' && /stop/i.test(field));
      if (!moved) return false;
    }
    // A stop being ATTACHED or HIT is not a stop being moved.
    return !/attach|placed|hit|triggered|filled/i.test(e.type) && !/attach|placed|hit/i.test(String(e.payload?.reason ?? ''));
  });
}

export function factsFrom(s: DebriefSources): AdherenceFacts {
  const avg = Number(s.position.avg_cost);
  return {
    direction: s.position.direction,
    plannedEntry: entryLevel(s.plan?.entry_condition ?? null),
    plannedStop: s.plan?.stop ?? null,
    plannedTarget: firstTarget(s.plan?.targets ?? null),
    actualEntry: Number.isFinite(avg) && avg > 0 ? avg : null,
    actualExit: exitPrice(s),
    stopMoved: stopWasMoved(s),
    hasPlan: Boolean(s.plan),
  };
}

/* ------------------------------------------------------------------ */
/* The three checks                                                     */
/* ------------------------------------------------------------------ */

function entryCheck(f: AdherenceFacts): AdherenceCheck {
  if (f.plannedEntry === null) {
    return {
      key: 'entry',
      label: 'No entry level was set',
      status: 'not_planned',
      detail_plain:
        f.actualEntry === null
          ? 'The plan did not name a price to get in at, so there is nothing to hold you to.'
          : `You got in at ${money(f.actualEntry)}. The plan did not name a price, so there is nothing to hold you to.`,
      planned: null,
      actual: f.actualEntry,
    };
  }
  if (f.actualEntry === null) {
    return {
      key: 'entry',
      label: 'Entry price not recorded',
      status: 'not_planned',
      detail_plain: `The plan said ${money(f.plannedEntry)}. I do not have a fill price for the entry, so I will not guess at one.`,
      planned: f.plannedEntry,
      actual: null,
    };
  }
  if (near(f.actualEntry, f.plannedEntry)) {
    return {
      key: 'entry',
      label: 'Entry followed',
      status: 'followed',
      detail_plain: `You entered at ${money(f.actualEntry)} as planned.`,
      planned: f.plannedEntry,
      actual: f.actualEntry,
    };
  }
  return {
    key: 'entry',
    label: 'Entry changed',
    status: 'changed',
    detail_plain: `You entered at ${money(f.actualEntry)}, not the ${money(f.plannedEntry)} you wrote down.`,
    planned: f.plannedEntry,
    actual: f.actualEntry,
  };
}

/** Long: below the stop is the wrong side. Short: above it is. */
function beyondStop(f: AdherenceFacts, price: number, stop: number): boolean {
  return f.direction === 'long' ? price < stop && !near(price, stop) : price > stop && !near(price, stop);
}

function stopCheck(f: AdherenceFacts): AdherenceCheck {
  if (f.plannedStop === null) {
    return {
      key: 'stop',
      label: 'No stop was set',
      status: 'not_planned',
      detail_plain: 'No stop was written down, so there was no line to respect. That is the thing to fix, not a mark against this trade.',
      planned: null,
      actual: f.actualExit,
    };
  }
  if (f.stopMoved) {
    return {
      key: 'stop',
      label: 'Stop moved',
      status: 'changed',
      detail_plain: `Your stop was ${money(f.plannedStop)} when you entered and it was moved while the trade was on.`,
      planned: f.plannedStop,
      actual: f.actualExit,
    };
  }
  if (f.actualExit === null) {
    return {
      key: 'stop',
      label: 'Stop held as written',
      status: 'followed',
      detail_plain: `Your stop stayed at ${money(f.plannedStop)} from the moment you entered. I do not have an exit fill to check it against.`,
      planned: f.plannedStop,
      actual: null,
    };
  }
  if (beyondStop(f, f.actualExit, f.plannedStop)) {
    return {
      key: 'stop',
      label: 'Stop overrun',
      status: 'changed',
      detail_plain: `You came out at ${money(f.actualExit)}, past the ${money(f.plannedStop)} you said you would be out at.`,
      planned: f.plannedStop,
      actual: f.actualExit,
    };
  }
  return {
    key: 'stop',
    label: 'Stop respected',
    status: 'followed',
    // Deliberately about the exit and the plan events, not about the tick data
    // we do not hold. See the header.
    detail_plain: `Your stop stayed at ${money(f.plannedStop)} and you came out at ${money(f.actualExit)}, on the right side of it.`,
    planned: f.plannedStop,
    actual: f.actualExit,
  };
}

/** Long: at or above the target is taking profit where you said. Short: at or below. */
function reachedTarget(f: AdherenceFacts, exit: number, target: number): boolean {
  if (near(exit, target)) return true;
  return f.direction === 'long' ? exit > target : exit < target;
}

function exitCheck(f: AdherenceFacts): AdherenceCheck {
  if (f.plannedTarget === null) {
    return {
      key: 'exit',
      label: 'No target was set',
      status: 'not_planned',
      detail_plain:
        f.actualExit === null
          ? 'The plan did not say where you were taking profit, so there was no target to miss.'
          : `You exited at ${money(f.actualExit)}. The plan did not say where you were taking profit, so there was no target to miss.`,
      planned: null,
      actual: f.actualExit,
    };
  }
  if (f.actualExit === null) {
    return {
      key: 'exit',
      label: 'Exit price not recorded',
      status: 'not_planned',
      detail_plain: `Your target was ${money(f.plannedTarget)}. I do not have a fill price for the exit, so I will not guess at one.`,
      planned: f.plannedTarget,
      actual: null,
    };
  }
  if (reachedTarget(f, f.actualExit, f.plannedTarget)) {
    return {
      key: 'exit',
      label: 'Exit followed',
      status: 'followed',
      detail_plain: `You exited at ${money(f.actualExit)}, at or beyond your ${money(f.plannedTarget)} target.`,
      planned: f.plannedTarget,
      actual: f.actualExit,
    };
  }
  return {
    key: 'exit',
    label: 'Exit changed',
    status: 'changed',
    detail_plain: `You exited at ${money(f.actualExit)}, not your ${money(f.plannedTarget)} target.`,
    planned: f.plannedTarget,
    actual: f.actualExit,
  };
}

/* ------------------------------------------------------------------ */
/* The headline and the hand-off                                        */
/* ------------------------------------------------------------------ */

/**
 * Two clauses: what happened to the RISK, and what happened to the EXECUTION.
 * "Risk respected. Exit improvised." Each clause is earned by a check, and a
 * `not_planned` leg says so rather than borrowing a verdict it did not earn.
 */
export function headlineFor(checks: AdherenceCheck[]): string {
  const by = (k: AdherenceCheck['key']) => checks.find((c) => c.key === k) ?? null;
  const stop = by('stop');
  const entry = by('entry');
  const exit = by('exit');

  const risk =
    stop?.status === 'followed' ? 'Risk respected.'
      : stop?.status === 'changed' ? 'Risk moved.'
        : 'Risk was never defined.';

  const entryOff = entry?.status === 'changed';
  const exitOff = exit?.status === 'changed';
  const execution =
    entryOff && exitOff ? 'Both ends improvised.'
      : exitOff ? 'Exit improvised.'
        : entryOff ? 'Entry improvised.'
          : entry?.status === 'followed' || exit?.status === 'followed' ? 'Plan followed.'
            : 'Nothing else was written down.';

  return `${risk} ${execution}`;
}

const PRACTICE: Record<AdherenceCheck['key'], AdherencePractice> = {
  exit: {
    skill: 'trade_management',
    label: 'Practise the exit',
    plain: 'Next time, write your exit rule before you enter.',
  },
  stop: {
    skill: 'risk_management',
    label: 'Practise the stop',
    plain: 'A stop you move is not a stop. Where the line goes is the exercise.',
  },
  entry: {
    skill: 'entries',
    label: 'Practise the entry',
    plain: 'Interesting is not "enter now". Waiting for your own level is the exercise.',
  },
};

/**
 * ONE hand-off, not three. The exit is offered first because an improvised exit
 * is the one that costs the most and the one this product can practise; only a
 * leg that genuinely `changed` ever produces an offer, so a member whose plan
 * simply did not name a target is never sent to a lesson about missing it.
 */
export function practiceFor(checks: AdherenceCheck[]): AdherencePractice | null {
  for (const key of ['exit', 'stop', 'entry'] as const) {
    if (checks.find((c) => c.key === key)?.status === 'changed') return PRACTICE[key];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The block                                                            */
/* ------------------------------------------------------------------ */

/**
 * Null when there was no plan at all: a trade taken with nothing written down
 * cannot be measured against a plan, and a checklist of three "not planned"
 * lines would be three ways of saying the same thing. The receipt's first item
 * — "You had a written plan before you were in" — already says it once.
 */
export function adherenceFrom(facts: AdherenceFacts): PlanAdherence | null {
  if (!facts.hasPlan) return null;
  const checks = [entryCheck(facts), stopCheck(facts), exitCheck(facts)];
  return {
    headline: headlineFor(checks),
    checks,
    practice: practiceFor(checks),
    planned_levels: { entry: facts.plannedEntry, stop: facts.plannedStop, target: facts.plannedTarget },
    actual_levels: { entry: facts.actualEntry, exit: facts.actualExit },
  };
}

export function computeAdherence(s: DebriefSources): PlanAdherence | null {
  return adherenceFrom(factsFrom(s));
}
