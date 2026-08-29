/**
 * The paper tick: mark-to-market and bracket evaluation with no worker.
 *
 * There is no execution worker in this round (03 Unit 4 is a Python service on
 * Railway that does not exist yet), so the API does the smallest honest version
 * of its job: for every symbol with an open position or a resting order, take
 * one quote and hand it to `apply_paper_tick`, which — in ONE
 * transaction per user+symbol — fills crossed resting entries, fires `auto`
 * bracket legs, and re-marks every open position.
 *
 * WHO DOES WHAT
 *   0020's RPC   the books: fills, position mutations, account, order_events,
 *                user_events. It fires `auto` legs itself.
 *   this file    the quotes, the loop, and the human end of an `alert_assisted`
 *                leg. The RPC reports those in `needs_attention` and does NOT
 *                execute them; the Attention alert and the notification are
 *                raised here, because that is where the copy lives.
 *
 * DATA BUDGET. `getSnapshot()` covers EVERY symbol in ONE call, so a tick costs
 * one request regardless of how many symbols are in flight. That was a
 * necessity under the old five-a-minute plan and it is still the right shape.
 * When the budget guard does trip the token bucket serves the cache and the
 * tick reports `degraded` — it never queues, and it never invents a print to
 * fill against.
 *
 * FRESHNESS IS CARRIED, NOT ASSUMED. Every mark travels with the freshness the
 * quote came back with, and the tick's own sentence is written from what the
 * marks actually were. This file used to say "against delayed prices" in a
 * string, which was true on the old entitlement and is a claim nothing checks.
 *
 * EXIT STYLE is the difference that matters, and the copy never blurs it:
 *   auto            — the leg executes. The stop is real protection.
 *   alert_assisted  — the leg does NOT execute. A notification arrives with
 *                     one-tap close, and it says so.
 */
import type { PaperTickRound4Response, PaperTickResponse, PositionEffect } from '@shared/api';
import { PAPER_FILL_PLAIN } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { emitUserEvent } from '../events';
import { getSnapshot } from '../market/polygon';
import { notify } from '../notify';
import { evaluateFill, round2 } from './paper';
import { ORDER_COLUMNS, applyFill, cancelSiblings, revalueAccount } from './engine';
import { rpcApplyPaperTick, type TickAttention } from './adapter';
import { armedAlertSymbols, evaluateArmedAlerts } from '../round4/alert-tick';
import { sweepCircles } from '../round4/circles';

const RESTING: string[] = ['accepted', 'submitted', 'partially_filled'];

type Mark = { price: number; ts: string; freshness: string };

/** `mark_price` / `mark_ts` / `unrealized_pnl` arrive with SCHEMA-3's 0020. */
let markColumnsPresent: boolean | null = null;

export async function runPaperTick(opts: {
  requestId: string;
  overrides?: Record<string, number>;
  userId?: string;
}): Promise<PaperTickRound4Response> {
  const db = serviceClient();
  const at = new Date().toISOString();

  // --- what is in flight -------------------------------------------------
  let posQ = db
    .from('positions')
    .select('id,user_id,account_id,symbol,direction,qty,avg_cost,origin_plan_id')
    .is('closed_at', null);
  if (opts.userId) posQ = posQ.eq('user_id', opts.userId);

  let ordQ = db.from('orders').select(ORDER_COLUMNS).eq('driver', 'paper').in('status', RESTING);
  if (opts.userId) ordQ = ordQ.eq('user_id', opts.userId);

  const [posRes, ordRes] = await Promise.all([posQ, ordQ]);
  const positions = (posRes.data ?? []) as Record<string, unknown>[];
  const orders = (ordRes.data ?? []) as Record<string, unknown>[];

  // Round 4: an armed alert is a reason to fetch a quote even with nothing open.
  // Watching → Active is only allowed on a VERIFIED condition (spec §9), and a
  // condition cannot be verified against a price we never asked for.
  const alertSymbols = await armedAlertSymbols(opts.userId);
  const symbols = [
    ...new Set([...positions, ...orders].map((r) => String(r.symbol)).concat(alertSymbols)),
  ].sort();

  // Circles open and close on their own clock, which has nothing to do with
  // whether this user has a position open — so the sweep runs on every tick.
  const swept = await sweepCircles({ requestId: opts.requestId });

  if (!symbols.length) {
    return {
      ticked_at: at,
      symbols: [],
      quote_source: 'none',
      positions_marked: 0,
      orders_filled: 0,
      legs_fired: 0,
      alerts_created: 0,
      degraded: false,
      degraded_reason: null,
      plain: 'Nothing is open and nothing is resting, so there was nothing to mark.',
      alerts_evaluated: 0,
      alerts_triggered: 0,
      circles_opened: swept.opened,
      circles_closed: swept.closed,
    };
  }

  // --- quotes: ONE snapshot call for every symbol ------------------------
  const marks = new Map<string, Mark>();
  let source: PaperTickResponse['quote_source'] = 'none';
  let degraded = false;
  let degradedReason: string | null = null;

  const overrides = opts.overrides ?? {};
  const overridden = Object.keys(overrides).map((s) => s.toUpperCase());
  for (const key of Object.keys(overrides)) {
    // An override is a price a developer typed. It is not market data, so it is
    // stamped now and labelled `delayed` — the one place in this file where a
    // freshness is declared rather than measured, because there is nothing to
    // measure. `quote_source: 'override'` says so on the response.
    marks.set(key.toUpperCase(), { price: overrides[key], ts: at, freshness: 'delayed' });
  }
  if (overridden.length) source = 'override';

  const needed = symbols.filter((s) => !marks.has(s));
  if (needed.length) {
    const snap = await getSnapshot(needed);
    for (const quote of snap.quotes) {
      if (quote.price === null) continue;
      marks.set(quote.symbol, { price: quote.price, ts: quote.source_ts ?? at, freshness: quote.freshness });
    }
    source = overridden.length ? 'override' : 'polygon';
    degraded = snap.degraded;
    degradedReason = snap.degraded_reason;
  }

  // --- armed alerts, against the same marks -------------------------------
  const alertEval = await evaluateArmedAlerts({
    marks: new Map([...marks].map(([sym, m]) => [sym, { price: m.price, ts: m.ts, freshness: m.freshness }])),
    userId: opts.userId,
    requestId: opts.requestId,
  });

  // --- per user + symbol -------------------------------------------------
  let marked = 0;
  let filled = 0;
  let legsFired = 0;
  let alertsCreated = 0;

  const pairs = new Set<string>();
  for (const r of [...positions, ...orders]) pairs.add(`${String(r.user_id)}|${String(r.symbol)}`);

  const touchedAccounts = new Set<string>();

  for (const pair of pairs) {
    const [userId, symbol] = pair.split('|');
    const mark = marks.get(symbol);
    if (!mark) continue;

    // --- preferred: one transaction per user + symbol --------------------
    const viaRpc = await rpcApplyPaperTick({
      userId,
      symbol,
      quote: { price: mark.price, source_ts: mark.ts, received_ts: at, freshness: mark.freshness },
      requestId: opts.requestId,
    });

    if (viaRpc.used) {
      marked += viaRpc.data.marked.length;
      filled += viaRpc.data.filled.length;
      legsFired += viaRpc.data.fired.length;

      // Every `auto` leg that executed gets its notification here.
      for (const fired of viaRpc.data.fired) {
        await notifyLegFilled({
          userId,
          symbol,
          orderId: fired.order_id,
          leg: fired.leg === 'stop' ? 'stop' : 'target',
          price: Number(fired.price),
          positionId: fired.position_id,
          requestId: opts.requestId,
        });
      }

      // `alert_assisted` legs did NOT execute. They become Attention.
      for (const attention of viaRpc.data.needs_attention) {
        const created = await raiseExitAlert({ userId, attention, requestId: opts.requestId });
        if (created) {
          alertsCreated += 1;
          legsFired += 1;
        }
      }
      continue;
    }

    // --- fallback (no 0020): mark positions ------------------------------
    for (const p of positions.filter((x) => String(x.user_id) === userId && String(x.symbol) === symbol)) {
      if (await writeMark(String(p.id), mark)) marked += 1;
      touchedAccounts.add(`${userId}|${String(p.account_id)}`);
    }

    // --- fallback: resting orders ----------------------------------------
    for (const o of orders.filter((x) => String(x.user_id) === userId && String(x.symbol) === symbol)) {
      const meta = (o.exec_meta as Record<string, unknown>) ?? {};
      const preview = (o.preview as Record<string, unknown>) ?? {};
      const role = (o.leg as string | undefined) ?? (preview.bracket_role as string | undefined);
      const exitStyle = String(meta.exit_style ?? preview.exit_style ?? 'auto');
      const side = String(o.side) as PositionEffect;

      const decision = evaluateFill({
        side,
        type: o.type as never,
        qty: Number(o.qty),
        last: mark.price,
        limitPrice: o.limit_price === null || o.limit_price === undefined ? null : Number(o.limit_price),
        stopPrice: o.stop_price === null || o.stop_price === undefined ? null : Number(o.stop_price),
      });
      if (!decision.fills || decision.price === null) continue;

      if ((role === 'stop' || role === 'target') && exitStyle === 'alert_assisted') {
        if (meta.triggered) continue;
        const level = role === 'stop' ? Number(o.stop_price) : Number(o.limit_price);
        const created = await raiseExitAlert({
          userId,
          attention: {
            order_id: String(o.id),
            leg: role,
            level,
            price: mark.price,
            symbol,
            position_id: null,
            exit_style: exitStyle,
          },
          requestId: opts.requestId,
        });
        await db
          .from('orders')
          .update({ exec_meta: { ...meta, triggered: true, triggered_at: at, trigger_price: mark.price } as never })
          .eq('id', String(o.id));
        if (created) {
          alertsCreated += 1;
          legsFired += 1;
        }
        continue;
      }

      const result = await applyFill({
        userId,
        order: o,
        qty: decision.qty,
        price: decision.price,
        ts: at,
        requestId: opts.requestId,
        liquidity: role ? `paper_${role}` : 'paper',
      });
      filled += 1;
      touchedAccounts.add(`${userId}|${String(o.account_id)}`);
      if (role === 'stop' || role === 'target') {
        legsFired += 1;
        if (o.bracket_group && result.status === 'filled') {
          await cancelSiblings(
            String(o.bracket_group),
            String(o.id),
            role === 'stop'
              ? 'Your stop filled, so the target was cancelled — one of them was always going to be the exit.'
              : 'Your target filled, so the stop was cancelled — one of them was always going to be the exit.'
          );
        }
        await notifyLegFilled({
          userId,
          symbol,
          orderId: String(o.id),
          leg: role,
          price: decision.price,
          positionId: result.positionId,
          requestId: opts.requestId,
        });
      }
    }
  }

  for (const key of touchedAccounts) {
    const [userId, accountId] = key.split('|');
    if (accountId && accountId !== 'undefined') await revalueAccount(userId, accountId);
  }

  return {
    ticked_at: at,
    symbols,
    quote_source: source,
    positions_marked: marked,
    orders_filled: filled,
    legs_fired: legsFired,
    alerts_created: alertsCreated,
    degraded,
    degraded_reason: degradedReason,
    plain: `Marked ${marked} position${marked === 1 ? '' : 's'} and filled ${filled} resting order${filled === 1 ? '' : 's'} against ${markQuality(marks)} prices. ${PAPER_FILL_PLAIN}`,
    alerts_evaluated: alertEval.evaluated,
    alerts_triggered: alertEval.triggered,
    circles_opened: swept.opened,
    circles_closed: swept.closed,
  };
}

/**
 * What the tick actually priced against, taken from the marks it used. The
 * worst freshness in the set wins: one stale symbol makes the sentence honest
 * about the whole run rather than averaging the problem away.
 */
function markQuality(marks: Map<string, Mark>): string {
  const all = [...marks.values()].map((m) => m.freshness);
  if (!all.length) return 'the last';
  if (all.includes('stale')) return 'the last prices we received, some of them stale,';
  if (all.every((f) => f === 'live')) return 'live';
  return 'delayed';
}

/**
 * Fallback-only. 0020 marks positions inside `apply_paper_tick`; on a database
 * without it the columns may not exist at all, so we detect that once and stop
 * trying rather than logging an error for every position on every tick.
 */
async function writeMark(positionId: string, mark: Mark): Promise<boolean> {
  if (markColumnsPresent === false) return false;
  const db = serviceClient();
  const { error } = await db
    .from('positions')
    .update({ mark_price: mark.price, mark_ts: mark.ts, updated_at: new Date().toISOString() })
    .eq('id', positionId);
  if (error) {
    if (error.code === '42703' || /column .* does not exist|schema cache/i.test(error.message ?? '')) {
      markColumnsPresent = false;
      log('warn', '-', 'paper.mark_columns_missing', { message: error.message });
      return false;
    }
    log('warn', '-', 'paper.mark_failed', { message: error.message });
    return false;
  }
  markColumnsPresent = true;
  return true;
}

async function notifyLegFilled(opts: {
  userId: string;
  symbol: string;
  orderId: string;
  leg: 'stop' | 'target';
  price: number;
  positionId: string | null;
  requestId: string;
}): Promise<void> {
  await notify({
    userId: opts.userId,
    kind: 'alert_trigger',
    titlePlain: opts.leg === 'stop' ? `${opts.symbol} stopped out` : `${opts.symbol} target hit`,
    bodyPlain:
      opts.leg === 'stop'
        ? `Your stop on ${opts.symbol} executed at $${round2(opts.price)}. That was the level you decided you were wrong at. ${PAPER_FILL_PLAIN}`
        : `Your target on ${opts.symbol} filled at $${round2(opts.price)}. ${PAPER_FILL_PLAIN}`,
    route: opts.positionId ? `/position/${opts.positionId}` : `/order/${opts.orderId}`,
    payload: { order_id: opts.orderId, leg: opts.leg, price: opts.price },
    requestId: opts.requestId,
  });
}

/**
 * An `alert_assisted` exit becomes an Attention alert plus a notification —
 * never a fill. The copy has to make the difference unmissable: this is a
 * message, not a stop that fired.
 *
 * Idempotent by `refs.order_id`: a leg that stays triggered across several
 * ticks raises exactly one alert.
 */
async function raiseExitAlert(opts: {
  userId: string;
  attention: TickAttention;
  requestId: string;
}): Promise<boolean> {
  const db = serviceClient();
  const a = opts.attention;

  const existing = await db
    .from('alerts')
    .select('id')
    .eq('user_id', opts.userId)
    .contains('refs', { order_id: a.order_id, kind: 'position_exit' } as never)
    .maybeSingle();
  if (existing.data) return false;

  const nl =
    a.leg === 'stop'
      ? `${a.symbol} reached your exit level of $${round2(a.level)}`
      : `${a.symbol} reached your target of $${round2(a.level)}`;

  const { data, error } = await db
    .from('alerts')
    .insert({
      user_id: opts.userId,
      status: 'triggered',
      natural_language: nl,
      condition: {
        all: [{ subject: 'price', op: a.leg === 'stop' ? 'lte' : 'gte', value: round2(a.level), symbol: a.symbol }],
      } as never,
      data_dependency: { symbols: [a.symbol], feeds: ['delayed_aggregates'] } as never,
      frequency: 'once',
      refs: {
        symbol: a.symbol,
        order_id: a.order_id,
        position_id: a.position_id,
        kind: 'position_exit',
        role: a.leg,
      } as never,
    })
    .select('id')
    .single();
  if (error) {
    log('warn', opts.requestId, 'paper.exit_alert_failed', { message: error.message });
    return false;
  }
  const alertId = String((data as Record<string, unknown>).id);

  await emitUserEvent(
    opts.userId,
    'alert_trigger',
    'alert',
    alertId,
    {
      symbol: a.symbol,
      role: a.leg,
      level: round2(a.level),
      price: round2(a.price),
      order_id: a.order_id,
      exit_style: 'alert_assisted',
      plain: `${nl}. Nothing was sold — you chose to be told instead.`,
    },
    opts.requestId
  );

  await notify({
    userId: opts.userId,
    kind: 'alert_trigger',
    titlePlain: `${a.symbol} hit your ${a.leg === 'stop' ? 'exit level' : 'target'}`,
    bodyPlain: `${nl}. You chose to be told rather than exited automatically — nothing has been sold. Open it to close in one tap.`,
    route: a.position_id ? `/position/${a.position_id}` : `/alert/${alertId}`,
    payload: { alert_id: alertId, order_id: a.order_id, symbol: a.symbol, role: a.leg },
    requestId: opts.requestId,
  });

  return true;
}
