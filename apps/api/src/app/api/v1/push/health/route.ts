/**
 * GET /api/v1/push/health — is the sender actually running?
 *
 * Not user data, but authenticated: a queue depth is an operational fact about
 * this deployment and there is no reason for it to be public.
 *
 * The two questions it exists to answer, both of which have been asked of every
 * push system ever built:
 *   "why did nothing arrive"   → `queued` climbing with `last_drain_at` stale
 *                                means nothing is ticking (brief §11.3: no cron,
 *                                no push), not that the policy suppressed it.
 *   "is native real yet"       → `expo.dry_run` true means NOTHING was contacted.
 */
import type { NextRequest } from 'next/server';
import { PushHealthResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { expoDryRun } from '@/lib/push/expo';
import { vapidConfigured } from '@/lib/push/web';
import { lastDrainAt } from '@/lib/push/send';
import { devDrainerStatus, ensureDevDrainer } from '@/lib/push/drain-dev';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) => {
  ensureDevDrainer();
  const db = serviceClient();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [queued, awaiting, failed] = await Promise.all([
    db.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('state', 'queued'),
    db
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'sent')
      .eq('transport', 'expo')
      .not('ticket_id', 'is', null)
      .is('receipt_checked_at', null),
    db
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'failed')
      .gte('created_at', dayAgo),
  ]);

  const dry = expoDryRun();
  const vapid = vapidConfigured();
  const drainer = devDrainerStatus();
  const last = lastDrainAt();

  return ok(
    PushHealthResponse.parse({
      transports: {
        expo: {
          configured: true,
          dry_run: dry,
          plain: dry
            ? 'Native push is in dry-run: messages are built and logged, and nothing is contacted. No APNs or FCM credentials exist yet.'
            : 'Native push will contact Expo. Delivery still depends on APNs and FCM credentials.',
        },
        web: {
          configured: vapid,
          vapid,
          plain: vapid
            ? 'Web push is configured and will really send.'
            : 'No VAPID key pair on this server, so no browser can be sent to.',
        },
      },
      queue: {
        queued: queued.count ?? 0,
        awaiting_receipt: awaiting.count ?? 0,
        failed_24h: failed.count ?? 0,
      },
      last_drain_at: last,
      dev_drainer: { on: drainer.on, interval_s: drainer.interval_s },
      plain:
        (queued.count ?? 0) > 0 && !last
          ? 'There are messages waiting and nothing has drained them yet.'
          : 'The sender is configured.',
    })
  );
});
