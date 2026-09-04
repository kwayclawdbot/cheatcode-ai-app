/**
 * Computed chart levels — arithmetic on real bars, nothing else.
 *
 * WHY THIS FILE EXISTS. Kai's chart vocabulary was ten names long and every one
 * of them resolved off a graded setup or a saved plan. On a symbol with neither
 * — which is most symbols, most of the time — eight of the ten resolved to
 * nothing, so Kai stood in front of a chart with nothing he was allowed to draw
 * on it. The complaint that started this was "Kai doesn't accurately draw on
 * charts"; the measured cause was that he had almost nothing to draw WITH.
 *
 * THE RULE IS UNCHANGED AND THIS FILE IS WHAT MAKES IT AFFORDABLE. Kai names
 * WHICH level; the server resolves WHAT the number is. Everything below is a
 * function of stored candles — a previous day's high is a field on a bar, an
 * EMA is a recurrence over closes, a trendline is a line through two pivots that
 * actually printed. None of it asks a model for a price, and every value carries
 * enough context for the caller to say which bars and which timeframe produced
 * it.
 *
 * PORTED FROM THE WAR ROOM (`kai-agent-warroom/kai_agent_warroom/key_levels.py`),
 * which solved the same problem for the same person. The algorithms are kept
 * deliberately identical — 3-bar fractal swings, 0.5% level dedup, Wilder ATR,
 * RTH-only session VWAP, the adjacent-pivot trendline rule — so a level Kai
 * names here is the same level he named there. Two things were left behind on
 * purpose and both are documented at their call sites: `smart_stop_target` and
 * `compute_trade_setup`, which MANUFACTURE an entry, a stop and two targets for
 * any symbol on request. This app grades setups; a trade plan conjured out of
 * ATR arithmetic and handed to a user looks exactly like a graded one, and the
 * whole point of the anti-invention rule is that it should not be possible to
 * tell a real trade idea from a plausible one by looking at it.
 *
 * DATA SOURCE IS POLYGON, through the caller. Nothing here fetches; every
 * function takes candles. That keeps the caching, the rate limiting and the
 * degradation story in `market/polygon.ts` where they already live, and it makes
 * every function in this file a pure one that a test can drive with fixtures.
 */
import type { Candle } from '@shared/api';

/* ------------------------------------------------------------------ */
/* Small shared arithmetic                                              */
/* ------------------------------------------------------------------ */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A bar with every OHLC field actually present. Nulls are dropped, never zeroed. */
type SolidBar = { ts: string; o: number; h: number; l: number; c: number; v: number | null };

export function solidBars(candles: Candle[]): SolidBar[] {
  const out: SolidBar[] = [];
  for (const c of candles) {
    if (
      typeof c.o !== 'number' ||
      typeof c.h !== 'number' ||
      typeof c.l !== 'number' ||
      typeof c.c !== 'number'
    ) {
      continue;
    }
    out.push({ ts: c.ts, o: c.o, h: c.h, l: c.l, c: c.c, v: typeof c.v === 'number' ? c.v : null });
  }
  return out;
}

/**
 * Standard EMA, SMA-seeded, returning only the LAST value.
 *
 * Identical to `_ema` in the War Room and to `ema()` in `./technicals.ts`; this
 * one returns the tail because a level is a single price, and importing the
 * array version to take its last element made every call site read as though the
 * series mattered.
 */
export function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
}

/** Wilder's ATR over OHLC bars. Same smoothing as `technicals.atr`. */
export function atr14(bars: SolidBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].c;
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - p), Math.abs(bars[i].l - p)));
  }
  if (trs.length < period) return null;
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/**
 * Two levels within `tolerance` of each other are one level.
 *
 * 0.5% is the War Room's number and it is the right one for daily bars: three
 * touches of the same shelf at 604.10, 604.88 and 605.20 are one shelf, and
 * listing them as three would make the chart look busy and the analysis look
 * precise when it is neither.
 */
export function dedupLevels(levels: number[], tolerance = 0.005): number[] {
  const sorted = [...new Set(levels)].sort((a, b) => a - b).filter((n) => Number.isFinite(n) && n > 0);
  if (!sorted.length) return [];
  const out = [sorted[0]];
  for (const lv of sorted.slice(1)) {
    if ((lv - out[out.length - 1]) / out[out.length - 1] > tolerance) out.push(lv);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Swing pivots                                                         */
/* ------------------------------------------------------------------ */

export type Pivot = { idx: number; price: number; ts: string };

/**
 * 3-bar fractal: a bar whose high beats the bar either side of it.
 *
 * NOT THE SAME AS `technicals.pivots`, and the difference is deliberate. That
 * one uses a 3-bar LOOKBACK (seven bars wide) and feeds the clustered support
 * and resistance the ticker page already shows. This one is the War Room's
 * narrower fractal, which finds the turning points a trendline is drawn through
 * — a 7-wide pivot on 80 bars finds two or three points, which is not enough to
 * draw a line between.
 */
export function fractals(bars: SolidBar[], side: 'high' | 'low'): Pivot[] {
  const out: Pivot[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    if (side === 'high') {
      if (bars[i].h > bars[i - 1].h && bars[i].h > bars[i + 1].h) {
        out.push({ idx: i, price: bars[i].h, ts: bars[i].ts });
      }
    } else if (bars[i].l < bars[i - 1].l && bars[i].l < bars[i + 1].l) {
      out.push({ idx: i, price: bars[i].l, ts: bars[i].ts });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Daily key levels                                                     */
/* ------------------------------------------------------------------ */

/** One computed level: a price, where it came from, and the bar behind it. */
export type NamedLevel = {
  /** The symbolic name Kai is allowed to say. */
  name: string;
  price: number;
  /** Plain English, for the annotation's reason line. */
  what: string;
  /** Which bars produced it. Goes verbatim into `provenance`. */
  from: string;
  /** The bar this level is ABOUT, when one bar owns it. Null for averages. */
  ts: string | null;
};

export type KeyLevels = {
  /** Last close of the series the levels were computed from. */
  current: number;
  atr14: number | null;
  /** Every named level, in no particular order. */
  levels: NamedLevel[];
  /** Above `current`, nearest first. */
  resistance: NamedLevel[];
  /** Below `current`, nearest first. */
  support: NamedLevel[];
  /** How many bars, and the window they cover. */
  bars: number;
  firstTs: string | null;
  lastTs: string | null;
};

const day = (ts: string) => ts.slice(0, 10);

/**
 * Daily key levels from a daily series.
 *
 * The list is the War Room's, unchanged: previous day's high, low and close;
 * EMA 8 / 21 / 50 / 200; the 52-week extremes; and the recent 3-bar-fractal
 * swings. The EMAs are the ones the chart itself draws, which is the whole
 * reason they are on the list — "it is holding the 50-day" has to mean the same
 * line the user is looking at or it means nothing.
 *
 * `null` when there are fewer than 20 bars. A "previous day's high" off a
 * six-bar series is a number with no window behind it.
 */
export function computeKeyLevels(candles: Candle[]): KeyLevels | null {
  const bars = solidBars(candles);
  if (bars.length < 20) return null;

  const closes = bars.map((b) => b.c);
  const current = closes[closes.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : bars[bars.length - 1];
  const window = `${day(bars[0].ts)} to ${day(bars[bars.length - 1].ts)}`;
  const levels: NamedLevel[] = [];

  levels.push({
    name: 'prior_day_high',
    price: prev.h,
    what: `The high of the previous session, $${round2(prev.h)}.`,
    from: `The high of the daily bar dated ${day(prev.ts)}.`,
    ts: prev.ts,
  });
  levels.push({
    name: 'prior_day_low',
    price: prev.l,
    what: `The low of the previous session, $${round2(prev.l)}.`,
    from: `The low of the daily bar dated ${day(prev.ts)}.`,
    ts: prev.ts,
  });
  levels.push({
    name: 'prior_day_close',
    price: prev.c,
    what: `Where the previous session settled, $${round2(prev.c)}.`,
    from: `The close of the daily bar dated ${day(prev.ts)}.`,
    ts: prev.ts,
  });

  for (const p of [8, 21, 50, 200] as const) {
    const v = emaLast(closes, p);
    if (v === null) continue;
    levels.push({
      name: `ema${p}`,
      price: v,
      what: `The ${p}-day moving average, currently $${round2(v)}. It is a line, so it moves with every new close.`,
      from: `${p}-day exponential moving average of ${closes.length} daily closes, ${window}.`,
      ts: null,
    });
  }

  // 52 weeks is 252 trading days. With less history than that this is the
  // extreme of everything stored, and the provenance says so rather than
  // claiming a year nobody has the bars for.
  const yearSlice = bars.slice(-252);
  const yearWindow = `${day(yearSlice[0].ts)} to ${day(yearSlice[yearSlice.length - 1].ts)}`;
  const full = yearSlice.length >= 252;
  let hi = yearSlice[0];
  let lo = yearSlice[0];
  for (const b of yearSlice) {
    if (b.h > hi.h) hi = b;
    if (b.l < lo.l) lo = b;
  }
  levels.push({
    name: 'year_high',
    price: hi.h,
    what: `The highest price in ${full ? 'the last year' : 'the stored history'}, $${round2(hi.h)}.`,
    from: `Highest daily high across ${yearSlice.length} bars, ${yearWindow}${full ? '' : ' — less than a full year of bars'}. Set on ${day(hi.ts)}.`,
    ts: hi.ts,
  });
  levels.push({
    name: 'year_low',
    price: lo.l,
    what: `The lowest price in ${full ? 'the last year' : 'the stored history'}, $${round2(lo.l)}.`,
    from: `Lowest daily low across ${yearSlice.length} bars, ${yearWindow}${full ? '' : ' — less than a full year of bars'}. Set on ${day(lo.ts)}.`,
    ts: lo.ts,
  });

  // Recent swings — the last 20 bars, exactly as the War Room reads them.
  const recent = bars.slice(-20);
  const recentWindow = `${day(recent[0].ts)} to ${day(recent[recent.length - 1].ts)}`;
  const swingHighs = fractals(recent, 'high');
  const swingLows = fractals(recent, 'low');
  const highPrices = new Set(dedupLevels(swingHighs.map((p) => round2(p.price))));
  const lowPrices = new Set(dedupLevels(swingLows.map((p) => round2(p.price))));
  // Newest first, so `swing_high` means the most recent one that survived dedup.
  const keptHighs = [...swingHighs].reverse().filter((p) => highPrices.has(round2(p.price)));
  const keptLows = [...swingLows].reverse().filter((p) => lowPrices.has(round2(p.price)));
  if (keptHighs[0]) {
    levels.push({
      name: 'swing_high',
      price: keptHighs[0].price,
      what: `The most recent place buyers ran out of room, $${round2(keptHighs[0].price)}.`,
      from: `A 3-bar swing high on the daily bar dated ${day(keptHighs[0].ts)}, found in the last 20 bars (${recentWindow}).`,
      ts: keptHighs[0].ts,
    });
  }
  if (keptLows[0]) {
    levels.push({
      name: 'swing_low',
      price: keptLows[0].price,
      what: `The most recent place sellers ran out of room, $${round2(keptLows[0].price)}.`,
      from: `A 3-bar swing low on the daily bar dated ${day(keptLows[0].ts)}, found in the last 20 bars (${recentWindow}).`,
      ts: keptLows[0].ts,
    });
  }

  // The 0.2% dead band around price is the War Room's: a "resistance" one tick
  // above the last close is not a level, it is the last close.
  const resistance = levels.filter((l) => l.price > current * 1.002).sort((a, b) => a.price - b.price);
  const support = levels.filter((l) => l.price < current * 0.998).sort((a, b) => b.price - a.price);

  return {
    current,
    atr14: atr14(bars),
    levels,
    resistance,
    support,
    bars: bars.length,
    firstTs: bars[0].ts,
    lastTs: bars[bars.length - 1].ts,
  };
}

/* ------------------------------------------------------------------ */
/* Intraday levels                                                      */
/* ------------------------------------------------------------------ */

const NY = 'America/New_York';

/** Minutes past ET midnight for a bar, and its ET calendar date. */
export function etOf(ts: string): { date: string; minutes: number } | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: NY,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: hour * 60 + Number(parts.minute) };
}

const PRE_OPEN = 4 * 60;
const RTH_OPEN = 9 * 60 + 30;
const ORB_END = 9 * 60 + 45;
const RTH_CLOSE = 16 * 60;

export type IntradayLevels = {
  /** The ET session date these levels belong to. */
  date: string;
  current: number;
  levels: NamedLevel[];
  bars: number;
  hasRth: boolean;
};

/**
 * Today's session, off 5-minute bars.
 *
 * PREMARKET IS PART OF THE SESSION AND NOT PART OF VWAP. Both are conventions
 * and both are the ones traders mean: the premarket high is a level people
 * trade against, and "VWAP" without qualification means the regular-hours one.
 * Mixing 04:00 prints into VWAP drags it around on thin volume and would make
 * Kai's number disagree with every chart the user has ever seen.
 *
 * THE SESSION IS THE LAST ONE WITH BARS, not necessarily today. Ask on a Sunday
 * and today's session is empty; the honest answer is Friday's levels labelled as
 * Friday's, not silence.
 */
export function computeIntradayLevels(candles: Candle[]): IntradayLevels | null {
  const bars = solidBars(candles);
  if (!bars.length) return null;

  const stamped = bars
    .map((b) => ({ bar: b, et: etOf(b.ts) }))
    .filter((x): x is { bar: SolidBar; et: { date: string; minutes: number } } => x.et !== null);
  if (!stamped.length) return null;

  const date = stamped[stamped.length - 1].et.date;
  const session = stamped.filter((x) => x.et.date === date && x.et.minutes >= PRE_OPEN);
  if (!session.length) return null;

  const premarket = session.filter((x) => x.et.minutes < RTH_OPEN);
  const rth = session.filter((x) => x.et.minutes >= RTH_OPEN && x.et.minutes < RTH_CLOSE);
  const orb = rth.filter((x) => x.et.minutes < ORB_END);

  const current = session[session.length - 1].bar.c;
  const levels: NamedLevel[] = [];
  const push = (
    name: string,
    price: number | null,
    ts: string | null,
    what: string,
    from: string
  ) => {
    if (price === null || !Number.isFinite(price)) return;
    levels.push({ name, price, what, from, ts });
  };

  const extreme = (
    rows: typeof session,
    side: 'h' | 'l'
  ): { price: number; ts: string } | null => {
    if (!rows.length) return null;
    let best = rows[0];
    for (const r of rows) {
      if (side === 'h' ? r.bar.h > best.bar.h : r.bar.l < best.bar.l) best = r;
    }
    return { price: side === 'h' ? best.bar.h : best.bar.l, ts: best.bar.ts };
  };

  const pmH = extreme(premarket, 'h');
  const pmL = extreme(premarket, 'l');
  push(
    'premarket_high',
    pmH?.price ?? null,
    pmH?.ts ?? null,
    `The highest price before the bell, $${pmH ? round2(pmH.price) : ''}.`,
    `Highest 5-minute high between 04:00 and 09:30 ET on ${date}, across ${premarket.length} bars.`
  );
  push(
    'premarket_low',
    pmL?.price ?? null,
    pmL?.ts ?? null,
    `The lowest price before the bell, $${pmL ? round2(pmL.price) : ''}.`,
    `Lowest 5-minute low between 04:00 and 09:30 ET on ${date}, across ${premarket.length} bars.`
  );

  const orbH = extreme(orb, 'h');
  const orbL = extreme(orb, 'l');
  push(
    'open_range_high',
    orbH?.price ?? null,
    orbH?.ts ?? null,
    `The top of the first fifteen minutes, $${orbH ? round2(orbH.price) : ''}. Breaking it is the classic opening-range trigger.`,
    `Highest 5-minute high between 09:30 and 09:45 ET on ${date}, across ${orb.length} bars.`
  );
  push(
    'open_range_low',
    orbL?.price ?? null,
    orbL?.ts ?? null,
    `The bottom of the first fifteen minutes, $${orbL ? round2(orbL.price) : ''}.`,
    `Lowest 5-minute low between 09:30 and 09:45 ET on ${date}, across ${orb.length} bars.`
  );

  const dayRows = rth.length ? rth : session;
  const label = rth.length ? 'regular hours' : 'the session so far';
  const hod = extreme(dayRows, 'h');
  const lod = extreme(dayRows, 'l');
  push(
    'session_high',
    hod?.price ?? null,
    hod?.ts ?? null,
    `The high of the day, $${hod ? round2(hod.price) : ''}.`,
    `Highest 5-minute high in ${label} on ${date}, across ${dayRows.length} bars.`
  );
  push(
    'session_low',
    lod?.price ?? null,
    lod?.ts ?? null,
    `The low of the day, $${lod ? round2(lod.price) : ''}.`,
    `Lowest 5-minute low in ${label} on ${date}, across ${dayRows.length} bars.`
  );

  // Session VWAP: typical price weighted by volume, regular hours only.
  let pv = 0;
  let vol = 0;
  for (const r of dayRows) {
    const v = r.bar.v;
    if (v === null || v <= 0) continue;
    pv += ((r.bar.h + r.bar.l + r.bar.c) / 3) * v;
    vol += v;
  }
  if (vol > 0) {
    push(
      'vwap',
      pv / vol,
      dayRows[dayRows.length - 1].bar.ts,
      `The volume-weighted average price for the session, $${round2(pv / vol)} — the average price everyone who traded today actually paid.`,
      `Typical price times volume over ${dayRows.length} five-minute bars in ${label} on ${date}.`
    );
  }

  return { date, current, levels, bars: session.length, hasRth: rth.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Trendlines                                                           */
/* ------------------------------------------------------------------ */

export type TrendLine = {
  kind: 'uptrend' | 'downtrend' | 'range';
  label: string;
  /** The two bars the line is drawn through. Both printed. */
  fromTs: string;
  fromPrice: number;
  toTs: string;
  toPrice: number;
  /** True when `toTs` is the latest bar rather than the second pivot. */
  extended: boolean;
  /** The line was decisively closed through. `toTs` is the bar that did it. */
  broken: boolean;
  from: string;
};

/**
 * Trendlines found by the algorithm, never guessed.
 *
 * THE ALGORITHM IS THE WAR ROOM'S, and it is deliberately narrow: the two most
 * recent ADJACENT swing highs that descend give the downtrend line, the two most
 * recent adjacent swing lows that ascend give the uptrend line, and two swing
 * highs within 1.5% of each other give the top of a range. Adjacent matters —
 * connecting any two descending highs finds a "trendline" on every chart ever
 * printed, which is exactly how hand-drawn trendlines get their reputation.
 *
 * THE LINE IS THEN CARRIED FORWARD, WHICH IS WHERE THIS STOPPED BEING A PORT.
 * The War Room's line ends at the second pivot, which describes history and
 * cannot answer "is it holding?". Carrying it forward is arithmetic on the slope
 * between two real bars — but carried forward blindly it produces the exact bug
 * that started this work. Measured on NVDA, 2026-09-03: the most recent
 * descending pair of swing highs was 22 and 30 June, price rose straight through
 * the line within days, and extending it to today drew a "downtrend" at $98
 * under a stock trading at $228. Nothing about that is inaccurate arithmetic and
 * everything about it is an inaccurate drawing.
 *
 * SO A LINE IS ONLY CARRIED AS FAR AS IT SURVIVED. Walk the bars after the
 * second pivot; the first CLOSE more than 1% through the line is where it broke,
 * and the line ends on that bar and says so. A line nothing has closed through
 * runs to the latest bar. Either way both ends are bars that printed and the
 * sentence attached to it is true, which is the only version of a trendline
 * worth putting in front of somebody.
 *
 * AND AN UNBROKEN LINE IS PREFERRED. Candidates are walked newest first and the
 * first one still intact wins; a broken line is drawn only when there is no
 * intact one, because "this held until the 3rd, then went" is worth saying and
 * silence is not.
 */
export function findTrendlines(candles: Candle[], maxLines = 3): TrendLine[] {
  const all = solidBars(candles);
  if (all.length < 20) return [];
  const bars = all.slice(-80);
  const last = bars[bars.length - 1];
  const window = `${day(bars[0].ts)} to ${day(last.ts)}`;
  /** How far through a line a close has to sit before it counts as a break. */
  const TOL = 0.01;

  const highs = fractals(bars, 'high');
  const lows = fractals(bars, 'low');

  type End = { ts: string; price: number; extended: boolean; broken: boolean };

  /**
   * Where the line ends: the bar it was broken on, or the latest bar.
   *
   * `side` is which way a violation goes — a resistance line is broken by a
   * close ABOVE it, a support line by a close BELOW it.
   */
  const carry = (a: Pivot, b: Pivot, side: 'resistance' | 'support'): End => {
    const slope = b.idx === a.idx ? 0 : (b.price - a.price) / (b.idx - a.idx);
    const at = (idx: number) => b.price + slope * (idx - b.idx);
    for (let i = b.idx + 1; i < bars.length; i++) {
      const line = at(i);
      if (!Number.isFinite(line) || line <= 0) return { ts: bars[i - 1].ts, price: at(i - 1), extended: true, broken: false };
      const through = side === 'resistance' ? bars[i].c > line * (1 + TOL) : bars[i].c < line * (1 - TOL);
      if (through) return { ts: bars[i].ts, price: line, extended: i > b.idx, broken: true };
    }
    const end = at(bars.length - 1);
    if (!Number.isFinite(end) || end <= 0) return { ts: b.ts, price: b.price, extended: false, broken: false };
    return { ts: last.ts, price: end, extended: b.idx < bars.length - 1, broken: false };
  };

  /** The most recent qualifying pair, preferring one whose line still holds. */
  const pick = (
    pivots: Pivot[],
    side: 'resistance' | 'support',
    qualifies: (a: Pivot, b: Pivot) => boolean
  ): { a: Pivot; b: Pivot; end: End } | null => {
    let fallback: { a: Pivot; b: Pivot; end: End } | null = null;
    for (let i = pivots.length - 1; i > 0; i--) {
      const a = pivots[i - 1];
      const b = pivots[i];
      if (!qualifies(a, b)) continue;
      const end = carry(a, b, side);
      if (!end.broken) return { a, b, end };
      if (!fallback) fallback = { a, b, end };
    }
    return fallback;
  };

  const held = (end: End) =>
    end.broken
      ? `, and held until a close went through it on ${day(end.ts)}`
      : end.extended
        ? `, then carried forward at that slope to ${day(end.ts)} — nothing has closed through it since`
        : '';

  const out: TrendLine[] = [];

  const dn = pick(highs, 'resistance', (a, b) => b.price < a.price && b.idx - a.idx >= 3);
  if (dn) {
    out.push({
      kind: 'downtrend',
      label: dn.end.broken ? 'Downtrend (broken)' : 'Downtrend',
      fromTs: dn.a.ts,
      fromPrice: dn.a.price,
      toTs: dn.end.ts,
      toPrice: dn.end.price,
      extended: dn.end.extended,
      broken: dn.end.broken,
      from:
        `Drawn through two swing highs that actually printed — $${round2(dn.a.price)} on ${day(dn.a.ts)} and $${round2(dn.b.price)} on ${day(dn.b.ts)}` +
        `${held(dn.end)}. Found in 80 daily bars, ${window}.`,
    });
  }

  const up = pick(lows, 'support', (a, b) => b.price > a.price && b.idx - a.idx >= 3);
  if (up) {
    out.push({
      kind: 'uptrend',
      label: up.end.broken ? 'Uptrend (broken)' : 'Uptrend',
      fromTs: up.a.ts,
      fromPrice: up.a.price,
      toTs: up.end.ts,
      toPrice: up.end.price,
      extended: up.end.extended,
      broken: up.end.broken,
      from:
        `Drawn through two swing lows that actually printed — $${round2(up.a.price)} on ${day(up.a.ts)} and $${round2(up.b.price)} on ${day(up.b.ts)}` +
        `${held(up.end)}. Found in 80 daily bars, ${window}.`,
    });
  }

  if (out.length < maxLines) {
    const flat = pick(
      highs,
      'resistance',
      (a, b) => Math.abs(b.price - a.price) / Math.max(a.price, 1e-9) < 0.015 && b.idx - a.idx >= 5
    );
    if (flat) {
      const avg = (flat.a.price + flat.b.price) / 2;
      // A flat ceiling is horizontal, so it is carried at its own price rather
      // than at a slope, and the break test is run against that price.
      let brokeAt: string | null = null;
      for (let i = flat.b.idx + 1; i < bars.length; i++) {
        if (bars[i].c > avg * (1 + TOL)) {
          brokeAt = bars[i].ts;
          break;
        }
      }
      out.push({
        kind: 'range',
        label: brokeAt ? 'Range top (broken)' : 'Range top',
        fromTs: flat.a.ts,
        fromPrice: avg,
        toTs: brokeAt ?? last.ts,
        toPrice: avg,
        extended: flat.b.idx < bars.length - 1,
        broken: brokeAt !== null,
        from:
          `A flat ceiling: two swing highs within 1.5% of each other — $${round2(flat.a.price)} on ${day(flat.a.ts)} and $${round2(flat.b.price)} on ${day(flat.b.ts)} ` +
          `— averaged to $${round2(avg)}${brokeAt ? `, and held until a close went through it on ${day(brokeAt)}` : ', and nothing has closed through it since'}. Found in 80 daily bars, ${window}.`,
      });
    }
  }

  return out.slice(0, maxLines);
}

/* ------------------------------------------------------------------ */
/* Fibonacci retracement                                                */
/* ------------------------------------------------------------------ */

export type FibLevel = { ratio: number; name: string; price: number };
export type FibGrid = {
  direction: 'up' | 'down';
  /** The two ends of the move being retraced. Both are real bars. */
  fromTs: string;
  fromPrice: number;
  toTs: string;
  toPrice: number;
  levels: FibLevel[];
  from: string;
};

const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;

/**
 * A fib grid over a swing the algorithm found, not one a model described.
 *
 * THE SWING IS THE MOVE, NOT A GUESS AT IT. Take the last `lookback` bars, find
 * the highest high and the lowest low in them, and the ORDER they printed in is
 * the direction: low then high is an up-move being retraced from above, high
 * then low is the reverse. That is the only choice being made here and it is
 * made by comparing two timestamps.
 *
 * A move worth retracing has to be a move: under 3% top to bottom, this returns
 * null rather than laying a five-line grid over noise.
 */
export function computeFib(candles: Candle[], lookback = 120): FibGrid | null {
  const all = solidBars(candles);
  if (all.length < 20) return null;
  const bars = all.slice(-lookback);

  let hi = bars[0];
  let lo = bars[0];
  for (const b of bars) {
    if (b.h > hi.h) hi = b;
    if (b.l < lo.l) lo = b;
  }
  if (hi.ts === lo.ts) return null;
  const span = hi.h - lo.l;
  if (!(span > 0) || span / lo.l < 0.03) return null;

  const upMove = new Date(lo.ts).getTime() < new Date(hi.ts).getTime();
  const direction: 'up' | 'down' = upMove ? 'up' : 'down';
  // Retracement is measured back from the END of the move toward its start.
  const start = upMove ? lo.l : hi.h;
  const end = upMove ? hi.h : lo.l;
  const startTs = upMove ? lo.ts : hi.ts;
  const endTs = upMove ? hi.ts : lo.ts;

  const levels: FibLevel[] = FIB_RATIOS.map((r) => ({
    ratio: r,
    name: `fib_${String(r).replace('0.', '')}`,
    price: end - (end - start) * r,
  }));

  return {
    direction,
    fromTs: startTs,
    fromPrice: start,
    toTs: endTs,
    toPrice: end,
    levels,
    from:
      `Measured on the ${direction === 'up' ? 'move up' : 'move down'} from $${round2(start)} on ${day(startTs)} to $${round2(end)} on ${day(endTs)} — ` +
      `the lowest low and highest high in the last ${bars.length} daily bars, in the order they printed.`,
  };
}

/* ------------------------------------------------------------------ */
/* Anchored VWAP                                                        */
/* ------------------------------------------------------------------ */

export type AnchoredVwap = {
  anchor: string;
  anchorTs: string;
  price: number;
  bars: number;
  from: string;
};

/**
 * VWAP anchored to a bar the caller NAMED, computed forward from it.
 *
 * The anchor is never a date the model typed. It is the timestamp of a level
 * this file already resolved — the year's low, the most recent swing high, the
 * bar an alert triggered on — so the question "anchored to what?" always has an
 * answer that points at a real candle.
 *
 * ONE NUMBER, NOT A CURVE. The chart draws a horizontal at the anchored VWAP's
 * CURRENT value, which is what the level means when a person says "it is above
 * the VWAP from the earnings gap". Drawing the full curve would need a series
 * annotation the chart does not have, and faking it with a straight line from
 * the anchor to today would be a picture of something that never happened.
 */
export function computeAnchoredVwap(
  candles: Candle[],
  anchorTs: string,
  anchorName: string
): AnchoredVwap | null {
  const bars = solidBars(candles);
  const anchorMs = new Date(anchorTs).getTime();
  if (!bars.length || Number.isNaN(anchorMs)) return null;
  let pv = 0;
  let vol = 0;
  let n = 0;
  let first: string | null = null;
  for (const b of bars) {
    if (new Date(b.ts).getTime() < anchorMs) continue;
    const v = b.v;
    if (v === null || v <= 0) continue;
    if (first === null) first = b.ts;
    pv += ((b.h + b.l + b.c) / 3) * v;
    vol += v;
    n += 1;
  }
  // Two bars is not an average. One bar's VWAP is that bar's typical price
  // wearing a more impressive name.
  if (vol <= 0 || n < 3 || first === null) return null;
  return {
    anchor: anchorName,
    anchorTs: first,
    price: pv / vol,
    bars: n,
    from: `Volume-weighted average price of ${n} daily bars from ${day(first)} (the ${anchorName.replace(/_/g, ' ')}) to ${day(bars[bars.length - 1].ts)}.`,
  };
}
