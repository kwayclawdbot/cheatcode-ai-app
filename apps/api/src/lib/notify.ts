/**
 * In-app notifications (01 §8, BUILD-BRIEF-round-2 "Notifications").
 *
 * Rows are created on: alert activated · Kai replies to your @Kai in a room ·
 * a debrief is ready · the paper account is reset. Every row carries a deep
 * link route so the inbox can open the thing it is about.
 *
 * There is no push worker in this round — `channel:'in_app'` only, and
 * `sent_at` stays null so a future push sender can pick these up.
 */
import type { NotificationGroup } from '@shared/api';
import { serviceClient } from './db';
import { log } from './log';
import { callRpc } from './rpc';

export type NotifyKind =
  | 'alert_activated'
  | 'alert_trigger'
  | 'kai_room_reply'
  | 'debrief_ready'
  | 'paper_reset'
  | 'system';

/** Inbox grouping (S72): what needs you · what changed · for information. */
export const NOTIF_GROUP: Record<NotifyKind, NotificationGroup> = {
  alert_trigger: 'action_required',
  debrief_ready: 'action_required',
  alert_activated: 'changes',
  kai_room_reply: 'changes',
  paper_reset: 'fyi',
  system: 'fyi',
};

export async function notify(opts: {
  userId: string;
  kind: NotifyKind;
  titlePlain: string;
  bodyPlain: string;
  route?: string | null;
  payload?: Record<string, unknown>;
  requestId?: string;
}): Promise<string | null> {
  const payload = {
    title_plain: opts.titlePlain,
    body_plain: opts.bodyPlain,
    route: opts.route ?? null,
    group: NOTIF_GROUP[opts.kind],
    ...(opts.payload ?? {}),
  };
  const requestId = opts.requestId ?? '-';

  // Preferred: the 0018 `notify` RPC (insert inside the caller's transaction).
  const rpc = await callRpc<{ id?: string } | string>(
    'notify',
    { p_user_id: opts.userId, p_kind: opts.kind, p_payload: payload },
    requestId
  );
  if (rpc.ok) {
    // 0018 returns the `notifications` row; older shapes returned the id.
    return typeof rpc.data === 'string' ? rpc.data : ((rpc.data as { id?: string })?.id ?? null);
  }
  if (!rpc.missing) return null;

  // Fallback: direct insert. `notifications` exists since 0008.
  try {
    const db = serviceClient();
    const { data, error } = await db
      .from('notifications')
      .insert({ user_id: opts.userId, channel: 'in_app', kind: opts.kind, payload: payload as never })
      .select('id')
      .single();
    if (error) {
      log('warn', requestId, 'notification.insert_failed', { kind: opts.kind, message: error.message });
      return null;
    }
    return String((data as Record<string, unknown>).id);
  } catch (e) {
    log('warn', requestId, 'notification.threw', {
      kind: opts.kind,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
