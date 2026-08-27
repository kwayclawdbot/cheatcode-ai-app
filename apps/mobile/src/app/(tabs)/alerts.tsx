import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { Check, Calendar, Bell, Plus } from '../../ui/Icons';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, radius } from '../../ui/tokens';
import { monitoringLine, useAlertActions, useAlertsLifecycle } from '../../features/alerts/useAlerts';
import type { AlertRow } from '../../lib/types';

/** A section that exists even when it is empty says something; a missing one lies. */
function SectionEmpty({ children }: { children: string }) {
  return (
    <ObjectCard r={radius.xl} style={{ paddingVertical: 14, paddingHorizontal: 15 }}>
      <T size={12.5} lh={18} c={color.muted}>{children}</T>
    </ObjectCard>
  );
}

function AlertListRow({
  row, last, onOpen, onActivate, busy,
}: { row: AlertRow; last: boolean; onOpen: () => void; onActivate?: () => void; busy: boolean }) {
  const line = monitoringLine(row.monitoring, row.monitoring_plain);
  return (
    <Row last={last} style={{ paddingVertical: 11, alignItems: 'flex-start' }}>
      {/* The left rail carries the condition. A date alert gets the calendar;
          anything without a level gets a neutral rule, never a wrong glyph. */}
      <View style={{ width: 58, paddingTop: 2 }}>
        {row.condition_label
          ? <Num size={12} weight="regular" c={color.cyan}>{row.condition_label}</Num>
          : row.meta
            ? <Calendar size={14} color={color.cyan} />
            : <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: color.dim, marginTop: 6 }} />}
      </View>
      <Pressable
        testID={`alert-row-${row.id}`}
        accessibilityRole="button"
        accessibilityLabel={row.title}
        onPress={onOpen}
        style={{ flex: 1, minHeight: 32, justifyContent: 'center' }}
      >
        <T size={14} weight="semibold">{row.title}</T>
        {row.status === 'draft' ? (
          <T size={11} c={color.gold} style={{ marginTop: 2 }}>Draft — not watching yet</T>
        ) : line ? (
          <T size={11} c={color.muted} style={{ marginTop: 2 }}>{line}</T>
        ) : null}
      </Pressable>
      {row.status === 'draft' && onActivate ? (
        <Button
          testID={`activate-${row.id}`}
          label="Activate"
          kind="voltGhost"
          height={34}
          full={false}
          size={12}
          loading={busy}
          onPress={onActivate}
        />
      ) : (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {row.value ? <Num size={11} weight="regular" c={color.muted}>{row.value}</Num> : null}
          {row.quote ? (
            <FreshnessMark freshness={row.quote.freshness ?? 'unknown'} delayReason={row.quote.delay_reason} size={9} />
          ) : row.meta ? (
            <T size={11} c={color.muted}>{row.meta}</T>
          ) : null}
        </View>
      )}
    </Row>
  );
}

/**
 * Alerts — V3-A1-Alerts.html, extended to the full lifecycle.
 * Needs attention · Watching · Active trades · Triggered · History.
 * Kai triages; the user decides. Nothing here evaluates yet and the screen
 * says so on every armed row rather than implying a live feed.
 */
export default function Alerts() {
  const router = useRouter();
  const { data, loading, error, isFixture, reload } = useAlertsLifecycle();
  const actions = useAlertActions(reload);

  const empty =
    !!data &&
    !data.needs_attention.length && !data.watching.length &&
    !data.active_trades.length && !data.triggered.length && !data.history.length;

  const open = (id: string) => router.push(`/alert/${encodeURIComponent(id)}`);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alerts">
        <ScreenLoading label="Checking what Kai is watching…" />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-alerts">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T size={28} weight="bold">Alerts</T>
            <T size={11} c={color.muted}>Kai triages · you decide</T>
          </View>
          <Pressable
            testID="alert-new"
            accessibilityRole="button"
            accessibilityLabel="New alert"
            onPress={() => router.push('/alert/new')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => ({
              width: 38, height: 38, borderRadius: 19,
              borderWidth: 0.5, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
            })}
          >
            <Plus size={16} color={color.volt} />
          </Pressable>
        </View>

        {empty ? (
          <ObjectCard r={radius.xxl} style={{ padding: 20, gap: 10, alignItems: 'center', marginTop: 24 }}>
            <Bell size={22} color={color.muted} />
            <T size={15} weight="bold" align="center">{data?.empty_copy ?? "Kai isn't watching anything for you yet."}</T>
            <T size={13} c={color.muted} align="center" lh={19}>
              Open a setup and tell Kai the level that matters. He&apos;ll watch it and tell you when it happens.
            </T>
            <Button testID="cta-first-alert" label="Create your first alert" kind="volt" height={46} onPress={() => router.push('/alert/new')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          </ObjectCard>
        ) : null}

        {/* ---------------- NEEDS ATTENTION ---------------- */}
        {data?.needs_attention.length ? (
          <>
            <Eyebrow c={color.gold}>{`NEEDS ATTENTION · ${data.needs_attention.length}`}</Eyebrow>
            {data.needs_attention.map((a) => (
              <ObjectCard key={a.id} tone="gold" r={radius.xxl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <T size={17} weight="bold">{a.symbol || a.title}</T>
                  {a.grade_change ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.gold14, borderWidth: 0.5, borderColor: alpha.gold40 }}>
                      <T size={11} weight="bold" c={color.gold}>{a.grade_change}</T>
                    </View>
                  ) : null}
                  {a.age ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{a.age}</T> : null}
                </View>

                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T size={12} c={color.muted}>Now</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Num size={12} weight="regular">{a.value ?? '—'}</Num>
                      <FreshnessMark freshness={a.quote?.freshness ?? 'unknown'} delayReason={a.quote?.delay_reason} size={10} />
                    </View>
                  </View>
                  <View style={{ height: 7, borderRadius: 4, backgroundColor: alpha.ivory08 }}>
                    <LinearGradient
                      colors={[color.green, color.gold, color.red] as unknown as readonly [string, string, ...string[]]}
                      locations={[0, 0.75, 1] as unknown as readonly [number, number, ...number[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ width: '88%', height: '100%', borderRadius: 4 }}
                    />
                    <View style={{ position: 'absolute', right: 0, top: -3, width: 2, height: 13, backgroundColor: color.red }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T size={10} c={color.muted}>{a.entry_label ?? ''}</T>
                    <T size={10} c={color.red}>{a.detail}</T>
                  </View>
                </View>

                <Button label="Review this alert" kind="volt" height={42} onPress={() => open(a.id)} />
              </ObjectCard>
            ))}
          </>
        ) : null}

        {/* ---------------- WATCHING ---------------- */}
        {!empty ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Eyebrow c={color.cyan}>{`WATCHING · ${data?.watching.length ?? 0}`}</Eyebrow>
            </View>
            {data?.watching.length ? (
              <RowList>
                {data.watching.map((w, i) => (
                  <AlertListRow
                    key={w.id}
                    row={w}
                    last={i === data.watching.length - 1}
                    onOpen={() => open(w.id)}
                    onActivate={() => actions.activate(w.id)}
                    busy={actions.busyId === w.id}
                  />
                ))}
              </RowList>
            ) : (
              <SectionEmpty>Nothing is being watched right now.</SectionEmpty>
            )}
          </>
        ) : null}

        {/* ---------------- ACTIVE TRADES ---------------- */}
        {!empty ? (
          <>
            <Eyebrow c={color.green}>ACTIVE TRADES</Eyebrow>
            {data?.active_trades.length ? (
              <RowList>
                {data.active_trades.map((a, i) => (
                  <AlertListRow key={a.id} row={a} last={i === data.active_trades.length - 1} onOpen={() => open(a.id)} busy={false} />
                ))}
              </RowList>
            ) : (
              <SectionEmpty>
                No open trades. Paper trading arrives in the next release — until then Kai watches levels, not positions.
              </SectionEmpty>
            )}
          </>
        ) : null}

        {/* ---------------- TRIGGERED ---------------- */}
        {data?.triggered.length ? (
          <>
            <Eyebrow c={color.gold}>{`TRIGGERED · ${data.triggered.length}`}</Eyebrow>
            <RowList>
              {data.triggered.map((a, i) => (
                <AlertListRow key={a.id} row={a} last={i === data.triggered.length - 1} onOpen={() => open(a.id)} busy={false} />
              ))}
            </RowList>
          </>
        ) : null}

        {/* ---------------- HISTORY ---------------- */}
        {data?.history.length ? (
          <>
            <Eyebrow c={color.green}>HISTORY</Eyebrow>
            {data.history.map((r) => (
              <Pressable key={r.id} onPress={() => open(r.id)} accessibilityRole="button" accessibilityLabel={r.title}>
                <ObjectCard r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.75 }}>
                  <Check size={14} color={color.green} strokeWidth={2.4} />
                  <T size={13} style={{ flex: 1 }}>{r.title}</T>
                  {r.value ? <Num size={12} weight="regular" c={color.green}>{r.value}</Num> : null}
                </ObjectCard>
              </Pressable>
            ))}
          </>
        ) : null}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {actions.error ? <T size={11} c={color.red} align="center">{actions.error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample alerts — the alerts service is not connected here.</T> : null}
      </ScrollView>

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
