import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Check, ChevronDown, ChevronRight, Lock } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { LESSON_KIND_LABEL } from './labels';
import type { TrainingDay, TrainingLessonNode } from './types';
import type { DayState } from './gates';

export function TrainingProgress({ value, testID }: { value: number; testID?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      testID={testID}
      style={{ height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: alpha.ivory10 }}
    >
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color.volt }} />
    </View>
  );
}

/**
 * THE DAY NODE — the landing screen's unit of organisation.
 *
 * The spec is explicit: never show "27 lessons", show DAY 3 OF 7. So this is
 * the object the member sees seven of, and the lesson rows only exist inside
 * an expanded one. State is carried three ways at once — the numeral's fill,
 * the trailing glyph, and the word under the title — because a locked door
 * that is only dimmer than an open one is not a door, it is a rendering bug.
 */
export function DayNode({
  day,
  state,
  expanded,
  onPress,
  children,
  testID,
}: {
  day: TrainingDay;
  state: DayState;
  expanded: boolean;
  onPress: () => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const locked = state === 'locked';
  const complete = state === 'complete';

  return (
    <ObjectCard
      testID={testID}
      tone={state === 'active' ? 'voltCard' : 'default'}
      r={radius.xl}
      style={{ opacity: locked ? 0.62 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day ${day.index}, ${day.title}`}
        accessibilityState={{ expanded, disabled: locked }}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: 12,
          padding: 13,
          opacity: pressed ? 0.86 : 1,
        })}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.lg,
            overflow: 'hidden',
            backgroundColor: color.surface3,
          }}
        >
          <Image source={day.image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: locked ? alpha.bg82 : alpha.black22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {complete ? (
              <Check size={18} color={color.volt} />
            ) : (
              <Num size={17} weight="bold" c={locked ? color.dim : color.text}>
                {String(day.index)}
              </Num>
            )}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Eyebrow c={complete ? color.volt : locked ? color.dim : color.muted}>
            {`DAY ${day.index} OF 7`}
          </Eyebrow>
          <T size={15} weight="bold" numberOfLines={1}>{day.title}</T>
          <T size={11.5} lh={16} c={color.muted} numberOfLines={2}>{day.outcome}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Num size={10.5} c={color.dim}>{`${day.minutes} min`}</Num>
            <T size={10.5} c={color.dim}>·</T>
            <T size={10.5} c={complete ? color.volt : locked ? color.dim : color.muted}>
              {complete ? 'Complete' : locked ? 'Locked' : 'Available now'}
            </T>
          </View>
        </View>

        <View style={{ justifyContent: 'center' }}>
          {locked ? (
            <Lock size={15} color={color.dim} />
          ) : expanded ? (
            <ChevronDown size={11} color={color.volt} />
          ) : (
            <ChevronRight size={11} color={color.volt} />
          )}
        </View>
      </Pressable>

      {expanded && children ? (
        <View
          style={{
            paddingHorizontal: 13,
            paddingBottom: 12,
            gap: 2,
            borderTopWidth: 0.5,
            borderTopColor: alpha.ivory08,
            paddingTop: 8,
          }}
        >
          {children}
        </View>
      ) : null}
    </ObjectCard>
  );
}

/** One lesson inside an expanded day. */
export function LessonNodeRow({
  node,
  position,
  state,
  onPress,
  testID,
}: {
  node: TrainingLessonNode;
  position: number;
  state: 'open' | 'complete' | 'locked' | 'coming';
  onPress: () => void;
  testID?: string;
}) {
  const complete = state === 'complete';
  const open = state === 'open';
  const tappable = open || complete;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={node.title}
      accessibilityState={{ disabled: !tappable }}
      disabled={!tappable}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 9,
        paddingHorizontal: 9,
        borderRadius: radius.lg,
        backgroundColor: open ? alpha.ivory06 : 'transparent',
        opacity: tappable ? (pressed ? 0.82 : 1) : 0.5,
      })}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: complete ? color.volt : open ? color.text : alpha.ivory20,
          backgroundColor: complete ? color.volt : 'transparent',
        }}
      >
        {complete ? (
          <Check size={12} color={color.bg} />
        ) : (
          <Num size={11} weight="bold" c={open ? color.text : color.dim}>{String(position)}</Num>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={13.5} weight={open ? 'bold' : 'semibold'} numberOfLines={1}>{node.title}</T>
        <T size={10.5} c={color.muted} numberOfLines={1} style={{ marginTop: 2 }}>
          {node.minutes} min · {LESSON_KIND_LABEL[node.kind]}
        </T>
      </View>

      {state === 'coming' ? (
        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: radius.xs,
            borderWidth: 0.5,
            borderColor: alpha.gold40,
          }}
        >
          <T size={9} c={color.gold}>SOON</T>
        </View>
      ) : state === 'locked' ? (
        <Lock size={13} color={color.dim} />
      ) : null}
    </Pressable>
  );
}

export function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={11.5} c={color.muted} style={{ flex: 1 }}>{label}</T>
        <Num size={11.5} weight="bold">{`${value}%`}</Num>
      </View>
      <TrainingProgress value={value} />
    </View>
  );
}
