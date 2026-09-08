import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { alpha, color, gradientAngle, radius } from '../../ui/tokens';
import { T, Num, Eyebrow } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
// A ticker is never plain text and never a letter in a gradient square — the
// one shared mark lives in the design system now (see src/ui/Ticker.tsx).
import { TickerMark } from '../../ui/Ticker';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { GradeMedallion, GradeChip, gradeBand } from '../grade';
// The contract is a graphic now, not a tile of label/value rows — see the
// header of ContractGraphic.tsx for why the half-width box had to go.
import { ContractSection, ContractLine } from './ContractGraphic';
// The kit. Not a fourth private chart, not a fifth private meter — the same
// three objects the order ticket, the receipt and the position screen draw.
import { TradeMap, RiskRewardRuler, TradeStatusStrip } from '../../ui/trade';
import { openKaiSheet } from '../kai-sheet';
import { useAlertCandles } from './useAlertCandles';
import {
  availability, exitPlan, hasMappableLevel, ideaFromAlert, levelText, rewardPlan,
  setupKind, setupTypeLabel,
} from './trade-idea';
import type {
  AlertCard as AlertCardModel, AlertCardState, AlertScoreComponent,
} from '../../lib/types';

/**
 * The STANDARD actionable alert card — docs/10 §2/§3/§5.
 * One component for Active, Watching and History. The card is understandable
 * without opening the chart; the CTA is the ONE state-driven primary action
 * and it always lands in the Trade Portal with the alert context.
 *
 * Route contract with lane MOBILE-B:
 *     /trade/[symbol]?alert=<id>&ctx=alert
 *
 * ── AUDIT F06: THE DECISION IS NOT BEHIND THE FOLD ANY MORE ──────────────
 *
 * This card used to keep entry, stop and target INSIDE the expanded state, at
 * 8.5-pixel labels over 12-pixel values, and put the score bars and three
 * paragraphs of narration in front of them. So the most useful four facts on a
 * trade object cost a tap to reach and were the smallest text on the card when
 * you got there, and a strong setup was indistinguishable in the list from a
 * headline about nothing.
 *
 * The audit's prescription is `SetupPreview`'s own contents as the DEFAULT
 * object: identity, setup type, availability state, a price map, the three
 * levels, a risk-reward ruler and one short explanation — with evidence, the
 * score breakdown and the longer discussion collapsed instead. That is the
 * order the card is now in, and the map, the ruler and the lifecycle strip are
 * the kit's (`src/ui/trade`), reading `TradeIdea` through the seam in
 * `trade-idea.ts` exactly as the order screens read theirs through
 * `features/orders/trade-idea.ts`.
 *
 * ── AND THREE PRODUCTS, NOT ONE TEMPLATE ─────────────────────────────────
 *
 * A complete swing setup and an unusual-options print are different objects and
 * the card refuses to make them look alike. Identity and state styling are
 * shared; levels, grade and reward ratio are drawn only where the engine
 * computed them. Where it did not, the card says "No exit plan supplied" in as
 * many words rather than leaving a tidy gap, and the options family is offered
 * "Explain this signal" BEFORE it is offered a plan — a member who understands
 * a stock setup has not thereby been taught what a call contract is.
 */

/** States where acting on the trade is the point → filled volt. */
const ACTING = new Set<AlertCardState>(['ready', 'entry_reached', 'planned', 'order_pending', 'position_active']);

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Path d="M6 9l6 6 6-6" stroke={color.muted} strokeWidth={2.5} />
    </Svg>
  );
}

/**
 * A LEVEL, AT THE SIZE A DECISION IS ACTUALLY MADE AT.
 *
 * 8.5 over 12 was the audit's evidence for F06 and it is now 13 over 22 — the
 * ramp in `tokens.ts` reserves 22–30 for "the numbers a decision turns on", and
 * an entry is the definition of one. Two consequences follow and both are
 * deliberate:
 *
 *   · THE CELLS WRAP INSTEAD OF SHRINKING. `flexBasis` with `flexWrap` on the
 *     parent puts two per row on a phone and one per row at the largest text
 *     scale, rather than squeezing four columns until "242–245" clips. A number
 *     is never truncated in this product; it wraps or it takes another row.
 *   · NOTHING IS CENTRED. Left-aligned label over left-aligned value keeps a
 *     ragged-width column legible when the value is a zone rather than a price.
 */
function LevelCell({ label, value, c, bg, border, mark, testID }: {
  label: string; value: string; c: string; bg: string; border: string;
  mark?: React.ReactNode; testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={`${label} ${value}`}
      style={{
        flexGrow: 1, flexBasis: 104, minWidth: 0,
        paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12,
        backgroundColor: bg, borderWidth: 0.5, borderColor: border,
      }}
    >
      <T size={13} c={color.muted}>{label}</T>
      <Num size={22} weight="semibold" c={c} style={{ marginTop: 3 }}>{value}</Num>
      {mark ? <View style={{ marginTop: 5 }}>{mark}</View> : null}
    </View>
  );
}

/**
 * A LEVEL THE ENGINE NEVER COMPUTED, SAID OUT LOUD.
 *
 * "Do not manufacture absent grades, stops, targets or reward ratios to fill a
 * beautiful template. Use a visible No exit plan supplied state where relevant"
 * — the audit, F06. Gold rather than red: this is a gap in what was published,
 * not a loss, and red here would read as an invalidation.
 *
 * It sits IN the levels row, occupying the space the missing box would have
 * taken, because the absence belongs where the number would have been.
 */
function AbsentLevel({ line, detail, testID }: { line: string; detail?: string | null; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityLabel={detail ? `${line}. ${detail}` : line}
      style={{
        flexGrow: 1, flexBasis: 104, minWidth: 0,
        paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12,
        borderWidth: 0.5, borderColor: alpha.gold40, backgroundColor: alpha.gold08,
      }}
    >
      <T size={13} weight="semibold" c={color.gold} lh={18}>{line}</T>
      {detail ? <T size={12} c={color.muted} lh={17} style={{ marginTop: 4 }}>{detail}</T> : null}
    </View>
  );
}

/**
 * A grade bar — the same 0–100 scale and the same band colours as the
 * medallion, so the bar reads as a GRADE and not as a progress meter. The
 * readout on the right is the word or the number; colour only reinforces it.
 *
 * There is no empty state. A bar is drawn only where something was measured,
 * because an empty track would read as a measurement of zero.
 */
function GradeBar({ label, pct, readout, mono, testID }: {
  label: string; pct: number; readout: string; mono?: boolean; testID?: string;
}) {
  const tone = gradeBand(null, pct).ring;
  const w = Math.max(3, Math.min(100, pct));
  return (
    <View
      testID={testID}
      accessibilityLabel={`${label}, ${readout}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
    >
      {/* Wide enough for "Options activity" on one line — a wrapped label
          pushes the three bars out of alignment and they stop reading as a set. */}
      <T size={11} c={color.muted} numberOfLines={1} style={{ width: 99 }}>{label}</T>
      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
        <View style={{ width: `${w}%`, height: '100%', borderRadius: 3, backgroundColor: tone }} />
      </View>
      {mono
        ? <Num size={11} c={tone} style={{ minWidth: 46, textAlign: 'right' }}>{readout}</Num>
        : <T size={11} c={tone} style={{ minWidth: 46, textAlign: 'right' }}>{readout}</T>}
    </View>
  );
}

type Bar = { key: string; label: string; pct: number; readout: string; mono?: boolean };

const pick = (components: AlertScoreComponent[], keys: string[]) =>
  components.find((c) => keys.includes((c.key ?? '').toLowerCase())) ?? null;

/** 5 segments → the 0–100 band scale the medallion already speaks. */
const fromSegments = (strength: number) => Math.max(0, Math.min(100, Math.round((strength / 5) * 100)));

/** "2.4:1" · "2.4 to 1" · "2.4" → 2.4. Anything else is not a number. */
function rrRatio(rr?: string | null): number | null {
  if (!rr) return null;
  const m = rr.match(/(\d+(?:\.\d+)?)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A component the scorer actually MEASURED, or nothing.
 *
 * `scoreComponents` on the server returns all five specs for the mode every
 * time, and fills the ones it has no reading for with `status: 'Unknown'` and
 * `strength: 0`. That is right for the scorecard, where "I have no read on
 * this" is a sentence worth printing — and wrong for a BAR, because a bar of
 * length zero is a picture of "as bad as it gets", not of "not measured". The
 * two must not look the same, and at 0 of 5 segments they do.
 *
 * So a bar is drawn from a component only when the scorer put a reading in it.
 * This matters most for the unusual-options-activity family, which measures one
 * thing and leaves four Unknown — under the old rule that card drew three
 * quarters of a scorecard in empty bars and looked like a terrible setup rather
 * than a narrow one.
 */
function measured(c: AlertScoreComponent | null): AlertScoreComponent | null {
  if (!c) return null;
  return c.status.trim().toLowerCase() === 'unknown' ? null : c;
}

/**
 * The three bars, in the order a trader reads them. A bar appears only when
 * there is something behind it: a score from the engine, or a component the
 * scorer actually filled in. Nothing is invented to keep the row even.
 */
function tradeBars(alert: AlertCardModel): Bar[] {
  const s = alert.scores ?? {};
  const comps = alert.score_components ?? [];
  const bars: Bar[] = [];

  const trendC = measured(pick(comps, ['trend']));
  if (s.trend != null) bars.push({ key: 'trend', label: 'Trend strength', pct: s.trend, readout: String(Math.round(s.trend)), mono: true });
  else if (trendC) bars.push({ key: 'trend', label: 'Trend strength', pct: fromSegments(trendC.strength), readout: trendC.status });

  const rrC = measured(pick(comps, ['risk_reward', 'rr']));
  const ratio = rrRatio(alert.trade.rr);
  // 3 to 1 fills the bar — past that the extra reward is not what decides it.
  const rrPct = s.rr ?? (ratio != null ? Math.round(Math.min(ratio / 3, 1) * 100) : rrC ? fromSegments(rrC.strength) : null);
  if (rrPct != null) {
    bars.push({
      key: 'rr',
      label: 'Risk:Reward',
      pct: rrPct,
      readout: alert.trade.rr ?? (rrC ? rrC.status : String(Math.round(rrPct))),
      mono: !!alert.trade.rr,
    });
  }

  const optC = measured(pick(comps, ['options_activity', 'options', 'options_flow']));
  if (s.options_activity != null) {
    bars.push({ key: 'options', label: 'Options activity', pct: s.options_activity, readout: String(Math.round(s.options_activity)), mono: true });
  } else if (optC) {
    bars.push({ key: 'options', label: 'Options activity', pct: fromSegments(optC.strength), readout: optC.status });
  }

  return bars;
}

/** State label carries a dot + word — never colour alone. */
function stateTone(state: AlertCardState): string {
  if (state === 'entry_reached' || state === 'ready' || state === 'position_active') return color.green;
  if (state === 'invalidated') return color.red;
  if (state === 'closed') return color.muted;
  return color.gold;
}


/**
 * IS ANYTHING OF YOURS RUNNING ON THIS — the sentence, not the inference.
 *
 * The audit's acceptance test for F06 ends "…and whether this is only an idea
 * or an active order". A lifecycle rail answers that to somebody who already
 * knows what the four dots mean. This line answers it to everybody else, and it
 * is above the fold on every card because it is the one fact that changes what
 * the numbers underneath are FOR.
 */
function AvailabilityLine({ alert, testID }: { alert: AlertCardModel; testID?: string }) {
  const a = availability(alert);
  const tone = a.kind === 'idea' ? color.muted : a.kind === 'over' ? color.dim : color.gold;
  return (
    <T size={13} lh={19} c={tone} testID={testID}>{a.line}</T>
  );
}

export function StandardAlertCard({ alert, testID }: { alert: AlertCardModel; testID?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [story, setStory] = useState(false);
  const band = gradeBand(alert.grade, alert.score);
  const acting = ACTING.has(alert.state);
  const trade = alert.trade;
  const bars = tradeBars(alert);
  const contracts = alert.recommended_options ?? [];
  const hasStory = !!(alert.company_summary || alert.kai_interpretation || alert.community);

  /*
    WHICH PRODUCT, AND WHAT MAY BE DRAWN FROM IT. Every one of these is a
    question about the DATA — see `trade-idea.ts`, which is the only place that
    decides — so a card never has to ask what mode it is in to know what it is
    allowed to show.
  */
  const kind = setupKind(alert);
  const mappable = hasMappableLevel(alert);
  // Bars only where the map has a line to draw. The options family has no
  // levels at all, so it never pays for a candle request.
  const candles = useAlertCandles(alert.symbol, mappable);
  const idea = ideaFromAlert(alert, candles);
  const exit = exitPlan(alert);
  const reward = rewardPlan(alert, idea);

  const current = levelText(trade.current);
  const entry = levelText(trade.entry);
  const stop = levelText(trade.stop);
  const target = levelText(trade.target);
  const hasStrip = !!(current || entry || stop || target || exit.kind !== 'complete');

  /**
   * How long you are meant to hold it, and when the setup stops counting —
   * one plain line. Either half can be missing; a missing half is left out
   * rather than shown as a dash, which would read as "no plan".
   */
  const holdPlan = [trade.hold, trade.expires ? `expires ${trade.expires}` : null]
    .filter(Boolean).join(' · ');

  const openPortal = () =>
    router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.alert_id ?? alert.id)}&ctx=alert`);

  return (
    <LinearGradient
      testID={testID ?? `alert-card-${alert.symbol}`}
      colors={[band.cardVeil, alpha.surface70]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: radius.xxxl, borderWidth: 1, borderColor: band.cardBorder, padding: 15, gap: 11 }}
    >
      {/* Identity — logo, ticker, company, mode, direction, instrument */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TickerMark symbol={alert.symbol} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable
            onPress={() => router.push(`/symbol/${encodeURIComponent(alert.symbol)}`)}
            accessibilityRole="button"
            testID={`alert-ticker-${alert.symbol}`}
          >
            <T size={18} weight="bold">{alert.symbol}</T>
          </Pressable>
          {/* The company's NAME, at a size somebody reads. It used to share a
              10-pixel line with the mode, the direction and the instrument. */}
          {alert.company ? <T size={13} c={color.muted}>{alert.company}</T> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T size={13} weight="bold" c={stateTone(alert.state)}>{alert.state_label}</T>
          {alert.triggered_at_label ? <T size={12} c={color.muted}>{alert.triggered_at_label}</T> : null}
        </View>
      </View>

      {/*
        WHAT KIND OF THING THIS IS, AND WHETHER ANYTHING IS RUNNING.
        "Swing setup · Long · equity" then "An idea. No order has been placed."
        Two lines, before any number, because they are what tell a beginner how
        to read every number that follows.
      */}
      <View style={{ gap: 3 }} testID={`alert-type-${alert.symbol}`}>
        <T size={13} weight="semibold" c={color.text}>
          {[setupTypeLabel(alert), alert.direction_label, alert.instrument_label].filter(Boolean).join(' · ')}
        </T>
        <AvailabilityLine alert={alert} testID={`alert-availability-${alert.symbol}`} />
      </View>

      {/* Quality + event — the medallion is the dominant object */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <GradeMedallion grade={alert.grade} score={alert.score} size={78} testID={`medallion-${alert.symbol}`} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={17} weight="bold" lh={22}>{alert.headline}</T>
          {alert.what_changed ? (
            <T size={13.5} c={color.muted} lh={19} style={{ marginTop: 6 }}>{alert.what_changed}</T>
          ) : null}
        </View>
      </View>

      {/*
        THE PRICE MAP — the kit's, drawn compact.

        `TradeMap` takes the same `TradeIdea` the ruler measures, so the picture
        and the meter can never disagree; compact is the mode it already has for
        a card inside a list. It is drawn only where at least one level parsed
        as a real price: a map of nothing is not a map, and the options family
        publishes no levels at all.
      */}
      {mappable ? (
        <View testID={`alert-map-${alert.symbol}`}>
          <TradeMap idea={idea} compact selectedLevel="entry" />
        </View>
      ) : null}

      {/*
        THE LEVELS. FIRST, NOT BEHIND A CHEVRON.

        A LEVEL WITH NO NUMBER IS STILL NOT DRAWN AS ONE — a red box labelled
        "Stop" is read as a stop whatever is printed inside it. What has changed
        is that the absence is now VISIBLE instead of silent: where the engine
        published no exit plan, `AbsentLevel` says so in the space the boxes
        would have taken, and the server's own `note` explains why underneath.
      */}
      {hasStrip ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }} testID={`alert-levels-${alert.symbol}`}>
          {current ? (
            <LevelCell
              label="Current"
              value={current}
              c={color.text}
              bg={alpha.ivory04}
              border={alpha.ivory10}
              testID={`level-current-${alert.symbol}`}
              mark={(
                <FreshnessMark
                  freshness={alert.quote?.freshness ?? 'unknown'}
                  delayReason={alert.quote?.delay_reason}
                  at={alert.quote?.source_ts}
                  size={10}
                  testID={`alert-current-freshness-${alert.symbol}`}
                />
              )}
            />
          ) : null}
          {entry ? (
            <LevelCell label="Entry" value={entry} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} testID={`level-entry-${alert.symbol}`} />
          ) : null}
          {stop ? (
            <LevelCell label="Stop" value={stop} c={color.red} bg={color.redTint} border={alpha.red40} testID={`level-stop-${alert.symbol}`} />
          ) : null}
          {target ? (
            <LevelCell label="Target" value={target} c={color.green} bg={color.greenTint} border={alpha.green40} testID={`level-target-${alert.symbol}`} />
          ) : null}
          {exit.kind !== 'complete' ? (
            <AbsentLevel
              line={exit.line}
              detail={trade.note ?? null}
              testID={`alert-no-exit-${alert.symbol}`}
            />
          ) : null}
        </View>
      ) : null}

      {/* The note, where it was not already spent explaining the absence. */}
      {trade.note && exit.kind === 'complete' ? (
        <T size={13} c={color.muted} lh={19}>{trade.note}</T>
      ) : null}

      {/*
        RISK AND REWARD, IN WHICHEVER OF THE THREE HONEST FORMS APPLIES.

        The kit's ruler when three real prices exist; the setup's own published
        ratio, stated as the string it is, when the entry is a zone and nothing
        can be measured from a single number; and the plain absence when the
        engine computed neither. See `rewardPlan` — the card never derives a
        fourth answer from the other three.
      */}
      {reward.kind === 'measured' ? (
        <View testID={`alert-rr-${alert.symbol}`}><RiskRewardRuler idea={idea} /></View>
      ) : reward.kind === 'stated' ? (
        <View testID={`alert-rr-${alert.symbol}`} style={{ gap: 2 }}>
          <T size={13} c={color.muted}>
            Risk to reward <Num size={17} weight="semibold" c={color.text}>{reward.text}</Num>
          </T>
          <T size={12} lh={17} c={color.dim}>
            Published with the setup. The card does not recompute it — an entry
            zone has no single price to measure from.
          </T>
        </View>
      ) : (
        <T size={13} c={color.muted} testID={`alert-rr-${alert.symbol}`}>{reward.line}</T>
      )}

      {/*
        THE CONTRACT IS THE TRADE, so it is not behind the fold.
        (owner, 7 Sept: "the daytrade alerts and cards are supposed to be
        options based")

        Only the options family is affected, and not by a mode check: the swing
        scanner writes no `recommended_options` at all, so `contracts.length` is
        already the question "is this a contract-led card". A check on the mode
        would be a second answer to that, free to disagree with the data.

        Collapsed, the graphic is COMPACT: the strike rail, the runway of days
        left, the cost and the one-line tradability verdict — enough to decide
        whether to open it. Expanding the card fills the same object in with
        implied volatility, the two score blocks and their evidence.
      */}
      <ContractSection contracts={contracts} symbol={alert.symbol} compact={!open} />

      {/*
        EXPLAIN THE SIGNAL BEFORE OFFERING A PLAN.

        The audit is explicit and it is right: "a beginner who understands a
        stock setup should not be assumed to understand a contract". On a
        contract-led card this sits ABOVE the primary action, in Kai's violet,
        and it asks about the instrument as well as the print — because "what
        did we detect" and "what is a call" are the same question to somebody
        meeting one for the first time.
      */}
      {kind === 'options_activity' ? (
        <Pressable
          onPress={() => openKaiSheet({
            context: { kind: 'alert', id: alert.alert_id ?? alert.id, symbol: alert.symbol },
            question: `Explain this options signal on ${alert.symbol} — what was detected, and what is the contract it names?`,
          })}
          accessibilityRole="button"
          accessibilityLabel="Explain this signal"
          accessibilityHint={`Kai explains what was detected on ${alert.symbol} and what the contract is`}
          testID={`alert-explain-${alert.symbol}`}
          style={({ pressed }) => ({
            minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
            borderWidth: 0.5, borderColor: alpha.violet50, backgroundColor: alpha.violet08,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <T size={14} weight="semibold" c={color.violetLight}>Explain this signal</T>
        </Pressable>
      ) : null}

      {/*
        WHERE IT IS IN ITS LIFE, drawn by the kit's own strip so the four words
        are the same four words the order receipt and the position screen use.
        A state the strip has no step for — invalidated, expired — renders as
        that word alone, which is the strip's own honest behaviour.
      */}
      <TradeStatusStrip status={idea.status} />

      {/* Monitoring progress stays visible on watching cards — and since those
          cards now live inside Active rather than behind a tab of their own,
          this bar is the thing that says which of them is nearly there. */}
      {alert.progress ? (
        <View
          testID={`alert-progress-${alert.symbol}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
        >
          <T size={12} c={color.muted} style={{ width: 78 }}>To trigger</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, alert.progress.pct))}%`, height: '100%', borderRadius: 3, backgroundColor: color.violet }} />
          </View>
          <Num size={12} c={color.muted}>{alert.progress.label}</Num>
        </View>
      ) : null}

      {/* ONE state-driven primary action */}
      <Pressable
        onPress={openPortal}
        accessibilityRole="button"
        accessibilityHint={`Opens the ${alert.symbol} trade portal with this alert loaded`}
        testID={`alert-cta-${alert.symbol}`}
        style={{
          minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          ...(acting
            ? { backgroundColor: color.volt }
            : { borderWidth: 0.5, borderColor: alpha.ivory24 }),
        }}
      >
        <T size={14.5} weight="bold" c={acting ? color.bg : color.text}>{alert.primary_action.label}</T>
      </Pressable>

      {/*
        WHAT IS COLLAPSED NOW: the evidence, the score breakdown and the longer
        discussion — which is exactly the list the audit asks to fold, and the
        exact opposite of what this chevron used to hide.
      */}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide the evidence' : 'Show the evidence'}
        testID={`alert-expand-${alert.symbol}`}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <T size={13} weight="semibold" c={color.muted}>{open ? 'Hide the evidence' : 'Show the evidence'}</T>
        <Chevron open={open} />
      </Pressable>

      {open ? (
        <>
          {/* What it costs YOU — a number, so it stays with the levels. */}
          {/*
            "Your risk $58" is a number with a label. When there is no number,
            the server sends a SENTENCE instead ("I cannot size this one yet —
            without both an entry and an invalidation level there is no risk to
            size against"), and pouring that into the same slot produced
            "Your risk I cannot size this one yet…" wrapped around a gold dash.
            A sentence is rendered as a sentence.
          */}
          {alert.fit ? (
            (() => {
              const amount = alert.fit.risk_amount ?? null;
              const isNumber = !!amount && /^[$\d]/.test(amount.trim());
              if (amount && !isNumber) {
                return <T size={13} c={color.muted} lh={19}>{amount}</T>;
              }
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                  {amount ? (
                    <T size={13} c={color.muted}>
                      Your risk <Num size={13} c={color.gold}>{amount}</Num>
                      {alert.fit.cap_line ? ` · ${alert.fit.cap_line}` : ''}
                    </T>
                  ) : <View />}
                  {alert.fit.conflicts ? <T size={13} c={color.muted}>{alert.fit.conflicts}</T> : null}
                </View>
              );
            })()
          ) : null}

          {/*
            How good each part of the trade is, and how long you are meant to
            be in it — one card, because they answer the same question.
          */}
          {bars.length || holdPlan ? (
            <View
              testID={`bars-${alert.symbol}`}
              style={{
                gap: 7, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13,
                backgroundColor: alpha.ivory035, borderWidth: 0.5, borderColor: alpha.ivory10,
              }}
            >
              {bars.map((b) => (
                <GradeBar
                  key={b.key}
                  label={b.label}
                  pct={b.pct}
                  readout={b.readout}
                  mono={b.mono}
                  testID={`bar-${b.key}-${alert.symbol}`}
                />
              ))}
              {holdPlan ? (
                <View
                  testID={`hold-plan-${alert.symbol}`}
                  accessibilityLabel={`Hold plan, ${holdPlan}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 9,
                    ...(bars.length ? { paddingTop: 8, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 } : null),
                  }}
                >
                  <T size={11} c={color.muted} numberOfLines={1} style={{ width: 99 }}>Hold plan</T>
                  <T size={11} c={color.text} style={{ flex: 1 }}>{holdPlan}</T>
                </View>
              ) : null}
            </View>
          ) : null}

          {/*
            The words. None of it is deleted — company, Kai's read and what the
            room is saying are all still here, they just no longer stand
            between the trader and the levels.
          */}
          {hasStory ? (
            <View style={{ gap: 9, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
              <Pressable
                onPress={() => setStory((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={story ? 'Hide the story' : 'Read the story'}
                testID={`alert-story-${alert.symbol}`}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <T size={13} weight="semibold" c={color.violetLight}>{story ? 'Hide the story' : 'The story'}</T>
                <Chevron open={story} />
              </Pressable>

              {story ? (
                <>
                  {alert.company_summary ? (
                    <T size={13.5} c={color.muted} lh={19}>{alert.company_summary}</T>
                  ) : null}

                  {alert.kai_interpretation ? (
                    <LinearGradient
                      colors={[alpha.violet18, alpha.violet05]}
                      start={gradientAngle.start}
                      end={gradientAngle.end}
                      style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, borderWidth: 0.5, borderColor: alpha.violet45 }}
                    >
                      <KaiOrb size={18} glow={false} />
                      <T size={13.5} lh={19} style={{ flex: 1 }}>
                        {alert.kai_interpretation}{' '}
                        <T size={13.5} c={color.muted}>Kai's assessment, not a guarantee.</T>
                      </T>
                    </LinearGradient>
                  ) : null}

                  {alert.community ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T size={12} weight="semibold" c={color.violetLight}>Community</T>
                      <T size={12} c={color.muted} style={{ flex: 1 }}>
                        {[
                          alert.community.bullish_pct != null ? `${alert.community.bullish_pct}% bullish` : null,
                          alert.community.sample != null ? `${alert.community.sample} posts` : null,
                          alert.community.verification ? `volume claim ${alert.community.verification}` : null,
                        ].filter(Boolean).join(' · ')}
                      </T>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}

          {alert.freshness_line ? (
            <T size={11} c={color.muted} align="center">{alert.freshness_line}</T>
          ) : null}
        </>
      ) : null}
    </LinearGradient>
  );
}

/**
 * One number on a History row, with the word for what it is above it.
 *
 * THERE IS NO EMPTY STATE AND THERE IS NO PLACEHOLDER. A cell is built only
 * where a measurement exists; the caller drops it entirely otherwise. This is
 * the same rule the trade card's levels follow, and for the same reason — an
 * em-dash under a label called "Peak" is read as a peak of nothing, which is a
 * claim, not a gap.
 *
 * Cells are separated by space and by their own labels, not by tinted boxes or
 * rules: a box inside a card is a card inside a card, and four of them turn a
 * record into a dashboard. Weight and size carry the hierarchy instead — which
 * also buys the width four numbers need to sit on ONE line at 390pt, and one
 * line is the point. A stat row that wraps is two rows pretending to be one.
 *
 * Sizes are picked off the widest value each cell can actually hold in this
 * corpus (a +400.0% peak, a +242.1% result, a $954.52 call, "5 sessions"), so
 * nothing here truncates a number. Numbers must never be truncated; the
 * fallback is to wrap, never to clip.
 */
function StatCell({ label, value, tone, size, minWidth, testID }: {
  label: string; value: string; tone?: string; size: number; minWidth: number; testID?: string;
}) {
  return (
    <View testID={testID} accessibilityLabel={`${label}, ${value}`} style={{ minWidth }}>
      {/* Authored at 8.5 and clamped to the 11-pixel floor by `T` (F20) since
          the accessibility lane landed. It is written as 11 now so the number
          on the page is the number on the screen. */}
      <T size={11} weight="bold" c={color.dim} ls={0.7}>{label.toUpperCase()}</T>
      <Num size={size} weight={size >= 18 ? 'bold' : 'semibold'} c={tone ?? color.text} style={{ marginTop: 3 }}>
        {value}
      </Num>
    </View>
  );
}

/** Points into the row, so the whole card reads as somewhere to go. */
function ChevronRight() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color.dim} strokeWidth={2.5} />
    </Svg>
  );
}

/**
 * History row — the audit trail, not a decision object (spec §1).
 *
 * IT IS A RECORD OF NUMBERS, NOT A STORY ABOUT THEM. What was called, the best
 * it got, what it did, how long it took. The narration this row used to print —
 * `what_changed`, and the outcome's `plain` paragraph — is still on the model
 * and still served, and a tap still opens the whole thing in the Trade Portal.
 * It is off the row because twenty-six paragraphs stacked on a phone is not a
 * record anybody reads; four columns of numbers is.
 *
 * The one line that survives is the one that says how the numbers were
 * measured, or — for a replayed alert — that nobody was ever sent it. That
 * sentence is not narration, it is the number's own disclosure, and dropping it
 * would leave a large green percentage on a card with nothing qualifying it.
 */
export function HistoryAlertRow({ alert }: { alert: AlertCardModel }) {
  const router = useRouter();
  const bad = alert.state === 'invalidated';
  const outcome = alert.outcome ?? null;
  const contract = (alert.recommended_options ?? [])[0] ?? null;

  /**
   * The stat row, built from what exists. Chronological left to right — what it
   * was called at, the best it reached, where it finished, how long that took —
   * so a row reads as the life of one idea rather than as a table of metrics.
   * The result is the only cell drawn large and the only one that carries
   * colour, which is what makes it the thing the eye lands on first.
   */
  const stats: { key: string; label: string; value: string; tone?: string; size: number; minWidth: number }[] = [];
  /*
    `trade.entry` is a PRICE when the setup published one and a short sentence
    ("Above $124.8.") when it did not — the adapter falls back on purpose, and
    the trade card renders the sentence as a sentence. A stat cell cannot: the
    label above it says "Called", and a sentence under that label reads as a
    price that happens to have words in it. Only a number is admitted; the $ is
    added because this cell sits between two percentages and a bare 124.80
    there is ambiguous in a way it never is on the levels strip.
  */
  const called = alert.trade.entry?.trim() ?? '';
  if (/^[$\d]/.test(called)) {
    stats.push({ key: 'called', label: 'Called', value: called.startsWith('$') ? called : `$${called}`, size: 14, minWidth: 72 });
  }
  if (outcome?.peak) {
    stats.push({ key: 'peak', label: outcome.peak_label ?? 'Peak', value: outcome.peak, size: 14, minWidth: 62 });
  }
  if (outcome?.value) {
    stats.push({
      key: 'result',
      label: 'Result',
      value: outcome.value,
      tone: outcome.tone === 'bad' ? color.red : outcome.tone === 'good' ? color.green : color.text,
      // A three-figure return ("+242.1%") is three glyphs wider than a normal
      // one and is exactly the row that must not wrap — it is the best result
      // in the book. The type gives way, the number does not.
      size: outcome.value.length >= 7 ? 17 : 20,
      minWidth: 78,
    });
  }
  // "5 sessions" is the widest value in the row and the least important, so it
  // is the one that gives up a point of type to keep all four on one line.
  if (alert.held) stats.push({ key: 'held', label: 'Held', value: alert.held, size: 13, minWidth: 72 });

  /**
   * The single muted line. A rehearsal says so before anything else it could
   * say — that is the one fact about this row that changes what every number
   * above it means. Otherwise it is the measurement basis, and where there is
   * neither, the headline, so the row is never a bare set of numbers with no
   * word on it at all.
   */
  const note = alert.replay
    ? 'Rehearsal, not an alert anyone was sent.'
    : outcome?.basis ?? (stats.length ? null : alert.headline || null);

  return (
    <Pressable
      onPress={() => router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.id)}&ctx=alert`)}
      accessibilityRole="button"
      accessibilityHint={`Opens the full record for this ${alert.symbol} alert`}
      testID={`alert-history-${alert.symbol}`}
    >
      <LinearGradient
        colors={bad ? [alpha.red06, alpha.surface70] : [alpha.ivory05, alpha.surface70]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{ borderRadius: radius.xl, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 0.5, borderColor: bad ? alpha.red35 : alpha.ivory14, gap: 11 }}
      >
        {/* Who, which way round, how well graded, and when it finished. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TickerMark symbol={alert.symbol} size={22} />
          <T size={15} weight="bold">{alert.symbol}</T>
          {/*
            Direction is part of the record, not decoration: a short read as a
            long is read backwards. It sits next to the ticker on every history
            row so the numbers underneath can only be read one way.
          */}
          {alert.direction_label ? (
            <View
              testID={`direction-${alert.symbol}`}
              style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: alpha.ivory08 }}
            >
              <T size={10} weight="semibold" c={color.muted} style={{ textTransform: 'capitalize' }}>{alert.direction_label}</T>
            </View>
          ) : null}
          {/*
            GradeChip draws nothing for an ungraded object — the day-trade
            family issues no letter and must not be given one here.
          */}
          <GradeChip grade={alert.grade} score={alert.score} />
          <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
            {alert.resolved_label ? <T size={10} c={color.muted}>{alert.resolved_label}</T> : null}
            {/* The word, always — the red wash on an invalidated row is never the only thing saying so. */}
            <T size={10.5} weight="semibold" c={bad ? color.red : color.muted}>{alert.state_label}</T>
          </View>
          <ChevronRight />
        </View>

        {/*
          The body: the numbers. `outcome-<symbol>` stays on the result cell —
          it is still the "this one was measured" marker the proofs count, and
          it is still absent on a row nothing measured.
        */}
        {stats.length ? (
          <View
            testID={`stats-${alert.symbol}`}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 11, rowGap: 9 }}
          >
            {stats.map((s) => (
              <StatCell
                key={s.key}
                label={s.label}
                value={s.value}
                tone={s.tone}
                size={s.size}
                minWidth={s.minWidth}
                testID={s.key === 'result' ? `outcome-${alert.symbol}` : `stat-${s.key}-${alert.symbol}`}
              />
            ))}
          </View>
        ) : null}

        {/*
          The contract, where the engine named one — ONE LINE, and it stays one
          line. The active card got a full graphic on 7 Sept; this row did not,
          because a record is read in a column of twenty-six other records and a
          card there is not a record. Implied volatility joined the line (owner
          named it) and nothing else did. What the contract went on to DO is
          still not here, because nothing stores it (see the report); the cost
          is what was paid, and it says so.
        */}
        {contract ? <ContractLine c={contract} symbol={alert.symbol} /> : null}

        {note ? <T size={10.5} c={color.dim} lh={15}>{note}</T> : null}
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Nothing here — and somewhere to go.
 *
 * A quiet day is a real answer and the copy says so plainly. What it must not
 * do is stop dead: an empty screen with no way off it is the app telling
 * someone to come back later. Every offer below goes to a route that exists.
 */
export function AlertsEmpty({ copy, offers = [] }: {
  copy: string;
  offers?: { label: string; onPress: () => void; testID?: string }[];
}) {
  return (
    <View style={{ paddingVertical: 40, paddingHorizontal: 20, gap: 8, alignItems: 'center' }} testID="alerts-empty">
      <Eyebrow c={color.dim}>NOTHING HERE</Eyebrow>
      <T size={13} c={color.muted} align="center" lh={19}>{copy}</T>
      {offers.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 }}>
          {offers.map((o) => (
            <Pressable
              key={o.label}
              testID={o.testID}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              onPress={o.onPress}
              style={({ pressed }) => ({
                height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: alpha.volt55, backgroundColor: alpha.volt10,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <T size={12.5} weight="semibold" c={color.volt}>{o.label}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
