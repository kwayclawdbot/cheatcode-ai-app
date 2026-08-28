/**
 * Runtime capability probing for the round-4 schema.
 *
 * SCHEMA-4 owns `supabase/migrations/0021_prototype_round4.sql` and it lands on
 * its own clock. This lane must not be the reason a build is red or a smoke run
 * is amber while that migration is in flight, and it must not silently write
 * round-4 state into a column that does not exist yet.
 *
 * So each new object is probed ONCE per process with a `select ... limit 0`,
 * and the answer is cached. Every round-4 read has a documented fallback:
 *
 *   chart_annotations                the table. No fallback — annotations are a
 *                                    first-class object with their own RLS, and
 *                                    hiding them inside another table's jsonb
 *                                    would put one user's marks in a row another
 *                                    user can read. Missing → `degraded`.
 *   alerts.version / grade_snapshot  falls back to `alerts.refs.round4`, which
 *   / score_snapshot                 is a jsonb column that already exists and
 *                                    is already user-scoped. Versioning works
 *                                    either way; the column is just tidier.
 *   conversations.pinned /           falls back to `conversations.context.round4`
 *   last_message_at                  (pinned) and to max(created_at) over
 *                                    conversation_messages (last_message_at).
 *   rooms.expires_at                 falls back to `rooms.config.expires_at`.
 *   rule_adherence_v                 falls back to counting debriefs in TS.
 *
 * The probe is never on the hot path more than once, and a probe that fails for
 * any reason answers `false` — the fallback is always the safe branch.
 */
import { serviceClient } from '../db';
import { log } from '../log';

const cache = new Map<string, Promise<boolean>>();

/** True when `table` exists and exposes every column in `cols`. */
export function hasColumns(table: string, cols: string[]): Promise<boolean> {
  const key = `${table}:${cols.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const db = serviceClient();
      const { error } = await db.from(table).select(cols.join(',')).limit(0);
      if (error) {
        log('info', 'schema', 'round4.capability_absent', { table, cols, code: error.code });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  })();
  cache.set(key, p);
  return p;
}

export const hasAnnotationsTable = () =>
  hasColumns('chart_annotations', ['id', 'symbol', 'kind', 'provenance', 'status']);

export const hasAlertVersionColumns = () =>
  hasColumns('alerts', ['version', 'grade_snapshot', 'score_snapshot', 'lifecycle_state']);

export const hasAlertEventsTable = () => hasColumns('alert_events', ['alert_id', 'seq', 'type', 'to_state']);

export const hasConversationColumns = () => hasColumns('conversations', ['pinned', 'last_message_at']);

export const hasRoomExpiry = () => hasColumns('rooms', ['expires_at']);

export const hasRuleAdherenceView = () => hasColumns('rule_adherence_v', ['user_id', 'sessions', 'followed']);

/** Test seam. */
export function resetSchemaProbe(): void {
  cache.clear();
}

export const ANNOTATIONS_ABSENT_PLAIN =
  'Chart marks are not switched on for this database yet, so there is nothing to draw.';
