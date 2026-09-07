/**
 * THE "NOW" HALF OF THE TICKER PAGE — what this symbol is doing and whether
 * there is anything to act on.
 *
 * COMPOSED WITH RULES AND TYPE, NOT WITH CARDS. Everything on this page used to
 * be a rounded container on a slightly lighter fill, which is how a screen ends
 * up reading as a list of boxes with no opinion about which one matters. Here
 * the hierarchy is carried by an eyebrow, a hairline above each block, and the
 * size of the number — so the eye lands on the price, then on the read, then on
 * the levels, in that order, without a single extra border.
 *
 * THE COLOUR GRAMMAR IS THE HOUSE ONE, and on this page it is doing real work:
 *   cyan   the market said it   — the session's own high, low and volume
 *   violet Kai said it          — the grade and the interpretation
 *   volt   YOU did it           — the lines you drew, and the buttons
 *   green  an outcome           — a target, a peak that was actually reached
 *   red    risk                 — the stop, and the sentence that ends the trade
 * A reader who has used the rest of the app already knows all five.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius, type } from '../../ui/tokens';
import type { AlertCard, AlertOptionContract, CommunityCall } from '../../lib/types';
import type { TradeRead } from '../portal2/read';
import { CommunityCallCard } from '../social';
import { distancePlain, money, pickContract, volumePlain } from './useTickerNow';
import type { SessionBar, UserLine } from './useTickerNow';

/* ------------------------------------------------------------------ */
/* The furniture — one hairline and one eyebrow, reused everywhere      */
/* ------------------------------------------------------------------ */

/**
 * A block on this page: a rule, a small caps label, and the content.
 *
 * The rule is the whole container. It costs one line instead of a border on
 * four sides plus a fill plus a radius, and a column of them reads as one
 * document rather than as a stack of unrelated panels.
 */
export function Block({
  eyebrow, aside, children, testID,
}: {
  eyebrow: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={{ borderTopWidth: 0.5, borderTopColor: alpha.ivory12, paddingTop: 11 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <T {...type.eyebrow} c={color.dim} style={{ flex: 1 }}>{eyebrow.toUpperCase()}</T>
        {aside}
      </View>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The session — the market's own numbers                              */
/* ------------------------------------------------------------------ */

/**
 * Open, the range, and volume, off the newest daily bar.
 *
 * THE RANGE IS DRAWN, NOT LISTED. "Low 497.80 · High 509.40" is two numbers a
 * reader has to subtract and then place the price inside; the track does that
 * arithmetic for them, and where the dot sits — pinned to the top of the day or
 * sitting on the low — is the single fastest read on this page.
 *
 * The dot is CYAN because its position is a market fact. It would be volt only
 * if the user had put it there.
 */
export function SessionStrip({ session, testID }: { session: SessionBar; testID?: string }) {
  const { open, high, low, volume, position, label } = session;
  return (
    <Block eyebrow={`Session · ${label}`} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
        <View style={{ gap: 2 }}>
          <T {...type.nano} c={color.dim}>OPEN</T>
          <Num size={13} c={color.text}>{money(open)}</Num>
        </View>

        <View style={{ flex: 1, gap: 6, paddingBottom: 2 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: alpha.cyan10, justifyContent: 'center' }}>
            {position != null ? (
              <View
                testID="session-range-dot"
                style={{
                  position: 'absolute',
                  left: `${position * 100}%`,
                  width: 7, height: 7, borderRadius: 4,
                  marginLeft: -3.5,
                  backgroundColor: color.cyan,
                }}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Num size={10.5} weight="regular" c={color.dim}>{money(low)}</Num>
            <Num size={10.5} weight="regular" c={color.dim}>{money(high)}</Num>
          </View>
        </View>

        {/* Volume is omitted rather than dashed when the bar did not carry it. */}
        {volume != null ? (
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <T {...type.nano} c={color.dim}>VOLUME</T>
            <Num size={13} c={color.text}>{volumePlain(volume)}</Num>
          </View>
        ) : null}
      </View>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* The read — is there anything to act on                              */
/* ------------------------------------------------------------------ */

const LEVEL_INK: Record<string, string> = {
  entry: color.cyan,
  trigger: color.cyan,
  stop: color.red,
  target: color.green,
};

/**
 * The option contract, on one line.
 *
 * DAY TRADE IS AN OPTIONS DESK, so on that board the thing a member actually
 * buys is a contract, not a share — and a plan that names an entry and a stop
 * without ever naming the contract is a plan they cannot place. The line reads
 * as a sentence rather than a spec sheet: 510 Call · Sep 19 · $4.20.
 *
 * NO GRADE IS PRINTED HERE and no label is invented. The letter belongs to the
 * setup, above; a second letter beside a contract would read as the contract
 * having been graded on its own, which nothing in this product does.
 */
function ContractLine({ c, testID }: { c: AlertOptionContract; testID?: string }) {
  const put = c.type === 'put';
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md,
        backgroundColor: alpha.ivory04, borderWidth: 0.5, borderColor: alpha.ivory10,
      }}
    >
      {c.label ? <T {...type.nano} c={color.violetLight}>{c.label.toUpperCase()}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Num size={13} weight="bold">{c.strike}</Num>
        <T size={12} weight="semibold" c={put ? color.red : color.green}>{put ? 'Put' : 'Call'}</T>
      </View>
      <T size={11.5} c={color.muted}>{c.expiry}{c.dte != null ? ` · ${c.dte}d` : ''}</T>
      {c.cost ? <Num size={12} c={color.text}>{c.cost}</Num> : null}
      {/* "thin" is a warning and is worth saying; "good" is the default and is not. */}
      {c.liquidity === 'thin' ? <T size={10.5} c={color.gold}>thin</T> : null}
    </View>
  );
}

/**
 * The peak the tracker actually recorded.
 *
 * GREEN BECAUSE IT IS AN OUTCOME, and phrased as history rather than as a
 * promise — "ran to" is a thing that already happened. It appears only when the
 * payload carries one; a setup with no recorded extreme shows nothing here
 * rather than a zero, which would read as "it never moved".
 */
function PeakLine({ card, testID }: { card: AlertCard; testID?: string }) {
  const peak = card.outcome?.peak;
  if (!peak) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }} testID={testID}>
      <T {...type.nano} c={color.dim}>{(card.outcome?.peak_label ?? 'Peak').toUpperCase()}</T>
      <Num size={13} weight="bold" c={color.green}>{peak}</Num>
      {card.outcome?.basis ? <T size={11} c={color.muted} style={{ flex: 1 }}>{card.outcome.basis}</T> : null}
    </View>
  );
}

/**
 * The whole "is there anything to act on" block.
 *
 * IT RENDERS THE SAME READ THE TRADE PORTAL RENDERS — `readPortal` from
 * `portal2/read.ts`, unmodified. That is not code thrift, it is the point: this
 * page and the Trade screen must not be able to disagree about whether a symbol
 * has a plan on it, and the only way to guarantee that is for both of them to
 * ask the same pure function. Every honesty rule in that file — a setup is
 * graded only when a real alert row carries a letter, an entry with no stop is
 * not a plan — therefore holds here for free.
 */
export function NowBlock({
  read, card, showContract, onOpen, testID,
}: {
  read: TradeRead;
  card: AlertCard | null;
  /** The options line belongs to the day-trade desk. */
  showContract: boolean;
  onOpen: () => void;
  testID?: string;
}) {
  const contract = showContract ? pickContract(card) : null;

  return (
    <Block
      eyebrow={read.takeable ? 'On the desk now' : 'Nothing to act on'}
      testID={testID}
      aside={
        read.gradeable && read.grade_display ? (
          <View
            testID="ticker-now-grade"
            style={{
              paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill,
              backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50,
            }}
          >
            <T size={11.5} weight="bold" c={color.violetLight}>{read.grade_display}</T>
          </View>
        ) : null
      }
    >
      <View style={{ gap: 10 }}>
        {read.descriptor ? <T {...type.nano} c={color.dim}>{read.descriptor.toUpperCase()}</T> : null}

        {/*
          THE HEADLINE IS DROPPED ON THE GENUINELY EMPTY PAGE, and only there.

          On a symbol with nothing on it the live page said the same thing three
          times in four inches: the eyebrow "NOTHING TO ACT ON", then "I have no
          graded setup on KO right now, so I am not going to hand you a plan.",
          then Kai's own "I have no graded setup on KO right now, so I have no
          view to give you on it." Repetition of an absence reads as the app
          protesting too much. The eyebrow states it once; the body then gets on
          with the useful half, which is what Kai CAN measure.

          The moment anything has been graded, or there is a plan to take, the
          headline is the most important sentence on the page and it stays.
        */}
        {read.gradeable || read.takeable ? (
          <T size={15} lh={21} weight="semibold" testID="ticker-headline">{read.headline}</T>
        ) : null}

        {/*
          KAI'S INTERPRETATION IS NOT PRINTED HERE, and the omission is the
          point. `read.interpretation` is `alert.kai_interpretation` — the exact
          paragraph `KaiView` renders further down this same page. The first
          live screenshot had it twice, word for word, a hundred pixels apart,
          which makes the page look like it was assembled by two people who had
          not spoken. This block is the DESK's read — the grade, the levels, the
          line that ends the trade. Kai's prose belongs to Kai's surface.
        */}

        {/*
          THE LEVELS, DIVIDED BY A RULE RATHER THAN BOXED.
          Three tinted pills side by side is the shape this app uses on a SETUP
          OBJECT, where the card is the object. Here the levels are part of a
          sentence the block is making, so they get a hairline between them and
          nothing else — the ink is what says which is which.
        */}
        {read.because.length ? (
          <View
            testID="ticker-now-levels"
            style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: alpha.ivory08, paddingTop: 10 }}
          >
            {read.because.map((lvl, i) => (
              <View
                key={lvl.key}
                testID={`ticker-level-${lvl.key}`}
                style={{
                  flex: 1,
                  paddingLeft: i === 0 ? 0 : 11,
                  borderLeftWidth: i === 0 ? 0 : 0.5,
                  borderLeftColor: alpha.ivory08,
                  gap: 3,
                }}
              >
                <Num size={14} weight="bold" c={LEVEL_INK[lvl.key] ?? color.text}>
                  {lvl.price2 ? `${money(lvl.price)}–${money(lvl.price2)}` : money(lvl.price)}
                </Num>
                <T {...type.nano} c={color.dim}>
                  {lvl.label.split(' ')[0].toUpperCase()}
                </T>
              </View>
            ))}
          </View>
        ) : null}

        {/* The sentence that ends the trade. Red, and it gets its own line. */}
        {read.wrong_if ? (
          <T size={12.5} c={color.red} lh={18} testID="ticker-wrong-if">{read.wrong_if}</T>
        ) : null}

        {contract ? <ContractLine c={contract} testID="ticker-contract" /> : null}
        {card ? <PeakLine card={card} testID="ticker-peak" /> : null}

        {/*
          WHAT KAI CAN DO INSTEAD, when there is no graded setup. This is the
          quiet page's most important sentence: it is the difference between a
          screen with nothing on it and a screen that has considered the
          question and is telling you the answer.
        */}
        {/*
          `blocked_plain` ONLY WHEN SOMETHING WAS ACTUALLY GRADED.

          It is the Take step's sentence — "why can I not build an order" — and
          on a symbol with no setup at all it contradicts the headline directly
          above it. The live page read: "I have no graded setup on KO right now,
          so I am not going to hand you a plan. There is an entry here but no
          invalidation level…" — which announces an entry one sentence after
          saying there is nothing. (There IS an "entry" in the payload: the
          portal route fills it with the LAST TRADED PRICE when no setup exists,
          which is exactly the trap `portal2/read.ts` documents in its header.)

          When a setup HAS been graded but has no complete plan, the same
          sentence is the most useful thing on the block, so it stays for that.
        */}
        {read.blocked_plain && read.gradeable ? (
          <T size={12.5} c={color.muted} lh={19} testID="ticker-blocked">{read.blocked_plain}</T>
        ) : null}
        {read.offer_plain ? (
          <T size={12.5} c={color.muted} lh={19} testID="ticker-offer">{read.offer_plain}</T>
        ) : null}

        {read.takeable ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            testID="ticker-now-open"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
          >
            <T size={12} weight="semibold" c={color.volt}>Take it in Trade ›</T>
          </Pressable>
        ) : null}
      </View>
    </Block>
  );
}

/**
 * THE BLOCK A FREE ACCOUNT SEES, and it is not an error.
 *
 * `/trade/portal/:symbol` answers 402 for an account whose plan does not cover
 * the desk. The page's first version simply rendered nothing when that
 * happened — the whole "is there anything to act on" section vanished, leaving
 * a chart, a Kai line and a gap where the answer goes. On a free account, which
 * is most accounts, that gap IS the page.
 *
 * A refusal that is working correctly should look like a sentence, not like a
 * hole. So the block keeps its place in the column, states what is behind the
 * plan in the server's own words, and offers the one thing that changes it.
 * There is no grade, no level and no number here — nothing is implied about
 * what the setup WOULD have said, because this screen does not know.
 */
export function LockedNow({
  plain, onSeePlans, testID,
}: { plain: string | null; onSeePlans: () => void; testID?: string }) {
  return (
    <Block eyebrow="On the desk now" testID={testID}>
      <View style={{ gap: 9 }}>
        <T size={13.5} lh={20} c={color.muted} testID="ticker-locked">
          {plain ?? 'The desk’s read on a symbol — the graded setup, its levels and the line that would prove it wrong — comes with a plan.'}
        </T>
        <Pressable
          onPress={onSeePlans}
          accessibilityRole="button"
          testID="ticker-see-plans"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
        >
          <T size={12} weight="semibold" c={color.volt}>See what a plan includes ›</T>
        </Pressable>
      </View>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* The lines the user drew                                             */
/* ------------------------------------------------------------------ */

/**
 * Your own levels, and how far price is from each.
 *
 * VOLT, BECAUSE YOU DREW THEM. This is the one block on the page that is about
 * the member rather than about the market, and it is the reason the page loads
 * the annotations itself instead of leaving them inside the chart: a level is
 * only worth anything relative to where price actually is, and that sentence
 * cannot be said by a component that only knows how to draw.
 */
export function YourLines({ lines, testID }: { lines: UserLine[]; testID?: string }) {
  if (!lines.length) return null;
  return (
    <Block eyebrow="Your lines" testID={testID}>
      <View style={{ gap: 0 }}>
        {lines.slice(0, 4).map((l, i) => (
          <View
            key={l.id}
            testID={`ticker-your-line-${i}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7,
              borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: alpha.ivory08,
            }}
          >
            <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: color.volt }} />
            <T size={12.5} style={{ flex: 1 }} numberOfLines={1}>{l.label}</T>
            <Num size={12.5} c={color.muted}>{money(l.price)}</Num>
            <T size={11.5} c={color.volt} style={{ width: 74, textAlign: 'right' }}>
              {distancePlain(l.distance_pct)}
            </T>
          </View>
        ))}
      </View>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* What members are calling on this symbol                             */
/* ------------------------------------------------------------------ */

/**
 * Members' calls on this ticker, in the belt-edged card they own everywhere
 * else in the app.
 *
 * `compact` on purpose: on a contributor's profile the authorship block is the
 * subject, and here it is not — the subject is the symbol, and the member is
 * one attribute of a call about it. The belt still colours the edge and the
 * name, because that is the whole grammar of who is talking.
 *
 * NEVER GRADED. A call has no letter and no score bar, and putting one beside
 * the graded block above without that distinction being visible is the single
 * confusion this product most needs to avoid. The eyebrow says "members", the
 * block sits below the desk's own read, and the card itself has no medallion.
 */
export function CallsOnSymbol({
  calls, symbol, testID,
}: { calls: CommunityCall[]; symbol: string; testID?: string }) {
  if (!calls.length) return null;
  return (
    <Block
      eyebrow={`Members on ${symbol}`}
      testID={testID}
      aside={<T {...type.nano} c={color.dim}>{calls.length === 1 ? '1 CALL' : `${calls.length} CALLS`}</T>}
    >
      <View style={{ gap: 8 }}>
        {calls.slice(0, 3).map((c) => (
          <CommunityCallCard key={c.id} call={c} compact testID={`ticker-call-${c.id}`} />
        ))}
      </View>
    </Block>
  );
}
