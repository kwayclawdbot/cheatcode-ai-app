/**
 * THE ONE THING THAT MAKES PRICES MOVE.
 *
 * Every price surface in this app used to fetch once in a `useEffect` and then
 * freeze. Home, Alerts and Trade are TABS — they stay mounted — so a quote
 * fetched at 9:31 was still the number on screen at two in the afternoon. This
 * hook is the fix, and it is deliberately the only one: a second polling
 * pattern somewhere else is how an app ends up making four requests a second
 * for the same symbol.
 *
 * ── THE COST RULE: ONLY POLL WHAT IS VISIBLE ─────────────────────────────────
 * There are three gates, and a request needs all three:
 *
 *   1. FOCUS.       The timer is created inside `useFocusEffect` and destroyed
 *                   on blur, so a mounted-but-blurred tab has no timer to fire.
 *                   This is the gate that matters most: the tabs never unmount.
 *   2. FOREGROUND.  `isForeground()` — the document's visibility on web, the
 *                   AppState on native. Backgrounding the app stops the timer;
 *                   coming back starts it.
 *   3. SESSION.     A closed market yields `null` for the interval and no timer
 *                   is created at all. Overnight the app is silent.
 *
 * ── AND IT MUST BE CORRECT THE INSTANT YOU COME BACK ─────────────────────────
 * Stopping a timer on blur means the data goes stale while you are elsewhere,
 * so returning to a tab fires immediately when what is held is older than one
 * interval. Otherwise you would look at a fifteen-minute-old number for another
 * fifteen seconds.
 *
 * ── WHAT `onRefresh` MUST BE ─────────────────────────────────────────────────
 * A QUIET reload. It must not raise a spinner, blank the list, or clear good
 * data when the request fails — a screen that flashes its loading state every
 * fifteen seconds is worse than one that never refreshes. `useResource` and
 * `useTradeResource` both implement this as `refresh()`, distinct from
 * `reload()`.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { isForeground, subscribeForeground } from './foreground';
import { startMarketPoll } from './poller';
import {
  currentSession, refreshIntervalMs,
  type MarketSession, type RefreshKind,
} from './market-session';
import type { MarketStatus } from './types';

export type MarketRefreshOptions = {
  /**
   * The quiet refetch. Called on every tick; must not show a loading state and
   * must keep the data it already has if the request fails.
   */
  onRefresh: () => void;
  /** 'quote' cadence (default) or the candle cadence for `timeframe`. */
  kind?: RefreshKind;
  /** Bar width, for `kind: 'candles'` — '1m' · '5m' · '15m' · '1h' · '4h' · 'D'. */
  timeframe?: string | null;
  /**
   * This surface's own `market` block, when the payload carries one. It is
   * both the authority for this hook and — through `noteMarketStatus` — the
   * answer every other surface falls back on.
   */
  market?: MarketStatus | { status: MarketStatus['status'] } | null;
  /** False while there is nothing worth refreshing (no symbol, locked, error). */
  enabled?: boolean;
};

export function useMarketRefresh({
  onRefresh, kind = 'quote', timeframe = null, market = null, enabled = true,
}: MarketRefreshOptions): void {
  /**
   * The callback is read through a ref so a caller may pass an inline arrow
   * without tearing down and rebuilding the timer on every render — which would
   * mean the interval never elapsed and nothing ever refreshed.
   */
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; });

  /**
   * Read during render, on purpose: the interval has to be known before the
   * focus effect is built. `currentSession` also REMEMBERS a hint it is given,
   * which is how Home's `market` block reaches the watchlist — it is idempotent
   * (it writes a session and a timestamp) so a double render costs nothing.
   */
  const status = market?.status ?? null;
  const session: MarketSession = currentSession(status);

  const interval = enabled ? refreshIntervalMs(session, kind, timeframe) : null;

  /** When the data on screen was last fetched. Mount counts as a fetch. */
  const lastRun = useRef(Date.now());

  /**
   * FOCUS IS THE FIRST GATE. The timer only exists between focus and blur, so
   * the two tabs that are not on screen have nothing that could fire. The other
   * two gates — foreground, and a market that is open — live inside
   * `startMarketPoll`, which is where they can be tested.
   */
  useFocusEffect(
    useCallback(() => startMarketPoll({
      intervalMs: interval,
      lastRunAt: lastRun.current,
      fire: () => { lastRun.current = Date.now(); cb.current(); },
      isForeground,
      subscribeForeground,
    }), [interval]),
  );
}
