/**
 * Loading side of open positions: the row plus everything the UI needs to say
 * something true about it — the mark, its freshness, the plan's stop and target,
 * the exit style, and whether it came from the dev fixture.
 *
 * `mark_price` / `mark_ts` land with SCHEMA-3's 0020. Until then this reads them
 * when present and falls back to a live delayed quote, so the surfaces work on
 * either database and the freshness label is always the truth about the number
 * being shown — never a stored mark rendered as if it were current.
 */
import type { Freshness, OpenPositionRow, ExitStyle } from '@shared/api';
import { serviceClient } from '../db';
import { getSnapshot } from '../market/polygon';
import { normalizeTargets } from '../kai/context';
import { isSimulated } from '../debriefs';
import { toOpenPositionRow, type PositionExtras } from './shape';

export const POSITION_VIEW_COLUMNS =
  'id,user_id,account_id,symbol,direction,qty,avg_cost,opened_at,closed_at,realized_pnl,mode,origin,origin_plan_id,origin_setup_id,origin_room_id';

/** 0020 keeps the mark AND the bracket levels on the position itself. */
const MARK_COLUMNS = 'mark_price,mark_ts,unrealized_pnl,stop,target';

export type LoadedPositions = {
  rows: OpenPositionRow[];
  degraded: boolean;
  degraded_reason: string | null;
};

type MarkColumns = {
  mark_price?: unknown;
  mark_ts?: unknown;
  unrealized_pnl?: unknown;
  stop?: unknown;
  target?: unknown;
};

async function readWithMarks(userId: string, closed: boolean, id?: string) {
  const db = serviceClient();
  const build = (cols: string) => {
    let q = db.from('positions').select(cols).eq('user_id', userId);
    q = closed ? q.not('closed_at', 'is', null) : q.is('closed_at', null);
    if (id) q = q.eq('id', id);
    return q.order('opened_at', { ascending: false }).limit(100);
  };
  const withMarks = await build(`${POSITION_VIEW_COLUMNS},${MARK_COLUMNS}`);
  if (!withMarks.error) return (withMarks.data ?? []) as unknown as (Record<string, unknown> & MarkColumns)[];
  const plain = await build(POSITION_VIEW_COLUMNS);
  return (plain.data ?? []) as unknown as (Record<string, unknown> & MarkColumns)[];
}

export async function loadOpenPositions(opts: {
  userId: string;
  closed?: boolean;
  id?: string;
}): Promise<LoadedPositions> {
  const db = serviceClient();
  const rows = await readWithMarks(opts.userId, Boolean(opts.closed), opts.id);
  if (!rows.length) return { rows: [], degraded: false, degraded_reason: null };

  const planIds = [...new Set(rows.map((r) => String(r.origin_plan_id ?? '')).filter(Boolean))];
  const plans = new Map<string, { stop: number | null; target: number | null; exitStyle: ExitStyle; simulated: boolean }>();
  if (planIds.length) {
    const { data } = await db.from('trade_plans').select('id,stop,targets,exit_style,origin').in('id', planIds);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      const targets = normalizeTargets(p.targets);
      plans.set(String(p.id), {
        stop: p.stop === null || p.stop === undefined ? null : Number(p.stop),
        target: targets[0]?.price ?? null,
        exitStyle: String(p.exit_style ?? 'auto') === 'alert_assisted' ? 'alert_assisted' : 'auto',
        simulated: isSimulated((p.origin as Record<string, unknown>) ?? undefined),
      });
    }
  }

  // Fall back to a live delayed quote for anything with no stored mark.
  const needQuote = rows.filter((r) => r.mark_price === null || r.mark_price === undefined).map((r) => String(r.symbol));
  const quoteBy = new Map<string, { price: number | null; ts: string | null; freshness: Freshness }>();
  let degraded = false;
  let degradedReason: string | null = null;
  if (needQuote.length) {
    const snap = await getSnapshot([...new Set(needQuote)]);
    for (const q of snap.quotes) quoteBy.set(q.symbol, { price: q.price, ts: q.source_ts, freshness: q.freshness });
    degraded = snap.degraded;
    degradedReason = snap.degraded_reason;
  }

  const shaped = rows.map((r) => {
    const plan = plans.get(String(r.origin_plan_id ?? ''));
    const stored = r.mark_price === null || r.mark_price === undefined ? null : Number(r.mark_price);
    const q = quoteBy.get(String(r.symbol));
    // The position's own stop/target are the authority (0020 keeps them in sync
    // with the plan and with the resting legs); the plan is the fallback.
    const ownStop = r.stop === null || r.stop === undefined ? null : Number(r.stop);
    const ownTarget = r.target === null || r.target === undefined ? null : Number(r.target);
    const extras: PositionExtras = {
      stop: ownStop ?? plan?.stop ?? null,
      target: ownTarget ?? plan?.target ?? null,
      exitStyle: plan?.exitStyle ?? 'auto',
      markPrice: stored ?? q?.price ?? null,
      markTs: stored !== null ? ((r.mark_ts as string) ?? null) : (q?.ts ?? null),
      markFreshness: stored !== null ? 'delayed' : (q?.freshness ?? 'stale'),
      simulated: isSimulated((r.origin as Record<string, unknown>) ?? undefined) || Boolean(plan?.simulated),
    };
    return toOpenPositionRow(r as Record<string, unknown>, extras);
  });

  return { rows: shaped, degraded, degraded_reason: degradedReason };
}
