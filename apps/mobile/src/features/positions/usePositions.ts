import { useTradeResource } from '../trade/resource';
import { tradeApi } from '../../lib/trade-api';
import type { PositionDetail, PositionsPayload } from './types';

/**
 * OPEN POSITIONS ARE THE MOST EXPENSIVE THING IN THE APP TO GET WRONG.
 *
 * Every row is a live P&L, so the board refreshes on the quote cadence while
 * it is the visible screen. Closed positions are settled history and cost
 * nothing to leave alone, which is why only the open board polls.
 */
export function usePositions(status: 'open' | 'closed' | 'all' = 'open') {
  return useTradeResource<PositionsPayload>(
    () => tradeApi.positions(status),
    [status],
    { kind: 'quote', enabled: status !== 'closed' },
  );
}

export function usePosition(id: string) {
  return useTradeResource<PositionDetail>(() => tradeApi.position(id), [id], { kind: 'quote' });
}
