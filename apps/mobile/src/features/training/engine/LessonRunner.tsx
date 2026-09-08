import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { T } from '../../../ui/Text';
import { alpha, color } from '../../../ui/tokens';
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
 * It knows nothing about any particular lesson. Every string on screen came
 * out of the content file; every number the member sees was authored there
 * too. That is the whole point: Day 4 Lesson 2 is a new data file, not a new
 * component.
 *
 * ONE KAI CALL PER TAP. The `kai_check` screen's submit button is the only
 * thing in this runner that reaches the network, and it goes through the
 * existing `requestReview` path in `kai.ts` — the same call, the same honest
 * degradation, no second code path.
 */

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
  const { profile, completeLessonRun } = useTraining();
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [signals, setSignals] = useState<Record<string, CompetencySignal>>({});
  const [saved, setSaved] = useState<LessonRunResult | null>(null);
  const scroller = useRef<ScrollView | null>(null);
  const writing = useRef(false);

  const screens = content.screens;
  const screen: LessonScreen | undefined = screens[index];
  const day = dayById(node.dayId);

  const scorePct = answered > 0 ? Math.round((correct / answered) * 100) : null;

  /**
   * Every screen advances through here. A screen that measured something hands
   * back what it measured; a screen that only taught hands back nothing, and
   * nothing is exactly what gets counted for it.
   */
  const advance = useCallback((report?: ScreenReport) => {
    if (report?.scored) {
      setCorrect((c) => c + report.scored!.correct);
      setAnswered((a) => a + report.scored!.total);
    }
    if (report?.competencies) {
      setSignals((s) => ({ ...s, ...report.competencies }));
    }
    setIndex((i) => Math.min(i + 1, screens.length - 1));
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [screens.length]);

  /** The one network call in a lesson, fired only from the Kai check button. */
  const askKai = useCallback(async (
    answer: string,
    ctx: { symbol: string; timeframe: string; stage: string },
  ): Promise<KaiCheckOutcome> => {
    return requestReview(node, profile, {
      stage: ctx.stage,
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      learnerAnswer: answer,
      // No chart markup is captured in a written lesson, and saying "none"
      // is more useful to the tutor than describing one that never existed.
      chartMarkup: null,
    });
  }, [node, profile]);

  /**
   * Persist on arrival at the completion screen — once, guarded, and with the
   * numbers the run actually produced. Nothing is written before this point,
   * so a member who abandons a lesson half way has abandoned it, and the
   * profile says so.
   */
  const completion = screen?.type === 'completion' ? (screen as CompletionScreen) : null;
  const persistOnce = useCallback(async (c: CompletionScreen) => {
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
    };
    setSaved(result);
    await completeLessonRun(result);
  }, [saved, node, scorePct, signals, completeLessonRun]);

  React.useEffect(() => {
    if (completion) void persistOnce(completion);
  }, [completion, persistOnce]);

  const progressPct = useMemo(
    () => Math.round(((index + 1) / screens.length) * 100),
    [index, screens.length],
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
        {renderScreen({
          screen,
          advance,
          askKai,
          node,
          scorePct: saved?.scorePct ?? scorePct,
          masteryPct: profile.mastery[node.skill] ?? 0,
          onExit,
          onNextLesson,
        })}

        <View style={{ paddingTop: 18, alignItems: 'center' }}>
          <T size={10.5} c={color.dim}>
            {day ? `Day ${day.index} · ${node.title}` : node.title} · {index + 1} of {screens.length}
          </T>
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
}: {
  screen: LessonScreen;
  advance: (report?: ScreenReport) => void;
  askKai: (
    answer: string,
    ctx: { symbol: string; timeframe: string; stage: string },
  ) => Promise<KaiCheckOutcome>;
  node: TrainingLessonNode;
  scorePct: number | null;
  masteryPct: number;
  onExit: () => void;
  onNextLesson: (nextLessonId: string | null) => void;
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
