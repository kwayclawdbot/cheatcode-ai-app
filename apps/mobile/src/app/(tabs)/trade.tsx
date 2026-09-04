/**
 * Trade tab — the terminal, immediately.
 *
 * Spec 10 §7: "Trade opens as a working chart, not a portfolio dashboard." The
 * tab is a resolver, not a screen: it decides WHICH symbol you are working and
 * redirects into `/trade/[symbol]`, where the chart, Kai, the plan and the
 * drawers already live.
 *
 * WHAT THIS FILE USED TO DO, AND WHY IT WAS WRONG
 * It waited on `GET /trade/landing` — positions, orders, watchlist, movers, a
 * grouped snapshot — and when every one of those lists came back empty, which
 * is exactly what a new account looks like, it rendered a card that said "Find
 * a symbol". So the first thing Trade ever showed was a search prompt. The
 * whole point of the Trade section is that it is a chart you are already
 * standing in front of.
 *
 * WHAT IT DOES NOW
 *   1. The symbol you worked last in this session wins, synchronously. No
 *      request, no frame of loading.
 *   2. Otherwise `GET /trade/default` — a database-only read — names the chart:
 *      an alert of yours that needs a decision, an open position, your
 *      watchlist, the last thing you worked, or SPY.
 *   3. That call gets 700ms. Past that the tab opens SPY anyway, because the
 *      market itself is a better answer than a placeholder. The real answer is
 *      still cached behind it for the next visit.
 *   4. While it resolves, the screen shows the PORTAL'S OWN CHROME, empty.
 *      There is no state in which Trade asks the user to go find something.
 */
import React, { useState } from 'react';
import { Redirect } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { PortalChromeSkeleton } from '../../features/portal/chrome';
import { lastPortalSymbol } from '../../features/portal/last-symbol';
import { defaultChartRoute, useDefaultChart } from '../../features/portal/default-chart';

export default function TradeTab() {
  // Read once per mount: the tab must not change its mind under the redirect.
  const [remembered] = useState(() => lastPortalSymbol());

  if (remembered) {
    return <Redirect href={`/trade/${encodeURIComponent(remembered)}` as never} />;
  }
  return <TradeDefaultResolver />;
}

/**
 * Split out so the request only ever fires when there is nothing remembered —
 * a hook cannot be skipped, but a component can go unmounted.
 */
function TradeDefaultResolver() {
  const resolved = useDefaultChart();

  if (resolved) {
    return <Redirect href={defaultChartRoute(resolved) as never} />;
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade">
      <PortalChromeSkeleton />
    </Screen>
  );
}
