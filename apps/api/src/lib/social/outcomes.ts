/**
 * WHAT A SHARED TRADE OR A PUBLISHED CALL ACTUALLY DID, AS ARITHMETIC.
 *
 * This file is PURE — no database, no network, no `Date.now()`, no imports at
 * all — for exactly the reason `lib/push/policy.ts` is pure: every bug this
 * feature can have lives in these four functions. A short that fell is a WIN
 * and its percent is POSITIVE; a long whose stop is above its entry is a typo,
 * not a trade; and "did it hit" is a comparison whose direction flips with the
 * side. None of those are visible in a code review and all of them are one line
 * of arithmetic, so they are lifted out where `scripts/social-points-test.ts`
 * can run them a thousand times with no stack around them.
 *
 * THE PERCENT IS A PERCENT AND NEVER A DOLLAR. 0038 stores no quantity and no
 * notional, and nothing in this file could produce one if it wanted to: the
 * only inputs are prices. See the 0038 header on why the rule is enforced by
 * the columns not existing rather than by a select list.
 */

/** Two decimal places, the way every price in this app is printed. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The move off the entry, SIGNED FOR THE DIRECTION TAKEN.
 *
 * Positive always means "the trade went the way it was pointed". A short from
 * 100 that covered at 90 made 10%, and writing that as -10% because the price
 * fell would be reporting the instrument instead of the person.
 *
 * Returns null rather than a number when there is nothing honest to say: no
 * entry, a zero or negative entry (which is not a price), or an exit that is
 * not a number. A blank reads as "not resolved yet"; a 0 reads as "flat", and
 * those are different facts.
 */
export function resultPct(
  direction: 'long' | 'short',
  entry: number | null | undefined,
  exit: number | null | undefined
): number | null {
  if (entry === null || entry === undefined || exit === null || exit === undefined) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  const raw = ((exit - entry) / entry) * 100;
  return round2(direction === 'long' ? raw : -raw);
}

/**
 * Which bracket a price has reached, or null for neither.
 *
 * LONG   target above, stop below.   hits target at >= target, stops at <= stop.
 * SHORT  the mirror in both places.  hits target at <= target, stops at >= stop.
 *
 * THE STOP IS CHECKED FIRST, DELIBERATELY. On a coherent long — stop below the
 * entry, target above it — one price cannot satisfy both, and 0038's
 * `social_levels_coherent()` trigger is what guarantees coherence. So this
 * order only decides the case where a row somehow holds crossed levels, and it
 * decides it as a LOSS. That is the right way round: the failure mode that
 * costs us is the one that pays somebody points for a call the database should
 * never have accepted, and it is the one that would never be reported.
 */
export function legHit(
  direction: 'long' | 'short',
  price: number,
  stop: number | null | undefined,
  target: number | null | undefined
): 'target' | 'stop' | null {
  if (!Number.isFinite(price)) return null;
  const hasStop = stop !== null && stop !== undefined && Number.isFinite(stop);
  const hasTarget = target !== null && target !== undefined && Number.isFinite(target);

  if (direction === 'long') {
    if (hasStop && price <= (stop as number)) return 'stop';
    if (hasTarget && price >= (target as number)) return 'target';
    return null;
  }
  if (hasStop && price >= (stop as number)) return 'stop';
  if (hasTarget && price <= (target as number)) return 'target';
  return null;
}

/**
 * Did it work? The target leg is a win and the stop leg is a loss with no
 * argument. A MANUAL CLOSE has no leg to read, so the percent decides — and
 * flat is not a win: `> 0`, never `>= 0`.
 */
export function wasWon(outcome: 'target' | 'stop' | 'closed' | 'expired', pct: number | null): boolean {
  if (outcome === 'target') return true;
  if (outcome === 'stop') return false;
  if (outcome === 'expired') return false;
  return pct !== null && pct > 0;
}

/**
 * A CALL WITH NO LEVELS SCORES NOTHING, and neither does a trade with none.
 * 0038 makes this a generated column on `community_calls` (`scoreable`) so a
 * route cannot set it by hand; a `trade_shares` row has no such column, so the
 * same rule is applied here before `award_points` is ever called. Without an
 * entry and at least one side there is nothing to check a price against, and
 * scoring it would be scoring a sentence.
 */
export function hasLevels(
  entry: number | null | undefined,
  stop: number | null | undefined,
  target: number | null | undefined
): boolean {
  const num = (v: number | null | undefined) => v !== null && v !== undefined && Number.isFinite(v);
  return num(entry) && (num(stop) || num(target));
}

/**
 * Drop a level that contradicts the direction, rather than lose the whole
 * share.
 *
 * 0038 §5 installs `social_levels_coherent()` on both tables: a long whose stop
 * is at or above its entry is refused outright. That is right for a call a
 * person typed, and wrong for a FILL — a long planned with a stop at 231.00 and
 * filled in a fast market at 230.80 has a stop that is no longer below its
 * entry, and the choice there is between publishing a "stop" that is not a stop
 * and publishing the trade without one. We publish it without one. The trade is
 * still true; the level is the part that stopped being true.
 */
export function coherentLevels(
  direction: 'long' | 'short',
  entry: number,
  stop: number | null,
  target: number | null
): { stop: number | null; target: number | null } {
  if (!Number.isFinite(entry)) return { stop: null, target: null };
  const keep = (v: number | null, ok: (n: number) => boolean) =>
    v === null || !Number.isFinite(v) || !ok(v) ? null : v;
  return direction === 'long'
    ? {
        stop: keep(stop, (n) => n < entry),
        target: keep(target, (n) => n > entry),
      }
    : {
        stop: keep(stop, (n) => n > entry),
        target: keep(target, (n) => n < entry),
      };
}

/** "Hit target" · "Stopped" · "Still open" — the one phrase every card prints. */
export function outcomeLabel(outcome: string): string | null {
  switch (outcome) {
    case 'target':
      return 'Hit target';
    case 'stop':
      return 'Stopped';
    case 'open':
      return 'Still open';
    case 'closed':
      return 'Closed by hand';
    case 'expired':
      return 'Expired unresolved';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return null;
  }
}
