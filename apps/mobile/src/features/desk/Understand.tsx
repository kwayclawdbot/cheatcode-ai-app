/**
 * UNDERSTAND THE BUSINESS — the top of a desk write-up, audit F15.
 *
 * The board (`docs/audit-2026-09-08/a8bfa2ca-image.png`) opens a company on
 * three rows — what it does, why watch it, what could change — then a horizon,
 * then Kai, then "Watch company". This screen used to open on an instrument
 * panel: a grade on a six-step scale, a direction mark, a run of quarters and a
 * pair of theme gauges. All of that is good and none of it is where a person
 * who chose long-term investing starts.
 *
 * So the panel keeps its job and loses its position. This block goes first and
 * answers the three questions the audit's acceptance test asks — "a beginner
 * can explain what the company does and why it is being watched without opening
 * a long thesis".
 *
 * EVERY SENTENCE HERE IS QUOTED, NEVER COMPOSED. `features/desk/plain.ts` does
 * the quoting and attaches where each line came from; this file draws it and
 * says so under each one. A question the desk never answered renders as the
 * stated absence, because "the desk did not write this down" is a fact about
 * the write-up and a made-up sentence would be a fact about nothing.
 *
 * ── AND WATCHING IS NOT BUYING ────────────────────────────────────────────
 * "Watching a company does not imply an order or a complete trade plan" is the
 * second half of the acceptance. `Watch company` adds a name to the desk's
 * watchlist and the line under it says exactly that, in the same breath, on the
 * same screen. There is no route from this screen to an order and there must
 * not be one.
 */
import React, { useCallback, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { alpha, color, radius, space } from '../../ui/tokens';
import { api, ApiError } from '../../lib/api';
import { openKaiSheet } from '../kai-sheet';
import { IDEA_GRADE_MEANS, plainCompany, type PlainNote } from './plain';
import type { DeskPick } from '@shared/desk';

/**
 * One of the three. The question in the member's words, the desk's answer
 * underneath, and where the answer came from under that — provenance on a
 * quote is not decoration, it is the difference between the desk saying
 * something and the app saying it.
 */
function Line({ question, note, absent, testID }: {
  question: string; note: PlainNote | null; absent: string; testID: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        paddingVertical: space.x12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: alpha.ivory12,
      }}
    >
      <T size={14} weight="semibold" c={color.text}>{question}</T>
      {note ? (
        <>
          <T size={15} lh={22} c={color.muted} style={{ marginTop: space.x6 }}>{note.text}</T>
          <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x6 }}>
            {`From ${note.source}.`}
          </T>
        </>
      ) : (
        <T size={13} lh={19} c={color.dim} style={{ marginTop: space.x6 }} testID={`${testID}-absent`}>
          {absent}
        </T>
      )}
    </View>
  );
}

export function UnderstandBusiness({ pick }: { pick: DeskPick }) {
  const plain = plainCompany(pick);
  const name = pick.company ?? pick.ticker;

  /**
   * WATCHING, WITH ITS TWO HONEST OUTCOMES.
   *
   * The desk's own POST answers `STATE_CONFLICT` for a name already on the
   * list, which is not an error to a member — it is the answer to the question
   * they asked. It is shown as one.
   */
  const [watching, setWatching] = useState<'idle' | 'sending' | 'on' | 'failed'>('idle');
  const [watchNote, setWatchNote] = useState<string | null>(null);

  const watch = useCallback(async () => {
    setWatching('sending');
    setWatchNote(null);
    try {
      await api.deskAddWatch(pick.ticker, pick.theme ?? undefined);
      setWatching('on');
      setWatchNote(`${pick.ticker} is on your watchlist. Nothing has been ordered.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'STATE_CONFLICT') {
        setWatching('on');
        setWatchNote(e.message);
        return;
      }
      setWatching('failed');
      setWatchNote(e instanceof Error ? e.message : 'That did not go through. Try again.');
    }
  }, [pick.ticker, pick.theme]);

  return (
    <View style={{ marginTop: space.x20 }} testID="desk-understand">
      <Eyebrow c={color.violetLight}>Understand the business</Eyebrow>
      <T size={22} weight="bold" c={color.text} lh={28} style={{ marginTop: space.x6 }}>
        {name}
      </T>

      <View style={{ marginTop: space.x10 }}>
        <Line
          question="What it does"
          note={plain.whatItDoes}
          absent="The desk's write-up has no section describing the business, so there is nothing here to quote."
          testID="desk-what-it-does"
        />
        <Line
          question="Why it is being watched"
          note={plain.whyWatched}
          absent="The desk did not write down a reason in a form this screen can quote. The full argument is below."
          testID="desk-why-watched"
        />
        <Line
          question="What could change"
          note={plain.whatCouldChange}
          absent="The desk did not name a single thing that would prove this wrong. Until it does, treat the argument as untested."
          testID="desk-what-could-change"
        />
      </View>

      {/* HOW LONG, IN MONTHS RATHER THAN IN QUARTERS-AS-A-CODE. */}
      <View
        testID="desk-horizon"
        style={{
          marginTop: space.x14, paddingVertical: space.x10, paddingHorizontal: space.x12,
          borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.ivory12,
        }}
      >
        <T size={14} weight="semibold" c={plain.horizon.known ? color.text : color.muted}>
          {plain.horizon.text}
        </T>
        <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x4 }}>
          The desk is arguing about where this company gets to, not about this
          week's price.
        </T>
      </View>

      {/* THE GRADE, WITH THE WORD "IDEA" ATTACHED TO IT AND EXPLAINED. */}
      <View
        testID="desk-idea-grade"
        style={{
          marginTop: space.x10, paddingVertical: space.x10, paddingHorizontal: space.x12,
          borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.violet50,
          backgroundColor: alpha.violet08,
        }}
      >
        <Num size={16} weight="bold" c={color.violetLight}>{plain.gradeLine}</Num>
        <T size={12} lh={17} c={color.muted} style={{ marginTop: space.x4 }}>{IDEA_GRADE_MEANS}</T>
      </View>

      {/* ── the two offers, and nothing that places an order ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x8, marginTop: space.x16 }}>
        <Pressable
          onPress={watch}
          disabled={watching === 'sending' || watching === 'on'}
          accessibilityRole="button"
          accessibilityLabel={watching === 'on' ? `${pick.ticker} is on your watchlist` : 'Watch company'}
          accessibilityHint="Adds this company to your watchlist. It does not place an order."
          testID="desk-watch-company"
          style={({ pressed }) => ({
            minHeight: 44, paddingHorizontal: space.x16, borderRadius: radius.pill,
            alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.x8,
            backgroundColor: watching === 'on' ? alpha.ivory08 : color.volt,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {watching === 'sending' ? <ActivityIndicator size="small" color={color.bg} /> : null}
          <T size={14} weight="bold" c={watching === 'on' ? color.muted : color.bg}>
            {watching === 'on' ? 'On your watchlist' : 'Watch company'}
          </T>
        </Pressable>

        <Pressable
          onPress={() => openKaiSheet({
            context: { kind: 'symbol', symbol: pick.ticker, label: `Kai · about ${name}` },
            question: `In plain English, what does ${name} do and why is the desk watching it?`,
          })}
          accessibilityRole="button"
          accessibilityLabel={`Ask Kai about ${name}`}
          testID="desk-ask-kai"
          style={({ pressed }) => ({
            minHeight: 44, paddingHorizontal: space.x16, borderRadius: radius.pill,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.x8,
            borderWidth: 0.5, borderColor: alpha.violet50, backgroundColor: alpha.violet08,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <KaiOrb size={16} glow={false} />
          <T size={14} weight="semibold" c={color.violetLight}>Ask Kai</T>
        </Pressable>
      </View>

      {watchNote ? (
        <T
          size={13}
          lh={19}
          c={watching === 'failed' ? color.red : color.green}
          style={{ marginTop: space.x8 }}
          testID="desk-watch-note"
        >
          {watchNote}
        </T>
      ) : null}

      <T size={12} lh={17} c={color.dim} style={{ marginTop: space.x8 }} testID="desk-watch-caveat">
        Watching a company puts it on this list and nothing else. It is not an
        order, it is not a trade plan, and the desk names no entry, no stop and
        no position size.
      </T>
    </View>
  );
}
