/**
 * Pieces of the asset workspace (V5 W1) that are worth keeping out of the route.
 *
 * The consolidation rule this serves: the SYMBOL is the canonical object, and a
 * setup is a MODULE inside it — not a competing destination with its own chart,
 * plan, evidence and actions (audit §2/§3).
 *
 * Community sentiment is computed from structured ideas members actually posted
 * about this symbol, and it is never returned without its sample size and its
 * caveat. An invented percentage — or a real one presented as evidence — is the
 * exact failure 08 §6 prohibits: popularity is not a reason.
 */
import type {
  CommunitySentiment,
  Confirmation,
  KeyLevel,
  OpenPositionRow,
  PlainAction,
  PositionModule,
  SetupModule,
  WhatChanged,
} from '@shared/api';
import { STATE_ACTION_LABEL } from '@shared/api';
import { serviceClient } from '../db';
import { buildConfirmations, isLong, levels, whyPlain } from '../setups';
import type { SetupRow } from '../kai/context';

export function action(act: string, label: string, route: string | null, primary = false, enabled = true, hint: string | null = null): PlainAction {
  return { action: act, label, route, primary, enabled, hint };
}

/**
 * The position, as a module on the workspace's Overview tab. It is the same row
 * Trade renders — narrowed, not recomputed, so the two surfaces can never
 * disagree about what a position is worth or whether it is in trouble.
 */
export function positionModule(p: OpenPositionRow): PositionModule {
  return {
    position_id: p.id,
    direction: p.direction,
    qty: p.qty,
    avg_cost: p.avg_cost,
    mark_price: p.mark_price,
    mark_ts: p.mark_ts,
    unrealized_pnl: p.unrealized_pnl,
    stop: p.stop,
    target: p.target,
    health: p.health,
    plain: `${p.plain} ${p.health_plain}`,
    actions: p.actions,
    route: p.route,
  };
}

export function keyLevels(row: SetupRow | null, quotePrice: number | null): KeyLevel[] {
  const out: KeyLevel[] = [];
  if (row) {
    const { entry, stop, targets } = levels(row);
    if (entry !== null) out.push({ label: 'Entry', price: entry, semantic: 'entry' });
    if (stop !== null) out.push({ label: 'Invalid', price: stop, semantic: 'invalidation' });
    for (const t of targets) out.push({ label: t.label ?? 'Target', price: t.price, semantic: 'target' });
  }
  if (!out.length && quotePrice !== null) {
    out.push({ label: 'Last', price: quotePrice, semantic: 'note' });
  }
  return out;
}

export function setupModule(row: SetupRow, quotePrice: number | null): SetupModule {
  const { entry, stop, targets } = levels(row);
  const state = String(row.state);
  const long = isLong(row.intent);
  const confirmations: Confirmation[] = buildConfirmations(row, quotePrice);

  const headline =
    state === 'ready'
      ? 'Every condition I set has happened. Your move.'
      : state === 'invalidated'
        ? 'This one is off — the level it leaned on gave way.'
        : state === 'forming'
          ? 'The confirmation I want is building. Not there yet.'
          : 'I am watching this. Nothing to do yet.';

  const actions: PlainAction[] = [
    action(
      state === 'ready' ? 'review_setup' : state === 'invalidated' ? 'review_change' : 'watch_this',
      STATE_ACTION_LABEL[state] ?? 'Watch this',
      null,
      true
    ),
    action('see_why', 'See why', null),
  ];
  if (state !== 'invalidated' && state !== 'expired') {
    actions.push(action('build_plan', 'Build a plan', `/plan/new?symbol=${row.symbol}&setup=${row.id}`));
  }

  return {
    setup_id: row.id,
    state: state as SetupModule['state'],
    grade_display: row.grade_display ?? null,
    entry,
    stop,
    targets,
    headline_plain: headline,
    why_plain: whyPlain(row),
    confirmations,
    actions,
  };
}

/**
 * "What changed" is assembled from real events, never narrated. When there is
 * nothing, the list is empty and the UI says nothing has changed — which is
 * itself useful information.
 */
export async function whatChanged(opts: {
  userId: string;
  symbol: string;
  setup: SetupRow | null;
  limit?: number;
}): Promise<WhatChanged[]> {
  const db = serviceClient();
  const out: WhatChanged[] = [];

  const { data } = await db
    .from('user_events')
    .select('event_type,entity_type,entity_id,payload,created_at')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: false })
    .limit(40);

  for (const e of (data ?? []) as Record<string, unknown>[]) {
    const payload = (e.payload as Record<string, unknown>) ?? {};
    const sym = typeof payload.symbol === 'string' ? payload.symbol : null;
    if (sym !== opts.symbol) continue;
    const plain = typeof payload.plain === 'string' ? payload.plain : `${String(e.event_type).replace('_', ' ')} on ${sym}`;
    const type = String(e.event_type);
    out.push({
      at: String(e.created_at),
      plain,
      semantic:
        type === 'alert_trigger' || (typeof payload.realized_pnl === 'number' && payload.realized_pnl < 0)
          ? 'risk'
          : type === 'fill' || type === 'position_update'
            ? 'positive'
            : 'neutral',
    });
    if (out.length >= (opts.limit ?? 5)) break;
  }

  if (opts.setup && out.length < (opts.limit ?? 5)) {
    const state = String(opts.setup.state);
    out.push({
      at: opts.setup.valid_until ?? new Date().toISOString(),
      plain:
        state === 'invalidated'
          ? `The ${opts.symbol} setup was invalidated — the level it depended on failed.`
          : state === 'ready'
            ? `The ${opts.symbol} setup reached every condition I defined.`
            : `The ${opts.symbol} setup is still ${state}.`,
      semantic: state === 'invalidated' ? 'risk' : state === 'ready' ? 'positive' : 'neutral',
    });
  }

  return out.slice(0, opts.limit ?? 5);
}

/**
 * Real sentiment or none. `sample` is the number of structured ideas actually
 * posted about this symbol — if nobody has written one, this returns null and
 * the workspace says discussion has not started, rather than showing 0%.
 */
export async function communitySentiment(symbol: string, roomIds: string[]): Promise<CommunitySentiment | null> {
  if (!roomIds.length) return null;
  const db = serviceClient();
  const { data } = await db
    .from('messages')
    .select('structured_idea,refs,created_at')
    .in('room_id', roomIds)
    .not('structured_idea', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const m of (data ?? []) as Record<string, unknown>[]) {
    const idea = (m.structured_idea as Record<string, unknown>) ?? {};
    const refs = (m.refs as Record<string, unknown>) ?? {};
    const sym = (typeof idea.symbol === 'string' ? idea.symbol : null) ?? (typeof refs.symbol === 'string' ? refs.symbol : null);
    if (sym !== symbol) continue;
    if (idea.direction === 'long') bullish += 1;
    else if (idea.direction === 'short') bearish += 1;
    else neutral += 1;
  }

  const sample = bullish + bearish + neutral;
  if (sample === 0) return null;
  const pct = Math.round((bullish / sample) * 100);

  return {
    sample,
    split: { bullish, bearish, neutral },
    label: `${pct}% bullish across ${sample} member idea${sample === 1 ? '' : 's'}`,
    caveat_plain:
      'This is what members think, from the ideas they wrote down. It is context, not evidence — a crowded side of a trade is not a reason to take it.',
  };
}

export async function verifiedClaims(symbol: string, limit = 3) {
  const db = serviceClient();
  const { data } = await db
    .from('kai_objects')
    .select('id,payload,refs,created_at')
    .eq('type', 'verification_card')
    .contains('refs', { symbol } as never)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map((o) => {
    const p = (o.payload as Record<string, unknown>) ?? {};
    return {
      claim: String(p.claim ?? 'a claim a member made'),
      result: String(p.result ?? 'unverifiable'),
      plain: String(p.plain ?? p.effect_on_setup ?? 'Checked against the data we have.'),
      at: (o.created_at as string) ?? null,
    };
  });
}
