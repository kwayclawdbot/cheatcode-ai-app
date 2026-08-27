import { useTradeResource } from './resource';
import { tradeApi } from '../../lib/trade-api';
import type { GoalMode } from '../../lib/types';
import type { TradeLandingV2 } from './types';

/** GET /trade/landing?mode= in the audit's brokerage hierarchy. */
export function useTradeLandingV2(mode: GoalMode) {
  return useTradeResource<TradeLandingV2>(() => tradeApi.landing(mode), [mode]);
}
