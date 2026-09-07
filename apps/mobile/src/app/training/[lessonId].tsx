import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import { allLessons, lessonById, lessonIndex, nextLesson } from '../../features/training/curriculum';
import { TrainingChart } from '../../features/training/TrainingChart';
import { KaiFeedbackCard, TrainingProgress } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';
import { requestReview, type TrainingKaiResult } from '../../features/training/kai';

type Stage = 'overview' | 'question' | 'correct' | 'video' | 'practice' | 'kai' | 'done';

export default function TrainingLesson() {
  const router = useRouter();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const lesson = lessonById(String(lessonId));
  const { profile, completeLesson, setCurrentLesson } = useTraining();
  const [stage, setStage] = useState<Stage>(lesson?.kind === 'video' ? 'video' : 'overview');
  const [answer, setAnswer] = useState<string | null>(null);
  const [review, setReview] = useState<TrainingKaiResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const lessons = useMemo(() => allLessons(), []);

  if (!lesson) return null;
  const idx = lessonIndex(lesson.id);
  const progress = Math.round(((idx + 1) / lessons.length) * 100);

  const finish = async () => {
    await completeLesson(lesson.id, lesson.skill, 12);
    setStage('done');
  };

  /**
   * The ONE Kai call in a lesson, and it fires only from this tap. It moves to
   * the feedback stage first so the learner sees the surface come up while the
   * stream runs, then replaces the pending state with whatever Kai actually
   * said. If Kai cannot answer — no API, no network, or the Anthropic account
   * out of credit — the card says so in Kai's own words and the Complete
   * Lesson button below it stays live. Being unable to get feedback must never
   * be the thing that blocks a learner from finishing.
   */
  const submitForReview = async () => {
    if (reviewing) return;
    setStage('kai');
    setReviewing(true);
    setReview(null);
    try {
      const result = await requestReview(lesson, profile, {
        stage: 'practice',
        symbol: 'TSLA',
        timeframe: '1D',
        learnerAnswer: answer,
        // The generated SVG chart has no gesture capture yet — real drawing
        // capture is on the README's production list — so we say there was no
        // markup rather than describing one the learner never made.
        chartMarkup: null,
      });
      setReview(result);
    } finally {
      setReviewing(false);
    }
  };

  const goNext = async () => {
    const next = nextLesson(lesson.id);
    if (!next) return router.replace('/training/progress' as never);
    await setCurrentLesson(next.id);
    router.replace(`/training/${next.id}` as never);
  };

  return (
    <Screen variant="corner">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16,
        paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: alpha.ivory07,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><T size={22} c={color.muted}>‹</T></Pressable>
        <View style={{ flex: 1 }}>
          <T size={10} weight="bold" c={color.volt}>LESSON {idx + 1} OF {lessons.length}</T>
          <T size={13.5} weight="bold" numberOfLines={1}>{lesson.title}</T>
        </View>
        <T size={11} c={color.muted}>{idx + 1}/{lessons.length}</T>
      </View>
      <TrainingProgress value={progress} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }} showsVerticalScrollIndicator={false}>
        {stage === 'overview' ? (
          <>
            <T size={27} weight="bold" lh={32}>{lesson.title}</T>
            <T size={13} lh={20} c={color.muted}>{lesson.subtitle}</T>
            <Image
              source={lesson.image}
              style={{ width: '100%', height: 220, borderRadius: radius.xl, backgroundColor: color.surface3 }}
              contentFit="cover"
            />
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 9 }}>
              <T size={12} weight="bold">In this lesson you'll learn:</T>
              <T size={12} lh={19} c={color.muted}>↗ Higher highs vs lower highs</T>
              <T size={12} lh={19} c={color.muted}>↗ How to identify trend direction</T>
              <T size={12} lh={19} c={color.muted}>↗ Why structure matters before entry</T>
              <T size={12} lh={19} c={color.muted}>↗ How Kai checks your reasoning</T>
            </ObjectCard>
            <Button label="Start Lesson" arrow onPress={() => setStage('question')} />
          </>
        ) : null}

        {stage === 'question' ? (
          <>
            <T size={10} weight="bold" c={color.volt}>INTERACTIVE LESSON</T>
            <T size={23} weight="bold">Identify the Trend</T>
            <T size={12.5} lh={19} c={color.muted}>Look at the chart below. What is the current trend?</T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={12} weight="bold">AAPL</T><T size={11} c={color.muted}>4H</T>
            </View>
            <TrainingChart />
            {['Uptrend', 'Downtrend', 'Sideways', "I'm not sure"].map((option) => {
              const on = answer === option;
              return (
                <Pressable key={option} onPress={() => setAnswer(option)} style={{
                  minHeight: 48, borderRadius: radius.xl, paddingHorizontal: 14, justifyContent: 'center',
                  borderWidth: on ? 1 : 0.5, borderColor: on ? color.volt : alpha.ivory20,
                  backgroundColor: on ? alpha.volt08 : color.surface3,
                }}>
                  <T size={13.5} weight={on ? 'bold' : 'regular'} c={on ? color.volt : color.text}>{option}</T>
                </Pressable>
              );
            })}
            <Button
              label="Check Answer"
              disabled={!answer}
              onPress={() => setStage(answer === 'Uptrend' ? 'correct' : 'question')}
            />
            {answer && answer !== 'Uptrend' ? <T size={11.5} c={color.red}>Not quite. Follow the swing highs and lows.</T> : null}
          </>
        ) : null}

        {stage === 'correct' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: color.volt, alignItems: 'center', justifyContent: 'center' }}>
                <T size={17} c={color.volt}>✓</T>
              </View>
              <View><T size={24} weight="bold">Correct</T><T size={12} c={color.volt}>This is an uptrend.</T></View>
            </View>
            <T size={13} lh={20} c={color.muted}>
              Price is making higher highs and higher lows. This indicates bullish control and an uptrend.
            </T>
            <TrainingChart annotated />
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 8 }}>
              <T size={12} weight="bold">💡 Key Takeaway</T>
              <T size={12.5} lh={19} c={color.muted}>An uptrend is formed by a series of higher highs and higher lows.</T>
            </ObjectCard>
            <Button label="Next: Human Breakdown" arrow onPress={() => setStage('video')} />
          </>
        ) : null}

        {stage === 'video' ? (
          <>
            <T size={10} weight="bold" c={color.violetLight}>VIDEO LESSON</T>
            <T size={23} weight="bold">How I Read Market Structure</T>
            <T size={12.5} c={color.muted}>With Kway · 6:42</T>
            <View style={{ overflow: 'hidden', borderRadius: radius.xl, backgroundColor: color.surface3 }}>
              <Image source={require('../../../assets/training/instructor_black_female.png')} style={{ width: '100%', height: 220 }} contentFit="cover" />
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(11,11,14,.72)', borderWidth: 1, borderColor: alpha.ivory20, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={22}>▶</T>
                </View>
              </View>
            </View>
            <T size={13} lh={20}>“If you can read structure, you can trade anything.”</T>
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 8 }}>
              <T size={12} weight="bold">Key Points</T>
              <T size={11.5} c={color.muted}>00:32 · What is market structure?</T>
              <T size={11.5} c={color.muted}>01:45 · Higher highs vs lower lows</T>
              <T size={11.5} c={color.muted}>03:20 · Real trade examples</T>
              <T size={11.5} c={color.muted}>05:10 · Common beginner mistakes</T>
            </ObjectCard>
            <Button label="Practice It With Kai" arrow onPress={() => setStage('practice')} />
          </>
        ) : null}

        {stage === 'practice' ? (
          <>
            <T size={10} weight="bold" c={color.violetLight}>KAI PRACTICE</T>
            <T size={24} weight="bold">Your Turn</T>
            <T size={12.5} lh={19} c={color.muted}>Apply what you've learned. Kai will review your analysis and give feedback.</T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={12} weight="bold">TSLA</T><T size={11} c={color.muted}>1D</T>
            </View>
            <TrainingChart practice />
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 8 }}>
              <T size={12.5} weight="bold">Draw the trendline that best represents the current trend.</T>
              <T size={11.5} c={color.muted}>Prototype: the chart interaction engine should capture user drawings and send them to Kai.</T>
            </ObjectCard>
            <Button
              testID="training-submit-review"
              label="Submit for Review"
              onPress={() => { void submitForReview(); }}
            />
          </>
        ) : null}

        {stage === 'kai' ? (
          <>
            {/* The package shipped this card with Kai's praise written into
                it — three ticks and a tip, identical for every learner and
                every answer. That is the one thing a tutoring surface must
                never do, so the card now holds only what Kai actually said,
                and admits it when Kai said nothing. */}
            <KaiFeedbackCard>
              {reviewing ? (
                <T size={13} lh={20} c={color.muted} testID="training-kai-pending">Reading your chart…</T>
              ) : review?.status === 'ok' ? (
                <T size={13} lh={20} testID="training-kai-reply">{review.text}</T>
              ) : (
                <T size={13} lh={20} c={color.muted} testID="training-kai-unavailable">
                  {review?.text ?? 'Kai has not reviewed this yet.'}
                </T>
              )}
            </KaiFeedbackCard>
            <TrainingChart annotated />
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 8 }}>
              <T size={12.5} weight="bold">Key Takeaway</T>
              <T size={12.5} lh={19} c={color.muted}>
                An uptrend is a series of higher highs and higher lows. A trendline is only
                worth drawing where price has actually turned.
              </T>
            </ObjectCard>
            <Button
              testID="training-complete-lesson"
              label="Complete Lesson"
              disabled={reviewing}
              onPress={finish}
            />
          </>
        ) : null}

        {stage === 'done' ? (
          <>
            <View style={{ alignItems: 'center', paddingTop: 22, gap: 12 }}>
              <View style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 2, borderColor: color.volt, backgroundColor: alpha.volt10, alignItems: 'center', justifyContent: 'center' }}>
                <T size={44} c={color.volt}>★</T>
              </View>
              <T size={10} weight="bold" c={color.volt}>LESSON COMPLETE</T>
              <T size={28} weight="bold">Market Structure +12%</T>
              <T size={13} c={color.muted} align="center">Kai now has more evidence about what you can do without assistance.</T>
            </View>
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
              <T size={12} weight="bold">Your Progress</T>
              <TrainingProgress value={profile.mastery.market_structure} />
              <T size={11.5} c={color.muted}>Market Structure mastery: {profile.mastery.market_structure}%</T>
            </ObjectCard>
            <Button label="Continue Learning" arrow onPress={goNext} />
            <Button label="View Progress" kind="outline" onPress={() => router.replace('/training/progress' as never)} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
