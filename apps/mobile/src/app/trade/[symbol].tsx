/**
 * `/trade/[symbol]` — the Trade section.
 *
 * ONE SECTION, NOT TWO. There used to be two builds of this screen behind an
 * `EXPO_PUBLIC_TRADE_V2` flag: the round-4 portal (five panels, two sheets, a
 * context switcher and a rail all on one screen) and the rebuild. The owner
 * looked at both and chose the rebuild, so the flag, the `?v=1|2` switch and
 * the old portal are gone. `features/portal2/TradePortalV2` is simply what this
 * route renders now.
 *
 * The section is one job in three beats — look at it, decide, take it — with
 * one beat on screen at a time.
 *
 * PAPER EXECUTION IS NOT TOUCHED BY THIS SCREEN. `/order/new`,
 * `/order/review`, `/order/confirmed`, `/order/[id]` and `/position/*` are
 * unchanged and still reachable; the section previews and submits through the
 * same two-step `tradeApi.preview` → `tradeApi.submit` path those screens use.
 *
 * Query: ?alert=<id>&setup=<id>&beat=look|decide|take
 *        `?v=1` and `?v=2` are accepted and ignored — old links still land
 *        here, on the only Trade section there is.
 */
import React from 'react';
import TradePortalV2 from '../../features/portal2/TradePortalV2';

export default function TradeRoute() {
  return <TradePortalV2 />;
}
