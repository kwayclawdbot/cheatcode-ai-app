/**
 * The worker's Supabase access: service role, because it writes the show.
 *
 * SECURITY BOUNDARY. The service role bypasses RLS. This process reads global
 * tables (`setups`, `alerts`, `instruments`) and writes only the four LIVE-2
 * tables plus the `live-audio` bucket. It never reads a user's rows — the one
 * user-scoped thing it touches is `live_requests`, and only the symbol and the
 * queue position, never who asked. `live_requests.user_id` is deliberately not
 * selected anywhere in this worker: the rundown does not need to know, and a
 * field you never read is a field you cannot leak into a broadcast.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.ts';
import { liveChannel, LIVE_BROADCAST_EVENT, type LiveFrame } from '../../../packages/shared/live.ts';
import { log } from './log.ts';

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 40 } },
    global: { headers: { 'x-application-name': 'kai-live' } },
  });
  return cached;
}

/* ------------------------------------------------------------------ */
/* Broadcast                                                           */
/* ------------------------------------------------------------------ */

/**
 * One channel per show, opened once and kept.
 *
 * The frame goes to the TABLE FIRST and the broadcast second, always. If the
 * process dies between the two, a viewer misses a beat and recovers it on the
 * next reconcile; the reverse order would mean a frame that was seen live and
 * then vanished from the replay, which is the one inconsistency a viewer cannot
 * repair by refreshing.
 */
export class Broadcaster {
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private joined = false;

  constructor(private readonly showId: string) {}

  async open(): Promise<boolean> {
    if (this.joined) return true;
    const name = liveChannel(this.showId);
    this.channel = db().channel(name, { config: { broadcast: { self: false, ack: false } } });
    const status = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
      this.channel!.subscribe((s) => {
        if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          clearTimeout(timer);
          resolve(s);
        }
      });
    });
    this.joined = status === 'SUBSCRIBED';
    if (!this.joined) {
      // Not fatal, and deliberately so: the table is the truth. A show with no
      // broadcast is a show every client polls a little more slowly, not a
      // broken one.
      log('warn', 'broadcast.unavailable', { channel: name, status });
    } else {
      log('info', 'broadcast.open', { channel: name });
    }
    return this.joined;
  }

  async send(frame: LiveFrame): Promise<void> {
    if (!this.joined || !this.channel) return;
    try {
      await this.channel.send({ type: 'broadcast', event: LIVE_BROADCAST_EVENT, payload: frame });
    } catch (e) {
      log('warn', 'broadcast.send_failed', { seq: frame.seq, message: String(e) });
    }
  }

  async close(): Promise<void> {
    if (this.channel) await db().removeChannel(this.channel);
    this.channel = null;
    this.joined = false;
  }
}
