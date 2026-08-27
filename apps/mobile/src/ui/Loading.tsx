import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { color } from './tokens';
import { T } from './Text';

/**
 * The screen is still asking, so it must not answer.
 *
 * Rendering an empty state while a request is in flight tells the user
 * "your watchlist is empty" when the truth is "I don't know yet" — the same
 * class of lie the freshness rules exist to prevent. Every list screen shows
 * this until the first answer lands.
 */
export function ScreenLoading({ label, testID }: { label?: string; testID?: string }) {
  return (
    <View testID={testID ?? 'loading'} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <ActivityIndicator color={color.violet} />
      {label ? <T size={12} c={color.muted}>{label}</T> : null}
    </View>
  );
}

/**
 * An endpoint this build's API does not serve yet.
 * Says so plainly instead of showing sample numbers that would read as the
 * user's own money, memory or plan.
 */
export function NotConnected({ what, testID }: { what: string; testID?: string }) {
  return (
    <View
      testID={testID ?? 'not-connected'}
      style={{
        borderWidth: 0.5,
        borderColor: 'rgba(255,247,232,0.12)',
        borderRadius: 16,
        padding: 18,
        gap: 7,
      }}
    >
      <T size={14} weight="bold">{`${what} isn't live yet`}</T>
      <T size={12.5} lh={19} c={color.muted}>
        This part of the service is still being connected. Nothing is missing from your account — there is just
        nothing for Kai to show here until it is.
      </T>
    </View>
  );
}
