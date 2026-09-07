/**
 * WHAT THIS SYMBOL IS DOING RIGHT NOW, from rows that already exist.
 *
 * The ticker page used to answer "what is this company" — a summary, a market
 * cap, a P/E — and left "is there anything to act on" to a tap into Trade. That
 * is the wrong way round for a page somebody opens because a ticker crossed
 * their mind mid-session. This file gathers the three things that answer the
 * second question, and it is deliberately three SEPARATE reads rather than one
 * fatter `/symbols/:symbol`:
 *
 *   the portal   — the graded alert and the saved plan, the same payload the
 *                  Trade portal reads, so the two screens cannot disagree
 *   the board    — ONLY when there is a graded alert, and only for the two
 *                  fields the portal has no room for: the option contract and
 *                  the peak the tracker recorded
 *   the bars     — the session's own high, low, open and volume, which are
 *                  arithmetic on the candles the chart is already holding
 *
 * NOTHING HERE INVENTS A NUMBER, and nothing here fills a gap with a dash. A
 * value that is absent is absent: the caller omits the row. A dash on a price
 * surface reads as "zero" or as "we looked and there was nothing there", and
 * both of those are claims this file has no right to make.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { AlertCard, AlertOptionContract, Candle, GoalMode } from '../../lib/types';
import type { Annotation } from '../portal/types';
import { KIND_LABEL } from '../portal/types';

/* ------------------------------------------------------------------ */
/* The graded card — fetched only when one is known to exist            */
/* ------------------------------------------------------------------ */

/**
 * The option contract and the tracked peak, which live on the BOARD's card and
 * nowhere else.
 *
 * `TickerPage.active_alert` is four fields — an id, a letter, a score and a
 * line of prose — and `PortalAlert` carries the levels but no contract and no
 * extreme. So the one place an option and a peak exist together is the graded
 * board, and this fetches it.
 *
 * IT IS GATED ON `hasAlert` ON PURPOSE. The board is the app's widest payload
 * and most ticker pages are opened on a symbol with nothing on it. Passing
 * `false` here means no request is made at all, which is why a cold symbol
 * costs exactly what it did before this file existed. React will not let a
 * hook be conditional, so the CONDITION lives inside the effect instead.
 */
export function useGradedCard(symbol: string, hasAlert: boolean) {
  const [card, setCard] = useState<AlertCard | null>(null);

  useEffect(() => {
    if (!hasAlert || !symbol) { setCard(null); return; }
    let alive = true;
    void (async () => {
      try {
        const board = await api.alertsRound4();
        if (!alive) return;
        const want = symbol.toUpperCase();
        // Active first, then watching. A card in `history` is over, and a
        // finished trade is not a current condition.
        const found = [...board.active, ...board.watching].find(
          (c) => c.symbol?.toUpperCase() === want,
        );
        setCard(found ?? null);
      } catch {
        // A board that will not load is not an error on THIS page. The portal
        // read below still has the levels; the contract line simply does not
        // appear, which is the same outcome as a symbol that never had one.
        if (alive) setCard(null);
      }
    })();
    return () => { alive = false; };
  }, [symbol, hasAlert]);

  return card;
}

/**
 * The contract to show, out of the several a card may carry.
 *
 * Kai's pick when he labelled one, otherwise the first. Never a made-up label:
 * a contract with no label renders without one rather than being christened
 * "Kai's pick" by this function.
 */
export function pickContract(card: AlertCard | null): AlertOptionContract | null {
  const list = card?.recommended_options;
  if (!list?.length) return null;
  return list.find((c) => /kai/i.test(c.label ?? '')) ?? list[0];
}

/* ------------------------------------------------------------------ */
/* The session, off the bars the chart is already holding               */
/* ------------------------------------------------------------------ */

export type SessionBar = {
  /** The bar's own date, so the strip can name the session it is about. */
  label: string;
  open: number;
  high: number;
  low: number;
  volume: number | null;
  /** Where the last price sits between low and high, 0–1. Null if the bar is flat. */
  position: number | null;
};

/** "41.2M" · "938K" · "412". Volume, at the precision a person reads. */
export function volumePlain(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

/**
 * A level, written the way a trader says it — 504, not 504.00, but 504.25 keeps
 * its cents. The same rule `portal2/read.ts` uses, so the two blocks on this
 * page format a price identically.
 */
export const money = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * The newest DAILY bar, read as a session.
 *
 * WHY IT IS NOT CALLED "TODAY". The newest bar is today's bar during the
 * session and the PREVIOUS session's bar at every other hour, and there is no
 * way to tell which from the array alone. Labelling it "Today" would therefore
 * be wrong for most of the day, silently, on a row of real numbers — the worst
 * kind of wrong. So the bar states its own date and the reader decides.
 *
 * Returns null when there are no daily bars, and the caller draws nothing.
 */
export function sessionFromCandles(candles: Candle[] | null | undefined, last: number | null): SessionBar | null {
  const bar = candles?.length ? candles[candles.length - 1] : null;
  if (!bar) return null;
  const { o, h, l } = bar;
  if (![o, h, l].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;

  const d = new Date(bar.t);
  const label = Number.isNaN(d.getTime())
    ? 'Latest session'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const span = h - l;
  const price = typeof last === 'number' && Number.isFinite(last) ? last : bar.c;
  const position = span > 0 ? Math.min(1, Math.max(0, (price - l) / span)) : null;

  return {
    label,
    open: o,
    high: h,
    low: l,
    volume: typeof bar.v === 'number' && Number.isFinite(bar.v) ? bar.v : null,
    position,
  };
}

/* ------------------------------------------------------------------ */
/* The user's own lines                                                 */
/* ------------------------------------------------------------------ */

export type UserLine = {
  id: string;
  /** "your trendline" · "the support you drew" — always possessive. */
  label: string;
  price: number;
  /** How far price is from it, signed: negative = price is below the line. */
  distance_pct: number;
};

/**
 * The lines the USER drew, with how far price is from each.
 *
 * This is the one thing this page can say that no other screen can: the levels
 * on the chart are already loaded here, and a level is only interesting
 * relative to where price actually is. "2.1% below your trendline" is a fact
 * about a mark somebody made on purpose.
 *
 * ONLY `provenance: 'user'`. Kai's marks and the community's marks are on the
 * chart too and they are not the user's; calling one "yours" would be a small
 * lie that this product cannot afford. Indicators are excluded as well — an
 * EMA's "price" is just its value on the newest bar, so a distance from it is
 * a distance from a moving line, which is not what this row claims to be.
 */
export function userLines(annotations: Annotation[], price: number | null): UserLine[] {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return [];
  return annotations
    .filter((a) => a.provenance === 'user' && a.status === 'valid' && a.kind !== 'indicator')
    .map((a): UserLine | null => {
      const p = a.price;
      if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) return null;
      const text = (a.text ?? '').trim();
      // The kind's own word when the user did not name it, lowercased into the
      // sentence: "your trendline", not "your Trendline".
      const label = text ? `your ${text}` : `your ${KIND_LABEL[a.kind].toLowerCase()}`;
      return { id: a.id, label, price: p, distance_pct: ((price - p) / p) * 100 };
    })
    .filter((l): l is UserLine => l != null)
    // Nearest first: the line price is about to reach is the one that matters.
    .sort((a, b) => Math.abs(a.distance_pct) - Math.abs(b.distance_pct));
}

/** "2.1% below" · "0.4% above" · "at it" when the distance rounds to nothing. */
export function distancePlain(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.05) return 'at it';
  return `${abs.toFixed(1)}% ${pct < 0 ? 'below' : 'above'}`;
}

/** Whether this member's desk is the options-shaped one. */
export const isDayTrade = (mode: GoalMode) => mode === 'day_trade';
