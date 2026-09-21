/**
 * What hands-free LOOKS like (lane C). Identity, not chrome: this is the Kai
 * composer, so it is hand-rolled from `ui/tokens` like the pill it sits in.
 *
 * THE COLOUR GRAMMAR IS THE HOUSE ONE. Volt is the member acting and violet is
 * Kai acting (AGENTS.md). So:
 *   idle          an outline circle beside Send — present, not shouting
 *   listening     volt: the member is talking; a ring breathes with their voice
 *   writing down  a spinner in the same circle
 *   Kai speaking  violet, with sound bars; tapping it stops him
 *
 * While listening the TEXT FIELD is replaced by a live level meter and a timer,
 * so the state cannot be missed or mistaken for a frozen keyboard.
 */
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { alpha, color } from '../../ui/tokens';
import { Mic } from '../../ui/Icons';
import { Num, T } from '../../ui/Text';
import { clock } from './logic';
import type { VoiceMessage, VoicePhase } from './useKaiVoice';

const SIZE = 40;

function SoundBars({ c }: { c: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 14 }}>
      {[6, 12, 8, 14, 7].map((h, i) => (
        <View key={i} style={{ width: 2, height: h, borderRadius: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

export function KaiMicButton({
  phase,
  level,
  onPress,
  waiting,
  size = SIZE,
  primary = false,
}: {
  phase: VoicePhase;
  level: number;
  onPress: () => void;
  waiting?: boolean;
  /** Diameter. 40 beside Send; larger where the mic is the screen's main control. */
  size?: number;
  /**
   * The mic as the MAIN control (Home, War Room style): at rest it is a volt
   * ring on a volt wash rather than a quiet outline, because talking is the
   * first way in and typing is the backup.
   */
  primary?: boolean;
}) {
  const listening = phase === 'recording';
  const speaking = phase === 'speaking';
  const busy = phase === 'starting' || phase === 'transcribing';

  const label = listening
    ? 'Stop listening and send'
    : speaking
      ? 'Stop Kai speaking'
      : busy
        ? phase === 'starting'
          ? 'Starting the microphone'
          : 'Writing down what you said'
        : 'Ask Kai out loud';
  const hint = waiting
    ? 'Wait for Kai to finish, or stop him first.'
    : listening
      ? 'Or just pause — it stops on its own.'
      : speaking
        ? undefined
        : 'Tap, ask your question, then pause.';

  return (
    <Pressable
      testID="kai-mic"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy || !!waiting, busy }}
      disabled={busy || !!waiting}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: listening ? color.volt : speaking ? color.violet : primary ? alpha.volt10 : 'transparent',
        borderWidth: listening || speaking ? 0 : primary ? 1 : 0.5,
        borderColor: primary ? alpha.volt50 : alpha.ivory20,
        opacity: waiting ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      {listening ? (
        // The ring: grows with the member's voice, so the button itself says
        // "I can hear you" even with eyes on the road.
        <View
          pointerEvents="none"
          testID="kai-mic-ring"
          style={{
            position: 'absolute',
            width: size + 8 + level * 14,
            height: size + 8 + level * 14,
            borderRadius: (size + 8 + level * 14) / 2,
            borderWidth: 2,
            borderColor: alpha.volt40,
          }}
        />
      ) : null}
      {busy ? (
        <ActivityIndicator size="small" color={color.muted} />
      ) : speaking ? (
        <SoundBars c={color.text} />
      ) : (
        <Mic size={Math.round(size * 0.42)} color={listening ? color.bg : primary ? color.volt : color.text} strokeWidth={2} />
      )}
    </Pressable>
  );
}

/** Stands in for the text field while the microphone is the input. */
export function VoiceOverlay({
  phase,
  levels,
  elapsedMs,
  message,
  onDismiss,
  onOpenSettings,
}: {
  phase: VoicePhase;
  levels: number[];
  elapsedMs: number;
  message: VoiceMessage;
  onDismiss: () => void;
  onOpenSettings: () => void;
}) {
  if (phase === 'recording') {
    const bars = Array.from({ length: 16 }, (_, i) => levels[levels.length - 16 + i] ?? 0);
    return (
      <View testID="kai-voice-listening" accessibilityLiveRegion="polite" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 }} testID="kai-voice-meter">
          {bars.map((v, i) => (
            <View
              key={i}
              style={{ width: 3, borderRadius: 1.5, height: 3 + Math.round(v * 21), backgroundColor: v > 0.05 ? color.volt : alpha.ivory20 }}
            />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <T variant="meta" c={color.text}>Listening</T>
          <T variant="meta" c={color.dim}>Pause when you're done</T>
        </View>
        <Num variant="meta" weight="regular" c={color.muted} testID="kai-voice-clock">{clock(elapsedMs)}</Num>
      </View>
    );
  }
  if (phase === 'starting' || phase === 'transcribing') {
    return (
      <View testID="kai-voice-working" accessibilityLiveRegion="polite" style={{ flex: 1, justifyContent: 'center' }}>
        <T variant="meta" c={color.muted}>{phase === 'starting' ? 'Opening the microphone…' : 'Writing down what you said…'}</T>
      </View>
    );
  }
  if (message) {
    return (
      <View testID="kai-voice-message" accessibilityLiveRegion="polite" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${message.text} Dismiss.`} onPress={onDismiss} style={{ flex: 1 }}>
          <T variant="meta" lh={16} c={color.muted} numberOfLines={2}>{message.text}</T>
        </Pressable>
        {message.settings ? (
          <Pressable
            testID="kai-voice-open-settings"
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
            onPress={onOpenSettings}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 0.5, borderColor: alpha.ivory20 }}
          >
            <T variant="meta" c={color.text}>Settings</T>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return null;
}
