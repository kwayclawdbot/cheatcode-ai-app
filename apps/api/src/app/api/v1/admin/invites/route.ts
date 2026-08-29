/**
 * GET|POST /api/v1/admin/invites — the codes, and making one.
 *
 * A code carries a tier and an entitlements envelope, an optional cap and an
 * optional expiry, and it is unguessable: `new_invite_code()` in SQL draws ~59
 * bits from a 30-glyph alphabet with no ambiguous characters, so it survives
 * being read down a phone (0025 §11).
 *
 * `duration_days` is FOLDED INTO `entitlements`, not stored beside it, because
 * `redeem_invite` reads exactly one key out of that jsonb —
 * `entitlements->>'duration_days'` — and a second copy in a column would be a
 * second copy to disagree with.
 *
 * `person_id` makes it a PERSONAL invite: the code becomes a `crm_identities`
 * row of kind `invite_code` against that person, so when it is redeemed the
 * redemption resolves back to whoever it was made for rather than creating a
 * stranger (brief §6).
 */
import { AdminCreateInviteRequest, AdminInviteResponse, AdminInvitesQuery, AdminInvitesResponse } from '@shared/api';
import { ok, parseBody, parseQuery, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { INVITE_COLUMNS, createInvite, shapeInvite, type InviteRecord } from '@/lib/admin/invites';
import { inviteTotals } from '@/lib/admin/metrics';
import { decodeCursor, encodeCursor } from '@/lib/admin/cursor';

export const dynamic = 'force-dynamic';

export const GET = staffed(async (req, ctx: StaffCtx) => {
  const q = parseQuery(req, AdminInvitesQuery);
  const db = serviceClient();
  const cursor = decodeCursor(q.cursor);

  // Filtering by `state` happens AFTER the read, because three of the four
  // states are functions of the clock and the cap rather than of a column —
  // there is nothing to put in a `where`. The page size is the page size
  // either way, so a filtered page can be short; `next_cursor` still walks.
  let sel = db
    .from('invites')
    .select(INVITE_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(q.limit + 1);
  if (cursor) {
    sel = sel.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  }
  const { data, error } = await sel;
  if (error) throw error;

  const rows = (data ?? []) as InviteRecord[];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const shaped = page.map(shapeInvite).filter((i) => !q.state || i.state === q.state);

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'invite.list',
    targetKind: 'invite',
    targetId: null,
    after: { returned: shaped.length, state: q.state ?? null },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminInvitesResponse.parse({
      invites: shaped,
      next_cursor: hasMore && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
      totals: await inviteTotals(),
      plain: shaped.length ? `${shaped.length} codes.` : 'No codes yet.',
    })
  );
});

export const POST = staffed(
  async (req, ctx: StaffCtx) => {
    const body = await parseBody(req, AdminCreateInviteRequest);
    const db = serviceClient();

    if (body.person_id) {
      const { data, error } = await db.from('crm_people').select('id').eq('id', body.person_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError('NOT_FOUND', 'We could not find the person you are making this for.');
    }

    const entitlements: Record<string, unknown> = { ...body.entitlements };
    if (body.duration_days !== undefined) entitlements.duration_days = body.duration_days;

    const invite = await createInvite({
      label: body.label,
      tier: body.tier,
      entitlements,
      maxRedemptions: body.max_redemptions ?? null,
      expiresAt: body.expires_in_days
        ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60_000).toISOString()
        : null,
      codeLength: body.code_length,
      createdBy: ctx.user.id,
    });

    if (body.person_id) {
      // `do nothing` on conflict: the code is brand new so this cannot collide
      // in practice, and if it somehow did, quietly moving an identity between
      // people is the one thing `unique (kind, value)` exists to stop.
      const { error } = await db
        .from('crm_identities')
        .upsert(
          [{ person_id: body.person_id, kind: 'invite_code', value: invite.code, source: 'admin', verified: true }],
          { onConflict: 'kind,value', ignoreDuplicates: true }
        );
      if (error) throw error;
    }

    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'invite.create',
      targetKind: 'invite',
      targetId: invite.id,
      after: {
        code: invite.code,
        tier: invite.tier,
        entitlements,
        max_redemptions: invite.max_redemptions,
        expires_at: invite.expires_at,
        person_id: body.person_id ?? null,
      },
      reason: body.label ?? null,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      AdminInviteResponse.parse({
        invite: shapeInvite(invite),
        plain: `Code ${invite.code}. Send it however you like — there is no email provider wired up, and a code works today.`,
      }),
      { status: 201 }
    );
  },
  { min: 'admin' }
);
