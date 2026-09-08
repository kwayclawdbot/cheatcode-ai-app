import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { color, radius } from '../../ui/tokens';
import { TrainingProgress } from './ui';
import { useTraining } from './store';
import { currentStep, nextWrittenLesson, writtenProgress } from './path';

/**
 * THE HOME ENTRY POINT.
 *
 * Kai's wall is one message and then a conversation, so training arrives the
 * way anything else Kai raises does: as an object he put there, in violet.
 *
 * It says one of exactly two things, and which one depends on `enrolled` —
 * whether this LEARNER has actually begun — not on whether the profile object
 * is populated. Everyone holds the empty default until the account's progress
 * has been read, so keying off the numbers would tell a brand-new member to
 * "continue" something they have never opened. While `ready` is still false we
 * draw nothing at all rather than flashing the wrong one.
 *
 * THE PROMISE HERE IS THE SMALLER ONE NOW (audit F09). It used to open with
 * "Zero to trade ready in seven days" over a bar measured against thirty-one
 * lessons, one of which exists. It now names the STEP the member is on and
 * counts the lessons that have actually been written, because that is the only
 * number on this card that a member could check.
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
        <T size={17} weight="bold" lh={22}>Start with the essentials</T>
        <T size={12.5} lh={19} c={color.muted}>
          Market basics first, then reading a chart, then building a plan. The first lesson takes
          about nine minutes and the rest are being written.
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

  const step = currentStep(profile);
  const next = nextWrittenLesson(profile);
  const written = writtenProgress(profile);
  const pct = written.total === 0 ? 0 : Math.round((written.done / written.total) * 100);

  return (
    <ObjectCard tone="kai" r={radius.xxxl} style={{ padding: 15, gap: 11 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow c={color.violetLight}>{`STEP ${step.index} · ${step.title.toUpperCase()}`}</Eyebrow>
          <T size={15.5} weight="bold" numberOfLines={1} style={{ marginTop: 3 }}>
            {next?.title ?? 'You are up to date'}
          </T>
        </View>
        <Num size={13} weight="bold">{`${pct}%`}</Num>
      </View>

      <TrainingProgress value={pct} testID="home-training-progress" />

      {/* WHAT THE NUMBER IS ABOUT. It is the share of the lessons that EXIST,
          not of the seven-day plan — one lesson of thirty-one is written, and a
          bar reading 3% would be a true statement about the plan and a useless
          one about the person who just finished everything available. */}
      <T size={11} c={color.dim}>
        {`${written.done} of ${written.total} lesson${written.total === 1 ? '' : 's'} written so far`}
      </T>

      <Button
        testID="home-training-continue"
        label={next ? 'Continue training' : 'See your path'}
        arrow
        onPress={() => {
          // A lesson that has not been written is not somewhere to send anyone;
          // the path screen is, and it shows what is genuinely open.
          if (next) router.push(`/training/${next.id}` as never);
          else router.push('/training' as never);
        }}
      />
    </ObjectCard>
  );
}
