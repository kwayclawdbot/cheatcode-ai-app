import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle, radius } from '../../../ui/tokens';
import { family } from '../../../ui/fonts';
import { T } from '../../../ui/Text';
import { Send } from './Icons';
import { AttachmentTray, type Attachment } from '../../../ui/AttachmentTray';
import { ComposerActions, type ComposerAction } from '../../../ui/ComposerActions';
import { QuoteBlock } from './Social';
import type { MessageQuote } from '../types';

export type { Attachment };

export function RoomComposer({
  roomLabel, onSend, onKai, onStructured, disabled, disabledReason, testID,
  attachments = [], onAttach, onRemoveAttachment, attachLimit = 4, placeholder,
  quote, quoteLabel, onClearQuote, onPublishCall, onAskKai, callSymbol,
  draft, draftNonce = 0,
}: {
  roomLabel: string;
  onSend: (text: string) => void;
  onKai: () => void;
  onStructured: () => void;
  /**
   * The + menu's shortcut to Kai — ONE explicit tap, one call, never automatic:
   * a room summary costs the member credits. Absent, the row opens the full
   * @Kai sheet instead of guessing at a command.
   */
  onAskKai?: () => void;
  /** Absent → the + menu pushes the call composer itself, with `callSymbol`. */
  onPublishCall?: () => void;
  /** Pre-fills the call composer's ticker when the room has one. */
  callSymbol?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
  testID?: string;
  /** Pictures already picked. Absent means this composer takes no pictures. */
  attachments?: Attachment[];
  onAttach?: () => void;
  onRemoveAttachment?: (key: string) => void;
  attachLimit?: number;
  placeholder?: string;
  /**
   * The post being answered, drawn above the input.
   *
   * IT IS AN OBJECT, NOT TEXT IN THE BOX. Pasting "> Jordan said: …" into the
   * input is the cheap version and it is wrong twice: the member has to delete
   * somebody else's words before they can write their own, and backspacing at
   * the start of a reply silently edits the quotation.
   */
  quote?: MessageQuote | null;
  /** "Replying to @sam" — the line above the quote. */
  quoteLabel?: string | null;
  onClearQuote?: () => void;
  /**
   * Words put in the box by something other than the keyboard — an empty
   * room's question starter (`RoomWelcome`). The same contract `ui/Composer`
   * uses, including the nonce: without it the SAME suggestion cannot be
   * offered twice, because the string would not have changed.
   *
   * IT IS A DRAFT AND NOT A POST. Whatever arrives here is editable and is
   * sent by the member pressing send, exactly as if they had typed it.
   */
  draft?: string;
  draftNonce?: number;
}) {
  const [value, setValue] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (typeof draft === 'string' && draft.length) setValue(draft);
    // The nonce is the trigger; `draft` is read, not watched, so restoring the
    // same text twice works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce]);

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

  /**
   * WHAT THE + OFFERS.
   *
   * A LIST, NOT THREE HARDCODED BUTTONS — a fourth thing to post is a line
   * here. Every row says what it does, and the two rows that would otherwise
   * over-promise say so instead: the picker takes pictures and not video,
   * because the service refuses video for reasons written out in migration
   * 0033, and asking Kai spends credits, so the row says that before the tap
   * rather than the account screen saying it afterwards.
   */
  const actions: ComposerAction[] = [
    ...(onAttach ? [{
      id: 'photo',
      label: 'Add a picture',
      hint: attachments.length >= attachLimit
        ? `You already have ${attachLimit}. Remove one to add another.`
        : `Up to ${attachLimit}. Pictures only — video is not accepted here. Location data is removed from every one.`,
      disabled: !canAttach,
      onPress: onAttach,
    } as ComposerAction] : []),
    {
      id: 'call',
      label: 'Publish a call',
      hint: 'Entry, stop, target. It goes on your profile and gets scored.',
      disabled,
      onPress: onPublishCall ?? (() => router.push(
        callSymbol ? `/community/call/new?symbol=${encodeURIComponent(callSymbol)}` : '/community/call/new'
      )),
    },
    {
      id: 'idea',
      label: 'Post an idea',
      hint: 'Thesis, entry, invalidation, risk, target — as one object.',
      disabled,
      onPress: onStructured,
    },
    {
      id: 'kai',
      label: 'Ask Kai to catch me up',
      hint: 'A summary of what has been said here. One tap, one answer — it costs credits.',
      tone: 'kai',
      disabled,
      onPress: onAskKai ?? onKai,
    },
  ];

  return (
    <View style={{ gap: 8 }} testID={testID ?? 'room-composer'}>
      {disabled && disabledReason ? (
        <T size={11} c={color.gold} style={{ paddingHorizontal: 4 }}>{disabledReason}</T>
      ) : null}

      {quote ? (
        <View testID="composer-quote" style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={11} weight="semibold" c={color.muted} numberOfLines={1} style={{ flex: 1 }}>
              {quoteLabel ?? `Replying to ${quote.author_name}`}
            </T>
            {onClearQuote ? (
              <Pressable
                testID="composer-quote-clear"
                accessibilityRole="button"
                accessibilityLabel="Stop replying to this post"
                accessibilityHint="Your message will go to the room on its own."
                onPress={onClearQuote}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 2 })}
              >
                {/* A word, not a glyph. "×" at this size is a smudge, and every
                    icon that means "cancel" also means "delete" to somebody. */}
                <T size={11} weight="semibold" c={color.volt}>Cancel</T>
              </Pressable>
            ) : null}
          </View>
          <QuoteBlock quote={quote} compact testID="composer-quote-block" />
        </View>
      ) : null}

      <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* ONE + FOR EVERYTHING YOU CAN ADD. This was two unlabelled glyphs —
            a photograph and a plus — that between them offered exactly two of
            the four things a member can put in a room, and named neither. */}
        <ComposerActions actions={actions} disabled={disabled} />

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
