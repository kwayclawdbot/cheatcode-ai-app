/**
 * Technicals — computed from candles, arithmetically, every time.
 *
 * Nothing in this file is generated and nothing is judged by a model. The three
 * meters on the ticker page are functions of the stored daily bars:
 *
 *   Trend       EMA(20) slope over the last 10 bars + where price sits against
 *               EMA(20) and EMA(50).
 *   Momentum    RSI(14), read as a band.
 *   Volatility  ATR(14) as a percentage of price, read as a band.
 *
 * Each returns a qualitative `status` from spec §4's vocabulary and a 0–5
 * `strength` for the meter. Points and fractions stay in here; the wire only
 * ever carries a word and a segment count (spec §4: "Never display component
 * fractions such as 18/20").
 *
 * Support and resistance are RECENT SWING LEVELS — pivot highs and lows in the
 * window, clustered so three touches of the same shelf read as one level — not
 * round numbers and not Fibonacci retracements of an invented range.
 *
 * With too few bars every meter comes back `Unknown` / strength 0 and the block
 * is `degraded`. A meter that says "Strong" off six bars would be a lie with a
 * progress bar attached.
 */
import type { Candle, Freshness, PriceLevel, QualitativeMeter, Technicals } from '@shared/api';

const MIN_BARS = 30;

function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.c).filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Indicators                                                           */
/* ------------------------------------------------------------------ */

/** Standard EMA seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI. Returns the latest value, or null with too little data. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Wilder's ATR from true ranges. Returns the latest value. */
export function atr(candles: Candle[], period = 14): number | null {
  const bars = candles.filter(
    (c) => typeof c.h === 'number' && typeof c.l === 'number' && typeof c.c === 'number'
  ) as { h: number; l: number; c: number }[];
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].c;
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prevClose), Math.abs(bars[i].l - prevClose)));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/* ------------------------------------------------------------------ */
/* Swing levels                                                         */
/* ------------------------------------------------------------------ */

type Pivot = { price: number; idx: number };

/** A pivot high is a bar whose high beats `lookback` bars either side of it. */
function pivots(candles: Candle[], lookback: number, side: 'high' | 'low'): Pivot[] {
  const out: Pivot[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const v = side === 'high' ? candles[i].h : candles[i].l;
    if (typeof v !== 'number') continue;
    let isPivot = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      const o = side === 'high' ? candles[j].h : candles[j].l;
      if (typeof o !== 'number') continue;
      if (side === 'high' ? o > v : o < v) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push({ price: v, idx: i });
  }
  return out;
}

/**
 * Pivots within 0.75% of each other are the same shelf. `touches` is how many
 * pivots landed in the cluster, which is the only honest measure of "tested"
 * we have from daily bars.
 */
function cluster(ps: Pivot[], tolerancePct = 0.0075): { price: number; touches: number; idx: number }[] {
  const sorted = [...ps].sort((a, b) => a.price - b.price);
  const groups: { price: number; touches: number; idx: number }[] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(p.price - last.price) / last.price <= tolerancePct) {
      last.price = (last.price * last.touches + p.price) / (last.touches + 1);
      last.touches += 1;
      last.idx = Math.max(last.idx, p.idx);
    } else {
      groups.push({ price: p.price, touches: 1, idx: p.idx });
    }
  }
  return groups;
}

function levelPlain(price: number, touches: number, kind: 'support' | 'resistance'): string {
  const times = touches === 1 ? 'once' : `${touches} times`;
  return kind === 'support'
    ? `$${round2(price)} has held ${times} in this window.`
    : `$${round2(price)} has capped price ${times} in this window.`;
}

export function swingLevels(
  candles: Candle[],
  price: number | null
): { support: PriceLevel[]; resistance: PriceLevel[] } {
  if (candles.length < 15 || price === null) return { support: [], resistance: [] };
  const lookback = 3;
  const highs = cluster(pivots(candles, lookback, 'high'));
  const lows = cluster(pivots(candles, lookback, 'low'));

  // Most touched first, then nearest to price — the level a person would care
  // about is the one that has actually mattered and is close enough to matter.
  const rank = (a: { price: number; touches: number }, b: { price: number; touches: number }) =>
    b.touches - a.touches || Math.abs(a.price - price) - Math.abs(b.price - price);

  const support = lows
    .filter((l) => l.price < price)
    .sort(rank)
    .slice(0, 3)
    .map((l) => ({
      price: round2(l.price),
      label: 'Support',
      touches: l.touches,
      plain: levelPlain(l.price, l.touches, 'support'),
    }))
    .sort((a, b) => b.price - a.price);

  const resistance = highs
    .filter((h) => h.price > price)
    .sort(rank)
    .slice(0, 3)
    .map((h) => ({
      price: round2(h.price),
      label: 'Resistance',
      touches: h.touches,
      plain: levelPlain(h.price, h.touches, 'resistance'),
    }))
    .sort((a, b) => a.price - b.price);

  return { support, resistance };
}

/* ------------------------------------------------------------------ */
/* Meters                                                               */
/* ------------------------------------------------------------------ */

const UNKNOWN = (key: string, label: string, why: string): QualitativeMeter => ({
  key,
  label,
  status: 'Unknown',
  strength: 0,
  plain: why,
  evidence_plain: null,
});

/**
 * Trend: EMA(20) slope over the last 10 bars, plus price against EMA(20)/EMA(50).
 * Slope is expressed as a percentage of price so a $600 stock and a $30 stock
 * are read on the same scale.
 */
export function trendMeter(candles: Candle[]): QualitativeMeter {
  const c = closes(candles);
  if (c.length < 50) return UNKNOWN('trend', 'Trend', 'Not enough history stored yet to read a trend.');
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  if (e20.length < 11 || e50.length < 1) return UNKNOWN('trend', 'Trend', 'Not enough history stored yet to read a trend.');

  const price = c[c.length - 1];
  const last20 = e20[e20.length - 1];
  const prior20 = e20[e20.length - 11];
  const last50 = e50[e50.length - 1];
  const slopePct = ((last20 - prior20) / price) * 100;

  const above20 = price > last20;
  const above50 = price > last50;
  const stacked = last20 > last50;

  // Score: slope direction and size, then the two structural agreements.
  let strength = 0;
  if (Math.abs(slopePct) >= 0.5) strength += 2;
  else if (Math.abs(slopePct) >= 0.15) strength += 1;
  if (above20 === slopePct >= 0) strength += 1;
  if (above50 === slopePct >= 0) strength += 1;
  if (stacked === slopePct >= 0) strength += 1;
  strength = Math.max(0, Math.min(5, strength));

  const up = slopePct > 0;
  const status =
    strength >= 4 ? 'Strong' : strength === 3 ? 'Confirmed' : strength === 2 ? 'Forming' : strength === 1 ? 'Waiting' : 'Neutral';

  const dir = Math.abs(slopePct) < 0.05 ? 'flat' : up ? 'rising' : 'falling';
  return {
    key: 'trend',
    label: 'Trend',
    status,
    strength,
    plain:
      dir === 'flat'
        ? 'The 20-day average is flat — there is no direction to lean on here.'
        : `The 20-day average is ${dir}, and price is ${above20 ? 'above' : 'below'} it.`,
    evidence_plain: `20-day average ${round2(last20)}, 50-day ${round2(last50)}, last close ${round2(price)}. Ten-bar slope ${slopePct >= 0 ? '+' : ''}${slopePct.toFixed(2)}% of price.`,
  };
}

/** Momentum: RSI(14) read as a band. */
export function momentumMeter(candles: Candle[]): QualitativeMeter {
  const c = closes(candles);
  const r = rsi(c, 14);
  if (r === null) return UNKNOWN('momentum', 'Momentum', 'Not enough history stored yet to read momentum.');

  let status: QualitativeMeter['status'];
  let strength: number;
  let plain: string;
  if (r >= 70) {
    status = 'Elevated';
    strength = 5;
    plain = 'Buyers have been in control long enough that the move is stretched.';
  } else if (r >= 60) {
    status = 'Strong';
    strength = 4;
    plain = 'Buyers have had the upper hand over the last few weeks.';
  } else if (r >= 50) {
    status = 'Healthy';
    strength = 3;
    plain = 'Slightly more buying than selling — the balance leans up.';
  } else if (r >= 40) {
    status = 'Neutral';
    strength = 2;
    plain = 'Buying and selling are roughly matched.';
  } else if (r >= 30) {
    status = 'Waiting';
    strength = 1;
    plain = 'Sellers have had the upper hand recently.';
  } else {
    status = 'Weak';
    strength = 0;
    plain = 'Sellers have been in control long enough that the move is stretched the other way.';
  }

  return {
    key: 'momentum',
    label: 'Momentum',
    status,
    strength,
    plain,
    evidence_plain: `Relative strength index over 14 days is ${Math.round(r)} out of 100. Above 70 is stretched up, below 30 stretched down.`,
  };
}

/** Volatility: ATR(14) as a percentage of price. */
export function volatilityMeter(candles: Candle[]): QualitativeMeter {
  const c = closes(candles);
  const a = atr(candles, 14);
  const price = c[c.length - 1];
  if (a === null || !price) return UNKNOWN('volatility', 'Volatility', 'Not enough history stored yet to read volatility.');

  const pct = (a / price) * 100;
  let status: QualitativeMeter['status'];
  let strength: number;
  let plain: string;
  if (pct >= 5) {
    status = 'Elevated';
    strength = 5;
    plain = 'Daily swings are wide. A normal stop sits further away here, so the same risk buys fewer shares.';
  } else if (pct >= 3) {
    status = 'Strong';
    strength = 4;
    plain = 'Daily swings are above average — there is room to move, and room to be wrong.';
  } else if (pct >= 2) {
    status = 'Healthy';
    strength = 3;
    plain = 'Daily range is normal for this name.';
  } else if (pct >= 1) {
    status = 'Supportive';
    strength = 2;
    plain = 'Daily range is on the quiet side, which keeps stops tight.';
  } else {
    status = 'Neutral';
    strength = 1;
    plain = 'Very little daily movement. There may not be enough range here for a trade to pay.';
  }

  return {
    key: 'volatility',
    label: 'Volatility',
    status,
    strength,
    plain,
    evidence_plain: `Average true range over 14 days is $${round2(a)}, which is ${pct.toFixed(2)}% of the last close.`,
  };
}

/* ------------------------------------------------------------------ */
/* The block                                                            */
/* ------------------------------------------------------------------ */

export function computeTechnicals(opts: {
  candles: Candle[];
  price: number | null;
  timeframe?: string;
  freshness?: Freshness;
}): Technicals {
  const candles = opts.candles;
  const tf = opts.timeframe ?? '1d';
  const enough = candles.length >= MIN_BARS;
  const lastTs = candles.length ? candles[candles.length - 1].ts : null;
  const price = opts.price ?? (candles.length ? candles[candles.length - 1].c : null);
  const { support, resistance } = enough ? swingLevels(candles, price) : { support: [], resistance: [] };

  return {
    trend: enough ? trendMeter(candles) : UNKNOWN('trend', 'Trend', 'Not enough stored history to read a trend yet.'),
    momentum: enough
      ? momentumMeter(candles)
      : UNKNOWN('momentum', 'Momentum', 'Not enough stored history to read momentum yet.'),
    volatility: enough
      ? volatilityMeter(candles)
      : UNKNOWN('volatility', 'Volatility', 'Not enough stored history to read volatility yet.'),
    support,
    resistance,
    computed_from: {
      timeframe: tf,
      bars: candles.length,
      last_bar_ts: lastTs,
      freshness: opts.freshness ?? 'delayed',
      plain: candles.length
        ? `Worked out from ${candles.length} daily bars, the last one dated ${String(lastTs).slice(0, 10)}.`
        : 'No stored bars for this symbol yet.',
    },
    degraded: !enough,
    degraded_reason: enough
      ? null
      : `I have ${candles.length} daily bar${candles.length === 1 ? '' : 's'} stored for this one and I want at least ${MIN_BARS} before I read anything into them.`,
  };
}
