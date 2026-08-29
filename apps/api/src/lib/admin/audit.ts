/**
 * EVERY ADMIN ACTION WRITES A ROW, INCLUDING THE READS.
 *
 * Brief §3: "Every admin action writes `admin_audit_log` — actor, action,
 * target, before and after, request id, ip. Reads of a person's detail page are
 * logged too, not just writes."
 *
 * That last clause is the unusual one and it is deliberate. The damage an admin
 * surface does is almost never a write — nobody exfiltrates a CRM by editing
 * it. It is somebody opening two thousand detail pages on their last day. A log
 * of writes would show that as nothing at all.
 *
 * ONE WRITER. `write_admin_audit` (0025 §10) is the only insert into the table,
 * so the shape cannot drift between routes and the append-only revoke has
 * exactly one legitimate caller to point at. `service_role` has INSERT and
 * SELECT on `admin_audit_log` and nothing else — not UPDATE, not DELETE, not
 * TRUNCATE — so this API can write the log and can never rewrite it.
 *
 * IT NEVER THROWS. An audit write that fails must not take the request with it:
 * the alternative is a route that 500s AFTER doing the thing, leaving the
 * action done and unlogged, which is strictly worse than done and logged badly.
 * A failure is logged at `error` with the action name so it is visible.
 * (The audit rows written INSIDE `redeem_invite` and `merge_crm_people` share
 * those functions' transaction and are all-or-nothing with the act itself,
 * which is better and is why those two do not go through here.)
 */
import { serviceClient } from './../db';
import { log } from './../log';

/**
 * The verbs. A closed list because "what did staff do last week" is a question
 * answered by grouping on this column, and a free-form string turns that into
 * archaeology. `staff.grant` / `staff.revoke` / `staff.seed_owner` /
 * `invite.redeem` / `crm.person.merge` / `crm.person.unmerge` are written by
 * SQL and are listed here so the reader sees the whole vocabulary in one place.
 */
export type AuditAction =
  // written in SQL (0025)
  | 'staff.grant'
  | 'staff.revoke'
  | 'staff.seed_owner'
  | 'invite.redeem'
  | 'crm.person.merge'
  | 'crm.person.unmerge'
  // written here
  | 'admin.overview.read'
  | 'admin.people.search'
  | 'crm.person.read'
  | 'crm.person.transcript'
  | 'crm.note.create'
  | 'crm.tags.update'
  | 'crm.segment.create'
  | 'crm.segment.list'
  | 'invite.create'
  | 'invite.revoke'
  | 'invite.list'
  | 'entitlement.grant'
  | 'entitlement.revoke'
  | 'admin.audit.read'
  | 'crm.sync.read'
  | 'crm.sync.run';

export type AuditInput = {
  actorUserId: string | null;
  action: AuditAction;
  targetKind?: string | null;
  /** TEXT, not uuid: a sync target is the source name, not an id (0025 §7). */
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
  ip?: string | null;
};

export async function writeAudit(input: AuditInput): Promise<string | null> {
  try {
    const db = serviceClient();
    const { data, error } = await db.rpc('write_admin_audit', {
      p_actor_user_id: input.actorUserId,
      p_action: input.action,
      p_target_kind: input.targetKind ?? null,
      p_target_id: input.targetId ?? null,
      p_before: input.before ?? null,
      p_after: input.after ?? null,
      p_reason: input.reason ?? null,
      p_request_id: input.requestId ?? null,
      p_ip: input.ip ?? null,
    });
    if (error) {
      log('error', input.requestId ?? 'no-request-id', 'audit.write_failed', {
        action: input.action,
        code: error.code,
        message: error.message,
      });
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
    return row?.id ?? null;
  } catch (e) {
    log('error', input.requestId ?? 'no-request-id', 'audit.write_threw', {
      action: input.action,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
