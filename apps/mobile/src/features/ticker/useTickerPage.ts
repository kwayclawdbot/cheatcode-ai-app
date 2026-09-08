import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureTickerPage } from '../../lib/fixtures';
import type { GoalMode, TickerPage } from '../../lib/types';

/**
 * `GET /symbols/:symbol` → the ticker page (prototype board "Ticker page").
 * This is the RESEARCH surface. The working surface is the Trade Portal, which
 * lane MOBILE-B owns; "Open in Trade" is the seam between them.
 *
 * It carries a price, so it refreshes on the quote cadence — 15s while the
 * market is open, 60s in extended hours, never when it is closed — and only
 * while this screen is the one in front of somebody.
 */
export function useTickerPage(symbol: string, mode: GoalMode) {
  const fallback: TickerPage = { ...fixtureTickerPage, symbol: symbol || fixtureTickerPage.symbol };
  return useResource<TickerPage>(
    () => api.tickerPage(symbol, mode),
    fallback,
    [symbol, mode],
    { kind: 'quote', enabled: !!symbol },
  );
}
