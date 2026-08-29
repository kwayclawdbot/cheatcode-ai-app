/**
 * Notifications (01 §8, BUILD-BRIEF-round-2 "Notifications", round 5 §3).
 *
 * Rows are created on: alert activated · alert triggered · order filled ·
 * position closed · Kai replies to your @Kai in a room · a debrief is ready ·
 * the paper account is reset. Every row carries a deep link route so the inbox
 * can open the thing it is about.
 *
 * ONE NOTIFICATION, TWO TRANSPORTS. Round 5 made this the single writer for
 * push as well: the in-app row is written exactly as before, and then one
 * `notification_deliveries` row is enqueued per outcome. The inbox and the buzz
 * say the same thing because they ARE the same row — there is no second copy of
 * the sentence anywhere in `lib/push/`.
 *
 * A PUSH CAN NEVER FAIL AN ORDER. This is a financial product and `notify()` is
 * called from the middle of a fill, a trigger and a debrief. Everything below
 * the notification insert is wrapped, timed out and swallowed: the worst a
 * broken push service may do to a trade is leave a `queued` row behind.
 */
import type { NotificationGroup } from '@shared/api';
import { serviceClient } from './db';
import { log } from './log';
import { callRpc } from './rpc';
import { drainPush, enqueuePush } from './push/send';
import { ensureDevDrainer } from './push/drain-dev';

/**
 * The push step is awaited (the ledger must be written before we answer, or a
 * suppression has no record) but never for long: a slow database cannot be
 * allowed to hold an order response open.
 */
const ENQUEUE_TIMEOUT_MS = 2_500;
/** The fire-and-forget send. Hosted, the cron does this anyway. */
const DRAIN_TIMEOUT_MS = 5_000;

/**
 * Resolves null on timeout. The underlying promise is NOT cancelled — the
 * insert it is doing is still wanted, we simply stop waiting for it. Nothing
 * downstream reads the null as "nothing happened"; it reads it as "not in time
 * to tell you about", which is the honest reading.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        (timer as unknown as { unref?: () => void }).unref?.();
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  /**
   * 'skip' writes the inbox row and enqueues nothing. Used by `POST /push/test`,
   * which needs to enqueue with `trigger:'test'` itself and read back what was
   * suppressed — see the route. Everything else takes the default.
   */
  push?: 'auto' | 'skip';
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
    const id = typeof rpc.data === 'string' ? rpc.data : ((rpc.data as { id?: string })?.id ?? null);
    if (id) await push(id, opts, requestId);
    return id;
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
    const id = String((data as Record<string, unknown>).id);
    await push(id, opts, requestId);
    return id;
  } catch (e) {
    log('warn', requestId, 'notification.threw', {
      kind: opts.kind,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * The transport half. Wrapped in every direction on purpose:
 *
 *   - `enqueuePush` is raced against a timeout, so a stalled database cannot
 *     hold an order response open;
 *   - every throw is caught and logged as a warning, never rethrown;
 *   - the drain is fire-and-forget with its own timeout, because the API
 *     response must not wait on Apple, Google or Mozilla.
 *
 * The in-app row has already been written by the time this runs. If everything
 * here fails, the user still has the thing in their inbox — which is the whole
 * reason the two halves are in this order.
 */
async function push(
  notificationId: string,
  opts: { userId: string; kind: NotifyKind; push?: 'auto' | 'skip' },
  requestId: string
): Promise<void> {
  if (opts.push === 'skip') return;
  try {
    ensureDevDrainer();
    const queued = await withTimeout(
      enqueuePush({ notificationId, userId: opts.userId, kind: opts.kind, requestId }),
      ENQUEUE_TIMEOUT_MS
    );
    if (!queued || queued.queued === 0) return;
    void withTimeout(drainPush({ requestId }), DRAIN_TIMEOUT_MS).catch(() => {});
  } catch (e) {
    log('warn', requestId, 'push.notify_failed', {
      kind: opts.kind,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
