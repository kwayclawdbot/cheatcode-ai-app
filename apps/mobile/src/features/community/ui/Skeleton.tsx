import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { alpha, radius } from '../../../ui/tokens';
import { useReducedMotion } from './Social';

/**
 * THE SHAPE OF WHAT IS COMING, WHILE IT COMES.
 *
 * ── WHY THIS IS HAND-ROLLED AND NOT FROM THE KIT ────────────────────────
 * The obvious answer to "the room shows a spinner" is gluestack's Skeleton.
 * There isn't one. `@gluestack-ui/core` v5 ships thirty-odd creators —
 * actionsheet, avatar, menu, toast, tooltip, progress — and skeleton is not
 * among them, so there is nothing to adopt here and no version of this file
 * that is a thinner wrapper than this one.
 *
 * It would also be the wrong layer if it existed. A skeleton is a picture of
 * the objects it stands in for, and the objects here are message rows: an
 * avatar at a known size, a name, two lines of body. Those proportions come
 * from `Message.tsx`, not from a component library's idea of a placeholder, so
 * the honest place to keep them is beside the thing they imitate.
 *
 * ── WHY A SKELETON AT ALL, RATHER THAN THE SPINNER IT REPLACES ──────────
 * A centred spinner says "something is happening" and nothing else — it is the
 * same picture whether the room has one message or two hundred, and it throws
 * the whole list away and rebuilds it when the answer lands. A skeleton says
 * WHAT is coming and roughly how much of it, and because it occupies the space
 * the messages will occupy, the list does not jump when they arrive.
 *
 * ── IT DOES NOT CLAIM TO KNOW THE COUNT ─────────────────────────────────
 * Four rows, always. It is tempting to draw as many rows as the room had last
 * time, and that would be a number the app does not have yet presented as
 * though it did — the same lie as a fabricated level on a chart. Four is
 * enough to read as "a list of posts" and few enough that nobody counts them.
 */

const PULSE_MS = 900;

/** One bar. Width may be a percentage string, which is how a text line varies. */
export function SkeletonBar({ w, h = 10, r = radius.sm, style }: {
  w: number | `${number}%`;
  h?: number;
  r?: number;
  style?: object;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    /**
     * Reduced motion holds it still at the brighter end rather than fading it
     * out and leaving it. A placeholder that has stopped moving AND gone faint
     * reads as a thing that failed to load; the point of the setting is to
     * remove MOVEMENT, not to make the waiting state harder to see.
     */
    if (reduced) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: r, backgroundColor: alpha.ivory12 },
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
        style,
      ]}
    />
  );
}

/**
 * A stand-in for one message row: avatar, name, and body lines.
 *
 * The last line is deliberately short. Real paragraphs do not end flush with
 * the right margin, and a stack of full-width bars reads as a table rather
 * than as somebody talking.
 */
function RowSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <SkeletonBar w={34} h={34} r={17} />
      <View style={{ flex: 1, gap: 7, paddingTop: 3 }}>
        <SkeletonBar w="42%" h={9} />
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBar key={i} w={i === lines - 1 ? '61%' : '92%'} h={10} />
        ))}
      </View>
    </View>
  );
}

/**
 * The room, loading. Four rows with varying body lengths, because four
 * identical rows read as a pattern rather than as posts.
 */
export function MessageListSkeleton({ testID }: { testID?: string }) {
  const shape = [2, 1, 3, 2];
  return (
    <View
      testID={testID ?? 'message-list-skeleton'}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading the conversation"
      style={{ padding: 16, paddingTop: 12, gap: 18 }}
    >
      {shape.map((lines, i) => <RowSkeleton key={i} lines={lines} />)}
    </View>
  );
}
