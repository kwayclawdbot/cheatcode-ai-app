/**
 * An existing plan — `/plan/[id]`.
 *
 * Same V3-T1 surface as `/plan/new`, but edits are written back through
 * `POST /plans/:id/actions` (adjust_stop / adjust_target / set_exit_style) so
 * the plan, the alerts attached to it and any order it produced stay one object.
 */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { color, radius } from '../../ui/tokens';
import { tradeApi } from '../../lib/trade-api';
import { useTradeResource } from '../../features/trade/resource';
import { PlanView } from '../../features/orders/PlanView';
import { entrySideFor } from '../../features/orders/types';
import type { Plan } from '../../features/orders/types';

export default function PlanDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const planId = String(id ?? '');
  const { data, loading, error, notAvailable } = useTradeResource<Plan>(() => tradeApi.plan(planId), [planId]);
  const [local, setLocal] = useState<Plan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = local ?? data;

  /** Every edit is an intent the server owns; the local copy is optimistic. */
  const change = useCallback(async (next: Plan) => {
    const prev = plan;
    setLocal(next);
    if (!prev || !planId) return;
    try {
      if (next.stop !== prev.stop && next.stop != null) await tradeApi.planAction(planId, 'adjust_stop', { stop: next.stop });
      if (next.targets[0] !== prev.targets[0] && next.targets[0] != null) await tradeApi.planAction(planId, 'adjust_target', { targets: [next.targets[0]] });
      if (next.exit_style !== prev.exit_style) await tradeApi.planAction(planId, 'set_exit_style', { exit_style: next.exit_style });
      setNotice(null);
    } catch {
      setNotice('That change is showing here but did not save. Try again before you place the order.');
    }
  }, [plan, planId]);

  const cancel = () => (router.canGoBack() ? router.back() : router.replace('/trade'));

  const review = () => {
    if (!plan) return;
    const q = new URLSearchParams({
      symbol: plan.symbol,
      side: entrySideFor(plan.side),
      ...((plan.size_notional ?? 0) > 0 ? { amount: String(plan.size_notional) } : null),
      ...((plan.size_notional ?? 0) <= 0 && (plan.size_shares ?? 0) > 0 ? { qty: String(plan.size_shares) } : null),
      ...(plan.entry != null ? { limit: String(plan.entry) } : null),
      plan: planId,
      ...(plan.setup_id ? { setup: plan.setup_id } : null),
    });
    router.push(`/order/new?${q.toString()}`);
  };

  if (!plan && loading) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-plan">
        <StackHeader title="Your plan" />
        <ScreenLoading />
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-plan">
        <StackHeader title="Your plan" />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              {notAvailable ? "Plans aren't live on this build yet." : error ?? 'I could not find that plan.'}
            </T>
          </ObjectCard>
          <Button label="Back" kind="outline" onPress={cancel} />
        </View>
      </Screen>
    );
  }

  return <PlanView plan={plan} onChange={change} onReview={review} onCancel={cancel} notice={notice} />;
}
