/**
 * The dev-only in-process drainer — `execution/tick-dev.ts` for push.
 *
 * THE SENDER ONLY RUNS WHILE SOMETHING TICKS (brief §11.3). Hosted, that is the
 * Vercel cron on `/internal/push/drain`. Locally there is no cron, so the API
 * runs the same function on a `setInterval`, guarded by a flag on `globalThis`
 * — a module-level `let` resets on hot reload and would leave three drainers
 * racing each other into duplicate sends.
 *
 * Off unless BOTH are true: `PUSH_DRAIN_DEV_INTERVAL_S` is a positive number,
 * and `NODE_ENV !== 'production'`. A production deploy never starts it.
 */
import { env } from '../env';
import { log } from '../log';
import { drainPush } from './send';

const KEY = '__cheatcode_push_drainer__';

type Holder = { timer: ReturnType<typeof setInterval> | null; intervalS: number; running: boolean };

function holder(): Holder {
  const g = globalThis as unknown as Record<string, Holder | undefined>;
  if (!g[KEY]) g[KEY] = { timer: null, intervalS: 0, running: false };
  return g[KEY] as Holder;
}

export function devDrainerStatus(): { on: boolean; interval_s: number } {
  const h = holder();
  return { on: Boolean(h.timer), interval_s: h.intervalS };
}

/** Idempotent. Safe to call from any route on any request. */
export function ensureDevDrainer(): void {
  if (process.env.NODE_ENV === 'production') return;
  const raw = Number(env('PUSH_DRAIN_DEV_INTERVAL_S') ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return;

  const h = holder();
  if (h.timer) return;

  h.intervalS = raw;
  h.timer = setInterval(() => {
    if (h.running) return; // a slow drain never overlaps the next one
    h.running = true;
    void drainPush({ requestId: 'dev-drainer' })
      .then((r) => {
        if (r.claimed || r.delivered || r.revoked) {
          log('info', 'dev-drainer', 'push.drain', {
            claimed: r.claimed,
            sent: r.sent,
            failed: r.failed,
            retried: r.retried,
            delivered: r.delivered,
            revoked: r.revoked,
          });
        }
      })
      .catch((e) =>
        log('warn', 'dev-drainer', 'push.drain_failed', {
          message: e instanceof Error ? e.message : String(e),
        })
      )
      .finally(() => {
        h.running = false;
      });
  }, raw * 1000);

  // Never hold the process open on its own account.
  (h.timer as unknown as { unref?: () => void }).unref?.();
  log('info', 'dev-drainer', 'push.drainer_started', { interval_s: raw });
}
