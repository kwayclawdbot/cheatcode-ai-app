import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { alpha, color } from '../../ui/tokens';
import { T, Num } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { ChevronRight } from '../../ui/Icons';
import { useTraining } from '../training/store';
import { PATH_STEPS, currentStep, nextWrittenLesson, writtenProgress } from '../training/path';

/**
 * THE LEARNING-PROGRESS CARD (redesign V1 "Learning path", kept on the V2 Home).
 *
 * Compact on purpose: a title with the step, the next lesson's name (or "You
 * are up to date"), one orange bar with its percentage, and what that
 * percentage is OF. The whole card opens the lesson or the path.
 *
 * The percentage is the share of lessons that EXIST, and the line under the bar
 * says so — the same honesty rule the training lane's own object follows. It
 * draws nothing until training has answered: not knowing yet is not zero.
 */
function Book({ size = 20, c = color.action }: { size?: number; c?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 5.5C4.5 4 8 4 12 6.5v13C8 17 4.5 17 2 18.5v-13ZM22 5.5C19.5 4 16 4 12 6.5v13c4-2.5 7.5-2.5 10-1v-13Z" stroke={c} strokeWidth={1.75} />
    </Svg>
  );
}

export function LearningPathCard({ testID = 'learning-path' }: { testID?: string }) {
  const router = useRouter();
  const { profile, ready, enrolled } = useTraining();
  if (!ready) return null;

  const step = currentStep(profile);
  const next = enrolled ? nextWrittenLesson(profile) : null;
  const written = writtenProgress(profile);
  const pct = !enrolled || written.total === 0 ? 0 : Math.round((written.done / written.total) * 100);
  const headline = !enrolled ? 'Start with the essentials' : next?.title ?? 'You are up to date';
  const go = () => router.push((enrolled && next ? `/training/${next.id}` : '/training') as never);

  return (
    <Card
      testID={testID}
      onPress={go}
      accessibilityLabel={`Learning path. ${enrolled ? `Step ${step.index} of ${PATH_STEPS.length}.` : ''} ${headline}. ${pct} percent.`}
      accessibilityHint={enrolled && next ? 'Opens the next lesson.' : 'Opens your learning path.'}
      style={{ gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Book />
        <T variant="cardTitle" style={{ flex: 1 }}>Learning path</T>
        {enrolled ? <T variant="meta" c={color.textSecondary}>{`Step ${step.index} of ${PATH_STEPS.length}`}</T> : null}
      </View>
      <T variant="body" weight="semibold" numberOfLines={1}>{headline}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory10, overflow: 'hidden' }} testID={`${testID}-bar`}>
          <View style={{ width: `${Math.max(pct, 0)}%`, height: '100%', borderRadius: 3, backgroundColor: color.action }} />
        </View>
        <Num variant="meta" c={color.textPrimary}>{`${pct}%`}</Num>
        <ChevronRight size={18} color={color.textSecondary} />
      </View>
      <T variant="meta" c={color.textSecondary}>
        {enrolled
          ? `${written.done} of ${written.total} lesson${written.total === 1 ? '' : 's'} written so far`
          : 'Market basics first, then reading a chart. About nine minutes.'}
      </T>
    </Card>
  );
}
