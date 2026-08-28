import React, { useMemo } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { ScreenLoading } from '../../ui/Loading';
import { Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import {
  AlertComposer, AlertsEmpty, HistoryAlertRow, StandardAlertCard,
  useAlertActions, useAlertBuilder, useAlertsRound4,
} from '../../features/alerts';
import type { AlertTab } from '../../lib/types';

/**
 * Alerts — prototype board "Alerts" + docs/10 §1–§5.
 *
 * Alerts are COMPLETE TRADE OBJECTS, not notifications. Three top-level
 * states — Active · Watching · History — and one standard card grammar across
 * all three: grade medallion, qualitative scorecard (never fractions),
 * expandable evidence and ONE state-driven primary action that routes into
 * the Trade Portal with the alert context (`/trade/[symbol]?alert=&ctx=alert`).
 * There is no alert-detail destination between the card and the portal.
 * The natural-language composer stays.
 */

const TABS: { key: AlertTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'watching', label: 'Watching' },
  { key: 'history', label: 'History' },
];

function TabBar({ value, onChange, counts }: {
  value: AlertTab; onChange: (t: AlertTab) => void; counts: Record<AlertTab, number>;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 26, borderBottomWidth: 1, borderBottomColor: alpha.ivory08 }} testID="alerts-tabs">
      {TABS.map((t) => {
        const on = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}, ${counts[t.key]} alerts`}
            testID={`alerts-tab-${t.key}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingBottom: 9, marginBottom: -1,
              borderBottomWidth: 2, borderBottomColor: on ? color.volt : 'transparent',
            }}
          >
            <T size={13.5} weight="bold" c={on ? color.text : color.muted}>{t.label}</T>
            {t.key === 'active' && counts.active ? (
              <View style={{ minWidth: 17, height: 17, borderRadius: 9, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <T size={9.5} weight="bold" c={color.bg}>{counts.active}</T>
              </View>
            ) : counts[t.key] ? (
              <T size={12} c={color.muted}>{counts[t.key]}</T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Alerts() {
  const router = useRouter();
  const { data, loading, error, isFixture, reload, tab, setTab } = useAlertsRound4();
  const actions = useAlertActions(reload);
  const builder = useAlertBuilder();

  const counts = useMemo<Record<AlertTab, number>>(() => ({
    active: data?.counts.active ?? data?.active.length ?? 0,
    watching: data?.counts.watching ?? data?.watching.length ?? 0,
    history: data?.counts.history ?? data?.history.length ?? 0,
  }), [data]);

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

  const list = data ? data[tab] : [];

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>
        <T size={28} weight="bold">Alerts</T>
        <TabBar value={tab} onChange={setTab} counts={counts} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 11 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID={`alerts-list-${tab}`}
      >
        {tab === 'history' ? (
          list.length ? (
            list.map((a) => <HistoryAlertRow key={a.id} alert={a} />)
          ) : (
            <AlertsEmpty copy="Nothing has finished yet. Executed, closed and invalidated alerts land here." />
          )
        ) : list.length ? (
          list.map((a) => <StandardAlertCard key={a.id} alert={a} />)
        ) : (
          <AlertsEmpty
            copy={
              tab === 'active'
                ? "Nothing needs a decision right now. Kai moves an alert here the moment a verified event happens."
                : (data?.empty_copy ?? "Kai isn't monitoring anything for you yet.")
            }
          />
        )}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {actions.error ? <T size={11} c={color.red} align="center">{actions.error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample alerts — the alerts service is not connected here.</T> : null}
      </ScrollView>

      {/* NL composer preview → activate, in place */}
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
