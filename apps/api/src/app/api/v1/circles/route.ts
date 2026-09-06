/**
 * GET  /api/v1/circles
 * POST /api/v1/circles  {symbol, ttl}
 *
 * Circles are the time-boxed rooms on the Community board. The three core
 * rooms are the base and never expire; a circle exists while the thing it is
 * about is worth talking about (see lib/round4/circles.ts).
 *
 * =====================================================================
 * WHO MAY OPEN ONE: STAFF. NOT A TIER.
 * =====================================================================
 * Owner instruction, 2026-09-05: "user community chats.. Circles should be
 * admin created based". So the gate is no longer `entitlement_flags`
 * (`circles_create`, which used to say "premium members may"); it is
 * `staff_role(user_id)`, asked of the database on this request, `admin` and
 * above. Migration 0031 sets the old flag false on both tiers and records that
 * nothing reads it, so a database read by eye tells the same story this file
 * does.
 *
 * WHY `admin` AND NOT `support`. The staff ladder is ordered by blast radius,
 * not seniority (0025 §1). Opening a Circle publishes a room with the club's
 * name on it to every member's Community board — that is a publishing act.
 * Removing a post and muting a member inside a room support already reads is a
 * smaller act, and that one is `support` (see lib/moderation.ts). The two
 * minimums are written once each, in `@shared/api`.
 *
 * THE GATE IS ON THE SERVER, AND IT ANSWERS HONESTLY.
 * `can_create` in the GET is a COURTESY — it tells the app whether to draw the
 * "+" — and it controls nothing. The POST asks again, on its own, every time.
 * A member who calls POST anyway gets FORBIDDEN and a sentence naming the real
 * reason, NOT the NOT_FOUND that `staffed()` gives the admin surface: /circles
 * is a route every member legitimately uses, its existence is not a secret,
 * and answering 404 to somebody looking at the list they just loaded would be
 * a lie about which part they cannot use.
 */
import type { NextRequest } from 'next/server';
import {
  CIRCLE_CREATE_MIN_ROLE,
  CIRCLE_TTL_HOURS,
  CirclesResponse,
  CreateCircleRequest,
  CreateCircleResponse,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { atLeast, loadStaffRole } from '@/lib/admin/staff';
import { writeAudit } from '@/lib/admin/audit';
import { emitUserEvent } from '@/lib/events';
import { CIRCLE_TTL_OPTIONS, createCircle, listCircles, timeLeftPlain } from '@/lib/round4/circles';

export const dynamic = 'force-dynamic';

/**
 * The one sentence a member reads when they cannot open a Circle. It says who
 * can, and it says what they CAN do, because "no" with nothing after it is the
 * worst version of this message.
 */
const NOT_STAFF_PLAIN =
  'Circles are opened by the Cheat Code team, not by members. You can join and post in every circle that is open, and in all three club rooms.';

/**
 * Support asked, and support is staff — so this one names the ladder rather
 * than the product rule. They already know the route exists.
 */
const UNDER_RANKED_PLAIN =
  'Opening a circle is an admin action. Your access covers moderating rooms, not creating them.';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const [result, role] = await Promise.all([
    listCircles({ userId: ctx.user.id }),
    loadStaffRole(ctx.user.id),
  ]);
  const allowed = role !== null && atLeast(role, CIRCLE_CREATE_MIN_ROLE);

  return ok(
    CirclesResponse.parse({
      circles: result.circles,
      can_create: allowed,
      create_label: 'Open a circle',
      create_hint: allowed
        ? 'Pick a symbol and how long it should stay open. It closes on its own.'
        : role
          ? UNDER_RANKED_PLAIN
          : NOT_STAFF_PLAIN,
      ttl_options: CIRCLE_TTL_OPTIONS,
      empty_copy: 'No circles are open right now. The team opens one when a name is worth a room.',
      degraded: result.degraded,
      degraded_reason: result.degraded_reason,
    })
  );
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateCircleRequest);

  // Asked here, on this request, and never taken from the token. A role revoked
  // at 10:00 is still in a JWT at 10:59; this is a fresh answer.
  const role = await loadStaffRole(ctx.user.id);
  if (!role) throw new ApiError('FORBIDDEN', NOT_STAFF_PLAIN);
  if (!atLeast(role, CIRCLE_CREATE_MIN_ROLE)) throw new ApiError('FORBIDDEN', UNDER_RANKED_PLAIN);

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
    { event: 'circle_created', symbol, ttl_hours: hours, by_role: role },
    ctx.requestId
  );
  // A Circle is a room the whole club sees, opened by a named member of staff.
  // That belongs in the staff record, not only in a user event.
  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'community.circle.create',
    targetKind: 'room',
    targetId: created.id,
    after: { symbol, ttl_hours: hours },
    requestId: ctx.requestId,
  });

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
