/**
 * `/trade/[symbol]` — the Trade section, and the switch between its two builds.
 *
 * WHY THERE ARE TWO. The round-4 portal (`features/portal/TradePortalV1`) works.
 * It is also five panels, two sheets, a context switcher and a rail all on one
 * screen at once, which is why the owner said the section is "all over the
 * place": nothing on it is wrong and nothing on it is first, so a person cannot
 * tell what to do next. The rebuild (`features/portal2/TradePortalV2`) is the
 * same objects arranged as one spine — look at it, decide, take it — with one
 * beat on screen at a time.
 *
 * PAPER EXECUTION IS NOT TOUCHED BY EITHER. `/order/new`, `/order/review`,
 * `/order/confirmed`, `/order/[id]` and `/position/*` are unchanged and still
 * reachable; the new section previews and submits through the same two-step
 * `tradeApi.preview` → `tradeApi.submit` path those screens use.
 *
 * HOW THE SWITCH DECIDES, in order:
 *   `?v=1` → always the old one. `?v=2` → always the new one. Otherwise the
 *   `EXPO_PUBLIC_TRADE_V2` flag, which is OFF by default. So today every
 *   existing link, deep link and alert route lands exactly where it always did,
 *   and the new section is a query parameter away for the owner to look at.
 *
 * Query: ?alert=<id>&setup=<id>&ctx=kai|alert|plan|community (v1)
 *        ?alert=<id>&setup=<id>&beat=look|decide|take        (v2)
 *        ?v=1|2                                              (both)
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { env } from '../../lib/env';
import TradePortalV1 from '../../features/portal/TradePortalV1';
import TradePortalV2 from '../../features/portal2/TradePortalV2';

export default function TradeRoute() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  const asked = String(v ?? '');
  const useV2 = asked === '2' ? true : asked === '1' ? false : env.TRADE_V2;
  return useV2 ? <TradePortalV2 /> : <TradePortalV1 />;
}
