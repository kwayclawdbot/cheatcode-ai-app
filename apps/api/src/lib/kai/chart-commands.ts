/**
 * Kai's chart-control commands (spec §7).
 *
 * THE RULE THAT SHAPES THIS FILE: Kai names WHICH level, the server resolves
 * WHAT the number is.
 *
 * The model is never asked for a price. It emits a command with a symbolic
 * reference — `{"command":"mark_level","args":{"level":"trigger"}}` — and this
 * file looks that reference up in the setup, alert, plan, position or community
 * objects that were loaded into the context. If the reference cannot be
 * resolved from a real row, the command is DROPPED rather than filled in with
 * a plausible number. That is the difference between a chart annotation and a
 * hallucination with a line attached.
 *
 * Every resolved frame carries `provenance` naming the row the number came
 * from, and `narration` — one sentence Kai says while the chart changes, because
 * spec §8 requires chart changes to be narrated, not silent.
 */
import {
  ChartCommandName,
  type AnnotationKind,
  type AnnotationRow,
  type ChartCommandFrame,
} from '@shared/api';
import { LIVE_ZONE_TARGETS } from '@shared/live';
import {
  computeIndicatorNow,
  DRAWABLE_INDICATORS,
  INDICATORS,
  indicatorKey,
  indicatorLabel,
  indicatorPlain,
  indicatorRefusal,
  looksLikeIndicator,
  parseIndicator,
  withDefaults,
  type IndicatorSpec,
} from '@shared/indicators';
import {
  DRAWABLE_PATTERNS,
  PATTERNS,
  REFUSED_PATTERNS,
  findPattern,
  isDrawablePattern,
  parsePattern,
  patternPlain,
  patternRefusal,
  type PatternBar,
  type PatternId,
} from '@shared/patterns';
import { z } from 'zod';
import { levels, isLong } from '../setups';
import type { SetupRow } from './context';
import {
  ephemeralAnnotation,
  markPlanLevels,
  patchAnnotation,
  upsertAnnotation,
  listAnnotations,
} from '../round4/annotations';
import {
  computeAnchoredVwap,
  emaLast,
  round2 as r2,
  type FibGrid,
  type IntradayLevels,
  type KeyLevels,
  type NamedLevel,
  type TrendLine,
} from '../market/key-levels';
import type { Candle } from '@shared/api';
import { log } from '../log';

/* ------------------------------------------------------------------ */
/* What the model is allowed to say                                     */
/* ------------------------------------------------------------------ */

export const ChartCommandRequest = z.object({
  command: ChartCommandName,
  args: z.record(z.string(), z.unknown()).default({}),
  /** The one sentence Kai says while the chart moves. */
  narration: z.string().max(400).optional(),
});
export type ChartCommandRequest = z.infer<typeof ChartCommandRequest>;

/**
 * Named levels the model may reference. It may not reference a number.
 *
 * THE FIRST TEN ARE THE ORIGINAL VOCABULARY and every one of them resolves off
 * a graded setup, a saved plan or the room. That is a correct rule and a very
 * short list: open a chart on a symbol with no setup and no plan — which is most
 * symbols, most of the time — and eight of the ten resolve to nothing. Kai was
 * not drawing inaccurately. He had almost nothing to draw with, so he narrated
 * marking things and the chart sat still, which from the outside is
 * indistinguishable from drawing badly.
 *
 * EVERYTHING AFTER THEM IS COMPUTED FROM BARS and needs no setup to exist. A
 * previous session's high is a field on a candle. An opening range is fifteen
 * minutes of five-minute bars. A moving average is a recurrence over closes.
 * None of them is a judgement and none of them is a guess, so all of them can be
 * offered under exactly the rule that governed the first ten: Kai names WHICH,
 * the server resolves WHAT, and a name that does not resolve draws nothing.
 */
const SETUP_LEVEL_KEYS = [
  'trigger',
  'entry',
  'stop',
  'invalidation',
  'target',
  'target1',
  'target2',
  'support',
  'resistance',
  'community',
] as const;

/** Computed off daily bars. Present whenever the symbol has 20 stored days. */
const DAILY_LEVEL_KEYS = [
  'prior_day_high',
  'prior_day_low',
  'prior_day_close',
  'year_high',
  'year_low',
  'swing_high',
  'swing_low',
  'nearest_support',
  'nearest_resistance',
] as const;

/** Computed off five-minute bars for the most recent session with any. */
const INTRADAY_LEVEL_KEYS = [
  'premarket_high',
  'premarket_low',
  'open_range_high',
  'open_range_low',
  'session_high',
  'session_low',
] as const;

/**
 * NAMES THAT ARE CURVES, AND THEY ARE NOT LEVELS.
 *
 * These were in `DAILY_LEVEL_KEYS` and `INTRADAY_LEVEL_KEYS` until the owner
 * reported the chart as "nothing but multiple horizontal levels", which it was:
 * `mark_level` resolved `ema21` to its value on the newest bar, a value is a
 * price, and the only thing the level path can do with a price is rule a dashed
 * line across the entire plot labelled Support. Five averages, five rules, none
 * of them true anywhere except the right-hand edge.
 *
 * A name in this list resolves through `resolveIndicator` instead, and the frame
 * it produces carries the NAME of the curve rather than a price to draw a rule
 * at. The client already holds the candles; it computes the series itself and
 * draws a line that is correct on every bar.
 *
 * NOT A CLOSED LIST, unlike the levels. Any `ema<n>` or `sma<n>` a person names
 * is arithmetic over closes that are already loaded, so `resolveIndicator`
 * computes it on demand — these are just the ones advertised in the prompt.
 */
const INDICATOR_KEYS = ['ema8', 'ema21', 'ema50', 'ema200', 'vwap'] as const;

const LEVEL_KEYS = [...SETUP_LEVEL_KEYS, ...DAILY_LEVEL_KEYS, ...INTRADAY_LEVEL_KEYS] as const;
type LevelKey = (typeof SETUP_LEVEL_KEYS)[number];

/**
 * What a trader actually says, mapped to what the resolver calls it.
 *
 * Not politeness. A model that says `pdh` and gets nothing drawn learns that
 * the chart is unreliable, and the next thing it does is stop trying. Every
 * alias below is a name that appears on a real chart or in a real sentence.
 */
const LEVEL_ALIAS: Record<string, string> = {
  pdh: 'prior_day_high',
  pdl: 'prior_day_low',
  pdc: 'prior_day_close',
  prev_high: 'prior_day_high',
  prev_low: 'prior_day_low',
  prev_close: 'prior_day_close',
  previous_close: 'prior_day_close',
  hod: 'session_high',
  lod: 'session_low',
  day_high: 'session_high',
  day_low: 'session_low',
  orb_high: 'open_range_high',
  orb_low: 'open_range_low',
  opening_range_high: 'open_range_high',
  opening_range_low: 'open_range_low',
  pmh: 'premarket_high',
  pml: 'premarket_low',
  '52w_high': 'year_high',
  '52w_low': 'year_low',
  session_vwap: 'vwap',
  '8ema': 'ema8',
  '21ema': 'ema21',
  '50ema': 'ema50',
  '200ema': 'ema200',
  ema_8: 'ema8',
  ema_21: 'ema21',
  ema_50: 'ema50',
  ema_200: 'ema200',
};

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', 'D', 'daily', 'five_minute'] as const;

const TIMEFRAME_ALIAS: Record<string, string> = {
  D: '1d',
  daily: '1d',
  day: '1d',
  five_minute: '5m',
  '5min': '5m',
  '1min': '1m',
  hour: '1h',
  '60m': '1h',
};

/* ------------------------------------------------------------------ */
/* The objects a command may be resolved against                        */
/* ------------------------------------------------------------------ */

export type ChartContext = {
  userId: string;
  symbol: string;
  timeframe: string;
  setup: SetupRow | null;
  alertId: string | null;
  planId: string | null;
  /** Levels from a saved plan, which override the setup's when present. */
  plan: { entry: number | null; stop: number | null; targets: { price: number; label?: string }[] } | null;
  /** The most-mentioned level in the room, when members have named one. */
  communityLevel: number | null;
  triggerTs: string | null;
  supports: number[];
  resistances: number[];
  /** Prior session, for `compare_prior`. */
  priorSession: { from: string; to: string } | null;
  /**
   * The window the stored bars actually cover, and the last close.
   *
   * A LINE NEEDS ONLY A PRICE; A SHAPE NEEDS A TIME AS WELL. A box has to span
   * something, a ring has to sit on a bar, and an arrow has to start somewhere.
   * Inventing either end would put a rectangle over a stretch of chart that
   * means nothing, so both come from the candles `loadChartContext` already
   * fetched and a shape without them is dropped like any other unresolvable
   * reference.
   */
  bars: { firstTs: string | null; lastTs: string | null; lastPrice: number | null };
  /**
   * The timeframe the LEVELS were measured on — not the one the user is
   * looking at. `loadChartContext` computes support and resistance from daily
   * bars and reads plan and setup levels off rows graded the same way, so every
   * number here is a daily number whatever `timeframe` happens to say.
   *
   * ANNOTATIONS ARE STORED AGAINST THIS ONE. They used to be stored against
   * whatever the chart was showing, which meant the same trigger was written
   * once as a 5m row and again as a 1d row the next time the user was on the
   * daily — `upsertAnnotation` matches on (user, symbol, timeframe, kind,
   * price), so it deduped against neither. Two rows, two lines, one price.
   */
  levelTimeframe: string;

  /* ---- computed from bars, and needing no setup to exist ---- */
  //
  // ALL OPTIONAL, ON PURPOSE. `loadChartContext` fills them; a test or a caller
  // that only cares about setup levels can leave them off and every computed
  // name simply fails to resolve, which is the same refusal an absent setup
  // already produces. Nothing below changes what an existing context means.

  /** Daily key levels: previous session, averages, the year's extremes, swings. */
  computed?: KeyLevels | null;
  /** The most recent session with five-minute bars: premarket, opening range, VWAP. */
  intraday?: IntradayLevels | null;
  /** Trendlines the algorithm found through real pivots. Never guessed. */
  trendlines?: TrendLine[];
  /** A fib grid over the swing the algorithm measured. */
  fib?: FibGrid | null;
  /**
   * WHAT THE USER HAS DRAWN ON THIS CHART, IN THEIR OWN HAND.
   *
   * Kai could read every level the engine computed and had no idea what the
   * person in front of him had put on the chart himself — so "what do you think
   * of my trendline?" was a question about something he could not see. These are
   * theirs, attributed as theirs, and they are the one part of the chart context
   * he must never claim as his own analysis.
   *
   * COMPACT ON PURPOSE. One short line each and capped, because this rides in
   * every prompt for the symbol and a chart somebody has drawn on twenty times
   * should not cost twenty lines of context on every turn.
   */
  userMarks?: { what: string; price: number | null; price2: number | null; when: string | null }[];

  /**
   * The daily series itself, for anchored VWAP.
   *
   * An anchored VWAP is the only thing here that cannot be precomputed: it
   * depends on WHICH bar Kai names as the anchor, and he does not name one until
   * he speaks. So the bars ride along and the average is computed on demand.
   */
  dailyBars?: Candle[];
};

export type Resolved = {
  price: number;
  label: string;
  kind: AnnotationKind;
  reason: string;
  provenance: string;
  /**
   * The bar this level is ABOUT, when one bar owns it: the session that printed
   * the previous day's high, the candle that made the year's low. Null for an
   * average, which belongs to every bar in its window and to no single one.
   *
   * It is what lets the camera go to a computed level rather than only to the
   * trigger, and what puts Kai's pointer on the right column instead of the
   * middle of the plot.
   */
  ts?: string | null;
};

/** Title Case out of a snake_case name, for the chip on the chart. */
function labelOf(name: string): string {
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Every level computed from bars, keyed by the name Kai may say.
 *
 * ORDER IS THE PRECEDENCE. Daily first, then intraday, so a symbol that has
 * both never has one silently shadow the other — the names do not collide, and
 * this is the guarantee that they cannot start to.
 *
 * A LEVEL'S KIND IS DECIDED BY WHICH SIDE OF PRICE IT IS ON, not by its name. A
 * 50-day average under price is acting as support and above it is acting as
 * resistance, and it is the same average either way. Naming the side rather than
 * the instrument is also what lets these levels into the director's table, which
 * only accepts the seven kinds that name a level.
 */
function computedLevels(ctx: ChartContext): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  const add = (l: NamedLevel, current: number, sourceNote: string) => {
    // A CURVE NEVER ENTERS THE LEVEL TABLE. It has a `price` — today's value —
    // and that price is what made it a horizontal rule for as long as this
    // function could not tell the two apart. `resolveIndicator` has it instead.
    if (l.indicator) return;
    const kind: AnnotationKind = l.price < current ? 'support' : 'resistance';
    out.set(l.name, {
      price: r2(l.price),
      label: labelOf(l.name),
      kind,
      reason: `${l.what} It sits ${l.price < current ? 'below' : 'above'} the last price, so it is acting as ${kind === 'support' ? 'support' : 'resistance'} right now.`,
      provenance: `${l.from} ${sourceNote}`,
      ts: l.ts,
    });
  };

  const daily = ctx.computed ?? null;
  if (daily) {
    const note = `Computed from ${daily.bars} daily bars for ${ctx.symbol}.`;
    for (const l of daily.levels) add(l, daily.current, note);

    // The nearest thing in either direction, whatever kind it happens to be.
    // This is the one name that ALWAYS resolves when there are bars at all, and
    // it is the answer to "what is the next level up from here" — a question the
    // old vocabulary could only answer when a setup existed.
    const near = (side: 'support' | 'resistance') => {
      const list = side === 'support' ? daily.support : daily.resistance;
      const l = list[0];
      if (!l) return;
      out.set(`nearest_${side}`, {
        price: r2(l.price),
        label: side === 'support' ? 'Nearest support' : 'Nearest resistance',
        kind: side,
        reason:
          `The closest level ${side === 'support' ? 'below' : 'above'} the last price is the ${l.name.replace(/_/g, ' ')} at $${r2(l.price)}. ${l.what}`,
        provenance: `${l.from} ${note}`,
        ts: l.ts,
      });
    };
    near('support');
    near('resistance');
  }

  const intra = ctx.intraday ?? null;
  if (intra) {
    const note = `Computed from ${intra.bars} five-minute bars for ${ctx.symbol} on ${intra.date}.`;
    for (const l of intra.levels) add(l, intra.current, note);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Curves                                                               */
/* ------------------------------------------------------------------ */

/**
 * A moving average or a volume-weighted average, resolved as what it is.
 *
 * `price` IS FILLED IN AND IS NOT WHAT GETS DRAWN. It is today's value of the
 * curve — the number a person means by "the 21 is at 604" — so the price tag,
 * the levels rail and Kai's own sentence all have a number to show. The LINE
 * comes from the client, which recomputes the whole series off the candles it is
 * already holding, so it is right on every bar rather than right on the last one
 * and flat everywhere else.
 */
export type ResolvedIndicator = {
  spec: IndicatorSpec;
  /** The resolver key: `ema21`, `bollinger20`, `vwap`. */
  key: string;
  /** The chip: "EMA 21", "BB 20", "Trend Clouds 20". */
  label: string;
  /** Newest value of the PRIMARY output. */
  price: number;
  /**
   * The newest value of every output this indicator produces — `basis`, `upper`
   * and `lower` for a band. Carried so a person asking "where are the bands"
   * gets numbers, and so the levels rail can show the one that matters.
   */
  outputs: Record<string, number | null>;
  reason: string;
  provenance: string;
  /**
   * Where a RUNNING total starts. A VWAP has one; a windowed average does not,
   * because it is recomputed from scratch on every bar. The client needs it to
   * draw the same curve the server priced.
   */
  anchorTs: string | null;
};

/**
 * WHY THIS ONE CANNOT GO ON THE PRICE CHART, or null when it can.
 *
 * The registry knows that RSI runs 0 to 100 and a price runs in dollars, so
 * asking for it produces a SENTENCE rather than a line. That is the whole point
 * of naming panel indicators at all: before they were in the registry, "put the
 * RSI on there" resolved to nothing, and Kai either went quiet or quietly drew
 * something else. The failure mode being avoided is not a missing feature, it is
 * a 0-to-100 oscillator rescaled onto a dollar axis, which looks like analysis
 * and is arithmetic nonsense.
 */
export function indicatorRefusalFor(key: string): string | null {
  const raw = String(key ?? '').trim().toLowerCase();
  const spec = parseIndicator(LEVEL_ALIAS[raw] ?? raw);
  return spec ? indicatorRefusal(spec) : null;
}

/** Every curve the loaded bars already priced, keyed by the name Kai may say. */
function computedIndicators(ctx: ChartContext): Map<string, ResolvedIndicator> {
  const out = new Map<string, ResolvedIndicator>();
  const add = (l: NamedLevel, note: string) => {
    if (!l.indicator) return;
    const spec = l.indicator;
    const r: ResolvedIndicator = {
      spec,
      key: indicatorKey(spec),
      label: indicatorLabel(spec),
      price: r2(l.price),
      outputs: { [INDICATORS[spec.indicator].outputs[0]]: r2(l.price) },
      reason: `${l.what} It is ${indicatorPlain(spec)}, so it is drawn as a line across the chart rather than as a level.`,
      provenance: `${l.from} ${note}`,
      anchorTs: l.ts,
    };
    // Both spellings point at the same curve: the name in the data (`ema21`)
    // and the canonical key. They are the same string today and this is what
    // keeps them the same string if one of them is ever renamed.
    out.set(l.name, r);
    out.set(r.key, r);
  };

  const daily = ctx.computed ?? null;
  if (daily) {
    const note = `Computed from ${daily.bars} daily bars for ${ctx.symbol}.`;
    for (const l of daily.levels) add(l, note);
  }
  const intra = ctx.intraday ?? null;
  if (intra) {
    const note = `Computed from ${intra.bars} five-minute bars for ${ctx.symbol} on ${intra.date}.`;
    for (const l of intra.levels) add(l, note);
  }
  return out;
}

/**
 * Resolve one named curve. Null when the loaded bars cannot price it.
 *
 * TWO PASSES, AND THE SECOND ONE IS WHY THE LIST IS NOT CLOSED. First the ones
 * `computeKeyLevels` already worked out — the four averages the alert engine
 * uses, and the session VWAP. Then, for anything else a person can reasonably
 * name, the arithmetic itself: a 9-day average is a recurrence over closes that
 * are already in `ctx.dailyBars`, so refusing to draw it would be refusing to do
 * a sum, not refusing to invent a number. The anti-invention rule is about
 * prices nobody stored; every close here was stored.
 */
export function resolveIndicator(ctx: ChartContext, key: string): ResolvedIndicator | null {
  const raw = String(key ?? '').trim().toLowerCase();
  const k = LEVEL_ALIAS[raw] ?? raw;

  const spec = parseIndicator(k);
  if (!spec) return null;
  // A PANEL INDICATOR RESOLVES TO NOTHING DRAWABLE, ON PURPOSE. It is a real
  // indicator and the registry knows what it is; it simply cannot share the
  // price axis. `indicatorRefusalFor` is what turns that into a sentence.
  if (indicatorRefusal(spec)) return null;

  // The ones `computeKeyLevels` already priced — the four averages the alert
  // engine uses, and the session VWAP with its anchor. Preferred because they
  // carry the provenance string naming the bars they came from.
  const known = computedIndicators(ctx).get(k);
  if (known && known.spec.indicator === spec.indicator && (spec.period === null || known.spec.period === spec.period)) {
    return known;
  }

  /**
   * EVERYTHING ELSE IS COMPUTED HERE, FROM STORED BARS.
   *
   * A 9-day average, a Bollinger band, the Trend Clouds: all of them are
   * arithmetic over closes that are already in `ctx.dailyBars`, so refusing them
   * would be refusing to do a sum rather than refusing to invent a number. The
   * anti-invention rule is about prices nobody stored, and every close here was
   * stored. It runs the SAME `computeIndicatorSeries` the chart page runs and
   * takes its last point, so the label can never disagree with the line.
   */
  const bars = (ctx.dailyBars ?? []).filter(
    (b): b is typeof b & { o: number; h: number; l: number; c: number } =>
      typeof b.o === 'number' && typeof b.h === 'number' && typeof b.l === 'number' && typeof b.c === 'number'
  );
  if (!bars.length) return null;
  // A session VWAP needs volume-stamped intraday bars. If `computeIntradayLevels`
  // could not build one there is no session to average over, and that is a real
  // answer rather than a gap to paper over with daily bars.
  if (spec.indicator === 'vwap') return null;

  const now = computeIndicatorNow(bars, spec);
  if (!now) return null;
  const entry = INDICATORS[spec.indicator];
  const primary = entry.outputs[0];
  const value = now[primary];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const full = withDefaults(spec);
  const label = indicatorLabel(full);
  const outputs: Record<string, number | null> = {};
  for (const o of entry.outputs) outputs[o] = typeof now[o] === 'number' ? r2(now[o] as number) : null;

  const edges = entry.band
    ? ` The band runs from $${outputs.lower ?? '—'} to $${outputs.upper ?? '—'} on the newest bar and moves with every one before it.`
    : '';
  return {
    spec: full,
    key: indicatorKey(full),
    label,
    price: r2(value),
    outputs,
    reason: `${label} is at $${r2(value)} right now. It is ${indicatorPlain(full)}, so it is drawn as a line across the chart rather than as a level.${edges}`,
    provenance: `${label} computed from ${bars.length} stored daily bars for ${ctx.symbol}.`,
    anchorTs: null,
  };
}

/**
 * The curves that resolve on this chart right now.
 *
 * REGISTRY-DRIVEN, so an indicator added to `INDICATORS` is offered to Kai the
 * moment it is added. This used to be a hand-written list of five strings, which
 * meant every new indicator needed a second edit here that nothing would have
 * caught if it were forgotten — the chart would simply have been able to draw
 * something Kai was never told about.
 */
export function availableIndicators(ctx: ChartContext): string[] {
  const out: string[] = [];
  for (const id of DRAWABLE_INDICATORS) {
    const entry = INDICATORS[id];
    // The periods worth advertising: the alert engine's four averages for
    // `ema`, and the registry default for everything else. Kai may still name
    // any other period and it is computed on demand.
    const periods = id === 'ema' ? [8, 21, 50, 200] : [entry.params.period?.default ?? null];
    for (const p of periods) {
      const key = indicatorKey({ indicator: id, period: p, mult: null });
      if (resolveIndicator(ctx, key)) out.push(key);
    }
  }
  return out;
}

/** What Kai must be told he CANNOT draw, so he offers a sentence instead of a line. */
export function refusedIndicators(): { name: string; why: string }[] {
  return (Object.keys(INDICATORS) as (keyof typeof INDICATORS)[])
    .map((id) => INDICATORS[id])
    .filter((e) => e.surface === 'panel')
    .map((e) => ({ name: e.aliases[0], why: e.refusal ?? '' }));
}

/**
 * Resolve one named level against the real objects. Returns null when nothing
 * in the loaded context defines it — which is a refusal, not a failure.
 */
export function resolveLevel(ctx: ChartContext, key: string): Resolved | null {
  const raw = String(key).trim().toLowerCase();
  const k = (LEVEL_ALIAS[raw] ?? raw) as LevelKey;
  const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
  const long = ctx.setup ? isLong(ctx.setup.intent) : true;
  const entry = ctx.plan?.entry ?? setupLevels.entry;
  const stop = ctx.plan?.stop ?? setupLevels.stop;
  const targets = ctx.plan?.targets?.length ? ctx.plan.targets : setupLevels.targets;
  const from = ctx.plan ? 'the plan you saved' : ctx.setup ? `the ${ctx.symbol} setup` : 'the loaded objects';

  switch (k) {
    case 'trigger':
      return entry === null
        ? null
        : {
            price: entry,
            label: 'Trigger',
            kind: 'trigger',
            reason: `This is the level that makes the idea actionable. ${long ? 'Above' : 'Below'} $${entry} it is confirmed.`,
            provenance: `Entry condition on ${from}.`,
          };
    case 'entry':
      return entry === null
        ? null
        : {
            price: entry,
            label: 'Entry',
            kind: 'entry',
            reason: `The entry area from ${from}: $${entry}.`,
            provenance: `Entry condition on ${from}.`,
          };
    case 'stop':
      return stop === null
        ? null
        : {
            price: stop,
            label: 'Stop',
            kind: 'stop',
            reason: `Where you get out if you are wrong, at $${stop}.`,
            provenance: `Stop level on ${from}.`,
          };
    case 'invalidation':
      return stop === null
        ? null
        : {
            price: stop,
            label: 'Invalidation',
            kind: 'invalidation',
            reason: `${long ? 'A close below' : 'A close above'} $${stop} means the reason for the idea is gone, not just that the trade is losing.`,
            provenance: `Invalidation on ${from}.`,
          };
    case 'target':
    case 'target1':
      return targets[0]
        ? {
            price: targets[0].price,
            label: targets[0].label ?? 'First target',
            kind: 'target',
            reason: `The first place the plan takes something off, at $${targets[0].price}.`,
            provenance: `Targets on ${from}.`,
          }
        : null;
    case 'target2':
      return targets[1]
        ? {
            price: targets[1].price,
            label: targets[1].label ?? 'Second target',
            kind: 'target',
            reason: `A later target at $${targets[1].price}.`,
            provenance: `Targets on ${from}.`,
          }
        : null;
    case 'support':
      return ctx.supports[0] !== undefined
        ? {
            price: ctx.supports[0],
            label: 'Support',
            kind: 'support',
            reason: `$${ctx.supports[0]} is the nearest price below where buyers have stepped in before.`,
            provenance: 'Swing lows computed from the stored daily bars.',
          }
        : null;
    case 'resistance':
      return ctx.resistances[0] !== undefined
        ? {
            price: ctx.resistances[0],
            label: 'Resistance',
            kind: 'resistance',
            reason: `$${ctx.resistances[0]} is the nearest price above where sellers have stepped in before.`,
            provenance: 'Swing highs computed from the stored daily bars.',
          }
        : null;
    case 'community':
      return ctx.communityLevel !== null
        ? {
            price: ctx.communityLevel,
            label: 'Community level',
            kind: 'note',
            reason: `Members of the room keep naming $${ctx.communityLevel}. That is a community observation, not my analysis, and it does not change the grade.`,
            provenance: 'Structured ideas posted by members in the room for this symbol.',
          }
        : null;
    default:
      // Not one of the ten that come off an object — try the ones that come off
      // bars. The setup vocabulary is checked FIRST and deliberately: if a
      // graded setup says where the stop is, that is the stop, and an arithmetic
      // level that happens to share a name does not get to overrule it.
      return computedLevels(ctx).get(k) ?? null;
  }
}

/** The names that actually resolve on this chart right now. */
export function availableLevels(ctx: ChartContext): string[] {
  return LEVEL_KEYS.filter((k) => resolveLevel(ctx, k) !== null);
}

/**
 * The DRAWINGS that resolve right now, as the model would have to write them.
 *
 * This is the anti-invention rule applied to shapes. Advertising "you can draw a
 * trendline" on a chart where the algorithm found none is how Kai ends up
 * narrating a line that never appears — the War Room's number-one reported bug,
 * and the reason its prompt grew a tool-claim parity rule. Offering only what
 * exists is the same fix enforced one layer lower down, where the model cannot
 * forget it.
 */
export function availableDrawings(ctx: ChartContext): string[] {
  const arg = (shape: string, level: string) => `{"shape":"${shape}","level":"${level}"}`;
  const out: string[] = [];
  for (const t of ctx.trendlines ?? []) out.push(arg('trendline', t.kind));
  if (ctx.fib) out.push(arg('fib', 'swing'));
  const bars = ctx.dailyBars ?? [];
  if (bars.length) {
    for (const a of ['year_low', 'year_high', 'swing_low', 'swing_high']) {
      const ts = resolveLevel(ctx, a)?.ts;
      if (!ts) continue;
      if (computeAnchoredVwap(bars, ts, a) === null) continue;
      out.push(arg('anchored_vwap', a));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Shapes                                                               */
/* ------------------------------------------------------------------ */

/**
 * A ring, an arrow and a band — the three things a person at a whiteboard draws
 * that a horizontal rule cannot say.
 *
 * ANCHORED, NEVER FREEHAND. A circle's centre is a stored level at a stored bar.
 * An arrow runs from the last stored close to a stored level. A band's two edges
 * are both levels that could have been drawn as lines on their own. So a shape
 * asserts nothing that a `mark_level` would not have asserted already — it just
 * says it in the form the sentence is actually using.
 *
 * They ride `mark_level` rather than getting commands of their own, exactly as
 * they do in the show: it is the command that means "put this annotation on the
 * chart and point at it", and the client's choreography already stages one
 * annotation as a single gesture. A shape is not a new kind of chart action, it
 * is a new kind of thing to draw.
 */
async function markShape(
  ctx: ChartContext,
  shape: string,
  level: string,
  say: (fallback: string) => string
): Promise<ChartCommandFrame | null> {
  const v = level.trim().toLowerCase();
  const base = {
    symbol: ctx.symbol,
    timeframe: ctx.levelTimeframe,
    provenance: 'kai' as const,
    source_alert_id: ctx.alertId,
    source_setup_id: ctx.setup?.id ?? null,
    source_plan_id: ctx.planId,
  };

  if (shape === 'zone') {
    const pair = (LIVE_ZONE_TARGETS as Record<string, readonly string[]>)[v];
    if (!pair) return null;
    const [aName, bName] = pair;
    const a = resolveLevel(ctx, aName);
    const b = resolveLevel(ctx, bName);
    if (!a || !b || !ctx.bars.firstTs || !ctx.bars.lastTs) return null;
    const text = v === 'risk' ? 'At risk' : v === 'reward' ? 'To target' : 'Range';
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'box',
      price: a.price,
      price2: b.price,
      ts_from: ctx.bars.firstTs,
      ts_to: ctx.bars.lastTs,
      text,
      reason: `The band between the ${aName} and the ${bName}. Both edges are stored levels: ${a.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'zone', level: v, price: a.price, price2: b.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`I shaded the band between the ${aName} and the ${bName}.`),
      provenance: `${a.provenance} and ${b.provenance}, over the stored bars.`,
    };
  }

  /**
   * A TRENDLINE THE ALGORITHM FOUND, NOT ONE THE MODEL DESCRIBED.
   *
   * Kai names which trendline — the uptrend, the downtrend, the top of the range
   * — and `findTrendlines` has already decided whether there is one, by walking
   * back through the swing pivots on eighty daily bars. Both ends of what gets
   * drawn are bars that printed. If no line qualified, this returns null and Kai
   * has said nothing about a trendline that is not there, because the prompt
   * only offered him the ones that exist.
   */
  if (shape === 'trendline') {
    const lines = ctx.trendlines ?? [];
    const line = lines.find((t) => t.kind === v) ?? (v === 'trend' || v === 'any' ? lines[0] : undefined);
    if (!line) return null;
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'trendline',
      price: r2(line.fromPrice),
      price2: r2(line.toPrice),
      ts_from: line.fromTs,
      ts_to: line.toTs,
      text: line.label,
      reason: `${line.label}. ${line.from}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: {
        shape: 'trendline',
        level: line.kind,
        price: r2(line.fromPrice),
        price2: r2(line.toPrice),
        from: line.fromTs,
        to: line.toTs,
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
      },
      annotations: [ann],
      narration: say(
        line.broken
          ? `I drew the ${line.kind === 'range' ? 'ceiling' : line.kind} it was following. It broke — the line stops on the bar price closed through it.`
          : line.kind === 'range'
            ? 'That flat ceiling is where it has been turned away twice, and it has not been through it since.'
            : `I drew the ${line.kind === 'uptrend' ? 'rising' : 'falling'} line through the two turns it was actually made of. Nothing has closed through it yet.`
      ),
      provenance: line.from,
    };
  }

  /**
   * A FIB GRID OVER A MEASURED SWING.
   *
   * The one decision a fib needs is which move you are retracing, and it is the
   * decision people get wrong and then argue about. So the model does not make
   * it: the swing is the highest high and the lowest low in the stored window,
   * and the direction is which of the two printed first. Five interior ratios,
   * one grid, one gesture — the two ends are the swing high and the swing low,
   * which are already drawable on their own and are not redrawn here.
   */
  if (shape === 'fib') {
    const grid = ctx.fib ?? null;
    if (!grid || !ctx.bars.lastTs) return null;
    const anns: AnnotationRow[] = [];
    for (const l of grid.levels) {
      const kind: AnnotationKind = l.price < (ctx.bars.lastPrice ?? grid.toPrice) ? 'support' : 'resistance';
      const a = await upsertAnnotation(ctx.userId, {
        ...base,
        kind,
        price: r2(l.price),
        ts_from: grid.toTs,
        text: `Fib ${(l.ratio * 100).toFixed(1)}%`,
        reason: `The ${(l.ratio * 100).toFixed(1)}% retracement of that move, at $${r2(l.price)}. ${grid.from}`,
      });
      if (a) anns.push(a);
    }
    if (!anns.length) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: {
        shape: 'fib',
        level: 'swing',
        direction: grid.direction,
        from: grid.fromTs,
        to: grid.toTs,
        prices: grid.levels.map((l) => r2(l.price)),
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
      },
      annotations: anns,
      narration: say(
        `I measured the ${grid.direction === 'up' ? 'run up' : 'drop'} and laid the retracement levels over it.`
      ),
      provenance: grid.from,
    };
  }

  /**
   * AN ANCHORED VWAP, ANCHORED TO A LEVEL — NEVER TO A DATE.
   *
   * The War Room's version takes `anchor_date` as a string and trusts the model
   * to type a real one. That is the anti-invention rule with a hole in it: a
   * plausible date produces a plausible average, and nothing downstream can tell
   * it from a real one. Here the anchor is the NAME of a level this file has
   * already resolved, and the timestamp comes off the bar that made it. "The
   * VWAP from the year's low" cannot be anchored to a day the low did not happen
   * on, because the low's date is not a parameter.
   *
   * It draws a horizontal at the average's CURRENT value, which is what a person
   * means by the level. It is not the curve, and the label says as much.
   */
  if (shape === 'anchored_vwap' || shape === 'vwap_from') {
    const bars = ctx.dailyBars ?? [];
    const anchor = resolveLevel(ctx, v);
    const anchorTs = anchor?.ts ?? (v === 'trigger' ? ctx.triggerTs : null);
    if (!bars.length || !anchorTs) return null;
    const av = computeAnchoredVwap(bars, anchorTs, v);
    if (!av) return null;
    const kind: AnnotationKind = av.price < (ctx.bars.lastPrice ?? av.price) ? 'support' : 'resistance';
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind,
      price: r2(av.price),
      ts_from: av.anchorTs,
      text: `VWAP from ${v.replace(/_/g, ' ')}`,
      reason:
        `The average price everyone has paid since the ${v.replace(/_/g, ' ')}, $${r2(av.price)}. ` +
        `It is today's value of a line that moves with every new bar, not a fixed shelf. ${av.from}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: {
        shape: 'anchored_vwap',
        level: v,
        price: r2(av.price),
        anchor_ts: av.anchorTs,
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
      },
      annotations: [ann],
      narration: say(`Anchored from the ${v.replace(/_/g, ' ')}, the average paid since then is $${r2(av.price)}.`),
      provenance: av.from,
    };
  }

  const lv = resolveLevel(ctx, v);
  if (!lv) return null;

  if (shape === 'circle') {
    // The bar that made the level matter, falling back to the most recent one —
    // the same rule `zoom_trigger` already uses, so the two never disagree about
    // which candle a level belongs to. A COMPUTED LEVEL BRINGS ITS OWN BAR: the
    // session that printed the previous day's high is a specific candle, and
    // ringing the trigger's candle instead would circle the wrong week.
    const ts = lv.ts ?? ctx.triggerTs ?? ctx.bars.lastTs;
    if (!ts) return null;
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'circle',
      price: lv.price,
      ts_from: ts,
      text: lv.label,
      reason: `Ringing the bar this ${v} comes from. ${lv.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'circle', level: v, price: lv.price, focus_ts: ts, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`This bar — where the ${v} comes from.`),
      provenance: `${lv.provenance} Centred on a stored bar.`,
    };
  }

  if (shape === 'arrow') {
    const from = ctx.bars.lastPrice;
    const ts = ctx.bars.lastTs;
    if (from === null || ts === null) return null;
    // An arrow from a price to itself is a dot, and a dot claiming to be an
    // arrow is worse than no gesture at all.
    if (Math.abs(from - lv.price) < Math.max(0.01, Math.abs(lv.price) * 0.0005)) return null;
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'arrow',
      price: from,
      price2: lv.price,
      ts_from: ts,
      ts_to: ts,
      text: 'To go',
      reason: `How far price still has to travel to the ${v}. ${lv.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'arrow', level: v, price: from, price2: lv.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`That is the distance still to travel to the ${v}.`),
      provenance: `The last stored close and the ${v}. ${lv.provenance}`,
    };
  }

  return null;
}

/**
 * Put a CURVE on the chart.
 *
 * The frame names the average; it does not describe the line. Every point of it
 * is computed on the client from the candles already on screen, which is the
 * whole reason this is not a level: there is no single number to be right or
 * wrong about, and there is nothing to go stale between the server pricing it
 * and the user panning the chart.
 *
 * IT DRAWS EVEN IF IT CANNOT BE SAVED. Every other annotation asserts a number
 * that came from a graded object, so a failed write means the assertion goes
 * unmade and the command is dropped. An overlay asserts arithmetic over bars the
 * client is holding, so a database that is missing the table — or that has not
 * had migration 0036 applied yet — is not a reason to leave the chart blank
 * while Kai says he drew the 21-day. The row goes out unpersisted instead: same
 * curve, gone on reload.
 */
async function markIndicator(
  ctx: ChartContext,
  key: string,
  say: (fallback: string) => string
): Promise<ChartCommandFrame | null> {
  const ind = resolveIndicator(ctx, key);
  if (!ind) return null;

  const draft = {
    symbol: ctx.symbol,
    timeframe: ctx.levelTimeframe,
    kind: 'indicator' as const,
    price: ind.price,
    // The band's edges, so a stored row can still say how wide it was without a
    // second column. Null on a plain line, which is most of them.
    price2: typeof ind.outputs.upper === 'number' ? ind.outputs.upper : null,
    ts_from: ind.anchorTs,
    text: ind.label,
    reason: ind.reason,
    provenance: 'kai' as const,
    source_alert_id: ctx.alertId,
    source_setup_id: ctx.setup?.id ?? null,
    source_plan_id: ctx.planId,
  };
  const ann = (await upsertAnnotation(ctx.userId, draft)) ?? ephemeralAnnotation(draft);

  return {
    type: 'chart_command',
    command: 'mark_level',
    payload: {
      level: ind.key,
      // WHAT THE CLIENT DRAWS FROM. Not a price to rule a line at — the name of
      // the curve and, for a running average, where the running starts.
      indicator: ind.spec.indicator,
      period: ind.spec.period,
      mult: ind.spec.mult ?? null,
      anchor_ts: ind.anchorTs,
      price: ind.price,
      outputs: ind.outputs,
      label: ind.label,
      kind: 'indicator',
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
    },
    annotations: [ann],
    narration: say(
      `I put the ${ind.label} on the chart as a line. It is at $${ind.price} right now, but it moves — ${indicatorPlain(ind.spec)}.`
    ),
    provenance: ind.provenance,
  };
}

/* ------------------------------------------------------------------ */
/* Zones                                                                */
/* ------------------------------------------------------------------ */

/**
 * The zones a chart can shade, each one built from levels that already resolved.
 *
 * THE ANTI-INVENTION RULE, APPLIED TO AN AREA. A zone is two prices and a start
 * bar, and all three have to come from somewhere real or the rectangle is a
 * claim about a region of the chart that nothing supports. So Kai names WHICH
 * zone and this table says which two levels it is made of — every one of them a
 * level `resolveLevel` can already produce on its own. There is no path here
 * that takes a number from the model.
 */
const ZONE_TARGETS: Record<string, { edges: [string, string]; label: string; what: string }> = {
  risk: {
    edges: ['trigger', 'stop'],
    label: 'At risk',
    what: 'Everything between where the idea becomes live and where it stops being true. This is the part of the move you are paying for.',
  },
  reward: {
    edges: ['trigger', 'target'],
    label: 'To target',
    what: 'The stretch between the trigger and the first place the plan takes something off.',
  },
  range: {
    edges: ['support', 'resistance'],
    label: 'The range',
    what: 'The band price has been stuck inside — buyers keep showing up at the bottom of it and sellers at the top.',
  },
  value: {
    edges: ['nearest_support', 'nearest_resistance'],
    label: 'Between the levels',
    what: 'The gap between the closest level below price and the closest one above it. Nothing in here is a decision; the edges are.',
  },
  prior_day: {
    edges: ['prior_day_low', 'prior_day_high'],
    label: "Yesterday's range",
    what: 'Everything the previous session covered. Price leaving it in either direction is the day doing something new.',
  },
  premarket: {
    edges: ['premarket_low', 'premarket_high'],
    label: 'Premarket range',
    what: 'What it did before the bell, on thinner volume than the rest of the day.',
  },
  opening_range: {
    edges: ['open_range_low', 'open_range_high'],
    label: 'Opening range',
    what: 'The first fifteen minutes. A lot of the day gets decided by which side of this it leaves on.',
  },
  session: {
    edges: ['session_low', 'session_high'],
    label: "Today's range",
    what: 'The high and low of the session so far, and everything between them.',
  },
};

/** The zones that can actually be built on this chart right now. */
export function availableZones(ctx: ChartContext): string[] {
  return Object.keys(ZONE_TARGETS).filter((k) => {
    const t = ZONE_TARGETS[k];
    return resolveLevel(ctx, t.edges[0]) !== null && resolveLevel(ctx, t.edges[1]) !== null;
  });
}

/**
 * Shade an area of the chart.
 *
 * IT RUNS TO THE RIGHT EDGE UNLESS TOLD OTHERWISE. A supply zone is not a thing
 * that happened between two dates — it is a shelf that is still there, and a
 * rectangle that stops halfway across the plot says it expired. `ts_to` is left
 * null and the client extends it, which is also what lets the zone stay correct
 * when new bars arrive without anything being rewritten.
 *
 * A ZONE WITH NO HEIGHT IS A LEVEL, AND IS DRAWN AS ONE. Two edges that resolve
 * to the same number — a trigger and an entry that start at the same price, a
 * range on a symbol whose support and resistance deduped into one shelf —
 * produce a rectangle nobody can see, sitting on top of a line that says the
 * same thing. It converts rather than drawing a zero-height box.
 */
async function markZone(
  ctx: ChartContext,
  name: string,
  say: (fallback: string) => string
): Promise<ChartCommandFrame | null> {
  const v = String(name ?? '').trim().toLowerCase();
  const target = ZONE_TARGETS[v] ?? ZONE_TARGETS[LEVEL_ALIAS[v] ?? ''] ?? null;
  if (!target) return null;

  const a = resolveLevel(ctx, target.edges[0]);
  const b = resolveLevel(ctx, target.edges[1]);
  if (!a || !b) return null;

  const top = Math.max(a.price, b.price);
  const bottom = Math.min(a.price, b.price);

  // Zero height, or so close to it that the fill would be a hairline: this is a
  // level wearing a rectangle's clothes. Draw the level.
  if (top - bottom < Math.max(0.01, Math.abs(top) * 0.0005)) {
    return await executeChartCommand(ctx, { command: 'mark_level', args: { level: target.edges[0] } });
  }

  const anchor = a.ts ?? b.ts ?? ctx.triggerTs ?? ctx.bars.firstTs;
  if (!anchor) return null;

  const draft = {
    symbol: ctx.symbol,
    timeframe: ctx.levelTimeframe,
    kind: 'zone' as const,
    price: top,
    price2: bottom,
    ts_from: anchor,
    // Left open on purpose — see the note above.
    ts_to: null,
    text: target.label,
    reason: `${target.what} Its edges are the ${target.edges[0].replace(/_/g, ' ')} at $${a.price} and the ${target.edges[1].replace(/_/g, ' ')} at $${b.price}.`,
    provenance: 'kai' as const,
    source_alert_id: ctx.alertId,
    source_setup_id: ctx.setup?.id ?? null,
    source_plan_id: ctx.planId,
  };
  const ann = (await upsertAnnotation(ctx.userId, draft)) ?? ephemeralAnnotation(draft);

  return {
    type: 'chart_command',
    command: 'mark_zone',
    payload: {
      zone: v,
      price: top,
      price2: bottom,
      from: anchor,
      to: null,
      label: target.label,
      kind: 'zone',
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
    },
    annotations: [ann],
    narration: say(`I shaded ${target.label.toLowerCase()} — $${bottom} up to $${top}. ${target.what}`),
    provenance: `${a.provenance} and ${b.provenance}`,
  };
}

/* ------------------------------------------------------------------ */
/* Patterns                                                             */
/* ------------------------------------------------------------------ */

/**
 * One instance of a pattern, resolved into something with a label on it.
 *
 * `top` and `bottom` are the same number for a swing, because a swing is a band
 * with no height. Keeping one shape means the marking code never has to ask
 * which kind it is holding before it can read a price out of it.
 */
export type ResolvedPatternMatch = {
  label: string;
  kind: 'zone' | 'level';
  top: number;
  bottom: number;
  tsFrom: string;
  tsTo: string | null;
  at: string;
  direction: 'bullish' | 'bearish' | null;
  reason: string;
};

export type ResolvedPattern = {
  id: PatternId;
  kind: 'zone' | 'level';
  /** Singular and plural, for the sentence Kai says about a count. */
  noun: { one: string; many: string };
  cap: number;
  /** How many are actually on this chart, BEFORE the cap. */
  found: number;
  capped: boolean;
  /** Newest first, cut to the cap. */
  matches: ResolvedPatternMatch[];
  provenance: string;
};

/**
 * Find one named pattern on the bars this chart already loaded.
 *
 * DETECTION HAPPENS HERE, ON THE SERVER, AND THAT IS THE WHOLE DESIGN. The model
 * names WHICH pattern; this function goes and finds WHERE they are, in
 * `ctx.dailyBars` — the same candles `loadChartContext` fetched for everything
 * else. That is the anti-invention rule holding in a place it would otherwise
 * leak: a model asked to find gaps would answer with prices, and a price a model
 * wrote is a price nobody can check. Here every edge of every box is a high or a
 * low off a stored bar, and it is also what lets the zones PERSIST — an
 * annotation row can only be written for something the server knows the numbers
 * of.
 *
 * Returns null when nothing was found, which is a real answer and not a failure:
 * a chart with no unfilled gap on it has no unfilled gap on it, and the prompt
 * is built so Kai is never offered one.
 */
export function resolvePattern(ctx: ChartContext, name: string): ResolvedPattern | null {
  const id = parsePattern(name);
  if (!isDrawablePattern(id)) return null;
  const entry = PATTERNS[id];

  const bars: PatternBar[] = (ctx.dailyBars ?? [])
    .filter((b) => typeof b.o === 'number' && typeof b.h === 'number' && typeof b.l === 'number' && typeof b.c === 'number')
    .map((b) => ({ ts: b.ts, o: b.o as number, h: b.h as number, l: b.l as number, c: b.c as number, v: b.v ?? null }));
  // Three bars is the least any of these definitions can be evaluated over, and
  // a pattern found on two bars would be a pattern found on nothing.
  if (bars.length < 3) return null;

  const { matches, found, cap } = findPattern(id, bars);
  if (!matches.length) return null;

  const plain = patternPlain(id);
  return {
    id,
    kind: entry.kind,
    noun: entry.noun,
    cap,
    found,
    capped: found > matches.length,
    matches: matches.map((m) => ({
      label: entry.label(m),
      kind: m.kind,
      top: r2(m.top),
      bottom: r2(m.bottom),
      tsFrom: m.tsFrom,
      tsTo: m.tsTo,
      at: m.at,
      direction: m.direction,
      reason: `${m.why} A ${entry.noun.one} is ${plain}.`,
    })),
    provenance:
      `${found} ${found === 1 ? entry.noun.one : entry.noun.many} found in ${bars.length} stored daily bars for ${ctx.symbol}` +
      `${found > matches.length ? `; the ${matches.length} most recent are drawn` : ''}.`,
  };
}

/**
 * The patterns that actually find something on THIS chart right now.
 *
 * Same rule as `availableIndicators` and `availableZones`, for the same reason:
 * offering "I can mark the gaps" on a chart with no unfilled gap on it is how
 * Kai ends up narrating a box that never appears. A pattern is worse than a
 * level here, because a level either resolves or it does not while a pattern can
 * resolve to an empty list — so the emptiness has to be checked, not assumed.
 */
export function availablePatterns(ctx: ChartContext): string[] {
  return DRAWABLE_PATTERNS.filter((id) => resolvePattern(ctx, id) !== null);
}

/** What Kai must be told he CANNOT find, so he offers a sentence instead of a box. */
export function refusedPatterns(): { name: string; why: string }[] {
  return REFUSED_PATTERNS.map((r) => ({ name: r.aliases[0], why: r.why }));
}

/**
 * Draw every instance of one pattern, up to its cap.
 *
 * ONE ANNOTATION PER INSTANCE, not one row describing a set. Each gap is its own
 * band with its own two edges and its own explanation, so each one has to be
 * something the user can tap and be told about; a single row covering four boxes
 * could only carry one reason, and three of the four would be unexplained.
 *
 * THE CAP IS SAID OUT LOUD WHENEVER IT BITES. "I marked the gaps" over a chart
 * showing four of the eleven that exist is not false enough to notice and not
 * true enough to trade on, which is the worst kind of wrong. So the narration
 * carries both numbers whenever they differ.
 *
 * A SWING IS A SUPPORT OR A RESISTANCE, DECIDED BY WHICH SIDE OF PRICE IT IS ON
 * — the same rule `computedLevels` uses. A swing high under price is acting as
 * support and one above it is acting as resistance, and it is the same turn
 * either way; naming the side rather than the shape is also what lets these rows
 * into the director's table, which only accepts the kinds that name a level.
 *
 * IT DRAWS EVEN IF IT CANNOT BE SAVED, exactly like `markIndicator`. The numbers
 * came off candles the client is already holding, so a database missing the
 * table is not a reason to leave the chart blank while Kai says he marked the
 * gaps. The rows go out unpersisted instead: same boxes, gone on reload.
 */
async function markPattern(
  ctx: ChartContext,
  name: string,
  say: (fallback: string) => string
): Promise<ChartCommandFrame | null> {
  const p = resolvePattern(ctx, name);
  if (!p) return null;

  const base = {
    symbol: ctx.symbol,
    timeframe: ctx.levelTimeframe,
    provenance: 'kai' as const,
    source_alert_id: ctx.alertId,
    source_setup_id: ctx.setup?.id ?? null,
    source_plan_id: ctx.planId,
  };
  const last =
    ctx.bars.lastPrice ??
    (ctx.dailyBars ?? []).reduce<number | null>((acc, b) => (typeof b.c === 'number' ? b.c : acc), null);

  const anns: AnnotationRow[] = [];
  for (const m of p.matches) {
    const draft =
      m.kind === 'zone'
        ? {
            ...base,
            kind: 'zone' as const,
            price: m.top,
            price2: m.bottom,
            ts_from: m.tsFrom,
            // Null on purpose: an unfilled gap is still sitting there, and a box
            // that stops halfway across the plot says it expired.
            ts_to: m.tsTo,
            text: m.label,
            reason: m.reason,
          }
        : {
            ...base,
            kind: (last !== null && m.top < last ? 'support' : 'resistance') as AnnotationKind,
            price: m.top,
            ts_from: m.at,
            text: m.label,
            reason: m.reason,
          };
    anns.push((await upsertAnnotation(ctx.userId, draft)) ?? ephemeralAnnotation(draft));
  }
  if (!anns.length) return null;

  const n = p.matches.length;
  const noun = n === 1 ? p.noun.one : p.noun.many;
  const count = p.capped
    ? `I marked the ${n} most recent ${noun} — there are ${p.found} on this chart.`
    : n === 1
      ? `I marked the one ${noun} on this chart.`
      : `I marked the ${n} ${noun} on this chart.`;

  return {
    type: 'chart_command',
    command: 'mark_pattern',
    payload: {
      pattern: p.id,
      kind: p.kind,
      count: n,
      found: p.found,
      capped: p.capped,
      matches: p.matches.map((m) => ({
        label: m.label,
        price: m.top,
        price2: m.bottom,
        from: m.tsFrom,
        to: m.tsTo,
        at: m.at,
        direction: m.direction,
      })),
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
    },
    annotations: anns,
    narration: say(`${count} A ${p.noun.one} is ${patternPlain(p.id)}.`),
    provenance: p.provenance,
  };
}

/* ------------------------------------------------------------------ */
/* Execution                                                            */
/* ------------------------------------------------------------------ */

/**
 * Turn one model-emitted command into a frame with real numbers and real,
 * persisted annotations. Returns null when nothing could be resolved.
 */
export async function executeChartCommand(
  ctx: ChartContext,
  req: ChartCommandRequest,
  requestId = '-'
): Promise<ChartCommandFrame | null> {
  const args = req.args ?? {};
  const say = (fallback: string) => req.narration?.trim() || fallback;

  try {
    switch (req.command) {
      case 'mark_level': {
        const key = String(args.level ?? args.name ?? args.kind ?? 'trigger');
        // A shape rides this command; see `markShape`. Everything below is the
        // horizontal rule that `mark_level` has always drawn.
        const shape = typeof args.shape === 'string' ? args.shape.trim().toLowerCase() : null;
        if (shape) return await markShape(ctx, shape, key, say);

        /**
         * THE CURVE GATE, AND IT IS THE FIRST THING THAT HAPPENS.
         *
         * `mark_level` is the one command every path funnels through — the chat
         * block, the director's `[MARK:]` cues, the show's resolver — so this is
         * the single place where "the user asked for the 21-day" turns into
         * something drawn. Putting the check here rather than at each caller is
         * what makes it impossible to reach the horizontal-rule path with the
         * name of an average.
         */
        const curve = resolveIndicator(ctx, key);
        if (curve) return await markIndicator(ctx, key, say);

        /**
         * ASKED FOR SOMETHING THAT CANNOT GO ON A PRICE AXIS.
         *
         * This is the one command that answers with WORDS and no drawing. RSI on
         * a price chart is either a flat line down near zero or a rescaled
         * invention, and both are worse than saying plainly why it needs its own
         * panel. The frame carries no annotation, so nothing is drawn and Kai
         * says the registry's sentence.
         */
        const refusal = indicatorRefusalFor(key);
        if (refusal) {
          return {
            type: 'chart_command',
            command: 'mark_level',
            payload: { level: key, refused: true, symbol: ctx.symbol, timeframe: ctx.timeframe },
            annotations: [],
            narration: say(refusal),
            provenance: 'Nothing was drawn — this indicator does not share the price axis.',
          };
        }

        const r = resolveLevel(ctx, key);
        if (!r) return null;
        /**
         * DEFENCE IN DEPTH. Nothing upstream produces an indicator-labelled
         * level any more — `computedLevels` skips them and the support and
         * resistance lists exclude them. But a graded setup can be titled
         * anything, a plan leg can be labelled by hand, and a stored row written
         * by an older build is still a row. If what came back is NAMED like an
         * average, it is drawn like one, whatever the level table thought.
         */
        if (looksLikeIndicator(r.label)) {
          const converted = await markIndicator(ctx, r.label, say);
          if (converted) return converted;
        }
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: r.kind,
          price: r.price,
          text: r.label,
          reason: r.reason,
          provenance: 'kai',
          source_alert_id: ctx.alertId,
          source_setup_id: ctx.setup?.id ?? null,
          source_plan_id: ctx.planId,
        });
        return {
          type: 'chart_command',
          command: 'mark_level',
          payload: {
            level: key,
            price: r.price,
            label: r.label,
            kind: r.kind,
            // WHERE THE HAND SHOULD BE. A horizontal line has no time of its
            // own, so without this the cursor falls to the middle column on
            // every mark. A computed level knows the bar it came from, and the
            // client reads `ts` as exactly that hint.
            ts: r.ts ?? null,
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
          },
          annotations: ann ? [ann] : [],
          narration: say(`I marked ${r.label.toLowerCase()} at $${r.price} on the chart. ${r.reason}`),
          provenance: r.provenance,
        };
      }

      case 'mark_zone':
        return await markZone(ctx, String(args.zone ?? args.level ?? args.name ?? ''), say);

      /**
       * OFFER A DIFFERENT SYMBOL. The chart does not move.
       *
       * The one command whose whole point is that it changes nothing: it puts a
       * card in the reply and waits. Two rules make it safe. The SYMBOL IS
       * VALIDATED as a ticker rather than taken as prose, so a sentence cannot
       * become a navigation; and offering the symbol already on screen is
       * refused, because a card saying "view the chart you are looking at" is
       * the assistant not knowing where it is.
       */
      case 'show_symbol': {
        const raw = String(args.symbol ?? args.ticker ?? args.name ?? '').trim().toUpperCase();
        if (!/^[A-Z][A-Z.\-]{0,11}$/.test(raw)) return null;
        if (raw === ctx.symbol.toUpperCase()) return null;
        return {
          type: 'chart_command',
          command: 'show_symbol',
          payload: {
            symbol: raw,
            // A hook, when the model gave one. Never a price — this command has
            // resolved nothing off any bar and must not look as though it has.
            hook: typeof args.hook === 'string' ? args.hook.slice(0, 120) : null,
            from: ctx.symbol,
            proposal: true,
          },
          annotations: [],
          narration: say(`If you want ${raw} on the chart, it is one tap — I have put it in the reply.`),
          provenance: `An offer to open ${raw}. Nothing changed on the ${ctx.symbol} chart.`,
        };
      }

      case 'mark_pattern': {
        const key = String(args.pattern ?? args.name ?? args.level ?? '');
        const found = await markPattern(ctx, key, say);
        if (found) return found;

        /**
         * NAMED SOMETHING REAL THAT I CANNOT FIND HONESTLY.
         *
         * The same answer the RSI gets one case up, for the same reason. An
         * order block is a real thing traders talk about and a reasonable thing
         * to ask for; what it is not is something this codebase can measure,
         * because deciding which candle counts is a judgement. A box I guessed
         * looks exactly like a box I measured once it is on the screen, so the
         * frame carries no annotation and Kai says the registry's sentence.
         *
         * A pattern that IS supported but found nothing falls through to null
         * instead, and draws nothing without an apology — there being no
         * unfilled gap on this chart is not a limitation to explain.
         */
        const refusal = patternRefusal(key);
        if (refusal) {
          return {
            type: 'chart_command',
            command: 'mark_pattern',
            payload: { pattern: key, refused: true, symbol: ctx.symbol, timeframe: ctx.timeframe },
            annotations: [],
            narration: say(refusal),
            provenance: 'Nothing was drawn — I have no way to find this one from the bars.',
          };
        }
        return null;
      }

      case 'mark_plan': {
        const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
        const entry = ctx.plan?.entry ?? setupLevels.entry;
        const stop = ctx.plan?.stop ?? setupLevels.stop;
        const targets = ctx.plan?.targets?.length ? ctx.plan.targets : setupLevels.targets;
        if (entry === null && stop === null && targets.length === 0) return null;
        const anns = await markPlanLevels({
          userId: ctx.userId,
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          entry,
          stop,
          invalidation: stop,
          targets,
          long: ctx.setup ? isLong(ctx.setup.intent) : true,
          sourceAlertId: ctx.alertId,
          sourceSetupId: ctx.setup?.id ?? null,
          sourcePlanId: ctx.planId,
          triggerTs: ctx.triggerTs,
        });
        return {
          type: 'chart_command',
          command: 'mark_plan',
          payload: { entry, stop, targets: targets.map((t) => t.price), symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: anns,
          narration: say(
            `I put the whole plan on the chart: entry ${entry === null ? 'not set' : `$${entry}`}, stop ${stop === null ? 'not set' : `$${stop}`}${targets[0] ? `, first target $${targets[0].price}` : ''}.`
          ),
          provenance: ctx.plan ? 'The plan you saved.' : `The ${ctx.symbol} setup.`,
        };
      }

      case 'show_invalidation': {
        const r = resolveLevel(ctx, 'invalidation');
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: 'invalidation',
          price: r.price,
          text: 'Invalidation',
          reason: r.reason,
          provenance: 'kai',
          source_alert_id: ctx.alertId,
          source_setup_id: ctx.setup?.id ?? null,
        });
        return {
          type: 'chart_command',
          command: 'show_invalidation',
          payload: { price: r.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: ann ? [ann] : [],
          narration: say(`What kills this is $${r.price}. ${r.reason}`),
          provenance: r.provenance,
        };
      }

      case 'set_timeframe': {
        const raw = String(args.timeframe ?? args.tf ?? '').trim();
        const tf = TIMEFRAME_ALIAS[raw] ?? raw;
        if (!tf || !TIMEFRAMES.includes(tf as (typeof TIMEFRAMES)[number])) return null;
        return {
          type: 'chart_command',
          command: 'set_timeframe',
          payload: { timeframe: tf, symbol: ctx.symbol },
          annotations: [],
          narration: say(`Switched the chart to the ${tf === '1d' ? 'daily' : tf} view.`),
          provenance: 'A view change only — no levels moved.',
        };
      }

      case 'zoom_trigger': {
        // NAMED, NOT ALWAYS THE TRIGGER. It is called `zoom_trigger` because the
        // trigger is what it was first asked to frame, but "take me to the
        // resistance" is the same camera move over a different level — and
        // ignoring `args.level`, as this did, silently flew to the trigger while
        // Kai was talking about something else. The default is unchanged, so
        // every existing caller behaves exactly as it did.
        const key = typeof args.level === 'string' && args.level.trim() ? args.level : 'trigger';
        // A CURVE IS STILL SOMEWHERE THE CAMERA CAN GO. "Take me to the 200-day"
        // is a request to frame a price, and the average has one; it is only the
        // DRAWING of it that must not be a rule. Losing the camera move as a
        // side effect of fixing the line would be a worse chart, not a better one.
        const curve = resolveIndicator(ctx, key);
        const r: Resolved | null = resolveLevel(ctx, key) ?? (curve
          ? {
              price: curve.price,
              label: curve.label,
              kind: 'indicator',
              reason: curve.reason,
              provenance: curve.provenance,
              ts: curve.anchorTs,
            }
          : null);
        // THE CANDLE THE LEVEL COMES FROM, when it has one. The trigger's is on
        // the alert; a computed level's is the bar that printed it. Everything
        // else — an average, a plan's stop — is framed by price alone, which is
        // a real number either way.
        const ts = r ? (r.ts ?? (key === 'trigger' || key === 'entry' ? ctx.triggerTs : null)) : null;
        if (!ts && !r) return null;
        return {
          type: 'chart_command',
          command: 'zoom_trigger',
          payload: { level: key, focus_ts: ts, price: r?.price ?? null, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say(
            !ts
              ? `I centred the chart on the ${String(r?.label ?? key).toLowerCase()}.`
              : key === 'trigger' || key === 'entry'
                ? 'I zoomed the chart to the candle where this triggered.'
                : `I took the chart to the bar the ${String(r?.label ?? key).toLowerCase()} came from.`
          ),
          provenance:
            ts && (key === 'trigger' || key === 'entry')
              ? 'The trigger timestamp on the alert.'
              : (r?.provenance ?? 'The setup entry condition.'),
        };
      }

      case 'compare_prior': {
        if (!ctx.priorSession) return null;
        return {
          type: 'chart_command',
          command: 'compare_prior',
          payload: { range: ctx.priorSession, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say('I put the prior session beside this one so you can see what changed.'),
          provenance: 'Stored daily bars for the previous trading day.',
        };
      }

      case 'highlight_community': {
        const r = resolveLevel(ctx, 'community');
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: 'note',
          price: r.price,
          text: 'Community level',
          reason: r.reason,
          provenance: 'community',
          source_alert_id: ctx.alertId,
        });
        return {
          type: 'chart_command',
          command: 'highlight_community',
          payload: { price: r.price, symbol: ctx.symbol, timeframe: ctx.timeframe, label: 'community' },
          annotations: ann ? [ann] : [],
          narration: say(`The room keeps naming $${r.price}. That is what members are saying, not my analysis.`),
          provenance: r.provenance,
        };
      }

      case 'annotation_remove': {
        const id = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        if (!id) return null;
        const row = await patchAnnotation(ctx.userId, id, {
          status: args.hide === true ? 'hidden' : 'deleted',
        }).catch(() => null);
        if (!row) return null;
        return {
          type: 'chart_command',
          command: 'annotation_remove',
          payload: { annotation_id: id, status: row.status },
          annotations: [row],
          narration: say(row.status === 'hidden' ? 'I hid that mark. It is still there if you want it back.' : 'I removed that mark.'),
          provenance: 'Your own chart marks.',
        };
      }

      case 'annotation_explain': {
        const id = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        const list = await listAnnotations({ userId: ctx.userId, symbol: ctx.symbol, includeHidden: true });
        const found: AnnotationRow | undefined = id
          ? list.annotations.find((a) => a.id === id)
          : list.annotations.find((a) => a.kind === String(args.kind));
        if (!found) return null;
        return {
          type: 'chart_command',
          command: 'annotation_explain',
          payload: { annotation_id: found.id, kind: found.kind, price: found.price },
          annotations: [found],
          narration: say(found.reason ?? `That mark is the ${found.kind} at $${found.price}.`),
          provenance: found.provenance === 'kai' ? 'A mark I placed, with the reason it was placed.' : 'A mark you placed.',
        };
      }

      case 'alert_from_level': {
        const key = String(args.level ?? 'trigger');
        // "Tell me when it touches the 50-day" is a real request, and the alert
        // is armed at today's value of it — which is what the user means and
        // what the confirmation screen will show them before they arm it.
        const curve = resolveIndicator(ctx, key);
        const r = resolveLevel(ctx, key) ?? (curve ? { price: curve.price, provenance: curve.provenance } : null);
        if (!r) return null;
        // A PROPOSAL. Kai does not create the alert — the client posts it to the
        // real endpoint and the normal confirmation applies (spec §8).
        return {
          type: 'chart_command',
          command: 'alert_from_level',
          payload: {
            symbol: ctx.symbol,
            price: r.price,
            natural_language: `Tell me when ${ctx.symbol} reaches ${r.price}`,
            route: '/alert/new',
            proposal: true,
          },
          annotations: [],
          narration: say(`I have written the watch for $${r.price}. Tap it and it is armed — I do not arm it myself.`),
          provenance: r.provenance,
        };
      }

      case 'prepare_trade': {
        const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
        const entry = ctx.plan?.entry ?? setupLevels.entry;
        const stop = ctx.plan?.stop ?? setupLevels.stop;
        if (entry === null || stop === null) return null;
        return {
          type: 'chart_command',
          command: 'prepare_trade',
          payload: {
            symbol: ctx.symbol,
            plan_id: ctx.planId,
            entry,
            stop,
            route: ctx.planId
              ? `/order/new?symbol=${ctx.symbol}&plan=${ctx.planId}`
              : `/plan/new?symbol=${ctx.symbol}${ctx.setup ? `&setup=${ctx.setup.id}` : ''}`,
            proposal: true,
          },
          annotations: [],
          narration: say(
            'I have the ticket ready from the plan. Preparing it is not placing it — you confirm the order yourself.'
          ),
          provenance: ctx.plan ? 'The plan you saved.' : `The ${ctx.symbol} setup.`,
        };
      }

      /* ---------------- chart commands v2 (LIVE-1) ---------------- */
      //
      // Camera commands. The determinism rule applies to them exactly as it
      // does to levels, with one difference worth being explicit about: a
      // camera move carries no PRICE, so what has to be real is the TIME. A
      // `zoom_range` over invented timestamps would frame a stretch of chart
      // that means nothing, so both ends come from a loaded object or the
      // command is dropped.

      case 'zoom_range': {
        const from = typeof args.from === 'string' ? args.from : ctx.priorSession?.from ?? null;
        const to = typeof args.to === 'string' ? args.to : ctx.priorSession?.to ?? null;
        if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
        return {
          type: 'chart_command',
          command: 'zoom_range',
          payload: {
            from,
            to,
            padding: typeof args.padding === 'number' ? args.padding : 0.12,
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
          },
          annotations: [],
          narration: say('I framed the stretch of chart this is about.'),
          provenance: typeof args.from === 'string' ? 'A window on the setup being discussed.' : 'The prior session, from stored bars.',
        };
      }

      case 'scroll_bars': {
        const bars = Number(args.bars);
        if (!Number.isFinite(bars) || bars === 0) return null;
        const n = Math.max(-2000, Math.min(2000, Math.round(bars)));
        return {
          type: 'chart_command',
          command: 'scroll_bars',
          payload: { bars: n, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say(n < 0 ? 'I scrolled back to show you more history.' : 'I scrolled forward.'),
          provenance: 'A view change only — no levels moved.',
        };
      }

      case 'scroll_to_now':
        return {
          type: 'chart_command',
          command: 'scroll_to_now',
          payload: { symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say('Back to the live edge.'),
          provenance: 'A view change only — no levels moved.',
        };

      case 'flash_annotation': {
        // Pulses something ALREADY on the chart, so the id has to exist. An
        // unresolvable id is dropped rather than flashed at nothing.
        const fid = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        const known = await listAnnotations({ userId: ctx.userId, symbol: ctx.symbol, includeHidden: false });
        const target: AnnotationRow | undefined = fid
          ? known.annotations.find((a) => a.id === fid)
          : known.annotations.find((a) => a.kind === String(args.kind ?? args.level ?? ''));
        if (!target) return null;
        return {
          type: 'chart_command',
          command: 'flash_annotation',
          payload: {
            annotation_id: target.id,
            pulses: Math.max(1, Math.min(6, Number(args.pulses) || 2)),
            symbol: ctx.symbol,
          },
          annotations: [target],
          narration: say(`This one — the ${target.kind} at $${target.price}.`),
          provenance: target.provenance === 'kai' ? 'A mark I placed.' : 'A mark already on your chart.',
        };
      }

      case 'pointer_hint': {
        // The only command that changes nothing at all. It exists so Kai can
        // point at where something is ABOUT to happen while still narrating —
        // attention first, then the mark.
        const rail = typeof args.rail === 'string' ? (TIMEFRAME_ALIAS[args.rail] ?? args.rail) : null;
        const key = typeof args.level === 'string' ? args.level : null;
        // Pointing at an average points at where it is NOW, which is where the
        // curve meets the right-hand edge — the only place on a moving line that
        // a single price is true.
        const curve = key ? resolveIndicator(ctx, key) : null;
        const r = (key ? resolveLevel(ctx, key) : null) ?? (curve ? { price: curve.price, provenance: curve.provenance } : null);
        const ts = typeof args.ts === 'string' ? args.ts : ctx.triggerTs;
        if (!rail && !r && !ts) return null;
        return {
          type: 'chart_command',
          command: 'pointer_hint',
          payload: {
            price: r?.price ?? null,
            ts: r ? null : ts,
            rail: rail && TIMEFRAMES.includes(rail as (typeof TIMEFRAMES)[number]) ? rail : null,
            linger: args.linger === true,
            symbol: ctx.symbol,
          },
          annotations: [],
          narration: say('Watch here.'),
          provenance: r ? r.provenance : 'A place on the chart, not a number.',
        };
      }

      default:
        return null;
    }
  } catch (e) {
    log('warn', requestId, 'chart_command.failed', {
      command: req.command,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The prompt block                                                     */
/* ------------------------------------------------------------------ */

/**
 * Appended to the system prompt whenever the conversation is attached to a
 * chart. It lists the commands, insists on symbolic level names, and says out
 * loud that a number in `args` will be ignored — because the fastest way to get
 * a model to stop guessing prices is to tell it the guess will be thrown away.
 */
export function chartCommandProtocol(ctx: {
  symbol: string;
  timeframe: string;
  available: string[];
  /** What the user has drawn on this chart by hand. Theirs, never yours. */
  userMarks?: { what: string; price: number | null; price2: number | null; when: string | null }[];
  /** The drawings that resolve right now: `trendline:uptrend`, `fib`, and so on. */
  drawings?: string[];
  /** The CURVES that resolve right now: `ema21`, `bollinger20`. Drawn as lines, never as levels. */
  indicators?: string[];
  /** The AREAS that can be shaded right now: `range`, `risk`. */
  zones?: string[];
  /** The PATTERNS that actually find something on these bars: `fvg`, `swing_high`. */
  patterns?: string[];
}): string {
  const drawings = ctx.drawings ?? [];
  const indicators = ctx.indicators ?? [];
  const zones = ctx.zones ?? [];
  const patterns = ctx.patterns ?? [];
  const refusals = refusedIndicators();
  const patternRefusals = refusedPatterns();
  return `CHART CONTROL

You are talking to the user underneath a live ${ctx.symbol} chart on the
${ctx.timeframe} timeframe. When they ask you to change the chart — mark a level,
switch timeframe, show what invalidates the setup, zoom to the trigger, compare
with the prior session, highlight the community level, remove or explain a mark,
turn a level into a watch, or prepare the trade — emit ONE fenced block:

\`\`\`chart_command
{ "command": "mark_level", "args": { "level": "trigger" }, "narration": "I marked the trigger at the level the setup is built on." }
\`\`\`

Rules, and they are strict:
- NEVER put a price in args. ${
    ctx.available.length
      ? `Name the level. THESE ARE THE ONES THIS CHART ACTUALLY HAS: ${ctx.available.join(', ')} — naming any other draws nothing.`
      : 'No named level resolves on this chart right now, so nothing can be marked on it. Say so rather than naming one.'
  } The server
  looks the number up in the setup, the plan or the room and draws it. A number
  you write is discarded, and a level that is not in the data is not drawn at all.
- A LEVEL IS A PRICE THAT STAYS PUT. Everything in that list is a shelf: a price
  something happened at and that is still sitting where it happened — support,
  resistance, the entry, the stop, the target, the previous session's high and
  low, the opening range, a round number. A horizontal line is what those look
  like, and horizontal lines are reserved for them.
- AN INDICATOR IS NOT ONE OF THOSE AND YOU DO NOT MARK IT AS A LEVEL. ${
    indicators.length
      ? `These are CURVES and this chart has them: ${indicators.join(', ')}. Name one exactly as you would name a level — \`{"command":"mark_level","args":{"level":"ema21"}}\` — and the chart draws the whole line, correct on every bar. You may also name any other period (\`ema9\`, \`sma20\`, \`bollinger50\`) and it is computed from the stored bars.`
      : 'No indicator can be priced on this chart right now, so do not offer to draw one.'
  }
  Do not describe an average as a level, do not say it "is at" a price as though
  that price were a shelf, and never ask for it any other way — a moving average
  drawn as a horizontal rule is wrong about the one thing that makes it a moving
  average, and a chart carrying five of them is unreadable.
- BANDS ARE ONE MARK, NOT TWO. Bollinger Bands and the CheatCode Trend Clouds
  each draw their whole band — both edges and the middle — from a single
  \`mark_level\`. Never ask for the edges separately.
- NEVER SAY "SUPERTREND". The indicator is CheatCode Trend Clouds, always.
- SOME INDICATORS CANNOT GO ON A PRICE CHART AT ALL${
    refusals.length
      ? `: ${refusals.map((r) => r.name).join(', ')}. They are measured on their own scale, not in dollars, so there is no honest way to draw them over candles. Asking for one draws nothing and says why — which is the right answer. Offer to tell the user what it READS instead of offering to draw it.`
      : '.'
  }
- ZONES SHADE AN AREA, not a price.${
    zones.length
      ? ` \`{"command":"mark_zone","args":{"zone":"range"}}\`. THIS CHART HAS: ${zones.join(', ')} — naming any other shades nothing. Each one's edges are levels from the list above, so a zone never asserts anything a line could not.`
      : ' No zone resolves on this chart right now, so do not offer to shade one.'
  }
- A PATTERN IS A SET, AND THE SERVER FINDS IT — you only name which one.${
    patterns.length
      ? ` \`{"command":"mark_pattern","args":{"pattern":"fvg"}}\`. THIS CHART HAS: ${patterns.join(', ')} — naming any other draws nothing.
  Every instance is measured off bars that printed, so you never write where one
  is. EACH ONE IS CAPPED: only the most recent few are drawn, and you MUST say
  the cap out loud when it bites — "I marked the four most recent gaps, there are
  eleven" — because a chart showing four of eleven while you say "the gaps" is
  not false enough to notice and not true enough to trade on.`
      : ' No pattern finds anything on this chart right now, so do not offer to mark one.'
  }${
    patternRefusals.length
      ? `
- SOME PATTERNS I HAVE NO HONEST WAY TO FIND: ${patternRefusals.map((r) => r.name).join(', ')}.
  Finding one takes a judgement, and a box that was guessed looks exactly like a
  box that was measured. Asking for one draws nothing and says why. Offer the
  gaps and the swing highs and lows instead — those can be pointed at bars.`
      : ''
  }
- One command per reply. Say your sentence in the text BEFORE the block — the
  chart changing without you saying what changed is not acceptable.
- commands: mark_level · mark_zone (args.zone) · mark_pattern (args.pattern) · set_timeframe (args.timeframe
  one of 1m, 5m, 15m, 1h, 4h, 1d) · show_invalidation · mark_plan · zoom_trigger · compare_prior ·
  highlight_community · annotation_remove (args.annotation_id) ·
  annotation_explain (args.annotation_id) · alert_from_level · prepare_trade
- camera commands, for looking rather than marking: zoom_range (args.from,
  args.to — real timestamps from the objects you were given, never invented) ·
  scroll_bars (args.bars, negative goes back) · scroll_to_now ·
  zoom_trigger (args.level — takes the camera to the BAR a level came from, for
  any level above, not only the trigger) · flash_annotation
  (args.annotation_id — pulses a mark that is ALREADY drawn) · pointer_hint
  (args.level or args.ts or args.rail — points, changes nothing).
  Use them when the thing you are describing is off screen. Describing a level
  the user cannot see is the same mistake as inventing one.
- shapes ride mark_level with args.shape: circle (rings the bar a level came
  from) · arrow (from the last close to a level) · zone (risk, reward, range)${
    drawings.length
      ? ` ·
  ${drawings.join(' · ')}.
  THESE ARE THE DRAWINGS THIS CHART ACTUALLY HAS RIGHT NOW — a shape not on that
  list draws nothing, exactly like a level that is not in the data. A trendline
  is offered only when the algorithm found one through two real turning points;
  a fib grid only when there is a measured swing to retrace.`
      : `.
  No trendline, fib grid or anchored average resolves on this chart right now,
  so do not offer to draw one.`
  }
- IF THE ANSWER IS ABOUT A DIFFERENT SYMBOL, OFFER IT:
  \`{"command":"show_symbol","args":{"symbol":"AMKR","hook":"the one you asked about"}}\`.
  Use it when the user asks about a ticker that is NOT ${ctx.symbol} — a card
  appears in your reply and one tap puts that chart up. It changes nothing by
  itself, so say "if you want it on the chart" rather than "here it is". Never
  offer ${ctx.symbol}; it is already on screen. Answer the question in words
  either way — the card is how they SEE it, not a substitute for telling them.
- alert_from_level and prepare_trade PROPOSE. They do not arm a watch and they
  do not place an order. Say so.
- Community levels are labelled as the room's opinion, never as your analysis.
${
  (ctx.userMarks ?? []).length
    ? `- THE USER HAS DRAWN ON THIS CHART, and these are theirs, not yours:
  ${(ctx.userMarks ?? []).map((m) => `${m.what}${m.price == null ? '' : ` at $${m.price}`}${m.price2 == null ? '' : ` to $${m.price2}`}${m.when ? ` from ${m.when}` : ''}`).join('; ')}.
  Talk about them as THEIR marks — "your trendline", "the level you drew". You
  may say what price is doing relative to one and you may disagree with it, but
  never present one as something you measured. They are not graded and they are
  not evidence for a setup.`
    : '- The user has drawn nothing on this chart yet.'
}

IF YOU SAY IT, YOU DRAW IT — AND IF YOU CANNOT DRAW IT, DO NOT SAY IT.
This is the one failure that makes the whole feature look broken: you say "I
drew the trendline" or "I marked the previous day's high", the level was not in
the list above, the command is dropped, and the user hears you do something
while the chart sits still. It is worse than saying nothing, because it reads as
the chart being broken rather than as you being careful. So: every drawing verb
in your sentence must correspond to a command in this reply, naming something
from the lists above. If it is not on a list, drop the verb — describe what
price has done instead.`;
}

/**
 * The one tool that answers instead of describing (LIVE-8).
 *
 * A `chart_command` is a single action the user asked for: "mark the trigger",
 * "switch to the hourly". `answer_on_chart` is a different thing entirely — the
 * user asked a QUESTION, and the reply is Kai working the chart while he talks:
 * camera moves, the level he is naming marked as he names it, the candle he is
 * pointing at ringed. The whole answer is directed and timed server-side by the
 * same director the live show runs.
 *
 * WHY THE MODEL ONLY WRITES PROSE INTO IT. Placing the markers is a second job,
 * and a model concentrating on prose does that one badly — measured across the
 * show's build, markers written inline came out sparse and evenly spread, and
 * instructions to write more of them moved the count without ever moving the
 * judgement. So the model writes what Kai says and nothing else. It is also the
 * anti-invention rule doing its work one more time: a writer that never places a
 * marker never writes `[MARK:resistance:625.66]`, and a price that is never
 * written cannot be wrong.
 */
export function chartAnswerProtocol(ctx: {
  symbol: string;
  timeframe: string;
  available: string[];
  /** The curves this chart can draw. Named in prose exactly like a level. */
  indicators?: string[];
  /** The areas it can shade. The director's `[ZONE:…]` may name these. */
  zones?: string[];
  /** The patterns that find something on these bars right now. */
  patterns?: string[];
}): string {
  const indicators = ctx.indicators ?? [];
  const zones = ctx.zones ?? [];
  const patterns = ctx.patterns ?? [];
  const refusals = refusedIndicators();
  const patternRefusals = refusedPatterns();
  return `ANSWERING ON THE CHART

When the user asks a QUESTION about this ${ctx.symbol} chart — why the grade is
what it is, what would change it, where the risk is, what happened at some point
on it, what you make of it — do not reply with a paragraph. Answer ON the chart:

\`\`\`answer_on_chart
{ "answer": "Two things hold it back. It has not cleared the resistance, and it is still a long way under the trigger, so the entry is not live yet. The stop is where the idea stops being true." }
\`\`\`

The server directs that prose: it moves the camera, marks the levels you named as
you name them, rings the candle and paces every gesture to the word it belongs
to. You write the words. That is the whole job.

Rules:
- NEVER write a price, and NEVER write a marker like [MARK:trigger]. Name levels
  in plain English. ${
    ctx.available.length
      ? `THIS CHART HAS: ${ctx.available.join(', ')}. Those are the words that draw something — name any other level and nothing appears.`
      : 'This chart has no named level that resolves right now, so talk about what price has done rather than about levels.'
  } A level you name that is not in the data is simply not
  drawn; nothing is invented to fill it.
- ${
    indicators.length
      ? `INDICATORS ARE DRAWN AS LINES, NOT AS LEVELS, and this chart has ${indicators.join(', ')}. Name one in your sentence — "it is holding above the twenty-one day", "the bands are squeezing" — and the whole curve is laid over the bars. Say that it MOVES; do not talk about it as a price that is sitting somewhere. The indicator is CheatCode Trend Clouds; never say "SuperTrend".`
      : 'This chart cannot price an indicator right now, so do not mention one.'
  }
- ${
    refusals.length
      ? `${refusals.map((r) => r.name.toUpperCase()).join(', ')} CANNOT BE DRAWN over price — they run on their own scale. If one comes up, say what it reads and why it needs its own panel. Do not name it as though it were about to appear on the chart.`
      : ''
  }
- ${
    zones.length
      ? `TALKING ABOUT AN AREA SHADES IT. This chart can shade ${zones.join(', ')} — say "the range it has been stuck in" or "what you are risking" and the region is shaded behind the candles. Use it when the point is a stretch of chart rather than one price.`
      : 'This chart has no shadeable area right now, so describe prices rather than regions.'
  }
- ${
    patterns.length
      ? `PATTERNS ARE FOUND FOR YOU, AND THEY ARE CAPPED. This chart has ${patterns.join(', ')}. Naming one marks the most recent few — never all of them — so if you mention it, say how many you marked and how many there are. Do not say where one is; you were not told, and the server measured every edge off bars that printed.`
      : 'No pattern finds anything on this chart right now, so do not mention gaps or swings as though they were about to appear.'
  }${
    patternRefusals.length
      ? `
- ${patternRefusals.map((r) => r.name.toUpperCase()).join(', ')} CANNOT BE FOUND HONESTLY. If one comes up, say plainly that you would be guessing and offer what you can measure instead. Do not name it as though it were about to appear on the chart.`
      : ''
  }
- Two to four sentences. This is fifteen to thirty seconds of speech, not a
  segment. Say the thing and stop. ASKED TO MARK A SET, NAME EVERY MEMBER OF IT
  THAT THIS CHART HAS — each one you name is drawn, and a level you leave out is
  a level the user asked for and did not get.
- DO THE THING FIRST, OFFER SECOND. Offering to look at another symbol, or to
  mark something else, is good — after you have answered about the chart in
  front of them. Never instead of it.
- Do NOT ask for a different timeframe. They are looking at the ${ctx.timeframe}
  chart and asked about it.
- Put nothing outside the block. The prose inside it IS your reply — it is shown
  to the user as you say it.
- USE IT EVEN WHEN THERE IS NO GRADED SETUP ON THIS SYMBOL. A chart with support
  and resistance on it is a chart you can answer about: those levels came from
  stored bars and are already drawn.
- OPEN WITH THE ANSWER, NOT WITH A DISCLAIMER. Do not begin "I don't have a
  graded setup on this, but..." — the user asked about the chart, not about your
  coverage, and leading with what you lack reads as a refusal even when the
  answer follows it. Mention the missing grade only if they asked for one.

WHICH BLOCK, AND THIS IS NOT A JUDGEMENT CALL:

  ONE named level, and nothing else asked  -> one chart_command block.
      "mark the trigger", "switch to the hourly", "show me the invalidation",
      "clear that line". One instruction, one thing, no question attached.

  SEVERAL levels, or a SET of them, or an
  instruction with a question attached     -> answer_on_chart.
      "mark what is on this chart", "mark the levels", "show me the averages",
      "mark the previous day's high and low", "mark it and tell me what it
      means", "mark the support and resistance".

      One chart_command draws ONE level. Asked to mark six things it would draw
      one and leave the other five undrawn while the words claimed all six —
      which is exactly the complaint that the chart moves and nothing appears.
      answer_on_chart is the block that draws a whole set: the server marks every
      level you name, in the order you name them, paced to the words.

  ANYTHING ELSE THEY ASK       -> answer_on_chart. This is the DEFAULT.
      "why is this only a B?", "what do you make of it?", "what would change
      your mind?", "is this a good entry?", "what happened here?", "walk me
      through it", "what am I looking at?", "should I be worried?"

If you are about to write prose ABOUT this chart, that prose belongs inside an
answer_on_chart block. Plain prose with no block leaves the chart sitting still
while you describe things the user cannot see — you are standing at a chart with
your hands in your pockets. Prose on its own is only right when the question is
not about the chart at all.`;
}

export const CHART_LEVEL_KEYS = LEVEL_KEYS;
