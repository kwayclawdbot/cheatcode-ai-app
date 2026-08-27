import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { debriefApi } from '../../lib/community-api';
import { StackHeader } from '../../features/community/ui/Chrome';
import { CircleX, Replay, Warn } from '../../features/community/ui/Icons';
import { ReceiptGrid, ReceiptList, SimulatedTag } from '../../features/debrief/ui/Receipt';
import type { Debrief } from '../../features/debrief/types';
import { KaiDot } from '../../features/community/ui/KaiDot';

/**
 * V3-T2 debrief (with the S25 detail folded in below the fold).
 *
 * DEVIATION from V3-T2, deliberate: the artboard's dominant volt button is
 * "Chart replay". Replay needs the chart surface that ships with the market
 * data worker, so it is disabled with an honest hint and "Save lesson" — which
 * really works — becomes the one dominant action. Geometry is unchanged.
 */
export default function DebriefDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await debriefApi.get(String(id ?? ''));
      if (!alive) return;
      setDebrief(r.debrief);
      setSaved(!!r.debrief?.lesson_saved);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  const save = async () => {
    if (!debrief) return;
    setSaving(true);
    setError(null);
    try {
      await debriefApi.saveLesson(debrief.id);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "That lesson didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-debrief">
        <Wash variant="corner" />
        <StackHeader title="Debrief" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.violet} />
        </View>
      </View>
    );
  }

  if (!debrief) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-debrief">
        <Wash variant="corner" />
        <StackHeader title="Debrief" onBack={() => router.back()} />
        <View style={{ padding: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted}>That debrief isn't there. It may have been removed.</T>
          </ObjectCard>
        </View>
      </View>
    );
  }

  const o = debrief.outcome;
  const win = o.pnl > 0;
  const flat = o.pnl === 0;
  const tone = flat ? color.muted : win ? color.green : color.red;
  const Mark = flat ? Warn : win ? Check : CircleX;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }} testID="screen-debrief">
      <Wash variant="corner" />
      <StackHeader
        title={`Debrief · ${o.symbol}`}
        onBack={() => router.back()}
        right={debrief.simulated ? <SimulatedTag /> : undefined}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 20, gap: 14, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 64, height: 64, borderRadius: 32,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: flat ? alpha.ivory06 : win ? alpha.green12 : alpha.red12,
              borderWidth: 1, borderColor: flat ? alpha.ivory24 : win ? alpha.green40 : alpha.red40,
            }}
          >
            <Mark size={28} color={tone} />
          </View>

          <View style={{ alignItems: 'center' }}>
            <Num size={34} weight="semibold" c={tone}>{o.pnl_label}</Num>
            <T size={13} c={color.muted} align="center" style={{ marginTop: 4 }}>
              {o.symbol} · {o.exit_reason}{o.held ? ` · ${o.held}` : ''}
            </T>
            {debrief.simulated ? (
              <T size={11} c={color.muted} align="center" style={{ marginTop: 6 }}>
                A simulated paper trade, created for testing. No money moved.
              </T>
            ) : null}
          </View>
        </View>

        <ReceiptGrid items={debrief.process_receipt} />

        {/* Kai's lesson — the violet panel. */}
        <ObjectCard tone="kai" r={radius.xl} style={{ padding: 13, paddingHorizontal: 15, gap: 8 }} testID="kai-lesson">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <KaiDot size={24} />
            <T size={13} lh={20} style={{ flex: 1 }}>
              {debrief.lesson_plain}
              {debrief.lesson_detail && !expanded ? (
                <T size={13} weight="semibold" c={color.violetLight} onPress={() => setExpanded(true)}> More</T>
              ) : null}
            </T>
          </View>
          {expanded && debrief.lesson_detail ? (
            <T size={13} lh={20} c={color.violetLight}>{debrief.lesson_detail}</T>
          ) : null}
        </ObjectCard>

        {/* One dominant action. Replay waits for the chart surface. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            testID="save-lesson"
            label={saved ? 'Lesson saved' : saving ? 'Saving…' : 'Save lesson'}
            height={46}
            style={{ flex: 1 }}
            loading={saving}
            disabled={saved}
            onPress={save}
          />
          <Button
            testID="chart-replay"
            label="Chart replay"
            kind="outline"
            height={46}
            icon={<Replay size={15} color={color.muted} />}
            style={{ flex: 1 }}
            disabled
            accessibilityHint="Chart replay arrives with live market data."
          />
        </View>
        {saved ? (
          <T size={12} c={color.violetLight} testID="saved-note">Saved to what Kai remembers.</T>
        ) : (
          <T size={11} c={color.muted}>Chart replay arrives with live market data.</T>
        )}
        {error ? <T size={12} c={color.gold}>{error}</T> : null}

        {debrief.process_receipt.length ? (
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
            <Eyebrow>PROCESS RECEIPT</Eyebrow>
            <ReceiptList items={debrief.process_receipt} />
          </ObjectCard>
        ) : null}

        {debrief.what_worked.length || debrief.what_failed.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {debrief.what_worked.length ? (
              <View style={{ flex: 1, gap: 6, padding: 13, borderRadius: radius.xl, backgroundColor: color.greenTint, borderWidth: 0.5, borderColor: alpha.green40 }}>
                <Eyebrow c={color.green}>WHAT WORKED</Eyebrow>
                {debrief.what_worked.map((w) => <T key={w} size={12} lh={17}>{w}</T>)}
              </View>
            ) : null}
            {debrief.what_failed.length ? (
              <View style={{ flex: 1, gap: 6, padding: 13, borderRadius: radius.xl, backgroundColor: color.redTint, borderWidth: 0.5, borderColor: alpha.red40 }}>
                <Eyebrow c={color.red}>WHAT DIDN'T</Eyebrow>
                {debrief.what_failed.map((w) => <T key={w} size={12} lh={17}>{w}</T>)}
              </View>
            ) : null}
          </View>
        ) : null}

        {debrief.timeline.length ? (
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 12 }} testID="timeline">
            <Eyebrow>WHAT HAPPENED, IN ORDER</Eyebrow>
            {debrief.timeline.map((t, i) => (
              <View key={`${t.at}-${i}`} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 44 }}>
                  <Num size={11} weight="regular" c={color.muted}>{t.time_label}</Num>
                </View>
                <View style={{ alignItems: 'center', width: 10 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.kind === 'exit' ? color.cyan : alpha.ivory25, marginTop: 4 }} />
                  {i < debrief.timeline.length - 1 ? (
                    <View style={{ flex: 1, width: 1, backgroundColor: alpha.ivory08, marginTop: 2 }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: i < debrief.timeline.length - 1 ? 6 : 0 }}>
                  <T size={13} weight="semibold">{t.label}</T>
                  {t.detail ? <T size={11} c={color.muted} style={{ marginTop: 1 }}>{t.detail}</T> : null}
                </View>
              </View>
            ))}
          </ObjectCard>
        ) : null}

        <View style={{ height: Math.max(insets.bottom, 8) }} />
      </ScrollView>
    </View>
  );
}
