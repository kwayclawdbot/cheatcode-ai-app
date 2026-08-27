/**
 * GET /api/v1/alerts/:id
 *
 * The alert detail screen: the plain sentence first, the structured logic
 * behind a disclosure, what data it depends on, its status history out of
 * `user_events`, the things it came from resolved to labels the app can show,
 * and exactly one primary action.
 */
import type { NextRequest } from 'next/server';
import { AlertDetailResponse, type AlertStatus, type OriginRef, type UiAction } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { alertRow, monitoringFor } from '../shape';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at';

const EVENT_PLAIN: Record<string, string> = {
  alert_drafted: 'You asked me to watch this.',
  alert_activated: 'You armed it and I started watching.',
  alert_paused: 'You paused it.',
  alert_resumed: 'You started it again.',
  alert_cancelled: 'You called it off.',
  alert_edited: 'You changed what it watches — the new version is a draft until you arm it.',
  setup_followed: 'It came from a setup you followed.',
};

/** Condition atoms → one sentence a beginner reads without help. */
export function conditionPlain(condition: unknown, fallback: string): string {
  const c = condition as { compose?: string; atoms?: Record<string, unknown>[] } | null;
  const atoms = Array.isArray(c?.atoms) ? c!.atoms : [];
  if (!atoms.length) return fallback;

  const parts = atoms.map((a) => {
    const sym = typeof a.symbol === 'string' ? a.symbol : 'it';
    const val = a.value;
    switch (a.atom) {
      case 'price_cross':
        return `${sym} trades ${a.operator === 'crosses_down' || a.operator === 'below' ? 'below' : 'above'} $${val}`;
      case 'price_range':
        return `${sym} sits between $${val} and $${a.value_2}`;
      case 'pct_change':
        return `${sym} moves ${val}% on the day`;
      case 'rvol_min':
        return `${sym} trades on at least ${val} times its usual volume`;
      case 'volume_above':
        return `${sym} trades more than ${val} shares`;
      case 'setup_state':
        return `the ${sym} setup reaches "${val}"`;
      case 'time_at':
        return `the clock reaches ${val}`;
      case 'catalyst_within':
        return `${sym} has a catalyst inside ${val}`;
      default:
        return `${sym} meets a condition I cannot put in words yet`;
    }
  });

  const joiner = c?.compose === 'any' ? ' or ' : ' and ';
  return `I will tell you when ${parts.join(joiner)}.`;
}

function actionsFor(status: AlertStatus): UiAction[] {
  const a = (action: string, label: string, primary = false, enabled = true, hint: string | null = null): UiAction => ({
    action,
    label,
    enabled,
    hint,
    primary,
    route: null,
  });
  switch (status) {
    case 'draft':
      return [a('activate', 'Activate', true), a('edit', 'Change it'), a('cancel', 'Delete')];
    case 'active':
      return [a('pause', 'Pause', true), a('edit', 'Change it'), a('cancel', 'Cancel')];
    case 'paused':
      return [a('resume', 'Start watching again', true), a('edit', 'Change it'), a('cancel', 'Cancel')];
    default:
      return [a('edit', 'Watch it again', true)];
  }
}

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const found = await db
    .from('alerts')
    .select(COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (found.error) {
    throw new ApiError('INTERNAL', 'We could not open that watch. Please try again.', {
      detail: found.error.message,
    });
  }
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that watch.');

  const status = String(row.status) as AlertStatus;
  const m = monitoringFor(status);
  const refs = (row.refs as Record<string, unknown>) ?? {};

  const events = await db
    .from('user_events')
    .select('seq,event_type,payload,occurred_at')
    .eq('user_id', ctx.user.id)
    .eq('entity_type', 'alert')
    .eq('entity_id', ctx.params.id)
    .order('seq', { ascending: true })
    .limit(50);

  const history = [
    {
      seq: null,
      at: String(row.created_at),
      event: 'created',
      plain: 'You asked me to watch this.',
    },
    ...((events.data ?? []) as Record<string, unknown>[]).map((e) => {
      const payload = (e.payload as Record<string, unknown>) ?? {};
      const name = String(payload.event ?? e.event_type);
      return {
        seq: Number(e.seq),
        at: String(e.occurred_at),
        event: name,
        plain: EVENT_PLAIN[name] ?? String(payload.summary_plain ?? 'Something changed on this watch.'),
      };
    }),
  ];

  // Originating references, resolved to labels — never raw ids on screen.
  const origin: OriginRef[] = [];
  if (typeof refs.setup_id === 'string') {
    const setup = await db
      .from('setups')
      .select('symbol,grade_display,state')
      .eq('id', refs.setup_id)
      .maybeSingle();
    const s = setup.data as Record<string, unknown> | null;
    origin.push({
      kind: 'setup',
      label: s ? `${s.symbol} setup · ${s.grade_display ?? '—'} · ${s.state}` : 'A setup you followed',
      route: `/setup/${refs.setup_id}`,
    });
  }
  if (typeof refs.symbol === 'string') {
    origin.push({ kind: 'symbol', label: String(refs.symbol), route: `/symbol/${refs.symbol}` });
  }
  if (typeof refs.level === 'number') {
    origin.push({ kind: 'level', label: `$${refs.level}`, route: null });
  }
  if (typeof refs.room_id === 'string') {
    const room = await db.from('rooms').select('name').eq('id', refs.room_id).maybeSingle();
    origin.push({
      kind: 'room',
      label: String((room.data as Record<string, unknown> | null)?.name ?? 'A room conversation'),
      route: `/room/${refs.room_id}`,
    });
  }

  const shaped = alertRow(row);

  return ok(
    AlertDetailResponse.parse({
      alert: shaped,
      condition_plain: conditionPlain(row.condition, shaped.summary_plain),
      structured: (row.condition as Record<string, unknown>) ?? {},
      data_dependency: (row.data_dependency as Record<string, unknown>) ?? {},
      monitoring: m.monitoring,
      monitoring_plain: m.plain,
      history,
      origin,
      actions: actionsFor(status),
    })
  );
});
