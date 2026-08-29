/**
 * The operator's window into a running show.
 *
 * Written to `live_shows.meta.health` on a heartbeat, read by
 * `GET /api/v1/live/health`. Two rules shape what is in here:
 *
 *  1. The API DERIVES buffer depth from the segment rows rather than reading it
 *     from this object, because a wedged director would happily report a healthy
 *     buffer it does not have. What only the worker can know — what it spent,
 *     what threw last, whether it is still alive — is what this carries.
 *
 *  2. `heartbeat_at` is the liveness signal. A `live` show whose heartbeat is
 *     minutes old is a dead director, and that is a different failure from a
 *     show that ended: one needs restarting, the other needs nothing.
 */
import { db } from './db.ts';
import { log } from './log.ts';
import type { Budget } from './budget.ts';

export type HealthState = {
  buffer_depth: number;
  segments_done: number;
  spend_usd: number;
  budget_usd_per_hour: number;
  degraded: boolean;
  degraded_reason: string | null;
  last_error: string | null;
  heartbeat_at: string;
  tts: 'ready' | 'unavailable';
};

export class Health {
  private lastError: string | null = null;
  private degradedReason: string | null = null;

  constructor(
    private readonly showId: string,
    private readonly budget: Budget
  ) {}

  recordError(where: string, e: unknown): void {
    this.lastError = `${where}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    log('error', 'health.error', { where, message: this.lastError });
  }

  recordDegraded(reason: string): void {
    this.degradedReason = reason;
  }

  /**
   * Merge into `meta`, never replace it. The show's title, mode notes and
   * whatever a later lane puts there are not this module's to discard — a
   * heartbeat that clobbers the row is a heartbeat that loses data every second.
   */
  async beat(state: { bufferDepth: number; segmentsDone: number; ttsReady: boolean }): Promise<void> {
    const health: HealthState = {
      buffer_depth: state.bufferDepth,
      segments_done: state.segmentsDone,
      spend_usd: Math.round(this.budget.total() * 10000) / 10000,
      budget_usd_per_hour: this.budget.cap,
      degraded: this.budget.degraded || this.degradedReason !== null,
      degraded_reason: this.degradedReason,
      last_error: this.lastError,
      heartbeat_at: new Date().toISOString(),
      tts: state.ttsReady ? 'ready' : 'unavailable',
    };

    const current = await db().from('live_shows').select('meta').eq('id', this.showId).maybeSingle();
    const meta = ((current.data?.meta ?? {}) as Record<string, unknown>) ?? {};
    const { error } = await db()
      .from('live_shows')
      .update({ meta: { ...meta, health } })
      .eq('id', this.showId);
    if (error) log('warn', 'health.beat_failed', { message: error.message });
  }
}
