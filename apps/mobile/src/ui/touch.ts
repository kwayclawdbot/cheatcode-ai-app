import type { Insets } from 'react-native';
import { tap } from './tokens';

/**
 * THE 44×44 RULE, AS ARITHMETIC.
 *
 * The spec: "every interactive control meets a 44px touch target". A control
 * may LOOK smaller — a 32px bookmark, a 28px chip — as long as the box a finger
 * can hit is not. `hitSlopFor(w, h)` returns exactly the slop that grows a
 * `w × h` visual to at least 44 × 44, split evenly on both sides, so nobody has
 * to do this sum by hand (or guess it and land on 43).
 *
 *   <Pressable hitSlop={hitSlopFor(32, 32)} style={{ width: 32, height: 32 }} />
 *
 * `scripts/touch-target-test.mts` scans every Pressable in src/ and fails when
 * one declares a fixed size under 44 without a hitSlop that makes up the rest.
 */
export function hitSlopFor(width: number, height: number = width): Insets {
  const dx = Math.max(0, Math.ceil((tap.min - width) / 2));
  const dy = Math.max(0, Math.ceil((tap.min - height) / 2));
  return { top: dy, bottom: dy, left: dx, right: dx };
}

/** The minimum box, for a control that can simply be drawn at full size. */
export const minTarget = { minWidth: tap.min, minHeight: tap.min } as const;
