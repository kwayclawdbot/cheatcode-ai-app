import React from 'react';
import { View } from 'react-native';
import { color } from './tokens';
import { T } from './Text';
import type { DelayReason } from '../lib/types';
import { whenPlain } from '../lib/when';
import { decayFreshness } from '../lib/freshness-decay';
import { useCoarseNow } from '../lib/clock-tick';

export type Freshness = 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';

/**
 * Freshness is mandatory next to every price (UX spec §10 "Live reliability").
 * Status = label + SHAPE + colour — never colour alone:
 *   live    filled circle  cyan
 *   delayed ring           gold
 *   stale   square         red
 *   closed  bar            muted
 */
const SPEC: Record<Freshness, { label: string; c: string; shape: 'dot' | 'ring' | 'square' | 'bar' }> = {
  live: { label: 'Live', c: color.cyan, shape: 'dot' },
  delayed: { label: 'Delayed', c: color.gold, shape: 'ring' },
  stale: { label: 'Stale', c: color.red, shape: 'square' },
  closed: { label: 'Market closed', c: color.muted, shape: 'bar' },
  unknown: { label: 'No data', c: color.muted, shape: 'bar' },
};

export function FreshnessDot({ freshness, size = 6 }: { freshness: Freshness; size?: number }) {
  const s = SPEC[freshness];
  if (s.shape === 'ring') {
    return <View style={{ width: size + 1, height: size + 1, borderRadius: (size + 1) / 2, borderWidth: 1.5, borderColor: s.c }} />;
  }
  if (s.shape === 'square') {
    return <View style={{ width: size, height: size, backgroundColor: s.c }} />;
  }
  if (s.shape === 'bar') {
    return <View style={{ width: size + 2, height: 2, borderRadius: 1, backgroundColor: s.c }} />;
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: s.c }} />;
}

/**
 * Round-2 rule (build brief): when the plan/entitlement is the only reason a
 * price is not live, the server sends freshness 'delayed' with
 * delay_reason:'entitlement'. That must read as "Delayed 15m" — never as
 * stale — and it must never disable an action.
 *
 * `at` is the instant the price happened. When it is known the word is
 * followed by the time, because "Delayed" alone cannot separate a 15:59 print
 * from a Friday close and the user should never have to work that out. The
 * word still stands on its own when no timestamp came with the quote — an
 * unlabelled time would be worse than none.
 *
 * ── THE LABEL DECAYS ─────────────────────────────────────────────────────────
 * The server's word is about the moment it answered, not about now. This used
 * to trust that word forever, which is how a quote fetched at 9:31 sat under a
 * green "Live · 9:31 AM" at two in the afternoon. `decayFreshness` recomputes
 * the word from `at` against the clock and may only ever make it WORSE — the
 * server's `delayed`, `stale` and `market_closed` all stand, because it knows
 * about entitlements and feed gaps and this side does not. See
 * `src/lib/freshness-decay.ts` for the rule and what it refuses to touch.
 *
 * `now` exists so a caller can pass the shared coarse clock (and so the test
 * can pass a fixed instant); it defaults to the real one.
 */
export function resolveFreshness(
  freshness: Freshness | undefined,
  reason?: DelayReason | null,
  at?: string | null,
  now: number = Date.now(),
): { freshness: Freshness; label: string } {
  const when = whenPlain(at, new Date(now));
  const stamp = (base: string) => (when ? `${base} · ${when}` : base);
  if (reason === 'seed') return { freshness: freshness ?? 'delayed', label: stamp('Sample data') };
  if (reason === 'entitlement') return { freshness: 'delayed', label: stamp('Delayed 15m') };
  if (reason === 'market_closed') return { freshness: freshness ?? 'delayed', label: stamp('Market closed') };
  const f = decayFreshness(freshness, reason, at, { now });
  // A stale mark names the last real print rather than the failure, because
  // "last seen 2:14 PM" is the fact and "Stale" is only the verdict on it.
  if (f === 'stale' && when) return { freshness: f, label: `No new data · last ${when}` };
  return { freshness: f, label: stamp(SPEC[f].label) };
}

export function FreshnessMark({
  freshness, label, size = 11, testID, delayReason, at,
}: {
  freshness: Freshness;
  label?: string;
  size?: number;
  testID?: string;
  delayReason?: DelayReason | null;
  /** The quote's `source_ts` — the instant the price actually happened. */
  at?: string | null;
}) {
  /**
   * The mark redraws on the shared 30-second clock, because a label that decays
   * without re-rendering decays only in theory. One interval serves every mark
   * on screen and it stops when the app is not in front of anybody.
   */
  const now = useCoarseNow();
  const resolved = resolveFreshness(freshness, delayReason, at, now);
  const s = SPEC[resolved.freshness];
  const text = label ?? resolved.label;
  return (
    <View
      testID={testID}
      accessibilityLabel={`Data ${text.toLowerCase()}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      <FreshnessDot freshness={resolved.freshness} />
      <T size={size} c={s.c}>{text}</T>
    </View>
  );
}
