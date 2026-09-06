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
import { GradeMedallion, GradeChip, gradeBand } from '../grade';
import type {
  AlertCard as AlertCardModel, AlertCardState, AlertOptionContract, AlertScoreComponent,
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

function LevelCell({ label, value, c, bg, border }: { label: string; value: string; c: string; bg: string; border: string }) {
  return (
    <View style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 3, borderRadius: 10, backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center' }}>
      <T size={8.5} c={color.muted}>{label}</T>
      <Num size={12} weight="semibold" c={c} style={{ marginTop: 2 }}>{value}</Num>
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
 * The three bars, in the order a trader reads them. A bar appears only when
 * there is something behind it: a score from the engine, or a component the
 * scorer actually filled in. Nothing is invented to keep the row even.
 */
function tradeBars(alert: AlertCardModel): Bar[] {
  const s = alert.scores ?? {};
  const comps = alert.score_components ?? [];
  const bars: Bar[] = [];

  const trendC = pick(comps, ['trend']);
  if (s.trend != null) bars.push({ key: 'trend', label: 'Trend strength', pct: s.trend, readout: String(Math.round(s.trend)), mono: true });
  else if (trendC) bars.push({ key: 'trend', label: 'Trend strength', pct: fromSegments(trendC.strength), readout: trendC.status });

  const rrC = pick(comps, ['risk_reward', 'rr']);
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

  const optC = pick(comps, ['options_activity', 'options', 'options_flow']);
  if (s.options_activity != null) {
    bars.push({ key: 'options', label: 'Options activity', pct: s.options_activity, readout: String(Math.round(s.options_activity)), mono: true });
  } else if (optC) {
    bars.push({ key: 'options', label: 'Options activity', pct: fromSegments(optC.strength), readout: optC.status });
  }

  return bars;
}

const LIQUIDITY_WORD: Record<'good' | 'thin', string> = { good: 'Active', thin: 'Thin' };

/**
 * One contract as an object you can look at, not a row in a chain and not a
 * sentence. Strike is the loud thing; call/put is a word, never colour alone.
 */
function ContractCard({ c, grow, testID }: { c: AlertOptionContract; grow?: boolean; testID?: string }) {
  const put = c.type === 'put';
  const tone = put ? color.red : color.green;
  const tint = put ? color.redTint : color.greenTint;
  const days = c.dte != null ? `${c.dte} day${c.dte === 1 ? '' : 's'}` : null;
  return (
    <View
      testID={testID}
      accessibilityLabel={[`${c.strike} ${put ? 'put' : 'call'}`, c.expiry, days, c.cost, c.liquidity ? LIQUIDITY_WORD[c.liquidity] : null]
        .filter(Boolean).join(', ')}
      style={{
        // Two to a row. An odd third card keeps its half width rather than
        // stretching the full width and reading as a different kind of object.
        flexGrow: grow ? 1 : 0, flexBasis: '47%', minWidth: 128, gap: 5,
        paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11,
        backgroundColor: alpha.ivory035, borderWidth: 0.5, borderColor: alpha.ivory10,
      }}
    >
      {c.label ? <T size={8.5} weight="bold" c={color.dim} style={{ letterSpacing: 0.7 }}>{c.label.toUpperCase()}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Num size={15} weight="bold">{c.strike}</Num>
        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: tint, borderWidth: 0.5, borderColor: tone }}>
          <T size={9.5} weight="semibold" c={tone}>{put ? 'Put' : 'Call'}</T>
        </View>
      </View>
      <T size={10.5} c={color.muted}>{[c.expiry, days].filter(Boolean).join(' · ')}</T>
      {c.cost || c.liquidity ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {c.cost ? <Num size={11} c={color.text}>{c.cost}</Num> : null}
          {c.liquidity ? (
            <T size={10} c={c.liquidity === 'thin' ? color.gold : color.muted}>{LIQUIDITY_WORD[c.liquidity]}</T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** State label carries a dot + word — never colour alone. */
function stateTone(state: AlertCardState): string {
  if (state === 'entry_reached' || state === 'ready' || state === 'position_active') return color.green;
  if (state === 'invalidated') return color.red;
  if (state === 'closed') return color.muted;
  return color.gold;
}

export function StandardAlertCard({ alert, testID }: { alert: AlertCardModel; testID?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [story, setStory] = useState(false);
  const band = gradeBand(alert.grade, alert.score);
  const acting = ACTING.has(alert.state);
  const trade = alert.trade;
  const hasStrip = !!(trade.current || trade.entry || trade.stop || trade.target);
  const bars = tradeBars(alert);
  const contracts = alert.recommended_options ?? [];
  const hasStory = !!(alert.company_summary || alert.kai_interpretation || alert.community);
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
        <TickerMark symbol={alert.symbol} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable
            onPress={() => router.push(`/symbol/${encodeURIComponent(alert.symbol)}`)}
            accessibilityRole="button"
            testID={`alert-ticker-${alert.symbol}`}
          >
            <T size={16} weight="bold">{alert.symbol}</T>
          </Pressable>
          <T size={10} c={color.muted}>
            {[alert.company, alert.mode_label, alert.direction_label, alert.instrument_label].filter(Boolean).join(' · ')}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {alert.triggered_at_label ? <T size={10.5} c={color.muted}>{alert.triggered_at_label}</T> : null}
          <T size={11} weight="bold" c={stateTone(alert.state)}>{alert.state_label}</T>
        </View>
      </View>

      {/* Quality + event — the medallion is the dominant object */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
        <GradeMedallion grade={alert.grade} score={alert.score} size={90} testID={`medallion-${alert.symbol}`} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={16} weight="bold" lh={20}>{alert.headline}</T>
          {alert.what_changed ? (
            <T size={12.5} c={color.muted} lh={18} style={{ marginTop: 6 }}>{alert.what_changed}</T>
          ) : null}
        </View>
      </View>

      {open ? (
        <>
          {/*
            The trade, first and without a paragraph in front of it: the levels,
            then the three bars that say how good each part of it is. The prose
            that used to sit here now lives under "The story" below.
          */}
          {hasStrip ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <LevelCell label="Current" value={trade.current ?? '—'} c={color.text} bg={alpha.ivory04} border={alpha.ivory10} />
              <LevelCell label="Entry" value={trade.entry ?? '—'} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} />
              <LevelCell label="Stop" value={trade.stop ?? '—'} c={color.red} bg={color.redTint} border={alpha.red40} />
              <LevelCell label="Target" value={trade.target ?? '—'} c={color.green} bg={color.greenTint} border={alpha.green40} />
            </View>
          ) : null}

          {/* Only where a level has no number yet — it explains the gap. */}
          {trade.note ? (
            <T size={11.5} c={color.muted} lh={17}>{trade.note}</T>
          ) : null}

          {/* What it costs YOU — a number, so it stays with the levels. */}
          {alert.fit ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={11} c={color.muted}>
                Your risk <Num size={11} c={color.gold}>{alert.fit.risk_amount ?? '—'}</Num>
                {alert.fit.cap_line ? ` · ${alert.fit.cap_line}` : ''}
              </T>
              {alert.fit.conflicts ? <T size={11} c={color.muted}>{alert.fit.conflicts}</T> : null}
            </View>
          ) : null}

          {/*
            How good each part of the trade is, and how long you are meant to
            be in it — one card, because they answer the same question. The
            hold plan used to be a stray line of small print underneath; it is
            the last row of this card now, on the same label column as the
            bars, so it reads as part of the setup rather than a footnote.
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
            The contracts, as objects rather than a chain or a sentence. No
            contract data → no section at all; an empty options row would read
            as "there is nothing worth trading here", which is a different claim.
          */}
          {contracts.length ? (
            <View testID={`contracts-${alert.symbol}`} style={{ gap: 7, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: alpha.ivory10 }}>
              <Eyebrow c={color.muted}>IF YOU TRADE THIS WITH OPTIONS</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {contracts.map((c, i) => (
                  <ContractCard
                    key={`${c.strike}-${c.expiry}-${c.type}-${i}`}
                    c={c}
                    grow={contracts.length === 1}
                    testID={`contract-${alert.symbol}-${i}`}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/*
            The words, one tap away. None of it is deleted — company, Kai's
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

                  {alert.kai_interpretation ? (
                    <LinearGradient
                      colors={[alpha.violet18, alpha.violet05]}
                      start={gradientAngle.start}
                      end={gradientAngle.end}
                      style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, borderWidth: 0.5, borderColor: alpha.violet45 }}
                    >
                      <KaiOrb size={18} glow={false} />
                      <T size={12.5} lh={18} style={{ flex: 1 }}>
                        {alert.kai_interpretation}{' '}
                        <T size={12.5} c={color.muted}>Kai's assessment, not a guarantee.</T>
                      </T>
                    </LinearGradient>
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

          {/*
            The story is the LAST thing in the expanded card. The family's
            record used to sit under it; it is off the trade card now (the
            field is still on the model and still served — this is a
            presentation decision, not a data one). The card goes story → CTA.
          */}
        </>
      ) : null}

      {/* Monitoring progress stays visible on Watching cards */}
      {alert.progress ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <T size={11} c={color.muted} style={{ width: 74 }}>To trigger</T>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha.ivory08, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(100, alert.progress.pct))}%`, height: '100%', borderRadius: 3, backgroundColor: color.violet }} />
          </View>
          <Num size={11} c={color.muted}>{alert.progress.label}</Num>
        </View>
      ) : null}

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

/** History row — the audit trail, not a decision object (spec §1). */
export function HistoryAlertRow({ alert }: { alert: AlertCardModel }) {
  const router = useRouter();
  const bad = alert.state === 'invalidated';
  return (
    <Pressable
      onPress={() => router.push(`/trade/${encodeURIComponent(alert.symbol)}?alert=${encodeURIComponent(alert.id)}&ctx=alert`)}
      accessibilityRole="button"
      testID={`alert-history-${alert.symbol}`}
    >
      <LinearGradient
        colors={bad ? [alpha.red06, alpha.surface70] : [alpha.ivory05, alpha.surface70]}
        start={gradientAngle.start}
        end={gradientAngle.end}
        style={{ borderRadius: radius.xl, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 0.5, borderColor: bad ? alpha.red35 : alpha.ivory14, gap: 8 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TickerMark symbol={alert.symbol} size={22} />
          <T size={15} weight="bold">{alert.symbol}</T>
          {/*
            Direction is part of the record, not decoration: a short read as a
            long is read backwards. It sits next to the ticker on every history
            row so the outcome underneath can only be read one way.
          */}
          {alert.direction_label ? (
            <View
              testID={`direction-${alert.symbol}`}
              style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: alpha.ivory08 }}
            >
              <T size={10} weight="semibold" c={color.muted} style={{ textTransform: 'capitalize' }}>{alert.direction_label}</T>
            </View>
          ) : null}
          <GradeChip grade={alert.grade} score={alert.score} />
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, borderWidth: 0.5, borderColor: bad ? alpha.red40 : alpha.green50 }}>
            <T size={10} c={bad ? color.red : color.green}>{alert.state_label}</T>
          </View>
          {alert.resolved_label ? <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{alert.resolved_label}</T> : null}
        </View>
        <T size={12.5} c={color.muted} lh={17.5}>{alert.what_changed || alert.headline}</T>
        {/*
          The result, where there IS one. An alert that never resolved shows no
          row at all rather than a dash pretending to be a measurement.
        */}
        {alert.outcome ? (
          <View style={{ gap: 3 }} testID={`outcome-${alert.symbol}`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={11.5} c={color.muted}>{alert.outcome.label}</T>
              <Num size={11.5} weight="semibold" c={alert.outcome.tone === 'bad' ? color.red : color.green}>{alert.outcome.value ?? '—'}</Num>
            </View>
            {alert.outcome.plain ? (
              <T size={10} c={color.dim} lh={14.5}>{alert.outcome.plain}</T>
            ) : null}
          </View>
        ) : null}
        <T size={11} weight="semibold" c={color.violetLight}>{alert.primary_action.label}</T>
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
