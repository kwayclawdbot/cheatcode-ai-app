import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from './tokens';
import { family } from './fonts';
import { ArrowUp } from './Icons';
import { AttachmentTray, type Attachment } from './AttachmentTray';
import { ComposerActions, type ComposerAction } from './ComposerActions';

/**
 * Composer — artboard pill: 52px tall, `padding:0 6 0 16`, one 40px volt circle.
 *
 * THE CIRCLE IS ALWAYS SEND. It used to be a MICROPHONE while the field was
 * empty and a send arrow once you typed — one button wearing two icons, and
 * the microphone half was decoration: it was disabled, it ran the same
 * `submit`, and there is no speech-to-text anywhere in this app to run. So the
 * primary action of every composer read as "talk to me" and did nothing when
 * tapped. It is a send button now, in both states — lit when there is something
 * to post, dimmed and disabled when there is not.
 *
 * IF VOICE IS EVER BUILT, the microphone comes back deliberately and only where
 * it is real: beside Send on a KAI chat, once recording and transcription
 * actually exist. It does not come back as an icon.
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
  const router = useRouter();
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
        testID="composer-send"
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityHint={canSend ? undefined : 'Write something first.'}
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
        <ArrowUp size={16} color={color.bg} />
      </Pressable>
    </LinearGradient>
  );

  // Without a picture handler this is exactly the component it always was:
  // the pill, on its own, with no wrapper and no extra button. Kai's composer
  // takes this branch, which is why he grows neither a camera nor a + menu.
  if (!onAttach) return pill;

  /**
   * The + replaces the lone photograph button. Two named rows beat one
   * unlabelled glyph, and the picture row carries what the server will and will
   * not take BEFORE anything is picked rather than as a note afterwards.
   */
  const full = picked.length >= attachLimit;
  const actions: ComposerAction[] = [
    {
      id: 'photo',
      label: 'Add a picture',
      hint: full
        ? `You already have ${attachLimit}. Remove one to add another.`
        : `Up to ${attachLimit}. Pictures only — video is not accepted here. Location data is removed from every one.`,
      disabled: disabled || full,
      onPress: onAttach,
    },
    {
      id: 'call',
      label: 'Publish a call',
      hint: 'Entry, stop, target. It goes on your profile and gets scored.',
      disabled,
      onPress: () => router.push('/community/call/new'),
    },
  ];

  return (
    <View>
      <AttachmentTray attachments={picked} onRemove={onRemoveAttachment} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ComposerActions actions={actions} disabled={disabled} />
        <View style={{ flex: 1 }}>{pill}</View>
      </View>
    </View>
  );
}
