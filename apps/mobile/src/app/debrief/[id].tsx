import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from '../../ui/Wash';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Check, Info } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { debriefApi } from '../../lib/community-api';
import { api } from '../../lib/api';
import { TradeMap } from '../../ui/trade';
import { StackHeader } from '../../features/community/ui/Chrome';
import { CircleX, Replay, Warn } from '../../features/community/ui/Icons';
import { ReceiptGrid, ReceiptList, SimulatedTag } from '../../features/debrief/ui/Receipt';
import type { Debrief } from '../../features/debrief/types';
import { KaiDot } from '../../features/community/ui/KaiDot';
import { TRAINING_LESSON_NODES } from '../../features/training/curriculum';
import type { TrainingSkill } from '../../features/training/types';
import type { Candle } from '../../lib/types';
import type { PlanAdherence } from '@cheatcode/shared';

/**
 * V3-T2 debrief (with the S25 detail folded in below the fold).
 *
 * DEVIATION from V3-T2, deliberate: the artboard's dominant volt button is
 * "Chart replay". Replay needs the chart surface that ships with the market
 * data worker, so it is disabled with an honest hint and "Save lesson" — which
 * really works — becomes the one dominant action. Geometry is unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WAVE 2 — IT NOW ASKS THE NARROWER QUESTION FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 * The screen led with the outcome: a big number, green or red. The review board
 * leads with something better and harder — *did you follow your own plan?* —
 * because the number is downstream of that and the plan is the part a member
 * controls. So the top of the screen is now the adherence headline ("Risk
 * respected. Exit improvised.") over three computed lines, the result is a
 * quiet row beneath it, and the process receipt keeps its place below.
 *
 * `plan_adherence` is fetched separately from the debrief itself (see
 * `api.debriefAdherence`) only because the existing mapper and view-model
 * belong to another lane this wave; the note on that function explains where it
 * belongs once one lane owns both.
 *
 * WHAT IT WILL NOT DRAW. The closed trade's chart is rendered ONLY if the daily
 * bars for the trade's own window actually come back. There is no fallback
 * shape: a plausible candle series under a real entry level is a lie about
 * price action, and the honest sentence this screen already carried — "Chart
 * replay arrives with live market data" — is better than a drawing.
 */

/* ------------------------------------------------------------------ */
/* "Practise the exit" — the hand-off into a lesson                     */
/* ------------------------------------------------------------------ */

/**
 * WHERE THE OWNERSHIP LINE FALLS, AND WHY THIS LIVES HERE.
 *
 * The API names a SKILL and never a lesson, because it cannot name one
 * honestly: which lesson teaches an exit — and whether that lesson has been
 * WRITTEN — are facts that live in the curriculum on the device. So the server
 * says "this member needs the trade-management skill" and this turns it into a
 * destination, reading `features/training` without touching it.
 *
 * AND IT REFUSES TO PROMISE A LESSON THAT DOES NOT EXIST. Most of the
 * curriculum is deliberately unwritten (`hasContent: false`), which the
 * training lane states rather than papers over. A button reading "Practise the
 * exit" that lands on "not written yet" would be this screen making a promise
 * that lane has been careful not to make — so when the lesson is written the
 * button says the board's words and opens it, and when it is not, the button
 * says what it actually does and the line under it names the lesson.
 */
type PracticeLink = { label: string; route: string; written: boolean; note: string | null };

function lessonForSkill(skill: TrainingSkill) {
  // Curriculum order: the EARLIEST lesson teaching the skill is the right one.
  // Somebody who improvised an exit needs the first explanation of exits.
  const forSkill = TRAINING_LESSON_NODES.filter((n) => n.skill === skill);
  return forSkill.find((n) => n.hasContent) ?? forSkill[0] ?? null;
}

function practiceLink(practice: PlanAdherence['practice']): PracticeLink | null {
  if (!practice) return null;
  const node = lessonForSkill(practice.skill as TrainingSkill);
  if (node?.hasContent) return { label: practice.label, route: `/training/${node.id}`, written: true, note: null };
  return {
    label: 'See where this is taught',
    route: '/training',
    written: false,
    note: node
      ? `The lesson for this is \u201c${node.title}\u201d. It is still being written, so this opens your training path instead.`
      : 'This opens your training path \u2014 there is no single lesson for it yet.',
  };
}

/* ------------------------------------------------------------------ */
/* The adherence checklist                                              */
/* ------------------------------------------------------------------ */

/**
 * Three states, three marks, and the third one is the point.
 *
 * `not_planned` is drawn in muted grey with an info mark and NEVER in red or
 * gold, because a plan that named no target did not miss one. Colouring it as a
 * deviation would be the screen judging somebody for a fact that was never
 * recorded. See the API's `debrief-adherence.ts` for the full argument.
 */
const ADHERENCE_SPEC = {
  followed: { c: color.green, Icon: Check },
  changed: { c: color.gold, Icon: Warn },
  not_planned: { c: color.muted, Icon: Info },
} as const;

function AdherenceList({ checks }: { checks: PlanAdherence['checks'] }) {
  return (
    <View style={{ gap: 12 }} testID="adherence-list">
      {checks.map((c) => {
        const spec = ADHERENCE_SPEC[c.status];
        const Icon = spec.Icon;
        return (
          <View
            key={c.key}
            testID={`adherence-${c.key}`}
            accessibilityLabel={`${c.label}. ${c.detail_plain}`}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}
          >
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, marginTop: 1,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 0.5, borderColor: alpha.ivory14,
              }}
            >
              <Icon size={14} color={spec.c} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T size={14} weight="semibold" c={c.status === 'not_planned' ? color.muted : color.text}>{c.label}</T>
              <T size={12.5} lh={18} c={color.muted}>{c.detail_plain}</T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function DebriefDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [adherence, setAdherence] = useState<PlanAdherence | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
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

  /**
   * The adherence block, asked for separately and allowed to fail quietly.
   * A debrief with no answer here draws no checklist — never an empty one and
   * never a guessed one; the process receipt below is still the whole of what
   * the screen knew before this pass.
   */
  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.debriefAdherence(String(id ?? ''))
      .then((a) => { if (alive) setAdherence(a); })
      .catch(() => { if (alive) setAdherence(null); });
    return () => { alive = false; };
  }, [id]);

  /**
   * THE CLOSED TRADE, DRAWN ONLY IF THE BARS ARE REAL.
   *
   * Daily bars for the trade's own window — its first recorded event through
   * its close. An empty answer stays empty and the screen keeps the sentence it
   * already had, because a plausible candle series under a real entry level is
   * a fabrication of price action, not a placeholder for one.
   */
  useEffect(() => {
    let alive = true;
    if (!api.available() || !debrief?.outcome.symbol || !adherence) return;
    const closed = debrief.outcome.closed_at ? new Date(debrief.outcome.closed_at) : new Date();
    const opened = debrief.timeline[0]?.at ? new Date(debrief.timeline[0].at) : null;
    if (Number.isNaN(closed.getTime())) return;
    // A little air either side of the trade, so the levels are not on the edge.
    const from = new Date((opened && !Number.isNaN(opened.getTime()) ? opened.getTime() : closed.getTime() - 30 * 86_400_000) - 7 * 86_400_000);
    const to = new Date(closed.getTime() + 7 * 86_400_000);
    api.candles(debrief.outcome.symbol, '1d', from.toISOString().slice(0, 10), to.toISOString().slice(0, 10))
      .then((c) => { if (alive) setCandles(c); })
      .catch(() => { if (alive) setCandles([]); });
    return () => { alive = false; };
  }, [debrief, adherence]);

  const practice = useMemo(() => practiceLink(adherence?.practice ?? null), [adherence]);

  /** ISO `t` → the kit's epoch-seconds `time`. A bar that will not parse is dropped. */
  const kitCandles = useMemo(
    () => candles
      .map((c) => ({ time: Date.parse(c.t) / 1000, open: c.o, high: c.h, low: c.l, close: c.c }))
      .filter((c) => Number.isFinite(c.time)),
    [candles],
  );

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
        {/*
          THE QUESTION THE BOARD ASKS FIRST: did you follow your own plan?
          It sits above the outcome because the outcome is downstream of it —
          and because the plan is the half a member actually controls.
        */}
        {adherence ? (
          <View style={{ gap: 16 }} testID="plan-adherence">
            <T size={26} weight="bold" lh={31} ls={-0.5} testID="adherence-headline">{adherence.headline}</T>

            {/* The closed trade, drawn only from bars that arrived. */}
            {kitCandles.length ? (
              <View testID="adherence-chart">
                <TradeMap
                  idea={{
                    id: debrief.id,
                    symbol: o.symbol,
                    company: o.symbol,
                    title: 'Closed trade',
                    summary: adherence.headline,
                    direction: o.direction,
                    entry: adherence.actual_levels.entry ?? adherence.planned_levels.entry,
                    stop: adherence.planned_levels.stop,
                    target: adherence.planned_levels.target,
                    status: 'closed',
                    candles: kitCandles,
                    dataLabel: o.closed_at ? `Daily bars \u00b7 closed ${new Date(o.closed_at).toLocaleDateString()}` : 'Daily bars',
                  }}
                  compact
                />
                {/* TradeMap draws entry, stop and target. The EXIT is not one of
                    its level kinds, so it is stated rather than drawn — the
                    checklist below carries the number. */}
                {adherence.actual_levels.exit !== null ? (
                  <T size={11} c={color.dim} style={{ marginTop: 6 }} testID="adherence-exit-note">
                    {`You came out at ${adherence.actual_levels.exit.toFixed(2)}. The chart marks the plan\u2019s levels, not your exit.`}
                  </T>
                ) : null}
              </View>
            ) : null}

            <AdherenceList checks={adherence.checks} />
          </View>
        ) : null}

        {/*
          THE RESULT. Still here, still honest about which way it went — but a
          row now rather than the whole first screen, because a debrief that
          leads with the number teaches members to judge a trade by its outcome.
        */}
        <View
          testID="debrief-outcome"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            // The rule separates the result from the review above it. With no
            // review there is nothing to separate it from.
            paddingTop: adherence ? 14 : 0,
            borderTopWidth: adherence ? 0.5 : 0,
            borderTopColor: alpha.ivory08,
          }}
        >
          <View
            style={{
              width: adherence ? 40 : 64, height: adherence ? 40 : 64, borderRadius: 32,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: flat ? alpha.ivory06 : win ? alpha.green12 : alpha.red12,
              borderWidth: 1, borderColor: flat ? alpha.ivory24 : win ? alpha.green40 : alpha.red40,
            }}
          >
            <Mark size={adherence ? 19 : 28} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Num size={adherence ? 24 : 34} weight="semibold" c={tone}>{o.pnl_label}</Num>
            <T size={13} c={color.muted} style={{ marginTop: 2 }}>
              {o.symbol} · {o.exit_reason}{o.held ? ` · ${o.held}` : ''}
            </T>
            {debrief.simulated ? (
              <T size={11} c={color.muted} style={{ marginTop: 6 }}>
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
          {/*
            The one instruction that follows from the leg that slipped. It is
            computed, not written — the same rule that produced the checklist
            produced this sentence — so it stands even on a morning Kai's own
            words did not come through.
          */}
          {adherence?.practice ? (
            <T size={13} lh={19} weight="semibold" c={color.violetLight} testID="adherence-practice-line">
              {adherence.practice.plain}
            </T>
          ) : null}
        </ObjectCard>

        {/*
          THE HAND-OFF (board 07). One volt button, and it exists ONLY when a
          leg of the plan genuinely changed — a member whose plan simply did not
          name a target is never sent to a lesson about missing it.
        */}
        {practice ? (
          <View style={{ gap: 6 }} testID="practice-handoff">
            <Button
              testID="practice-action"
              label={practice.label}
              height={48}
              arrow
              onPress={() => router.push(practice.route as never)}
            />
            {practice.note ? <T size={11} lh={16} c={color.muted}>{practice.note}</T> : null}
          </View>
        ) : null}

        {/* Save lesson really works; replay still waits for the chart surface. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            testID="save-lesson"
            label={saved ? 'Lesson saved' : saving ? 'Saving…' : 'Save lesson'}
            kind={practice ? 'outline' : 'volt'}
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
          <T size={11} c={color.muted} testID="replay-note">
            {kitCandles.length
              ? 'The chart above is the closed trade against its daily bars. Stepping through it bar by bar arrives with live market data.'
              : 'Chart replay arrives with live market data.'}
          </T>
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
