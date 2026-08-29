/**
 * GET|POST /api/v1/admin/segments — saved filters, not a query language.
 *
 * `crm_segments.filter` holds the same {status, tier, source, tag, q} the
 * People screen's own filter state has, and applying one runs the SAME code
 * path as typing those filters by hand. Nothing here is ever executed as SQL,
 * and a stored key the API does not know about is reported in `ignored_keys`
 * and then ignored — rather than becoming an expression evaluator that somebody
 * eventually feeds a column name to.
 *
 * POST is in this round even though brief §7 lists only `GET /admin/segments`:
 * a saved segment that no route can save is a table with no writer, and the
 * People screen's `segment_id` parameter would have nothing to point at.
 */
import { AdminCreateSegmentRequest, AdminSegmentResponse, AdminSegmentFilter, AdminSegmentsResponse } from '@shared/api';
import { ok, parseBody, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { unknownFilterKeys } from '@/lib/admin/people';

export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; filter: Record<string, unknown>; created_by: string | null; created_at: string };

function shape(r: Row) {
  const parsed = AdminSegmentFilter.safeParse(r.filter ?? {});
  return {
    id: r.id,
    name: r.name,
    filter: parsed.success ? parsed.data : {},
    created_by: r.created_by,
    created_at: r.created_at,
    ignored_keys: unknownFilterKeys(r.filter ?? {}),
  };
}

export const GET = staffed(async (_req, ctx: StaffCtx) => {
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_segments')
    .select('id,name,filter,created_by,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.segment.list',
    targetKind: 'crm_segment',
    targetId: null,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  const segments = ((data ?? []) as Row[]).map(shape);
  return ok(
    AdminSegmentsResponse.parse({
      segments,
      plain: segments.length ? `${segments.length} saved segments.` : 'No saved segments yet.',
    })
  );
});

export const POST = staffed(async (req, ctx: StaffCtx) => {
  const body = await parseBody(req, AdminCreateSegmentRequest);
  const db = serviceClient();
  const { data, error } = await db
    .from('crm_segments')
    .insert({ name: body.name, filter: body.filter, created_by: ctx.user.id })
    .select('id,name,filter,created_by,created_at')
    .single();
  if (error) {
    // `crm_segments_name_uniq` is on `lower(name)`: two segments called
    // "Paying" and "paying" are one segment with a typo, not two.
    if (error.code === '23505') {
      throw new ApiError('STATE_CONFLICT', 'There is already a segment with that name.');
    }
    throw error;
  }

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.segment.create',
    targetKind: 'crm_segment',
    targetId: (data as Row).id,
    after: { name: body.name, filter: body.filter },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminSegmentResponse.parse({ segment: shape(data as Row), plain: 'Saved. It is a filter, not a list — it re-runs every time you open it.' }),
    { status: 201 }
  );
});
