/**
 * "ASK KAI TO EXPLAIN THE STOP AT 171.90" — the contextual Kai row in a thread.
 *
 * board-community-rooms.png, right-hand screen: under the discussion and above
 * the reply box, one violet row bound to the setup pinned at the top of the
 * thread. The point of it is the number. A blank "Ask Kai" is the member's
 * problem to write down; "explain the stop at 171.90" is a question they did
 * not have to know how to ask, about the level they are looking at.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION IS BUILT FROM THE SETUP'S REAL LEVELS, OR THE ROW DOES NOT DRAW
 * ─────────────────────────────────────────────────────────────────────────────
 * `questionFor` returns null when the setup carries no level at all. A row that
 * says "explain the stop" over a setup with no stop is a promise of an answer
 * nobody can give, and the placeholder number this codebase would have to
 * invent to fill the sentence is exactly the thing `no-fake-data-test` exists
 * to stop. No level, no row. The thread is unchanged.
 *
 * The stop comes first because it is what the board asks for and what a
 * beginner most needs: it is the number that decides how much this costs if the
 * idea is wrong. Target and entry are the fallbacks, in that order.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE TAP GOES, AND WHY IT IS NOT THE ROOM'S KAI
 * ─────────────────────────────────────────────────────────────────────────────
 * DEVIATION, deliberate, and it is worth being precise about because the
 * obvious wiring is wrong.
 *
 * `POST /v1/rooms/:id/kai` is the room-scoped endpoint and it takes a COMMAND
 * from a fixed list — summarize · verify · to_alert · compare · explain ·
 * mark_levels — not a question. It accepts an `args` object and
 * `apps/api/src/lib/kai/room.ts` never reads it; `explain` means "explain what
 * is going on in this room to a complete beginner", which is a different answer
 * to the one this row promises. Sending the question there would produce a
 * violet row that says "explain the stop at 171.90", spends the member's
 * credits, and returns a summary of the conversation. That is the kind of
 * plausible-but-not-the-thing-asked-for behaviour this codebase keeps refusing.
 *
 * So the tap opens KAI with the question already asked, through the route that
 * genuinely takes one: `/home?ask=…&symbol=…&setup_id=…`, the same path
 * `features/portal2/TradeLocked.tsx` uses, which pins the setup to the
 * conversation so the answer is about THAT object. The chevron on the row says
 * it goes somewhere, which it does.
 *
 * WHEN THE ROOM ENDPOINT LEARNS TO TAKE A QUESTION, this becomes a one-line
 * change and the answer arrives in the thread instead — which is better, and is
 * not available today.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T } from '../../../ui/Text';
import { KaiOrb } from '../../../ui/KaiOrb';
import { ChevronRight } from '../../../ui/Icons';
import { alpha, color, radius } from '../../../ui/tokens';
import type { RoomSetup } from '../types';

/** A wire string becomes a number, or nothing. Never NaN, never a silent zero. */
const num = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Two decimals, the way every other price in this app prints. */
const price = (n: number): string => n.toFixed(2);

export type SetupQuestion = {
  /** "the stop at 171.90" — what the row says after "Ask Kai to explain". */
  label: string;
  /** The whole question, as it will be asked. */
  question: string;
};

/**
 * The question this setup can actually answer, or null.
 *
 * Exported so a test can assert the null case rather than trusting the comment
 * above it.
 */
export function questionFor(setup: RoomSetup | null | undefined): SetupQuestion | null {
  if (!setup) return null;
  const symbol = String(setup.symbol ?? '').toUpperCase();
  if (!symbol) return null;

  const stop = num(setup.invalid);
  if (stop != null) {
    return {
      label: `the stop at ${price(stop)}`,
      question:
        `Explain the stop at ${price(stop)} on ${symbol} — why that price, and what it means for me if it gets there.`,
    };
  }

  const target = num(setup.target);
  if (target != null) {
    return {
      label: `the target at ${price(target)}`,
      question:
        `Explain the target at ${price(target)} on ${symbol} — why that price, and what would have to happen to reach it.`,
    };
  }

  const entry = num(setup.entry);
  if (entry != null) {
    return {
      label: `the entry at ${price(entry)}`,
      question:
        `Explain the entry at ${price(entry)} on ${symbol} — why that price, and what I would be waiting for.`,
    };
  }

  // No levels. Nothing honest to put in the sentence, so no row.
  return null;
}

export function AskKaiAboutSetup({
  setup, testID,
}: { setup: RoomSetup | null | undefined; testID?: string }) {
  const router = useRouter();
  const ask = questionFor(setup);
  if (!ask || !setup) return null;

  const href =
    `/home?ask=${encodeURIComponent(ask.question)}` +
    `&symbol=${encodeURIComponent(String(setup.symbol).toUpperCase())}` +
    `&setup_id=${encodeURIComponent(setup.id)}`;

  return (
    <Pressable
      testID={testID ?? 'thread-ask-kai'}
      accessibilityRole="button"
      accessibilityLabel={`Ask Kai to explain ${ask.label}`}
      accessibilityHint="Opens Kai with the question already asked, about this setup."
      onPress={() => router.push(href as never)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 11, paddingHorizontal: 13,
        borderRadius: radius.pill,
        borderWidth: 0.5, borderColor: alpha.violet50,
        backgroundColor: alpha.violet14,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <KaiOrb size={20} glow={false} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={13} weight="semibold" c={color.violetLight} numberOfLines={1}>
          Ask Kai to explain {ask.label}
        </T>
      </View>
      <ChevronRight size={10} color={color.violetLight} />
    </Pressable>
  );
}
