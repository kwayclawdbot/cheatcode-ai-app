/**
 * ONE SLOW CLOCK, SHARED BY EVERY FRESHNESS MARK ON SCREEN.
 *
 * A label that decays has to be re-rendered for the decay to be visible; a mark
 * computed once at mount would still say "Live" an hour later even though
 * `decayFreshness` now knows better. So the marks subscribe to a clock.
 *
 * It is ONE interval for the whole app, not one per mark. A busy board draws
 * twenty-odd freshness marks and twenty timers ticking the same second is a
 * waste of a battery for a shared fact. `useSyncExternalStore` gives every
 * subscriber the same snapshot, so they all re-render on the same tick.
 *
 * It runs only while something is mounted (the subscriber count) and only while
 * the app is in front of somebody (`isForeground`), which is the same cost rule
 * the poller follows. A hidden tab has no clock and needs none — nothing on it
 * is being read, and the first tick after it comes back is immediate.
 */
import { useSyncExternalStore } from 'react';
import { isForeground, subscribeForeground } from './foreground';

/**
 * 30 seconds. The tightest threshold in `freshness-decay` is a minute, so this
 * is fast enough that a label is never more than half a step behind, and slow
 * enough to be free.
 */
const PERIOD_MS = 30_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let unwatchForeground: (() => void) | null = null;
let snapshot = Date.now();

function emit(): void {
  snapshot = Date.now();
  for (const l of listeners) l();
}

function startTimer(): void {
  if (timer) return;
  timer = setInterval(emit, PERIOD_MS);
}

function stopTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (isForeground()) startTimer();
    unwatchForeground = subscribeForeground((fg) => {
      if (fg) {
        // Catch up before resuming: the labels are stale by however long the
        // app was away, and that is exactly when the decay matters most.
        emit();
        startTimer();
      } else {
        stopTimer();
      }
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopTimer();
      unwatchForeground?.();
      unwatchForeground = null;
    }
  };
}

function getSnapshot(): number {
  return snapshot;
}

/**
 * The current time, to the nearest half-minute, as a re-rendering value.
 * Use it anywhere a rendered word depends on how long ago something happened.
 */
export function useCoarseNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
