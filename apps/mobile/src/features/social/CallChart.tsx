import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../../lib/api';
import { fixtureCandlesDaily } from '../../lib/fixtures';
import { color } from '../../ui/tokens';
import { T } from '../../ui/Text';
import { CandleChart, type ChartLevel } from '../../ui/MiniChart';
import type { Candle, CommunityCall } from '../../lib/types';

/**
 * THE CALL, DRAWN — the member's own levels sitting on the symbol's price.
 *
 * ── WHY THIS IS `CandleChart` AND NOT THE REAL CHART ────────────────────
 * `features/chart`'s `ChartView` is the app's real chart, and it is a WEBVIEW
 * (an `<iframe>` on web) booting a charting library with its own gesture stack.
 * One is fine on a symbol screen. But this card appears in a ROOM'S MESSAGE
 * LIST, on the Community tab and down a profile — lists that can hold twenty
 * cards — and twenty expanded cards would be twenty WebViews, each fighting the
 * parent scroll view for gestures. `CandleChart` is the same house's drawing in
 * plain `react-native-svg`: real bars, real dashed levels, no browser.
 *
 * It was already written and, until now, called from nowhere in the app. This
 * is the first thing to use it — nothing was built here that did not exist.
 *
 * ── THE COLOURS COME FROM THE CELLS ABOVE, NOT FROM A MAP ───────────────
 * `features/chart/semantics.ts` exports `kindColor`, which maps entry→cyan,
 * stop→red, target→green — exactly what is wanted. It is deliberately NOT
 * imported. Two reasons. The literal tokens are what the LEVEL CELLS on this
 * very card already use, so passing the same three constants is what makes the
 * line and the cell provably the same colour rather than two things that agree
 * today. And `features/chart` is being edited by another lane as this is
 * written; a card in a message list should not take a new dependency on a
 * directory in flight for three colours it already has.
 *
 * ── A LEVEL WITH NO NUMBER IS NOT DRAWN ─────────────────────────────────
 * The same law the level cells obey. A call published with an entry and a stop
 * and no target draws two lines, not three. A chart is worse than a cell here:
 * a green rule across a chart IS a target to anyone who reads charts, whatever
 * the tag says, so an invented one would be a lie about a plan nobody wrote. A
 * call with no levels at all still opens — you get the price action, which is
 * the honest amount of help available for a call that named no levels.
 */

/** Tag geometry inside `CandleChart`: a level tag is ~14pt tall. */
const TAG_H = 14;

/**
 * The call's levels, richest first, with the tags alternated left/right.
 *
 * `CandleChart` hangs each tag in one margin at its own price, and it has no
 * collision handling — two levels close together would print one tag on top of
 * the other. Sorting by price and then ALTERNATING the side means the two that
 * could ever collide (neighbours) are always in opposite margins, which makes
 * an overlap impossible rather than unlikely. The cost is that one tag may sit
 * over the most recent bars on the right; a tag is 9pt type on an opaque
 * surface, and a covered bar is cheaper than an unreadable price.
 */
export function levelsFor(call: CommunityCall): ChartLevel[] {
  const named: Array<{ price: number; label: string; c: string }> = [];
  if (call.entry != null) named.push({ price: call.entry, label: `Entry ${fmt(call.entry)}`, c: color.cyan });
  if (call.stop != null) named.push({ price: call.stop, label: `Stop ${fmt(call.stop)}`, c: color.red });
  if (call.target != null) named.push({ price: call.target, label: `Target ${fmt(call.target)}`, c: color.green });

  return named
    .sort((a, b) => b.price - a.price)
    .map((l, i) => ({
      ...l,
      // The entry is the level the idea turns on, so it is the one drawn heavier.
      weight: l.c === color.cyan ? 1.5 : 1,
      side: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
    }));
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const DAY = 24 * 3600_000;

/**
 * The window is anchored to the CALL, not to today.
 *
 * `features/trade`'s `useCandles` is the app's timeframe-chip hook and every
 * range it can produce ends at the current date, which is right for a chip
 * somebody just pressed and wrong here: a call published in March would be
 * charted on a window that does not contain the day it was made. So the range
 * starts sixty days BEFORE the call — enough context to see what the levels
 * were drawn against — and runs to today, or to shortly after it resolved,
 * which is where the story of that call actually ends.
 */
export function windowFor(call: CommunityCall): { from: string; to: string } {
  const published = new Date(call.published_at);
  const start = Number.isNaN(published.getTime()) ? new Date(Date.now() - 90 * DAY) : published;
  const today = new Date();
  const resolved = call.resolved_at ? new Date(call.resolved_at) : null;
  const end = resolved && !Number.isNaN(resolved.getTime())
    ? new Date(Math.min(today.getTime(), resolved.getTime() + 20 * DAY))
    : today;
  return { from: ymd(new Date(start.getTime() - 60 * DAY)), to: ymd(end) };
}

/**
 * Bars for one call.
 *
 * There is no `enabled` flag and no early return, on purpose: this hook only
 * ever runs because `CallChart` was MOUNTED, and `CallChart` is only mounted
 * once somebody has expanded the card. Conditional mounting is the whole
 * lazy-load — a collapsed card in a room full of collapsed cards has no hook,
 * no request and no chart, which is what keeps scrolling past twenty of them
 * free. A flag would have left the effect in every card's render.
 *
 * Answers are kept in a module-level cache keyed by symbol and window, so
 * collapsing and re-expanding a card — or opening two cards on the same name —
 * costs one request rather than one each time. It is a session cache; nothing
 * is persisted and a reload starts clean.
 */
const cache = new Map<string, Candle[]>();

export function useCallCandles(call: CommunityCall): { candles: Candle[]; loading: boolean } {
  const offline = !api.available();
  const { from, to } = windowFor(call);
  const key = `${call.symbol}|${from}|${to}`;
  const [candles, setCandles] = useState<Candle[]>(() => cache.get(key) ?? []);
  const [loading, setLoading] = useState(!offline && !cache.has(key));

  useEffect(() => {
    let alive = true;
    if (offline) { setCandles(fixtureCandlesDaily); setLoading(false); return; }
    const hit = cache.get(key);
    if (hit) { setCandles(hit); setLoading(false); return; }
    setLoading(true);
    api.candles(call.symbol, '1d', from, to)
      .then((c) => { cache.set(key, c); if (alive) setCandles(c); })
      // An empty answer stays empty. `CandleChart` draws the levels and says it
      // has no bars, which is true; inventing price action under a real stop is
      // the one thing a chart on a trade card must never do.
      .catch(() => { if (alive) setCandles([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, offline, call.symbol, from, to]);

  return { candles, loading };
}

export function CallChart({ call, compact = false, testID }: {
  call: CommunityCall;
  compact?: boolean;
  testID?: string;
}) {
  const { candles, loading } = useCallCandles(call);
  const levels = levelsFor(call);
  const height = compact ? 132 : 158;

  if (loading && !candles.length) {
    return (
      <View
        testID={testID ? `${testID}-loading` : undefined}
        style={{ height, alignItems: 'center', justifyContent: 'center' }}
      >
        <T size={11.5} c={color.dim}>Drawing {call.symbol}…</T>
      </View>
    );
  }

  const last = candles.length ? candles[candles.length - 1] : null;

  return (
    <CandleChart
      testID={testID}
      candles={candles}
      levels={levels}
      height={height}
      // The volume strip eats a sixth of the height and answers a question
      // nobody asked of a trade card: the levels are the subject here.
      showVolume={false}
      footerLeft={`${call.direction === 'long' ? 'Long' : 'Short'} · daily bars`}
      footerRight={last ? fmt(last.c) : ''}
    />
  );
}
