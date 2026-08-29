/**
 * POST /api/v1/push/subscriptions   — register this device
 * GET  /api/v1/push/subscriptions   — the devices on this account
 *
 * A push token is a CAPABILITY TO BUZZ A DEVICE, so neither the handle nor the
 * web encryption keys are ever returned. There is no screen that needs to render
 * one, and a token in a response is a token in a log, a screenshot and a bug
 * report.
 *
 * Registration goes through 0024's `register_push_subscription` rather than an
 * insert, because registration is where a device's OWNER is decided:
 *   - re-registering your own revoked device re-activates it;
 *   - a handle already registered to somebody else is TAKEN OVER by the
 *     registrant (a handed-down phone, a shared browser profile). The token
 *     addresses whoever is holding the device now, and so must the row.
 * The RPC also refuses a `p_user_id` that is not the JWT's own. We call it with
 * the service-role client after authenticating the caller ourselves, so the id
 * we pass IS the authenticated user and cannot be supplied by the client.
 *
 * There is deliberately NO PostgREST fallback for the missing-RPC case, unlike
 * most of this app: a plain insert would skip the takeover rules above and
 * either fail on the unique index or leave a device pointed at the wrong
 * account. Better to say the server is not ready.
 */
import type { NextRequest } from 'next/server';
import {
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushSubscriptionsResponse,
  type PushSubscriptionRow,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { callRpc } from '@/lib/rpc';
import { vapidPublicKey } from '@/lib/push/web';
import { ensureDevDrainer } from '@/lib/push/drain-dev';

export const dynamic = 'force-dynamic';

const SELECT = 'id,transport,platform,device_label,state,created_at,last_success_at';

const STATE_PLAIN: Record<string, string> = {
  active: 'On',
  stale: 'Needs setting up again',
  revoked: 'Turned off',
};

function toRow(r: Record<string, unknown>): PushSubscriptionRow {
  const label =
    (r.device_label as string | null) ||
    (r.platform ? String(r.platform) : null) ||
    (r.transport === 'web' ? 'This browser' : 'This device');
  return {
    id: String(r.id),
    transport: r.transport as PushSubscriptionRow['transport'],
    platform: (r.platform as PushSubscriptionRow['platform']) ?? null,
    device_label: (r.device_label as string | null) ?? null,
    state: r.state as PushSubscriptionRow['state'],
    created_at: String(r.created_at),
    last_success_at: (r.last_success_at as string | null) ?? null,
    plain: `${label} — ${STATE_PLAIN[String(r.state)] ?? String(r.state)}`,
  };
}

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, PushSubscribeRequest);

  // A web subscription with no keys is storable and undeliverable by contract
  // (§12.1). We take it — refusing would leave a browser thinking it failed —
  // and the sender marks it stale the first time it is asked to send.
  const rpc = await callRpc<Record<string, unknown>>(
    'register_push_subscription',
    {
      p_transport: body.transport,
      p_handle: body.handle,
      p_keys: body.keys ?? null,
      p_platform: body.platform ?? (body.transport === 'web' ? 'web' : null),
      p_label: body.device_label ?? null,
      p_user_id: ctx.user.id,
    },
    ctx.requestId
  );

  if (!rpc.ok) {
    throw new ApiError('INTERNAL', 'We could not set this device up for notifications. Please try again.', {
      detail: rpc.missing ? 'register_push_subscription is not present' : rpc.message,
    });
  }

  // Local sender: from here on there is something to send to.
  ensureDevDrainer();

  const row = toRow(rpc.data);
  return ok(
    PushSubscribeResponse.parse({
      subscription: row,
      plain: 'This device will get notifications. You can turn it off here any time.',
    })
  );
});

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const [subs, prefs] = await Promise.all([
    db
      .from('push_subscriptions')
      .select(SELECT)
      .eq('user_id', ctx.user.id)
      .neq('state', 'revoked')
      .order('created_at', { ascending: true }),
    db.from('notification_prefs').select('push_enabled').eq('user_id', ctx.user.id).maybeSingle(),
  ]);

  const rows = ((subs.data ?? []) as Record<string, unknown>[]).map(toRow);
  const prefRow = prefs.data as { push_enabled?: boolean } | null;
  const pushEnabled = prefRow ? prefRow.push_enabled !== false : true;

  return ok(
    PushSubscriptionsResponse.parse({
      subscriptions: rows,
      push_enabled: pushEnabled,
      vapid_public_key: vapidPublicKey(),
      plain: !pushEnabled
        ? 'Notifications are switched off. Everything still lands in your inbox.'
        : rows.length === 0
          ? 'No device is set up yet.'
          : rows.length === 1
            ? 'One device is set up.'
            : `${rows.length} devices are set up.`,
    })
  );
});
