/**
 * The credit surfaces' own grammar.
 *
 * A balance is a quantity you are spending down, so it is drawn as a quantity
 * being spent down — a run of ticks, one per credit, filling from the left. Not
 * a percentage bar in a rounded box: a bar says "you are 30% through
 * something", and what a person actually wants to know is "how many more
 * questions can I ask". Ten ticks answers that by being countable.
 *
 * COLOUR IS THE LOCKED GRAMMAR AND IT MATTERS HERE. The credits are the
 * USER'S — their allowance, their spending — so the meter is VOLT. Kai's own
 * words, when he explains a stop, are VIOLET. Nothing on these screens is
 * market data, so nothing here is cyan.
 *
 * NO ROUNDED-RECTANGLE CARDS ANYWHERE. Hairlines and ruled strips, the same
 * register the research desk uses. See `features/desk/instruments.tsx` — this
 * file deliberately borrows its `Strip`/`Bay` shape rather than inventing a
 * second one.
 *
 * NOTHING HERE COMPUTES A BALANCE. Every number is read off the server's own
 * block. Where the server sent nothing, the component renders nothing.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, space } from '../../ui/tokens';
import type { Credits } from '../../lib/types';

/* ------------------------------------------------------------------ */
/* the strip that carries the readings                                 */
/* ------------------------------------------------------------------ */

/** One ruled surface, not a grid of cards. Hairline top and bottom. */
export function Strip({ children, style, testID }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[{
        borderTopWidth: 1, borderTopColor: alpha.ivory16,
        borderBottomWidth: 1, borderBottomColor: alpha.ivory08,
      }, style]}
    >
      {children}
    </View>
  );
}

/** One reading on the strip, ruled off from the one above it. Never boxed. */
export function Bay({ children, first = false, style, testID }: {
  children: React.ReactNode; first?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[{
        paddingVertical: space.x14,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: alpha.ivory10,
      }, style]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the meter — a run of ticks, one per credit                          */
/* ------------------------------------------------------------------ */

/**
 * How many credits are left, drawn so they can be counted.
 *
 * ONE TICK PER CREDIT while that is legible — ten on free is ten marks, and a
 * person can see at a glance that three are gone. Past twenty the ticks stop
 * being countable and become a texture, so the meter switches to one continuous
 * measure instead. Forty of them was tried and looked like a barcode.
 *
 * SPENT TICKS ARE NOT HIDDEN. They stay on the meter, dimmed. A meter that
 * shrinks tells you what is left; a meter that dims tells you what is left AND
 * what a full day looks like, which is the thing somebody deciding whether to
 * upgrade actually wants.
 */
const COUNTABLE_MAX = 20;

export function CreditMeter({ credits, testID }: { credits: Credits; testID?: string }) {
  const total = credits.granted;
  const used = Math.min(credits.used, total);
  const left = Math.max(total - used, 0);
  const countable = total > 0 && total <= COUNTABLE_MAX;

  return (
    <View
      testID={testID}
      accessibilityLabel={`${left} of ${total} credits left today`}
      style={{ gap: space.x10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.x8 }}>
        <Num size={44} weight="bold" c={left > 0 ? color.volt : color.muted} style={{ lineHeight: 46 }}>
          {left}
        </Num>
        <T size={14} c={color.muted} style={{ paddingBottom: space.x8 }}>
          of {total} left today
        </T>
      </View>

      {countable ? (
        <View style={{ flexDirection: 'row', gap: 3 }} testID="credit-meter-ticks">
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: i < left ? 10 : 5,
                alignSelf: 'flex-end',
                backgroundColor: i < left ? color.volt : alpha.ivory12,
              }}
            />
          ))}
        </View>
      ) : (
        // Too many to count. One continuous measure, same colour grammar.
        <View style={{ height: 10, flexDirection: 'row', backgroundColor: alpha.ivory12 }} testID="credit-meter-measure">
          <View style={{ flex: Math.max(left, 0), backgroundColor: color.volt }} />
          <View style={{ flex: Math.max(used, 0) }} />
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Kai, when he has had to stop                                        */
/* ------------------------------------------------------------------ */

/**
 * The stop, in Kai's own words, given a rule of its own.
 *
 * The two reasons are drawn DIFFERENTLY on purpose. Running out of today's
 * credits clears tomorrow and the person can simply come back; hitting the
 * month's cost limit does not clear tomorrow, and telling somebody to come back
 * in the morning when they will be stopped again is the kind of small lie this
 * product does not tell. Gold for the one that resolves itself, red for the one
 * that does not.
 *
 * The sentence is the SERVER'S, never rewritten here.
 */
export function StopNote({ credits, testID }: { credits: Credits; testID?: string }) {
  if (!credits.blocked || !credits.blocked_plain) return null;
  const monthly = credits.blocked_reason === 'ceiling';
  return (
    <View
      testID={testID}
      style={{
        marginTop: space.x16,
        paddingLeft: space.x14,
        paddingVertical: space.x4,
        borderLeftWidth: 3,
        borderLeftColor: monthly ? color.red : color.gold,
      }}
    >
      <Eyebrow c={monthly ? color.red : color.gold}>
        {monthly ? "This month's cost limit" : "Today's credits are spent"}
      </Eyebrow>
      <T size={14} lh={21} c={color.violetLight} style={{ marginTop: space.x6 }}>
        {credits.blocked_plain}
      </T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the strip above the composer                                        */
/* ------------------------------------------------------------------ */

/**
 * THE ONLY THING THAT APPEARS IN THE CHAT, AND ONLY WHEN IT MATTERS.
 *
 * It is drawn at 80% consumed or when Kai has stopped, and NEVER otherwise.
 * Permanent chrome that counts down while somebody is talking to Kai changes
 * what the screen is about — Home is a conversation, not a meter — so this is
 * absent for the whole of a normal day and shows up once, quietly, near the
 * end of one.
 *
 * A hairline rule and a sentence. No box, no icon, no colour block.
 */
export function CreditStrip({ credits, onPress, testID }: {
  credits: Credits | null; onPress?: () => void; testID?: string;
}) {
  if (!credits) return null;
  const line = credits.blocked
    ? credits.blocked_reason === 'ceiling'
      ? "Kai has stopped for this month — your plan's cost limit."
      : 'Kai has stopped for today. Your credits come back tomorrow.'
    : credits.warning_plain;
  if (!line) return null;

  const tone = credits.blocked ? color.gold : color.muted;

  /**
   * A Pressable, not a View with `onTouchEnd`. The first version of this used
   * the touch handler and it worked perfectly on web and did nothing at all on
   * a phone — which is the exact failure mode the app's own instructions warn
   * about: a screen that compiles is not a screen that works.
   */
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={line}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => ({
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: alpha.ivory12,
        paddingTop: space.x8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x8,
        opacity: pressed && onPress ? 0.6 : 1,
      })}
    >
      <View style={{ width: 4, height: 4, backgroundColor: tone }} />
      <T size={11} lh={16} c={tone} style={{ flex: 1 }}>{line}</T>
      {onPress ? <T size={11} weight="semibold" c={color.volt}>Credits ›</T> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* small shared pieces                                                 */
/* ------------------------------------------------------------------ */

/**
 * When the day turns over, in the person's own clock.
 *
 * NOT A COUNTDOWN. A ticking "4h 12m" invites somebody to sit and watch it, and
 * it is wrong the moment the screen is backgrounded. A time is a fact.
 *
 * AND NOT A LITERAL ONE WHEN THE LITERAL ONE IS SILLY. The reset is midnight,
 * so the honest rendering of the timestamp is "12:00 AM" — which reads like a
 * machine printing a field. A person says "overnight". The time is only spelled
 * out when it is NOT midnight, which is what happens when the server anchors
 * the day somewhere else; then the exact time is the useful thing and it is
 * shown.
 */
export function resetsLine(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const atMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  if (atMidnight) return 'They come back overnight';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `They come back at ${time} tonight` : `They come back at ${time} tomorrow`;
}
