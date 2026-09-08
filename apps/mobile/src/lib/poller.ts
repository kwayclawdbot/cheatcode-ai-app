/**
 * THE TIMER ITSELF, WITH NOTHING REACT IN IT.
 *
 * `useMarketRefresh` decides WHEN a surface is allowed to poll (is it focused,
 * what session is the market in); this decides what actually happens once it
 * is. It lives on its own, with the clock and the visibility source injected,
 * because "a hidden tab issues zero requests" is the app's central cost
 * guarantee and a guarantee nobody can run is a comment. `scripts/live-refresh-test.mts`
 * drives this with a fake clock and a fake tab and counts the ticks.
 *
 * Pure: no react, no react-native, no network.
 */

/** Everything the poller needs from the outside world. */
export type Scheduler = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  now: () => number;
};

const REAL: Scheduler = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

export type MarketPollOptions = {
  /**
   * How often to fire — or `null` for "never". `null` is the closed-market
   * case and it means NO TIMER IS CREATED, not a slow one.
   */
  intervalMs: number | null;
  /** The refetch. Must be quiet: no spinner, and good data survives a failure. */
  fire: () => void;
  /** When what is on screen was last fetched. Mount counts as a fetch. */
  lastRunAt: number;
  isForeground: () => boolean;
  subscribeForeground: (fn: (foreground: boolean) => void) => () => void;
  /** Injected in tests. */
  scheduler?: Scheduler;
};

/**
 * Start polling. Returns the stop function — call it on blur or unmount.
 *
 * Three properties this has to hold, in the order they matter:
 *
 *   1. A hidden or backgrounded app has no timer. Not a paused one, none: the
 *      handle is cleared and recreated, so nothing can fire from a tab nobody
 *      is looking at.
 *   2. Coming back fires IMMEDIATELY when what is held is older than one
 *      interval. Otherwise returning to a tab means reading a stale number for
 *      another full interval, which is the bug this whole lane is about.
 *   3. `intervalMs: null` creates nothing and subscribes to nothing.
 */
export function startMarketPoll({
  intervalMs, fire, lastRunAt, isForeground, subscribeForeground, scheduler = REAL,
}: MarketPollOptions): () => void {
  if (intervalMs == null) return () => {};

  let handle: unknown = null;
  let last = lastRunAt;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    last = scheduler.now();
    fire();
  };

  const start = () => {
    if (handle != null || stopped) return;
    if (scheduler.now() - last >= intervalMs) tick();
    if (stopped) return;
    handle = scheduler.setInterval(tick, intervalMs);
  };

  const halt = () => {
    if (handle == null) return;
    scheduler.clearInterval(handle);
    handle = null;
  };

  if (isForeground()) start();
  const unwatch = subscribeForeground((fg) => (fg ? start() : halt()));

  return () => {
    stopped = true;
    halt();
    unwatch();
  };
}
