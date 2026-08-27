/**
 * Build a plan — `/plan/new?symbol=&setup=`.
 *
 * Starts from the server's suggested numbers for the symbol (the setup's entry,
 * stop and target, sized against the user's risk policy). Nothing is invented
 * locally: when the server has no levels the tiles read "—" and the screen asks
 * for them rather than filling in a plausible price.
 *
 * "Review order" saves the plan (POST /plans) and hands the ticket its numbers.
 * If the plans endpoint is not live on this stack yet, the numbers still travel
 * to the ticket — the plan simply is not persisted, and the screen says so.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { tradeApi, notLiveYet } from '../../lib/trade-api';
import { PlanView } from '../../features/orders/PlanView';
import { entrySideFor } from '../../features/orders/types';
import type { Plan } from '../../features/orders/types';
import type { GoalMode } from '../../lib/types';

export default function NewPlan() {
  const router = useRouter();
  const params = useLocalSearchParams<{ symbol?: string; setup?: string }>();
  const symbol = String(params.symbol ?? '').toUpperCase();
  const setupId = params.setup ? String(params.setup) : null;
  const { profile } = useSession();
  const mode = (profile?.primary_mode as GoalMode) ?? 'day_trade';

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    tradeApi.suggestedPlan(symbol, mode, setupId)
      .then((p) => { if (alive) { setPlan({ ...p, id: null, status: 'draft' }); setError(null); } })
      .catch((e: unknown) => {
        if (!alive) return;
        setPlan(null);
        setError(notLiveYet(e) ? "I can't reach that symbol on this build yet." : e instanceof Error ? e.message : 'Something went wrong.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [symbol, mode, setupId]);

  const cancel = () => (router.canGoBack() ? router.back() : router.replace('/trade'));

  const review = async () => {
    if (!plan) return;
    setBusy(true);
    setNotice(null);
    let planId: string | null = plan.id;
    try {
      // Shape is `CreatePlanRequest`: `side` is a position effect and `size` is
      // a whole-share count, so a fractional suggestion is rounded up to one.
      const shares = plan.size_shares ?? (plan.size_notional != null && plan.entry ? plan.size_notional / plan.entry : null);
      const saved = await tradeApi.createPlan({
        ...(setupId ? { setup_id: setupId } : null),
        symbol: plan.symbol,
        side: entrySideFor(plan.side),
        ...(plan.entry != null ? { entry: plan.entry } : null),
        ...(plan.stop != null ? { stop: plan.stop } : null),
        ...(plan.targets.length ? { targets: plan.targets } : null),
        ...(shares != null && shares > 0 ? { size: Math.max(1, Math.round(shares)) } : null),
        exit_style: plan.exit_style,
      });
      planId = saved.id;
    } catch (e) {
      // The plan not saving must not strand the user: the numbers still go to
      // the ticket, and the screen says the plan itself was not kept.
      setNotice(
        notLiveYet(e)
          ? "I couldn't save this plan on this build yet — the numbers still go to the order."
          : 'I could not save the plan, but the numbers still go to the order.',
      );
    } finally {
      setBusy(false);
    }

    const q = new URLSearchParams({
      symbol: plan.symbol,
      side: entrySideFor(plan.side),
      ...((plan.size_notional ?? 0) > 0 ? { amount: String(plan.size_notional) } : null),
      ...((plan.size_notional ?? 0) <= 0 && (plan.size_shares ?? 0) > 0 ? { qty: String(plan.size_shares) } : null),
      ...(plan.entry != null ? { limit: String(plan.entry) } : null),
      ...(planId ? { plan: planId } : null),
      ...(setupId ? { setup: setupId } : null),
    });
    router.push(`/order/new?${q.toString()}`);
  };

  if (loading && !plan) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-plan">
        <StackHeader title={symbol ? `Plan ${symbol}` : 'Build a plan'} />
        <ScreenLoading label="Working out the numbers…" />
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-plan">
        <StackHeader title="Build a plan" />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>{error ?? 'I could not start a plan for that symbol.'}</T>
          </ObjectCard>
          <Button label="Back" kind="outline" onPress={cancel} />
        </View>
      </Screen>
    );
  }

  return (
    <PlanView
      plan={plan}
      onChange={setPlan}
      onReview={review}
      onCancel={cancel}
      busy={busy}
      notice={notice}
    />
  );
}
