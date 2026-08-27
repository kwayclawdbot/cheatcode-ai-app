/**
 * Position detail — the second half of V3-P1.
 *
 * Three questions, in this order: where is it, what did the plan say, and is
 * there anything to do. "Plan vs now" is the spine — the plan's entry, stop and
 * target sit beside where price actually is, so a drifting trade is visible
 * rather than remembered.
 *
 * Exit now does NOT send anything. It routes to the same review screen every
 * other order goes through (`/order/review?close=<id>`), because a close is an
 * order and deserves the same confirmation, the same freshness line and the
 * same "nothing is sent until you confirm".
 */
import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { ScreenLoading } from '../../ui/Loading';
import { color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../../features/kai-sheet';
import { usePosition } from '../../features/positions/usePositions';
import { tradeApi } from '../../lib/trade-api';
import {
  DetailRow, KaiLine, PaperChip, StatusDot, StopNowTargetBar, money, pnlColor, shareLabel,
  signedMoney, signedPct,
} from '../../features/trade/components';

type AdjustKind = 'stop' | 'target';

export default function PositionDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');
  const { data, loading, error, notAvailable, reload } = usePosition(id);
  const [adjust, setAdjust] = useState<AdjustKind | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-position">
        <StackHeader title="Position" />
        <ScreenLoading />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-position">
        <StackHeader title="Position" />
        <View style={{ paddingHorizontal: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              {notAvailable ? "Positions aren't live on this build yet." : error ?? 'I could not find that position.'}
            </T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const p = data;
  const open = p.status === 'open';
  const pnl = open ? p.unrealized_pnl : p.realized_pnl;
  const atRisk = p.health === 'at_risk';

  const openAdjust = (kind: AdjustKind) => {
    setSaveError(null);
    setDraft(String((kind === 'stop' ? p.plan_stop ?? p.stop : p.plan_target ?? p.target) ?? ''));
    setAdjust(kind);
  };

  const saveAdjust = async () => {
    const value = Number(draft);
    if (!adjust || !Number.isFinite(value) || value <= 0) {
      setSaveError('That needs to be a price.');
      return;
    }
    if (!p.plan_id) {
      setSaveError("This position didn't come from a plan, so there is no stop to move here yet.");
      return;
    }
    setSaving(true);
    try {
      await tradeApi.planAction(
        p.plan_id,
        adjust === 'stop' ? 'adjust_stop' : 'adjust_target',
        adjust === 'stop' ? { stop: value } : { targets: [value] },
      );
      setAdjust(null);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen variant="corner" layout="tab" testID="screen-position">
      <StackHeader
        title={p.symbol}
        subtitle={`${p.side === 'short' ? 'Short' : 'Long'} · ${shareLabel(p.qty)}${p.avg_entry != null ? ` at ${money(p.avg_entry)}` : ''}`}
        right={<PaperChip />}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Where it is */}
        <ObjectCard tone={atRisk ? 'gold' : 'default'} r={radius.xxl} style={{ padding: 15, gap: 10 }} testID="position-header">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={10} c={color.muted} style={{ flex: 1 }}>{open ? 'Open · unrealised' : 'Closed · realised'}</T>
            <StatusDot c={atRisk ? color.gold : open ? color.green : color.muted} />
            <T size={11} c={atRisk ? color.gold : open ? color.green : color.muted}>{p.health_label}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
            <Num size={30} weight="semibold" c={pnlColor(pnl)} testID="position-pnl">{signedMoney(pnl)}</Num>
            <Num size={12} weight="regular" c={color.muted}>
              {[p.unrealized_pnl_pct != null ? signedPct(p.unrealized_pnl_pct) : null, p.pnl_detail].filter(Boolean).join(' · ')}
            </Num>
          </View>
          {open ? <StopNowTargetBar stop={p.stop} now={p.mark_price} target={p.target} testID="position-levels" /> : null}
          {p.kai_line ? <KaiLine text={p.kai_line} testID="position-kai-line" /> : null}
        </ObjectCard>

        {/* What the plan said, beside where price is */}
        <Eyebrow>PLAN VS NOW</Eyebrow>
        <ObjectCard r={radius.xxl} style={{ paddingHorizontal: 15, paddingVertical: 4 }} testID="plan-vs-now">
          {/* The server composes this table when it can — plan value beside the
              live one, already worded. Otherwise it is derived below. */}
          {p.plan_vs_now.length ? (
            p.plan_vs_now.map((row, i) => (
              <DetailRow
                key={row.label}
                label={row.label}
                value={`${row.planned} → ${row.now}`}
                mono={false}
                valueColor={row.semantic === 'risk' ? color.red : row.semantic === 'positive' ? color.green : undefined}
                last={i === p.plan_vs_now.length - 1}
              />
            ))
          ) : (
            <>
          <DetailRow label="Planned entry" value={p.plan_entry != null ? money(p.plan_entry) : '—'} />
          <DetailRow label="You got in at" value={p.avg_entry != null ? money(p.avg_entry) : '—'} />
          <DetailRow
            label="Stop"
            value={p.plan_stop != null ? money(p.plan_stop) : 'Not set'}
            valueColor={color.red}
            onPress={open ? () => openAdjust('stop') : undefined}
            testID="adjust-stop"
            hint="Move your stop"
          />
          <DetailRow
            label="Target"
            value={p.plan_target != null ? money(p.plan_target) : 'Not set'}
            valueColor={color.green}
            onPress={open ? () => openAdjust('target') : undefined}
            testID="adjust-target"
            hint="Move your target"
          />
          <DetailRow
            label={open ? 'Price now' : 'Closed at'}
            value={p.mark_price != null ? money(p.mark_price) : '—'}
          />
          <DetailRow
            label="Exits"
            value={p.exit_style === 'alert_assisted' ? 'Kai warns me, I tap' : p.exit_style === 'auto' ? 'Attached automatically' : 'Not attached'}
            mono={false}
            last
          />
            </>
          )}
        </ObjectCard>

        {p.history.length ? (
          <>
            <Eyebrow>HOW YOU GOT HERE</Eyebrow>
            <ObjectCard r={radius.xxl} style={{ paddingHorizontal: 15, paddingVertical: 4 }} testID="position-history">
              {p.history.map((h, i) => (
                <DetailRow
                  key={`${h.label}-${i}`}
                  label={h.label}
                  value={h.detail ?? ''}
                  mono={false}
                  last={i === p.history.length - 1}
                />
              ))}
            </ObjectCard>
          </>
        ) : null}

        {/* What there is to do */}
        {open ? (
          <>
            <Button
              label="Exit now"
              onPress={() => router.push(`/order/review?close=${encodeURIComponent(p.id)}`)}
              testID="exit-now"
              accessibilityHint="Shows you the closing order before anything is sent"
            />
            <Button
              label="Ask Kai about this position"
              kind="kai"
              onPress={() => openKaiSheet({ context: { kind: 'position', id: p.id, symbol: p.symbol } })}
              testID="ask-kai"
            />
            <T size={11} c={color.dim} align="center" lh={16}>
              Nothing is sent until you confirm it on the next screen.
            </T>
          </>
        ) : (
          <>
            <Button
              label={p.has_debrief ? 'Read the debrief' : 'Get Kai’s debrief'}
              onPress={() => router.push(p.debrief_id ? `/debrief/${encodeURIComponent(p.debrief_id)}` : '/debrief')}
              testID="debrief-link"
            />
            <Button
              label="Ask Kai about this trade"
              kind="kai"
              onPress={() => openKaiSheet({ context: { kind: 'position', id: p.id, symbol: p.symbol } })}
              testID="ask-kai"
            />
          </>
        )}
      </ScrollView>

      <Sheet
        visible={adjust != null}
        onClose={() => setAdjust(null)}
        title={adjust === 'target' ? 'Move your target' : 'Move your stop'}
        testID="adjust-sheet"
      >
        <T size={13} c={color.muted} lh={19}>
          {adjust === 'target'
            ? 'Where do you want to take this off? Kai updates the plan and the attached order.'
            : 'The stop is the price where you have decided you were wrong. Moving it away from price costs you more when it hits.'}
        </T>
        <Field
          label={adjust === 'target' ? 'Target price' : 'Stop price'}
          testID="adjust-input"
          value={draft}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          placeholder="0.00"
          error={saveError}
        />
        <Button label="Save" onPress={saveAdjust} loading={saving} testID="adjust-save" />
      </Sheet>
    </Screen>
  );
}
