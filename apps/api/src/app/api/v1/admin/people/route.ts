/**
 * GET /api/v1/admin/people — search, filter, and never a list of 2,507.
 *
 * `limit` is capped at 100 by the schema and paging is a keyset cursor, so
 * there is no parameter a client can raise to pull the whole table. `searched`
 * comes back in the response so the UI states exactly which fields the `q`
 * touched rather than implying it searched everything.
 *
 * `segment_id` applies a SAVED FILTER, and applying it runs the same code path
 * as typing the same filters by hand — nothing here evaluates the stored jsonb
 * as a query. A key the API does not know about is ignored, not executed.
 */
import type { NextRequest } from 'next/server';
import { AdminPeopleQuery, AdminPeopleResponse, AdminSegmentFilter } from '@shared/api';
import type { PeopleFilter } from '@/lib/admin/people';
import { ok, parseQuery, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { SEARCH_FIELDS, searchPeople } from '@/lib/admin/people';

export const dynamic = 'force-dynamic';

export const GET = staffed(async (req: NextRequest, ctx: StaffCtx) => {
  const q = parseQuery(req, AdminPeopleQuery);

  let filter: PeopleFilter = {
    status: q.status,
    tier: q.tier,
    source: q.source,
    tag: q.tag,
    q: q.q,
  };

  if (q.segment_id) {
    const db = serviceClient();
    const { data, error } = await db
      .from('crm_segments')
      .select('name,filter')
      .eq('id', q.segment_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError('NOT_FOUND', 'We could not find that saved segment.');
    const stored = AdminSegmentFilter.safeParse((data as { filter: unknown }).filter ?? {});
    // A stored filter that no longer parses is IGNORED rather than raised: a
    // segment saved against a field the API dropped must not break the People
    // screen for everybody. The explicit query params still apply.
    if (stored.success) filter = { ...stored.data, ...stripUndefined(filter) };
  }

  const result = await searchPeople({ filter, limit: q.limit, cursor: q.cursor });

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'admin.people.search',
    targetKind: 'crm_people',
    targetId: null,
    after: { filter, returned: result.people.length, segment_id: q.segment_id ?? null },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminPeopleResponse.parse({
      people: result.people,
      next_cursor: result.nextCursor,
      total: result.total,
      searched: SEARCH_FIELDS.slice(0, 3),
      plain: result.people.length
        ? `${result.people.length} people${result.nextCursor ? ', and more after these' : ''}.`
        : 'Nobody matches that.',
    })
  );
});

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
