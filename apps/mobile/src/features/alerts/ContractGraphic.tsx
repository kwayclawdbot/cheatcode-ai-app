import React from 'react';
import { View } from 'react-native';
import { alpha, color, radius, space } from '../../ui/tokens';
import { T, Num, Eyebrow } from '../../ui/Text';
import type { AlertContractFloorCheck, AlertOptionContract } from '../../lib/types';

/**
 * THE CONTRACT, AS ONE OBJECT YOU CAN LOOK AT.
 * ===========================================================================
 *
 * TWO PIECES OF OWNER FEEDBACK BUILT THIS, AND THE SECOND ONE OVERRODE THE
 * FIRST DRAFT OF IT.
 *
 *   7 Sept: "the options card is basic af and doesn't even give the correct
 *   context. It should show the contract info like expiry, strike, iv in a
 *   visually appealing graphic format along with scoring/grade."
 *
 *   …then, on the first build: "the daytrade options layout sucks, just
 *   generic stacked cards making the card super long."
 *
 * The first draft answered the first note by giving each measurement its own
 * bordered block — implied volatility, print strength, tradability — which is
 * how a card gets three times longer while every individual part looks fine.
 * A column of same-shaped boxes is a card grid rotated ninety degrees, and it
 * is the thing the house style forbids most plainly.
 *
 * SO THE RULE HERE IS COMPOSITION, NOT REPETITION. There is exactly one panel.
 * Inside it the numbers are placed against each other rather than queued up:
 *
 *   · THE RAIL is the hero and the only large graphic. Spot and strike on one
 *     axis with the gap between them shaded, so the distance is a distance and
 *     not a percentage you have to picture.
 *   · THE BAND is one row of four readings — time left, cost, implied
 *     volatility, the size of the print. Four numbers, one line of height,
 *     each with the smallest honest meter under it. This replaces three
 *     bordered blocks and is the whole density argument.
 *   · THE VERDICT is one strip: could you have got in and out.
 *   · THE EVIDENCE, behind the expander, is prose and a small grid — never
 *     another panel.
 *
 * Two contracts do not become two of these. One is featured and the rest are a
 * single compact strip, because a second full graphic is the stacking problem
 * arriving by another route.
 *
 * ── WHAT IS NEVER DRAWN ────────────────────────────────────────────────────
 *
 * NOTHING UNMEASURED. Every field past `strike`/`expiry`/`type` is optional and
 * null means the engine did not measure it. A rail with no underlying price is
 * not a rail with the stock at zero — it is no rail, and the cell is skipped.
 *
 * NO LETTER AND NO COMPOSITE QUALITY NUMBER. This family measures one thing —
 * a print — and one measurement does not earn a grade. The two named
 * measurements say what they measure and stop: "Print strength" is how far the
 * print stood out from this contract's own normal, "Tradability" is whether
 * you could have got in and out at a fair price. Neither is about the outcome,
 * and the card says so in a line at the bottom.
 *
 * ── COLOUR ─────────────────────────────────────────────────────────────────
 *
 * green/red are the call/put semantic and nothing else here. A pass or a fail
 * on a liquidity check is not a financial semantic, so it is carried by the
 * WORD plus muted-versus-gold. volt and violet never appear: nothing on this
 * object is a user action or a Kai opinion.
 *
 * ── MOTION ─────────────────────────────────────────────────────────────────
 *
 * None. A member scrolls past this object dozens of times a day, which is the
 * frequency at which the right amount of animation is zero.
 */

/* ── formatting ─────────────────────────────────────────────────────────── */

const commas = (n: number) => Math.round(n).toLocaleString('en-US');

/** "$560" · "$196,070". Whole dollars — a contract price has no cents worth reading. */
const usd = (n: number) => `$${commas(n)}`;

/** Premium, short enough for a band cell: 196070 → "$196k". */
const usdShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}m` : n >= 1_000 ? `$${Math.round(n / 1_000)}k` : usd(n);

/** 4.75 → "4.75". Quotes keep their cents. */
const dec2 = (n: number) => n.toFixed(2);

/** A FRACTION to a percent: 2.1525 → "215%", 0.1643 → "16.4%". */
function pctOf(fraction: number, dp = 0) {
  const v = fraction * 100;
  return `${v.toFixed(v < 10 && dp === 0 ? 1 : dp)}%`;
}

/** 15.83 → "15.8×"; 3800 → "3,800×". A multiple is never given false precision. */
const times = (n: number) => `${n >= 100 ? commas(n) : n.toFixed(1)}×`;

/* ── 1. the strike rail — the hero ──────────────────────────────────────── */

/**
 * The gap between the stock and the strike, drawn to scale.
 *
 * WHY A FIXED SCALE AND NOT THE RAW PERCENT. A rail that ran to whatever the
 * widest strike of the day happened to be would redraw itself every morning,
 * and a 4%-out contract would look different on a quiet day than on a loud one.
 * So the scale is fixed: 0% sits at the near end, anything 12% or further out
 * sits at the far end, and everything between is linear. Twelve is chosen
 * because past it the distinction stops mattering — a strike 15% out and one
 * 30% out are both "not getting there today" — and clamping keeps the extremes
 * legible instead of squashing every realistic strike into the first inch. The
 * real corpus runs 0.39% to 3.9%, which lands in the first third of the rail,
 * which is the honest picture of it.
 *
 * DIRECTION IS SPATIAL AND CARRIES MEANING: a call strike sits to the RIGHT of
 * the stock and a put strike to the LEFT, because that is the way the stock has
 * to move. An in-the-money strike therefore crosses to the other side on its
 * own, with no special case for it.
 */
const OTM_FULL_SCALE = 12;
const RAIL_NEAR = 0.05;
const RAIL_FAR = 0.72;
const RAIL_LEFT = 0.16;
const PIN_W = 104;

function railOffset(otmPct: number, put: boolean): number {
  const t = Math.min(1, Math.abs(otmPct) / OTM_FULL_SCALE);
  const magnitude = RAIL_NEAR + (RAIL_FAR - RAIL_NEAR) * t;
  const towardStrike = otmPct < 0 ? -1 : 1;
  return (put ? -1 : 1) * towardStrike * magnitude;
}

/** A fixed-width box centred on a point of the rail, so a label sits on its mark. */
function Pin({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <View style={{ position: 'absolute', left: `${at * 100}%`, marginLeft: -PIN_W / 2, width: PIN_W, alignItems: 'center' }}>
      {children}
    </View>
  );
}

/**
 * The plain-English reading of the gap. No jargon and no forecast: it says how
 * far away the strike is and what the stock would have to do, and nothing at
 * all about whether it will.
 */
function gapSentence(otmPct: number, distance: number | null, put: boolean): string {
  const move = distance != null && distance > 0 ? `$${dec2(distance)}` : null;
  if (otmPct < 0) {
    const head = `${Math.abs(otmPct).toFixed(1)}% in the money`;
    return move ? `${head} · the stock is already ${move} past the strike` : head;
  }
  const head = `${otmPct.toFixed(1)}% out of the money`;
  if (!move) return head;
  return `${head} · the stock needs to ${put ? 'fall' : 'gain'} ${move}`;
}

function StrikeRail({ c, tone, symbol }: { c: AlertOptionContract; tone: string; symbol: string }) {
  const put = c.type === 'put';
  const spot = c.underlying_price as number;
  const otm = c.otm_pct as number;

  const strikeNum = Number(String(c.strike).replace(/[^\d.-]/g, ''));
  const distance = Number.isFinite(strikeNum) ? Math.abs(strikeNum - spot) : null;

  const off = railOffset(otm, put);
  const spotX = RAIL_LEFT - Math.min(0, off);
  const strikeX = spotX + off;
  const bandLeft = Math.min(spotX, strikeX);
  const bandWidth = Math.abs(off);
  const sentence = gapSentence(otm, distance, put);

  return (
    <View
      testID={`contract-rail-${symbol}`}
      accessibilityLabel={`Strike ${c.strike}, stock at ${dec2(spot)}. ${sentence}`}
      style={{ gap: 7 }}
    >
      {/* The strike, above its own mark. */}
      <View style={{ height: 33 }}>
        <Pin at={strikeX}>
          <Num size={20} weight="bold" c={color.text}>{c.strike}</Num>
          <T size={8.5} weight="bold" c={color.dim} ls={0.7} style={{ marginTop: 1 }}>STRIKE</T>
        </Pin>
      </View>

      {/* The rail. The shaded band is the distance the stock has to cover. */}
      <View style={{ height: 8, borderRadius: 4, backgroundColor: alpha.ivory08 }}>
        <View
          style={{
            position: 'absolute', left: `${bandLeft * 100}%`, width: `${bandWidth * 100}%`,
            top: 0, bottom: 0, backgroundColor: put ? color.redTint : color.greenTint,
          }}
        />
        {/* Where the stock is now. */}
        <View
          style={{
            position: 'absolute', left: `${spotX * 100}%`, marginLeft: -5, top: -1,
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: color.text, borderWidth: 2, borderColor: color.bg,
          }}
        />
        {/* Where the strike is. A post, not a dot — it is a level, not a price. */}
        <View
          style={{
            position: 'absolute', left: `${strikeX * 100}%`, marginLeft: -1.5, top: -5,
            width: 3, height: 18, borderRadius: 1.5, backgroundColor: tone,
          }}
        />
      </View>

      {/* Where the stock is, under its own mark. */}
      <View style={{ height: 15 }}>
        <Pin at={spotX}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <T size={9.5} c={color.dim}>now</T>
            <Num size={11.5} c={color.muted}>{dec2(spot)}</Num>
          </View>
        </Pin>
      </View>

      <T size={11.5} c={color.muted} lh={16}>{sentence}</T>
    </View>
  );
}

/* ── 2. the band — four readings, one row of height ─────────────────────── */

/**
 * ONE CELL OF THE BAND: a caption, a number, and the smallest honest meter.
 *
 * This is the whole answer to "super long". Time left, cost, implied
 * volatility and the size of the print were three bordered blocks and eleven
 * rows in the first draft; here they are four columns and about sixty points
 * of height, and nothing was dropped except the boxes.
 *
 * The meter slot is optional on purpose. A cell draws a meter only where the
 * number has a real 0–100 or a real ceiling behind it — a rank, a share of
 * volume, a countdown of days. Cost has no scale, so cost has no meter, and it
 * gets the second line for its bid and ask instead. Every cell keeping a bar
 * "for balance" is how a number that was never measured on a scale ends up
 * looking like one that was.
 */
function BandCell({ caption, value, tone, sub, meter, flex = 1, testID, accessibilityLabel }: {
  caption: string;
  value: string;
  tone?: string;
  sub?: string | null;
  meter?: React.ReactNode;
  flex?: number;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? `${caption}, ${value}${sub ? `, ${sub}` : ''}`}
      style={{ flex, minWidth: 0, gap: 3 }}
    >
      <T size={8} weight="bold" c={color.dim} ls={0.7} numberOfLines={1}>{caption.toUpperCase()}</T>
      <Num size={15} weight="bold" c={tone ?? color.text} style={{ marginTop: -1 }}>{value}</Num>
      {meter ?? null}
      {sub ? <T size={9.5} c={color.dim} numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}

/** The band's meter: 3pt high, no label, no readout. The number above is the readout. */
function MicroBar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <View style={{ height: 3, borderRadius: 1.5, backgroundColor: alpha.ivory08, overflow: 'hidden', marginTop: 1 }}>
      <View style={{ width: `${Math.max(3, Math.min(100, pct))}%`, height: '100%', borderRadius: 1.5, backgroundColor: tone }} />
    </View>
  );
}

/**
 * TIME LEFT, AS A RUNWAY THAT IS MOSTLY EMPTY.
 *
 * On this family the contract is one or two days from expiry, and that fact
 * decides more about the trade than anything else on the card. "2 days" set in
 * the same muted type as everything else does not say it; ten day-slots with
 * two of them lit does. The lane holds ten days because past ten the difference
 * stops being the point — a longer contract fills the lane and prints a `+` —
 * and the caption always carries the real number, so the clamp can never be
 * mistaken for the measurement.
 */
const RUNWAY_SLOTS = 10;

function Runway({ dte, tone }: { dte: number; tone: string }) {
  const lit = Math.min(RUNWAY_SLOTS, Math.max(0, Math.round(dte)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 4, marginTop: 2 }}>
      {Array.from({ length: RUNWAY_SLOTS }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < lit ? tone : alpha.ivory08 }} />
      ))}
      {dte > RUNWAY_SLOTS ? <T size={8} c={color.dim}>+</T> : null}
    </View>
  );
}

/** What an implied-volatility rank means, said the way a person would say it. */
function rankSentence(rank: number): string {
  if (rank >= 97) return 'as expensive as it has been all year';
  if (rank >= 80) return 'near the top of its own year';
  if (rank >= 55) return 'above the middle of its own year';
  if (rank >= 30) return 'around the middle of its own year';
  return 'cheap by its own standards';
}

/**
 * THE SIZE OF THE PRINT — and the honesty gate that decides which number it is.
 *
 * `volume_oi_credited === false` means the engine LOOKED at the volume-to-open-
 * interest multiple and threw it away, because open interest was too thin for a
 * ratio against it to mean anything. Drawing that multiple as a bar sailing
 * past its threshold would be the card claiming a finding the engine refused to
 * make.
 *
 * AND THIS IS THE NORMAL CASE, NOT THE EDGE ONE. All four contracts in the live
 * corpus are uncredited — WDC 17.8× on 88 open interest, META 81.3× on 59,
 * SPCX 103.4× on 68, MRNA 15.8× on 48 — so every real card falls to the
 * average-daily-volume measure. That path is therefore the one this cell is
 * designed around; the credited multiple is the variant, kept working and given
 * its own meter because it has a threshold to measure against, which the
 * volume measure does not.
 */
type PrintReading = {
  value: string;
  caption: string;
  sub: string | null;
  meterPct: number | null;
  credited: boolean;
};

function printReading(c: AlertOptionContract): PrintReading | null {
  const credited = c.volume_oi_credited;
  const multiple = c.volume_oi_multiple;
  const threshold = c.volume_oi_threshold;

  if (credited !== false && multiple != null && threshold != null) {
    return {
      value: times(multiple),
      caption: 'The print',
      sub: `bar ${times(threshold)}`,
      meterPct: Math.min(100, (multiple / threshold) * 100),
      credited: true,
    };
  }
  if (c.volume_vs_own_adv != null) {
    return {
      value: times(c.volume_vs_own_adv),
      caption: 'The print',
      /* No meter. There is no threshold for "times its own average day", and a
         bar with no scale behind it is a picture of a measurement nobody made. */
      sub: 'own avg day',
      meterPct: null,
      credited: false,
    };
  }
  if (multiple != null) {
    return { value: times(multiple), caption: 'The print', sub: 'open interest', meterPct: null, credited: false };
  }
  return null;
}

function Band({ c, symbol }: { c: AlertOptionContract; symbol: string }) {
  const dte = c.dte;
  const urgent = dte != null && dte <= 1;
  const rank = c.iv_rank ?? c.iv_percentile;
  const print = printReading(c);
  const perContract = c.cost_per_contract;
  const quote = c.bid != null && c.ask != null ? `${dec2(c.bid)} × ${dec2(c.ask)}` : null;

  const cells: React.ReactNode[] = [];

  if (dte != null || c.expiry) {
    cells.push(
      <BandCell
        key="time"
        testID={`contract-expiry-${symbol}`}
        caption="Time left"
        value={dte == null ? c.expiry : dte === 0 ? 'today' : `${dte}d`}
        tone={urgent ? color.gold : color.text}
        sub={c.expiry || null}
        meter={dte != null ? <Runway dte={dte} tone={urgent ? color.gold : color.text} /> : null}
        accessibilityLabel={`Expires ${c.expiry}${dte != null ? `, ${dte === 1 ? '1 day' : `${dte} days`}` : ''}`}
      />,
    );
  }

  if (perContract != null || c.cost) {
    cells.push(
      <BandCell
        key="cost"
        testID={`contract-cost-${symbol}`}
        caption="Cost"
        /* `cost_per_contract` is a hundred times the per-share `cost`. Each is
           captioned with the unit it is in rather than both being poured into
           one slot called "Cost". */
        value={perContract != null ? usd(perContract) : (c.cost as string)}
        sub={perContract != null ? (quote ?? 'per contract') : 'per share'}
        flex={1.1}
      />,
    );
  }

  if (c.iv != null || rank != null) {
    cells.push(
      <BandCell
        key="iv"
        testID={`contract-iv-${symbol}`}
        caption="Volatility"
        value={c.iv != null ? pctOf(c.iv) : `${Math.round(rank as number)}`}
        sub={rank != null ? `rank ${Math.round(rank)}` : null}
        /* The rank bar is NOT painted on the grade ramp. A rank of 100 means
           the options are as dear as they have been all year, which is a
           caution and not an A — and the ask-side bar in the evidence below IS
           on the grade ramp, so one gold hue would have carried two opposite
           meanings on one card. The caution is carried by the sentence under
           the band instead, which says it in words. */
        meter={rank != null ? <MicroBar pct={rank} tone={color.muted} /> : null}
      />,
    );
  }

  if (print) {
    cells.push(
      <BandCell
        key="print"
        testID={`contract-print-size-${symbol}`}
        caption={print.caption}
        value={print.value}
        sub={print.sub}
        meter={print.meterPct != null ? <MicroBar pct={print.meterPct} tone={color.text} /> : null}
        flex={1.1}
      />,
    );
  }

  if (!cells.length) return null;
  return (
    <View testID={`contract-band-${symbol}`} style={{ flexDirection: 'row', gap: 11 }}>
      {cells}
    </View>
  );
}

/* ── 3. the verdict strip ───────────────────────────────────────────────── */

const LIQUIDITY_WORD: Record<'good' | 'thin', string> = { good: 'Active market', thin: 'Thin market' };

/**
 * TRADABILITY, IN ONE STRIP.
 *
 * This is the one composite the card draws, and it is allowed precisely
 * because every part of it is on screen underneath when the card is open, with
 * its own number and its own requirement.
 *
 * PASS AND FAIL ARE NOT GREEN AND RED. Those two are financial semantics in
 * this app — call versus put, gain versus loss — and a wide spread is neither.
 * The usual answer here is a pass (three of the four live contracts clear all
 * four checks), so the passing state is deliberately CALM — ivory, no
 * decoration — and only a miss reaches for gold. A card that shouted on every
 * pass would have nothing left to say on the one that fails.
 */
function VerdictStrip({ c, symbol }: { c: AlertOptionContract; symbol: string }) {
  const clears = c.clears_liquidity_floor;
  const checks = c.floor_checks ?? [];
  const passed = checks.filter((k) => k.passes).length;

  let word: string | null = null;
  let tone: string = color.text;
  if (clears === true) word = 'You could get in and out at a fair price';
  else if (clears === false) { word = 'Hard to get in and out at a fair price'; tone = color.gold; }
  else if (c.liquidity) {
    /* The older payload carries only a coarse word. It is NOT the floor verdict
       — "thin" is a description, "does not clear the floor" is a finding — so
       it is printed as the word it is and nothing is inferred from it. */
    word = LIQUIDITY_WORD[c.liquidity];
    tone = c.liquidity === 'thin' ? color.gold : color.text;
  }
  if (!word) return null;

  return (
    <View
      testID={`contract-tradability-${symbol}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingTop: 9, borderTopWidth: 0.5, borderTopColor: alpha.ivory08,
      }}
    >
      <T size={9.5} weight="bold" c={color.dim} ls={0.7}>TRADABILITY</T>
      <T size={11.5} weight="semibold" c={tone} style={{ flex: 1 }}>{word}</T>
      {checks.length ? (
        <T size={10.5} c={color.dim}>{`${passed}/${checks.length}`}</T>
      ) : null}
    </View>
  );
}

/* ── 4. the evidence, behind the expander ───────────────────────────────── */

/**
 * One floor check as a stat cell, two to a row.
 *
 * The idiom is the History row's `StatCell` — a micro caption over a number —
 * and it is reused rather than reinvented, which is also what keeps it short:
 * four checks in two rows of two instead of four full-width rows with a
 * requirement line hanging off each. The requirement is printed for every
 * check, passing ones included, because "760 against a 400 minimum" is the
 * interesting half of a pass.
 */
function CheckCell({ check, symbol, i }: { check: AlertContractFloorCheck; symbol: string; i: number }) {
  const tone = check.passes ? color.muted : color.gold;
  return (
    <View
      testID={`contract-check-${symbol}-${i}`}
      accessibilityLabel={`${check.label}, ${check.value}, ${check.passes ? 'clears' : 'misses'}${check.requirement ? `, needs ${check.requirement}` : ''}`}
      style={{ width: '47%', flexGrow: 1, gap: 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <T size={8} weight="bold" c={color.dim} ls={0.7} numberOfLines={1} style={{ flex: 1 }}>
          {check.label.toUpperCase()}
        </T>
        {/* The word, always. Colour never carries a verdict on its own. */}
        <T size={9.5} weight="semibold" c={tone}>{check.passes ? 'clears' : 'misses'}</T>
      </View>
      <Num size={11.5} c={color.text}>{check.value}</Num>
      {check.requirement ? <T size={9.5} c={color.dim}>{`needs ${check.requirement}`}</T> : null}
    </View>
  );
}

/** A dense run of supporting numbers — a sentence of facts, not a stack of rows. */
function factLine(c: AlertOptionContract): string | null {
  const parts = [
    c.ask_side_share != null ? `${pctOf(c.ask_side_share, 1)} paid at the ask` : null,
    c.premium != null ? `${usdShort(c.premium)} premium` : null,
    c.volume != null && c.open_interest != null
      ? `${commas(c.volume)} traded against ${commas(c.open_interest)} open`
      : c.volume != null ? `${commas(c.volume)} traded` : null,
    c.sweeps != null && c.sweeps > 0 ? `${commas(c.sweeps)} sweep${c.sweeps === 1 ? '' : 's'}` : null,
    c.blocks != null && c.blocks > 0 ? `${commas(c.blocks)} block${c.blocks === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}.` : null;
}

function Evidence({ c, symbol }: { c: AlertOptionContract; symbol: string }) {
  const rank = c.iv_rank ?? c.iv_percentile;
  const facts = factLine(c);
  const checks = c.floor_checks ?? [];
  const uncredited = c.volume_oi_credited === false;
  const hasPrint = !!(facts || c.spike_evidence || uncredited);
  if (!hasPrint && !checks.length && !c.liquidity_failures?.length && rank == null) return null;

  return (
    <View style={{ gap: 10, paddingTop: 9, borderTopWidth: 0.5, borderTopColor: alpha.ivory08 }}>
      {rank != null ? (
        <T size={11} c={rank >= 80 ? color.gold : color.dim} lh={16}>
          {`Implied volatility is ${rankSentence(rank)}.`}
        </T>
      ) : null}

      {hasPrint ? (
        <View testID={`contract-print-${symbol}`} style={{ gap: 5 }}>
          <T size={9.5} weight="bold" c={color.dim} ls={0.7}>PRINT STRENGTH</T>
          {facts ? <T size={11} c={color.muted} lh={16}>{facts}</T> : null}
          {uncredited ? (
            <T size={11} c={color.dim} lh={16} testID={`contract-uncredited-${symbol}`}>
              {c.spike_evidence
                ?? (c.volume_oi_multiple != null
                  ? `Volume was ${times(c.volume_oi_multiple)} open interest, which the engine did not credit.`
                  : 'The volume-to-open-interest multiple was not credited.')}
            </T>
          ) : c.spike_evidence ? (
            <T size={11} c={color.dim} lh={16}>{c.spike_evidence}</T>
          ) : null}
        </View>
      ) : null}

      {checks.length ? (
        <View testID={`contract-floor-${symbol}`} style={{ gap: 5 }}>
          <T size={9.5} weight="bold" c={color.dim} ls={0.7}>THE LIQUIDITY FLOOR</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 11, rowGap: 8 }}>
            {checks.map((k, i) => <CheckCell key={`${k.label}-${i}`} check={k} symbol={symbol} i={i} />)}
          </View>
        </View>
      ) : null}

      {c.liquidity_failures?.length ? (
        <View testID={`contract-failures-${symbol}`} style={{ gap: 4 }}>
          {c.liquidity_failures.map((f, i) => (
            <T key={i} size={11} c={color.gold} lh={16}>{f}</T>
          ))}
        </View>
      ) : null}

      {/*
        The one line that keeps the two named measurements honest. They are
        measurements of a print and of a contract; neither of them knows
        anything about how the trade goes.
      */}
      <T size={10} c={color.dim} lh={14} testID={`contract-scope-${symbol}`}>
        Print strength measures the print. Tradability measures the contract. Neither one is a
        forecast of how the trade works out.
      </T>
    </View>
  );
}

/* ── the object ─────────────────────────────────────────────────────────── */

const SECTION_EYEBROW = 'THE CONTRACT THE FLOW BOUGHT';
const sameAsEyebrow = (label: string) =>
  label.trim().replace(/\s+/g, ' ').toUpperCase() === SECTION_EYEBROW;

export type ContractGraphicProps = {
  c: AlertOptionContract;
  /** The symbol of the card this sits on — testIDs and labels only. */
  symbol: string;
  /**
   * The collapsed card: the rail, the band and the verdict. The evidence — the
   * prose, the floor grid, the scope line — arrives with the expander. Nothing
   * MOVES between the two states; the object fills in where it stands.
   */
  compact?: boolean;
  testID?: string;
};

export function ContractGraphic({ c, symbol, compact, testID }: ContractGraphicProps) {
  const put = c.type === 'put';
  const tone = put ? color.red : color.green;
  const tint = put ? color.redTint : color.greenTint;
  /* The rail needs BOTH ends. Without a stock price there is no distance to
     draw, and a rail drawn anyway would put the stock at zero. */
  const hasRail = c.underlying_price != null && c.otm_pct != null;

  return (
    <View
      testID={testID}
      style={{
        gap: 11, paddingVertical: space.x12, paddingHorizontal: space.x13, borderRadius: radius.xl,
        backgroundColor: alpha.ivory035, borderWidth: 0.5, borderColor: alpha.ivory12,
      }}
    >
      {/* Which way round, and — only where it adds one — the contract's role.
          The side is a WORD in a tinted chip, never colour on its own. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/*
          The options-flow ingest labels its single contract "The contract the
          flow bought", which is word for word this section's own eyebrow. A
          label that repeats the heading is not a label.
        */}
        {c.label && !sameAsEyebrow(c.label) ? (
          <T size={8.5} weight="bold" c={color.dim} ls={0.7} numberOfLines={1} style={{ flex: 1 }}>
            {c.label.toUpperCase()}
          </T>
        ) : <View style={{ flex: 1 }} />}
        {!hasRail ? (
          /* No rail means the strike has nowhere to be said, so it is said
             here — the same fact, as text, because there was no stock price to
             draw it against. */
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Num size={15} weight="bold" c={color.text}>{c.strike}</Num>
            <T size={9.5} c={color.dim}>strike</T>
          </View>
        ) : null}
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: tint, borderWidth: 0.5, borderColor: tone }}>
          <T size={10} weight="semibold" c={tone}>{put ? 'Put' : 'Call'}</T>
        </View>
      </View>

      {hasRail ? <StrikeRail c={c} tone={tone} symbol={symbol} /> : null}

      <Band c={c} symbol={symbol} />

      <VerdictStrip c={c} symbol={symbol} />

      {compact ? null : <Evidence c={c} symbol={symbol} />}
    </View>
  );
}

/**
 * THE OTHER CONTRACTS, WHERE THERE ARE ANY — one strip, never a second graphic.
 *
 * A day-trade alert names exactly one contract, so in production this draws
 * nothing. It exists because the swing card can carry two or three ways to
 * express the same idea, and repeating the full object for each of them is the
 * stacking problem arriving by another route: three graphics is three times the
 * height for one extra strike and one extra price. So the alternatives are a
 * row of chips — strike, side, expiry, price — which is all that distinguishes
 * them from the one above.
 */
function AlternativeStrip({ contracts, symbol }: { contracts: AlertOptionContract[]; symbol: string }) {
  if (!contracts.length) return null;
  return (
    <View
      testID={`contract-alts-${symbol}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
    >
      {contracts.map((c, i) => {
        const put = c.type === 'put';
        const price = c.cost_per_contract != null ? usd(c.cost_per_contract) : c.cost;
        return (
          <View
            key={c.option_symbol ?? `${c.strike}-${c.expiry}-${c.type}-${i}`}
            testID={`contract-${symbol}-alt-${i}`}
            accessibilityLabel={[
              c.label, `${c.strike} ${put ? 'put' : 'call'}`, c.expiry, price,
            ].filter(Boolean).join(', ')}
            style={{
              flexDirection: 'row', alignItems: 'baseline', gap: 5,
              paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.md,
              backgroundColor: alpha.ivory04, borderWidth: 0.5, borderColor: alpha.ivory10,
            }}
          >
            <Num size={11.5} weight="semibold" c={color.text}>{c.strike}</Num>
            <T size={10} weight="semibold" c={put ? color.red : color.green}>{put ? 'Put' : 'Call'}</T>
            <T size={10} c={color.dim}>{c.expiry}</T>
            {price ? <Num size={10.5} c={color.muted}>{price}</Num> : null}
          </View>
        );
      })}
    </View>
  );
}

/** The section shell — the eyebrow, ONE graphic, and any alternatives as a strip. */
export function ContractSection({ contracts, symbol, compact }: {
  contracts: AlertOptionContract[]; symbol: string; compact?: boolean;
}) {
  if (!contracts.length) return null;
  const [featured, ...rest] = contracts;
  return (
    <View testID={`contracts-${symbol}`} style={{ gap: 8 }}>
      <Eyebrow c={color.muted}>{SECTION_EYEBROW}</Eyebrow>
      <ContractGraphic
        c={featured}
        symbol={symbol}
        compact={compact}
        testID={`contract-${symbol}-0`}
      />
      {rest.length ? (
        <>
          <T size={9.5} weight="bold" c={color.dim} ls={0.7}>OTHER WAYS TO PLAY IT</T>
          <AlternativeStrip contracts={rest} symbol={symbol} />
        </>
      ) : null}
    </View>
  );
}

/**
 * The History line — one line, and it stays one line.
 *
 * A record is read in a column of twenty-six other records, so the contract
 * gets the four or five facts that identify it and nothing else. Implied
 * volatility earns its place because the owner named it; what the contract went
 * on to DO is still absent, because nothing stores it.
 */
export function ContractLine({ c, symbol }: { c: AlertOptionContract; symbol: string }) {
  const put = c.type === 'put';
  const paid = c.cost ? (c.cost.startsWith('$') ? c.cost : `$${c.cost}`) : null;
  const dot = <T size={11} c={color.dim}>·</T>;
  return (
    <View
      testID={`contract-${symbol}`}
      accessibilityLabel={[
        `${c.strike} ${put ? 'put' : 'call'}`,
        c.expiry,
        c.dte != null ? `${c.dte} days` : null,
        c.iv != null ? `implied volatility ${pctOf(c.iv)}` : null,
        paid ? `paid ${paid}` : null,
      ].filter(Boolean).join(', ')}
      style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}
    >
      <Num size={12.5} weight="semibold">{c.strike}</Num>
      <T size={11} weight="semibold" c={put ? color.red : color.green}>{put ? 'Put' : 'Call'}</T>
      {dot}
      <T size={11} c={color.muted}>{c.expiry}</T>
      {c.dte != null ? (<>{dot}<Num size={11} c={color.muted}>{`${c.dte}d`}</Num></>) : null}
      {c.iv != null ? (<>{dot}<T size={11} c={color.muted}>IV</T><Num size={11} c={color.muted}>{pctOf(c.iv)}</Num></>) : null}
      {paid ? (<>{dot}<T size={11} c={color.muted}>paid</T><Num size={12} c={color.text}>{paid}</Num></>) : null}
    </View>
  );
}
