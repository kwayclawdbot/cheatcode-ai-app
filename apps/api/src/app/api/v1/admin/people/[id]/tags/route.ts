/**
 * POST /api/v1/admin/people/[id]/tags — add and remove, never replace.
 *
 * The request says what to ADD and what to REMOVE rather than handing over a
 * new array, because two operators tagging the same person a second apart would
 * otherwise silently overwrite each other. A set difference is commutative; a
 * replacement is a race.
 *
 * The audit row carries the before and after arrays, so a tag that appeared
 * from nowhere has a name against it.
 */
import { AdminTagsRequest, AdminTagsResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(async (req, ctx: StaffCtx & { params: { id: string } }) => {
  const body = await parseBody(req, AdminTagsRequest);
  const db = serviceClient();

  const { data, error } = await db
    .from('crm_people')
    .select('id,tags')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('NOT_FOUND', 'We could not find that person.');

  const before = ((data as { tags: string[] }).tags ?? []).map((t) => t.trim()).filter(Boolean);
  const removing = new Set((body.remove ?? []).map((t) => t.trim().toLowerCase()));
  const after = [...new Set([...before.filter((t) => !removing.has(t.toLowerCase())), ...(body.add ?? []).map((t) => t.trim())])];

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const { error: upErr } = await db.from('crm_people').update({ tags: after }).eq('id', ctx.params.id);
    if (upErr) throw upErr;
  }

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.tags.update',
    targetKind: 'crm_person',
    targetId: ctx.params.id,
    before: { tags: before },
    after: { tags: after },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(AdminTagsResponse.parse({ tags: after, plain: after.length ? `Tagged: ${after.join(', ')}.` : 'No tags on this person.' }));
});
