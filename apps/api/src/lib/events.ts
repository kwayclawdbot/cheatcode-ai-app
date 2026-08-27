/**
 * Unified user event outbox (01 §3).
 *
 * Rule from the data model: every server-authoritative mutation writes its
 * domain row AND its user_events row in the same transaction.
 *
 * This calls the `append_user_event(...)` SQL function
 * (supabase/migrations/0016) rather than inserting through PostgREST, so the
 * insert and the `user_events_assign_seq` counter lock share one transaction
 * and the function returns the assigned `seq`.
 *
 * REMAINING GAP (documented in README): a write path whose domain write still
 * lives in the API gets this as a SECOND round-trip, so the domain row and the
 * outbox row are still two transactions. The fix is one RPC per command — as
 * `complete_onboarding(...)` already does for POST /onboarding/complete. Until
 * every path has one, this stays best-effort: it is logged, never raised, and a
 * failed outbox write never fails the user's request.
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
    const { data, error } = await db.rpc('append_user_event', {
      p_user_id: userId,
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_payload: payload,
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
    log('info', requestId, 'user_event.appended', {
      event_type: eventType,
      entity_type: entityType,
      seq: typeof data === 'number' ? data : null,
    });
    return true;
  } catch (e) {
    log('error', requestId, 'user_event.threw', {
      event_type: eventType,
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
