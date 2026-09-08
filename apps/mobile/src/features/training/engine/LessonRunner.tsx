import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { T } from '../../../ui/Text';
import { alpha, color, radius } from '../../../ui/tokens';
import { useTraining } from '../store';
import { requestReview } from '../kai';
import { dayById } from '../curriculum';
import type {
  CompetencySignal,
  CompletionScreen,
  LessonContent,
  LessonRunResult,
  LessonScreen,
  TrainingLessonNode,
} from '../types';
import { SKILL_LABEL } from '../labels';
import { ledgerForScreens } from '../xp';
import {
  AuctionView,
  CompletionView,
  ConceptView,
  KaiCheckView,
  MarketApplicationView,
  MasteryChallengeView,
  OpeningView,
  QuizView,
  SortingView,
  UnbuiltScreenView,
  VideoView,
  type KaiCheckOutcome,
  type ScreenReport,
} from './screens';

/**
 * THE LESSON RUNNER.
 * ===========================================================================
 *
 * Walks a `LessonContent`'s screens in order, keeps the running score and the
 * competency signals each screen reports, and persists the result exactly once
 * — when the member reaches the `completion` screen.
 *
 * It knows nothing about any particular lesson. Every string on screen came out
 * of the content file; every number the member sees was authored there too.
 * Day 4 Lesson 2 is a new data file, not a new component.
 *
 * ---------------------------------------------------------------------------
 * LEAVING IS NOT LOSING (audit F11)
 * ---------------------------------------------------------------------------
 * The one authored lesson is FOURTEEN screens. Until this existed, leaving half
 * way through restarted it from screen one with every answer gone — and the
 * screens most likely to make somebody put the phone down are the ones in the
 * middle, so the product was punishing exactly the interruption it should
 * expect. Three changes fix it:
 *
 *   • A CHECKPOINT ON EVERY INTERACTION. Where they are, what they have
 *     answered, the running score, and whether the assessment has been cleared.
 *     Written through the store, which keeps it on the device and sends it to
 *     the account (0046 `training_checkpoints`).
 *   • RESUME. Reopening a lesson lands on the screen they left, with the score
 *     they had, and says so — with "Start over" beside it, because a member who
 *     wanted a clean run should not have to finish a stale one first.
 *   • BACK. Every screen after the first can be stepped back through, so a
 *     concept can be re-read without abandoning the run.
 *
 * NOTHING IS DOUBLE-COUNTED WHEN YOU GO BACK. A screen that has already
 * reported its answer is recorded by ID in `answers`, and a second report from
 * the same screen is not scored again. Without that, Back-then-forward is a
 * scoring exploit and the day gates read a number nobody earned.
 *
 * ONE KAI CALL PER TAP. The `kai_check` screen's submit button is the only
 * thing here that reaches the network for teaching, and it goes through the
 * existing `requestReview` path in `kai.ts`.
 */

type AnswerRecord = { correct: number; total: number };

export function LessonRunner({
  node,
  content,
  onExit,
  onNextLesson,
}: {
  node: TrainingLessonNode;
  content: LessonContent;
  /** "Back to Day N" — the secondary action on the completion screen. */
  onExit: () => void;
  /** Where the member goes when the lesson is finished. */
  onNextLesson: (nextLessonId: string | null) => void;
}) {
  const { profile, completeLessonRun, checkpointFor, saveCheckpoint, storage } = useTraining();

  const screens = content.screens;

  /**
   * THE RESUME POINT IS READ ONCE, AT MOUNT.
   *
   * Deliberately not a live subscription: the checkpoint is written FROM here,
   * so re-reading it as it changes would drag the member back to where they
   * already are. A ref, taken on the first render, is the whole mechanism.
   */
  const resumeFrom = useRef(checkpointFor(node.id));
  const initial = resumeFrom.current;
  const startIndex =
    initial && initial.screenIndex > 0 && initial.screenIndex < screens.length
      ? initial.screenIndex
      : 0;

  const [index, setIndex] = useState(startIndex);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>(
    (initial?.answers as Record<string, AnswerRecord> | undefined) ?? {}
  );
  const [correct, setCorrect] = useState(initial?.correct ?? 0);
  const [answered, setAnswered] = useState(initial?.answered ?? 0);
  const [signals, setSignals] = useState<Record<string, CompetencySignal>>({});
  /**
   * Whether this run cleared its assessment. Only an assessment screen
   * reporting its own verdict can set it — so a member who never reached the
   * measurement, or reached it and missed the pass mark, finishes with no
   * assessment XP and an unopened day gate. It survives a resume, because
   * having passed the challenge on Monday is still true on Tuesday.
   */
  const [assessmentPassed, setAssessmentPassed] = useState(initial?.assessmentPassed ?? false);
  const [saved, setSaved] = useState<LessonRunResult | null>(null);
  const [outcome, setOutcome] = useState<{ saved: boolean; xpAwarded: number; repeat: boolean } | null>(null);
  const [resumed, setResumed] = useState(startIndex > 0);
  const scroller = useRef<ScrollView | null>(null);
  const writing = useRef(false);

  const screen: LessonScreen | undefined = screens[index];
  const day = dayById(node.dayId);

  const scorePct = answered > 0 ? Math.round((correct / answered) * 100) : null;

  /** One checkpoint write, from the one place that knows the whole run. */
  const checkpoint = useCallback(
    (next: {
      index: number;
      answers: Record<string, AnswerRecord>;
      correct: number;
      answered: number;
      assessmentPassed: boolean;
    }) => {
      // The completion screen is not a place to resume to — the run is over and
      // `completeLessonRun` clears the checkpoint anyway.
      if (screens[next.index]?.type === 'completion') return;
      saveCheckpoint(node.id, {
        screenIndex: next.index,
        answers: next.answers,
        correct: next.correct,
        answered: next.answered,
        assessmentPassed: next.assessmentPassed,
        updatedAt: new Date().toISOString(),
      });
    },
    [node.id, saveCheckpoint, screens]
  );

  /**
   * Every screen advances through here. A screen that measured something hands
   * back what it measured; a screen that only taught hands back nothing, and
   * nothing is exactly what gets counted for it.
   */
  const advance = useCallback(
    (report?: ScreenReport) => {
      const id = screen?.id ?? String(index);
      let nextAnswers = answers;
      let nextCorrect = correct;
      let nextAnswered = answered;

      // Already scored on an earlier pass: stepping back and forward again is
      // review, not a second attempt.
      if (report?.scored && !answers[id]) {
        nextCorrect = correct + report.scored.correct;
        nextAnswered = answered + report.scored.total;
        nextAnswers = { ...answers, [id]: { correct: report.scored.correct, total: report.scored.total } };
        setCorrect(nextCorrect);
        setAnswered(nextAnswered);
        setAnswers(nextAnswers);
      }
      if (report?.competencies) {
        setSignals((s) => ({ ...s, ...report.competencies }));
      }
      const nextPassed = report?.assessment?.passed ? true : assessmentPassed;
      if (report?.assessment?.passed) setAssessmentPassed(true);

      const nextIndex = Math.min(index + 1, screens.length - 1);
      setIndex(nextIndex);
      setResumed(false);
      checkpoint({
        index: nextIndex,
        answers: nextAnswers,
        correct: nextCorrect,
        answered: nextAnswered,
        assessmentPassed: nextPassed,
      });
      scroller.current?.scrollTo({ y: 0, animated: false });
    },
    [answers, assessmentPassed, checkpoint, correct, answered, index, screen, screens.length]
  );

  /** Step back one screen. Nothing is unscored; the record of what was answered stands. */
  const goBack = useCallback(() => {
    if (index === 0) return;
    const nextIndex = index - 1;
    setIndex(nextIndex);
    setResumed(false);
    checkpoint({ index: nextIndex, answers, correct, answered, assessmentPassed });
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [answers, assessmentPassed, checkpoint, correct, answered, index]);

  /** A clean run, asked for out loud. The old checkpoint is overwritten at zero. */
  const startOver = useCallback(() => {
    setIndex(0);
    setAnswers({});
    setCorrect(0);
    setAnswered(0);
    setSignals({});
    setAssessmentPassed(false);
    setResumed(false);
    checkpoint({ index: 0, answers: {}, correct: 0, answered: 0, assessmentPassed: false });
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [checkpoint]);

  /** The one network call in a lesson, fired only from the Kai check button. */
  const askKai = useCallback(
    async (
      answer: string,
      ctx: { symbol: string; timeframe: string; stage: string }
    ): Promise<KaiCheckOutcome> => {
      return requestReview(node, profile, {
        stage: ctx.stage,
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        learnerAnswer: answer,
        // No chart markup is captured in a written lesson, and saying "none" is
        // more useful to the tutor than describing one that never existed.
        chartMarkup: null,
      });
    },
    [node, profile]
  );

  /**
   * Persist on arrival at the completion screen — once, guarded, and with the
   * numbers the run actually produced. Nothing is written before this point, so
   * a member who abandons a lesson half way has abandoned it; what they have
   * instead is a checkpoint, which is a different claim.
   */
  const completion = screen?.type === 'completion' ? (screen as CompletionScreen) : null;
  const persistOnce = useCallback(
    async (c: CompletionScreen) => {
      // The ref, not the state, is the guard: `saved` does not commit until the
      // next render, and a second effect pass before then would write twice.
      if (writing.current || saved) return;
      writing.current = true;
      const result: LessonRunResult = {
        lessonId: node.id,
        dayId: node.dayId,
        skill: node.skill,
        scorePct,
        masteryGain: c.masteryGain,
        competencies: signals,
        // Reaching the completion screen means every screen before it was
        // walked, so the lesson's own screen list is the honest record of what
        // was done. What it cannot tell us is whether the assessment was
        // PASSED, which is why that arrives separately and gates the award.
        xp: ledgerForScreens(screens.map((s) => s.type), assessmentPassed),
        assessmentPassed,
      };
      setSaved(result);
      setOutcome(await completeLessonRun(result));
    },
    [saved, node, scorePct, signals, completeLessonRun, screens, assessmentPassed]
  );

  useEffect(() => {
    if (completion) void persistOnce(completion);
  }, [completion, persistOnce]);

  const progressPct = useMemo(
    () => Math.round(((index + 1) / screens.length) * 100),
    [index, screens.length]
  );

  if (!screen) return null;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 4, backgroundColor: alpha.ivory08 }}>
        <View
          testID="training-lesson-progress"
          style={{ height: '100%', width: `${progressPct}%`, backgroundColor: color.volt }}
        />
      </View>

      <ScrollView
        ref={(r) => { scroller.current = r; }}
        contentContainerStyle={{ padding: 16, paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {resumed ? (
          <View
            testID="training-lesson-resumed"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 11,
              marginBottom: 12,
              borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: alpha.volt40,
              backgroundColor: alpha.volt08,
            }}
          >
            <View style={{ flex: 1 }}>
              <T size={12} weight="bold" c={color.volt}>Picked up where you left off</T>
              <T size={11} lh={16} c={color.muted}>
                {`Screen ${index + 1} of ${screens.length}. Your answers so far are still counted.`}
              </T>
            </View>
            <Pressable testID="training-lesson-start-over" onPress={startOver} hitSlop={8}>
              <T size={11.5} weight="bold" c={color.muted}>Start over</T>
            </Pressable>
          </View>
        ) : null}

        {renderScreen({
          screen,
          advance,
          askKai,
          node,
          scorePct: saved?.scorePct ?? scorePct,
          masteryPct: profile.mastery[node.skill] ?? 0,
          onExit,
          onNextLesson,
          savedOutcome: outcome,
          storage,
        })}

        <View style={{ paddingTop: 18, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 92, alignItems: 'flex-start' }}>
            {index > 0 && screen.type !== 'completion' ? (
              <Pressable testID="training-lesson-back" onPress={goBack} hitSlop={10}>
                <T size={11.5} c={color.muted}>‹ Back</T>
              </Pressable>
            ) : null}
          </View>
          <T size={10.5} align="center" c={color.dim} style={{ flex: 1 }}>
            {day ? `Day ${day.index} · ${node.title}` : node.title} · {index + 1} of {screens.length}
          </T>
          <View style={{ width: 92 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function renderScreen({
  screen,
  advance,
  askKai,
  node,
  scorePct,
  masteryPct,
  onExit,
  onNextLesson,
  savedOutcome,
  storage,
}: {
  screen: LessonScreen;
  advance: (report?: ScreenReport) => void;
  askKai: (
    answer: string,
    ctx: { symbol: string; timeframe: string; stage: string }
  ) => Promise<KaiCheckOutcome>;
  node: TrainingLessonNode;
  scorePct: number | null;
  masteryPct: number;
  onExit: () => void;
  onNextLesson: (nextLessonId: string | null) => void;
  savedOutcome: { saved: boolean; xpAwarded: number; repeat: boolean } | null;
  storage: 'account' | 'device' | 'guest';
}) {
  switch (screen.type) {
    case 'opening':
      return <OpeningView screen={screen} onAdvance={advance} />;
    case 'concept':
      return <ConceptView screen={screen} onAdvance={advance} />;
    case 'quiz':
      return <QuizView screen={screen} onAdvance={advance} />;
    case 'video':
      return <VideoView screen={screen} onAdvance={advance} />;
    case 'auction':
      return <AuctionView screen={screen} onAdvance={advance} />;
    case 'sorting':
      return <SortingView screen={screen} onAdvance={advance} />;
    case 'kai_check':
      return (
        <KaiCheckView
          screen={screen}
          onAdvance={advance}
          onSubmit={(answer) =>
            askKai(answer, {
              symbol: screen.symbol,
              timeframe: screen.timeframe,
              stage: screen.stage,
            })
          }
        />
      );
    case 'market_application':
      return <MarketApplicationView screen={screen} onAdvance={advance} />;
    case 'mastery_challenge':
      return <MasteryChallengeView screen={screen} onAdvance={advance} />;
    case 'completion':
      return (
        <CompletionView
          screen={screen}
          scorePct={scorePct}
          masteryPct={masteryPct}
          skillLabel={SKILL_LABEL[node.skill]}
          onFinish={() => onNextLesson(screen.nextLessonId)}
          onSecondary={onExit}
          outcome={savedOutcome}
          storage={storage}
        />
      );
    // Typed, authorable, not yet renderable. Unreachable for Day 1 Lesson 1.
    case 'trade_builder':
    case 'setup_triage':
    case 'paper_sim':
    case 'journal':
    case 'final_exam':
      return <UnbuiltScreenView type={screen.type} onSkip={() => advance()} />;
  }
}
