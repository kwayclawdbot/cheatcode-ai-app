/**
 * Kai waking up.
 *
 * One message, one voice, one question. Nothing shares this screen with it on
 * the first open of a day — that is the whole point of the rebuild.
 *
 * Motion follows DESIGN-LANGUAGE's "materialize, don't slide": 250ms on
 * cubic-bezier(0.22, 1, 0.36, 1), y 12 → 0, staggered ~90ms so the message
 * assembles itself instead of arriving as a block. Discrete objects (the orb,
 * the direction pills) also take the spec's scale 0.8 → 1; the text lines take
 * everything except the scale, because scaling a paragraph of type reads as
 * blur, not confidence. Reduce-motion turns all of it off.
 *
 * The second open of the day renders the same message with `animate={false}` —
 * it is already there, it does not perform again.
 *
 * ── COMPACT (audit F03) ──────────────────────────────────────────────────────
 * F03's acceptance test is that at 390px the first actionable object and its
 * button are visible without scrolling. The full message cannot meet it: a
 * 27px greeting, a market sentence, a lead, a paragraph of evidence, an aside
 * and a question is 300px of reading before anything to do.
 *
 * `compact` renders the two lines that orient somebody — the greeting and the
 * one relevant thing — and then gets out of the way so the ACTION can be drawn
 * immediately below it (`action`, which the screen passes in). The state, the
 * evidence and the aside are not deleted; they move behind "Read the briefing",
 * which `withBriefingOffer` guarantees exists whenever there is prose to reach.
 *
 * The directions move BELOW the action for the same reason: Kai's offers are
 * alternatives to the thing he put in front of you, so they belong after it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useReducedMotion } from '../a11y/context';
import { KaiOrb } from '../../ui/KaiOrb';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { shownAtLabel, type WakeDirection, type Wakeup as WakeupMessage } from './wake-message';

const DURATION = 250;
const STAGGER = 90;
const CURVE = Easing.bezier(0.22, 1, 0.36, 1);
/** RN-web has no native driver; asking for one only prints a warning. */
const NATIVE = Platform.OS !== 'web';


function Materialize({
  step, still, pop = false, children, style,
}: {
  /** stagger index */
  step: number;
  /** render finished, with no animation at all */
  still: boolean;
  /** discrete object → also take the spec's scale 0.8 → 1 */
  pop?: boolean;
  children: React.ReactNode;
  style?: object;
}) {
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) { v.setValue(1); return; }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1,
      duration: DURATION,
      delay: step * STAGGER,
      easing: CURVE,
      useNativeDriver: NATIVE,
    });
    a.start();
    return () => a.stop();
  }, [still, step, v]);

  const transform: object[] = [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }];
  if (pop) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) });

  return <Animated.View style={[{ opacity: v, transform }, style]}>{children}</Animated.View>;
}

function DirectionPill({ d, onPress, step, still }: { d: WakeDirection; onPress: (d: WakeDirection) => void; step: number; still: boolean }) {
  return (
    <Materialize step={step} still={still} pop>
      <Pressable
        testID={`wakeup-direction-${d.id}`}
        accessibilityRole="button"
        accessibilityLabel={d.label}
        onPress={() => onPress(d)}
        style={({ pressed }) => ({
          paddingVertical: 10,
          paddingHorizontal: 15,
          borderRadius: radius.pill,
          borderWidth: 0.5,
          borderColor: alpha.volt50,
          backgroundColor: alpha.volt08,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <T size={13} weight="semibold" c={color.volt}>{d.label}</T>
      </Pressable>
    </Materialize>
  );
}

export function Wakeup({
  message, greeting, animate, onDirection, compact = false, action = null, testID = 'kai-wakeup',
}: {
  /** null while storage is still answering — the greeting alone carries the screen */
  message: WakeupMessage | null;
  /** known with no network: "Morning, Kway." */
  greeting: string;
  /** false on the second open of the day */
  animate: boolean;
  onDirection: (d: WakeDirection) => void;
  /** F03: greeting + one line, then the action. See the header. */
  compact?: boolean;
  /** The one thing to do — drawn between the message and Kai's offers. */
  action?: React.ReactNode;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const still = !animate || reduced;
  let step = 0;
  const next = () => step++;

  return (
    <View testID={testID} style={{ gap: compact ? 10 : 12, paddingTop: 6 }}>
      {message && !animate ? (
        <T size={10} weight="bold" ls={0.8} c={color.dim} testID="wakeup-earlier">
          {`EARLIER TODAY · ${shownAtLabel(message.at).toUpperCase()}`}
        </T>
      ) : null}

      {/* The greeting needs no network and never waits for one. */}
      <Materialize step={next()} still={still} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <KaiOrb size={compact ? 30 : 34} />
        <T size={compact ? 22 : 27} weight="bold" ls={-0.5} lh={compact ? 27 : 32} numberOfLines={1} testID="wakeup-greeting">
          {message?.greeting ?? greeting}
        </T>
      </Materialize>

      {message?.state && !compact ? (
        <Materialize step={next()} still={still}>
          <T size={14} lh={20} c={color.muted} testID="wakeup-state">{message.state}</T>
        </Materialize>
      ) : null}

      {message ? (
        <Materialize step={next()} still={still}>
          <T
            size={compact ? 15 : 18}
            lh={compact ? 21 : 26}
            weight={compact ? 'regular' : 'semibold'}
            c={compact ? color.muted : color.text}
            ls={compact ? undefined : -0.2}
            numberOfLines={compact ? 2 : undefined}
            testID="wakeup-lead"
          >
            {message.lead}
          </T>
        </Materialize>
      ) : null}

      {message?.evidence && !compact ? (
        <Materialize step={next()} still={still}>
          <T size={13} lh={19} c={color.muted} testID="wakeup-evidence">{message.evidence}</T>
        </Materialize>
      ) : null}

      {message?.aside && !compact ? (
        <Materialize step={next()} still={still}>
          <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.gold, marginTop: 6 }} />
            <T size={13} lh={19} c={color.gold} style={{ flex: 1 }} testID="wakeup-aside">{message.aside}</T>
          </View>
        </Materialize>
      ) : null}

      {/*
        THE ACTION, IMMEDIATELY UNDER THE TWO LINES (audit F03).
        A lesson for a beginner, a company for an investor, a setup or a
        position for a trader — the screen decides which and passes it in; this
        only decides that it comes before Kai's alternatives rather than after
        three paragraphs of them.
      */}
      {compact && action ? (
        <Materialize step={next()} still={still} pop>
          <View testID="wakeup-action">{action}</View>
        </Materialize>
      ) : null}

      {message && !compact ? (
        <Materialize step={next()} still={still} style={{ paddingTop: 2 }}>
          <T size={15} lh={21} weight="semibold" c={color.violetLight} testID="wakeup-question">{message.question}</T>
        </Materialize>
      ) : null}

      {message?.directions.length ? (
        <View testID="wakeup-directions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          {message.directions.map((d, i) => (
            <DirectionPill key={d.id} d={d} onPress={onDirection} step={step + i} still={still} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
