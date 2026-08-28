/**
 * GET  /api/v1/circles
 * POST /api/v1/circles  {symbol, ttl}
 *
 * Circles are the time-boxed setup rooms on the Community board. The three core
 * rooms are the base and never expire; a circle exists while the setup it is
 * about is worth talking about (see lib/round4/circles.ts).
 *
 * CREATION IS GATED, AND THE GATE IS IN THE DATABASE.
 * `circles_create` is read from `entitlement_flags` for the caller's tier.
 * **A MISSING FLAG IS FALSE** — this lane cannot edit `supabase/seed.sql`
 * (SCHEMA-4 owns it), so until the flag is seeded nobody can create a circle
 * and the button comes back `can_create:false` with copy that says why. That is
 * the safe direction for a gate to fail: an ungated premium feature is a
 * revenue bug, an over-gated one is a message.
 *
 * To switch it on, SCHEMA-4 (or an operator) adds one row:
 *   insert into entitlement_flags (tier, flag, value)
 *   values ('premium', 'circles_create', 'true')
 *   on conflict (tier, flag) do update set value = excluded.value;
 */
import type { NextRequest } from 'next/server';
import {
  CIRCLES_CREATE_FLAG,
  CIRCLE_TTL_HOURS,
  CirclesResponse,
  CreateCircleRequest,
  CreateCircleResponse,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { PREMIUM_PRICE_PLAIN, entitlementRequired, loadEntitlements } from '@/lib/entitlements';
import { emitUserEvent } from '@/lib/events';
import { CIRCLE_TTL_OPTIONS, createCircle, listCircles, timeLeftPlain } from '@/lib/round4/circles';

export const dynamic = 'force-dynamic';

/** Missing flag = false. Documented above; asserted in the smoke test. */
function canCreate(flags: Record<string, unknown>): boolean {
  const raw = flags[CIRCLES_CREATE_FLAG];
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).replace(/"/g, '').toLowerCase();
  return s === 'true' || s === '1';
}

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const [result, ent] = await Promise.all([
    listCircles({ userId: ctx.user.id }),
    loadEntitlements(ctx.user.id),
  ]);
  const allowed = canCreate(ent.flags);

  return ok(
    CirclesResponse.parse({
      circles: result.circles,
      can_create: allowed,
      create_label: 'Create',
      create_hint: allowed
        ? 'Pick a symbol and how long it should stay open. It closes on its own.'
        : ent.tier === 'premium'
          ? 'Creating circles is not switched on for this account yet.'
          : `Creating a circle is a Premium feature (${PREMIUM_PRICE_PLAIN}). You can join any circle that is open.`,
      ttl_options: CIRCLE_TTL_OPTIONS,
      empty_copy: 'No circles are open right now. They appear when a setup is worth a room.',
      degraded: result.degraded,
      degraded_reason: result.degraded_reason,
    })
  );
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateCircleRequest);
  const ent = await loadEntitlements(ctx.user.id);
  if (!canCreate(ent.flags)) {
    throw entitlementRequired(
      'Creating a circle is a Premium feature. You can join any circle that is already open.',
      '/account/subscription'
    );
  }

  const symbol = body.symbol.toUpperCase();
  const db = serviceClient();
  const instrument = await db.from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  if (!instrument.data) {
    throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I cannot open a room about it.`);
  }

  const hours = CIRCLE_TTL_HOURS[body.ttl];
  const created = await createCircle({ userId: ctx.user.id, symbol, ttlHours: hours });
  if (!created) {
    throw new ApiError('INTERNAL', 'I could not open that circle. Please try again.');
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'room',
    created.id,
    { event: 'circle_created', symbol, ttl_hours: hours },
    ctx.requestId
  );

  const list = await listCircles({ userId: ctx.user.id, includeExpired: true });
  const row = list.circles.find((c) => c.id === created.id);
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

  return ok(
    CreateCircleResponse.parse({
      circle:
        row ??
        {
          id: created.id,
          symbol,
          name: `${symbol} Circle`,
          setup_id: null,
          members: 1,
          messages: 0,
          joined: true,
          expires_at: expiresAt,
          time_left_plain: timeLeftPlain(expiresAt).plain,
          expired: false,
          last_activity_at: null,
          route: `/circle/${created.id}`,
          grade: null,
        },
      plain: `Opened. This ${symbol} circle closes in ${CIRCLE_TTL_OPTIONS.find((o) => o.hours === hours)?.label ?? `${hours} hours`} and nothing is deleted when it does.`,
    }),
    { status: 201 }
  );
});
