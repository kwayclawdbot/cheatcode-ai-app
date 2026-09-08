import React, { useEffect, useRef, useState } from 'react';
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
 *
 * ---------------------------------------------------------------------------
 * THE CIRCLE IS STOP WHILE KAI IS TALKING (audit F05).
 *
 * The old contract was: clear the field on send, then disable it until the
 * answer finished, and offer no way to end the answer. Two things came out of
 * that. People sat watching a reply they had already stopped wanting with no
 * control to press — the audit's word is "trapped". And a request that failed
 * took the typing with it, so the member had to write it again from memory.
 *
 * So: pass `streaming` and `onStop` and the send circle becomes a stop square,
 * the field stays editable, and the member is never without a control. Pass
 * `draft` (bumping `draftNonce`) and the words of a failed turn come back into
 * the field exactly as they were typed. Neither prop is required — the club
 * composer and the Kai sheet take this component unchanged.
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
  streaming = false,
  onStop,
  draft,
  draftNonce = 0,
}: {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  testID?: string;
  /**
   * Kai is answering. With `onStop` the circle becomes Stop; without it this
   * only dims Send, and the caller is expected to be passing `disabled` too.
   */
  streaming?: boolean;
  onStop?: () => void;
  /**
   * Words to put back in the field — a turn that never reached the server.
   * `draftNonce` is what lets the SAME text be restored twice; without it a
   * second failure of the same question would restore nothing.
   */
  draft?: string;
  draftNonce?: number;
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
  const stoppable = streaming && !!onStop;
  // A picture on its own is a post. Send stays dark while an upload is running,
  // because posting then would drop the photo the member is watching go up.
  const canSend = (value.trim().length > 0 || ready.length > 0) && !disabled && !uploading && !streaming;

  /**
   * Restoring a failed turn must never overwrite something the member has
   * started typing since — they have moved on, and their words win. An EMPTY
   * `draft` on a nonce bump is the other half of the same channel: it means the
   * caller has taken the restored words back (Home's "Send that again" resends
   * them), so leaving a copy in the field would post the question twice.
   */
  const restored = useRef(draftNonce);
  useEffect(() => {
    if (draftNonce === restored.current || draft === undefined) return;
    restored.current = draftNonce;
    if (draft === '') setValue('');
    else if (!value.trim()) setValue(draft);
    // `value` is read, not tracked: a keystroke is not a reason to re-restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce, draft]);

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue('');
  };

  const press = () => { if (stoppable) { onStop?.(); return; } submit(); };

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
        // The testID stays `composer-send` in both states because it is the
        // same control in the same place, and six signed-off proof runs locate
        // it by that name. The STATE is on the label and on the glyph below.
        testID="composer-send"
        accessibilityRole="button"
        accessibilityLabel={stoppable ? 'Stop' : 'Send'}
        accessibilityHint={
          stoppable ? 'Ends the answer Kai is writing.' : canSend ? undefined : 'Write something first.'
        }
        accessibilityState={{ disabled: !stoppable && !canSend }}
        disabled={!stoppable && !canSend}
        onPress={press}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color.volt,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: stoppable || canSend ? (pressed ? 0.82 : 1) : 0.55,
        })}
      >
        {/* A square, because that is what stop has meant on every player and
            every recorder the member has ever used. */}
        {stoppable
          ? <View testID="composer-stop" style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color.bg }} />
          : <ArrowUp size={16} color={color.bg} />}
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
