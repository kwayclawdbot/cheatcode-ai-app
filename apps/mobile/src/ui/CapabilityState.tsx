/**
 * THE SIX WAYS A SURFACE CAN HAVE NOTHING TO SHOW (audit F18).
 *
 * The audit's complaint is small to say and expensive to leave alone: "no
 * alert, a failed request and an expired setup have different implications for
 * a user", and its acceptance test is "a failed load cannot be mistaken for a
 * verified empty list." Today each board has invented its own version of that
 * — AlertsBoard has quiet routes and error text, Community has its own loading
 * and error presentation, Home says nothing at all — so the same underlying
 * situation reads differently depending on which tab you are standing on.
 *
 * This is that vocabulary, once:
 *
 *   loading   we are asking. Nothing is known yet.
 *   quiet     we asked, it answered, and the answer is genuinely nothing.
 *             This is a FINDING and it is allowed to sound calm.
 *   stale     we have an answer, it is old, and the refresh did not land.
 *             The numbers on screen were true when they arrived.
 *   offline   there is no network. Anything visible is remembered, not read.
 *   blocked   the answer exists and this member's plan does not include it.
 *             Never dressed up as empty — that would be a lie about the data.
 *   failed    we asked and the ask failed. We know nothing, and we say so.
 *
 * WHY IT IS NOT `FreshnessMark`. Freshness is about ONE PRICE and refuses to
 * let a number render without a word next to it. This is about a WHOLE
 * CAPABILITY — a list, a board, a chart, a plan — and about whether asking for
 * it worked at all. They share the grammar deliberately: label + SHAPE +
 * colour, never colour alone, and `stale` wears the same red square in both so
 * a member who has learned it once has learned it everywhere.
 *
 * The copy is the CALLER'S, always. This file owns the shape, the mark, the
 * colour and the retry; it never invents the sentence, because only the caller
 * knows what was being looked for.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { T } from './Text';
import { alpha, color, radius } from './tokens';
/**
 * The rule lives beside the component, not inside it — same arrangement as
 * `FreshnessMark` and `lib/freshness-decay.ts`, and for the same reason: the
 * order those tests are applied in is the part worth asserting, and a renderer
 * cannot be imported into a test script. Re-exported so callers import one
 * thing.
 */
import { capabilityFor, updatedAtLabel, type Capability, type CapabilityInput } from '../lib/capability-state';

export { capabilityFor, updatedAtLabel };
export type { Capability, CapabilityInput };

type Spec = {
  /** The word, when the caller does not supply its own. */
  word: string;
  c: string;
  /** Shape, so the state is legible without colour vision. */
  shape: 'dots' | 'moon' | 'square' | 'slash' | 'lock' | 'cross';
};

const SPEC: Record<Exclude<Capability, 'ready'>, Spec> = {
  loading: { word: 'Checking', c: color.muted, shape: 'dots' },
  quiet: { word: 'Nothing to do', c: color.muted, shape: 'moon' },
  stale: { word: 'No new data', c: color.red, shape: 'square' },
  offline: { word: 'Offline', c: color.gold, shape: 'slash' },
  blocked: { word: 'Not on your plan', c: color.violetLight, shape: 'lock' },
  failed: { word: "Couldn't load", c: color.gold, shape: 'cross' },
};

/**
 * The mark. Small, and it carries the state on its own — the crescent for a
 * quiet market is the board's own moon, and it is the one state here that is
 * good news rather than an apology.
 */
export function CapabilityMark({ state, size = 14 }: { state: Exclude<Capability, 'ready'>; size?: number }) {
  const s = SPEC[state];
  if (s.shape === 'dots') {
    return (
      <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: size }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: s.c, opacity: 1 - i * 0.28 }} />
        ))}
      </View>
    );
  }
  if (s.shape === 'square') {
    return <View style={{ width: size * 0.55, height: size * 0.55, backgroundColor: s.c }} />;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {s.shape === 'moon' ? (
        <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" stroke={s.c} strokeWidth={1.8} strokeLinejoin="round" />
      ) : s.shape === 'slash' ? (
        <>
          <Path d="M2 6.5C5 4.5 8.4 3.4 12 3.4c3.6 0 7 1.1 10 3.1M5.5 11c1.9-1.3 4.2-2 6.5-2M8.9 15.4c1-.6 2-.9 3.1-.9" stroke={s.c} strokeWidth={1.8} strokeLinecap="round" />
          <Path d="M12 19.4h.01" stroke={s.c} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M3 3l18 18" stroke={s.c} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : s.shape === 'lock' ? (
        <>
          <Path d="M5.5 10.5h13v10h-13z" stroke={s.c} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M8.5 10.5V7.6a3.5 3.5 0 1 1 7 0v2.9" stroke={s.c} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <Path d="M6 6l12 12M18 6L6 18" stroke={s.c} strokeWidth={2} strokeLinecap="round" />
      )}
    </Svg>
  );
}

/**
 * The full notice: mark, the caller's sentence, and — only where retrying is a
 * real thing to do — one button.
 *
 * `blocked` and `quiet` deliberately have no retry. Asking again cannot change
 * an entitlement, and a quiet market is not a failure to recover from; a button
 * on either would be the app pretending the member did something wrong.
 */
export function CapabilityNotice({
  state, plain, detail, onRetry, retryLabel = 'Try again', at, testID,
}: {
  state: Exclude<Capability, 'ready'>;
  /** The one sentence. Always the caller's — this file never invents it. */
  plain: string;
  /** An optional second line: what we do know, or what was checked. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  /** "Last updated 8:42 AM" — provenance for anything still on screen. */
  at?: string | null;
  testID?: string;
}) {
  const s = SPEC[state];
  const retryable = (state === 'failed' || state === 'stale' || state === 'offline') && !!onRetry;
  return (
    <View
      testID={testID ?? `capability-${state}`}
      accessibilityLabel={`${s.word}. ${plain}${detail ? ` ${detail}` : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: radius.xl,
        borderWidth: 0.5,
        borderColor: alpha.ivory08,
      }}
    >
      <View style={{ paddingTop: 1 }}><CapabilityMark state={state} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <T size={13} lh={19} c={state === 'quiet' ? color.text : s.c}>{plain}</T>
        {detail ? <T size={12} lh={17} c={color.muted}>{detail}</T> : null}
        {at ? <T size={11} c={color.dim} testID="capability-at">{at}</T> : null}
      </View>
      {retryable ? (
        <Pressable
          testID="capability-retry"
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          onPress={onRetry}
          style={({ pressed }) => ({
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: radius.pill,
            borderWidth: 0.5,
            borderColor: alpha.volt40,
            backgroundColor: alpha.volt08,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <T size={12} weight="bold" c={color.volt}>{retryLabel}</T>
        </Pressable>
      ) : null}
    </View>
  );
}
