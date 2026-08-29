/**
 * POST /api/v1/push/test — "Send a test".
 *
 * The point of this route is NOT to prove the plumbing to us; it is to answer
 * the user's question, which is always "is this broken, or is it me". So it
 * returns what was suppressed and WHY. A test that quietly sends nothing and
 * reports success is the single most confusing thing a notifications screen can
 * do.
 *
 * It bypasses the CATEGORY switches — the user just pressed the button, so
 * telling them their community switch is off answers a question nobody asked —
 * and it bypasses the daily budget, for the same reason. It does NOT bypass
 * quiet hours: if we would be silent right now for a real alert, we are silent
 * now, and we say so. That is the answer the user actually needs.
 *
 * It writes a real inbox row, because the banner copy IS the inbox copy and a
 * test that skipped the inbox would be a second copy path. Rate limited to one
 * a minute so the inbox cannot be filled with them.
 */
import type { NextRequest } from 'next/server';
import { PushTestResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { notify } from '@/lib/notify';
import { enqueuePush, drainPush } from '@/lib/push/send';
import { ensureDevDrainer } from '@/lib/push/drain-dev';

export const dynamic = 'force-dynamic';

const TITLE = 'Notifications are on.';
const BODY = 'This is what a Cheat Code notification looks like.';

export const POST = authed(async (_req: NextRequest, ctx: Ctx) => {
  rateLimit({
    key: `push-test:${ctx.user.id}`,
    limit: 1,
    windowMs: 60_000,
    messagePlain: 'One test a minute. Give the last one a moment to arrive.',
  });

  ensureDevDrainer();

  // `push:'skip'` because this route enqueues itself, with trigger 'test'.
  const notificationId = await notify({
    userId: ctx.user.id,
    kind: 'system',
    titlePlain: TITLE,
    bodyPlain: BODY,
    route: '/account/notifications',
    payload: { test: true },
    requestId: ctx.requestId,
    push: 'skip',
  });
  if (!notificationId) {
    throw new ApiError('INTERNAL', 'We could not send a test just now. Please try again.');
  }

  const enqueued = await enqueuePush({
    notificationId,
    userId: ctx.user.id,
    kind: 'system',
    requestId: ctx.requestId,
    trigger: 'test',
  });

  // Awaited here, unlike the notify path: the user is standing in front of the
  // screen waiting for an answer, and "queued" is not an answer.
  if (enqueued.queued > 0) await drainPush({ requestId: ctx.requestId });

  const db = serviceClient();
  const { data } = await db
    .from('notification_deliveries')
    .select('state,reason')
    .eq('notification_id', notificationId);
  const rows = (data ?? []) as { state: string; reason: string | null }[];
  const sent = rows.filter((r) => r.state === 'sent' || r.state === 'delivered').length;

  // A row that failed at the transport is a suppression from the user's point
  // of view — they did not get a buzz — and it must say so rather than be
  // counted as sent.
  const failed = rows
    .filter((r) => r.state === 'failed')
    .map((r) => ({
      reason: r.reason ?? 'failed',
      plain: 'One of your devices did not accept it. Try setting that device up again.',
      subscription_id: null,
    }));

  const suppressed = [...enqueued.suppressed, ...failed];

  return ok(
    PushTestResponse.parse({
      sent,
      suppressed,
      plain:
        sent > 0
          ? sent === 1
            ? 'Sent to one device.'
            : `Sent to ${sent} devices.`
          : (suppressed[0]?.plain ?? 'Nothing to send to yet.'),
    })
  );
});
