import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from './tokens';
import { family } from './fonts';
import { Mic, ArrowUp } from './Icons';

/**
 * Composer — artboard pill: 52px tall, `padding:0 6 0 16`, one 40px volt circle.
 * Voice is not in this slice: with an empty field the circle is the MIC and is
 * disabled with an accessibility hint; as soon as there is text it becomes SEND.
 * That keeps the artboard's single-affordance geometry and still ships a real
 * send button.
 */
export function Composer({
  placeholder = 'Ask Kai…',
  onSend,
  disabled = false,
  testID,
}: { placeholder?: string; onSend?: (text: string) => void; disabled?: boolean; testID?: string }) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue('');
  };

  return (
    <LinearGradient
      testID={testID ?? 'composer'}
      colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 52,
        paddingLeft: 16,
        paddingRight: 6,
        borderRadius: radius.pill,
        borderWidth: 0.5,
        borderColor: alpha.ivory20,
      }}
    >
      <TextInput
        testID="composer-input"
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        editable={!disabled}
        returnKeyType="send"
        style={{
          flex: 1,
          fontFamily: family.regular,
          fontSize: 14,
          color: color.text,
          // RN-web puts a focus ring on inputs; the pill is the affordance
          ...(({ outlineStyle: 'none' } as unknown) as object),
        }}
      />
      <Pressable
        testID={canSend ? 'composer-send' : 'composer-mic'}
        accessibilityRole="button"
        accessibilityLabel={canSend ? 'Send to Kai' : 'Voice input'}
        accessibilityHint={canSend ? undefined : 'Talking to Kai is not available yet — type your question instead.'}
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color.volt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: canSend ? (pressed ? 0.82 : 1) : 0.55,
        })}
      >
        {canSend ? <ArrowUp size={16} color={color.bg} /> : <Mic size={16} color={color.bg} />}
      </Pressable>
    </LinearGradient>
  );
}
