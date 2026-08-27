import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { alpha, color, radius } from '../../ui/tokens';
import { debriefApi } from '../../lib/community-api';
import { StackHeader } from '../../features/community/ui/Chrome';
import { SimulatedTag } from '../../features/debrief/ui/Receipt';
import type { ClosedPosition, Debrief } from '../../features/debrief/types';

/**
 * Debrief list. Two groups, in the order the user cares about:
 *   1. closed trades with no debrief yet  -> one dominant action per row
 *   2. the debriefs they already have
 * No scores, no streaks, no "win rate" — the point is the process, not a tally.
 */
export default function DebriefList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [debriefs, setDebriefs] = useState<Debrief[]>([]);
  const [closed, setClosed] = useState<ClosedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exampleData, setExampleData] = useState(false);

  const load = useCallback(async () => {
    const r = await debriefApi.list();
    setDebriefs(r.debriefs);
    setClosed(r.closed);
    setExampleData(debriefApi.available() && r.source === 'fixtures');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const withDebrief = new Set(debriefs.map((d) => d.position_id));
  const pending = closed.filter((p) => !p.debrief_id && !withDebrief.has(p.id));

  const requestDebrief = async (position: ClosedPosition) => {
    setWorking(position.id);
    setError(null);
    try {
      const d = await debriefApi.create(position.id);
      if (d) { await load(); router.push(`/debrief/${d.id}`); }
      else setError('Kai could not write that debrief yet. Nothing was lost — try again.');
    } catch (e: any) {
      setError(e?.message ?? 'Kai could not write that debrief yet.');
    } finally {
      setWorking(null);
    }
  };

  const pnlColor = (n: number) => (n > 0 ? color.green : n < 0 ? color.red : color.muted);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-debriefs">
      <Wash variant="corner" />
      <StackHeader title="Debriefs" subtitle="Process before outcome" onBack={() => router.back()} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 14, gap: 11, paddingBottom: Math.max(insets.bottom, 24) }}
          showsVerticalScrollIndicator={false}
        >
          {exampleData ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }} testID="example-data">
              <T size={12} lh={17} c={color.gold}>
                Example debriefs. Your own write-ups appear here once a paper trade closes.
              </T>
            </ObjectCard>
          ) : null}

          {pending.length ? (
            <>
              <Eyebrow c={color.gold}>READY FOR A DEBRIEF</Eyebrow>
              {pending.map((p) => (
                <ObjectCard key={p.id} tone="gold" r={radius.xl} style={{ padding: 14, gap: 11 }} testID={`pending-${p.symbol}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={16} weight="bold">{p.symbol}</T>
                    {p.simulated ? <SimulatedTag /> : null}
                    <Num size={15} weight="semibold" c={pnlColor(p.pnl)} style={{ marginLeft: 'auto' }}>{p.pnl_label}</Num>
                  </View>
                  <T size={12} c={color.muted}>{p.closed_label}{p.held ? ` · held ${p.held}` : ''}</T>
                  <Button
                    testID={`get-debrief-${p.symbol}`}
                    label={working === p.id ? 'Kai is writing it…' : "Get Kai's debrief"}
                    height={44}
                    arrow
                    loading={working === p.id}
                    onPress={() => requestDebrief(p)}
                  />
                </ObjectCard>
              ))}
            </>
          ) : null}

          <Eyebrow>YOUR DEBRIEFS</Eyebrow>
          {debriefs.length === 0 ? (
            <ObjectCard r={radius.xl} style={{ padding: 18, gap: 6 }}>
              <T size={14} weight="semibold">No debriefs yet.</T>
              <T size={13} lh={19} c={color.muted}>
                When a trade closes, Kai writes up what the plan said, what you actually did, and the one thing worth
                keeping. Nothing here is a score.
              </T>
            </ObjectCard>
          ) : (
            debriefs.map((d) => (
              <Pressable
                key={d.id}
                testID={`debrief-${d.outcome.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`${d.outcome.symbol} debrief, ${d.outcome.pnl_label}, ${d.outcome.exit_reason}`}
                onPress={() => router.push(`/debrief/${d.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
              >
                <ObjectCard r={radius.xl} style={{ padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={16} weight="bold">{d.outcome.symbol}</T>
                    {d.simulated ? <SimulatedTag /> : null}
                    <Num size={16} weight="semibold" c={pnlColor(d.outcome.pnl)} style={{ marginLeft: 'auto' }}>
                      {d.outcome.pnl_label}
                    </Num>
                  </View>
                  <T size={12} c={color.muted}>
                    {d.outcome.exit_reason}{d.outcome.held ? ` · held ${d.outcome.held}` : ''}
                  </T>
                  <T size={13} lh={19} numberOfLines={2}>{d.lesson_plain}</T>
                  <View style={{ flexDirection: 'row', gap: 5, marginTop: 2 }}>
                    {d.process_receipt.map((r) => (
                      <View
                        key={r.label}
                        style={{
                          width: 7, height: 7, borderRadius: r.status === 'ok' ? 3.5 : 0,
                          backgroundColor: r.status === 'ok' ? color.green : r.status === 'warn' ? color.gold : color.red,
                        }}
                      />
                    ))}
                    <T size={10} c={color.muted} style={{ marginLeft: 4 }}>
                      {d.process_receipt.filter((r) => r.status === 'ok').length} of {d.process_receipt.length} steps kept
                    </T>
                  </View>
                </ObjectCard>
              </Pressable>
            ))
          )}

          {error ? (
            <ObjectCard tone="gold" r={radius.lg} style={{ padding: 12 }}>
              <T size={12} c={color.gold}>{error}</T>
            </ObjectCard>
          ) : null}

          <T size={10} lh={15} c={color.dim} style={{ marginTop: 4 }}>
            Paper trades only for now. A debrief describes what happened — it is not advice and not a prediction.
          </T>
        </ScrollView>
      )}
    </View>
  );
}
