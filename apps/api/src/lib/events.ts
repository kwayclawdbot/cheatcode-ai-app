/**
 * Unified user event outbox (01 §3).
 *
 * Rule from the data model: every server-authoritative mutation writes its
 * domain row AND its user_events row in the same transaction.
 *
 * PHASE-0 GAP (documented in README): PostgREST gives us no multi-statement
 * transaction, so the domain write and this outbox write are two round-trips.
 * The outbox insert is best-effort — it is logged and never fails the user's
 * request. Closing the gap needs a `append_user_event(...)` SQL function (or a
 * per-command RPC) from the schema lane; the API cannot write migrations.
 *
 * `seq` is assigned by the `user_events_assign_seq` BEFORE-INSERT trigger which
 * takes a row lock on `user_event_counters` (supabase/migrations/0013). We
 * therefore omit `seq` on insert rather than computing it client-side.
 */
import { serviceClient, isMissingObject } from './db';
import { log } from './log';

export type UserEventType =
  | 'order_status'
  | 'fill'
  | 'alert_trigger'
  | 'plan_event'
  | 'position_update'
  | 'kai_result'
  | 'thesis_change'
  | 'recommendation'
  | 'system';

export async function emitUserEvent(
  userId: string,
  eventType: UserEventType,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  requestId = 'no-request-id'
): Promise<boolean> {
  try {
    const db = serviceClient();
    const { error } = await db.from('user_events').insert({
      user_id: userId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload,
    });
    if (error) {
      log(isMissingObject(error) ? 'warn' : 'error', requestId, 'user_event.insert_failed', {
        event_type: eventType,
        entity_type: entityType,
        code: error.code,
        message: error.message,
      });
      return false;
    }
    return true;
  } catch (e) {
    log('error', requestId, 'user_event.threw', {
      event_type: eventType,
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
