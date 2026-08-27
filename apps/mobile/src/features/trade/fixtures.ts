/**
 * Trade landing fixture in the round-3 hierarchy (EXPO_PUBLIC_FIXTURES=1).
 * Watchlist / movers / opportunities are borrowed from lane MOBILE-A's
 * `src/lib/fixtures.ts` (imported, never edited) so the two lanes show one
 * consistent sample market.
 */
import { fixtureTradeLanding } from '../../lib/fixtures';
import { fixtureOpenOrders } from '../orders/fixtures';
import { fixtureMeta, fixtureNvda } from '../positions/fixtures';
import type { TradeLandingV2 } from './types';

export const fixtureLanding = (): TradeLandingV2 => ({
  account: {
    value: 10658.9,
    day_change: 32.8,
    day_change_pct: 0.31,
    buying_power: 3420,
    kind: 'paper',
    label: 'PAPER',
    plain: 'Practice money. Nothing here can be withdrawn.',
  },
  positions: [fixtureMeta, fixtureNvda],
  open_orders: fixtureOpenOrders(),
  needs_action: [
    {
      id: 'na-nvda',
      kind: 'position',
      symbol: 'NVDA',
      title: 'NVDA is 1% from your stop',
      detail: 'Take it off, move the stop, or leave it — but decide before it decides for you.',
      action_label: 'Review',
      route: '/position/pos-nvda',
      tone: 'gold',
    },
    {
      id: 'na-meta-order',
      kind: 'order',
      symbol: 'META',
      title: 'META limit order has not filled',
      detail: 'Accepted at $504.00 · good for today only.',
      action_label: 'Open order',
      route: '/order/ord-fixture-1',
      tone: 'volt',
    },
  ],
  watchlist: fixtureTradeLanding.watchlist,
  recent: fixtureTradeLanding.movers.slice(0, 2).map((m) => ({
    symbol: m.symbol,
    name: m.name ?? '',
    last: m.last ?? null,
    change_pct: m.change_pct ?? null,
    quote: m.quote ?? null,
  })),
  discovery: { movers: fixtureTradeLanding.movers, catalysts: fixtureTradeLanding.catalysts },
  kai_opportunities: fixtureTradeLanding.kai_opportunities,
  notices: [],
  market_quote: null,
});
