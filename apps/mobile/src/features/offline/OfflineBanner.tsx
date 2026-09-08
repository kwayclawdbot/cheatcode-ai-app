/**
 * "Offline · Last updated 8:42 AM" — the recovery board's gold banner.
 *
 * Two facts and one action, in that order, because that is the order somebody
 * standing on a train needs them: I am not connected · what you are looking at
 * is from 8:42 · here is the button. Gold, not red: being offline is a
 * condition, not a fault, and red is reserved for prices that have gone stale
 * enough to be dangerous.
 *
 * IT DRAWS NOTHING WHILE THE ANSWER IS UNKNOWN. `useConnectivity` reports
 * `undefined` until NetInfo's first callback, and a banner that flashes for
 * 200ms on every cold start is a banner members learn to ignore.
 *
 * The timestamp is not optional furniture. A cached screen with no "as of" is
 * indistinguishable from a live one, which is the same fabrication
 * `FreshnessMark` refuses next to a price — so a caller that has remembered
 * data is expected to pass `at`, and one that has none passes null and gets a
 * banner that says only that it cannot reach anything.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../../ui/Text';
import { CapabilityMark, updatedAtLabel } from '../../ui/CapabilityState';
import { alpha, color, radius } from '../../ui/tokens';

export function OfflineBanner({
  online, fetchedAt, onRetry, retrying = false, testID = 'offline-banner',
}: {
  /** undefined = not known yet, and nothing is drawn. */
  online: boolean | undefined;
  /** Epoch ms the visible data was actually fetched, when any of it was. */
  fetchedAt?: number | null;
  onRetry?: () => void;
  retrying?: boolean;
  testID?: string;
}) {
  if (online !== false) return null;
  const stamp = updatedAtLabel(fetchedAt ?? null);

  return (
    <View
      testID={testID}
      accessibilityLabel={`Offline. ${stamp ?? 'Nothing saved for this screen.'}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 13,
        borderRadius: radius.xl,
        borderWidth: 0.5,
        borderColor: alpha.gold40,
        backgroundColor: alpha.gold14,
      }}
    >
      <CapabilityMark state="offline" size={17} />
      <T size={13} weight="semibold" c={color.gold} style={{ flex: 1 }}>
        {stamp ? `Offline · ${stamp}` : 'Offline · nothing saved for this screen'}
      </T>
      {onRetry ? (
        <Pressable
          testID="offline-retry"
          accessibilityRole="button"
          accessibilityLabel="Retry connection"
          onPress={onRetry}
          disabled={retrying}
          style={({ pressed }) => ({
            paddingVertical: 6,
            paddingHorizontal: 11,
            borderRadius: radius.pill,
            borderWidth: 0.5,
            borderColor: alpha.gold40,
            opacity: pressed || retrying ? 0.6 : 1,
          })}
        >
          <T size={12} weight="bold" c={color.gold}>{retrying ? 'Trying…' : 'Retry'}</T>
        </Pressable>
      ) : null}
    </View>
  );
}
