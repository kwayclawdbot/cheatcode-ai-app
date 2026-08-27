/**
 * The decision chain (audit §9 / consolidation rule 9): discovery → research →
 * alert → plan → order → position → review, kept linked and visible.
 *
 * This is the workspace's "history" tab and the position detail's timeline. It
 * is assembled from the rows that actually exist — nothing is narrated that did
 * not happen, and every entry carries the route back to the thing it is about,
 * so the chain is auditable and not just a story.
 */
import type { HistoryEvent } from '@shared/api';
import { serviceClient } from '../db';
import { SIDE_LABEL } from './paper';

export async function decisionChain(opts: {
  userId: string;
  symbol?: string;
  limit?: number;
}): Promise<HistoryEvent[]> {
  const db = serviceClient();
  const symbol = opts.symbol?.toUpperCase();
  const limit = opts.limit ?? 30;
  const out: HistoryEvent[] = [];

  const [setups, alerts, plans, orders, positions] = await Promise.all([
    symbol
      ? db.from('setups').select('id,symbol,state,thesis_plain,created_at').eq('symbol', symbol).limit(5)
      : Promise.resolve({ data: [] }),
    (() => {
      const q = db
        .from('alerts')
        .select('id,status,natural_language,refs,created_at')
        .eq('user_id', opts.userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return symbol ? q.contains('refs', { symbol } as never) : q;
    })(),
    (() => {
      const q = db
        .from('trade_plans')
        .select('id,symbol,status,intent,stop,created_at')
        .eq('user_id', opts.userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return symbol ? q.eq('symbol', symbol) : q;
    })(),
    (() => {
      const q = db
        .from('orders')
        .select('id,symbol,side,qty,status,created_at')
        .eq('user_id', opts.userId)
        .neq('status', 'draft')
        .neq('status', 'previewed')
        .order('created_at', { ascending: false })
        .limit(limit);
      return symbol ? q.eq('symbol', symbol) : q;
    })(),
    (() => {
      const q = db
        .from('positions')
        .select('id,symbol,direction,qty,avg_cost,opened_at,closed_at,realized_pnl')
        .eq('user_id', opts.userId)
        .order('opened_at', { ascending: false })
        .limit(limit);
      return symbol ? q.eq('symbol', symbol) : q;
    })(),
  ]);

  for (const r of (setups.data ?? []) as Record<string, unknown>[]) {
    out.push({
      kind: 'setup',
      id: String(r.id),
      at: String(r.created_at),
      plain: `Kai spotted a setup on ${String(r.symbol)}${r.thesis_plain ? ` — ${String(r.thesis_plain)}` : ''}`,
      route: `/symbol/${String(r.symbol)}?tab=overview&setup=${String(r.id)}`,
    });
  }

  for (const r of (alerts.data ?? []) as Record<string, unknown>[]) {
    const status = String(r.status);
    out.push({
      kind: 'alert',
      id: String(r.id),
      at: String(r.created_at),
      plain:
        status === 'triggered'
          ? `Your watch hit: ${String(r.natural_language ?? 'a condition you set')}`
          : `You set a watch: ${String(r.natural_language ?? 'a condition')}`,
      route: `/alert/${String(r.id)}`,
    });
  }

  for (const r of (plans.data ?? []) as Record<string, unknown>[]) {
    out.push({
      kind: 'plan',
      id: String(r.id),
      at: String(r.created_at),
      plain: `You built a plan on ${String(r.symbol)}${r.stop === null || r.stop === undefined ? '' : ` with the exit at $${Number(r.stop)}`}.`,
      route: `/plan/${String(r.id)}`,
    });
  }

  for (const r of (orders.data ?? []) as Record<string, unknown>[]) {
    const side = String(r.side) as keyof typeof SIDE_LABEL;
    out.push({
      kind: 'order',
      id: String(r.id),
      at: String(r.created_at),
      plain: `${SIDE_LABEL[side]} ${Number(r.qty)} ${String(r.symbol)} — ${String(r.status).replace('_', ' ')}.`,
      route: `/order/${String(r.id)}`,
    });
  }

  for (const r of (positions.data ?? []) as Record<string, unknown>[]) {
    out.push({
      kind: 'position',
      id: String(r.id),
      at: String(r.opened_at),
      plain: `Position opened: ${String(r.direction)} ${Number(r.qty)} ${String(r.symbol)} at $${Number(r.avg_cost)}.`,
      route: `/position/${String(r.id)}`,
    });
    if (r.closed_at) {
      const pnl = r.realized_pnl === null || r.realized_pnl === undefined ? null : Number(r.realized_pnl);
      out.push({
        kind: 'position',
        id: String(r.id),
        at: String(r.closed_at),
        plain:
          pnl === null
            ? `Position closed on ${String(r.symbol)}.`
            : `Position closed on ${String(r.symbol)} — ${pnl >= 0 ? 'up' : 'down'} $${Math.abs(pnl)}.`,
        route: `/position/${String(r.id)}`,
      });
    }
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
