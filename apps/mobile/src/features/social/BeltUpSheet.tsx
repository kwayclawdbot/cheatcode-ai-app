import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { BELT_INK, BELT_LABEL, beltRank } from './belts';
import type { Belt } from '../../lib/types';

/**
 * MOVING UP A BELT. QUIET, AND EARNED.
 *
 * ── WHY THIS ONE IS ALLOWED TO MOVE ─────────────────────────────────────
 * The frequency rule decides whether anything animates: a thing seen a hundred
 * times a day gets no animation at all, and a thing seen once or twice a year
 * may have delight. Five belts exist. A member crosses one of them four times
 * in their whole life on this app, and the last one may never come. That is as
 * rare as an interface event gets, so this is the one place in the social
 * layer that is permitted a moment.
 *
 * ── AND WHY IT IS STILL SMALL ───────────────────────────────────────────
 * No confetti, no burst, no sound. This is an adults' trading app and the
 * thing being celebrated is a record of being right about the market — a
 * party popper would make it read as a game, which is the exact register the
 * brand does not want. What happens is: the five rungs of the ladder come up
 * in sequence, the new one lands last and stays lit. Under half a second in
 * total, ease-out, opacity and scale only.
 *
 * Nothing here starts from `scale(0)`. Things do not appear out of nothing.
 * The rungs start at 0.9 and 0, which reads as arriving rather than as being
 * conjured.
 */

const RUNGS: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];

/** One rung of the ladder, arriving. */
function Rung({ belt, lit, index, live }: { belt: Belt; lit: boolean; index: number; live: boolean }) {
  const v = useRef(new Animated.Value(live ? 0 : 1)).current;

  useEffect(() => {
    if (!live) { v.setValue(1); return; }
    const a = Animated.timing(v, {
      toValue: 1,
      duration: 220,
      // Stagger stays short: 55ms between rungs, so the whole ladder is up in
      // well under half a second and nobody is waiting on a celebration.
      delay: 90 + index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    a.start();
    return () => a.stop();
  }, [index, live, v]);

  return (
    <Animated.View
      style={{
        flex: 1,
        height: lit ? 30 : 16,
        borderRadius: 4,
        backgroundColor: lit ? BELT_INK[belt] : alpha.ivory08,
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}
    />
  );
}

export function BeltUpSheet({
  visible, belt, label, plain, onClose, onSeeBoard, testID,
}: {
  visible: boolean;
  belt: Belt;
  /** The server's own word for it, when there is one. */
  label?: string | null;
  /** One sentence about what changed. Falls back to a plain statement. */
  plain?: string | null;
  onClose: () => void;
  onSeeBoard?: () => void;
  testID?: string;
}) {
  const rank = beltRank(belt);
  const word = (label || `${BELT_LABEL[belt]} belt`).replace(/\s+/g, ' ');

  return (
    <Sheet visible={visible} onClose={onClose} testID={testID ?? 'sheet-belt-up'}>
      <View style={{ gap: 14, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-end', height: 30 }}>
          {RUNGS.map((b, i) => (
            <Rung key={b} belt={b} lit={i <= rank} index={i} live={visible} />
          ))}
        </View>

        <View style={{ gap: 5 }}>
          <T size={11} weight="bold" ls={0.88} c={color.volt}>YOU MOVED UP</T>
          <T size={22} weight="bold" ls={-0.3} testID="belt-up-title">{word}</T>
          <T size={13} lh={19} c={color.muted} testID="belt-up-plain">
            {plain ?? 'Your calls resolved well enough to move a rung. It is a record of being right, not a prize.'}
          </T>
        </View>

        <View
          style={{
            paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.lg,
            borderWidth: 0.5, borderColor: alpha.ivory12, backgroundColor: alpha.ivory035,
          }}
        >
          <T size={11.5} lh={17} c={color.muted}>
            Belts move both ways. A run of calls that go against you takes the rung back.
          </T>
        </View>

        {onSeeBoard ? (
          <Button label="See the board" kind="volt" height={48} onPress={onSeeBoard} testID="belt-up-board" />
        ) : null}
        <Button label="Close" kind="ghost" height={42} onPress={onClose} testID="belt-up-close" />
      </View>
    </Sheet>
  );
}
