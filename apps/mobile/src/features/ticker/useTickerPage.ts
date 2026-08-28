import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureTickerPage } from '../../lib/fixtures';
import type { GoalMode, TickerPage } from '../../lib/types';

/**
 * `GET /symbols/:symbol` → the ticker page (prototype board "Ticker page").
 * This is the RESEARCH surface. The working surface is the Trade Portal, which
 * lane MOBILE-B owns; "Open in Trade" is the seam between them.
 */
export function useTickerPage(symbol: string, mode: GoalMode) {
  const fallback: TickerPage = { ...fixtureTickerPage, symbol: symbol || fixtureTickerPage.symbol };
  return useResource<TickerPage>(() => api.tickerPage(symbol, mode), fallback, [symbol, mode]);
}
