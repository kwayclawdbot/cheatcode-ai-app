/**
 * THE RESOLVER. This is what makes a call a claim rather than a comment.
 *
 * Every few minutes during market hours it takes every open, scoreable,
 * unexpired call, asks Polygon for one price per symbol, and decides — for each
 * one — whether it hit its target, hit its stop, or is still running. When it
 * fires it writes the outcome and calls `award_points`; when it does not, it
 * still stamps `last_checked_at`.
 *
 * IT ALSO KEEPS THE PEAKS, and not only for members' calls. `runPeakTracking`
 * (`lib/tracking/peaks.ts`) runs inside this same pass and writes down the
 * highest and lowest price every ACTIVE call has seen — the house's own alerts
 * as well as members' — as prices, with the time they were seen. That is what
 * lets History print "peak $27.91" instead of a percentage nobody can place.
 *
 * IT IS DELIBERATELY NOT A SECOND CRON. A tracker on its own schedule would ask
 * Polygon for the same symbols this job is already asking about, at almost the
 * same moments, and double the rate-limit pressure for nothing. Bolting it on
 * here means ONE snapshot request covers both jobs: the tracker runs FIRST and
 * fills the shared snapshot cache, and the `getSnapshot` below is then served
 * from it. Do not reorder those two without reading `getSessionExtremes`.
 *
 * WHY `last_checked_at` IS WRITTEN ON EVERY PASS, FIRED OR NOT. 0038 §4 says
 * it: an unresolved call whose last check is hours stale means the resolver is
 * broken, and that is a thing somebody should be able to see in the table
 * without reading logs. A field only written on success cannot report a
 * failure.
 *
 * ONE SNAPSHOT CALL FOR EVERY SYMBOL, and now for both jobs. `getSnapshot()`
 * covers the whole batch in one request, the same way the paper tick does, so
 * the cost of a pass does not grow with the number of open calls — nor with the
 * number of house alerts being tracked, because they ride in the same request.
 * There is a rate limiter in front of Polygon (`POLYGON_RPM`) and this job is
 * scheduled every five minutes rather than every minute for exactly that
 * reason. Five minutes is also enough for the peaks: the session aggregate
 * REMEMBERS the high, so a spike between two passes is still recorded even
 * though no pass watched it happen.
 *
 * The only per-row costs are one-offs: seeding a row whose history predates
 * tracking, and grading an option contract at its expiry. Neither repeats.
 *
 * AN EXPIRED CALL SCORES NOTHING. A call that ran its five days without
 * touching either level was neither right nor wrong; paying it or charging it
 * would both be inventions. It becomes `expired` and no `point_events` row is
 * ever written for it.
 *
 * THE STOP IS CHECKED BEFORE THE TARGET. We hold one price per pass, not a bar,
 * so a print that satisfies both levels is a price we cannot order in time —
 * and the pessimistic reading is the honest one. `legHit()` in `outcomes.ts`
 * carries that decision and the test covers it.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { getSnapshot } from '../market/polygon';
import { runPeakTracking, type PeakReport } from '../tracking/peaks';
import { CALL_COLUMNS, toCallRow, type CallRow } from './calls';
import { legHit, resultPct } from './outcomes';
import { awardAndAnnounce } from './points';

/**
 * How many open calls one pass will look at. Well above anything this app will
 * hold for a long time; it exists so that a pass stays inside its function
 * timeout rather than half-finishing, and the oldest-checked go first so a
 * backlog drains rather than starving the same rows forever.
 */
const BATCH = 300;

export type ResolveReport = {
  ran_at: string;
  checked: number;
  symbols: number;
  resolved: number;
  hit_target: number;
  stopped: number;
  expired: number;
  awarded: number;
  belts_changed: number;
  degraded: boolean;
  degraded_reason: string | null;
  plain: string;
  /** What the same pass wrote down about peaks. Null only on the early exit
   *  where the pass could not read its own rows and never got that far. */
  peaks: PeakReport | null;
};

export async function runSocialResolve(opts: { requestId: string }): Promise<ResolveReport> {
  const db = serviceClient();
  const at = new Date().toISOString();

  /* --- 1. Expire first, so nothing past its date gets a price check ---- */
  //
  // Every OPEN call past `expires_at` expires, scoreable or not. A call with no
  // levels can never fire, and leaving it `open` for ever would make "open"
  // meaningless on a profile. Neither kind scores.
  const expiredRes = await db
    .from('community_calls')
    .update({ status: 'expired', resolved_at: at, last_checked_at: at })
    .eq('status', 'open')
    .lt('expires_at', at)
    .select('id');
  if (expiredRes.error) {
    log('warn', opts.requestId, 'social.resolve_expire_failed', { message: expiredRes.error.message });
  }
  const expired = (expiredRes.data ?? []).length;

  /* --- 2. What is still live and can actually be checked --------------- */
  const openRes = await db
    .from('community_calls')
    .select(CALL_COLUMNS)
    .eq('status', 'open')
    .eq('scoreable', true)
    .gte('expires_at', at)
    // Oldest check first: 0038's `community_calls_open_idx` is built for exactly
    // this order, and it is what stops a backlog from starving the same rows.
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (openRes.error) {
    log('warn', opts.requestId, 'social.resolve_read_failed', { message: openRes.error.message });
    return report(at, 0, 0, 0, 0, 0, expired, 0, 0, false, null);
  }

  const calls = ((openRes.data ?? []) as Record<string, unknown>[]).map(toCallRow);
  const symbols = [...new Set(calls.map((c) => c.symbol))].sort();

  /* --- 3. Write down the extremes, for the house AND for members ------- */
  //
  // BEFORE the quote read, on purpose. The peak tracker asks Polygon for the
  // running session high and low of everything active — house alerts and open
  // calls together — in one request, and `getSnapshot` below then reads that
  // same cached response instead of sending a second one. Reverse the order and
  // the pass costs two calls instead of one.
  //
  // It runs even when no member has an open call: the house's own alerts are
  // tracked by the same sweep, and they are the reason History can show a peak
  // price at all. That is why this sits ABOVE the early return.
  const peaks = await runPeakTracking({ requestId: opts.requestId, at, alsoPrice: symbols });

  if (!calls.length) {
    return report(at, 0, 0, 0, 0, 0, expired, 0, 0, false, null, peaks);
  }

  /* --- 4. One snapshot for every symbol -------------------------------- */
  const snap = await getSnapshot(symbols);
  const prices = new Map<string, number>();
  for (const q of snap.quotes) {
    if (q.price === null) continue;
    prices.set(q.symbol.toUpperCase(), q.price);
  }

  /* --- 5. Decide, one call at a time ----------------------------------- */
  let hitTarget = 0;
  let stopped = 0;
  let awarded = 0;
  let beltsChanged = 0;
  const untouched: string[] = [];

  for (const call of calls) {
    const price = prices.get(call.symbol.toUpperCase());
    if (price === undefined) {
      // No price for that symbol on this pass. NOT a resolution and NOT a
      // check: leaving `last_checked_at` alone is what makes a symbol we can
      // never price visible as a stale row rather than a healthy one.
      continue;
    }

    const leg = legHit(call.direction, price, call.stop, call.target);
    if (!leg) {
      untouched.push(call.id);
      continue;
    }

    const resolved = await resolveOne({ call, leg, price, at, requestId: opts.requestId });
    if (!resolved) continue;
    if (leg === 'target') hitTarget += 1;
    else stopped += 1;

    const award = await awardAndAnnounce({
      userId: call.user_id,
      source: 'community_call',
      refId: call.id,
      won: leg === 'target',
      resolvedAt: at,
      requestId: opts.requestId,
    });
    if (award.awarded) awarded += 1;
    if (award.belt_changed) beltsChanged += 1;
  }

  /* --- 6. Stamp everything that did not fire, in one write ------------- */
  if (untouched.length) {
    const { error } = await db
      .from('community_calls')
      .update({ last_checked_at: at })
      .in('id', untouched);
    if (error) {
      log('warn', opts.requestId, 'social.resolve_stamp_failed', { message: error.message });
    }
  }

  return report(
    at,
    calls.length,
    symbols.length,
    hitTarget + stopped,
    hitTarget,
    stopped,
    expired,
    awarded,
    beltsChanged,
    snap.degraded,
    snap.degraded_reason,
    peaks
  );
}

/**
 * Write one resolution. The `eq('status','open')` in the update is the race
 * guard: two passes overlapping, or a member withdrawing between the read and
 * the write, and only one of them lands. `false` back means somebody else got
 * there first and this pass must not award points for it.
 */
async function resolveOne(opts: {
  call: CallRow;
  leg: 'target' | 'stop';
  price: number;
  at: string;
  requestId: string;
}): Promise<boolean> {
  const db = serviceClient();
  const pct = resultPct(opts.call.direction, opts.call.entry, opts.price);
  const { data, error } = await db
    .from('community_calls')
    .update({
      status: opts.leg,
      resolved_at: opts.at,
      resolved_price: opts.price,
      result_pct: pct,
      last_checked_at: opts.at,
    })
    .eq('id', opts.call.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (error) {
    log('warn', opts.requestId, 'social.resolve_write_failed', {
      call_id: opts.call.id,
      message: error.message,
    });
    return false;
  }
  if (!data) return false;

  log('info', opts.requestId, 'social.call_resolved', {
    call_id: opts.call.id,
    symbol: opts.call.symbol,
    direction: opts.call.direction,
    leg: opts.leg,
    price: opts.price,
    result_pct: pct,
  });
  return true;
}

function report(
  at: string,
  checked: number,
  symbols: number,
  resolved: number,
  hitTarget: number,
  stopped: number,
  expired: number,
  awarded: number,
  beltsChanged: number,
  degraded: boolean,
  degradedReason: string | null,
  peaks: PeakReport | null = null
): ResolveReport {
  return {
    peaks,
    ran_at: at,
    checked,
    symbols,
    resolved,
    hit_target: hitTarget,
    stopped,
    expired,
    awarded,
    belts_changed: beltsChanged,
    degraded,
    degraded_reason: degradedReason,
    plain: checked
      ? `Checked ${checked} open call${checked === 1 ? '' : 's'} across ${symbols} symbol${symbols === 1 ? '' : 's'}: ${hitTarget} hit target, ${stopped} stopped, ${expired} ran out of time.`
      : expired
        ? `Nothing open to check. ${expired} call${expired === 1 ? '' : 's'} ran out of time.`
        : 'No open calls to check.',
  };
}
