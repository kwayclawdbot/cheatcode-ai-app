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
  LIVE_MARK_TARGETS,
  parseMarkers,
  stripMarkers,
  type LiveGlossaryTerm,
  type LiveMarker,
} from '../../../packages/shared/live.ts';
import type { ChartCommandName } from '../../../packages/shared/api.ts';
import type { Candidate, MarketBundle, NewAnnotation } from './api.ts';
import { createAnnotations } from './api.ts';
import { config } from './config.ts';
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
export function contradictions(c: Candidate, text: string, mask: string[] = []): string[] {
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
  const allowed = [
    ...[...levelTable(c).values()].map((l) => l.price),
    ...(c.quote?.price !== null && c.quote?.price !== undefined ? [c.quote.price] : []),
    ...c.support.map((s) => s.price),
    ...c.resistance.map((s) => s.price),
  ];
  const unbacked = unbackedPrices(text, allowed, [c.symbol, ...mask]);
  if (unbacked.length) failures.push(`narration says ${unbacked.join(', ')}, which is not on any real object`);
  return failures;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export type ResolvedAction = {
  command: ChartCommandName;
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
}): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  const payload: { key: string; a: NewAnnotation }[] = [];

  for (const key of opts.wanted) {
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

/** Which levels a text names. Cheap pre-pass so the persist call is one round trip. */
function markersWanted(texts: string[]): Set<string> {
  const wanted = new Set<string>();
  for (const t of texts) {
    for (const m of parseMarkers(t)) {
      if (m.name === 'MARK' || m.name === 'ZOOM') {
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
  spent: Set<string>;
  budget: Budget;
  segment: number;
  dropped: { marker: string; why: string }[];
  onRewrite: () => void;
}): Promise<ResolvedBeat> {
  let text = opts.raw;

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
    if (a) actions.push(a);
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
};

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
  const texts = [
    opts.script.intro,
    ...opts.script.timeframes.map((t: TfAnalysis) => t.narration),
    opts.script.thesis,
  ];
  const rows = await persistLevels({
    candidate: opts.candidate,
    table,
    wanted: markersWanted(texts),
    timeframe: '1d',
  });

  const spent = new Set<string>();
  const dropped: { marker: string; why: string }[] = [];
  let rewrites = 0;
  const before = opts.budget.total();

  const beats: ResolvedBeat[] = [];
  const common = {
    candidate: opts.candidate,
    market: opts.market,
    table,
    rows,
    spent,
    budget: opts.budget,
    segment: opts.segment,
    dropped,
    onRewrite: () => {
      rewrites += 1;
    },
  };

  beats.push(await resolveBeat({ ...common, raw: opts.script.intro, voice: 'cohost', timeframe: null }));
  for (const tf of opts.script.timeframes) {
    beats.push(await resolveBeat({ ...common, raw: tf.narration, voice: 'kai', timeframe: tf.rail }));
  }
  beats.push(await resolveBeat({ ...common, raw: opts.script.thesis, voice: 'kai', timeframe: null }));
  beats.push(await resolveBeat({ ...common, raw: opts.script.outro, voice: 'cohost', timeframe: null }));

  return {
    beats: beats.filter((b) => b.text.trim().length > 0),
    dropped,
    rewrites,
    annotationsCreated: rows.size,
    usd: opts.budget.total() - before,
  };
}
