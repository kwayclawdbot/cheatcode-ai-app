import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { ScreenLoading } from '../../ui/Loading';
import { Bell, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import {
  AlertComposer, AttentionCard, FilterPills, MonitoringList,
  useAlertActions, useAlertBuilder, useAlertsSimple,
} from '../../features/alerts';
import type { AlertFilterKey } from '../../lib/types';

/**
 * Alerts — V5-A1-Alerts-simple.html.
 *
 * Three buckets, not five sections (audit §6): Attention · Monitoring ·
 * History, chosen with filter pills. The attention card is the only strong
 * card on the screen; monitoring is rows; the composer at the bottom takes a
 * plain sentence, shows what Kai understood, and activates it inline.
 */
export default function Alerts() {
  const router = useRouter();
  const { data, loading, error, isFixture, reload } = useAlertsSimple();
  const actions = useAlertActions(reload);
  const builder = useAlertBuilder();
  const [filter, setFilter] = useState<AlertFilterKey>('attention');

  const counts = useMemo(() => ({
    attention: data?.attention.length ?? 0,
    monitoring: data?.monitoring.length ?? 0,
    history: data?.history.length ?? 0,
  }), [data]);

  const empty = !!data && !counts.attention && !counts.monitoring && !counts.history;

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alerts">
        <ScreenLoading label="Checking what Kai is watching…" />
      </Screen>
    );
  }

  const activate = async () => {
    if (!builder.preview) return;
    await actions.activate(builder.preview.alert_id);
    builder.clear();
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <T size={28} weight="bold">Alerts</T>

        <FilterPills value={filter} onChange={setFilter} counts={counts} />

        {empty ? (
          <ObjectCard r={radius.xxl} style={{ padding: 20, gap: 10, alignItems: 'center', marginTop: 20 }}>
            <Bell size={22} color={color.muted} />
            <T size={15} weight="bold" align="center">{data?.empty_copy ?? "Kai isn't watching anything for you yet."}</T>
            <T size={13} c={color.muted} align="center" lh={19}>
              Tell him what matters in your own words — &ldquo;tell me when TSLA drops below 170&rdquo; — and he will watch it.
            </T>
          </ObjectCard>
        ) : null}

        {/* ---------------- ATTENTION ---------------- */}
        {filter === 'attention' ? (
          counts.attention ? (
            <View testID="attention-list" style={{ gap: 11 }}>
              {data!.attention.map((a) => <AttentionCard key={a.id} a={a} />)}
            </View>
          ) : !empty ? (
            <T testID="attention-empty" size={12.5} lh={18} c={color.muted} style={{ paddingVertical: 8 }}>
              Nothing needs a decision right now. {counts.monitoring} {counts.monitoring === 1 ? 'condition is' : 'conditions are'} being watched.
            </T>
          ) : null
        ) : null}

        {/* Attention keeps the monitoring list visible underneath — the artboard
            shows both, and hiding it would make the screen feel emptier than
            the account actually is. */}
        {filter === 'attention' && counts.monitoring ? (
          <>
            <Eyebrow c={color.dim} style={{ paddingTop: 4 }}>MONITORING</Eyebrow>
            <MonitoringList rows={data!.monitoring} />
          </>
        ) : null}

        {/* ---------------- MONITORING ---------------- */}
        {filter === 'monitoring' ? <MonitoringList rows={data?.monitoring ?? []} /> : null}

        {/* ---------------- HISTORY ---------------- */}
        {filter === 'history' ? (
          counts.history ? (
            <View testID="history-list">
              {data!.history.map((r, i) => (
                <Pressable
                  key={r.id}
                  testID={`history-${r.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={r.title}
                  onPress={() => router.push(`/alert/${encodeURIComponent(r.id)}`)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <View
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 12, paddingHorizontal: 2,
                      borderTopWidth: 0.5, borderTopColor: alpha.ivory08,
                      borderBottomWidth: i === data!.history.length - 1 ? 0.5 : 0,
                      borderBottomColor: alpha.ivory08,
                    }}
                  >
                    <Check size={13} color={color.green} strokeWidth={2.4} />
                    <T size={13} lh={18} style={{ flex: 1 }} c={color.muted}>{r.title}</T>
                    {r.value ? <Num size={11} weight="regular" c={color.green}>{r.value}</Num> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <T testID="history-empty" size={12.5} lh={18} c={color.muted} style={{ paddingVertical: 8 }}>
              Nothing has finished yet. Triggered and cancelled alerts land here.
            </T>
          )
        ) : null}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {actions.error ? <T size={11} c={color.red} align="center">{actions.error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample alerts — the alerts service is not connected here.</T> : null}
      </ScrollView>

      {/* preview → activate, in place */}
      {builder.preview ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 10 }} testID="alert-preview">
            <T size={13.5} lh={20}>{builder.preview.summary_plain}</T>
            {builder.preview.structured.length ? (
              <View style={{ gap: 4 }}>
                {builder.preview.structured.map((s) => (
                  <View key={s.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T size={11} c={color.muted}>{s.label}</T>
                    <Num size={11} weight="regular" c={color.cyan}>{s.value}</Num>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                testID="alert-activate"
                label="Watch this"
                kind="volt"
                height={42}
                style={{ flex: 1 }}
                loading={actions.busyId === builder.preview.alert_id}
                onPress={() => { void activate(); }}
              />
              <Button testID="alert-discard" label="Not that" kind="outline" height={42} full={false} onPress={builder.clear} />
            </View>
          </ObjectCard>
        </View>
      ) : null}

      {builder.error ? (
        <T size={11} c={color.red} align="center" style={{ paddingHorizontal: 16, paddingBottom: 6 }}>{builder.error}</T>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <AlertComposer onBuild={(t) => { void builder.build(t); }} pending={builder.pending} />
      </View>

      <Sheet
        visible={!!actions.upgradeNeeded}
        onClose={actions.dismissUpgrade}
        title="That needs the premium plan"
        testID="sheet-entitlement"
      >
        <T size={13} lh={20} c={color.muted}>{actions.upgradeNeeded}</T>
        <Button label="See what premium adds" kind="volt" height={48} onPress={() => { actions.dismissUpgrade(); router.push('/account/subscription'); }} />
      </Sheet>
    </Screen>
  );
}
