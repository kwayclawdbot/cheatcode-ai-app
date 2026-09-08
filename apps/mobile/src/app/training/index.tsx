import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow, Num } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { Gear } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import {
  TOTAL_TRAINING_MINUTES,
  TRAINING_DAYS,
  lessonNodeById,
  lessonsForDay,
} from '../../features/training/curriculum';
import {
  currentDay,
  dayCompletedLessonIds,
  dayState,
  isLessonUnlocked,
  nextOpenLessonId,
  programmeProgressPct,
} from '../../features/training/gates';
import { DayNode, LessonNodeRow, TrainingProgress } from '../../features/training/ui';
import { useTraining } from '../../features/training/store';

/**
 * TRAINING — THE SEVEN DAY PATH.
 *
 * The mockup shipped a flat list of ten lessons and a "3 / 10 lessons" counter.
 * The spec overrides that in one line: never show a lesson count, show DAY 3 OF
 * 7. So the page is seven day nodes; a day expands to reveal its own lessons,
 * and the count of lessons never appears anywhere on this screen.
 *
 * Nothing else about the approved design moved — the hero, the volt progress
 * bar and the ObjectCard surfaces are the ones that were signed off. This is a
 * reorganisation of what the page is a list OF, not a redesign of the page.
 */
export default function TrainingHome() {
  const router = useRouter();
  const { profile } = useTraining();

  const today = currentDay(profile);
  const [openDayId, setOpenDayId] = useState<string>(today.id);
  const pct = programmeProgressPct(profile);
  const resumeId = nextOpenLessonId(profile);
  const resumeNode = resumeId ? lessonNodeById(resumeId) : null;
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

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 250, overflow: 'hidden' }}>
          <Image
            source={require('../../../assets/training/hero_black_male.png')}
            style={{ position: 'absolute', right: -20, top: 0, width: '62%', height: '100%' }}
            contentFit="contain"
          />
          <View style={{ position: 'absolute', left: 16, top: 24, width: '64%' }}>
            <Eyebrow c={color.muted}>TRAINING MODE</Eyebrow>
            <T size={28} weight="bold" lh={33} ls={-0.4} style={{ marginTop: 8 }}>
              Zero to Trade{'\n'}Ready in 7 Days
            </T>
            <T size={12.5} lh={19} c={color.muted} style={{ marginTop: 8 }}>
              Seven days. About {Math.round(TOTAL_TRAINING_MINUTES / 60)} hours total. Kai with you
              the whole way.
            </T>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {/* The header number is a DAY, never a lesson count. */}
          <ObjectCard r={radius.xl} style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Eyebrow c={color.volt}>{`DAY ${today.index} OF 7`}</Eyebrow>
                <T size={15} weight="bold" style={{ marginTop: 3 }}>{today.title}</T>
                <T size={11} c={color.muted} numberOfLines={1} style={{ marginTop: 2 }}>
                  {today.outcome}
                </T>
              </View>
              <Num size={15} weight="bold">{`${pct}%`}</Num>
            </View>
            <TrainingProgress value={pct} testID="training-progress-bar" />
          </ObjectCard>

          <View style={{ gap: 10 }}>
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
          </View>

          {/* Only offered when there is something real behind it. A lesson that
              has not been written is not something to send a member into. */}
          {resumeNode?.hasContent ? (
            <Button
              testID="training-resume"
              label={started ? `Continue · ${resumeNode.title}` : `Start Day 1 · ${resumeNode.title}`}
              arrow
              onPress={() => openLesson(resumeNode.id)}
            />
          ) : (
            <ObjectCard r={radius.xl} style={{ padding: 14, gap: 6 }}>
              <T size={12.5} weight="bold">You are up to date</T>
              <T size={12} lh={18} c={color.muted}>
                {resumeNode
                  ? `${resumeNode.title} is still being written. It will open here the moment it lands.`
                  : 'Every lesson in the programme is complete.'}
              </T>
            </ObjectCard>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
