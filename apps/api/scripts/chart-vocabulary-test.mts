/**
 * Kai's computed chart vocabulary — the arithmetic, then the real bars.
 *
 *   cd apps/api && npm test
 *   cd apps/api && npx tsx scripts/chart-vocabulary-test.mts --verbose
 *
 * WHAT THIS IS FOR. The complaint was "Kai doesn't accurately draw on charts".
 * He was not drawing inaccurately — he had almost nothing to draw with. Ten
 * level names, every one of them resolved off a graded setup or a saved plan, so
 * on a symbol with neither (most symbols, most of the time) eight of the ten
 * resolved to nothing, the command was dropped, and the chart sat still while he
 * narrated marking things.
 *
 * So the thing that has to be proven is not "it compiles" and not even "it draws
 * a line". It is: on a symbol with NO GRADED SETUP, does a name Kai is allowed
 * to say come back with a real number, and can that number be traced to
 * particular bars? Every case below answers one half of that.
 *
 * TWO SECTIONS AND THEY PROVE DIFFERENT THINGS.
 *
 *   THE FIXTURES are hand-built bars whose answers can be worked out on paper —
 *   a previous day's high is a field, a 50% retracement is a midpoint, an
 *   anchored VWAP over three known bars is a division you can check. They run
 *   with no network and no database, and they are what catches an algorithm
 *   changing meaning.
 *
 *   THE LIVE PASS pulls real Polygon bars for real symbols and prints every
 *   level that resolved, with its price and its provenance string. It is the
 *   half that answers the actual complaint, because a fixture cannot tell you
 *   whether a real chart has anything on it. It skips itself when no key is
 *   configured rather than failing a test run for the absence of a secret.
 *
 * DATA SOURCE IS POLYGON. EODHD is dead — its key answers 401 and it has been
 * removed from the alert codebase — and nothing here goes near it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(resolve(HERE, `../${process.env.ENV_FILE ?? '.env.local'}`), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  // No env file is a fine reason to skip the live half. It is not a failure.
}

import type { Candle } from '../../../packages/shared/api.ts';
import {
  computeAnchoredVwap,
  computeFib,
  computeIntradayLevels,
  computeKeyLevels,
  findTrendlines,
  fractals,
  solidBars,
} from '../src/lib/market/key-levels.ts';
import {
  availableDrawings,
  availableIndicators,
  availablePatterns,
  availableZones,
  chartCommandProtocol,
  indicatorRefusalFor,
  executeChartCommand,
  availableLevels,
  refusedPatterns,
  resolveIndicator,
  resolveLevel,
  resolvePattern,
  type ChartContext,
} from '../src/lib/kai/chart-commands.ts';
import { parsePattern, patternRefusal } from '../../../packages/shared/patterns.ts';
import { fetchAggregates, lastTradingDate, polygonConfigured } from '../src/lib/market/polygon.ts';
import { toAnnotationRow } from '../src/lib/round4/annotations.ts';
import { looksLikeIndicator, parseIndicator } from '../../../packages/shared/indicators.ts';

const VERBOSE = process.argv.includes('--verbose');

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

const near = (a: number | null | undefined, b: number, eps = 0.005) =>
  typeof a === 'number' && Math.abs(a - b) <= eps;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** A daily bar on a weekday, stamped the way Polygon stamps them (UTC midnight). */
function d(date: string, o: number, h: number, l: number, c: number, v = 1_000_000): Candle {
  return { ts: `${date}T00:00:00.000Z`, o, h, l, c, v };
}

/** A five-minute bar written in ET, because that is the clock the rules use. */
function m5(etTime: string, o: number, h: number, l: number, c: number, v = 10_000): Candle {
  // 2026-06-02 is a Tuesday in EDT, so ET is UTC−4.
  const [hh, mm] = etTime.split(':').map(Number);
  const utc = new Date(Date.UTC(2026, 5, 2, hh + 4, mm, 0));
  return { ts: utc.toISOString(), o, h, l, c, v };
}

/**
 * Thirty daily bars that climb, then a deliberate shape at the end so the
 * previous session's high, low and close are all distinct and all checkable.
 */
function risingDaily(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 28; i++) {
    const base = 100 + i;
    const date = new Date(Date.UTC(2026, 3, 6 + Math.floor(i / 5) * 7 + (i % 5)));
    out.push(d(date.toISOString().slice(0, 10), base, base + 2, base - 2, base + 1));
  }
  // The last two are the ones the assertions read.
  out.push(d('2026-05-18', 128, 133.5, 126.25, 130.75));
  out.push(d('2026-05-19', 131, 132, 129, 131.5));
  return out;
}

/* ------------------------------------------------------------------ */
section('Daily key levels — the previous session is a field on a bar, not a guess');

const daily = risingDaily();
const keys = computeKeyLevels(daily);
const lvl = (n: string) => keys?.levels.find((l) => l.name === n) ?? null;

ok('thirty bars is enough to compute levels at all', keys !== null);
ok('prior day high is the high of the second-to-last bar', near(lvl('prior_day_high')?.price, 133.5), lvl('prior_day_high'));
ok('prior day low is its low', near(lvl('prior_day_low')?.price, 126.25));
ok('prior day close is its close', near(lvl('prior_day_close')?.price, 130.75));
ok(
  'and each one names the dated bar it came from',
  lvl('prior_day_high')?.from.includes('2026-05-18') === true,
  lvl('prior_day_high')?.from
);
ok('the year high is the highest high in the window', near(lvl('year_high')?.price, 133.5));
ok('the year low is the lowest low', near(lvl('year_low')?.price, 98));
ok(
  'a window shorter than a year says so rather than claiming one',
  lvl('year_high')?.from.includes('less than a full year') === true,
  lvl('year_high')?.from
);
ok('an 8-day average resolves on thirty bars', typeof lvl('ema8')?.price === 'number');
ok('a 200-day average does NOT, and is absent rather than approximated', lvl('ema200') === null);
ok(
  'every level lands on one side of price or the other, never both',
  (keys?.support ?? []).every((s) => s.price < (keys?.current ?? 0)) &&
    (keys?.resistance ?? []).every((r) => r.price > (keys?.current ?? 0))
);
ok('a fourteen-day true range comes out of the same bars', typeof keys?.atr14 === 'number');
ok('fewer than twenty bars returns nothing at all', computeKeyLevels(daily.slice(0, 12)) === null);

/* ------------------------------------------------------------------ */
section("Intraday levels — the session's clock is ET, and premarket is not VWAP");

const intradayBars: Candle[] = [
  m5('05:00', 100, 104, 99, 102, 5_000), // premarket high 104, low 99
  m5('08:00', 102, 103, 101, 102, 5_000),
  m5('09:30', 102, 106, 101.5, 105, 20_000), // opening range
  m5('09:40', 105, 107, 104, 106, 20_000), // opening range, high 107
  m5('11:00', 106, 112, 105, 110, 40_000), // high of day 112
  m5('14:00', 110, 111, 103, 104, 20_000), // low of RTH 103
  m5('18:30', 104, 120, 104, 118, 1_000), // after hours — must not move HOD
];
const intra = computeIntradayLevels(intradayBars);
const il = (n: string) => intra?.levels.find((l) => l.name === n) ?? null;

ok('the session is dated by its own ET calendar day', intra?.date === '2026-06-02', intra?.date);
ok('premarket high is the highest print before 09:30 ET', near(il('premarket_high')?.price, 104));
ok('premarket low is the lowest', near(il('premarket_low')?.price, 99));
ok('the opening range is the first fifteen minutes and stops there', near(il('open_range_high')?.price, 107));
ok('and its low is the low of those bars', near(il('open_range_low')?.price, 101.5));
ok('the high of the day ignores the after-hours spike', near(il('session_high')?.price, 112), il('session_high'));
ok('the low of the day ignores premarket', near(il('session_low')?.price, 101.5), il('session_low'));

// VWAP by hand over the four RTH bars:
//   (106+101.5+105)/3 * 20000 + (107+104+106)/3 * 20000
// + (112+105+110)/3 * 40000 + (111+103+104)/3 * 20000, all over 100000
const rth: [number, number, number, number][] = [
  [106, 101.5, 105, 20_000],
  [107, 104, 106, 20_000],
  [112, 105, 110, 40_000],
  [111, 103, 104, 20_000],
];
const byHand =
  rth.reduce((a, [h, l, c, v]) => a + ((h + l + c) / 3) * v, 0) / rth.reduce((a, r) => a + r[3], 0);
ok('session VWAP is the volume-weighted typical price of regular hours only', near(il('vwap')?.price, byHand, 0.01), {
  got: il('vwap')?.price,
  byHand,
});
ok(
  'and it says how many bars and which session it used',
  il('vwap')?.from.includes('five-minute bars') === true && il('vwap')?.from.includes('2026-06-02') === true,
  il('vwap')?.from
);
ok('a series with no bars at all resolves to nothing', computeIntradayLevels([]) === null);

/* ------------------------------------------------------------------ */
section('Trendlines — found through two turning points that actually printed');

/** Lower highs on a 3-bar fractal: 130 at i=5, then 120 at i=11. */
const downBars: Candle[] = [];
for (let i = 0; i < 25; i++) {
  const date = `2026-0${i < 9 ? '3' : '4'}-${String((i % 28) + 1).padStart(2, '0')}`;
  let h = 100;
  if (i === 5) h = 130;
  else if (i === 11) h = 120;
  else if (i === 4 || i === 6 || i === 10 || i === 12) h = 95;
  downBars.push(d(date, h - 6, h, h - 10, h - 4));
}
const lines = findTrendlines(downBars);
const down = lines.find((l) => l.kind === 'downtrend');
ok('a series of lower highs produces a downtrend line', Boolean(down), lines.map((l) => l.kind));
ok('its first anchor is the higher swing high', near(down?.fromPrice, 130));
ok(
  'and both anchors are named with their dates in the provenance',
  down?.from.includes('$130') === true && down?.from.includes('$120') === true,
  down?.from
);
ok(
  'the line is carried forward to the latest bar rather than stopping in the past',
  down?.extended === true && down?.toTs === downBars[downBars.length - 1].ts,
  { extended: down?.extended, toTs: down?.toTs }
);
ok(
  'and it is still falling when it gets there',
  typeof down?.toPrice === 'number' && down.toPrice < down.fromPrice
);
ok('nothing closed through it, so it is not marked broken', down?.broken === false);

/**
 * THE BUG THE LIVE RUN CAUGHT. Same descending pair, but price then runs away
 * upward. Carried forward blindly this draws a "downtrend" far below a stock
 * that has left it behind — measured on NVDA on 2026-09-03 as a line at $98
 * under a $228 price. The line must stop where it was broken.
 */
const brokenBars: Candle[] = [];
for (let i = 0; i < 30; i++) {
  const date = `2026-0${i < 9 ? '3' : '4'}-${String((i % 28) + 1).padStart(2, '0')}`;
  if (i === 5) brokenBars.push(d(date, 124, 130, 120, 125));
  else if (i === 11) brokenBars.push(d(date, 114, 120, 110, 115));
  else if (i > 14) brokenBars.push(d(date, 190 + i, 200 + i, 185 + i, 195 + i)); // gone, and gone up
  else brokenBars.push(d(date, 92, 95, 88, 90));
}
const brokenLine = findTrendlines(brokenBars).find((l) => l.kind === 'downtrend');
ok('a downtrend price has run through is still drawn', Boolean(brokenLine));
ok('but it is marked broken', brokenLine?.broken === true);
ok('it ends on the bar that broke it, not on the latest bar', brokenLine?.toTs !== brokenBars[brokenBars.length - 1].ts, {
  toTs: brokenLine?.toTs,
});
ok(
  'so it is never drawn far below a price that left it behind',
  typeof brokenLine?.toPrice === 'number' && brokenLine.toPrice > 100,
  brokenLine?.toPrice
);
ok('and the sentence attached to it says it broke', brokenLine?.from.includes('held until a close went through it') === true, brokenLine?.from);
ok('flat noise produces no trendline at all', findTrendlines(Array.from({ length: 25 }, (_, i) => d(`2026-03-${String(i + 1).padStart(2, '0')}`, 100, 100, 100, 100))).length === 0);
ok('under twenty bars, nothing is attempted', findTrendlines(downBars.slice(0, 10)).length === 0);

/* ------------------------------------------------------------------ */
section('Fib — the swing is measured, and the direction is which end printed first');

const fib = computeFib(daily);
ok('a rising series retraces a move UP', fib?.direction === 'up', fib?.direction);
ok('the move runs from the lowest low to the highest high', near(fib?.fromPrice, 98) && near(fib?.toPrice, 133.5), {
  from: fib?.fromPrice,
  to: fib?.toPrice,
});
const half = fib?.levels.find((l) => l.ratio === 0.5);
ok('the 50% level is the midpoint of that move', near(half?.price, (98 + 133.5) / 2), half);
ok('and the grid is the five interior ratios, not the endpoints again', fib?.levels.length === 5);
ok(
  'the provenance names both ends with their dates',
  fib?.from.includes('$98') === true && fib?.from.includes('$133.5') === true,
  fib?.from
);
ok(
  'a move too small to be a move gets no grid',
  computeFib(Array.from({ length: 30 }, (_, i) => d(`2026-03-${String((i % 28) + 1).padStart(2, '0')}`, 100, 100.4, 99.8, 100))) === null
);

/* ------------------------------------------------------------------ */
section('Anchored VWAP — anchored to a bar, never to a date somebody typed');

const avBars: Candle[] = [
  d('2026-05-01', 10, 10, 10, 10, 1_000),
  d('2026-05-04', 20, 20, 20, 20, 1_000),
  d('2026-05-05', 30, 30, 30, 30, 2_000),
  d('2026-05-06', 40, 40, 40, 40, 1_000),
];
const av = computeAnchoredVwap(avBars, '2026-05-04T00:00:00.000Z', 'swing_low');
// (20*1000 + 30*2000 + 40*1000) / 4000 = 120000/4000 = 30
ok('it averages only the bars from the anchor forward', near(av?.price, 30), av);
ok('and it counts them', av?.bars === 3, av?.bars);
ok('the anchor is named in plain words in the provenance', av?.from.includes('swing low') === true, av?.from);
ok('fewer than three bars is not an average and returns nothing', computeAnchoredVwap(avBars, '2026-05-06T00:00:00.000Z', 'x') === null);

/* ------------------------------------------------------------------ */
section('THE CASE THIS WAS BUILT FOR — a chart with no graded setup and no plan');

function bareContext(bars: Candle[], intradayBars: Candle[] = []): ChartContext {
  return {
    userId: 'test',
    symbol: 'TEST',
    timeframe: '1d',
    setup: null,
    alertId: null,
    planId: null,
    plan: null,
    communityLevel: null,
    triggerTs: null,
    supports: [],
    resistances: [],
    priorSession: null,
    bars: {
      firstTs: bars[0]?.ts ?? null,
      lastTs: bars[bars.length - 1]?.ts ?? null,
      lastPrice: bars[bars.length - 1]?.c ?? null,
    },
    levelTimeframe: '1d',
    computed: computeKeyLevels(bars),
    intraday: computeIntradayLevels(intradayBars),
    trendlines: findTrendlines(bars),
    fib: computeFib(bars),
    dailyBars: bars,
  };
}

const bare = bareContext(daily, intradayBars);
const before = ['trigger', 'entry', 'stop', 'invalidation', 'target', 'target2', 'support', 'resistance', 'community'];

ok(
  'the OLD vocabulary still resolves to nothing here — this is the bug, reproduced',
  before.every((k) => resolveLevel(bare, k) === null),
  before.filter((k) => resolveLevel(bare, k) !== null)
);
const now = availableLevels(bare);
ok('the new vocabulary resolves on the same chart', now.length >= 12, now);
ok('including the previous session', near(resolveLevel(bare, 'prior_day_high')?.price, 133.5));
ok('including today\'s opening range', near(resolveLevel(bare, 'open_range_high')?.price, 107));
ok(
  'and the nearest level in either direction, which is what "what is next" means',
  typeof resolveLevel(bare, 'nearest_support')?.price === 'number' &&
    typeof resolveLevel(bare, 'nearest_resistance')?.price === 'number'
);
ok(
  'every resolved level carries a provenance naming bars and timeframe',
  now.every((k) => {
    const r = resolveLevel(bare, k)!;
    return r.provenance.length > 20 && /bar|average|five-minute|daily/i.test(r.provenance);
  }),
  now.filter((k) => !/bar|average|five-minute|daily/i.test(resolveLevel(bare, k)!.provenance))
);
ok(
  'a level whose bar is known brings that bar with it, so the camera can go there',
  typeof resolveLevel(bare, 'prior_day_high')?.ts === 'string'
);
ok('a name nobody defined still draws nothing', resolveLevel(bare, 'the_bit_that_looks_dodgy') === null);

/* ------------------------------------------------------------------ */
section('An average is a CURVE and never resolves as a level');

/**
 * THE OWNER'S SECOND COMPLAINT, WORD FOR WORD: "Kai marks out levels like ema
 * etc as horizontal levels not actual ema so the entire chart is nothing but
 * multiple horizontal levels."
 *
 * It was exactly true. `ema21` resolved through `resolveLevel`, which returns a
 * PRICE and an annotation kind, and the only thing the chart can do with a price
 * and a kind of `support` is rule a dashed line across the plot. So the fix has
 * to be asserted at the resolver, not at the renderer: an average must not come
 * back from the level path AT ALL, because anything that does is a horizontal
 * line by construction.
 */
const curveNames = ['ema8', 'ema21', 'ema50', 'vwap', '21ema', 'ema_50', 'session_vwap'];
ok(
  'not one of them comes back from the level resolver',
  curveNames.every((k) => resolveLevel(bare, k) === null),
  curveNames.filter((k) => resolveLevel(bare, k) !== null)
);
// Anchored, because "premarket_high" contains the letters e-m-a and a loose
// match here would have reported the fix as broken while it was working.
const CURVE_KEY = /^(?:ema|sma)_?\d|^vwap$/i;
ok(
  'and none of them is advertised to Kai as a level he can mark',
  now.every((k) => !CURVE_KEY.test(k)),
  now.filter((k) => CURVE_KEY.test(k))
);
ok('they resolve as curves instead', availableIndicators(bare).length >= 3, availableIndicators(bare));
ok('the 8-day average is priced', typeof resolveIndicator(bare, 'ema8')?.price === 'number');
ok('and it knows it is an 8-bar exponential average',
  resolveIndicator(bare, 'ema8')?.spec.indicator === 'ema' && resolveIndicator(bare, 'ema8')?.spec.period === 8);
ok('the volume-weighted average is priced the same way it always was', near(resolveIndicator(bare, 'vwap')?.price, byHand, 0.01));
ok(
  'and it carries its ANCHOR — where the running total starts, which is what the client redraws from',
  typeof resolveIndicator(bare, 'vwap')?.anchorTs === 'string'
);
ok('a rolling average has no anchor, because it is recomputed on every bar', resolveIndicator(bare, 'ema8')?.anchorTs === null);
ok(
  'a period nobody precomputed is still arithmetic over stored closes',
  typeof resolveIndicator(bare, 'ema9')?.price === 'number' && resolveIndicator(bare, 'ema9')?.label === 'EMA 9'
);
ok('a 200-day average over thirty bars is refused, not approximated', resolveIndicator(bare, 'ema200') === null);
ok('and a support is still a support', resolveIndicator(bare, 'prior_day_high') === null);

/**
 * The averages used to be in the support and resistance lists too, which is how
 * "nearest support" kept coming back as a number that will be somewhere else
 * tomorrow — and then got drawn as a fixed shelf labelled Support.
 */
ok(
  'no average leaks into the nearest-support answer',
  !/ema|vwap|average/i.test(resolveLevel(bare, 'nearest_support')?.reason ?? ''),
  resolveLevel(bare, 'nearest_support')?.reason
);
ok(
  'nor into nearest resistance',
  !/ema|vwap|average/i.test(resolveLevel(bare, 'nearest_resistance')?.reason ?? ''),
  resolveLevel(bare, 'nearest_resistance')?.reason
);
ok('"pdh" is what a person types, and it resolves to the same number', near(resolveLevel(bare, 'pdh')?.price, 133.5));
ok('"hod" too', near(resolveLevel(bare, 'hod')?.price, 112));
ok('and casing and spaces do not break it', near(resolveLevel(bare, '  PDH ')?.price, 133.5));

/* ------------------------------------------------------------------ */
section('Rows already in the table — repaired on the way out, not migrated');

/**
 * THE HALF THAT FIXES CHARTS THAT ARE ALREADY WRONG.
 *
 * Every average Kai has ever marked is sitting in `chart_annotations` as
 * `kind: 'support'` (or `resistance`, whichever side of price it was on) with
 * `text: 'Ema21'`. Those rows ARE the wall of horizontal lines. Rewriting them
 * would be a data migration across every chart in the product whose only signal
 * that it went wrong would arrive afterwards, so `toAnnotationRow` re-reads the
 * label instead: nothing is rewritten, and there is nothing to back out.
 *
 * `Ema21` is the case that matters most and the one a careless guard misses —
 * `\bema\b` does not match it, because the next character is a digit.
 */
const row = (kind: string, text: string) =>
  toAnnotationRow({
    id: 'r', symbol: 'TEST', timeframe: '1d', kind, price: 604.12, price2: null,
    ts_from: null, ts_to: null, text, reason: 'x', provenance: 'kai', status: 'valid',
    source_alert_id: null, source_setup_id: null, source_plan_id: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: null,
  });

ok('a support labelled "Ema21" comes back as a curve', row('support', 'Ema21').kind === 'indicator', row('support', 'Ema21'));
ok('and it is re-labelled to the one name the chip, the rail and the tag all use', row('support', 'Ema21').text === 'EMA 21');
ok('and it carries which curve and how many bars', row('support', 'Ema21').indicator === 'ema' && row('support', 'Ema21').period === 21);
ok('a resistance labelled "Vwap" comes back as a curve', row('resistance', 'Vwap').kind === 'indicator' && row('resistance', 'Vwap').indicator === 'vwap');
ok('"50-day moving average" too', row('support', '50-day moving average').period === 50);
ok('and it is a level semantic either way, so it is never coloured as risk', row('support', 'Ema21').semantic === 'level');

ok('a real shelf is untouched', row('support', 'Prior day low').kind === 'support');
ok('so is a trigger', row('trigger', 'Trigger').kind === 'trigger');
ok(
  'and a level that merely STARTS like an acronym stays a level',
  row('support', 'Smart money zone').kind === 'support' && row('resistance', 'Major shelf').kind === 'resistance',
);
ok(
  'a shape named after an average keeps its shape — a trendline is already a curve',
  row('trendline', 'EMA 21 channel').kind === 'trendline',
);
ok(
  'and an indicator row that names no computable curve becomes a note, never a rule',
  row('indicator', 'something').kind === 'note',
);

ok('the guard catches every spelling the parser can read', ['Ema21', 'EMA 21', '21 EMA', 'ma50', 'VWAP', '50-day moving average']
  .every((s) => looksLikeIndicator(s) && parseIndicator(s) !== null));
ok('and fires on none of the level names', ['Support', 'Resistance', 'Trigger', 'Prior day high', 'Smart money zone', 'Fib 61.8%', 'First target']
  .every((s) => !looksLikeIndicator(s)), ['Support', 'Resistance', 'Trigger', 'Prior day high', 'Smart money zone', 'Fib 61.8%', 'First target'].filter(looksLikeIndicator));

/* ------------------------------------------------------------------ */
section('mark_level — the command that used to draw the rule');

/**
 * THE ONE ASSERTION THE WHOLE FIX HANGS ON.
 *
 * `mark_level` is where every path meets: the chat's fenced block, the
 * director's `[MARK:]` cues, the show's resolver. Asked for `ema21` it must
 * produce an OVERLAY frame — one that names the curve and lets the client draw
 * the series — and it must not produce a frame carrying a price and a level
 * kind, because that frame is a horizontal line by the time it reaches a canvas.
 *
 * The annotation may or may not persist here (there is no signed-in user behind
 * this test, and migration 0036 may not be applied on whatever database it is
 * pointed at). That is deliberate: an overlay is arithmetic over bars the client
 * already holds, so it draws either way, and this asserts that too.
 */
const curveFrame = await executeChartCommand(bare, { command: 'mark_level', args: { level: 'ema21' } });
ok('asking to mark the 21-day produces a frame', curveFrame !== null);
ok('and it is an OVERLAY, not a level', curveFrame?.payload.kind === 'indicator', curveFrame?.payload);
ok('naming which curve and over how many bars', curveFrame?.payload.indicator === 'ema' && curveFrame?.payload.period === 21);
ok('with an annotation the chart can draw, persisted or not', (curveFrame?.annotations.length ?? 0) === 1 && curveFrame?.annotations[0].kind === 'indicator');
ok('labelled the way a person says it', curveFrame?.annotations[0].text === 'EMA 21');
ok(
  'and Kai says out loud that it MOVES, rather than that it sits at a price',
  /moves? with every new close|line that moves/i.test(curveFrame?.narration ?? ''),
  curveFrame?.narration
);

const vwapFrame = await executeChartCommand(bare, { command: 'mark_level', args: { level: 'vwap' } });
ok('the volume-weighted average is an overlay too', vwapFrame?.payload.kind === 'indicator' && vwapFrame?.payload.indicator === 'vwap');
ok('and it carries the anchor its running total starts from', typeof vwapFrame?.payload.anchor_ts === 'string');

const shelfFrame = await executeChartCommand(bare, { command: 'mark_level', args: { level: 'prior_day_high' } });
ok('a real shelf is still a level, still a horizontal line', shelfFrame?.payload.kind === 'resistance' || shelfFrame?.payload.kind === 'support', shelfFrame?.payload);
ok('and it is not accidentally an overlay', shelfFrame?.payload.indicator === undefined);

/* ------------------------------------------------------------------ */
section('The indicator library — calling one by name, and being told no');

/**
 * THE OWNER'S FOLLOW-UP: "we need to build indicator library tools on how to
 * draw them or call them or whatever needs to happen to make them work."
 *
 * The thing that has to be true is that a name Kai can say resolves to something
 * the chart can draw, WITHOUT a second list anywhere to keep in step. Adding a
 * row to `INDICATORS` is the whole change; these assertions are what prove the
 * resolver, the advertised vocabulary and the refusals all read that one row.
 */
const bb = resolveIndicator(bare, 'bollinger');
ok('Bollinger Bands resolve from bars alone', typeof bb?.price === 'number', bb?.label);
ok('and answer with all three of their edges', typeof bb?.outputs.upper === 'number' && typeof bb?.outputs.lower === 'number' && typeof bb?.outputs.basis === 'number', bb?.outputs);
ok('the band is the right way up', (bb?.outputs.upper as number) > (bb?.outputs.basis as number) && (bb?.outputs.basis as number) > (bb?.outputs.lower as number));
ok('a wider multiple is a wider band', (() => {
  const wide = resolveIndicator(bare, 'bollinger');
  return wide !== null && wide.spec.mult === 2;
})());

const tc = resolveIndicator(bare, 'cheatcode trend clouds');
ok('CheatCode Trend Clouds resolve by the product name', typeof tc?.price === 'number', tc?.label);
ok('and by the upstream one, which is an alias and never a label', (() => {
  const alias = resolveIndicator(bare, 'supertrend');
  return alias !== null && alias.spec.indicator === 'trend_clouds' && !/supertrend/i.test(alias.label);
})());
ok('the label is the product name', /Trend Clouds/.test(tc?.label ?? ''), tc?.label);

ok('every drawable indicator is advertised to Kai', (() => {
  const offered = availableIndicators(bare);
  return offered.some((k) => k.startsWith('bollinger')) && offered.some((k) => k.startsWith('trend_clouds'));
})(), availableIndicators(bare));

/**
 * REFUSING IS A FIRST-CLASS ANSWER. An RSI drawn on a price axis is either a
 * flat line down near zero or a rescaled invention that looks like analysis.
 * Saying plainly why it needs its own panel is the better outcome, and it has to
 * be a sentence rather than a null so Kai has something to say.
 */
for (const panel of ['rsi', 'relative strength index', 'macd', 'stochastic']) {
  ok(`${panel} does not resolve as something drawable`, resolveIndicator(bare, panel) === null);
  const why = indicatorRefusalFor(panel);
  ok(`${panel} refuses with a plain sentence instead`, typeof why === 'string' && why.length > 30, why);
}
ok('and it is never mistaken for a level either', resolveLevel(bare, 'rsi') === null);
ok('an average is not refused', indicatorRefusalFor('ema21') === null);

const rsiFrame = await executeChartCommand(bare, { command: 'mark_level', args: { level: 'rsi' } });
ok('asking to mark the RSI still answers', rsiFrame !== null);
ok('it draws NOTHING', (rsiFrame?.annotations.length ?? 1) === 0 && rsiFrame?.payload.refused === true, rsiFrame?.payload);
ok('and says why, in words a beginner can act on', /own panel/i.test(rsiFrame?.narration ?? ''), rsiFrame?.narration);

const bbFrame = await executeChartCommand(bare, { command: 'mark_level', args: { level: 'bollinger' } });
ok('a band is ONE mark, not two', (bbFrame?.annotations.length ?? 0) === 1, bbFrame?.annotations.length);
ok('and it goes out as an overlay naming the curve', bbFrame?.payload.indicator === 'bollinger' && bbFrame?.payload.kind === 'indicator');
ok('carrying the multiple, so the client draws the same band the server priced', bbFrame?.payload.mult === 2);

/* ------------------------------------------------------------------ */
section('Zones — shading an area, from levels that already resolved');

const zonesNow = availableZones(bare);
ok('this chart can shade something', zonesNow.length > 0, zonesNow);
ok("and yesterday's range is one of them", zonesNow.includes('prior_day'), zonesNow);

const zFrame = await executeChartCommand(bare, { command: 'mark_zone', args: { zone: 'prior_day' } });
ok('marking a zone produces a frame', zFrame !== null);
ok('typed as a zone, not a level and not a box', zFrame?.payload.kind === 'zone' && zFrame?.annotations[0]?.kind === 'zone');
ok('with two edges', typeof zFrame?.payload.price === 'number' && typeof zFrame?.payload.price2 === 'number');
ok('the top edge is the top', (zFrame?.payload.price as number) > (zFrame?.payload.price2 as number));
ok('both edges are the levels it was built from', (() => {
  const hi = resolveLevel(bare, 'prior_day_high')?.price;
  const lo = resolveLevel(bare, 'prior_day_low')?.price;
  return zFrame?.payload.price === hi && zFrame?.payload.price2 === lo;
})(), { got: [zFrame?.payload.price, zFrame?.payload.price2] });
ok('it is anchored to a real bar', typeof zFrame?.payload.from === 'string');
ok(
  'and it is left OPEN at the right — a shelf that is still there has not expired',
  zFrame?.payload.to === null,
);
ok('a name nothing defines shades nothing', (await executeChartCommand(bare, { command: 'mark_zone', args: { zone: 'the_vibes' } })) === null);

/**
 * A ZONE WITH NO HEIGHT IS A LEVEL. Two edges resolving to the same number
 * produce a rectangle nobody can see sitting on top of a line that says the same
 * thing, so it converts rather than drawing a zero-height box.
 */
const flatCtx: ChartContext = {
  ...bare,
  supports: [100],
  resistances: [100],
};
const flat = await executeChartCommand(flatCtx, { command: 'mark_zone', args: { zone: 'range' } });
ok('a zone whose edges are the same price is drawn as a level instead', flat === null || flat.payload.kind !== 'zone', flat?.payload);

/* ------------------------------------------------------------------ */
section("Kai can see what the user drew");

/**
 * "kai should also be aware of what's drawn by user on chart at the moment."
 *
 * He could read every level the engine computed and had no idea what the person
 * in front of him had drawn, so "what do you think of my trendline?" was a
 * question about something invisible to him. The marks now ride in the chart
 * context — attributed, capped, and one short line each, because this is in
 * every prompt for the symbol.
 */
const drawn: ChartContext = {
  ...bare,
  userMarks: [
    { what: 'Trendline', price: 128.4, price2: 133.1, when: '2026-05-11' },
    { what: 'My level', price: 130, price2: null, when: null },
  ],
};

const withDrawings = chartCommandProtocol({
  symbol: 'TEST', timeframe: 'D',
  available: availableLevels(drawn),
  userMarks: drawn.userMarks,
});
ok('the prompt tells Kai the user has drawn', /drawn on this chart/i.test(withDrawings));
ok('and names each mark', withDrawings.includes('Trendline') && withDrawings.includes('My level'), null);
ok('with the prices they drew at', withDrawings.includes('128.4') && withDrawings.includes('130'));
ok(
  'and instructs him to call them THEIRS, not his analysis',
  /your trendline|their marks|THEIR marks/i.test(withDrawings) && /never present one as something you measured/i.test(withDrawings),
);
ok(
  'a chart nobody has drawn on says so plainly rather than saying nothing',
  /drawn nothing on this chart/i.test(chartCommandProtocol({ symbol: 'TEST', timeframe: 'D', available: [] })),
);
ok(
  'and the marks are capped, because this rides in every prompt',
  (() => {
    // The loader slices to twelve; this asserts the contract that there IS a cap
    // rather than the number, which is a tuning decision.
    const many = Array.from({ length: 30 }, (_, i) => ({ what: `Mark ${i}`, price: i, price2: null, when: null }));
    const text = chartCommandProtocol({ symbol: 'TEST', timeframe: 'D', available: [], userMarks: many.slice(0, 12) });
    return text.split('Mark ').length - 1 === 12;
  })(),
);

/* ------------------------------------------------------------------ */
section('Drawings');

const drawings = availableDrawings(bare);
ok('the drawings that resolve are advertised as copyable arguments', drawings.some((s) => s.includes('"fib"')), drawings);
ok('and a chart with no trendline advertises none', availableDrawings(bareContext(daily.slice(0, 25))).every((s) => !s.includes('trendline')));

/* ------------------------------------------------------------------ */
section('A setup, when there is one, still wins');

const withPlan: ChartContext = {
  ...bare,
  plan: { entry: 131, stop: 125, targets: [{ price: 140 }] },
  planId: 'plan-1',
};
ok('the plan supplies the stop', near(resolveLevel(withPlan, 'stop')?.price, 125));
ok('and its provenance points at the plan, not at bars', resolveLevel(withPlan, 'stop')?.provenance.includes('plan') === true);
ok('while the computed levels are still there beside it', near(resolveLevel(withPlan, 'prior_day_low')?.price, 126.25));

/* ------------------------------------------------------------------ */
section('Patterns — the shape a few bars made, measured off those bars');

/**
 * THE OWNER ASKED FOR "MARKUP ALL RECENT FVGS" AND THAT IS A DIFFERENT REQUEST
 * FROM EVERYTHING ABOVE IT.
 *
 * A level is one price the server looks up. A pattern is a SET the server has to
 * go and FIND, and the finding is the part that can go wrong quietly: a model
 * asked where the gaps are will answer with prices, and prices a model wrote are
 * prices nobody can check. So the arithmetic lives on the server and this is
 * where it gets proven — on bars whose answer was worked out on paper first, so
 * that a detector that changes meaning fails here rather than on someone's
 * chart.
 *
 * THE FIXTURE, AND THE GAPS IT CONTAINS, WORKED OUT BY HAND.
 *
 * A gap is three candles: bars[i-2], bars[i-1], bars[i]. Bullish when the FIRST
 * bar's high is below the THIRD bar's low; bearish when the first bar's low is
 * above the third bar's high. Walking every one of the eighteen triples in
 * `gapBars` below leaves exactly three:
 *
 *   i=2    02 Mar l 109.00  >  04 Mar h  98.00   BEARISH  [ 98.00, 109.00]
 *   i=8    08 Mar h  94.00  <  10 Mar l  96.00   BULLISH  [ 94.00,  96.00]
 *   i=14   14 Mar h 108.00  <  16 Mar l 110.00   BULLISH  [108.00, 110.00]
 *
 * and the third one is FILLED: 18 March trades 106.00 to 120.00, which covers
 * [108.00, 110.00] end to end. A filled gap is history rather than a level, so
 * it must not come back — leaving two, newest first.
 *
 * NOTHING ELSE FILLS EITHER OF THE SURVIVORS, and that took arranging: filling
 * is one bar covering the WHOLE band, so the drop through the bearish gap has to
 * be checked against every bar after it, not just the next one. The first draft
 * of this fixture had a bullish gap at the front that a later crash swallowed
 * whole, which is the detector being right and the fixture being wrong.
 */
const gapBars: Candle[] = [
  /*  0 */ d('2026-03-02', 110, 116, 109, 115),
  /*  1 */ d('2026-03-03', 115, 115.5, 95, 96), // the candle that made the bearish gap
  /*  2 */ d('2026-03-04', 96, 98, 92, 94),
  /*  3 */ d('2026-03-05', 94, 97, 91, 93),
  /*  4 */ d('2026-03-06', 93, 96, 90, 92),
  /*  5 */ d('2026-03-07', 92, 95, 89, 91),
  /*  6 */ d('2026-03-08', 91, 94, 88, 93),
  /*  7 */ d('2026-03-09', 93, 100, 92, 99), // the candle that made the bullish gap
  /*  8 */ d('2026-03-10', 99, 102, 96, 101),
  /*  9 */ d('2026-03-11', 101, 103, 97, 102),
  /* 10 */ d('2026-03-12', 102, 104, 98, 103),
  /* 11 */ d('2026-03-13', 103, 106, 100, 105),
  /* 12 */ d('2026-03-14', 105, 108, 102, 107),
  /* 13 */ d('2026-03-15', 107, 115, 106, 114), // the candle that made the gap that gets filled
  /* 14 */ d('2026-03-16', 114, 118, 110, 117),
  /* 15 */ d('2026-03-17', 117, 119, 111, 118),
  /* 16 */ d('2026-03-18', 118, 120, 106, 108), // trades 106 to 120 — covers [108, 110] end to end
  /* 17 */ d('2026-03-19', 108, 112, 104, 110),
  /* 18 */ d('2026-03-20', 110, 114, 106, 113),
  /* 19 */ d('2026-03-21', 113, 116, 108, 115),
];

const gapCtx = bareContext(gapBars);
const gaps = resolvePattern(gapCtx, 'fvg');

ok('asking for the gaps by name finds some', gaps !== null && gaps.matches.length > 0);
ok('and exactly the two that are still open', gaps?.matches.length === 2 && gaps?.found === 2, {
  got: gaps?.matches.map((m) => [m.bottom, m.top]),
});
ok('the newest one is first', gaps?.matches[0].at === '2026-03-09T00:00:00.000Z', gaps?.matches[0].at);
ok(
  'the bullish gap is the band between the 8th\'s high and the 10th\'s low — 94.00 to 96.00',
  gaps?.matches[0].bottom === 94 && gaps?.matches[0].top === 96,
  gaps?.matches[0]
);
ok('and it is named as bullish', gaps?.matches[0].direction === 'bullish');
ok(
  'the bearish one is 98.00 to 109.00',
  gaps?.matches[1].bottom === 98 && gaps?.matches[1].top === 109 && gaps?.matches[1].direction === 'bearish',
  gaps?.matches[1]
);
ok(
  'each is anchored to the MIDDLE candle — the bar that made the gap, not the two either side',
  gaps?.matches[0].at === '2026-03-09T00:00:00.000Z' &&
    gaps?.matches[0].tsFrom === '2026-03-09T00:00:00.000Z' &&
    gaps?.matches[1].at === '2026-03-03T00:00:00.000Z',
  [gaps?.matches[0].at, gaps?.matches[1].at]
);
ok(
  'and left open at the right, because an unfilled gap has not expired',
  gaps?.matches.every((m) => m.tsTo === null)
);
ok(
  'the gap the 18th traded straight through is NOT reported',
  gaps?.matches.every((m) => !(m.bottom === 108 && m.top === 110)),
  gaps?.matches.map((m) => [m.bottom, m.top])
);
ok(
  'every edge is a high or a low off a bar that printed — nothing is averaged',
  gaps?.matches.every((m) => gapBars.some((b) => b.h === m.top || b.l === m.top) && gapBars.some((b) => b.h === m.bottom || b.l === m.bottom))
);
ok(
  'and each one says in plain words which bars it came off',
  gaps?.matches.every((m) => /never met/.test(m.reason) && /\$/.test(m.reason)),
  gaps?.matches[0].reason
);
ok('the label is the pattern and the day it was made', gaps?.matches[0].label === 'FVG 9 Mar', gaps?.matches[0].label);

/**
 * THE CAP, AND WHY IT HAS TO BE SAID OUT LOUD.
 *
 * A staircase where every bar's low is above the high of the bar before last:
 * bar k runs 100+10k to 105+10k, so bars[k-2].h = 85+10k is under bars[k].l =
 * 100+10k for every triple from i=2 onwards. Eight bars, six gaps, and nothing
 * ever comes back down to fill one. The registry draws four.
 */
const stairBars: Candle[] = Array.from({ length: 8 }, (_, k) =>
  d(`2026-04-0${k + 1}`, 101 + 10 * k, 105 + 10 * k, 100 + 10 * k, 104 + 10 * k)
);
const stairCtx = bareContext(stairBars);
const stairs = resolvePattern(stairCtx, 'fair value gaps');

ok('six gaps are found on the staircase', stairs?.found === 6, stairs?.found);
ok('and exactly four are returned, because that is the cap', stairs?.matches.length === 4, stairs?.matches.length);
ok('the resolver says out loud that it capped', stairs?.capped === true && stairs?.cap === 4);
ok(
  'the four are the most recent four, newest first',
  stairs?.matches.map((m) => m.at).join(',') ===
    ['2026-04-07', '2026-04-06', '2026-04-05', '2026-04-04'].map((s) => `${s}T00:00:00.000Z`).join(','),
  stairs?.matches.map((m) => m.at)
);
ok(
  'and the newest is the band between the 6th bar\'s high and the 8th bar\'s low — 155 to 170',
  stairs?.matches[0].bottom === 155 && stairs?.matches[0].top === 170,
  stairs?.matches[0]
);
ok('the provenance counts them all, not just the drawn ones', stairs?.provenance.includes('6 gaps') === true, stairs?.provenance);

/**
 * SWINGS — the same 3-bar fractal `key-levels.ts` uses, mirrored into the shared
 * package because the mobile bundle cannot import the market layer. Mirrored
 * code that drifts is worse than duplicated code that does not, so this asserts
 * the two agree on the same bars.
 *
 * A zigzag: even bars run 100+k to 110+k, odd bars 94+k to 104+k. Every even bar
 * is a high above both its neighbours and every odd bar is a low below both, so
 * the turns are known before the detector runs. Thirteen bars, five swing highs
 * and six swing lows, and the last bar closes at 117 so the newest highs sit
 * above price and the older ones below it.
 */
const zigBars: Candle[] = Array.from({ length: 13 }, (_, k) =>
  k % 2 === 0
    ? d(`2026-02-${String(k + 1).padStart(2, '0')}`, 101 + k, 110 + k, 100 + k, k === 12 ? 117 : 109 + k)
    : d(`2026-02-${String(k + 1).padStart(2, '0')}`, 95 + k, 104 + k, 94 + k, 103 + k)
);
const zigCtx = bareContext(zigBars);
const highs = resolvePattern(zigCtx, 'swing highs');
const lows = resolvePattern(zigCtx, 'recent lows');

ok('five swing highs are on this chart', highs?.found === 5, highs?.found);
ok('three of them are drawn, newest first', highs?.matches.length === 3 && highs?.capped === true);
ok(
  'and they are the highs of real bars: 120, 118, 116',
  highs?.matches.map((m) => m.top).join(',') === '120,118,116',
  highs?.matches.map((m) => m.top)
);
ok(
  'each price is a field on the bar it is anchored to',
  highs?.matches.every((m) => zigBars.some((b) => b.ts === m.at && b.h === m.top))
);
ok('six swing lows, three drawn', lows?.found === 6 && lows?.matches.length === 3, [lows?.found, lows?.matches.length]);
ok(
  'and they are the lows of real bars: 105, 103, 101',
  lows?.matches.map((m) => m.bottom).join(',') === '105,103,101',
  lows?.matches.map((m) => m.bottom)
);
ok(
  'a level has no height — top and bottom are the same price',
  [...(highs?.matches ?? []), ...(lows?.matches ?? [])].every((m) => m.top === m.bottom)
);
ok(
  'the mirrored fractal agrees with the one the levels rail uses, bar for bar',
  (() => {
    const mine = (highs?.matches ?? []).map((m) => m.at);
    const theirs = fractals(solidBars(zigBars), 'high').map((p) => p.ts).reverse().slice(0, 3);
    return mine.join(',') === theirs.join(',');
  })(),
  { mine: (highs?.matches ?? []).map((m) => m.at), theirs: fractals(solidBars(zigBars), 'high').map((p) => p.ts) }
);

/* ------------------------------------------------------------------ */
section('mark_pattern — a set of boxes, and the cap said out loud');

const gapFrame = await executeChartCommand(gapCtx, { command: 'mark_pattern', args: { pattern: 'fvg' } });
ok('marking the gaps produces a frame', gapFrame !== null);
ok('typed as its own command', gapFrame?.command === 'mark_pattern');
ok('one annotation per gap, not one row for the set', gapFrame?.annotations.length === 2, gapFrame?.annotations.length);
ok('and every one of them is a zone', gapFrame?.annotations.every((a) => a.kind === 'zone'));
ok(
  'carrying the exact edges that were measured — 96.00 over 94.00',
  gapFrame?.annotations[0].price === 96 && gapFrame?.annotations[0].price2 === 94,
  [gapFrame?.annotations[0].price, gapFrame?.annotations[0].price2]
);
ok('anchored to the bar that made it', gapFrame?.annotations[0].ts_from === '2026-03-09T00:00:00.000Z');
ok('and open at the right-hand edge', gapFrame?.annotations[0].ts_to === null);
ok(
  'nothing was capped here, so the narration does not claim it was',
  !/most recent/.test(gapFrame?.narration ?? ''),
  gapFrame?.narration
);

const stairFrame = await executeChartCommand(stairCtx, { command: 'mark_pattern', args: { pattern: 'gaps' } });
ok('four boxes go out when there are six', stairFrame?.annotations.length === 4, stairFrame?.annotations.length);
ok(
  'AND KAI SAYS THE CAP OUT LOUD — both numbers, in a sentence',
  /4 most recent gaps/.test(stairFrame?.narration ?? '') && /there are 6 on this chart/.test(stairFrame?.narration ?? ''),
  stairFrame?.narration
);
ok('the payload carries both counts too', stairFrame?.payload.count === 4 && stairFrame?.payload.found === 6 && stairFrame?.payload.capped === true);

/**
 * A SWING IS A SHELF, so it is marked as one — and which shelf it is depends on
 * which side of price it is sitting on, exactly as `computedLevels` decides it.
 * The last bar closes at 117: 120 and 118 are above it, 116 is below.
 */
const highFrame = await executeChartCommand(zigCtx, { command: 'mark_pattern', args: { name: 'swing high' } });
ok('swing highs are marked as levels, not as boxes', highFrame?.annotations.every((a) => a.kind === 'support' || a.kind === 'resistance'));
ok(
  'the ones above the last price are resistance and the one below is support',
  highFrame?.annotations.map((a) => `${a.price}:${a.kind}`).join(',') === '120:resistance,118:resistance,116:support',
  highFrame?.annotations.map((a) => `${a.price}:${a.kind}`)
);

/* ------------------------------------------------------------------ */
section('Naming a pattern — what resolves, what refuses, what draws nothing');

ok('a chart with gaps on it advertises them', availablePatterns(gapCtx).includes('fvg'), availablePatterns(gapCtx));
ok(
  'a chart with NO gap on it does not — the prompt never offers an empty set',
  !availablePatterns(zigCtx).includes('fvg'),
  availablePatterns(zigCtx)
);
ok('but it does advertise its swings', availablePatterns(zigCtx).includes('swing_high') && availablePatterns(zigCtx).includes('swing_low'));
ok(
  'the longest alias wins, so "fair value gap" is not read as "gap"',
  parsePattern('mark all the fair value gaps') === 'fvg' && parsePattern('imbalances') === 'fvg' && parsePattern('fvgs') === 'fvg'
);
ok('and the plurals land on the same row', parsePattern('swing highs') === 'swing_high' && parsePattern('recent lows') === 'swing_low');
ok('a word nobody named is not a pattern', parsePattern('the bit that looks dodgy') === null);

ok('every refused pattern has a sentence attached', refusedPatterns().every((r) => r.why.length > 40 && /^I /.test(r.why)));
ok('and asking for one by name gets that sentence', typeof patternRefusal('order blocks') === 'string');
ok('a pattern that CAN be found is not refused', patternRefusal('fvg') === null && patternRefusal('swing highs') === null);
ok('and a name nobody has heard of is not refused either — it is just unknown', patternRefusal('the vibes') === null);

const obFrame = await executeChartCommand(gapCtx, { command: 'mark_pattern', args: { pattern: 'order block' } });
ok('asking for an order block still answers', obFrame !== null);
ok('it draws NOTHING', (obFrame?.annotations.length ?? 1) === 0 && obFrame?.payload.refused === true, obFrame?.payload);
ok(
  'and says plainly that it would be guessing',
  /guess/i.test(obFrame?.narration ?? '') && (obFrame?.narration ?? '').length > 60,
  obFrame?.narration
);
ok(
  'a name nobody defined draws nothing and says nothing',
  (await executeChartCommand(gapCtx, { command: 'mark_pattern', args: { pattern: 'the_vibes' } })) === null
);
ok(
  'and a supported pattern with nothing to find draws nothing rather than apologising',
  (await executeChartCommand(zigCtx, { command: 'mark_pattern', args: { pattern: 'fvg' } })) === null
);

ok(
  'the prompt offers Kai the patterns this chart has, and tells him they are capped',
  (() => {
    const block = chartCommandProtocol({
      symbol: 'TEST',
      timeframe: '1d',
      available: availableLevels(gapCtx),
      patterns: availablePatterns(gapCtx),
    });
    return block.includes('mark_pattern') && block.includes('fvg') && /CAPPED/.test(block);
  })()
);
ok(
  'and names the ones he cannot find, so a plausible request gets a sentence',
  chartCommandProtocol({ symbol: 'TEST', timeframe: '1d', available: [], patterns: [] }).includes('order blocks')
);

/* ------------------------------------------------------------------ */
/* Live pass — real bars, real symbols, real provenance                */
/* ------------------------------------------------------------------ */

async function live(): Promise<void> {
  section('Live Polygon bars — what Kai can actually draw on a real chart today');
  if (!polygonConfigured()) {
    console.log('  SKIP  no POLYGON_API_KEY in this environment');
    return;
  }

  const to = lastTradingDate();
  const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const intraFrom = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);

  for (const symbol of ['AAPL', 'NVDA', 'F']) {
    const [dRes, iRes] = await Promise.all([
      fetchAggregates(symbol, '1d', from, to),
      fetchAggregates(symbol, '5m', intraFrom, to),
    ]);
    if (!dRes.ok) {
      ok(`${symbol}: daily bars came back`, false, dRes.reason);
      continue;
    }
    const bars = dRes.data;
    const ctx = bareContext(bars, iRes.ok ? iRes.data : []);
    const names = availableLevels(ctx);

    console.log(`\n  ${symbol} — ${bars.length} daily bars, last close $${bars[bars.length - 1]?.c}`);
    for (const n of names) {
      const r = resolveLevel(ctx, n)!;
      console.log(`    ${n.padEnd(20)} $${String(r.price).padEnd(10)} ${r.provenance}`);
    }
    for (const t of ctx.trendlines ?? []) {
      console.log(
        `    ${`trendline:${t.kind}`.padEnd(20)} $${t.fromPrice.toFixed(2)} -> $${t.toPrice.toFixed(2)}${t.broken ? ' (BROKEN)' : ''}  ${t.from}`
      );
    }
    if (ctx.fib) {
      console.log(`    ${'fib'.padEnd(20)} ${ctx.fib.levels.map((l) => `${(l.ratio * 100).toFixed(1)}%=$${l.price.toFixed(2)}`).join(' ')}`);
      if (VERBOSE) console.log(`      ${ctx.fib.from}`);
    }
    for (const drawing of availableDrawings(ctx)) {
      if (!drawing.includes('anchored_vwap')) continue;
      const anchor = JSON.parse(drawing).level as string;
      const anchorTs = resolveLevel(ctx, anchor)?.ts;
      const av = anchorTs ? computeAnchoredVwap(bars, anchorTs, anchor) : null;
      if (av) console.log(`    ${`vwap@${anchor}`.padEnd(20)} $${av.price.toFixed(2)}  ${av.from}`);
    }

    ok(`${symbol}: a chart with NO graded setup still has levels to draw`, names.length >= 10, names.length);
    ok(
      `${symbol}: the previous session's high is a real number`,
      typeof resolveLevel(ctx, 'prior_day_high')?.price === 'number'
    );
    ok(
      `${symbol}: every number names the bars it came from`,
      names.every((n) => (resolveLevel(ctx, n)!.provenance ?? '').length > 20)
    );
    ok(
      `${symbol}: nothing resolved to a price of zero or a NaN`,
      names.every((n) => Number.isFinite(resolveLevel(ctx, n)!.price) && resolveLevel(ctx, n)!.price > 0)
    );
    ok(
      `${symbol}: every level sits inside the range the bars actually traded`,
      names.every((n) => {
        const p = resolveLevel(ctx, n)!.price;
        const hi = Math.max(...bars.map((b) => b.h ?? 0));
        const lo = Math.min(...bars.filter((b) => (b.l ?? 0) > 0).map((b) => b.l ?? 0));
        return p >= lo * 0.999 && p <= hi * 1.001;
      })
    );
    const t = ctx.trendlines ?? [];
    ok(
      `${symbol}: every trendline anchor is a bar that exists in the series`,
      t.every((line) => bars.some((b) => b.ts === line.fromTs)),
      t.map((line) => line.fromTs)
    );
    ok(
      `${symbol}: both ends of every trendline are bars that exist in the series`,
      t.every((line) => bars.some((b) => b.ts === line.toTs)),
      t.map((line) => line.toTs)
    );
    /**
     * THE NVDA CASE, ASSERTED AGAINST WHATEVER TODAY'S BARS ARE. A trendline
     * that ends miles away from where price actually is is the drawing bug this
     * work exists to fix, and it cannot be caught by a fixture — it needs a real
     * chart that has run away from its own trendline.
     */
    ok(
      `${symbol}: no trendline ends more than 25% away from the last close`,
      t.every((line) => {
        const p = bars[bars.length - 1]?.c ?? 0;
        return p > 0 && Math.abs(line.toPrice - p) / p <= 0.25;
      }),
      t.map((line) => [line.kind, line.toPrice, line.broken, bars[bars.length - 1]?.c])
    );
  }
}

live().then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
});
