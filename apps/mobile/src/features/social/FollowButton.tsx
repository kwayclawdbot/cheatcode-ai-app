import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { useFollow } from './useSocial';
import type { FollowState } from '../../lib/types';

/**
 * FOLLOW — THE ONE CONTROL, EVERYWHERE IT APPEARS.
 *
 * Volt when you do not follow them yet, because following is YOUR action and
 * volt is the user's colour. Quiet outline once you do: the loud state is the
 * offer, and a button that stays loud after you have taken it is asking for
 * something you already gave. "Following" also reads as a statement of fact
 * rather than a button labelled with its own opposite, which is the classic
 * way this control confuses people.
 *
 * NEVER PUT THIS INSIDE ANOTHER PRESSABLE. On web react-native renders
 * `accessibilityRole="button"` as a real `<button>` and one cannot legally
 * contain another; the author lines that carry it place it as a SIBLING of the
 * name's pressable, not a child. This is the same rule that keeps MediaStrip
 * outside the message body in `community/ui/Message.tsx`.
 */
export function FollowButton({
  userId, initial, compact = false, onChanged, testID,
}: {
  userId: string;
  /** The state the surrounding payload already carried — saves a request. */
  initial?: FollowState | null;
  /** The author-line size: 26px tall, no growth. */
  compact?: boolean;
  onChanged?: (following: boolean) => void;
  testID?: string;
}) {
  const follow = useFollow(userId, initial);
  const on = follow.following;

  const height = compact ? 26 : 40;
  const label = on ? 'Following' : 'Follow';

  return (
    <View style={compact ? undefined : { gap: 5 }}>
      <Pressable
        testID={testID ?? `follow-${userId}`}
        accessibilityRole="button"
        accessibilityLabel={on ? `Following. Unfollow.` : 'Follow'}
        accessibilityState={{ selected: on, busy: follow.busy }}
        disabled={follow.busy}
        onPress={async () => { onChanged?.(await follow.toggle()); }}
        hitSlop={compact ? { top: 9, bottom: 9, left: 6, right: 6 } : { top: 2, bottom: 2 }}
        style={({ pressed }) => ({
          height,
          minWidth: compact ? 74 : undefined,
          paddingHorizontal: compact ? 11 : 18,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          ...(on
            ? { borderWidth: 0.5, borderColor: alpha.ivory24, backgroundColor: 'transparent' }
            : compact
              // In a dense author line a filled volt pill would be the loudest
              // thing on the row — louder than the post. Volt on volt-tint.
              ? { borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10 }
              : { backgroundColor: color.volt }),
          // 0.97 on press: the control confirms it heard you before the
          // network does, which is most of what "responsive" means here.
          transform: [{ scale: pressed && !follow.busy ? 0.97 : 1 }],
          opacity: follow.busy ? 0.6 : 1,
        })}
      >
        {follow.busy ? (
          <ActivityIndicator size="small" color={on ? color.muted : compact ? color.volt : color.bg} />
        ) : (
          <T
            size={compact ? 11.5 : 14}
            weight={on ? 'semibold' : 'bold'}
            c={on ? color.muted : compact ? color.volt : color.bg}
          >
            {label}
          </T>
        )}
      </Pressable>

      {/* The server's refusal, where it happened. Never a toast on another
          screen, and never silence. */}
      {!compact && follow.error ? (
        <T size={11} c={color.red} testID={`follow-error-${userId}`}>{follow.error}</T>
      ) : null}
    </View>
  );
}
