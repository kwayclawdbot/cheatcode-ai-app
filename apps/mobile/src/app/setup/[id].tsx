import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { useSetupDepth } from '../../features/workspace';

/**
 * `/setup/[id]` — kept ONLY so old links, notifications and alert traces keep
 * working. A setup is no longer a destination (consolidation rule 1): it is a
 * module inside the symbol's workspace, so this route resolves the setup's
 * symbol and replaces itself with
 *   /symbol/<SYM>?tab=overview&setup=<id>
 *
 * `?view=learn` from round 2 maps to the workspace's Kai tab, which is where
 * the interpretation and the evidence now live.
 */
export default function SetupRedirect() {
  const params = useLocalSearchParams<{ id?: string; view?: string; symbol?: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const detail = useSetupDepth(id || null);
  // A deep link lands here before the root navigator has mounted; replacing
  // then throws. Wait for the navigation state to exist.
  const navReady = !!useRootNavigationState()?.key;

  const symbol = (typeof params.symbol === 'string' && params.symbol) || detail?.symbol || '';
  const tab = params.view === 'learn' ? 'kai' : 'overview';

  useEffect(() => {
    if (!symbol || !navReady) return;
    router.replace(`/symbol/${encodeURIComponent(symbol)}?tab=${tab}&setup=${encodeURIComponent(id)}`);
  }, [symbol, tab, id, router, navReady]);

  return (
    <Screen variant="corner" layout="tab" testID="screen-setup-redirect">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={color.violet} />
        <T size={12.5} c={color.muted}>Opening the workspace…</T>
      </View>
    </Screen>
  );
}
