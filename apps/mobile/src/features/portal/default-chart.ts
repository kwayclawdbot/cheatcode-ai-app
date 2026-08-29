/**
 * Which chart the Trade tab opens on, and how long it is allowed to think.
 *
 * Owner feedback on round 4: "the trade page defaults to a search request vs
 * opening the trading terminal". Trade is a working chart (spec 10 §7), so the
 * tab may never render a card asking the user to find a symbol — not while it
 * is loading, and not when the account is empty.
 *
 * Two rules make that true no matter what the network does:
 *
 *   1. `GET /trade/default` is database-only and answers in tens of
 *      milliseconds, and its answer is cached for the session, so switching
 *      tabs never asks twice.
 *   2. It gets 700ms. Past that the tab opens SPY rather than holding a
 *      placeholder on screen — the market itself is a better answer than a
 *      spinner, and the real answer still lands in the cache behind it.
 */
import { useEffect, useState } from 'react';
import { FALLBACK_DEFAULT_CHART, portalApi, type TradeDefaultChart } from '../../lib/trade-api';

/** How long the tab waits before it stops waiting. */
export const RESOLVE_BUDGET_MS = 700;

let cached: TradeDefaultChart | null = null;
let inflight: Promise<TradeDefaultChart> | null = null;

/** The route for a resolved default, with the alert context when there is one. */
export function defaultChartRoute(d: TradeDefaultChart): string {
  const q =
    d.reason === 'alert' && d.alert_id
      ? `?alert=${encodeURIComponent(d.alert_id)}&ctx=alert`
      : '';
  return `/trade/${encodeURIComponent(d.symbol)}${q}`;
}

/** One request per session, shared by every caller that arrives while it runs. */
export function resolveDefaultChart(): Promise<TradeDefaultChart> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = portalApi
      .defaultChart()
      .then((d) => { cached = d; inflight = null; return d; })
      .catch(() => { inflight = null; return FALLBACK_DEFAULT_CHART; });
  }
  return inflight;
}

/** Test seam / sign-out: the next tab visit resolves against the new account. */
export function forgetDefaultChart(): void {
  cached = null;
  inflight = null;
}

/**
 * The resolved default, or `null` for at most `RESOLVE_BUDGET_MS`. A cached
 * answer is returned on the first render, so a tab switch never flickers.
 */
export function useDefaultChart(): TradeDefaultChart | null {
  const [resolved, setResolved] = useState<TradeDefaultChart | null>(() => cached);

  useEffect(() => {
    if (resolved) return;
    let alive = true;
    // The budget, not a spinner: past 700ms SPY is the answer on screen, and
    // the real one is still cached for the next visit.
    const timer = setTimeout(() => { if (alive) setResolved(FALLBACK_DEFAULT_CHART); }, RESOLVE_BUDGET_MS);
    void resolveDefaultChart().then((d) => {
      if (!alive) return;
      clearTimeout(timer);
      setResolved(d);
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [resolved]);

  return resolved;
}
