import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from '../../../ui/tokens';
import { family } from '../../../ui/fonts';
import { T } from '../../../ui/Text';
import { Plus } from '../../../ui/Icons';
import { Send } from './Icons';
import { AttachButton, AttachmentTray, type Attachment } from '../../../ui/AttachmentTray';

export type { Attachment };

export function RoomComposer({
  roomLabel, onSend, onKai, onStructured, disabled, disabledReason, testID,
  attachments = [], onAttach, onRemoveAttachment, attachLimit = 4, placeholder,
}: {
  roomLabel: string;
  onSend: (text: string) => void;
  onKai: () => void;
  onStructured: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  testID?: string;
  /** Pictures already picked. Absent means this composer takes no pictures. */
  attachments?: Attachment[];
  onAttach?: () => void;
  onRemoveAttachment?: (key: string) => void;
  attachLimit?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');

  const uploading = attachments.some((a) => a.state === 'uploading');
  const ready = attachments.filter((a) => a.state === 'ready');
  // A PICTURE ON ITS OWN IS A POST. Requiring a caption so the validator is
  // satisfied just produces "." — so Send lights up for text OR for a picture.
  // It stays dark while an upload is still going: posting then would drop the
  // photo the member is watching upload, which is the worst of both.
  const canSend = (value.trim().length > 0 || ready.length > 0) && !disabled && !uploading;
  const canAttach = !!onAttach && !disabled && attachments.length < attachLimit;

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

      <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onAttach ? (
          <AttachButton onPress={onAttach} disabled={!canAttach} limit={attachLimit} />
        ) : null}

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
            placeholder={placeholder ?? `Message ${roomLabel}…`}
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
