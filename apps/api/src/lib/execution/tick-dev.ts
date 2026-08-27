/**
 * The dev-only in-process ticker.
 *
 * Hosted, `POST /internal/paper/tick` is a Vercel cron (see vercel.json in the
 * README's "Paper tick" section). Locally there is no cron, so the API runs the
 * same function on a `setInterval` — guarded by a MODULE-LEVEL flag so Next's
 * hot reload cannot end up with three tickers racing each other into duplicate
 * fills. `globalThis` holds the flag rather than a module variable, because a
 * module is re-evaluated on reload and a plain `let` would reset with it.
 *
 * Off unless BOTH are true: `PAPER_TICK_DEV_INTERVAL_S` is set to a positive
 * number, and `NODE_ENV !== 'production'`. A production deploy never starts it.
 */
import { env } from '../env';
import { log } from '../log';
import { runPaperTick } from './tick';

const KEY = '__cheatcode_paper_ticker__';

type Holder = { timer: ReturnType<typeof setInterval> | null; intervalS: number; running: boolean };

function holder(): Holder {
  const g = globalThis as unknown as Record<string, Holder | undefined>;
  if (!g[KEY]) g[KEY] = { timer: null, intervalS: 0, running: false };
  return g[KEY] as Holder;
}

export function devTickerStatus(): { on: boolean; interval_s: number } {
  const h = holder();
  return { on: Boolean(h.timer), interval_s: h.intervalS };
}

/** Idempotent. Safe to call from any route on any request. */
export function ensureDevTicker(): void {
  if (process.env.NODE_ENV === 'production') return;
  const raw = Number(env('PAPER_TICK_DEV_INTERVAL_S') ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return;

  const h = holder();
  if (h.timer) return;

  h.intervalS = raw;
  h.timer = setInterval(() => {
    if (h.running) return; // a slow tick never overlaps the next one
    h.running = true;
    void runPaperTick({ requestId: 'dev-ticker' })
      .then((r) => {
        if (r.positions_marked || r.orders_filled || r.legs_fired) {
          log('info', 'dev-ticker', 'paper.tick', {
            symbols: r.symbols.length,
            marked: r.positions_marked,
            filled: r.orders_filled,
            legs: r.legs_fired,
          });
        }
      })
      .catch((e) => log('warn', 'dev-ticker', 'paper.tick_failed', { message: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        h.running = false;
      });
  }, raw * 1000);

  // Never hold the process open on its own account.
  (h.timer as unknown as { unref?: () => void }).unref?.();
  log('info', 'dev-ticker', 'paper.ticker_started', { interval_s: raw });
}
