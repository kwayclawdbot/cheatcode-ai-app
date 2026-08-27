import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from '../../../ui/tokens';
import { family } from '../../../ui/fonts';
import { T } from '../../../ui/Text';
import { Plus } from '../../../ui/Icons';
import { Send } from './Icons';

/**
 * Room composer (V3-C1 / S81): 52px pill, @Kai chip on the left, one volt
 * circle on the right. The artboard's right circle is a mic; voice is not in
 * this release, so the circle is the SEND action — one dominant affordance,
 * volt because it is the user's.
 *
 * "Post an idea" (the structured composer) is the secondary + button: a
 * casual message must stay the easy path (08 §7).
 */
export function RoomComposer({
  roomLabel, onSend, onKai, onStructured, disabled, disabledReason, testID,
}: {
  roomLabel: string;
  onSend: (text: string) => void;
  onKai: () => void;
  onStructured: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  testID?: string;
}) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <View style={{ gap: 8 }} testID={testID ?? 'room-composer'}>
      {disabled && disabledReason ? (
        <T size={11} c={color.gold} style={{ paddingHorizontal: 4 }}>{disabledReason}</T>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          testID="composer-structured"
          accessibilityRole="button"
          accessibilityLabel="Post an idea"
          accessibilityHint="Opens the structured composer: thesis, entry, invalidation, risk, target, evidence."
          disabled={disabled}
          onPress={onStructured}
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: 22,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 0.5, borderColor: alpha.ivory24,
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          })}
        >
          <Plus size={16} color={color.text} />
        </Pressable>

        <LinearGradient
          colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
          start={gradientAngle.start}
          end={gradientAngle.end}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
            height: 52, paddingLeft: 8, paddingRight: 6,
            borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20,
          }}
        >
          <Pressable
            testID="composer-kai"
            accessibilityRole="button"
            accessibilityLabel="Ask Kai in this room"
            accessibilityHint="Summarise, verify a claim, mark levels, turn an idea into an alert, compare, or explain."
            disabled={disabled}
            onPress={onKai}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={({ pressed }) => ({
              paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill,
              borderWidth: 0.5, borderColor: alpha.violet50, backgroundColor: alpha.violet14,
              opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
            })}
          >
            <T size={11} weight="bold" c={color.violetLight}>@Kai</T>
          </Pressable>

          <TextInput
            testID="composer-input"
            accessibilityLabel={`Message ${roomLabel}`}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            editable={!disabled}
            placeholder={`Message ${roomLabel}…`}
            placeholderTextColor={color.muted}
            returnKeyType="send"
            style={{
              flex: 1,
              fontFamily: family.regular,
              fontSize: 14,
              color: color.text,
              ...(({ outlineStyle: 'none' } as unknown) as object),
            }}
          />

          <Pressable
            testID="composer-send"
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={submit}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: color.volt,
              alignItems: 'center', justifyContent: 'center',
              opacity: canSend ? (pressed ? 0.82 : 1) : 0.55,
            })}
          >
            <Send size={15} color={color.bg} />
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}
