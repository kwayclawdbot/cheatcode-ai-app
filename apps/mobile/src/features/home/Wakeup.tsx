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
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from 'react-native';
import { KaiOrb } from '../../ui/KaiOrb';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { shownAtLabel, type WakeDirection, type Wakeup as WakeupMessage } from './wake-message';

const DURATION = 250;
const STAGGER = 90;
const CURVE = Easing.bezier(0.22, 1, 0.36, 1);
/** RN-web has no native driver; asking for one only prints a warning. */
const NATIVE = Platform.OS !== 'web';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

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
  message, greeting, animate, onDirection, testID = 'kai-wakeup',
}: {
  /** null while storage is still answering — the greeting alone carries the screen */
  message: WakeupMessage | null;
  /** known with no network: "Morning, Kway." */
  greeting: string;
  /** false on the second open of the day */
  animate: boolean;
  onDirection: (d: WakeDirection) => void;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const still = !animate || reduced;
  let step = 0;
  const next = () => step++;

  return (
    <View testID={testID} style={{ gap: 12, paddingTop: 6 }}>
      {message && !animate ? (
        <T size={10} weight="bold" ls={0.8} c={color.dim} testID="wakeup-earlier">
          {`EARLIER TODAY · ${shownAtLabel(message.at).toUpperCase()}`}
        </T>
      ) : null}

      {/* The greeting needs no network and never waits for one. */}
      <Materialize step={next()} still={still} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <KaiOrb size={34} />
        <T size={27} weight="bold" ls={-0.5} lh={32} testID="wakeup-greeting">
          {message?.greeting ?? greeting}
        </T>
      </Materialize>

      {message?.state ? (
        <Materialize step={next()} still={still}>
          <T size={14} lh={20} c={color.muted} testID="wakeup-state">{message.state}</T>
        </Materialize>
      ) : null}

      {message ? (
        <Materialize step={next()} still={still}>
          <T size={18} lh={26} weight="semibold" ls={-0.2} testID="wakeup-lead">{message.lead}</T>
        </Materialize>
      ) : null}

      {message?.evidence ? (
        <Materialize step={next()} still={still}>
          <T size={13} lh={19} c={color.muted} testID="wakeup-evidence">{message.evidence}</T>
        </Materialize>
      ) : null}

      {message?.aside ? (
        <Materialize step={next()} still={still}>
          <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.gold, marginTop: 6 }} />
            <T size={13} lh={19} c={color.gold} style={{ flex: 1 }} testID="wakeup-aside">{message.aside}</T>
          </View>
        </Materialize>
      ) : null}

      {message ? (
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
