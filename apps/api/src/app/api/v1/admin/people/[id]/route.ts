/**
 * GET /api/v1/admin/people/[id] — one person's file.
 *
 * THIS IS THE ROUTE THE AUDIT RULE WAS WRITTEN FOR. Opening a person's page is
 * a read, and it writes `crm.person.read` with the actor, the target and the
 * request id — because the damage an admin surface does is somebody opening two
 * thousand of these on their last day, and a log of writes shows that as
 * nothing at all (brief §3).
 *
 * WHAT IS AND IS NOT IN THE RESPONSE. Identities, timeline, notes, redemptions,
 * subscription, entitlements, tags, merge conflicts — and for Kai, a
 * CONVERSATION COUNT AND A TIMESTAMP. Not one word of what they said. Reading
 * that is `POST …/transcript`, which demands a reason and audits separately.
 */
import type { NextRequest } from 'next/server';
import { AdminPersonResponse } from '@shared/api';
import { ok, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { loadEntitlements } from '@/lib/entitlements';
import { writeAudit } from '@/lib/admin/audit';
import {
  identities,
  kaiActivity,
  loadPerson,
  mergeConflicts,
  mergedFrom,
  notes,
  redemptions,
  shapeScores,
  timeline,
} from '@/lib/admin/people';

export const dynamic = 'force-dynamic';

export const GET = staffedParams<{ id: string }>(async (req: NextRequest, ctx: StaffCtx & { params: { id: string } }) => {
  const db = serviceClient();
  const person = await loadPerson(ctx.params.id);
  if (!person) throw new ApiError('NOT_FOUND', 'We could not find that person.');

  const url = new URL(req.url);
  const cursor = url.searchParams.get('timeline_cursor') ?? undefined;

  // The scores live on the same row and are read again rather than threaded
  // through `loadPerson`'s typed shape: nine nullable numbers with their own
  // "not tracked yet" sentence is a block, not nine fields on a person.
  const { data: raw, error: rawErr } = await db
    .from('crm_people')
    .select(
      'score_engagement,score_buy_propensity,score_churn_risk,score_upsell_propensity,score_crosssell_propensity,score_responsiveness,score_predicted_ltv_cents,score_predicted_days_to_churn,scores_updated_at'
    )
    .eq('id', ctx.params.id)
    .single();
  if (rawErr) throw rawErr;

  const [ids, tl, ns, rs, conflicts, from, kai, sub] = await Promise.all([
    identities(person.id),
    timeline(person.id, 50, cursor),
    notes(person.id),
    redemptions(person.id),
    mergeConflicts(person.id),
    mergedFrom(person.id),
    kaiActivity(person.app_user_id),
    person.app_user_id
      ? db
          .from('subscriptions')
          .select('tier,status,current_period_end,stripe_customer_id')
          .eq('user_id', person.app_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const ent = person.app_user_id ? await loadEntitlements(person.app_user_id) : null;

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.person.read',
    targetKind: 'crm_person',
    targetId: person.id,
    after: { app_user_id: person.app_user_id, status: person.status },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminPersonResponse.parse({
      person,
      identities: ids,
      timeline: tl.rows,
      timeline_next_cursor: tl.nextCursor,
      notes: ns,
      redemptions: rs,
      subscription: sub.data
        ? {
            tier: (sub.data as { tier: string }).tier,
            status: (sub.data as { status: string }).status,
            current_period_end: (sub.data as { current_period_end: string | null }).current_period_end,
            stripe_customer_id: (sub.data as { stripe_customer_id: string | null }).stripe_customer_id,
          }
        : null,
      entitlements: ent?.flags ?? {},
      scores: shapeScores(raw as Record<string, unknown>),
      kai,
      merged_from: from,
      merge_conflicts: conflicts,
      plain: person.plain,
    })
  );
});
