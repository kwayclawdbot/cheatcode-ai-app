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
} from '../src/lib/market/key-levels.ts';
import {
  availableDrawings,
  availableLevels,
  resolveLevel,
  type ChartContext,
} from '../src/lib/kai/chart-commands.ts';
import { fetchAggregates, lastTradingDate, polygonConfigured } from '../src/lib/market/polygon.ts';

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
ok('the new vocabulary resolves on the same chart', now.length >= 15, now);
ok('including the previous session', near(resolveLevel(bare, 'prior_day_high')?.price, 133.5));
ok('including today\'s opening range', near(resolveLevel(bare, 'open_range_high')?.price, 107));
ok('including the volume-weighted average', near(resolveLevel(bare, 'vwap')?.price, byHand, 0.01));
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
ok('an average belongs to no single bar and says so with a null', resolveLevel(bare, 'ema8')?.ts === null);
ok('a name nobody defined still draws nothing', resolveLevel(bare, 'the_bit_that_looks_dodgy') === null);
ok('"pdh" is what a person types, and it resolves to the same number', near(resolveLevel(bare, 'pdh')?.price, 133.5));
ok('"hod" too', near(resolveLevel(bare, 'hod')?.price, 112));
ok('and casing and spaces do not break it', near(resolveLevel(bare, '  PDH ')?.price, 133.5));

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
