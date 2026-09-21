/**
 * WHICH SERIES A SYMBOL'S HEADER PRICE COMES FROM — ONE ANSWER FOR EVERY SCREEN.
 *
 * The owner saw AMD at $559.82 "market closed · last Fri" on the ticker page and
 * $606.75 "Live" on Trade, a tap apart, in the middle of a Monday session. Both
 * numbers were real. The ticker page asked `resolveQuote` for the daily series
 * capped at `lastTradingDate()` — which, before 16:45 ET, is FRIDAY — so its
 * header was Friday's close. Trade asked for the series its chart draws, capped
 * at nothing. Two questions, two honest answers, one confused member.
 *
 * A header is the price NOW. So both screens ask this one question, with the
 * same options, and share the same memoised answer: `resolveQuote` keys its
 * cache on exactly these options, so the second screen reads the first
 * screen's quote rather than a second fetch that might land a tick later.
 *
 * The ticker page's CHART is untouched — it still draws completed daily bars.
 * Only the number in its header moved.
 */
import type { AppMode } from '@shared/api';

/** Which timeframe a symbol opens on for a mode. Day trades open intraday. */
export function defaultTimeframe(mode: string): string {
  return mode === 'day_trade' ? '5m' : '1d';
}

/** The `resolveQuote` options every header uses for this mode. */
export function headerQuoteOptions(mode: AppMode | string, timeframe?: string | null): {
  preferIntraday: boolean;
  timeframe: string;
} {
  const tf = timeframe ?? defaultTimeframe(mode);
  return { preferIntraday: tf !== '1d', timeframe: tf };
}
