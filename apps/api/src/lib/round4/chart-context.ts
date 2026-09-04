/**
 * Loading the objects a chart command may be resolved against.
 *
 * The Trade Portal stamps `conversations.context.chart` with the symbol, the
 * timeframe and the ids it opened over. This turns that stamp into the real
 * rows — the setup, the saved plan, the room's most-mentioned level and the
 * swing levels computed from stored bars — so `executeChartCommand` has an
 * actual number for every level name Kai is allowed to say.
 *
 * If a level is not in here, Kai cannot draw it. That is the design.
 */
import { serviceClient } from '../db';
import { getCandles, lastTradingDate, prevTradingDate } from '../market/polygon';
import { computeTechnicals } from '../market/technicals';
import { computeFib, computeIntradayLevels, computeKeyLevels, findTrendlines } from '../market/key-levels';
import { normalizeTargets, type SetupRow } from '../kai/context';
import { entryOf } from '../execution/plans';
import type { ChartContext } from '../kai/chart-commands';
import { log } from '../log';

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id,discussion_room_id';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type ChartStamp = {
  symbol?: string;
  timeframe?: string;
  setup_id?: string | null;
  alert_id?: string | null;
  plan_id?: string | null;
  trigger_ts?: string | null;
};

export async function loadChartContext(userId: string, stamp: ChartStamp | null | undefined): Promise<ChartContext | null> {
  const symbol = stamp?.symbol?.toUpperCase();
  if (!symbol) return null;
  const db = serviceClient();
  const timeframe = stamp?.timeframe ?? '1d';

  const [setupRes, planRes, dailyRes, intradayRes] = await Promise.all([
    stamp?.setup_id
      ? db.from('setups').select(SETUP_COLUMNS).eq('id', stamp.setup_id).maybeSingle()
      : db
          .from('setups')
          .select(SETUP_COLUMNS)
          .eq('symbol', symbol)
          .in('state', ['discovered', 'watching', 'forming', 'ready', 'invalidated'])
          .order('score', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
    stamp?.plan_id
      ? db
          .from('trade_plans')
          .select('id,symbol,entry_condition,stop,targets,status')
          .eq('id', stamp.plan_id)
          .eq('user_id', userId)
          .maybeSingle()
      : db
          .from('trade_plans')
          .select('id,symbol,entry_condition,stop,targets,status')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .in('status', ['draft', 'planned', 'active'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
    /**
     * FOUR HUNDRED DAYS, NOT A HUNDRED AND FIFTY.
     *
     * A hundred and fifty calendar days is about a hundred trading bars, which
     * is enough for swing levels and not enough for anything with a year in it:
     * no 52-week high, no 200-day average, and a "year's low" that is really
     * five months' low wearing a bigger label. The computed vocabulary needs the
     * full window, so the fetch widened and the OLD numbers are taken from a
     * slice of it — see `recent` below. Existing support and resistance are
     * computed from exactly the bars they always were.
     */
    getCandles(symbol, '1d', daysAgo(400), lastTradingDate()),
    /**
     * TODAY'S SESSION, IN FIVE-MINUTE BARS.
     *
     * Four days back rather than one: ask on a Sunday, or before the bell on a
     * Monday, and today has no bars at all. `computeIntradayLevels` takes the
     * most recent session that HAS them and labels its answers with that date,
     * which is the honest version of "the premarket high" when the market has
     * not opened yet.
     *
     * It runs in the same `Promise.all` as everything else, so it costs no
     * added latency, and `getCandles` is cache-first, so it usually costs no
     * request either.
     */
    getCandles(symbol, '5m', daysAgo(4), lastTradingDate()),
  ]);

  const setup = (setupRes.data as unknown as SetupRow | null) ?? null;
  const planRow = (planRes.data as Record<string, unknown> | null) ?? null;
  const plan = planRow
    ? {
        entry: entryOf(planRow.entry_condition),
        stop: planRow.stop === null || planRow.stop === undefined ? null : Number(planRow.stop),
        targets: normalizeTargets(planRow.targets),
      }
    : null;

  const daily = dailyRes.candles;
  // The window the existing levels have always been computed from. Widening the
  // fetch must not silently move support, resistance or the "wide" camera shot.
  const cutoff = `${daysAgo(150)}T00:00:00Z`;
  const recent = daily.filter((c) => c.ts >= cutoff);
  const candles = { candles: recent.length ? recent : daily };

  const last = candles.candles.length ? candles.candles[candles.candles.length - 1].c : null;
  const tech = computeTechnicals({ candles: candles.candles, price: last });

  /**
   * THE COMPUTED VOCABULARY. Arithmetic on the bars above, nothing else.
   *
   * Each of these returns null rather than a guess when the bars do not support
   * it — fewer than twenty days, no swing worth retracing, no session with
   * five-minute prints — and a null simply means those names do not resolve, so
   * Kai is never told he can draw something that is not there.
   *
   * Wrapped because a chart must still open when one of them throws. A missing
   * trendline is a missing trendline; it is not a reason for the Trade Portal to
   * fail to load.
   */
  const safe = <T,>(what: string, fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      log('warn', '-', 'chart_context.compute_failed', {
        symbol,
        what,
        message: e instanceof Error ? e.message : String(e),
      });
      return fallback;
    }
  };
  const computed = safe('key_levels', () => computeKeyLevels(daily), null);
  const intraday = safe('intraday_levels', () => computeIntradayLevels(intradayRes.candles), null);
  const trendlines = safe('trendlines', () => findTrendlines(daily), []);
  const fib = safe('fib', () => computeFib(daily), null);

  // The room's most-mentioned level, from structured ideas members actually
  // posted. Null when nobody has named one — Kai then cannot "highlight the
  // community level", and says so rather than drawing a plausible line.
  const roomId = (setup as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;
  const communityLevel = roomId ? await mostMentionedLevel(roomId) : null;

  const lastDate = lastTradingDate();
  // The window the stored bars cover. Shapes need a time as well as a price —
  // a box has to span something and a ring has to sit on a bar — and these are
  // the only timestamps in this function that came from real candles.
  const firstBar = candles.candles[0] ?? null;
  const lastBar = candles.candles.length ? candles.candles[candles.candles.length - 1] : null;
  return {
    userId,
    symbol,
    timeframe,
    setup,
    alertId: stamp?.alert_id ?? null,
    planId: planRow ? String(planRow.id) : null,
    plan,
    communityLevel,
    triggerTs: stamp?.trigger_ts ?? null,
    supports: tech.support.map((s) => s.price),
    resistances: tech.resistance.map((r) => r.price),
    priorSession: { from: prevTradingDate(lastDate), to: prevTradingDate(lastDate) },
    // Everything above was computed from the DAILY candles fetched here, so
    // that is where the levels live regardless of what the chart is showing.
    levelTimeframe: '1d',
    bars: {
      firstTs: firstBar?.ts ?? null,
      lastTs: lastBar?.ts ?? null,
      lastPrice: last,
    },
    computed,
    intraday,
    trendlines,
    fib,
    // The full window, for anchored VWAP — the one computation that cannot be
    // done in advance, because it depends on which bar Kai names as the anchor.
    dailyBars: daily,
  };
}

/** The level named most often in the room's structured ideas. */
async function mostMentionedLevel(roomId: string): Promise<number | null> {
  const db = serviceClient();
  const { data } = await db
    .from('messages')
    .select('structured_idea')
    .eq('room_id', roomId)
    .not('structured_idea', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const counts = new Map<number, number>();
  for (const m of ((data ?? []) as Record<string, unknown>[])) {
    const idea = (m.structured_idea as Record<string, unknown>) ?? {};
    for (const key of ['entry', 'level', 'trigger', 'stop', 'target']) {
      const n = Number(idea[key]);
      if (!Number.isFinite(n)) continue;
      // Round to the nearest dollar: "504.10" and "504" are the same level in a
      // conversation, and treating them as two would find no consensus at all.
      const bucket = Math.round(n);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
  }
  let best: { level: number; n: number } | null = null;
  for (const [level, n] of counts) {
    if (!best || n > best.n) best = { level, n };
  }
  // One mention is not a consensus.
  return best && best.n >= 2 ? best.level : null;
}
