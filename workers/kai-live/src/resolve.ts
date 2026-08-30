/**
 * Markers → chart frames, and the rule that a number nobody can account for
 * never reaches the screen.
 *
 * This is the module the whole lane turns on. The analyzer writes sentences with
 * markers and is structurally unable to write a price; this file looks each
 * marker up against the real objects — the setup's levels, the alert's plan, the
 * swing levels the app computed from real bars, the session timestamps the
 * market bundle returned — persists an annotation for it, and only then emits a
 * `ChartFrame`.
 *
 * A MARKER THAT CANNOT BE TRACED IS DROPPED, AND THE SENTENCE THAT REFERENCED
 * IT IS REWRITTEN WITHOUT IT. Not "left in and unmarked": a sentence that says
 * "watch the stop here" over a chart with no stop on it is worse than one that
 * does not mention a stop, because the audience will assume the line they can
 * see IS the stop. The rewrite is one cheap model call; if that call fails, or
 * the budget has already degraded, the sentence is dropped outright. Saying less
 * is always available. Saying something untraceable is not.
 *
 * WHERE THE ACTIONS LAND IN TIME. Each marker records how far through the line
 * it sat, as a fraction. The director turns that into `t_offset_ms` against the
 * measured audio duration, so the level is drawn under the words that describe
 * it rather than at the end of the sentence. That alignment is most of what
 * separates "Kai is working the chart" from "a chart changed while somebody
 * talked".
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  LIVE_CAM_MOVES,
  LIVE_MARKER_NAMES,
  LIVE_MARK_TARGETS,
  LIVE_SLIDE_NAMES,
  LIVE_ZONE_TARGETS,
  type LiveSlideName,
  parseMarkers,
  stripMarkers,
  type LiveGlossaryTerm,
  type LiveMarker,
} from '../../../packages/shared/live.ts';
import type { ChartCommandName } from '../../../packages/shared/api.ts';
import type { Candidate, MarketBundle, NewAnnotation } from './api.ts';
import { createAnnotations } from './api.ts';
import { config } from './config.ts';
import { directSegment } from './cue.ts';
import { log } from './log.ts';
import { Budget, anthropicCostUsd } from './budget.ts';
import { glossaryFor } from './voice.ts';
import type { SegmentScript, TfAnalysis } from './analyze.ts';

/* ------------------------------------------------------------------ */
/* The level table — the closed vocabulary of real numbers             */
/* ------------------------------------------------------------------ */

export type LevelEntry = {
  name: string;
  price: number;
  kind: 'trigger' | 'entry' | 'stop' | 'invalidation' | 'target' | 'support' | 'resistance';
  reason: string;
  provenance: string;
  ts: string | null;
};

/**
 * Every number this segment is allowed to draw, and where each came from.
 *
 * A watchlist candidate has support and resistance and nothing else — no entry,
 * no stop, no target — because nobody made a plan for it. That asymmetry is the
 * design: the fallback tier keeps the show from going quiet without letting it
 * invent a trade.
 */
export function levelTable(c: Candidate): Map<string, LevelEntry> {
  const t = new Map<string, LevelEntry>();
  const src = c.setup_id ? `setup ${c.setup_id.slice(0, 8)}` : c.alert_id ? `alert ${c.alert_id.slice(0, 8)}` : 'the stored bars';
  const dir = c.long ? 'Above' : 'Below';

  if (c.levels.entry !== null) {
    t.set('trigger', {
      name: 'trigger',
      price: c.levels.entry,
      kind: 'trigger',
      reason: `${dir} this the idea is live; on the other side of it there is nothing to do. From ${src}.`,
      provenance: `${src} entry condition`,
      ts: null,
    });
    t.set('entry', {
      name: 'entry',
      price: c.levels.entry,
      kind: 'entry',
      reason: `The entry area for this plan, taken from the setup's own trigger. From ${src}.`,
      provenance: `${src} entry condition`,
      ts: null,
    });
  }
  if (c.levels.stop !== null) {
    t.set('stop', {
      name: 'stop',
      price: c.levels.stop,
      kind: 'stop',
      reason: `Where the idea is wrong. The plan risks the distance between the trigger and this. From ${src}.`,
      provenance: `${src} invalidation`,
      ts: null,
    });
    t.set('invalidation', {
      name: 'invalidation',
      price: c.levels.stop,
      kind: 'invalidation',
      reason: `${c.long ? 'A close below' : 'A close above'} this means the reason for the idea is gone, not just that it is losing. From ${src}.`,
      provenance: `${src} invalidation`,
      ts: null,
    });
  }
  c.levels.targets.forEach((tg, i) => {
    const key = i === 0 ? 'target' : `target${i + 1}`;
    t.set(key, {
      name: key,
      price: tg.price,
      kind: 'target',
      reason:
        i === 0
          ? `The first place the plan takes something off. From ${src}.`
          : `A later target. Reaching the first one does not mean reaching this one. From ${src}.`,
      provenance: `${src} targets`,
      ts: null,
    });
  });
  const s = c.support[0];
  if (s) t.set('support', { name: 'support', price: s.price, kind: 'support', reason: s.plain, provenance: 'swing levels computed from stored bars', ts: null });
  const r = c.resistance[0];
  if (r) t.set('resistance', { name: 'resistance', price: r.price, kind: 'resistance', reason: r.plain, provenance: 'swing levels computed from stored bars', ts: null });

  return t;
}

/* ------------------------------------------------------------------ */
/* Contradiction — the same semantics as lib/kai/contradiction.ts      */
/* ------------------------------------------------------------------ */

const PRICE_IN_PROSE = /(?<![\w.])(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)(?![\w%])/g;

/**
 * Numbers that are part of a NAME, not a claim about a price.
 *
 * The first four-segment show dropped an entire SPY segment because Kai said
 * "the S and P five hundred" and the scan read `500` as an invented level. The
 * check is doing its job — it just cannot tell a price from an index — so the
 * names are masked before the scan rather than the threshold being loosened,
 * which would have let a real invented level through to buy back one segment.
 */
const NAMED_NUMBERS =
  /\b(s&p|s and p|nasdaq|russell|dow|ftse|dax|nikkei|hang seng|cac|stoxx)\s*\d{1,5}\b/gi;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005 * Math.max(1, Math.abs(b));
}

/**
 * Prices the model wrote as digits that are not backed by a real object.
 *
 * The TTS rules already forbid digits in narration, so anything this finds is
 * both a spoken-form error and, potentially, an invented level. Small integers
 * are ignored — "the last three sessions", "two targets" — because a bare 3 is a
 * count, not a claim about a price, and treating it as one would delete half the
 * show's sentences to no purpose.
 */
export function unbackedPrices(text: string, allowed: number[], mask: string[] = []): number[] {
  let scanned = text.replace(NAMED_NUMBERS, ' ');
  for (const phrase of mask) {
    if (phrase && phrase.length > 1) scanned = scanned.split(phrase).join(' ');
  }
  const out: number[] = [];
  for (const m of scanned.matchAll(PRICE_IN_PROSE)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (n < 10 && Number.isInteger(n)) continue;
    if (allowed.some((k) => near(n, k))) continue;
    out.push(n);
  }
  return out;
}

/**
 * Does this segment's own script disagree with the object it came from?
 *
 * The structural half (long stop below entry, targets above) is checked against
 * the SETUP rather than the prose, because a setup row that contradicts itself
 * would have Kai narrating an incoherent plan in a perfectly reasonable voice.
 * The prose half is the unbacked-number check above.
 */
/**
 * Every number this segment is entitled to say out loud.
 *
 * THE GUARANTEE IS "TRACES TO A REAL OBJECT", NOT "IS A PRICE". Before the show
 * could see earnings, those were the same sentence, so the allowed set was the
 * level table and nothing else. Handing Kai a filed income statement and then
 * deleting the segment for saying "sixty point eight billion in revenue" would
 * be the check enforcing an accident of its own history rather than the rule it
 * exists for. A figure Polygon filed under a fiscal quarter is exactly as
 * traceable as a trigger price — more so, it has a filing date.
 *
 * News is different and is NOT added here. A headline is somebody's sentence,
 * not a measured quantity, and a number inside one ("a three trillion dollar
 * commitment") is a claim the article makes, not a fact this show can stand
 * behind. Kai may say what an article said; he may not quote its arithmetic as
 * though it were ours.
 */
export function sayableNumbers(c: Candidate, m?: MarketBundle): number[] {
  const out = [
    ...[...levelTable(c).values()].map((l) => l.price),
    ...(c.quote?.price !== null && c.quote?.price !== undefined ? [c.quote.price] : []),
    ...c.support.map((s) => s.price),
    ...c.resistance.map((s) => s.price),
  ];
  for (const q of m?.fundamentals ?? []) {
    for (const v of [q.revenue, q.gross_profit, q.operating_income, q.net_income, q.eps_basic, q.eps_diluted]) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      out.push(v);
      // Spoken in the units a person uses. "Sixty point eight billion" reaches
      // the checker as 60.8, and 60.8 is not 60_801_000_000 to any comparison
      // that is not told about it.
      out.push(v / 1_000, v / 1_000_000, v / 1_000_000_000);
    }
  }
  return out;
}

export function contradictions(c: Candidate, text: string, mask: string[] = [], market?: MarketBundle): string[] {
  const failures: string[] = [];
  const { entry, stop, targets } = c.levels;
  if (entry !== null && stop !== null) {
    if (c.long && stop >= entry) failures.push('long setup has its stop at or above its entry');
    if (!c.long && stop <= entry) failures.push('short setup has its stop at or below its entry');
  }
  if (entry !== null) {
    for (const t of targets) {
      if (c.long && t.price <= entry) failures.push(`long target ${t.price} is not above entry ${entry}`);
      if (!c.long && t.price >= entry) failures.push(`short target ${t.price} is not below entry ${entry}`);
    }
  }
  const unbacked = unbackedPrices(text, sayableNumbers(c, market), [c.symbol, ...mask]);
  if (unbacked.length) failures.push(`narration says ${unbacked.join(', ')}, which is not on any real object`);
  return failures;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export type ResolvedAction = {
  /**
   * Null when this action raises a PANEL rather than touching the chart. The
   * two share this type on purpose: a panel has to land on the same word the
   * chart would have, and giving it its own list would mean two things racing
   * for the same moment with no agreed order between them.
   */
  command: ChartCommandName | null;
  /** Set instead of `command` for a panel. */
  overlay?: { name: LiveSlideName; payload: Record<string, unknown> } | null;
  payload: Record<string, unknown>;
  annotations: Record<string, unknown>[];
  annotation_ids: string[];
  narration: string;
  provenance: string;
  /** Where in the line it belongs, 0..1. The director turns this into ms. */
  at: number;
};

export type ResolvedBeat = {
  voice: 'kai' | 'cohost';
  text: string;
  glossary: LiveGlossaryTerm[];
  actions: ResolvedAction[];
  timeframe: string | null;
};

export type ResolveReport = {
  beats: ResolvedBeat[];
  dropped: { marker: string; why: string }[];
  rewrites: number;
  annotationsCreated: number;
  /** Chart actions the director called, and cues whose anchor it imagined. */
  cues: number;
  cuesDropped: number;
  usd: number;
};

const RAILS = new Set(['1m', '5m', '15m', '1h', '4h', 'D']);

function railFor(v: string): string | null {
  const s = v.trim();
  if (RAILS.has(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'd' || lower === '1d' || lower === 'daily') return 'D';
  return null;
}

/**
 * Persist every level this script actually names, once, before any frame is
 * built. One round trip for the segment rather than one per marker: the marks
 * are known up front because the level table is closed.
 */
async function persistLevels(opts: {
  candidate: Candidate;
  table: Map<string, LevelEntry>;
  wanted: Set<string>;
  timeframe: string;
  /** Pre-built rows for the shape markers, by the same key `wanted` uses. */
  shapes?: Map<string, NewAnnotation>;
}): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  const payload: { key: string; a: NewAnnotation }[] = [];

  for (const key of opts.wanted) {
    // A shape key carries its own geometry, already worked out against real
    // bars and real levels by `shapeRow`. Levels below are the simple case.
    const shape = opts.shapes?.get(key);
    if (shape) {
      payload.push({ key, a: shape });
      continue;
    }
    const lv = opts.table.get(key);
    if (!lv) continue;
    payload.push({
      key,
      a: {
        symbol: opts.candidate.symbol,
        timeframe: opts.timeframe,
        kind: lv.kind,
        price: lv.price,
        text: key.replace(/^\w/, (m) => m.toUpperCase()),
        reason: lv.reason,
        source_setup_id: opts.candidate.setup_id,
        source_alert_id: opts.candidate.alert_id,
      },
    });
  }
  if (!payload.length) return rows;

  try {
    const res = await createAnnotations(payload.map((p) => p.a));
    if (res.degraded) {
      log('warn', 'resolve.annotations_degraded', { reason: res.degraded_reason });
      return rows;
    }
    // Match returned rows back to the keys by (kind, price) — `upsertAnnotation`
    // is idempotent on exactly that pair, so the mapping is total.
    for (const p of payload) {
      const found = res.annotations.find(
        (r) => String(r.kind) === p.a.kind && Number(r.price) === Number(p.a.price)
      );
      if (found) rows.set(p.key, found);
    }
  } catch (e) {
    log('warn', 'resolve.annotations_failed', { message: String(e) });
  }
  return rows;
}

/**
 * Which shapes a script asks for, already built. Same pre-pass as the levels, so
 * a segment still costs one persist round trip however many rectangles, rings
 * and arrows it wants.
 */
function shapesWanted(
  texts: string[],
  ctx: { candidate: Candidate; market: MarketBundle; table: Map<string, LevelEntry> },
): { rows: Map<string, NewAnnotation>; provenance: Map<string, string> } {
  const rows = new Map<string, NewAnnotation>();
  const provenance = new Map<string, string>();
  for (const t of texts) {
    for (const m of parseMarkers(t)) {
      if (m.name !== 'ZONE' && m.name !== 'CIRCLE' && m.name !== 'ARROW') continue;
      const built = shapeRow(m, { ...ctx, timeframe: null });
      if (!built || rows.has(built.key)) continue;
      rows.set(built.key, built.row);
      provenance.set(built.key, built.provenance);
    }
  }
  return { rows, provenance };
}

/** Which levels a text names. Cheap pre-pass so the persist call is one round trip. */
function markersWanted(texts: string[]): Set<string> {
  const wanted = new Set<string>();
  for (const t of texts) {
    for (const m of parseMarkers(t)) {
      if (m.name === 'MARK' || m.name === 'ZOOM' || m.name === 'POINT' || m.name === 'FLASH') {
        const v = m.value.toLowerCase();
        if ((LIVE_MARK_TARGETS as readonly string[]).includes(v)) wanted.add(v);
      }
    }
  }
  return wanted;
}

/* ------------------------------------------------------------------ */
/* Rewriting a sentence that lost its marker                           */
/* ------------------------------------------------------------------ */

let rewriteClient: Anthropic | null = null;

/**
 * One sentence, rewritten without the thing it can no longer refer to.
 *
 * Deliberately the smallest possible call: one sentence in, one sentence out,
 * two hundred tokens. Regenerating the whole timeframe would cost twenty times
 * as much and would change lines that were fine. If the call fails, or the
 * budget has already degraded, the caller drops the sentence — which is why this
 * returns null rather than throwing.
 */
async function rewriteSentence(opts: {
  sentence: string;
  missing: string;
  budget: Budget;
  segment: number;
}): Promise<string | null> {
  if (opts.budget.degraded) return null;
  const key = config.anthropicKey();
  if (!key) return null;
  if (!rewriteClient) rewriteClient = new Anthropic({ apiKey: key });

  try {
    const model = config.kaiModel();
    const res = await rewriteClient.messages.create({
      model,
      max_tokens: 200,
      output_config: { effort: 'low' },
      system: 'You rewrite one sentence of spoken narration. Answer with the sentence and nothing else.',
      messages: [
        {
          role: 'user',
          content: `This sentence refers to a level called "${opts.missing}" that does not exist for this symbol, so it cannot be shown or named.

Rewrite it so it says something true without referring to that level at all. Keep the same voice and roughly the same length. Do not add a number. Do not add a marker in square brackets. If nothing useful is left to say, answer with the single word: DROP.

Sentence: ${opts.sentence}`,
        },
      ],
    });
    opts.budget.record({
      segment: opts.segment,
      kind: 'script',
      usd: anthropicCostUsd(model, res.usage as unknown as import("./budget.ts").Usage),
      detail: `rewrite without ${opts.missing}`,
      measured: true,
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text || /^drop\b/i.test(text)) return null;
    // A rewrite that smuggled a marker or a price back in is not a rewrite.
    if (parseMarkers(text).length) return null;
    return text;
  } catch (e) {
    log('warn', 'resolve.rewrite_failed', { message: String(e) });
    return null;
  }
}

/** The sentence a character offset falls inside, and its bounds. */
function sentenceAround(text: string, index: number): { start: number; end: number } {
  let start = 0;
  const re = /[.!?]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (index < end) return { start, end };
    start = end;
  }
  return { start, end: text.length };
}


/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/**
 * The geometry of a shape marker, or null if the real objects behind it are not
 * all there.
 *
 * EVERY COORDINATE COMES FROM SOMETHING STORED. A zone's top and bottom are two
 * levels that could each have been drawn as a line on their own; a circle's
 * centre is a level price at a bar the API returned; an arrow runs from the
 * last close to a level it has not reached. Nothing here is eyeballed, which is
 * why a shape can carry the same `reason` guarantee a price line does — and why
 * "circle that area over there", the thing a presenter does most freely, is the
 * one gesture that is not available.
 */
function shapeRow(
  m: LiveMarker,
  ctx: { candidate: Candidate; market: MarketBundle; table: Map<string, LevelEntry>; timeframe: string | null },
): { key: string; row: NewAnnotation; provenance: string } | null {
  const v = m.value.trim().toLowerCase();
  const want = ctx.timeframe ?? '1d';
  const tf =
    ctx.market.timeframes.find((t) => t.timeframe === want) ??
    ctx.market.timeframes.find((t) => t.timeframe === '1d') ??
    ctx.market.timeframes[0] ??
    null;
  const base = {
    symbol: ctx.candidate.symbol,
    timeframe: '1d',
    source_setup_id: ctx.candidate.setup_id,
    source_alert_id: ctx.candidate.alert_id,
  };

  if (m.name === 'ZONE') {
    const pair = (LIVE_ZONE_TARGETS as Record<string, readonly string[]>)[v];
    if (!pair) return null;
    const [aName, bName] = pair;
    const a = ctx.table.get(aName);
    const b = ctx.table.get(bName);
    if (!a || !b || !tf?.first_ts || !tf?.last_ts) return null;
    return {
      key: `shape:zone:${v}`,
      row: {
        ...base,
        kind: 'box',
        price: a.price,
        price2: b.price,
        ts_from: tf.first_ts,
        ts_to: tf.last_ts,
        text: v === 'risk' ? 'At risk' : v === 'reward' ? 'To target' : 'Range',
        reason: `The band between the ${aName} and the ${bName}. Both edges are stored levels: ${a.reason}`,
      },
      provenance: `${a.provenance} and ${b.provenance}, over the stored ${tf.timeframe} bars`,
    };
  }

  const lv = ctx.table.get(v);
  if (!lv) return null;

  if (m.name === 'CIRCLE') {
    // The bar that made the level matter, falling back to the most recent one —
    // the same rule ZOOM already uses, so the two never disagree about which
    // candle a level belongs to.
    const ts = lv.ts ?? tf?.last_ts ?? ctx.market.prior_session?.to ?? null;
    if (!ts) return null;
    return {
      key: `shape:circle:${v}`,
      row: {
        ...base,
        kind: 'circle',
        price: lv.price,
        ts_from: ts,
        text: v.replace(/^\w/, (c) => c.toUpperCase()),
        reason: `Ringing the bar this ${v} comes from. ${lv.reason}`,
      },
      provenance: `${lv.provenance}; centred on a stored bar`,
    };
  }

  if (m.name === 'ARROW') {
    const from = ctx.market.quote.price ?? tf?.candles.at(-1)?.c ?? null;
    const ts = tf?.last_ts ?? null;
    if (from == null || ts == null) return null;
    // An arrow from a price to itself is a dot, and a dot that claims to be an
    // arrow is worse than no gesture.
    if (Math.abs(from - lv.price) < Math.max(0.01, Math.abs(lv.price) * 0.0005)) return null;
    return {
      key: `shape:arrow:${v}`,
      row: {
        ...base,
        kind: 'arrow',
        price: from,
        price2: lv.price,
        ts_from: ts,
        ts_to: ts,
        text: 'To go',
        reason: `How far price still has to travel to the ${v}. ${lv.reason}`,
      },
      provenance: `the last stored close and the ${v}; ${lv.provenance}`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* One beat                                                            */
/* ------------------------------------------------------------------ */

async function resolveBeat(opts: {
  raw: string;
  voice: 'kai' | 'cohost';
  timeframe: string | null;
  candidate: Candidate;
  market: MarketBundle;
  table: Map<string, LevelEntry>;
  rows: Map<string, Record<string, unknown>>;
  shapeProvenance: Map<string, string>;
  spent: Set<string>;
  drawn: Set<string>;
  budget: Budget;
  segment: number;
  dropped: { marker: string; why: string }[];
  onRewrite: () => void;
}): Promise<ResolvedBeat> {
  let text = opts.raw;

  /**
   * --- pass 0: bracketed things that are not markers -----------------
   *
   * The writer is told to name levels and never to write a price, and it
   * sometimes splits the difference by inventing a placeholder: `[LEVEL:stop]`,
   * `[swing support]`. Those are not in the marker grammar, so `stripMarkers`
   * left them in the SPOKEN text — and the spoken text is what is sent to the
   * TTS. Kai was reading bracket-level-colon-stop out loud.
   *
   * Unwrapped rather than deleted: the words inside are the words the sentence
   * needs ("the stop", "swing support"), and deleting them leaves a hole in the
   * grammar of the line. A real marker is left alone; only brackets whose name
   * is not one of ours are opened up.
   */
  text = text.replace(/\[([^\]]{1,60})\]/g, (whole, inner: string) => {
    const name = /^([A-Z]+):/.exec(inner.trim())?.[1];
    if (name && (LIVE_MARKER_NAMES as readonly string[]).includes(name)) return whole;
    return inner.replace(/^[A-Z]+:\s*/, '').trim();
  });

  /* --- pass 1: remove every marker that cannot be traced ----------- */
  for (;;) {
    const markers = parseMarkers(text);
    const bad = markers.find((m) => whyUnresolvable(m, opts) !== null);
    if (!bad) break;
    const why = whyUnresolvable(bad, opts)!;
    opts.dropped.push({ marker: `[${bad.name}:${bad.value}]`, why });

    const bounds = sentenceAround(text, bad.start);
    const sentence = text.slice(bounds.start, bounds.end);
    const rewritten = await rewriteSentence({
      sentence: stripMarkers(sentence),
      missing: bad.value,
      budget: opts.budget,
      segment: opts.segment,
    });
    if (rewritten) opts.onRewrite();
    text = `${text.slice(0, bounds.start)}${rewritten ? `${rewritten} ` : ''}${text.slice(bounds.end)}`;
  }

  /**
   * --- pass 1b: a number nobody can account for costs its SENTENCE ---
   *
   * Pass 1 rewrites a sentence whose MARKER cannot be traced. Nothing did the
   * same for a number, so a single derived figure — a margin Kai worked out, a
   * percentage nobody filed — was detected only by the final gate, which had no
   * move left except to throw the whole segment away. That was the largest
   * cause of lost segments, and it was throwing away four good minutes to
   * punish four characters.
   *
   * The penalty now fits: rewrite the sentence without the number, and if the
   * rewrite still cannot manage it, delete that sentence and keep the rest. It
   * matches what this file does everywhere else — the worst case is a show that
   * says less, never a show that says a number nobody can account for.
   */
  const sayable = sayableNumbers(opts.candidate, opts.market);
  const nameMask = [opts.candidate.symbol, opts.market.company.name ?? ''];
  for (let guard = 0; guard < 6; guard += 1) {
    const bad = unbackedPrices(stripMarkers(text), sayable, nameMask);
    if (!bad.length) break;

    const needle = String(bad[0]);
    const at = text.indexOf(needle);
    if (at < 0) break;
    const bounds = sentenceAround(text, at);
    const sentence = text.slice(bounds.start, bounds.end);

    const rewritten = await rewriteSentence({
      sentence: stripMarkers(sentence),
      missing: needle,
      budget: opts.budget,
      segment: opts.segment,
    });
    if (rewritten) opts.onRewrite();

    // A rewrite that brought the number back with it is not a rewrite. Dropping
    // the sentence is the terminator that makes this loop finite.
    const keep = rewritten && !unbackedPrices(rewritten, sayable, nameMask).length ? `${rewritten} ` : '';
    if (!keep) opts.dropped.push({ marker: needle, why: 'a number that is not on any real object; the sentence went with it' });
    text = `${text.slice(0, bounds.start)}${keep}${text.slice(bounds.end)}`;
  }

  /* --- pass 2: turn what is left into actions ---------------------- */
  const spoken = stripMarkers(text);
  const markers = parseMarkers(text);
  const actions: ResolvedAction[] = [];

  for (const m of markers) {
    // How far through the SPOKEN line this marker sits. Measured on the text
    // with earlier markers removed, so a line with five markers still spreads
    // its actions across the sentence rather than bunching at the front.
    const before = stripMarkers(text.slice(0, m.start));
    const at = spoken.length ? Math.min(0.98, before.length / spoken.length) : 0;
    const a = toAction(m, at, opts);
    if (a) {
      // MARK and ZOOM are the two that put a line on the chart; everything
      // downstream may gesture at what they left behind.
      // Anything that put the line on the chart — including a gesture that had
      // to draw it first — makes later gestures legal.
      if (a.command === 'mark_level' || a.command === 'show_invalidation' || m.name === 'ZOOM') {
        opts.drawn.add(m.value.trim().toLowerCase());
      }
      actions.push(a);
    }
  }

  return {
    voice: opts.voice,
    text: spoken,
    glossary: glossaryFor(spoken, opts.spent),
    actions,
    timeframe: opts.timeframe,
  };
}

type BeatCtx = {
  candidate: Candidate;
  market: MarketBundle;
  table: Map<string, LevelEntry>;
  rows: Map<string, Record<string, unknown>>;
  /** Why each shape's coordinates are what they are, by shape key. */
  shapeProvenance: Map<string, string>;
  timeframe: string | null;
  /**
   * Levels already DRAWN earlier in this segment.
   *
   * A pointer that travels to a price with no line on it is worse than no
   * pointer at all: it draws the eye to blank chart and reads as a bug. So
   * POINT and FLASH only resolve against something already on screen, and the
   * set is shared across the segment's beats — Kai marks the trigger on the
   * daily and can still gesture at it during the thesis two minutes later.
   */
  drawn: Set<string>;
};

/**
 * The stored candles behind whatever timeframe this beat is on.
 *
 * `[CAM:wide]` frames the chart with the first and last bar the API actually
 * returned, so "let me pull back" shows a real window rather than a made-up
 * one. No timeframe on the beat (an intro, the thesis) means the daily.
 */
function tfBundle(ctx: BeatCtx) {
  const want = ctx.timeframe ?? '1d';
  return (
    ctx.market.timeframes.find((t) => t.timeframe === want) ??
    ctx.market.timeframes.find((t) => t.timeframe === '1d') ??
    ctx.market.timeframes[0] ??
    null
  );
}

/** null = resolvable. A string = the reason it will be dropped. */
function whyUnresolvable(m: LiveMarker, ctx: BeatCtx): string | null {
  const v = m.value.trim().toLowerCase();
  switch (m.name) {
    case 'MARK':
    case 'ZOOM': {
      if (!(LIVE_MARK_TARGETS as readonly string[]).includes(v)) return `"${m.value}" is not a level anything can name`;
      if (!ctx.table.has(v)) return `there is no ${v} on this symbol`;
      if (!ctx.rows.has(v)) return `the ${v} could not be persisted, so it cannot be drawn`;
      if (m.name === 'ZOOM') {
        const ts = ctx.table.get(v)!.ts ?? ctx.market.prior_session?.to ?? null;
        if (!ts) return `there is no real timestamp to point the camera at for the ${v}`;
      }
      return null;
    }
    case 'TF':
      return railFor(m.value) ? null : `"${m.value}" is not a timeframe on the rail`;
    case 'COMPARE':
      // A range over invented times frames a stretch of chart that means nothing.
      return ctx.market.prior_session ? null : 'there is no stored prior session to compare against';
    case 'NOTE': {
      const allowed = [...ctx.table.values()].map((l) => l.price);
      const bad = unbackedPrices(m.value, allowed, [ctx.candidate.symbol, ctx.market.company.name ?? '']);
      return bad.length ? `the note quotes ${bad.join(', ')}, which is not on any real object` : null;
    }
    case 'POINT':
    case 'FLASH': {
      if (!(LIVE_MARK_TARGETS as readonly string[]).includes(v)) return `"${m.value}" is not a level anything can name`;
      if (!ctx.table.has(v)) return `there is no ${v} on this symbol`;
      if (!ctx.rows.has(v)) return `the ${v} could not be persisted, so there is nothing to gesture at`;
      /**
       * A gesture at a level not yet on the chart used to be DROPPED, and each
       * drop paid for a sentence rewrite. That was the wrong trade: the
       * director was right about which level mattered and only wrong that it
       * was already visible. It now draws the level instead — see `toAction` —
       * so the cue survives, the viewer sees the line appear on the words that
       * name it, and nothing is rewritten.
       */
      return null;
    }
    case 'ZONE':
    case 'CIRCLE':
    case 'ARROW': {
      if (m.name === 'ZONE' && !(v in LIVE_ZONE_TARGETS)) return `"${m.value}" is not a band anything can name`;
      if (m.name !== 'ZONE' && !(LIVE_MARK_TARGETS as readonly string[]).includes(v)) {
        return `"${m.value}" is not a level anything can name`;
      }
      const key = `shape:${m.name.toLowerCase()}:${v}`;
      if (!ctx.rows.has(key)) return `the ${v} ${m.name.toLowerCase()} could not be built from stored objects`;
      return null;
    }
    case 'SLIDE': {
      if (!(LIVE_SLIDE_NAMES as readonly string[]).includes(v)) return `"${m.value}" is not a panel`;
      // A panel with nothing in it is worse than no panel: it reads as a
      // loading state that never resolves.
      if (v === 'fundamentals' && !(ctx.market.fundamentals ?? []).length) return 'there are no filed quarters to show';
      if (v === 'news' && !(ctx.market.news ?? []).length) return 'there are no headlines to show';
      if (v === 'evidence' && !ctx.candidate.evidence.length) return 'this candidate carries no condition list';
      return null;
    }
    case 'CAM': {
      if (!(LIVE_CAM_MOVES as readonly string[]).includes(v)) return `"${m.value}" is not a camera move`;
      if (v === 'wide') {
        const tf = tfBundle(ctx);
        if (!tf?.first_ts || !tf?.last_ts) return 'there is no stored bar range to pull back to';
      }
      return null;
    }
    default:
      return 'unknown marker';
  }
}

function toAction(m: LiveMarker, at: number, ctx: BeatCtx): ResolvedAction | null {
  const v = m.value.trim().toLowerCase();
  switch (m.name) {
    case 'MARK': {
      const lv = ctx.table.get(v)!;
      const row = ctx.rows.get(v)!;
      /**
       * A LEVEL IS DRAWN ONCE. Every mention after that is a gesture.
       *
       * Nothing used to stop the director marking the same level five times,
       * and it did: a measured segment spent nine of its twenty-three chart
       * actions drawing lines, several of them lines already on the screen.
       * Redrawing a line that is already there is not an action — the viewer
       * sees nothing happen — so it silently becomes the thing the director
       * meant, which is the cursor travelling to it. Converted rather than
       * refused, because refusing costs a sentence rewrite to fix a cue that
       * was right about WHAT to emphasise and only wrong about how.
       */
      if (ctx.drawn.has(v)) {
        return {
          command: 'pointer_hint',
          payload: { level: v, price: lv.price, annotation_id: String(row.id), linger: true },
          annotations: [],
          annotation_ids: [String(row.id)],
          narration: `pointing at the ${v}`,
          provenance: `${lv.provenance}; already on screen, so the cursor goes to it`,
          at,
        };
      }
      return {
        command: lv.kind === 'invalidation' || lv.kind === 'stop' ? 'show_invalidation' : 'mark_level',
        payload: { level: v, annotation_id: String(row.id) },
        annotations: [row],
        annotation_ids: [String(row.id)],
        narration: lv.reason,
        provenance: lv.provenance,
        at,
      };
    }
    case 'ZOOM': {
      const lv = ctx.table.get(v)!;
      const row = ctx.rows.get(v)!;
      const ts = lv.ts ?? ctx.market.prior_session?.to ?? null;
      return {
        command: 'zoom_trigger',
        payload: { level: v, focus_ts: ts, annotation_id: String(row.id) },
        annotations: [row],
        annotation_ids: [String(row.id)],
        narration: lv.reason,
        provenance: `${lv.provenance}; camera anchored on a stored bar`,
        at,
      };
    }
    case 'TF': {
      const rail = railFor(m.value)!;
      return {
        command: 'set_timeframe',
        payload: { timeframe: rail },
        annotations: [],
        annotation_ids: [],
        narration: '',
        // A view change carries no number, so there is nothing to trace — and
        // saying so is more honest than inventing a provenance string.
        provenance: 'a view change; no price is asserted',
        at,
      };
    }
    case 'COMPARE': {
      const p = ctx.market.prior_session!;
      return {
        command: 'compare_prior',
        payload: { from: p.from, to: p.to },
        annotations: [],
        annotation_ids: [],
        narration: '',
        provenance: 'the prior session, taken from the last two stored daily bars',
        at,
      };
    }
    case 'NOTE':
      return {
        command: 'pointer_hint',
        payload: { note: m.value, linger: true },
        annotations: [],
        annotation_ids: [],
        narration: m.value,
        provenance: 'a note; asserts no price',
        at,
      };

    case 'POINT': {
      // The cursor travels to a line that is already there. No annotation is
      // created and no price is asserted — the row it points at owns both.
      const lv = ctx.table.get(v)!;
      const row = ctx.rows.get(v)!;
      // Not on screen yet? Then the gesture the director meant is the line
      // arriving. Draw it here rather than pointing at empty chart.
      if (!ctx.drawn.has(v)) {
        return {
          command: lv.kind === 'invalidation' || lv.kind === 'stop' ? 'show_invalidation' : 'mark_level',
          payload: { level: v, annotation_id: String(row.id) },
          annotations: [row],
          annotation_ids: [String(row.id)],
          narration: lv.reason,
          provenance: `${lv.provenance}; drawn here because the gesture arrived before the line`,
          at,
        };
      }
      return {
        command: 'pointer_hint',
        payload: { level: v, price: lv.price, annotation_id: String(row.id), linger: true },
        annotations: [],
        annotation_ids: [String(row.id)],
        narration: `pointing at the ${v}`,
        provenance: `${lv.provenance}; the cursor moves to a line already drawn`,
        at,
      };
    }

    case 'FLASH': {
      // Two pulses on a line that does not move. A price line that shifts to
      // get attention is a lie about the price — see `show_invalidation`.
      const lv = ctx.table.get(v)!;
      const row = ctx.rows.get(v)!;
      if (!ctx.drawn.has(v)) {
        return {
          command: lv.kind === 'invalidation' || lv.kind === 'stop' ? 'show_invalidation' : 'mark_level',
          payload: { level: v, annotation_id: String(row.id) },
          annotations: [row],
          annotation_ids: [String(row.id)],
          narration: lv.reason,
          provenance: `${lv.provenance}; drawn here because the emphasis arrived before the line`,
          at,
        };
      }
      return {
        command: 'flash_annotation',
        payload: { annotation_id: String(row.id), pulses: 2 },
        annotations: [],
        annotation_ids: [String(row.id)],
        narration: `emphasising the ${v}`,
        provenance: `${lv.provenance}; an existing line is pulsed, nothing is redrawn`,
        at,
      };
    }

    case 'ZONE':
    case 'CIRCLE':
    case 'ARROW': {
      const key = `shape:${m.name.toLowerCase()}:${v}`;
      const row = ctx.rows.get(key)!;
      // Shapes ride `mark_level`: it is the command that means "put this
      // annotation on the chart and point at it", and the choreography already
      // stages one annotation as a single gesture. A shape is not a new kind of
      // chart action, it is a new kind of thing to draw.
      return {
        command: 'mark_level',
        payload: { shape: m.name.toLowerCase(), level: v, annotation_id: String(row.id) },
        annotations: [row],
        annotation_ids: [String(row.id)],
        narration: String(row.reason ?? ''),
        provenance: ctx.shapeProvenance.get(key) ?? 'built from stored levels and stored bars',
        at,
      };
    }

    case 'SLIDE': {
      const panel = (): Record<string, unknown> => {
        if (v === 'fundamentals') return { quarters: (ctx.market.fundamentals ?? []).slice(0, 5) };
        if (v === 'news') return { headlines: (ctx.market.news ?? []).slice(0, 4) };
        if (v === 'evidence') {
          return {
            grade: ctx.candidate.grade_display ?? null,
            conditions: ctx.candidate.evidence.map((e) => ({ label: e.label, ok: e.ok, detail: e.detail_plain })),
          };
        }
        if (v === 'scorecard') {
          return {
            grade: ctx.candidate.grade_display ?? null,
            headline: ctx.candidate.headline,
            state: ctx.candidate.state,
            levels: [...ctx.table.entries()].map(([name, l]) => ({ name, price: l.price, kind: l.kind })),
          };
        }
        return {};
      };
      return {
        command: null,
        overlay: { name: v as LiveSlideName, payload: panel() },
        payload: {},
        annotations: [],
        annotation_ids: [],
        narration: '',
        // Every figure on a panel is carried from a filed quarter, a published
        // article or the setup row itself — the panel computes nothing.
        provenance:
          v === 'news'
            ? 'published headlines, each with its publisher'
            : v === 'fundamentals'
              ? 'figures as filed, by fiscal quarter'
              : v === 'clear'
                ? 'a view change; no claim is made'
                : 'the setup row this segment came from',
        at,
      };
    }

    case 'CAM': {
      if (v === 'now') {
        return {
          command: 'scroll_to_now',
          payload: { duration_ms: 900 },
          annotations: [],
          annotation_ids: [],
          narration: '',
          provenance: 'a view change; no price is asserted',
          at,
        };
      }
      if (v === 'back') {
        return {
          command: 'scroll_bars',
          payload: { bars: -40, duration_ms: 1100 },
          annotations: [],
          annotation_ids: [],
          narration: '',
          provenance: 'a view change over stored bars; no price is asserted',
          at,
        };
      }
      const tf = tfBundle(ctx)!;
      return {
        command: 'zoom_range',
        payload: { from: tf.first_ts!, to: tf.last_ts!, padding: 0.08, duration_ms: 1200 },
        annotations: [],
        annotation_ids: [],
        narration: '',
        provenance: `the full stored range on the ${tf.timeframe}; no price is asserted`,
        at,
      };
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */

/**
 * A whole segment script, resolved.
 *
 * Order matters and is fixed: cohost opening → each timeframe → thesis →
 * handoff. The opening and handoff are cohost lines and carry no markers by
 * construction, so they cannot fail resolution.
 */
export async function resolveScript(opts: {
  script: SegmentScript;
  candidate: Candidate;
  market: MarketBundle;
  budget: Budget;
  segment: number;
}): Promise<ResolveReport> {
  const table = levelTable(opts.candidate);

  // THE DIRECTOR RUNS FIRST. It reads the finished script and calls the chart
  // actions, so everything below — which levels have to be persisted, what can
  // be pointed at — is decided against the script as DIRECTED, not as written.
  const directed = await directSegment({
    script: opts.script,
    table,
    market: opts.market,
    candidate: opts.candidate,
    symbol: opts.candidate.symbol,
    budget: opts.budget,
    segment: opts.segment,
  });
  const script = directed.script;

  const texts = [
    script.intro,
    ...script.timeframes.map((t: TfAnalysis) => t.narration),
    script.thesis,
  ];
  // What the director actually left in the script, by marker name. The cheapest
  // possible answer to "did the cue survive into the text the resolver reads".
  const seen: Record<string, number> = {};
  for (const t of texts) for (const m of parseMarkers(t)) seen[m.name] = (seen[m.name] ?? 0) + 1;
  log('info', 'resolve.markers_in_script', { symbol: opts.candidate.symbol, seen });

  const shapes = shapesWanted(texts, { candidate: opts.candidate, market: opts.market, table });
  if (shapes.rows.size) log('info', 'resolve.shapes_built', { keys: [...shapes.rows.keys()] });
  const rows = await persistLevels({
    candidate: opts.candidate,
    table,
    wanted: new Set([...markersWanted(texts), ...shapes.rows.keys()]),
    shapes: shapes.rows,
    timeframe: '1d',
  });

  const spent = new Set<string>();
  // Shared across the segment's beats on purpose: a level drawn on the daily is
  // still on screen when the thesis wants to gesture back at it.
  const drawn = new Set<string>();
  const dropped: { marker: string; why: string }[] = [];
  let rewrites = 0;
  const before = opts.budget.total();

  const beats: ResolvedBeat[] = [];
  const common = {
    candidate: opts.candidate,
    market: opts.market,
    table,
    rows,
    shapeProvenance: shapes.provenance,
    spent,
    drawn,
    budget: opts.budget,
    segment: opts.segment,
    dropped,
    onRewrite: () => {
      rewrites += 1;
    },
  };

  beats.push(await resolveBeat({ ...common, raw: script.intro, voice: 'cohost', timeframe: null }));
  for (const tf of script.timeframes) {
    beats.push(await resolveBeat({ ...common, raw: tf.narration, voice: 'kai', timeframe: tf.rail }));
  }
  beats.push(await resolveBeat({ ...common, raw: script.thesis, voice: 'kai', timeframe: null }));
  beats.push(await resolveBeat({ ...common, raw: script.outro, voice: 'cohost', timeframe: null }));

  return {
    beats: beats.filter((b) => b.text.trim().length > 0),
    dropped,
    rewrites,
    annotationsCreated: rows.size,
    cues: directed.cues,
    cuesDropped: directed.dropped,
    usd: opts.budget.total() - before,
  };
}
