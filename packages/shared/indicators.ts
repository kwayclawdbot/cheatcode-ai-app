/**
 * The indicator library — one entry per indicator, and nothing else to change.
 *
 * WHY THIS IS A REGISTRY AND NOT A SWITCH. The first version of this file knew
 * three things — `ema`, `sma`, `vwap` — and it knew them as branches: a branch
 * in the parser, a branch in the resolver, a name in a hand-written list in the
 * prompt, a case in the renderer. Adding Bollinger Bands that way is five edits
 * in five files and four chances to get one of them wrong, and the way that
 * failure shows up is Kai offering an indicator the chart cannot draw, which is
 * the exact "he said it and nothing appeared" bug this product keeps paying for.
 *
 * So an indicator is a ROW. The row declares what Kai may call it, what
 * parameters it takes, what it is called on screen, how heavy its line is, and
 * — the part that matters most — whether it can be drawn on a price chart AT
 * ALL. Everything downstream reads the row: the parser, the resolver, the
 * prompt, the levels tool, and the chart page's own compute table.
 *
 * REFUSING IS A FIRST-CLASS ANSWER. RSI is measured 0 to 100. It cannot share a
 * y-axis with a price in dollars, and an RSI "drawn on price" is either a flat
 * line near zero or a rescaled invention that looks like analysis and is not. So
 * `surface: 'panel'` entries exist precisely so that asking for one produces a
 * plain sentence Kai can say out loud instead of a wrong line. A refusal the
 * user understands is a better outcome than a drawing they cannot check.
 *
 * WHERE THE MATH LIVES, AND WHY IT LIVES TWICE. The series is computed twice, on
 * purpose: here in TypeScript, so the server can price the newest value for the
 * label and the levels rail; and again in `apps/mobile/chart-web/src/03-
 * annotations.js`, because the chart page is a self-contained document with no
 * module system (see chart-web/build.mjs) and it is the one holding the candles.
 * Sending a precomputed series down the bridge instead would send something
 * derivable, that goes stale on the next tick, and that has to be re-sent on
 * every pan. The duplication is real and it is CHECKED: `chart-indicators-test`
 * runs both over the same fixture bars and fails if any entry disagrees.
 */

/* ------------------------------------------------------------------ */
/* The row                                                             */
/* ------------------------------------------------------------------ */

export type IndicatorId =
  | 'ema'
  | 'sma'
  | 'vwap'
  | 'bollinger'
  | 'trend_clouds'
  /* Panel indicators. Named so they can be REFUSED by name. */
  | 'rsi'
  | 'macd'
  | 'stochastic';

/** Kept as `IndicatorName` for the wire field, which is the id. */
export type IndicatorName = IndicatorId;

export type IndicatorSpec = {
  indicator: IndicatorId;
  /** Bars in the lookback. Null for VWAP, which is anchored rather than windowed. */
  period: number | null;
  /** Standard deviations, or the ATR multiple. Null when the indicator has none. */
  mult?: number | null;
};

export type IndicatorEntry = {
  id: IndicatorId;
  /**
   * Everything Kai may call it, lowercased. Matched longest-first, so
   * "bollinger bands" wins over "bollinger" and neither is a prefix accident.
   */
  aliases: string[];
  /**
   * `price` — shares the candles' y-axis and is drawn over them.
   * `panel` — has its own scale and CANNOT be. `refusal` says why, in a sentence
   * meant to be read aloud to a beginner.
   */
  surface: 'price' | 'panel';
  refusal?: string;
  /** Null means the indicator does not take that parameter. */
  params: {
    period: { default: number; min: number; max: number } | null;
    mult: { default: number; min: number; max: number } | null;
  };
  /**
   * The series this indicator produces, in draw order. One name for a plain
   * line; three for a band. The FIRST is the primary — it is what `price` on the
   * annotation row reports, and what the levels rail shows.
   */
  outputs: string[];
  /** Fill between the first and last output. Only meaningful for a band. */
  band: boolean;
  /** Line weight in px, and the dash pattern. Colour is never here — see below. */
  style: { weight: number; dash: number[] | null };
  /** How it is written on the chip and in the rail. */
  label: (p: IndicatorSpec) => string;
  /** One sentence saying what it IS, for the annotation's reason line. */
  plain: (p: IndicatorSpec) => string;
};

/**
 * NO COLOUR IN THIS FILE. Every overlay is drawn in the one muted family
 * (palette lock 14 — see src/features/chart/semantics.ts), because colour on
 * this chart means MEANING: cyan is market information, red is risk, green is
 * the outcome. An indicator that picked its own hue would be claiming one of
 * those. Curves are told apart by their labels and their weight.
 */

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** "EMA 21", and "BB 20" — the multiple is shown only when it is not the default. */
function windowed(name: string, p: IndicatorSpec, entry: IndicatorEntry): string {
  const period = p.period ?? entry.params.period?.default ?? null;
  const mult = p.mult ?? null;
  const defMult = entry.params.mult?.default ?? null;
  const tail = mult !== null && defMult !== null && Math.abs(mult - defMult) > 1e-9 ? ` (${round(mult, 2)}σ)` : '';
  return `${name}${period === null ? '' : ` ${period}`}${tail}`;
}

export const INDICATORS: Record<IndicatorId, IndicatorEntry> = {
  ema: {
    id: 'ema',
    // `ma` and `moving average` land here on purpose: every average this system
    // computes elsewhere is exponential (`emaLast` in market/key-levels.ts), so
    // calling an unqualified one "simple" would put a name on the chart that
    // does not match the number under it.
    aliases: ['ema', 'exponential moving average', 'moving average', 'ma'],
    surface: 'price',
    params: { period: { default: 21, min: 2, max: 500 }, mult: null },
    outputs: ['ema'],
    band: false,
    style: { weight: 1.2, dash: null },
    label: (p) => windowed('EMA', p, INDICATORS.ema),
    plain: (p) => `the ${p.period}-bar exponential moving average — a line that moves with every new close, not a fixed price`,
  },
  sma: {
    id: 'sma',
    aliases: ['sma', 'simple moving average'],
    surface: 'price',
    params: { period: { default: 20, min: 2, max: 500 }, mult: null },
    outputs: ['sma'],
    band: false,
    style: { weight: 1.2, dash: null },
    label: (p) => windowed('SMA', p, INDICATORS.sma),
    plain: (p) => `the ${p.period}-bar simple moving average — the plain average of the last ${p.period} closes, recomputed on every bar`,
  },
  vwap: {
    id: 'vwap',
    aliases: ['vwap', 'volume weighted average price', 'volume-weighted average price', 'session vwap'],
    surface: 'price',
    params: { period: null, mult: null },
    outputs: ['vwap'],
    band: false,
    // Dashed, because it is the only one of these that RESTARTS rather than
    // rolling. The dash is what says "this began somewhere".
    style: { weight: 1.3, dash: [5, 3] },
    label: () => 'VWAP',
    plain: () =>
      'the average price everyone who traded has actually paid, weighted by how much traded at each price — it restarts at the anchor and moves with every trade',
  },
  bollinger: {
    id: 'bollinger',
    aliases: ['bollinger bands', 'bollinger band', 'bollinger', 'bbands', 'bb'],
    surface: 'price',
    params: { period: { default: 20, min: 2, max: 500 }, mult: { default: 2, min: 0.5, max: 5 } },
    // Middle FIRST, because it is the primary: the band's own average is the
    // number that answers "where is it", and the edges are a distance from it.
    outputs: ['basis', 'upper', 'lower'],
    band: true,
    style: { weight: 1, dash: null },
    label: (p) => windowed('BB', p, INDICATORS.bollinger),
    plain: (p) =>
      `a ${p.period}-bar average with a band drawn ${p.mult ?? 2} standard deviations either side of it — the band widens when the stock gets jumpy and squeezes when it goes quiet`,
  },
  trend_clouds: {
    id: 'trend_clouds',
    /**
     * "SuperTrend" IS AN ALIAS AND IS NEVER A LABEL. It is the upstream name of
     * the algorithm and it is what a trader will type; the product's name for it
     * is CheatCode Trend Clouds and that is the only thing ever shown or said
     * (see workers/kai-live/src/voice.ts, which fails a script that says the
     * other one).
     */
    aliases: ['cheatcode trend clouds', 'trend clouds', 'trend cloud', 'clouds', 'supertrend', 'super trend'],
    surface: 'price',
    params: { period: { default: 20, min: 2, max: 200 }, mult: { default: 1.5, min: 0.5, max: 10 } },
    outputs: ['line', 'upper', 'lower'],
    band: true,
    style: { weight: 1.5, dash: null },
    label: (p) => windowed('Trend Clouds', p, INDICATORS.trend_clouds),
    plain: () =>
      'the CheatCode Trend Clouds — a band that follows price up and ratchets behind it, flipping to the other side when the trend gives way',
  },

  /* ---- indicators that cannot share the price axis ---- */
  //
  // These exist so that ASKING for one produces a sentence instead of a
  // drawing. Before they were here, a request for RSI resolved to nothing at
  // all and Kai either went quiet or found something else to draw — and the one
  // thing worse than refusing is rescaling a 0-100 oscillator onto a dollar
  // axis, which looks like analysis and is arithmetic nonsense.
  rsi: {
    id: 'rsi',
    aliases: ['rsi', 'relative strength index'],
    surface: 'panel',
    refusal:
      'RSI needs its own panel — it is measured from 0 to 100, not in dollars, so it cannot be drawn on the price chart. I can tell you what it reads instead.',
    params: { period: { default: 14, min: 2, max: 200 }, mult: null },
    outputs: ['rsi'],
    band: false,
    style: { weight: 1.2, dash: null },
    label: (p) => windowed('RSI', p, INDICATORS.rsi),
    plain: (p) => `how hard the last ${p.period} bars have been bought versus sold, on a 0 to 100 scale`,
  },
  macd: {
    id: 'macd',
    aliases: ['macd', 'moving average convergence divergence'],
    surface: 'panel',
    refusal:
      'MACD needs its own panel — it is the gap between two averages, which is a distance rather than a price, so it does not belong on the price chart.',
    params: { period: null, mult: null },
    outputs: ['macd'],
    band: false,
    style: { weight: 1.2, dash: null },
    label: () => 'MACD',
    plain: () => 'the gap between two moving averages, and whether that gap is widening or closing',
  },
  stochastic: {
    id: 'stochastic',
    aliases: ['stochastic', 'stochastics', 'stoch'],
    surface: 'panel',
    refusal:
      'The stochastic needs its own panel — like RSI it runs 0 to 100 rather than in dollars, so it cannot be drawn over the candles.',
    params: { period: { default: 14, min: 2, max: 200 }, mult: null },
    outputs: ['stochastic'],
    band: false,
    style: { weight: 1.2, dash: null },
    label: (p) => windowed('Stoch', p, INDICATORS.stochastic),
    plain: (p) => `where the last close sits inside the last ${p.period} bars' range, on a 0 to 100 scale`,
  },
};

/** The ones that can actually be drawn over candles. */
export const DRAWABLE_INDICATORS: IndicatorId[] = (Object.keys(INDICATORS) as IndicatorId[])
  .filter((id) => INDICATORS[id].surface === 'price');

/* ------------------------------------------------------------------ */
/* Reading a name                                                      */
/* ------------------------------------------------------------------ */

/** Every alias, longest first, so "bollinger bands" is matched before "bb". */
const ALIASES: { alias: string; id: IndicatorId }[] = (Object.keys(INDICATORS) as IndicatorId[])
  .flatMap((id) => INDICATORS[id].aliases.map((alias) => ({ alias, id })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * The guard: does this label name an indicator?
 *
 * NO TRAILING WORD BOUNDARY AFTER A BARE ACRONYM, AND THAT IS THE WHOLE TRICK.
 * The single most common stored label is `Ema21` — the resolver key, title-cased
 * — and `\bema\b` does not match it, because the character after "ema" is a
 * digit. A guard that missed the most common case would leave exactly the rows
 * it exists to repair unrepaired.
 *
 * SO A BARE ACRONYM HAS TO BE NEXT TO A NUMBER. That is also what keeps it from
 * firing on a level that merely starts with the same letters: "Smart money zone"
 * begins with `sma` and is a shelf, not an average, and it stays one. Names that
 * are unambiguous on their own — "bollinger", "trend clouds", "vwap" — need no
 * number and are listed explicitly.
 */
export const INDICATOR_LABEL_RE =
  /\b(?:(?:ema|sma|wma|ma|rsi|bb)\s*[-_]?\s*\d{1,3}|\d{1,3}\s*[-_]?\s*(?:day|period|bar)?\s*[-_]?\s*(?:ema|sma|ma)\b|v\.?w\.?a\.?p\b|moving\s+average|volume[-\s]?weighted|bollinger|bbands|trend\s+clouds?|supertrend|super\s+trend|relative\s+strength|macd|stochastics?)/i;

export function looksLikeIndicator(label: string | null | undefined): boolean {
  return typeof label === 'string' && INDICATOR_LABEL_RE.test(label);
}

/** Pull the first number out of a label, if it is a plausible period. */
function readPeriod(raw: string, entry: IndicatorEntry): number | null {
  const spec = entry.params.period;
  if (!spec) return null;
  // Skip a number that belongs to the multiple — "BB 20 (2.5σ)" — by only
  // looking before an opening bracket.
  const head = raw.split('(')[0];
  const m = /(\d{1,3})/.exec(head);
  if (!m) return spec.default;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return spec.default;
  return Math.round(n);
}

function readMult(raw: string, entry: IndicatorEntry): number | null {
  const spec = entry.params.mult;
  if (!spec) return null;
  const m = /\(\s*([0-9]*\.?[0-9]+)\s*(?:σ|sd|std|stdev)?\s*\)/.exec(raw);
  if (!m) return spec.default;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return spec.default;
  return n;
}

/**
 * Read an indicator out of whatever a person or a model called it.
 *
 * REGISTRY-DRIVEN, so a new entry is nameable the moment it is added and there
 * is no second list to forget. Returns null when the label names something else,
 * which is the answer that keeps supports and resistances being supports and
 * resistances. It DOES resolve panel indicators — the refusal has to know which
 * one was asked for in order to say anything useful about it.
 */
export function parseIndicator(label: string | null | undefined): IndicatorSpec | null {
  const raw = String(label ?? '').trim().toLowerCase();
  if (!raw) return null;
  // `ema_21` and `ema-21` are the same request as `ema 21`.
  const norm = raw.replace(/[_]+/g, ' ');

  for (const { alias, id } of ALIASES) {
    // A bare acronym must stand as its own word; a multi-word name may sit in a
    // sentence. `\bema\b` would miss "ema21", so the boundary is only required
    // in FRONT and what follows must not be a letter.
    const re = new RegExp(`(?:^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');
    if (!re.test(norm)) continue;
    const entry = INDICATORS[id];
    return { indicator: id, period: readPeriod(norm, entry), mult: readMult(norm, entry) };
  }
  return null;
}

/** Fill in whatever the caller left out, from the registry's defaults. */
export function withDefaults(spec: IndicatorSpec): IndicatorSpec {
  const entry = INDICATORS[spec.indicator];
  return {
    indicator: spec.indicator,
    period: spec.period ?? entry.params.period?.default ?? null,
    mult: spec.mult ?? entry.params.mult?.default ?? null,
  };
}

/** The chip on the chart and the row in the rail. */
export function indicatorLabel(spec: IndicatorSpec): string {
  return INDICATORS[spec.indicator].label(withDefaults(spec));
}

/** A stable key: `ema21`, `bollinger20`, `vwap`. Used for dedup and for the prompt. */
export function indicatorKey(spec: IndicatorSpec): string {
  const s = withDefaults(spec);
  return s.period === null ? s.indicator : `${s.indicator}${s.period}`;
}

/** One sentence saying what the curve IS. */
export function indicatorPlain(spec: IndicatorSpec): string {
  return INDICATORS[spec.indicator].plain(withDefaults(spec));
}

/**
 * Why this one cannot be drawn on price, or null when it can.
 *
 * Returned as a whole sentence rather than a code, because the only thing that
 * ever happens to it is that Kai says it to somebody.
 */
export function indicatorRefusal(spec: IndicatorSpec): string | null {
  const entry = INDICATORS[spec.indicator];
  return entry.surface === 'panel' ? (entry.refusal ?? `${entry.label(withDefaults(spec))} cannot be drawn on the price chart.`) : null;
}

/* ------------------------------------------------------------------ */
/* The math                                                            */
/* ------------------------------------------------------------------ */

/** The least a bar has to be for any of this to work. */
export type IndicatorBar = { o: number; h: number; l: number; c: number; v?: number | null };

/** One point of one output. `null` before the window has filled — never zero. */
export type IndicatorPoint = Record<string, number | null>;

/**
 * SMA-seeded EMA. The one every moving average in this product uses, and the
 * same shape as `emaLast` in apps/api/src/lib/market/key-levels.ts.
 */
function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * `ewm(span, adjust=False)` — seeded with the FIRST value, not with an SMA.
 *
 * Deliberately different from `emaSeries` and NOT interchangeable with it. This
 * is the smoothing pandas does, and CheatCode Trend Clouds is defined in terms
 * of it (`_ema` in engine/kai_score/reference_cca.py). Using the SMA-seeded one
 * would move every band by a little, forever, and the line drawn on the chart
 * would stop being the line the alert engine scored.
 */
function ewmSeries(values: (number | null)[], span: number): (number | null)[] {
  const k = 2 / (span + 1);
  const out: (number | null)[] = values.map(() => null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) { out[i] = prev; continue; }
    prev = prev === null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Population standard deviation over a rolling window (ddof = 0, as pandas). */
function stdevSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  for (let i = period - 1; i < values.length; i++) {
    const w = values.slice(i - period + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / period;
    out[i] = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period);
  }
  return out;
}

/** `ta.linreg(series, length, 0)` — the least-squares value at the newest bar. */
function lsmaSeries(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  const sumX = (length * (length - 1)) / 2;
  const sumXX = ((length - 1) * length * (2 * length - 1)) / 6;
  const denom = length * sumXX - sumX * sumX;
  for (let i = length - 1; i < values.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    for (let j = 0; j < length; j++) {
      const y = values[i - length + 1 + j];
      sumY += y;
      sumXY += j * y;
    }
    const slope = (length * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / length;
    out[i] = intercept + slope * (length - 1);
  }
  return out;
}

/** True range, with the first bar falling back to high − low. */
function trueRange(bars: IndicatorBar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.h - b.l;
    const pc = bars[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  });
}

/**
 * Every point of every output, aligned to `bars` index for index.
 *
 * Null before the window has filled, and null is drawn as ABSENT. A 200-bar
 * average over 150 bars starts nowhere; a line that drops to the bottom of the
 * pane for its first 199 bars is a claim that price was there.
 *
 * `anchorIndex` is the bar a running total starts from — VWAP's only parameter,
 * and ignored by everything else.
 */
export function computeIndicatorSeries(
  bars: IndicatorBar[],
  spec: IndicatorSpec,
  anchorIndex?: number | null
): IndicatorPoint[] | null {
  const s = withDefaults(spec);
  const entry = INDICATORS[s.indicator];
  if (entry.surface !== 'price') return null;
  if (!bars.length) return null;
  const closes = bars.map((b) => b.c);
  const blank = (): IndicatorPoint[] => bars.map(() => ({}));

  if (s.indicator === 'ema' || s.indicator === 'sma') {
    const p = s.period ?? 0;
    if (bars.length < p) return null;
    const line = s.indicator === 'ema' ? emaSeries(closes, p) : smaSeries(closes, p);
    return line.map((v) => ({ [s.indicator]: v }));
  }

  if (s.indicator === 'vwap') {
    const start = anchorIndex ?? 0;
    if (start >= bars.length - 1) return null;
    const out = blank();
    let pv = 0;
    let vol = 0;
    let any = false;
    for (let i = start; i < bars.length; i++) {
      const v = bars[i].v ?? 0;
      if (!(v > 0)) { out[i] = { vwap: vol > 0 ? pv / vol : null }; continue; }
      pv += ((bars[i].h + bars[i].l + bars[i].c) / 3) * v;
      vol += v;
      out[i] = { vwap: pv / vol };
      any = true;
    }
    return any ? out : null;
  }

  if (s.indicator === 'bollinger') {
    const p = s.period ?? 0;
    const m = s.mult ?? 2;
    if (bars.length < p) return null;
    const basis = smaSeries(closes, p);
    const sd = stdevSeries(closes, p);
    return basis.map((b, i) => {
      const d = sd[i];
      if (b === null || d === null) return { basis: null, upper: null, lower: null };
      return { basis: b, upper: b + m * d, lower: b - m * d };
    });
  }

  if (s.indicator === 'trend_clouds') {
    /**
     * PORTED FROM `supertrend` IN engine/kai_score/reference_cca.py, at its
     * default sensitivity ('Medium', an LSMA-12 source). Every line below has a
     * counterpart there and the shapes are kept identical rather than tidied:
     * `chart-indicators-test.mjs` runs the Python and fails on any bar that
     * disagrees. That matters more here than anywhere else in this file — the
     * alert engine SCORES on a fresh trend-cloud flip, so a port that drifted
     * would draw a line disagreeing with the grade beside it.
     */
    const p = s.period ?? 20;
    const m = s.mult ?? 1.5;
    const n = bars.length;
    const src = lsmaSeries(closes, 12);
    const atr = ewmSeries(trueRange(bars), p);
    const out = blank();
    const up: (number | null)[] = new Array(n).fill(null);
    const dn: (number | null)[] = new Array(n).fill(null);
    const trend: number[] = new Array(n).fill(1);

    for (let i = 1; i < n; i++) {
      const sv = src[i];
      const av = atr[i];
      if (sv === null || av === null) {
        up[i] = up[i - 1] ?? 0;
        dn[i] = dn[i - 1] ?? 0;
        trend[i] = trend[i - 1];
        continue;
      }
      const u = sv - m * av;
      const d = sv + m * av;
      const u1 = up[i - 1] ?? u;
      const d1 = dn[i - 1] ?? d;
      up[i] = closes[i - 1] > u1 ? Math.max(u, u1) : u;
      dn[i] = closes[i - 1] < d1 ? Math.min(d, d1) : d;

      const prev = trend[i - 1];
      if (prev === -1 && closes[i] > d1) trend[i] = 1;
      else if (prev === 1 && closes[i] < u1) trend[i] = -1;
      else trend[i] = prev;

      out[i] = { line: trend[i] === 1 ? up[i] : dn[i], upper: dn[i], lower: up[i] };
    }
    // Bar 0 has no previous close, so the reference leaves it out entirely.
    out[0] = { line: null, upper: null, lower: null };
    return out;
  }

  return null;
}

/**
 * The newest value of each output — what the server puts on the annotation so
 * the price tag and the levels rail have a number to show.
 *
 * It is the LAST POINT OF THE SAME SERIES rather than a second, shorter
 * calculation, so the label can never disagree with the line by construction.
 */
export function computeIndicatorNow(
  bars: IndicatorBar[],
  spec: IndicatorSpec,
  anchorIndex?: number | null
): IndicatorPoint | null {
  const series = computeIndicatorSeries(bars, spec, anchorIndex);
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    const primary = INDICATORS[spec.indicator].outputs[0];
    if (p && typeof p[primary] === 'number' && Number.isFinite(p[primary] as number)) return p;
  }
  return null;
}
