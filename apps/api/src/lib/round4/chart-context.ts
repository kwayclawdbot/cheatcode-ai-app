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
import { normalizeTargets, type SetupRow } from '../kai/context';
import { entryOf } from '../execution/plans';
import type { ChartContext } from '../kai/chart-commands';

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

  const [setupRes, planRes, candles] = await Promise.all([
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
    getCandles(symbol, '1d', daysAgo(150), lastTradingDate()),
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

  const last = candles.candles.length ? candles.candles[candles.candles.length - 1].c : null;
  const tech = computeTechnicals({ candles: candles.candles, price: last });

  // The room's most-mentioned level, from structured ideas members actually
  // posted. Null when nobody has named one — Kai then cannot "highlight the
  // community level", and says so rather than drawing a plausible line.
  const roomId = (setup as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;
  const communityLevel = roomId ? await mostMentionedLevel(roomId) : null;

  const lastDate = lastTradingDate();
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
