import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from './tokens';
import { family } from './fonts';
import { Mic, ArrowUp } from './Icons';
import { AttachButton, AttachmentTray, type Attachment } from './AttachmentTray';

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
  attachments,
  onAttach,
  onRemoveAttachment,
  attachLimit = 4,
}: {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  testID?: string;
  /**
   * Pictures, when this composer takes them. ABSENT BY DEFAULT and that is
   * deliberate: this component is also Kai's composer, and Kai does not take
   * photographs. Passing nothing draws no camera button at all.
   */
  attachments?: Attachment[];
  onAttach?: () => void;
  onRemoveAttachment?: (key: string) => void;
  attachLimit?: number;
}) {
  const [value, setValue] = useState('');
  const picked = attachments ?? [];
  const uploading = picked.some((a) => a.state === 'uploading');
  const ready = picked.filter((a) => a.state === 'ready');
  // A picture on its own is a post. Send stays dark while an upload is running,
  // because posting then would drop the photo the member is watching go up.
  const canSend = (value.trim().length > 0 || ready.length > 0) && !disabled && !uploading;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue('');
  };

  const pill = (
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

  // Without a picture handler this is exactly the component it always was:
  // the pill, on its own, with no wrapper and no extra button.
  if (!onAttach) return pill;

  return (
    <View>
      <AttachmentTray attachments={picked} onRemove={onRemoveAttachment} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AttachButton
          onPress={onAttach}
          disabled={disabled || picked.length >= attachLimit}
          limit={attachLimit}
        />
        <View style={{ flex: 1 }}>{pill}</View>
      </View>
    </View>
  );
}
