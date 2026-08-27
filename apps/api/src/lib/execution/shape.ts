/**
 * Row → wire shaping for orders and positions.
 *
 * Every status sentence here is written for someone who has never placed an
 * order. The single most important distinction in the whole file: ACCEPTED IS
 * NOT FILLED. `accepted_at` and `filled_at` are separate fields, `status_plain`
 * says which one happened, and no copy anywhere implies a fill that has not
 * been booked.
 */
import type {
  ExitStyle,
  OrderEventRow,
  OrderRow,
  OrderStatus,
  OrderType,
  OpenPositionRow,
  PlainAction,
  PositionEffect,
  Freshness,
  AppMode,
} from '@shared/api';
import { PAPER_FILL_PLAIN } from '@shared/api';
import { SIDE_LABEL, directionFor, round2, unrealized } from './paper';

export const STATUS_PLAIN: Record<OrderStatus, string> = {
  draft: 'Not sent. Nothing has left this screen.',
  previewed: 'Reviewed, not sent. Nothing happens until you confirm.',
  submitted: 'Sent. Waiting for it to be accepted.',
  accepted: 'Accepted, not filled. It is live and waiting for its price.',
  partially_filled: 'Part of it filled. The rest is still working.',
  filled: 'Filled.',
  rejected: 'Rejected. Nothing was bought or sold.',
  cancelled: 'Cancelled. Nothing was bought or sold.',
};

export function isRestingStatus(status: OrderStatus): boolean {
  return status === 'accepted' || status === 'submitted' || status === 'partially_filled';
}

/**
 * `orders.leg` is the authority from 0020. `preview.bracket_role` is the
 * pre-0020 fallback written by the TypeScript path in `engine.ts`.
 */
export function bracketRoleOf(row: Record<string, unknown>): 'entry' | 'stop' | 'target' | null {
  const leg = row.leg;
  if (leg === 'stop' || leg === 'target' || leg === 'entry') return leg;
  const preview = (row.preview as Record<string, unknown>) ?? {};
  const role = preview.bracket_role;
  if (role === 'stop' || role === 'target' || role === 'entry') return role;
  return row.bracket_group ? 'entry' : null;
}

/** The paper driver's own envelope (0020): resting, exit_style, bracket, … */
export function execMetaOf(row: Record<string, unknown>): Record<string, unknown> {
  const meta = row.exec_meta;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

export function toOrderRow(
  row: Record<string, unknown>,
  fills: Record<string, unknown>[],
  events: Record<string, unknown>[]
): OrderRow {
  const id = String(row.id);
  const mine = fills.filter((f) => String(f.order_id) === id);
  // 0020 keeps `filled_qty` / `avg_fill_price` on the row; the fills are the
  // fallback so this shaping works on either schema and can never disagree.
  const fromFills = round2(mine.reduce((a, f) => a + Number(f.qty ?? 0), 0));
  const filledQty =
    row.filled_qty === null || row.filled_qty === undefined ? fromFills : round2(Number(row.filled_qty));
  const notional = mine.reduce((a, f) => a + Number(f.qty ?? 0) * Number(f.price ?? 0), 0);
  const avgFill =
    row.avg_fill_price === null || row.avg_fill_price === undefined
      ? fromFills > 0
        ? round2(notional / fromFills)
        : null
      : round2(Number(row.avg_fill_price));
  const status = String(row.status) as OrderStatus;
  const side = String(row.side) as PositionEffect;
  const mineEvents = events.filter((e) => String(e.order_id) === id);
  const stampFor = (to: OrderStatus, column?: unknown) => {
    if (typeof column === 'string') return column;
    return (mineEvents.find((e) => String(e.to_status) === to)?.created_at as string | undefined) ?? null;
  };

  const qty = Number(row.qty);
  const limit = row.limit_price === null || row.limit_price === undefined ? null : Number(row.limit_price);
  const stop = row.stop_price === null || row.stop_price === undefined ? null : Number(row.stop_price);
  const role = bracketRoleOf(row);

  const plain = (() => {
    const head = `${SIDE_LABEL[side]} ${qty} ${String(row.symbol)}`;
    if (status === 'filled' && avgFill !== null) return `${head} — filled at $${avgFill}.`;
    if (status === 'partially_filled' && avgFill !== null) {
      return `${head} — ${filledQty} filled at $${avgFill}, ${round2(qty - filledQty)} still working.`;
    }
    if (status === 'accepted' && role === 'stop') return `${head} — your stop, armed at $${stop ?? '—'}.`;
    if (status === 'accepted' && role === 'target') return `${head} — your target, armed at $${limit ?? '—'}.`;
    if (status === 'accepted') return `${head} — accepted and waiting${limit !== null ? ` for $${limit}` : ''}. Accepted is not filled.`;
    if (status === 'cancelled') return `${head} — cancelled. Nothing was bought or sold.`;
    if (status === 'rejected') return `${head} — rejected. Nothing was bought or sold.`;
    return `${head} — ${STATUS_PLAIN[status]}`;
  })();

  return {
    id,
    status,
    accepted_at: stampFor('accepted', row.accepted_at),
    filled_at: stampFor('filled', row.filled_at),
    symbol: String(row.symbol),
    side,
    side_label: SIDE_LABEL[side],
    type: String(row.type) as OrderType,
    qty,
    filled_qty: filledQty,
    avg_fill_price: avgFill,
    limit_price: limit,
    stop_price: stop,
    duration: String(row.duration ?? 'day'),
    plan_id: (row.plan_id as string) ?? null,
    bracket_group: (row.bracket_group as string) ?? null,
    bracket_role: role,
    resting: isRestingStatus(status) && filledQty < qty,
    driver: 'paper',
    reject_reason: (row.reject_reason as string) ?? null,
    created_at: String(row.created_at),
    status_plain: STATUS_PLAIN[status],
    plain,
  };
}

/**
 * 0020's own events carry a machine `event` name, not prose — the copy lives
 * here, so the timeline reads the same whether the row was written by the RPC
 * or by the TypeScript fallback. An event with no sentence is a blank line in
 * someone's order history, which is worse than useless.
 */
const EVENT_PLAIN: Record<string, string> = {
  previewed: 'Order prepared for review. Nothing is sent until you confirm.',
  submitted: 'Order sent. Nothing has filled yet.',
  accepted: 'Accepted. It is live and waiting for its price — accepted is not filled.',
  partially_filled: 'Part of it filled. The rest is still working.',
  filled: 'Filled.',
  cancelled: 'Cancelled. Nothing was bought or sold.',
  rejected: 'Rejected. Nothing was bought or sold.',
};

export function toOrderEventRows(events: Record<string, unknown>[]): OrderEventRow[] {
  return events.map((e) => {
    const payload = (e.payload as Record<string, unknown>) ?? {};
    const to = (e.to_status as OrderStatus) ?? null;
    const written = typeof payload.plain === 'string' ? payload.plain : '';
    const qty = payload.fill_qty ?? payload.qty;
    const price = payload.fill_price ?? payload.price;
    const derived =
      to === 'filled' || to === 'partially_filled'
        ? price !== undefined && price !== null
          ? `${to === 'filled' ? 'Filled' : 'Partially filled —'} ${qty ?? ''} at $${round2(Number(price))}.`.replace('  ', ' ')
          : (EVENT_PLAIN[to] ?? '')
        : payload.leg
          ? `${String(payload.leg) === 'stop' ? 'Stop' : 'Target'} armed at $${round2(Number(payload.level ?? 0))}. Armed is not filled.`
          : (to ? (EVENT_PLAIN[to] ?? '') : '');
    return {
      from_status: (e.from_status as OrderStatus) ?? null,
      to_status: to,
      at: String(e.created_at),
      plain: written || derived,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Positions                                                            */
/* ------------------------------------------------------------------ */

export type PositionExtras = {
  stop: number | null;
  target: number | null;
  exitStyle: ExitStyle;
  markPrice: number | null;
  markTs: string | null;
  markFreshness: Freshness;
  simulated: boolean;
  debriefId?: string | null;
};

/**
 * Health is about the PLAN, not about the P/L: a position that is green but
 * sitting on its stop is at risk, and a red one with room to its stop is not
 * broken yet. `unknown` when there is no stop to measure against — never a
 * cheerful "healthy" for a position with no defined exit.
 */
export function positionHealth(
  direction: 'long' | 'short',
  mark: number | null,
  stop: number | null,
  target: number | null
): { health: OpenPositionRow['health']; plain: string } {
  if (mark === null || stop === null) {
    return {
      health: 'unknown',
      plain:
        stop === null
          ? 'There is no stop on this one, so there is no level that tells you it has gone wrong.'
          : 'I have no current price for this one, so I cannot tell you where it stands.',
    };
  }
  const span = target !== null ? Math.abs(target - stop) : Math.abs(mark - stop) * 2;
  const toStop = direction === 'long' ? mark - stop : stop - mark;
  if (toStop <= 0) {
    return { health: 'at_risk', plain: `Price is through your stop at $${stop}. This one needs a decision now.` };
  }
  if (span > 0 && toStop / span < 0.25) {
    return {
      health: 'at_risk',
      plain: `Price is close to your stop at $${stop}. The idea is under pressure — that is what the level is for.`,
    };
  }
  return {
    health: 'healthy',
    plain: `Thesis intact — nothing to do. Your stop at $${stop} is still ${round2(Math.abs(toStop))} away.`,
  };
}

export function toOpenPositionRow(row: Record<string, unknown>, x: PositionExtras): OpenPositionRow {
  const direction = String(row.direction) as 'long' | 'short';
  const qty = Number(row.qty);
  const avg = Number(row.avg_cost);
  const upl = unrealized(direction, qty, avg, x.markPrice);
  const cost = qty * avg;
  const health = positionHealth(direction, x.markPrice, x.stop, x.target);
  const symbol = String(row.symbol);

  const plain = (() => {
    const held = `${direction === 'long' ? 'Long' : 'Short'} ${qty} ${symbol} from $${round2(avg)}`;
    if (upl === null) return `${held}. No current price, so no profit or loss to show.`;
    if (upl > 0) return `${held} — up $${Math.abs(upl)} so far.`;
    if (upl < 0) return `${held} — down $${Math.abs(upl)} so far.`;
    return `${held} — flat.`;
  })();

  const actions: PlainAction[] = [
    { action: 'manage', label: 'Manage', route: `/position/${String(row.id)}`, primary: true, enabled: true, hint: null },
    {
      action: 'exit_now',
      label: 'Exit now',
      route: `/position/${String(row.id)}?close=1`,
      primary: false,
      enabled: true,
      hint: null,
    },
    { action: 'ask_kai', label: 'Ask Kai', route: null, primary: false, enabled: true, hint: null },
  ];

  return {
    id: String(row.id),
    symbol,
    direction,
    qty,
    avg_cost: round2(avg),
    mark_price: x.markPrice,
    mark_ts: x.markTs,
    mark_freshness: x.markFreshness,
    unrealized_pnl: upl,
    unrealized_pct: upl === null || cost === 0 ? null : round2((upl / cost) * 100),
    day_pnl: upl,
    stop: x.stop,
    target: x.target,
    health: health.health,
    health_plain: health.plain,
    exit_style: x.exitStyle,
    opened_at: String(row.opened_at),
    mode: String(row.mode) as AppMode,
    origin_plan_id: (row.origin_plan_id as string) ?? null,
    origin_setup_id: (row.origin_setup_id as string) ?? null,
    origin_room_id: (row.origin_room_id as string) ?? null,
    simulated: x.simulated,
    plain: x.simulated ? `${plain} (simulated)` : plain,
    route: `/position/${String(row.id)}`,
    actions,
  };
}

export function sideFor(direction: 'long' | 'short'): PositionEffect {
  return direction === 'long' ? 'sell_to_close' : 'buy_to_cover';
}

export { PAPER_FILL_PLAIN, directionFor };
