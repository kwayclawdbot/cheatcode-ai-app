import React from 'react';
import { View } from 'react-native';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { BELT_INK, BELT_LABEL, beltBorder, beltRank, beltTextInk } from './belts';
import type { Belt, BeltBlock } from '../../lib/types';

/**
 * The belt, as a chip you can put next to a name.
 *
 * A 3px bar in the belt's own colour, then the word. Nothing filled, nothing
 * rounded into a badge, no icon: the same restraint as `RoleChip` next door,
 * because these two sit on the same line and one of them shouting would make
 * the other look broken.
 *
 * THE BAR IS A REAL BELT COLOUR NOW. It used to be volt at five intensities —
 * the ladder was drawn entirely in one hue to keep it from colliding with the
 * palette — and five weights of the same yellow-green is not something anybody
 * reads as a rank. `belts.ts` explains how the collision is solved instead
 * (signal is lit, belt is dyed) and `belt` in `tokens.ts` holds the values.
 *
 * The WORD stays quiet ink at every rung, deliberately. The name beside this
 * chip is already in the belt's colour, and saying it twice in two type sizes
 * on one line is one statement too many; the chip's job is to be the thing you
 * read when you cannot separate five hues.
 */
export function BeltChip({ belt, label, testID }: { belt: Belt; label?: string | null; testID?: string }) {
  const word = label?.replace(/\s*belt$/i, '') || BELT_LABEL[belt];
  return (
    <View
      testID={testID ?? `belt-chip-${belt}`}
      accessibilityLabel={`${word} belt`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: radius.sm, borderWidth: 0.5, borderColor: beltBorder(belt),
      }}
    >
      <View style={{ width: 3, height: 9, borderRadius: 1.5, backgroundColor: BELT_INK[belt] }} />
      <T size={9} weight="bold" ls={0.4} c={beltTextInk(belt)}>{word.toUpperCase()}</T>
    </View>
  );
}

/**
 * The belt with the rest of the ladder under it — profile only.
 *
 * The bar is the DISTANCE LEFT, not a score, so it is drawn as a track with
 * five stops rather than a percentage meter. At black there is no track at
 * all: an empty bar under "Black belt" would read as a rank that has somehow
 * run out, rather than as the top of the ladder.
 */
export function BeltProgress({ block, testID }: { block: BeltBlock; testID?: string }) {
  const rank = beltRank(block.key);
  const pct = block.progress == null ? null : Math.round(block.progress * 100);
  return (
    <View testID={testID ?? 'belt-progress'} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BeltChip belt={block.key} label={block.label} />
        {block.next_label && block.next_at != null ? (
          <T size={11} c={color.muted} style={{ flex: 1 }}>
            {`${block.next_at} points for ${block.next_label.toLowerCase()}`}
          </T>
        ) : (
          <T size={11} c={color.muted} style={{ flex: 1 }}>The top of the ladder.</T>
        )}
      </View>

      {pct != null ? (
        <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`${pct}% toward ${block.next_label ?? 'the next belt'}`}>
          {BELT_ORDER_VIEW.map((b, i) => (
            <View
              key={b}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                backgroundColor: i < rank ? BELT_INK[b] : i === rank ? alpha.ivory16 : alpha.ivory06,
                overflow: 'hidden',
              }}
            >
              {i === rank ? (
                <View style={{ width: `${Math.max(4, pct)}%`, height: '100%', backgroundColor: BELT_INK[b] }} />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const BELT_ORDER_VIEW: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];
