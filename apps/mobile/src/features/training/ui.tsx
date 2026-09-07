import React from 'react';
import { ImageBackground, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { alpha, color, radius } from '../../ui/tokens';
import type { TrainingLesson, TrainingLessonKind } from './types';

export function TrainingProgress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: alpha.ivory10 }}>
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color.volt }} />
    </View>
  );
}

const KIND: Record<TrainingLessonKind, { label: string; c: string }> = {
  interactive: { label: 'Interactive', c: color.volt },
  video: { label: 'Video + Practice', c: color.gold },
  kai_practice: { label: 'Kai Practice', c: color.violetLight },
  chart_challenge: { label: 'Chart Challenge', c: color.cyan },
  mastery: { label: 'Mastery', c: color.green },
};

export function LessonPathRow({
  lesson,
  index,
  active,
  complete,
  locked,
  onPress,
}: {
  lesson: TrainingLesson;
  index: number;
  active: boolean;
  complete: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const meta = KIND[lesson.kind];
  return (
    <Pressable
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: locked ? 0.42 : pressed ? 0.82 : 1 })}
    >
      <View style={{
        flexDirection: 'row',
        gap: 11,
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: radius.lg,
        backgroundColor: active ? alpha.ivory08 : 'transparent',
      }}>
        <View style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: complete ? color.volt : active ? color.text : alpha.ivory20,
          backgroundColor: complete ? color.volt : active ? color.text : color.surface3,
        }}>
          <T size={11} weight="bold" c={complete || active ? color.bg : color.muted}>{complete ? '✓' : index + 1}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={13.5} weight={active ? 'bold' : 'semibold'}>{lesson.title}</T>
          <T size={10.5} c={active ? meta.c : color.muted} style={{ marginTop: 2 }}>
            {lesson.minutes} min · {meta.label}
          </T>
        </View>
        {locked ? <T size={12} c={color.dim}>⌁</T> : null}
      </View>
    </Pressable>
  );
}

export function EditorialImage({
  source,
  height = 210,
}: {
  source: number;
  height?: number;
}) {
  return (
    <View style={{ height, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: color.surface3 }}>
      <Image source={source} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 74,
        backgroundColor: 'rgba(11,11,14,0.5)',
      }} />
    </View>
  );
}

export function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={11.5} c={color.muted} style={{ flex: 1 }}>{label}</T>
        <T size={11.5} weight="bold">{value}%</T>
      </View>
      <TrainingProgress value={value} />
    </View>
  );
}

export function KaiFeedbackCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ObjectCard tone="kai" r={radius.xl} style={{ padding: 14, gap: 8 }}>
      <T size={10} weight="bold" c={color.violetLight}>KAI FEEDBACK</T>
      {children}
    </ObjectCard>
  );
}
