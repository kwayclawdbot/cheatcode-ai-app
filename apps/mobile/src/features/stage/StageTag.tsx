/**
 * The readiness-stage tag (0042) — the smallest thing on a member's line.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A WORD AND NOT A CHIP
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's community identity already has a primary mark, and it is the
 * BELT: `MemberName` renders the name itself in the belt's ink, so the belt is
 * not beside the name, it IS the name. Anything else on that line is competing
 * with it, and the owner's instruction is explicit that the belt stays primary
 * and the stage is quiet.
 *
 * So this deliberately does NOT copy `RoleChip`, which is the obvious thing to
 * copy and would be wrong: a chip has a border, a background and a shape, and
 * two bordered chips beside a coloured name is three marks arguing. This is a
 * small tracked word in the dim ink — present, legible, and outranked by
 * everything around it.
 *
 * ALL THREE STAGES USE THE SAME INK, on purpose. Giving `trade_ready` a
 * brighter colour would turn the tag into a status symbol and put it back into
 * competition with the belt, and it would make `beginner` read as the dull
 * version of a thing other people have — which is exactly the feeling the
 * Beginners room exists to prevent. The word carries the meaning; the styling
 * carries none.
 *
 * It is NOT tappable. `MemberName` renders as a real <button> on web and one
 * button cannot contain another, so a pressable tag would have to be a sibling
 * and would then be a second target on a line whose whole job is to open one
 * profile. The stage is explained on the profile it takes you to.
 */
import React from 'react';
import { View } from 'react-native';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import type { Stage } from '../../lib/types';
import { STAGE_LABEL } from './labels';

export function StageTag({
  stage,
  testID,
}: {
  stage: Stage | null | undefined;
  testID?: string;
}) {
  // A profile from an API build that predates 0042 has no stage. Drawing
  // "Beginner" for somebody the server never described would be inventing a
  // fact about them, so draw nothing.
  if (!stage) return null;

  return (
    <View
      // The tag is decoration on a line that already announces the member by
      // name; a screen reader that read "Jordan, Beginner" as two separate
      // things would be repeating the same person twice. The label says what
      // the word means instead of just saying the word.
      accessibilityLabel={`Readiness stage: ${STAGE_LABEL[stage]}`}
      testID={testID}
    >
      <T size={9} weight="bold" ls={0.6} c={color.dim}>
        {STAGE_LABEL[stage].toUpperCase()}
      </T>
    </View>
  );
}
