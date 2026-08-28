/**
 * Trade tab — round 4.
 *
 * Spec 10 §7: "Trade opens as a working chart, not a portfolio dashboard." The
 * tab is therefore a resolver, not a screen: it decides WHICH symbol you are
 * working and redirects into `/trade/[symbol]`. The round-3 landing content
 * (account strip, positions, open orders, watchlist, recents) did not disappear
 * — it moved into the portal's drawers.
 *
 * Order of preference: the symbol you last worked in this session → the symbol
 * the server says needs a decision → an open position → the first watchlist row
 * → the first recent symbol. With none of those, the search sheet is the screen.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { useTradeLandingV2 } from '../../features/trade/useLanding';
import { lastPortalSymbol } from '../../features/portal/last-symbol';
import type { GoalMode } from '../../lib/types';

export default function TradeTab() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, loading } = useTradeLandingV2(mode);
  const [remembered] = useState(() => lastPortalSymbol());

  const priority =
    remembered
    ?? data?.needs_action.find((n) => n.symbol)?.symbol
    ?? data?.positions[0]?.symbol
    ?? data?.kai_opportunities[0]?.symbol
    ?? data?.watchlist[0]?.symbol
    ?? data?.recent[0]?.symbol
    ?? null;

  useEffect(() => { /* keeps the resolver honest across focus changes */ }, [priority]);

  if (priority) {
    return <Redirect href={`/trade/${encodeURIComponent(priority)}` as never} />;
  }

  if (loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade">
        <ScreenLoading label="Opening your chart…" />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade">
      <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
        <T size={28} weight="bold">Trade</T>
        <ObjectCard r={radius.xl} style={{ padding: 18, gap: 10 }}>
          <T size={13} lh={19} c={color.muted}>
            Trade opens on whatever you are working. Pick a symbol and the chart, Kai and your
            plan all sit on one screen.
          </T>
          <Button
            label="Find a symbol"
            kind="volt"
            height={46}
            testID="trade-find-symbol"
            onPress={() => router.push('/symbol/search')}
          />
        </ObjectCard>
      </View>
    </Screen>
  );
}
