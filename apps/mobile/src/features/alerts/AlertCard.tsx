import React, { useMemo, useState } from 'react';
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
// The trade object has one home. Identity, the price map, the three levels,
// the risk/reward ruler and the lifecycle are all the kit's — see the header
// of StandardAlertCard below, and docs/trade-ui-MIGRATION.md step 5.
import { SetupPreview, TradeStatusStrip, riskReward, price } from '../../ui/trade';
import { TradeDetail } from '../../ui/trade/TradeDetail';
import { ideaFromAlertCard, isZone, notesFromAlert } from './trade-adapter';
import { openKaiSheet } from '../kai-sheet';
import type {
  AlertCard as AlertCardModel, AlertCardState, AlertScoreComponent, Candle,
} from '../../lib/types';

/**
 * The STANDARD actionable alert card — docs/10 §2/§3/§5.
 * One component for Active, Watching and History. The card is understandable
 * without opening the chart; the CTA is the ONE state-driven primary action
 * and it always lands in the Trade Portal with the alert context.
 *
 * Route contract with lane MOBILE-B:
 *     /trade/[symbol]?alert=<id>&ctx=alert
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
 * `mark` is the freshness of a LIVE number, and only "Current" has one.
 *
 * Entry, stop and target are levels the engine decided; they do not go stale,
 * they get hit or they do not. "Current" is the market's own number and the
 * house rule (`src/ui/Price.tsx` — "no price without freshness") applies to it
 * exactly as it does everywhere else. It was the one price-bearing cell in the
 * app that omitted the mark, which is how a nine-thirty print sat in a Current
 * box at two in the afternoon with nothing on the card saying so.
 */
function LevelCell({ label, value, c, bg, border, mark }: {
  label: string; value: string; c: string; bg: string; border: string; mark?: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 3, borderRadius: 10, backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center' }}>
      <T size={8.5} c={color.muted}>{label}</T>
      <Num size={12} weight="semibold" c={c} style={{ marginTop: 2 }}>{value}</Num>
      {mark ? <View style={{ marginTop: 3 }}>{mark}</View> : null}
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
 * THE ALERT IS THE TRADE OBJECT NOW (audit F06, owner 8 September).
 *
 * This card used to be its own thing: its own level cells, its own risk/reward
 * bar parsed out of the string "2.4:1", its own state colours, its own idea of
 * what a setup looks like — while `SetupPreview` sat in `src/ui/trade`
 * unused. The two agreed by coincidence and would have stopped agreeing the
 * first time either was edited. They are one piece of code now.
 *
 * What actually changed for a member, which is the point of the whole exercise:
 * the entry, the stop, the target, the risk/reward and whether this is an idea
 * or an order are ALL visible without expanding. They were behind the fold.
 * The audit's line is the standard to read this against — "the user must
 * inspect the card before learning its most useful facts" — and the five-second
 * test it sets is now answerable at a glance: NVDA, swing setup, waiting for
 * entry, a price path with three levels, risk 1R for 2.6R, one sentence, one
 * action.
 *
 * ── COLLAPSED IS `SetupPreview`, EXPANDED IS `TradeDetail` ─────────────────
 * They are the same object at two depths, not two designs. Identity, headline,
 * chart and levels stay in the same places; expanding makes the levels
 * SELECTABLE and puts Kai's sentence about the chosen one on the chart, then
 * adds the evidence underneath. Nothing moves, so a member never has to
 * re-find what they were reading.
 *
 * ── THE FAMILIES STAY HONEST ───────────────────────────────────────────────
 * A complete swing setup, unusual options activity and a long-term thesis are
 * different products and the audit is explicit that they must not be filled
 * into one beautiful template. So:
 *
 *   · a card with contracts LEADS with the contract graphic, above the chart,
 *     because for that family there is no stock idea underneath it;
 *   · a card with no levels draws NO chart and NO ruler — an empty ruler reads
 *     as a broken ruler, so the server's own sentence about the missing plan
 *     stands in its place;
 *   · a card with no grade says "No grade" in a dotted ring rather than
 *     quietly omitting the badge, which reads as ungraded-LOOKING;
 *   · the risk/reward ruler is drawn only where all three levels parse into a
 *     coherent plan. `riskReward` is the single judge of that, imported rather
 *     than re-derived here.
 *
 * The contract graphic is composed, not discarded: `ContractSection` is still
 * the same component, still compact above the fold and filled in on expand.
 */
export function StandardAlertCard({ alert, testID, candles }: {
  alert: AlertCardModel;
  testID?: string;
  /** Bars from `/market/candles` — the alert wire carries none. See useAlertCandles. */
  candles?: readonly Candle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [story, setStory] = useState(false);
  const band = gradeBand(alert.grade, alert.score);
  const acting = ACTING.has(alert.state);
  const trade = alert.trade;
  const bars = tradeBars(alert);
  const contracts = alert.recommended_options ?? [];
  const hasStory = !!(alert.company_summary || alert.kai_interpretation || alert.community);

  const idea = useMemo(() => ideaFromAlertCard(alert, { candles }), [alert, candles]);
  const notes = useMemo(() => notesFromAlert(alert), [alert]);
  const hasLevels = idea.entry != null || idea.stop != null || idea.target != null;
  const hasPlan = riskReward(idea) !== null;
  const contractLed = contracts.length > 0;
  /**
   * A ZONE IS NOT A PRICE, AND A RATIO MEASURED OFF ITS EDGE IS A BEST CASE.
   *
   * The wire sends entries as zones — `'504–507'` — and the kit's ruler works
   * from one number per level. Feeding it the near edge would produce a
   * confident risk/reward that is arithmetically fine and quietly flattering:
   * it prices a fill at the best end of a range the member has not got yet.
   *
   * So a card with a zone in it does not draw the computed ruler. It shows the
   * server's own ratio, which was measured by whatever actually knows how this
   * engine sizes a zone, and it says where that number came from.
   */
  const zoned = isZone(trade.entry) || isZone(trade.stop) || isZone(trade.target);
  /** The wire's words for each level, so a zone prints as the zone it is. */
  const levelText = {
    entry: trade.entry ?? null,
    stop: trade.stop ?? null,
    target: trade.target ?? null,
  };
  /* No levels and no bars is nothing to draw. The kit would say so in words,
     but a chart frame reporting its own emptiness on every card of a family
     that never has one is furniture, not information. */
  const showMap = hasLevels || (candles?.length ?? 0) > 0;

  /**
   * How long you are meant to hold it, and when the setup stops counting —
   * one plain line. Either half can be missing; a missing half is left out
   * rather than shown as a dash, which would read as "no plan".
   */
  const holdPlan = [trade.hold, trade.expires ? `expires ${trade.expires}` : null]
    .filter(Boolean).join(' · ');

  const openPortal = () =>
    router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.alert_id ?? alert.id)}&ctx=alert`);

  /* The setup type, which the audit asks for by name and the wire already
     knows in the member's own words. */
  const eyebrow = [alert.mode_label, alert.direction_label, alert.instrument_label]
    .filter(Boolean).join(' · ');

  /**
   * The lifecycle row, and under it the bar that says how close a watching
   * card is. The pill prints the SERVER's word, never the kit's collapsed one,
   * so a resting order reads "Order pending" and not "Entry reached".
   */
  const statusSlot = (
    <View style={{ gap: 9, marginTop: 12 }}>
      <TradeStatusStrip
        variant="pill"
        status={idea.status}
        label={alert.state_label}
        hint={alert.progress?.label ?? alert.triggered_at_label ?? undefined}
        testID={`alert-state-${alert.symbol}`}
      />
      {alert.progress ? (
        <View
          testID={`alert-progress-${alert.symbol}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
        >
          <T size={11} c={color.muted} style={{ width: 74 }}>To trigger</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, alert.progress.pct))}%`, height: '100%', borderRadius: 3, backgroundColor: color.violet }} />
          </View>
          <Num size={11} c={color.muted}>{alert.progress.label}</Num>
        </View>
      ) : null}
    </View>
  );

  /*
    THE CONTRACT IS THE TRADE, so it is not behind the fold, and for this
    family it is not below the chart either. (owner, 7 Sept: "the daytrade
    alerts and cards are supposed to be options based")

    Only the options family is affected, and not by a mode check: the swing
    scanner writes no `recommended_options` at all, so `contracts.length` is
    already the question "is this a contract-led card". A check on the mode
    would be a second answer to that, free to disagree with the data.

    Collapsed the graphic is COMPACT — strike rail, days left, cost, the
    one-line verdict. Expanding fills the SAME object in with implied
    volatility, the two score blocks and their evidence, rather than moving the
    contract or drawing it twice.
  */
  const lead = contractLed ? (
    <View style={{ marginTop: 14 }}>
      <ContractSection contracts={contracts} symbol={alert.symbol} compact={!open} />
    </View>
  ) : undefined;

  /**
   * WHAT STANDS WHERE THE RULER WOULD BE, WHEN THERE IS NO PLAN TO MEASURE.
   *
   * The unusual-options family has no stop and no target, so there is no ratio
   * — not a ratio of zero, and not a ruler waiting for data. The server
   * already sends a sentence explaining the gap and that sentence is the
   * honest object here; the fallback names the absence plainly rather than
   * leaving the space blank, because a blank reads as nothing to say.
   */
  const plan = hasPlan && !zoned ? undefined : zoned && trade.rr ? (
    <View
      testID={`alert-rr-stated-${alert.symbol}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}
    >
      <T size={12.5} c={color.muted}>Planned risk/reward</T>
      <Num size={14} c={color.text}>{trade.rr}</Num>
      <T size={11.5} c={color.muted} style={{ flex: 1 }}>from Kai's plan</T>
    </View>
  ) : (
    <T
      size={12.5}
      c={color.muted}
      lh={18}
      style={{ marginTop: 12 }}
      testID={`alert-no-plan-${alert.symbol}`}
    >
      {trade.note ?? 'No exit plan supplied.'}
    </T>
  );

  /**
   * THE EVIDENCE, once a member has asked for it.
   *
   * Everything here answers "why should I believe it", which is a different
   * question from "what is it" and belongs behind the expander per F06.
   * Nothing was deleted in the move — the score, the bars, the hold plan, the
   * company, Kai's read and what the room is saying are all still here.
   */
  const evidence = open ? (
    <View style={{ gap: 11, marginTop: 14 }}>
      {/* The live price, with the mark that says how old it is. */}
      {trade.current ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <LevelCell
            label="Current"
            value={trade.current}
            c={color.text}
            bg={alpha.ivory04}
            border={alpha.ivory10}
            mark={(
              <FreshnessMark
                freshness={alert.quote?.freshness ?? 'unknown'}
                delayReason={alert.quote?.delay_reason}
                at={alert.quote?.source_ts}
                size={8}
                testID={`alert-current-freshness-${alert.symbol}`}
              />
            )}
          />
        </View>
      ) : null}

      {/* Where a plan DOES exist, the note is a footnote about it rather than
          the stand-in for it, so it is shown here instead of above. */}
      {hasPlan && trade.note ? (
        <T size={11.5} c={color.muted} lh={17}>{trade.note}</T>
      ) : null}

      {/*
        "Your risk $58" is a number with a label. When there is no number, the
        server sends a SENTENCE instead ("I cannot size this one yet — without
        both an entry and an invalidation level there is no risk to size
        against"), and pouring that into the same slot produced "Your risk I
        cannot size this one yet…" wrapped around a gold dash. A sentence is
        rendered as a sentence.
      */}
      {alert.fit ? (
        (() => {
          const amount = alert.fit.risk_amount ?? null;
          const isNumber = !!amount && /^[$\d]/.test(amount.trim());
          if (amount && !isNumber) {
            return <T size={11} c={color.muted} lh={17}>{amount}</T>;
          }
          return (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {amount ? (
                <T size={11} c={color.muted}>
                  Your risk <Num size={11} c={color.gold}>{amount}</Num>
                  {alert.fit.cap_line ? ` · ${alert.fit.cap_line}` : ''}
                </T>
              ) : <View />}
              {alert.fit.conflicts ? <T size={11} c={color.muted}>{alert.fit.conflicts}</T> : null}
            </View>
          );
        })()
      ) : null}

      {/*
        The score and how good each part of the trade is, and how long you are
        meant to be in it — one card, because they answer the same question.
        The medallion moved here from the top of the card: a 90pt gauge was the
        most dominant object on a card whose most useful facts were invisible,
        and a score is evidence for the idea rather than the idea itself.
      */}
      {alert.score != null || bars.length || holdPlan ? (
        <View
          testID={`bars-${alert.symbol}`}
          style={{
            gap: 9, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13,
            backgroundColor: alpha.ivory035, borderWidth: 0.5, borderColor: alpha.ivory10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            {alert.score != null ? (
              <GradeMedallion
                grade={alert.grade}
                score={alert.score}
                size={62}
                testID={`medallion-${alert.symbol}`}
              />
            ) : null}
            {bars.length ? (
              <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
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
              </View>
            ) : null}
          </View>
          {holdPlan ? (
            <View
              testID={`hold-plan-${alert.symbol}`}
              accessibilityLabel={`Hold plan, ${holdPlan}`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 9,
                ...(alert.score != null || bars.length ? { paddingTop: 8, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 } : null),
              }}
            >
              <T size={11} c={color.muted} numberOfLines={1} style={{ width: 99 }}>Hold plan</T>
              <T size={11} c={color.text} style={{ flex: 1 }}>{holdPlan}</T>
            </View>
          ) : null}
        </View>
      ) : null}

      {/*
        The words, one more tap away. None of it is deleted — company, Kai's
        read and what the room is saying are all still here, they just no
        longer stand between the trader and the levels.
      */}
      {hasStory ? (
        <View style={{ gap: 9, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
          <Pressable
            onPress={() => setStory((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={story ? 'Hide the story' : 'Read the story'}
            testID={`alert-story-${alert.symbol}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <T size={11} weight="semibold" c={color.violetLight}>{story ? 'Hide the story' : 'The story'}</T>
            <Chevron open={story} />
          </Pressable>

          {story ? (
            <>
              {alert.company_summary ? (
                <T size={12} c={color.muted} lh={17}>{alert.company_summary}</T>
              ) : null}

              {/* Kai's read is on the chart now, against the level it is about
                  — so here it is the rider that keeps it honest, not a second
                  copy of the same paragraph. */}
              {alert.kai_interpretation ? (
                <T size={11.5} c={color.muted} lh={17}>Kai's assessment, not a guarantee.</T>
              ) : null}

              {alert.community ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T size={11} weight="semibold" c={color.violetLight}>Community</T>
                  <T size={11} c={color.muted} style={{ flex: 1 }}>
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
    </View>
  ) : null;

  /* Identity, headline, chart, levels, ruler and lifecycle are the kit's now.
     The two components below are the same object at two depths; everything
     passed to them is passed to both, so expanding changes depth and not
     layout. */
  const shared = {
    idea,
    eyebrow,
    lead,
    plan,
    levelText,
    status: statusSlot,
    showMap,
    unframed: true as const,
    showSource: false as const,
    gradeWhenAbsent: 'state' as const,
  };

  return (
    <LinearGradient
      testID={testID ?? `alert-card-${alert.symbol}`}
      colors={[band.cardVeil, alpha.surface70]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ borderRadius: radius.xxxl, borderWidth: 1, borderColor: band.cardBorder, padding: 15, gap: 11 }}
    >
      {open ? (
        <TradeDetail
          {...shared}
          notes={notes}
          askLabel={`Ask Kai about this ${alert.symbol} setup ↗`}
          onAsk={(ctx) => openKaiSheet({
            context: { kind: 'alert', id: alert.alert_id ?? alert.id, symbol: alert.symbol },
            question: ctx.value != null
              ? `Why is the ${ctx.level} on ${ctx.symbol} at ${price(ctx.value, idea.pricePrecision)}?`
              : `What should I know about the ${ctx.level} on ${ctx.symbol}?`,
          })}
        >
          {evidence}
        </TradeDetail>
      ) : (
        <SetupPreview {...shared} />
      )}

      {/* ONE state-driven primary action */}
      <Pressable
        onPress={openPortal}
        accessibilityRole="button"
        accessibilityHint={`Opens the ${alert.symbol} trade portal with this alert loaded`}
        testID={`alert-cta-${alert.symbol}`}
        style={{
          height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
          ...(acting
            ? { backgroundColor: color.volt }
            : { borderWidth: 0.5, borderColor: alpha.ivory24 }),
        }}
      >
        <T size={14.5} weight="bold" c={acting ? color.bg : color.text}>{alert.primary_action.label}</T>
      </Pressable>

      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide setup details' : 'View setup details'}
        testID={`alert-expand-${alert.symbol}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <T size={11.5} weight="semibold" c={color.muted}>{open ? 'Hide setup details' : 'View setup details'}</T>
        <Chevron open={open} />
      </Pressable>

      {open && alert.freshness_line ? (
        <T size={10} c={color.muted} align="center">{alert.freshness_line}</T>
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
      <T size={8.5} weight="bold" c={color.dim} ls={0.7}>{label.toUpperCase()}</T>
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
