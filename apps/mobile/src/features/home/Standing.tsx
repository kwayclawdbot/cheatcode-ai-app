/**
 * "NOTHING NEEDS A DECISION" — and the reason that is allowed to be said.
 *
 * The quiet-market board is one moon, one sentence and a time: *Nothing needs a
 * decision. Your watchlist is up to date. Last checked 8:42 AM.* Every part of
 * that is a claim about work somebody did, and until this wave the app could
 * not back any of it. It could only show an empty screen, which is what a
 * failed request also looks like.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SO THIS CARD DRAWS TWO DIFFERENT THINGS AND NEVER BLURS THEM (audit F18)
 * ─────────────────────────────────────────────────────────────────────────────
 *   quiet        the server checked your setups, your alerts, your positions
 *                and your planned trades, and every one of them answered and
 *                came back empty. The moon, the calm sentence, the timestamp,
 *                and the list of what was actually looked at — which is the
 *                evidence for the sentence and the reason it can be believed.
 *
 *   unverified   at least one of those reads failed. The sentence names which,
 *                the mark is a failure mark, and there is a retry. It does NOT
 *                say your list is clear, because nobody managed to look at all
 *                of it. F18's acceptance test is precisely this: "a failed load
 *                cannot be mistaken for a verified empty list."
 *
 * Nothing here writes its own sentence — `standing.plain` comes from the server
 * (`lib/v5/standing.ts`), which is the only party that knows which reads
 * answered. This owns the shape, the mark and the timestamp.
 *
 * ── WHAT IS DELIBERATELY MISSING ─────────────────────────────────────────────
 * The board draws a flat sparkline captioned "Markets are quiet today". There
 * is no index series behind this screen — `/home` carries a session, not a
 * market-wide line — so drawing one would be inventing price action to
 * illustrate a mood. The session sentence Kai already writes says the same
 * thing and is true.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { CapabilityMark, CapabilityNotice, updatedAtLabel } from '../../ui/CapabilityState';
import { alpha, color, radius } from '../../ui/tokens';
import type { HomeStanding } from '@cheatcode/shared';

/** "your setups, your alerts and your open positions" — the evidence, in words. */
export function checkedPlain(standing: HomeStanding): string | null {
  const answered = standing.checks.filter((c) => c.ok).map((c) => c.label);
  if (!answered.length) return null;
  const list = answered.length === 1
    ? answered[0]
    : `${answered.slice(0, -1).join(', ')} and ${answered[answered.length - 1]}`;
  return `I went through ${list}.`;
}

export function StandingCard({
  standing, onRetry, children, testID = 'home-standing',
}: {
  standing: HomeStanding;
  onRetry?: () => void;
  /** The quiet day's offer — a short practice, drawn only when it is quiet. */
  children?: React.ReactNode;
  testID?: string;
}) {
  const stamp = updatedAtLabel(standing.checked_at, 'Last checked');

  if (standing.state === 'unverified') {
    return (
      <CapabilityNotice
        state="failed"
        plain={standing.plain}
        detail={checkedPlain(standing)}
        at={stamp}
        onRetry={onRetry}
        retryLabel="Check again"
        testID={`${testID}-unverified`}
      />
    );
  }

  // `needs_you` is not this card's job — the priority object is already on
  // screen saying it, and a second panel repeating it would be the stacking
  // Home was rebuilt to stop.
  if (standing.state !== 'quiet') return null;

  return (
    <ObjectCard testID={`${testID}-quiet`} r={radius.xxxl} style={{ padding: 15, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
        <View style={{ paddingTop: 2 }}><CapabilityMark state="quiet" size={20} /></View>
        <View style={{ flex: 1, gap: 5 }}>
          <T size={15} lh={21} testID="standing-plain">{standing.plain}</T>
          {stamp ? <T size={12} c={color.dim} testID="standing-checked-at">{stamp}</T> : null}
        </View>
      </View>

      {/* The evidence for the sentence above it. Without this the calm line is
          just a mood; with it, it is a report. */}
      {checkedPlain(standing) ? (
        <View style={{ gap: 6, paddingTop: 2, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
          <Eyebrow>WHAT I CHECKED</Eyebrow>
          <T size={12} lh={18} c={color.muted} testID="standing-checked">{checkedPlain(standing)}</T>
        </View>
      ) : null}

      {children}
    </ObjectCard>
  );
}

/**
 * "Review watchlist" — the quiet day's second offer, under the practice.
 *
 * A link, not a button: the practice above it is the thing being suggested and
 * two volt buttons side by side is two primary actions, which is none.
 */
export function ReviewWatchlist({ onPress, testID = 'standing-watchlist' }: { onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Review watchlist"
      onPress={onPress}
      style={({ pressed }) => ({ paddingVertical: 10, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <T size={13} weight="semibold" c={color.muted}>Review watchlist  →</T>
    </Pressable>
  );
}
