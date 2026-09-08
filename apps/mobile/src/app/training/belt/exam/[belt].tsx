import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ExamAppliedItem, ExamPaper, ExamSubmitResponse } from '@cheatcode/shared';
import { Screen } from '../../../../ui/Screen';
import { T, Eyebrow, Num } from '../../../../ui/Text';
import { Button } from '../../../../ui/Button';
import { ObjectCard } from '../../../../ui/Panel';
import { Check, Lock } from '../../../../ui/Icons';
import { RiskRewardRuler, TradeMap, type TradeIdea } from '../../../../ui/trade';
import { alpha, color, radius } from '../../../../ui/tokens';
import { startExam, submitExam, trainingApiAvailable } from '../../../../features/training/remote';

/**
 * THE BELT EXAM.
 *
 * ===========================================================================
 * WHY THIS SCREEN CANNOT CHEAT, AND IS NOT TRUSTED NOT TO
 * ===========================================================================
 * It never sees an answer. The paper arrives from `POST /belts/exams/:belt/start`
 * with every `correct_id` and `expected` stripped by `lib/training/exam.ts`, and
 * the verdict comes back from `grade_belt_exam`, a definer function that `anon`
 * and `authenticated` may not execute (0047 §11). There is nothing on this
 * device to read, patch or replay — which is the only way "passed a test" can
 * mean anything on a screen the member controls.
 *
 * ===========================================================================
 * THE APPLIED HALF IS THE POINT
 * ===========================================================================
 * BELT-MERGE-spec.md §12: "An easy exam is worse than no exam… If the first
 * version has to ship without [applied tasks], ship the eligibility screen and
 * no exam at all rather than an exam that grades nothing."
 *
 * So two of the items on every paper are set on a chart: put the stop where the
 * idea is wrong, place the breakout entry, size the position to the risk you
 * named, pick the sound plan out of two. They are drawn with `TradeMap` and
 * `RiskRewardRuler` from `ui/trade` — the same components the trade idea screens
 * use — and the chart REDRAWS as the member chooses, so they can see what a stop
 * at 99.00 does to the risk before they commit to it. That is the difference
 * between an applied task and a multiple-choice question about one.
 *
 * THE CHART IS SCHEMATIC AND SAYS SO. There is no real instrument behind it, no
 * dated feed, and no ticker — the same decision the canonical lesson's order
 * book makes ("an invented ticker rendered as a market object would be a small
 * lie"). `series_label` travels with the bars and is printed under them.
 */

type Phase = 'loading' | 'intro' | 'running' | 'submitting' | 'done' | 'unavailable';

export default function BeltExamScreen() {
  const router = useRouter();
  const { belt } = useLocalSearchParams<{ belt: string }>();
  const beltKey = String(belt ?? '');

  const [phase, setPhase] = useState<Phase>('loading');
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<ExamSubmitResponse | null>(null);

  const items = useMemo(
    () =>
      paper
        ? [
            ...paper.knowledge.map((k) => ({ kind: 'knowledge' as const, item: k })),
            ...paper.applied.map((a) => ({ kind: 'applied' as const, item: a })),
          ]
        : [],
    [paper]
  );

  const open = useCallback(async () => {
    if (!trainingApiAvailable()) {
      setPhase('unavailable');
      return;
    }
    try {
      const res = await startExam(beltKey);
      setPaper(res.paper);
      setAttemptId(res.attempt_id);
      setResumed(res.resumed);
      setPhase('intro');
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'I could not open that test.');
      setPhase('unavailable');
    }
  }, [beltKey]);

  useEffect(() => { void open(); }, [open]);

  const submit = useCallback(async () => {
    if (!attemptId) return;
    setPhase('submitting');
    try {
      setResult(await submitExam(beltKey, attemptId, answers));
      setPhase('done');
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'I could not mark that just now.');
      setPhase('running');
    }
  }, [answers, attemptId, beltKey]);

  const back = () => router.replace('/training/belt' as never);
  const current = items[index];
  const answeredAll = items.length > 0 && items.every((i) => answers[i.item.id] !== undefined && answers[i.item.id] !== '');

  return (
    <Screen variant="corner" testID="screen-belt-exam">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: alpha.ivory07,
        }}
      >
        <Pressable onPress={back} hitSlop={12}>
          <T size={22} c={color.muted}>‹</T>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Eyebrow c={color.muted}>BELT TEST</Eyebrow>
          <T size={13.5} weight="bold">{`${beltKey.charAt(0).toUpperCase()}${beltKey.slice(1)} Belt`}</T>
        </View>
        {phase === 'running' && items.length ? (
          <Num size={11} c={color.dim}>{`${index + 1} / ${items.length}`}</Num>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {phase === 'unavailable' ? (
          <ObjectCard r={radius.xl} style={{ padding: 16, gap: 10 }} testID="exam-unavailable">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Lock size={15} color={color.gold} />
              <T size={13} weight="bold">This test is not open</T>
            </View>
            <T size={12.5} lh={19} c={color.muted}>
              {refusal ?? 'The service could not be reached, so nothing has been started and no attempt has been used.'}
            </T>
            <Button label="Back to your belt" kind="outline" onPress={back} />
          </ObjectCard>
        ) : phase === 'loading' ? (
          <T size={12.5} c={color.muted}>Preparing your paper…</T>
        ) : phase === 'intro' && paper ? (
          <>
            <T size={26} weight="bold" ls={-0.5}>Before you start</T>
            <ObjectCard r={radius.xl} style={{ padding: 15, gap: 11 }}>
              <Row n="1" text={`${paper.knowledge.length} questions about what you have learned, and ${paper.applied.length} tasks on a chart.`} />
              <Row n="2" text={`The pass mark is ${paper.pass_pct}%, and EVERY chart task has to be right. The belt is a claim about what you can do on a chart, so that half is not optional.`} />
              <Row n="3" text="It is marked on the server. Nothing on this phone knows the answers, including this screen." />
              <Row n="4" text="Fail and you can sit it again in two days. Every attempt is kept, passed or failed." />
            </ObjectCard>
            {resumed ? (
              <T size={12} lh={18} c={color.volt} testID="exam-resumed">
                You had a paper open already, so this is the same one — reopening does not cost you
                an attempt and does not re-draw the chart tasks.
              </T>
            ) : null}
            <Button testID="exam-begin" label="Begin" arrow onPress={() => setPhase('running')} />
            <Button label="Not now" kind="outline" onPress={back} />
          </>
        ) : phase === 'running' && paper && current ? (
          <>
            {current.kind === 'knowledge' ? (
              <View style={{ gap: 12 }} testID={`exam-item-${current.item.id}`}>
                <Eyebrow c={color.muted}>{`QUESTION ${index + 1}`}</Eyebrow>
                <T size={19} weight="bold" lh={26}>{current.item.prompt}</T>
                {current.item.options.map((o) => (
                  <Choice
                    key={o.id}
                    label={o.label}
                    selected={answers[current.item.id] === o.id}
                    onPress={() => setAnswers((a) => ({ ...a, [current.item.id]: o.id }))}
                  />
                ))}
              </View>
            ) : (
              <AppliedTask
                task={current.item as ExamAppliedItem}
                series={paper.series}
                seriesLabel={paper.series_label}
                value={answers[current.item.id] ?? ''}
                onChange={(v) => setAnswers((a) => ({ ...a, [current.item.id]: v }))}
              />
            )}

            {refusal ? <T size={12} c={color.gold}>{refusal}</T> : null}

            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
              {index > 0 ? (
                <View style={{ flex: 1 }}>
                  <Button label="Back" kind="outline" onPress={() => setIndex((i) => i - 1)} />
                </View>
              ) : null}
              <View style={{ flex: 2 }}>
                {index < items.length - 1 ? (
                  <Button
                    testID="exam-next"
                    label="Next"
                    arrow
                    disabled={!answers[current.item.id]}
                    onPress={() => setIndex((i) => i + 1)}
                  />
                ) : (
                  <Button
                    testID="exam-submit"
                    label={answeredAll ? 'Submit for marking' : 'Answer every item to submit'}
                    disabled={!answeredAll}
                    onPress={() => void submit()}
                  />
                )}
              </View>
            </View>
          </>
        ) : phase === 'submitting' ? (
          <T size={12.5} c={color.muted}>Marking…</T>
        ) : phase === 'done' && result ? (
          <>
            <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
              <View
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 54,
                  borderWidth: 2,
                  borderColor: result.passed ? color.green : alpha.ivory20,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Num size={28} weight="bold" c={result.passed ? color.green : color.text} testID="exam-score">
                  {`${Math.round(result.score_pct)}%`}
                </Num>
              </View>
              <T size={22} weight="bold" testID="exam-verdict">
                {result.passed ? 'Passed' : 'Not this time'}
              </T>
              <T size={13} lh={20} c={color.muted} align="center">{result.plain}</T>
              <T size={11.5} c={color.dim}>
                {`Chart tasks: ${result.applied_correct} of ${result.applied_total} · pass mark ${Math.round(result.pass_pct)}%`}
              </T>
            </View>

            <View style={{ gap: 9 }}>
              <Eyebrow c={color.muted}>WHY EACH ONE WAS RIGHT</Eyebrow>
              <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
                {result.review.map((r, i) => (
                  <View
                    key={r.id}
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      paddingVertical: 12,
                      borderBottomWidth: i === result.review.length - 1 ? 0 : 0.5,
                      borderBottomColor: alpha.ivory08,
                    }}
                  >
                    <View style={{ paddingTop: 2 }}>
                      {r.correct ? (
                        <Check size={13} color={color.green} />
                      ) : (
                        <T size={13} c={color.red}>✕</T>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <T size={10.5} c={color.dim} ls={0.6}>
                        {r.kind === 'applied' ? 'CHART TASK' : 'QUESTION'}
                      </T>
                      <T size={12.5} lh={19} c={color.muted}>{r.because}</T>
                    </View>
                  </View>
                ))}
              </ObjectCard>
            </View>

            <Button label="Back to your belt" arrow onPress={back} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({ n, text }: { n: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Num size={12} weight="bold" c={color.volt} style={{ width: 14 }}>{n}</Num>
      <T size={12.5} lh={19} c={color.muted} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        padding: 13,
        borderRadius: radius.lg,
        borderWidth: selected ? 1 : 0.5,
        borderColor: selected ? color.volt : alpha.ivory16,
        backgroundColor: selected ? alpha.volt08 : 'transparent',
        gap: 4,
      }}
    >
      <T size={13.5} lh={20} c={selected ? color.text : color.muted}>{label}</T>
      {detail ? <T size={11.5} c={color.dim}>{detail}</T> : null}
    </Pressable>
  );
}

/**
 * AN APPLIED TASK, ON THE CHART.
 *
 * The map redraws with whatever the member has chosen, and the risk/reward
 * ruler under it moves with it — so a stop placed far below the structure
 * SHOWS as a tiny reward bar against a huge risk one, before anything is
 * submitted. The chart is doing the teaching that a list of four prices cannot.
 */
function AppliedTask({
  task,
  series,
  seriesLabel,
  value,
  onChange,
}: {
  task: ExamAppliedItem;
  series: { t: number; o: number; h: number; l: number; c: number }[];
  seriesLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const candles = useMemo(
    () => series.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })),
    [series]
  );

  const chosen = task.options.find((o) => o.id === value) ?? null;

  const idea: TradeIdea = useMemo(() => {
    // The member's choice is drawn as the level it would be. For a plan choice
    // the option carries no single value, so the whole plan is read out of the
    // option's label — the levels are in it, and parsing them here would be
    // inventing numbers, so a plan choice draws the task's own levels instead.
    const level = task.level;
    const pick = chosen?.value ?? null;
    return {
      id: task.id,
      // No ticker. There is no real instrument behind these bars, and rendering
      // an invented one as a market object would be a small lie.
      symbol: 'EXAMPLE',
      company: 'Teaching example',
      title: 'Exam chart',
      summary: seriesLabel,
      direction: task.direction ?? 'long',
      entry: level === 'entry' && pick !== null ? pick : task.entry,
      stop: level === 'stop' && pick !== null ? pick : task.stop,
      target: level === 'target' && pick !== null ? pick : task.target,
      status: 'watching',
      candles,
      dataLabel: seriesLabel,
    };
  }, [candles, chosen, seriesLabel, task]);

  return (
    <View style={{ gap: 12 }} testID={`exam-item-${task.id}`}>
      <Eyebrow c={color.volt}>CHART TASK</Eyebrow>
      <T size={17} weight="bold" lh={24}>{task.prompt}</T>

      {task.kind === 'position_size' ? (
        <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }}>
          <Fact label="Account" value={`${task.balance ?? 0}`} />
          <Fact label="Risk per trade" value={`${task.risk_pct ?? 0}%`} />
          <Fact label="Entry" value={`${task.entry ?? 0}`} />
          <Fact label="Stop" value={`${task.stop ?? 0}`} />
          <T size={11.5} c={color.dim}>
            Whole shares. If the maths lands between two numbers, the one that risks LESS than you
            said is the answer.
          </T>
          <TextInput
            testID="exam-size-input"
            value={value}
            onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="Shares"
            placeholderTextColor={color.dim}
            style={{
              borderWidth: 0.5,
              borderColor: alpha.ivory20,
              borderRadius: radius.lg,
              paddingHorizontal: 13,
              paddingVertical: 12,
              color: color.text,
              fontSize: 16,
            }}
          />
        </ObjectCard>
      ) : (
        <>
          <TradeMap idea={idea} />
          <RiskRewardRuler idea={idea} />
          <T size={10.5} c={color.dim}>{seriesLabel}</T>
          {task.options.map((o) => (
            <Choice
              key={o.id}
              label={o.label}
              detail={o.detail}
              selected={value === o.id}
              onPress={() => onChange(o.id)}
            />
          ))}
          <T size={11} lh={16} c={color.dim}>
            The chart above redraws with whatever you pick, so you can see what each one does to the
            risk before you commit to it.
          </T>
        </>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <T size={12} c={color.muted} style={{ flex: 1 }}>{label}</T>
      <Num size={13} weight="bold">{value}</Num>
    </View>
  );
}
