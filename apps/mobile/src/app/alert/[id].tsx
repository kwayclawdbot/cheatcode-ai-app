import React, { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openKaiSheet } from '../../features/kai-sheet';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { KaiOrb } from '../../ui/KaiOrb';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import { monitoringLine, useAlertActions, useAlertDetail } from '../../features/alerts/useAlerts';
import type { AlertDetail as AlertDetailT } from '../../lib/types';

const STATUS: Record<string, { label: string; c: string }> = {
  draft: { label: 'Draft', c: color.gold },
  active: { label: 'Active', c: color.cyan },
  paused: { label: 'Paused', c: color.muted },
  triggered: { label: 'Triggered', c: color.green },
  resolved: { label: 'Resolved', c: color.muted },
  cancelled: { label: 'Cancelled', c: color.muted },
};

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * Exactly one dominant action, chosen by what the user most likely came to do.
 * A healthy active alert needs nothing done to it — pausing it is a change of
 * mind, not the obvious next step — so the loud button goes to the setup behind
 * it and pause sits with the other quiet controls.
 */
function primaryFor(a: AlertDetailT): { label: string; action: 'activate' | 'pause' | 'resume' | 'open_setup' } {
  if (a.status === 'draft') return { label: 'Activate this alert', action: 'activate' };
  if (a.status === 'paused') return { label: 'Resume watching', action: 'resume' };
  const setupChip = a.trace.find((t) => t.route?.startsWith('/setup/'));
  if (setupChip) return { label: 'Open the setup behind it', action: 'open_setup' };
  if (a.status === 'active') return { label: 'Pause this alert', action: 'pause' };
  return { label: 'Back to alerts', action: 'open_setup' };
}

/**
 * Alert detail (S41).
 * Plain condition first, structured logic on demand, the data it depends on,
 * its history, and where it came from. Actions are pause / resume / cancel /
 * edit, with exactly one of them dominant.
 */
export default function AlertDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const { data, loading, error, isFixture, reload } = useAlertDetail(id);
  const actions = useAlertActions(reload);
  const [showLogic, setShowLogic] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (loading && !data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alert">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.violet} /></View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-alert">
        <StackHeader title="Alert" />
        <View style={{ paddingHorizontal: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <T size={15} weight="bold">This alert isn&apos;t available.</T>
            <T size={13} c={color.muted} lh={19}>{error ?? 'It may have been cancelled.'}</T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const st = STATUS[data.status] ?? STATUS.draft;
  const primary = primaryFor(data);
  const line = monitoringLine(data.monitoring, data.monitoring_plain);
  const busy = actions.busyId === data.id;

  const setupRoute = data.trace.find((t) => t.route?.startsWith('/setup/'))?.route ?? null;

  const runPrimary = () => {
    if (primary.action === 'activate') return actions.activate(data.id);
    if (primary.action === 'pause') return actions.act(data.id, 'pause');
    if (primary.action === 'resume') return actions.act(data.id, 'resume');
    return setupRoute ? router.push(setupRoute as never) : router.push('/alerts');
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-alert">
      <StackHeader
        title={data.symbol || 'Alert'}
        subtitleNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.c }} />
            <T size={11} c={st.c}>{st.label}</T>
          </View>
        }
        right={data.condition_label ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
            <Num size={12} weight="medium" c={color.cyan}>{data.condition_label}</Num>
          </View>
        ) : undefined}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* plain english first */}
        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <KaiOrb size={24} />
          <View style={{ flex: 1, gap: 4 }}>
            <T size={14} lh={21} testID="alert-plain">{data.summary_plain || data.natural_language}</T>
            {line ? <T size={11} c={color.violetLight}>{line}</T> : null}
          </View>
        </ObjectCard>

        {data.quote?.price != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <T size={12} c={color.muted}>{`${data.symbol} now`}</T>
            <Num size={15} weight="semibold">{data.quote.price.toFixed(2)}</Num>
            <FreshnessMark freshness={data.quote.freshness ?? 'unknown'} delayReason={data.quote.delay_reason} size={11} />
          </View>
        ) : null}

        {/* structured logic, expandable */}
        <Pressable
          testID="alert-logic-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: showLogic }}
          onPress={() => setShowLogic((v) => !v)}
          style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: alpha.ivory20, borderRadius: radius.lg, padding: 12 }}
        >
          <T size={12} weight="medium" c={color.muted}>
            {showLogic ? 'Hide the exact condition' : 'Show me the exact condition'}
          </T>
        </Pressable>
        {showLogic && data.structured.length ? (
          <RowList>
            {data.structured.map((p, i) => (
              <Row key={`${p.label}${i}`} last={i === data.structured.length - 1}>
                <T size={13} c={color.muted} style={{ flex: 1 }}>{p.label}</T>
                <Num size={12.5}>{p.value}</Num>
              </Row>
            ))}
          </RowList>
        ) : null}

        {/* what the alert depends on */}
        {data.data_dependency.length ? (
          <>
            <Eyebrow c={color.cyan}>WHAT THIS DEPENDS ON</Eyebrow>
            <RowList>
              {data.data_dependency.map((p, i) => (
                <Row key={`${p.label}${i}`} last={i === data.data_dependency.length - 1}>
                  <T size={13} c={color.muted} style={{ flex: 1 }}>{p.label}</T>
                  <T size={12.5} weight="medium" align="right" style={{ maxWidth: '58%' }}>{p.value}</T>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {/* where it came from */}
        {data.trace.length ? (
          <>
            <Eyebrow>WHERE THIS CAME FROM</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {data.trace.map((t) => (
                <Pressable
                  key={t.label}
                  accessibilityRole={t.route ? 'button' : 'text'}
                  accessibilityLabel={t.label}
                  disabled={!t.route}
                  onPress={() => t.route && router.push(t.route as never)}
                  style={{
                    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
                    borderWidth: 0.5, borderColor: t.route ? alpha.violet50 : alpha.ivory14,
                    backgroundColor: t.route ? alpha.violet08 : 'transparent',
                    minHeight: 30, justifyContent: 'center',
                  }}
                >
                  <T size={11.5} c={t.route ? color.violetLight : color.muted}>{t.label}</T>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {/* history */}
        {data.history.length ? (
          <>
            <Eyebrow>HISTORY</Eyebrow>
            <RowList>
              {data.history.map((h, i) => (
                <Row key={`${h.at}${i}`} last={i === data.history.length - 1}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.dim }} />
                  <T size={13} style={{ flex: 1 }}>{h.label}</T>
                  <Num size={11} weight="regular" c={color.muted}>{when(h.at)}</Num>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {/* one dominant action */}
        <Button
          testID="alert-primary"
          label={primary.label}
          kind="volt"
          height={52}
          loading={busy}
          onPress={runPrimary}
        />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {primary.action === 'open_setup' && (data.status === 'active' || data.status === 'paused') ? (
            <Button
              testID="alert-pause"
              label={data.status === 'paused' ? 'Resume' : 'Pause'}
              kind="outline"
              height={44}
              style={{ flex: 1 }}
              loading={busy}
              onPress={() => actions.act(data.id, data.status === 'paused' ? 'resume' : 'pause')}
            />
          ) : null}
          <Button
            testID="alert-edit"
            label="Edit"
            kind="outline"
            height={44}
            style={{ flex: 1 }}
            onPress={() => router.push(`/alert/new?edit=${encodeURIComponent(data.id)}&text=${encodeURIComponent(data.natural_language)}`)}
          />
          {/* Kai explains the change here, over the alert — audit §5. */}
          <Button
            testID="alert-ask-kai"
            label="Ask Kai"
            kind="kai"
            height={44}
            style={{ flex: 1 }}
            onPress={() => openKaiSheet({
              context: { kind: 'alert', id: data.id, symbol: data.symbol || undefined },
              question: `What changed on ${data.symbol || 'this'}?`,
            })}
          />
          <Button
            testID="alert-cancel"
            label="Cancel alert"
            kind="ghost"
            height={44}
            style={{ flex: 1, borderWidth: 0.5, borderColor: alpha.red40, borderRadius: 999 }}
            onPress={() => setConfirmCancel(true)}
          />
        </View>

        {actions.error ? <T size={12} c={color.red} align="center">{actions.error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample alert — the alerts service is not connected here.</T> : null}
      </ScrollView>

      <Sheet visible={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this alert?" testID="sheet-cancel">
        <T size={13} lh={20} c={color.muted}>
          Kai will stop watching {data.symbol || 'this'} and the alert moves to history. You can always create it again.
        </T>
        <Button
          label="Yes, cancel it"
          kind="volt"
          height={48}
          onPress={async () => { setConfirmCancel(false); await actions.act(data.id, 'cancel'); router.replace('/alerts'); }}
        />
        <Button label="Keep watching" kind="ghost" height={44} onPress={() => setConfirmCancel(false)} />
      </Sheet>

      <Sheet visible={!!actions.upgradeNeeded} onClose={actions.dismissUpgrade} title="That needs the premium plan">
        <T size={13} lh={20} c={color.muted}>{actions.upgradeNeeded}</T>
        <Button label="See what premium adds" kind="volt" height={48} onPress={() => { actions.dismissUpgrade(); router.push('/account/subscription'); }} />
      </Sheet>
    </Screen>
  );
}
