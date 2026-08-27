import { useTradeResource } from '../trade/resource';
import { tradeApi } from '../../lib/trade-api';
import type { PositionDetail, PositionsPayload } from './types';

export function usePositions(status: 'open' | 'closed' | 'all' = 'open') {
  return useTradeResource<PositionsPayload>(() => tradeApi.positions(status), [status]);
}

export function usePosition(id: string) {
  return useTradeResource<PositionDetail>(() => tradeApi.position(id), [id]);
}
