/**
 * Stack chrome for the feed's own screens (a thread, the composer): a 44×44
 * back, a title, and at most one trailing control. Same row height as the kit
 * AppBar so moving from the tab into a thread does not make the header jump.
 */
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../../ui/Text';
import { alpha, color, layout, radius, tap, typeScale } from '../../../ui/tokens';
import { family } from '../../../ui/fonts';
import { useTextScale } from '../../a11y/context';
import { BackIcon, ImageIcon, SendIcon } from './icons';

export function FeedStackHeader({ title, subtitle, onBack, leading, right, testID }: {
  title: string; subtitle?: string | null; onBack: () => void;
  /** A mark between the back arrow and the title — a room's own picture. */
  leading?: React.ReactNode;
  right?: React.ReactNode; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      accessibilityRole="header"
      style={{
        paddingTop: Math.max(insets.top, 12), paddingHorizontal: layout.gutter - 12, minHeight: 60,
        flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: alpha.divider,
        paddingBottom: 6,
      }}
    >
      <Pressable
        testID="stack-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}
      >
        <BackIcon />
      </Pressable>
      {leading ? <View style={{ marginRight: 6 }}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="cardTitle" numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="meta" c={color.textSecondary} numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * The reply bar under a thread: a picture, the words, an orange send. Send is
 * dim until there is something to send, and it is the only orange thing here.
 */
export function ReplyBar({
  value, onChange, onSend, onAttach, busy, placeholder = 'Post your reply…', autoFocus, testID = 'reply-bar',
}: {
  value: string; onChange: (s: string) => void; onSend: () => void; onAttach?: () => void;
  busy?: boolean; placeholder?: string; autoFocus?: boolean; testID?: string;
}) {
  const scale = useTextScale();
  const ready = value.trim().length > 0 && !busy;
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      {onAttach ? (
        <Pressable
          testID={`${testID}-image`}
          accessibilityRole="button"
          accessibilityLabel="Add a picture"
          onPress={onAttach}
          style={{ width: tap.min, height: tap.min, alignItems: 'center', justifyContent: 'center' }}
        >
          <ImageIcon />
        </Pressable>
      ) : null}
      <View
        style={{
          flex: 1, minHeight: tap.min, borderRadius: radius.xxxl, borderWidth: 1, borderColor: alpha.border,
          backgroundColor: color.surface, paddingHorizontal: 14, justifyContent: 'center',
        }}
      >
        <TextInput
          testID={`${testID}-input`}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={color.textSecondary}
          multiline
          numberOfLines={1}
          autoFocus={autoFocus}
          style={{
            color: color.textPrimary, fontFamily: family.regular,
            fontSize: typeScale.body.size * scale, lineHeight: typeScale.body.lh * scale,
            paddingVertical: 10, maxHeight: 120, outlineStyle: 'none',
          } as never}
        />
      </View>
      <Pressable
        testID={`${testID}-send`}
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={onSend}
        style={{
          width: tap.min, height: tap.min, borderRadius: tap.min / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: ready ? color.action : alpha.action14,
        }}
      >
        <SendIcon c={ready ? color.onAction : color.action} />
      </Pressable>
    </View>
  );
}
