/**
 * GET /api/v1/admin/audit — what staff did.
 *
 * The table is append-only for `service_role` — INSERT and SELECT and nothing
 * else, TRUNCATE included (0025 §16) — so this route can read the log and this
 * API can never rewrite it. That is the property that makes the log worth
 * reading at all.
 *
 * READING THE LOG IS ITSELF LOGGED. Not as ceremony: "who went looking through
 * the audit trail, and for whom" is exactly the question that matters when
 * something has gone wrong, and it is the one an unaudited audit screen cannot
 * answer. The row it writes carries the filter, so a search for one person's
 * name is visible as such.
 */
import { AdminAuditQuery, AdminAuditResponse } from '@shared/api';
import { ok, parseQuery, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { writeAudit } from '@/lib/admin/audit';
import { decodeCursor, encodeCursor } from '@/lib/admin/cursor';
import { displayNames } from '@/lib/admin/people';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  reason: string | null;
  request_id: string | null;
  ip: string | null;
  created_at: string;
};

export const GET = staffed(async (req, ctx: StaffCtx) => {
  const q = parseQuery(req, AdminAuditQuery);
  const db = serviceClient();
  const cursor = decodeCursor(q.cursor);

  let sel = db
    .from('admin_audit_log')
    .select('id,actor_user_id,action,target_kind,target_id,reason,request_id,ip,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(q.limit + 1);
  if (q.actor_user_id) sel = sel.eq('actor_user_id', q.actor_user_id);
  if (q.action) sel = sel.eq('action', q.action);
  if (q.target_kind) sel = sel.eq('target_kind', q.target_kind);
  if (q.target_id) sel = sel.eq('target_id', q.target_id);
  if (cursor) {
    sel = sel.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  }

  const { data, error } = await sel;
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const names = await displayNames([
    ...new Set(page.map((r) => r.actor_user_id).filter((x): x is string => Boolean(x))),
  ]);

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'admin.audit.read',
    targetKind: 'admin_audit_log',
    targetId: q.target_id ?? null,
    after: { filter: { action: q.action ?? null, actor: q.actor_user_id ?? null, target_kind: q.target_kind ?? null }, returned: page.length },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminAuditResponse.parse({
      entries: page.map((r) => ({
        ...r,
        actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
        plain: `${names.get(r.actor_user_id ?? '') ?? 'Someone'} — ${r.action.replace(/[._]/g, ' ')}${r.reason ? `: ${r.reason}` : ''}`,
      })),
      next_cursor: hasMore && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
      plain: page.length ? `${page.length} entries.` : 'Nothing logged yet that matches.',
    })
  );
});
