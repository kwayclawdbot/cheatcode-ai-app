import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { beltInk } from './belts';
import { secondaryHandle } from './naming';
import type { Belt } from '../../lib/types';

/**
 * A MEMBER'S NAME. ONE COMPONENT, EVERYWHERE.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Before this, a name was written out by hand on nine surfaces, and the nine
 * had already drifted into three different behaviours: on the alerts board the
 * name opened a profile, on a call card only the AVATAR did and the name next
 * to it was dead, and on the club board nothing was tappable at all because
 * the component was never given an `onOpenAuthor` prop to begin with. A member
 * cannot learn a rule that is only true two-thirds of the time — they tap a
 * name, nothing happens, and they stop tapping names anywhere.
 *
 * So the rule is now carried by a component rather than by nine memories:
 * **a member's name is always a door to that member, and always wears their
 * belt.** Add a surface that names somebody, use this, and both are true for
 * free.
 *
 * ── WHEN IT IS NOT A DOOR ──────────────────────────────────────────────────
 * `userId` is optional and the affordance follows it honestly. Two surfaces
 * genuinely cannot link: a circle message carries `author` as a bare string
 * with no id behind it, and a quote block carries `author_name` for the same
 * reason. Those render as plain text — not as a Pressable that goes nowhere,
 * which is worse than no affordance, because it teaches the member that names
 * sometimes silently fail.
 *
 * ── THE COLOUR ─────────────────────────────────────────────────────────────
 * `belt` is optional too, and absent means white — the house ivory, which is
 * what every name was before belts had colours. Room messages do not carry a
 * belt on the wire yet, so they get the default rather than a wrong rung.
 * Guessing a rank is worse than not showing one.
 */
export function MemberName({
  name,
  userId,
  belt,
  handle,
  size = 13,
  weight = 'bold',
  showHandle = false,
  handleSize,
  numberOfLines = 1,
  suffix,
  testID,
}: {
  name: string;
  /** Absent = the surface has no id for this person, so the name is not a door. */
  userId?: string | null;
  /** Absent = white, the ink every name had before the ladder had colours. */
  belt?: Belt | null;
  handle?: string | null;
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Draws `@handle` beside the name, suppressed when it would merely repeat it. */
  showHandle?: boolean;
  handleSize?: number;
  numberOfLines?: number;
  /** Anything that belongs on the name's own line — a belt chip, a time. */
  suffix?: React.ReactNode;
  testID?: string;
}) {
  const router = useRouter();
  const ink = beltInk(belt ?? 'white');
  const at = showHandle ? secondaryHandle(name, handle) : null;

  const label = (
    <>
      <T size={size} weight={weight} c={ink} numberOfLines={numberOfLines} testID={testID}>
        {name}
      </T>
      {at ? (
        <T size={handleSize ?? Math.max(10, size - 2.5)} c={color.dim} numberOfLines={1}>
          {at}
        </T>
      ) : null}
      {suffix}
    </>
  );

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const, minWidth: 0 };

  if (!userId) return <View style={row}>{label}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s profile`}
      onPress={() => router.push(`/contributor/${encodeURIComponent(userId)}` as never)}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}
    >
      {label}
    </Pressable>
  );
}
