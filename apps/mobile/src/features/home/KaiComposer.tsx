import React, { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { alpha, color, layout, radius, tap, typeScale } from '../../ui/tokens';
import { family } from '../../ui/fonts';
import { ArrowRight, Paperclip } from '../../ui/Icons';

/**
 * KAI'S COMPOSER — redesign V2: attach · "Ask Kai or give Kai a task…" ·
 * violet mic · orange send.
 *
 * Separate from `ui/Composer` on purpose: that one is also the community and
 * club composer, which the Community lane is redesigning with an @Kai
 * shortcut. This one only ever talks to Kai, so it can say so.
 *
 *   attach  opens the panel launcher — a chart, a quote, earnings, options,
 *           the watchlist or the portfolio goes above the conversation and
 *           Kai can see it. Kai does not take photographs, so there is no
 *           camera here.
 *   mic     `useKaiVoice`'s button, passed in, drawn violet because voice is
 *           Kai. While it is listening its overlay replaces the field.
 *   send    orange: the member acting. While Kai is writing it is Stop.
 *
 * The recovery contract from `ui/Composer` is kept exactly: a failed turn's
 * words come back through `draft` + `draftNonce`, and never overwrite
 * something typed since.
 */
export function KaiComposer({
  onSend, onAttach, streaming = false, onStop, draft, draftNonce = 0,
  mic, voiceOverlay, placeholder = 'Ask Kai or give Kai a task…', disabled = false,
}: {
  onSend: (text: string) => void;
  onAttach?: () => void;
  streaming?: boolean;
  onStop?: () => void;
  draft?: string;
  draftNonce?: number;
  mic?: React.ReactNode;
  voiceOverlay?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const stoppable = streaming && !!onStop;
  const canSend = value.trim().length > 0 && !disabled && !streaming;

  const restored = useRef(draftNonce);
  useEffect(() => {
    if (draftNonce === restored.current || draft === undefined) return;
    restored.current = draftNonce;
    if (draft === '') setValue('');
    else if (!value.trim()) setValue(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce, draft]);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };
  const press = () => { if (stoppable) { onStop?.(); return; } submit(); };
  /**
   * While the mic is the input (listening, writing it down, or a voice
   * message), the field gives the whole row to it: the meter, the words and
   * the clock need the width at 360, and neither attach nor send means
   * anything until it is done — the mic itself is what sends.
   */
  const voiceTakesRow = !!voiceOverlay && !streaming;

  return (
    <View testID="kai-composer" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {onAttach && !voiceTakesRow ? (
        <Pressable
          testID="kai-composer-attach"
          accessibilityRole="button"
          accessibilityLabel="Add to the conversation"
          accessibilityHint="Opens a chart, a quote, earnings or your watchlist above the conversation."
          onPress={onAttach}
          style={({ pressed }) => ({
            width: tap.min, height: tap.min, borderRadius: tap.min / 2,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? color.raised : color.surface,
            borderWidth: layout.border, borderColor: alpha.border,
          })}
        >
          <Paperclip size={20} color={color.textPrimary} />
        </Pressable>
      ) : null}

      <View
        testID="composer"
        style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6,
          height: 52, paddingLeft: 16, paddingRight: 6, borderRadius: radius.pill,
          backgroundColor: color.surface, borderWidth: layout.border, borderColor: alpha.border,
        }}
      >
        {voiceOverlay ?? (
          <TextInput
            testID="composer-input"
            accessibilityLabel={placeholder}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            placeholder={placeholder}
            placeholderTextColor={color.textSecondary}
            editable={!disabled}
            returnKeyType="send"
            style={{
              flex: 1, minWidth: 0,
              fontFamily: family.regular,
              fontSize: typeScale.body.size,
              color: color.textPrimary,
              ...(({ outlineStyle: 'none' } as unknown) as object),
            }}
          />
        )}
        {mic}
      </View>

      {voiceTakesRow ? null : <Pressable
        testID="composer-send"
        accessibilityRole="button"
        accessibilityLabel={stoppable ? 'Stop' : 'Send'}
        accessibilityHint={stoppable ? 'Ends the answer Kai is writing.' : canSend ? undefined : 'Write something first.'}
        accessibilityState={{ disabled: !stoppable && !canSend }}
        disabled={!stoppable && !canSend}
        onPress={press}
        style={({ pressed }) => ({
          width: tap.min + 4, height: tap.min + 4, borderRadius: (tap.min + 4) / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: color.action,
          // Always the brand orange, as the board draws it; empty, it simply does nothing.
          opacity: pressed && (stoppable || canSend) ? 0.82 : 1,
        })}
      >
        {stoppable
          ? <View testID="composer-stop" style={{ width: 13, height: 13, borderRadius: 2, backgroundColor: color.onAction }} />
          : <ArrowRight size={18} color={color.onAction} />}
      </Pressable>}
    </View>
  );
}
