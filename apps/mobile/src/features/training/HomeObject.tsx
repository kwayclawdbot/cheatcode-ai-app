import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { color, radius } from '../../ui/tokens';
import { TrainingProgress } from './ui';
import { useTraining } from './store';
import { currentDay, programmeProgressPct } from './gates';
import { lessonNodeById } from './curriculum';

/**
 * THE HOME ENTRY POINT.
 *
 * Kai's wall is one message and then a conversation, so training arrives the
 * way anything else Kai raises does: as an object he put there, in violet.
 *
 * It says one of exactly two things, and which one depends on `enrolled` —
 * whether this device has a STORED learner profile — not on whether the
 * profile object is populated. Everyone holds the empty default until
 * AsyncStorage has been read, so keying off the numbers would tell a brand-new
 * member to "continue" something they have never opened. While `ready` is
 * still false we draw nothing at all rather than flashing the wrong one.
 */
export function ContinueTrainingObject({ testID = 'home-training' }: { testID?: string }) {
  const router = useRouter();
  const { profile, ready, enrolled } = useTraining();

  // Not knowing yet is not the same as knowing there is nothing. Draw nothing.
  if (!ready) return null;

  if (!enrolled) {
    return (
      <ObjectCard tone="kai" r={radius.xxxl} style={{ padding: 15, gap: 10 }} testID={testID}>
        <Eyebrow c={color.violetLight}>TRAINING</Eyebrow>
        <T size={17} weight="bold" lh={22}>Zero to trade ready in seven days</T>
        <T size={12.5} lh={19} c={color.muted}>
          Seven short days — about five hours in total. You will read a chart, build a
          risk-controlled trade plan, and practise it with me watching.
        </T>
        <Button
          testID="home-training-start"
          label="Start training"
          arrow
          onPress={() => router.push('/training' as never)}
        />
      </ObjectCard>
    );
  }

  const day = currentDay(profile);
  const node = lessonNodeById(profile.currentLessonId);
  const pct = programmeProgressPct(profile);

  return (
    <ObjectCard tone="kai" r={radius.xxxl} style={{ padding: 15, gap: 11 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow c={color.violetLight}>{`DAY ${day.index} OF 7 · ${day.title.toUpperCase()}`}</Eyebrow>
          <T size={15.5} weight="bold" numberOfLines={1} style={{ marginTop: 3 }}>
            {node?.title ?? day.title}
          </T>
        </View>
        <Num size={13} weight="bold">{`${pct}%`}</Num>
      </View>

      <TrainingProgress value={pct} testID="home-training-progress" />

      <Button
        testID="home-training-continue"
        label="Continue training"
        arrow
        onPress={() => {
          // A lesson that has not been written is not somewhere to send anyone;
          // the path screen is, and it shows what is genuinely open.
          if (node?.hasContent) router.push(`/training/${node.id}` as never);
          else router.push('/training' as never);
        }}
      />
    </ObjectCard>
  );
}
