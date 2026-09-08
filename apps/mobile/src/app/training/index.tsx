import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow, Num } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check, ChevronRight, Gear, Lock } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { TRAINING_DAYS, lessonsForDay } from '../../features/training/curriculum';
import {
  dayCompletedLessonIds,
  dayState,
  isLessonUnlocked,
} from '../../features/training/gates';
import {
  PATH_STEPS,
  currentStep,
  nextWrittenLesson,
  stepState,
  writtenProgress,
} from '../../features/training/path';
import { LESSON_KIND_LABEL } from '../../features/training/labels';
import { DayNode, LessonNodeRow, TrainingProgress } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';

/**
 * TRAINING — THE THREE-STEP PATH (Board 08, left screen).
 *
 * ===========================================================================
 * WHY THE HERO IS GONE
 * ===========================================================================
 * This screen used to open on "Zero to Trade Ready in 7 Days" over a seven-day
 * path. ONE LESSON OF THIRTY-ONE IS WRITTEN. That is the audit's F09 exactly:
 * the screen promised five and a half hours and could deliver nine minutes of
 * it, and every day node under the hero led to a screen apologising for itself.
 *
 * Board 08 makes a smaller promise instead, and the smaller promise is the
 * honest one:
 *
 *     LEARN WITH KAI · Your next skill · Start with the essentials
 *     [ the lesson that exists, with Start lesson on it ]
 *     YOUR PATH   01 Market basics   02 Read a chart   03 Build a plan
 *                                       Coming next       Coming next
 *     Foundations in development · More lessons coming soon
 *
 * The owner's instruction for this round was "leave the lessons empty for now",
 * so the screen's job is to be truthful about that rather than to dress it up.
 *
 * ===========================================================================
 * WHAT IS KEPT
 * ===========================================================================
 * The seven days are still the curriculum and the gates still gate on them —
 * they are one tap down, under "The full seven-day programme", where a member
 * who wants the plan can read it and nobody is asked to believe it up front.
 * The volt progress bar, the ObjectCard surfaces and the DayNode rows are the
 * approved design and are untouched; this is a reorganisation of what the page
 * LEADS with, not a redesign of the page.
 */
export default function TrainingHome() {
  const router = useRouter();
  const { profile, ready, storage, unclaimed, claimUnclaimed, dismissUnclaimed } = useTraining();

  const [showProgramme, setShowProgramme] = useState(false);
  const [openDayId, setOpenDayId] = useState<string>('day-1');
  const [claiming, setClaiming] = useState(false);

  const step = currentStep(profile);
  const next = nextWrittenLesson(profile);
  const written = writtenProgress(profile);
  const pct = written.total === 0 ? 0 : Math.round((written.done / written.total) * 100);
  const started = profile.completedLessonIds.length > 0;

  const openLesson = (lessonId: string) => router.push(`/training/${lessonId}` as never);

  return (
    <Screen variant="corner" testID="screen-training">
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <T size={22} c={color.muted}>‹</T>
        </Pressable>
        <T size={16} weight="bold" align="center" style={{ flex: 1 }}>Training</T>
        <Pressable
          testID="training-open-progress"
          onPress={() => router.push('/training/progress' as never)}
          hitSlop={12}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              borderWidth: 0.5,
              borderColor: alpha.ivory20,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Gear size={15} color={color.muted} />
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Kai says one sentence and then gets out of the way. */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <KaiOrb size={38} />
          <View style={{ flex: 1 }}>
            <Eyebrow c={color.violetLight}>KAI</Eyebrow>
            <T size={13} lh={19} c={color.muted}>
              Learning builds confidence. One skill at a time.
            </T>
          </View>
        </View>

        {/* THE OFFER TO CLAIM WORK DONE BEFORE THIS ACCOUNT EXISTED (audit F10).
            It is a question, not an import: the stored profile carries no owner,
            so the app asks rather than deciding whose it is. */}
        {unclaimed ? (
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }} testID="training-claim-offer">
            <T size={13} weight="bold">Is this progress yours?</T>
            <T size={12.5} lh={19} c={color.muted}>
              {`This device has ${unclaimed.lessonIds.length} completed lesson${unclaimed.lessonIds.length === 1 ? '' : 's'} from before training was tied to an account. It has no name on it, so I will not assume it is yours.`}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID="training-claim-yes"
                  label={claiming ? 'Moving…' : 'Yes, it is mine'}
                  disabled={claiming}
                  onPress={async () => {
                    setClaiming(true);
                    await claimUnclaimed();
                    setClaiming(false);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID="training-claim-no"
                  label="Not mine"
                  kind="outline"
                  onPress={() => void dismissUnclaimed()}
                />
              </View>
            </View>
          </ObjectCard>
        ) : null}

        <View style={{ gap: 5 }}>
          <Eyebrow c={color.muted}>LEARN WITH KAI</Eyebrow>
          <T size={27} weight="bold" ls={-0.5}>Your next skill.</T>
          <T size={13} c={color.muted}>Start with the essentials.</T>
        </View>

        {/* The lesson that actually exists. Nothing is offered that does not. */}
        {next ? (
          /* The whole card opens the lesson, and it carries the lesson's own
             testID: `proof-training.mjs` taps `training-lesson-<id>` to get into
             Day 1 Lesson 1, and that handle used to be on a row in the day list
             — which now lives one disclosure down. A proof that cannot find its
             entry point fails for a reason that has nothing to do with the
             thing it is proving. */
          <Pressable testID={`training-lesson-${next.id}`} onPress={() => openLesson(next.id)}>
          <ObjectCard r={radius.xxxl} style={{ overflow: 'hidden' }} testID="training-next-lesson">
            <View style={{ height: 132, backgroundColor: color.surface3 }}>
              <Image
                source={require('../../../assets/training/thumb_market_basics.jpg')}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <View style={{ padding: 14, gap: 9 }}>
              <Eyebrow c={color.muted}>
                {`${step.title.toUpperCase()} · ${LESSON_KIND_LABEL[next.kind].toUpperCase()}`}
              </Eyebrow>
              <T size={17} weight="bold">{next.title}</T>
              <T size={12.5} lh={19} c={color.muted}>{next.subtitle}</T>
              <Num size={11} c={color.dim}>{`${next.minutes} min`}</Num>
              <Button
                testID="training-resume"
                label={started ? `Continue · ${next.title}` : 'Start lesson'}
                arrow
                onPress={() => openLesson(next.id)}
              />
            </View>
          </ObjectCard>
          </Pressable>
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 6 }} testID="training-up-to-date">
            <T size={13} weight="bold">You are up to date</T>
            <T size={12.5} lh={19} c={color.muted}>
              Every lesson that has been written is finished. The next ones are being authored and
              will appear here the moment they land.
            </T>
          </ObjectCard>
        )}

        {/* ── YOUR PATH — three steps, two of them honestly marked ────────── */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Eyebrow c={color.muted}>YOUR PATH</Eyebrow>
            <View style={{ flex: 1 }} />
            <Num size={10.5} c={color.dim}>
              {`${written.done} of ${written.total} lesson${written.total === 1 ? '' : 's'} available`}
            </Num>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {PATH_STEPS.map((s, i) => {
              const state = stepState(profile, s);
              const active = s.index === step.index && state !== 'coming';
              const ink = state === 'coming' ? color.dim : active ? color.volt : color.muted;
              return (
                <React.Fragment key={s.index}>
                  {i > 0 ? (
                    <View style={{ flex: 0.4, height: 1, marginTop: 22, borderTopWidth: 1, borderColor: alpha.ivory12, borderStyle: 'dashed' }} />
                  ) : null}
                  <View
                    testID={`training-step-${s.index}`}
                    style={{ flex: 1, alignItems: 'center', gap: 6 }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? color.volt : alpha.ivory16,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {state === 'complete' ? (
                        <Check size={16} color={color.volt} />
                      ) : (
                        <Num size={13} weight="bold" c={ink}>{s.index}</Num>
                      )}
                    </View>
                    <T size={11.5} weight={active ? 'bold' : 'regular'} align="center" c={state === 'coming' ? color.dim : color.text}>
                      {s.title}
                    </T>
                    {state === 'coming' ? (
                      <T size={10} align="center" c={color.dim}>Coming next</T>
                    ) : (
                      <T size={10} align="center" c={color.muted}>
                        {state === 'complete' ? 'Complete' : 'In progress'}
                      </T>
                    )}
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          {written.total > 0 ? <TrainingProgress value={pct} testID="training-progress-bar" /> : null}
        </View>

        {/* THE SENTENCE THE BOARD PUTS AT THE BOTTOM, and the one this screen
            exists to be able to say without embarrassment. */}
        <ObjectCard r={radius.xl} style={{ padding: 13, gap: 5 }} testID="training-in-development">
          <T size={12.5} weight="bold">Foundations in development</T>
          <T size={12} lh={18} c={color.muted}>
            One lesson is written and the rest of the programme is being authored. You will not be
            sent into a lesson that does not exist yet.
          </T>
        </ObjectCard>

        {/* Where progress is being kept, said once, plainly. */}
        {ready ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 }}>
            <Check size={11} color={storage === 'account' ? color.green : color.dim} />
            <T size={11} c={color.muted}>
              {storage === 'account'
                ? 'Your progress is saved to your account and follows you to any device.'
                : storage === 'device'
                ? 'Saved on this device for now — it will sync to your account when the service is reachable.'
                : 'Practising as a guest. Sign in to keep what you finish.'}
            </T>
          </View>
        ) : null}

        <Pressable
          testID="training-open-belt"
          onPress={() => router.push('/training/belt' as never)}
        >
          <ObjectCard r={radius.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T size={13} weight="bold">Your belt</T>
              <T size={12} lh={18} c={color.muted}>
                What lessons and calls have earned you, and what the next belt asks for.
              </T>
            </View>
            <ChevronRight size={16} color={color.muted} />
          </ObjectCard>
        </Pressable>

        {/* ── the full programme, one tap down ───────────────────────────── */}
        <Pressable
          testID="training-toggle-programme"
          onPress={() => setShowProgramme((v) => !v)}
          style={{ paddingVertical: 6 }}
        >
          <T size={12} weight="bold" c={color.muted}>
            {showProgramme ? 'Hide the full seven-day programme' : 'See the full seven-day programme'}
          </T>
        </Pressable>

        {showProgramme ? (
          <View style={{ gap: 10 }}>
            <T size={11.5} lh={17} c={color.dim}>
              This is the plan the lessons are being written against. Days marked with a lock are
              not open yet; lessons marked SOON have not been authored.
            </T>
            {TRAINING_DAYS.map((day) => {
              const state = dayState(profile, day.id);
              const expanded = openDayId === day.id;
              const done = dayCompletedLessonIds(profile, day.id);
              return (
                <DayNode
                  key={day.id}
                  testID={`training-day-${day.index}`}
                  day={day}
                  state={state}
                  expanded={expanded}
                  onPress={() => setOpenDayId(expanded ? '' : day.id)}
                >
                  {lessonsForDay(day.id).map((node, i) => {
                    const complete = done.includes(node.id);
                    const unlocked = isLessonUnlocked(profile, node.id);
                    const lessonState = complete
                      ? 'complete'
                      : !unlocked
                      ? 'locked'
                      : node.hasContent
                      ? 'open'
                      : 'coming';
                    return (
                      <LessonNodeRow
                        key={node.id}
                        testID={`training-lesson-${node.id}`}
                        node={node}
                        position={i + 1}
                        state={lessonState}
                        onPress={() => openLesson(node.id)}
                      />
                    );
                  })}
                </DayNode>
              );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lock size={12} color={color.dim} />
              <T size={11} c={color.dim} style={{ flex: 1 }}>
                A day opens when the one before it is finished, its score clears the gate, and its
                assessment has been passed. Watching does not open a day.
              </T>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
