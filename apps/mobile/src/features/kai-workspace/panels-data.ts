/**
 * WHERE THE PANELS GET THEIR DATA — one loader per panel.
 *
 * The three symbol panels read `GET /symbols/:symbol/panel`, which is the same
 * loader Kai's `read_quote_card`, `read_earnings_history` and `read_options_chain` go
 * through on the server. The watchlist reads `GET /watchlist` (what Kai's
 * `read_watchlist` reads) and the portfolio reads `tradeApi.positions('open')`
 * — the Trade tab's own loader, so the P/L here is the P/L there.
 *
 * EXAMPLE CONTENT ONLY BEHIND THE FLAG. Every fixture return below sits under
 * `env.FIXTURES`. A build with no API configured does NOT fall back to them: it
 * throws the plain "not connected" sentence and the panel prints it. The
 * panels proof checks this line by line.
 */
import { env } from '../../lib/env';
import { api, ApiError } from '../../lib/api';
import { tradeApi } from '../../lib/trade-api';
import type { PositionsPayload } from '../positions/types';
import {
  fixtureEarnings,
  fixtureOptionsChain,
  fixtureQuoteCard,
  fixtureWatchlist,
  readEarnings,
  readOptionsChain,
  readQuoteCard,
  readWatchlist,
} from './panels-read';

const NOT_CONNECTED = 'The service is not connected yet, so there is nothing to show here.';

function requireLive(): void {
  if (!api.available()) throw new ApiError('NO_API', NOT_CONNECTED);
}

export async function loadQuoteCard(symbol: string) {
  if (env.FIXTURES) return fixtureQuoteCard(symbol);
  requireLive();
  return readQuoteCard(await api.symbolPanel(symbol, 'quote'), symbol);
}

export async function loadEarnings(symbol: string) {
  if (env.FIXTURES) return fixtureEarnings(symbol);
  requireLive();
  return readEarnings(await api.symbolPanel(symbol, 'earnings'), symbol);
}

export async function loadOptionsChain(symbol: string) {
  if (env.FIXTURES) return fixtureOptionsChain(symbol);
  requireLive();
  return readOptionsChain(await api.symbolPanel(symbol, 'options'), symbol);
}

export async function loadWatchlist() {
  if (env.FIXTURES) return fixtureWatchlist();
  requireLive();
  return readWatchlist(await api.watchlist());
}

/**
 * `tradeApi.positions` answers from its own fixtures under the flag, which is
 * the example content the Trade tab already shows. Without the flag and without
 * a service, this refuses rather than letting that loader's wider fallback
 * draw sample positions as though they were the member's.
 */
export async function loadPortfolio(): Promise<PositionsPayload> {
  if (env.FIXTURES) return tradeApi.positions('open');
  requireLive();
  return tradeApi.positions('open');
}
