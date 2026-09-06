/**
 * Indicator overlays — the one vocabulary for "this is a curve, not a price".
 *
 * THE BUG THIS FILE EXISTS TO CLOSE. A moving average was resolving to a single
 * number — its value on the newest bar — and that number was being drawn the
 * only way the chart knew how to draw a number: as a horizontal rule across the
 * whole plot, labelled `Ema21`. It is wrong twice. It is wrong about the
 * INSTRUMENT, because a 21-day average is a line that moves with every close and
 * a horizontal rule says the opposite in the clearest possible way. And it is
 * wrong about the CHART, because four averages plus a session VWAP is five more
 * horizontal rules on a surface whose whole job is to make a handful of real
 * levels legible — the owner's words were "the entire chart is nothing but
 * multiple horizontal levels".
 *
 * So an indicator is now its own thing end to end: the server names WHICH
 * average, the client computes the SERIES from the candles it already has, and
 * the chart draws a curve. Nothing in the pipeline turns one into a price line
 * again, and the parser below is what makes that enforceable rather than
 * merely intended:
 *
 *   - `parseIndicator` reads a label a human or a model wrote and answers what
 *     it names. It is how the server converts an indicator-shaped `mark_level`
 *     into an overlay instead of a rule;
 *   - it is ALSO how already-stored rows are repaired. Rows written before this
 *     change carry `kind: 'support'` and `text: 'Ema21'`, and there are real
 *     ones on real conversations. They are re-read as overlays at read time, so
 *     a chart that was a wall of lines yesterday is a chart with curves on it
 *     today with no data migration and nothing to back out if it is wrong.
 *
 * WHY THE MATH IS NOT HERE. The curve is computed where the candles are: in the
 * chart page (`apps/mobile/chart-web/src/03-annotations.js`), which has the bars
 * on screen and has to recompute nothing when the user pans. This module owns
 * NAMES — parsing them, printing them, keying them — because that is the part
 * the server, the app and the chart page all have to agree on.
 */
/**
 * The three overlays a chart can draw from bars alone.
 *
 * Deliberately short. Every one of these is arithmetic over candles the client
 * already holds — no fetch, no server round trip, nothing to be stale about.
 * An indicator that needed data the chart does not have would be a different
 * kind of object and would not belong in this list.
 *
 * NO ZOD IN THIS MODULE, ON PURPOSE. The mobile app imports it for the same
 * parser the server uses, and a schema library pulled into the Metro bundle to
 * validate three string literals is a cost with nothing on the other side of it.
 * The wire schema lives in `api.ts`, which is where wire schemas live.
 */
export type IndicatorName = 'ema' | 'sma' | 'vwap';

export type IndicatorSpec = {
  indicator: IndicatorName;
  /** Bars in the lookback. Null for VWAP, which is anchored rather than windowed. */
  period: number | null;
};

/**
 * The guard pattern: does this label name an indicator?
 *
 * Used as defence in depth. Anything reaching the level path with a label that
 * matches is diverted to the overlay path instead of drawing a rule, whether it
 * came from the model, from a stored row, or from a caller that has not been
 * updated. It is intentionally broader than what `parseIndicator` can resolve —
 * a label this matches and the parser cannot read still must not become a
 * horizontal line.
 */
/**
 * NO TRAILING WORD BOUNDARY AFTER THE ACRONYM, AND THAT IS THE WHOLE TRICK.
 * The single most common stored label is `Ema21` — the resolver key, title-cased
 * — and `\bema\b` does not match it, because the character after "ema" is a
 * digit. A guard that missed the most common case would have left exactly the
 * rows this exists to repair unrepaired.
 *
 * SO THE ACRONYM HAS TO BE NEXT TO A NUMBER instead. That is also what keeps it
 * from firing on a level that merely starts with the same letters: "Smart money
 * zone" begins with `sma` and is a shelf, not an average, and it stays one.
 */
export const INDICATOR_LABEL_RE =
  /\b(?:(?:ema|sma|wma|ma)\s*[-_]?\s*\d{1,3}|\d{1,3}\s*[-_]?\s*(?:day|period|bar)?\s*[-_]?\s*(?:ema|sma|ma)\b|v\.?w\.?a\.?p\b|moving\s+average|volume[-\s]?weighted)/i;

export function looksLikeIndicator(label: string | null | undefined): boolean {
  return typeof label === 'string' && INDICATOR_LABEL_RE.test(label);
}

/** Periods a chart will actually draw. A 4000-day average is a typo, not a request. */
const MIN_PERIOD = 2;
const MAX_PERIOD = 500;

/**
 * Read an indicator out of whatever a person or a model called it.
 *
 * Handles the names that actually appear: the resolver's own keys (`ema21`),
 * what a trader types (`21 EMA`, `50-day moving average`, `ma200`), what a
 * stored row was labelled with (`Ema21`, `Vwap`), and the anchored form
 * (`VWAP from year low`). Returns null when the label names something else,
 * which is the answer that keeps supports and resistances being supports and
 * resistances.
 */
export function parseIndicator(label: string | null | undefined): IndicatorSpec | null {
  const raw = String(label ?? '').trim().toLowerCase();
  if (!raw) return null;

  // VWAP first: it carries no period, and "vwap from the year low" would
  // otherwise have its date-ish words read as one.
  if (/\bv\.?w\.?a\.?p\b|\bvolume[-\s]?weighted\b/.test(raw)) {
    return { indicator: 'vwap', period: null };
  }

  const period = (v: string | undefined): number | null => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < MIN_PERIOD || n > MAX_PERIOD) return null;
    return Math.round(n);
  };

  // `sma50`, `sma 50`, `50 sma`, `50-day simple moving average`.
  const simple = /\bsma\s*[-_]?\s*(\d{1,3})\b/.exec(raw) ?? /\b(\d{1,3})\s*[-_]?\s*(?:day|period|bar)?\s*[-_]?\s*sma\b/.exec(raw);
  if (simple) {
    const p = period(simple[1]);
    return p === null ? null : { indicator: 'sma', period: p };
  }
  if (/\bsimple\s+moving\s+average\b/.test(raw)) {
    const p = period(/(\d{1,3})/.exec(raw)?.[1]);
    return p === null ? null : { indicator: 'sma', period: p };
  }

  // `ema21`, `ema 21`, `21ema`, `21-day ema`, `ma50`, `50-day moving average`.
  const exp =
    /\b(?:ema|ma)\s*[-_]?\s*(\d{1,3})\b/.exec(raw) ??
    /\b(\d{1,3})\s*[-_]?\s*(?:day|period|bar)?\s*[-_]?\s*(?:ema|ma)\b/.exec(raw) ??
    (/\bmoving\s+average\b/.test(raw) ? /(\d{1,3})/.exec(raw) : null);
  if (exp) {
    const p = period(exp[1]);
    if (p === null) return null;
    // AN UNQUALIFIED "MOVING AVERAGE" IS AN EMA HERE, because every average this
    // system computes is exponential (`emaLast` in market/key-levels.ts). Calling
    // it simple would put a name on the chart that does not match the number.
    return { indicator: 'ema', period: p };
  }

  return null;
}

/** The chip on the chart and the row in the rail. Plain English, no acronym soup. */
export function indicatorLabel(spec: IndicatorSpec): string {
  if (spec.indicator === 'vwap') return 'VWAP';
  return `${spec.indicator.toUpperCase()} ${spec.period ?? ''}`.trim();
}

/** The resolver's own key: `ema21`, `sma50`, `vwap`. Stable, and used for dedup. */
export function indicatorKey(spec: IndicatorSpec): string {
  return spec.indicator === 'vwap' ? 'vwap' : `${spec.indicator}${spec.period ?? ''}`;
}

/**
 * The sentence Kai says about what the overlay IS.
 *
 * Kept here rather than at three call sites so the app, the show and the stored
 * `reason` line never describe the same curve differently.
 */
export function indicatorPlain(spec: IndicatorSpec): string {
  if (spec.indicator === 'vwap') {
    return 'the average price everyone who traded has actually paid, weighted by how much traded at each price';
  }
  const kindWord = spec.indicator === 'sma' ? 'simple' : 'exponential';
  return `the ${spec.period}-bar ${kindWord} moving average — a line that moves with every new close, not a fixed price`;
}
