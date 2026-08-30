/**
 * Top-down analysis: D → 4h → 1h → 15m, then a thesis.
 *
 * SEQUENTIAL, NOT PARALLEL, AND THAT IS THE POINT. Four independent calls would
 * be faster and would produce four narrations that do not know about each other
 * — the fifteen-minute read would open by re-establishing the trend the daily
 * just established. Each call is handed the CONCLUSIONS of the ones above it
 * with the instruction to build on them, so the fifteen says "the daily is
 * pointing down, so this bounce is the thing to be suspicious of" instead of
 * starting again. The show is one argument, not four opinions.
 *
 * WHAT THE MODEL IS AND IS NOT ALLOWED TO DO.
 * It writes SENTENCES WITH MARKERS. It never writes a price and never writes a
 * chart command. Every number that reaches the screen is looked up by
 * `resolve.ts` from the setup, alert or technicals object that the prompt was
 * built from — so the failure mode is a show that says less, never a show that
 * says a number nobody can account for. The deprecated show learned this the
 * expensive way: its model was allowed to emit levels, and the compensating
 * machinery (a five-gate validator, a sentence scrubber, a "lie detector"
 * comparing claimed reward-to-risk against recomputed reward-to-risk) all
 * existed to catch numbers it should never have been able to write.
 *
 * PROMPT CACHING. The static half of the system prompt — voice, banned register,
 * marker grammar, TTS rules — is a few thousand tokens and fires five times per
 * segment. It rides in an ephemeral cache block; everything volatile (this
 * symbol, these bars, this setup) is in the user turn, after the breakpoint. On
 * a ten-segment show that is fifty calls that pay for the frozen prefix once.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.ts';
import { log } from './log.ts';
import { Budget, anthropicCostUsd } from './budget.ts';
import {
  WRITING_FOR_A_CHART,
  SHOW_VOICE,
  TTS_RULES,
  registerViolations,
  scrubRegister,
  speakableName,
} from './voice.ts';
import type { Candidate, MarketBundle, MarketTf } from './api.ts';
import { parseMarkers } from '../../../packages/shared/live.ts';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const key = config.anthropicKey();
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set — there is nothing to write the show with.');
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export function anthropicConfigured(): boolean {
  return Boolean(config.anthropicKey());
}

/** The rail, top down. `D` on screen is `1d` in the market data. */
export const TF_ORDER = [
  { api: '1d', rail: 'D', label: 'daily' },
  { api: '4h', rail: '4h', label: 'four hour' },
  { api: '1h', rail: '1h', label: 'one hour' },
  { api: '15m', rail: '15m', label: 'fifteen minute' },
] as const;

export type TfKey = (typeof TF_ORDER)[number]['api'];

export type TfAnalysis = {
  timeframe: TfKey;
  rail: string;
  /** Narration WITH markers still in it. The resolver strips them. */
  narration: string;
  /** One sentence the next timeframe down is told, so it can build on it. */
  conclusion: string;
  /** Kept for the segment record; never used to decide anything. */
  bias: 'up' | 'down' | 'sideways';
};

export type SegmentScript = {
  intro: string;
  timeframes: TfAnalysis[];
  thesis: string;
  outro: string;
};

/* ------------------------------------------------------------------ */
/* The frozen half of the prompt                                       */
/* ------------------------------------------------------------------ */

const STATIC_SYSTEM = `You are Kai, the analyst presenting Cheat Code's market show.

${SHOW_VOICE}

${WRITING_FOR_A_CHART}

${TTS_RULES}

THE ONE RULE THAT OUTRANKS EVERYTHING ELSE
Every number you refer to must already exist in the DATA the user turn gives
you. You do not type prices. You name levels — "the trigger", "the stop", "the
first target", "support", "resistance" — and put a marker beside the words that
describe them. If a level is not in the data, it does not exist and you talk
about something else. Making one up is not a small error here: nobody reviews
this before it is spoken.

OUTPUT
Answer with JSON and nothing else. No preamble, no code fence, no explanation.`;

function system(): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' } }];
}

/* ------------------------------------------------------------------ */
/* Rendering the data the model is allowed to speak from               */
/* ------------------------------------------------------------------ */

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : String(Math.round(n * 100) / 100);
}

/**
 * The levels block: the closed vocabulary of things the model may name.
 *
 * Written as names with prices attached so the model can reason about
 * relationships ("the stop is under the trigger") without being tempted to
 * quote the digits — the TTS rules already forbid writing a number as digits,
 * and the resolver removes any it finds anyway.
 */
function levelsBlock(c: Candidate): string {
  const lines: string[] = [];
  const lv = c.levels;
  if (lv.entry !== null) lines.push(`  trigger / entry — ${fmt(lv.entry)} (from the setup's entry condition)`);
  if (lv.stop !== null) lines.push(`  stop / invalidation — ${fmt(lv.stop)} (from the setup's invalidation)`);
  lv.targets.forEach((t, i) => {
    lines.push(`  ${i === 0 ? 'target' : 'target2'} — ${fmt(t.price)} (${t.label ?? `target ${i + 1}`})`);
  });
  for (const s of c.support.slice(0, 2)) lines.push(`  support — ${fmt(s.price)} (${s.plain})`);
  for (const r of c.resistance.slice(0, 2)) lines.push(`  resistance — ${fmt(r.price)} (${r.plain})`);
  if (!lines.length) {
    return `LEVELS AVAILABLE TO YOU
  none. There is no plan on this name and no clean swing level stored. You may
  describe what the chart is doing; you may not name a level or place a MARK or
  ZOOM marker.`;
  }
  return `LEVELS AVAILABLE TO YOU (these are the ONLY ones that exist)\n${lines.join('\n')}`;
}

/**
 * The bars, summarised rather than dumped.
 *
 * A hundred and eighty daily candles as JSON is roughly four thousand tokens per
 * timeframe per segment, and the model does not read them — it reads the shape.
 * So it gets the shape: range, the last few closes, where price sits inside the
 * period, and the deterministic technicals the app computed. Those technicals
 * are the same objects the ticker page renders, which is why a claim the show
 * makes about momentum is a claim the app will also make.
 */
function timeframeBlock(tf: MarketTf, label: string): string {
  const c = tf.candles.filter((x) => x.c !== null);
  if (c.length < 5) return `${label.toUpperCase()} — not enough stored bars to read anything into.`;
  const closes = c.map((x) => x.c as number);
  const highs = c.map((x) => x.h ?? x.c ?? 0);
  const lows = c.map((x) => x.l ?? x.c ?? 0);
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const last = closes[closes.length - 1];
  const first = closes[0];
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const t = tf.technicals;

  const parts = [
    `${label.toUpperCase()} (${c.length} bars, ${String(tf.first_ts).slice(0, 10)} → ${String(tf.last_ts).slice(0, 16)})`,
    `  range over the window: ${fmt(lo)} to ${fmt(hi)}; last close ${fmt(last)} (${changePct >= 0 ? '+' : ''}${fmt(changePct)}% across the window)`,
    `  last six closes: ${closes.slice(-6).map(fmt).join(', ')}`,
  ];
  if (t) {
    parts.push(`  trend: ${t.trend.status} — ${t.trend.plain}`);
    parts.push(`  momentum: ${t.momentum.status} — ${t.momentum.plain}`);
    parts.push(`  volatility: ${t.volatility.status} — ${t.volatility.plain}`);
    if (t.support.length) parts.push(`  swing support: ${t.support.map((s) => fmt(s.price)).join(', ')}`);
    if (t.resistance.length) parts.push(`  swing resistance: ${t.resistance.map((s) => fmt(s.price)).join(', ')}`);
  }
  return parts.join('\n');
}


/** "60.8B", "6.23", "—". The units a person says, not the units a filing uses. */
function big(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Number(n.toFixed(2)));
}

/**
 * The business behind the chart, as filed.
 *
 * Given to Kai on every segment whether or not he uses it. THE POINT IS THAT HE
 * DECIDES: a name that just reported gets a sentence about the quarter, a name
 * three weeks from earnings probably does not, and neither call can be made by
 * a rule up here. Kai gets the same table either way and says what is worth
 * saying — the director downstream then decides whether it is worth SHOWING.
 *
 * Newest quarter first, with the change on the one before it worked out here
 * rather than left as arithmetic for a language model to get wrong.
 */
function fundamentalsBlock(m: MarketBundle): string | null {
  const qs = (m.fundamentals ?? []).filter((q) => q.revenue !== null || q.eps_basic !== null);
  if (!qs.length) return null;
  const rows = qs.slice(0, 5).map((q, i) => {
    const prev = qs[i + 1];
    const growth =
      prev && q.revenue !== null && prev.revenue ? ` (${(((q.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100).toFixed(1)}% on the quarter before)` : '';
    return `  ${q.fiscal_period} ${q.fiscal_year} (ended ${q.end_date}): revenue ${big(q.revenue)}${growth}; gross profit ${big(q.gross_profit)}; net income ${big(q.net_income)}; EPS ${q.eps_basic === null ? '—' : q.eps_basic.toFixed(2)}`;
  });
  return `THE BUSINESS, AS FILED (newest first — these numbers ARE real and you may say them):\n${rows.join('\n')}`;
}

/**
 * What has been said about this name lately.
 *
 * Sentiment is Polygon's, attached to a named article with its own stated
 * reason. Kai may report what a story said and who said it. He may NOT quote a
 * number out of a headline as though this show measured it — a claim inside an
 * article is that article's claim, and the number check will not vouch for it.
 */
function catalystBlock(m: MarketBundle): string | null {
  const n = m.news ?? [];
  if (!n.length) return null;
  const rows = n.slice(0, 5).map((a) => {
    const when = a.published_utc.slice(0, 10);
    const read = a.sentiment ? ` [${a.sentiment}]` : '';
    const why = a.sentiment_reasoning ? ` — ${a.sentiment_reasoning.slice(0, 150)}` : '';
    return `  ${when}${read} ${a.title}${a.publisher ? ` (${a.publisher})` : ''}${why}`;
  });
  return `RECENT HEADLINES (newest first; the read in brackets is the wire's, not yours):\n${rows.join('\n')}\nYou may say what a story said and who said it. Do NOT repeat a number out of a headline as a fact — it is their figure, not ours.`;
}

function candidateBlock(c: Candidate, m: MarketBundle): string {
  const parts: string[] = [];
  // The name the model is told is the name a person would say out loud —
  // never the legal one off the filing. See `speakableName`.
  parts.push(`COMPANY TO SAY OUT LOUD: ${speakableName(m.company.name, c.symbol)} (never say the ticker letters)`);
  if (m.company.summary) parts.push(`COMPANY: ${m.company.summary}`);
  if (m.company.sector) parts.push(`SECTOR: ${m.company.sector}${m.company.market_cap_plain ? ` · ${m.company.market_cap_plain}` : ''}`);
  parts.push(
    `LAST PRICE: ${fmt(m.quote.price ?? c.quote?.price ?? null)} (${m.quote.freshness}${
      m.quote.change_pct !== null ? `, ${fmt(m.quote.change_pct)}% on the session` : ''
    })`
  );
  parts.push(`WHY THIS NAME IS ON THE SHOW: ${sourceReason(c)}`);
  if (c.grade_display) parts.push(`GRADE: ${c.grade_display} (quality of the setup, never permission to trade)`);
  if (c.state) parts.push(`SETUP STATE: ${c.state}`);
  if (c.thesis_plain) parts.push(`THESIS AS WRITTEN: ${c.thesis_plain}`);
  if (c.narration) parts.push(`STATE IN PLAIN ENGLISH: ${c.narration}`);
  if (c.why_plain) parts.push(`WHY IT MATTERS: ${c.why_plain}`);
  if (c.outcome) parts.push(`WHAT ACTUALLY HAPPENED: ${c.outcome.plain}`);
  const fundamentals = fundamentalsBlock(m);
  if (fundamentals) parts.push(fundamentals);
  const catalysts = catalystBlock(m);
  if (catalysts) parts.push(catalysts);
  if (c.evidence.length) {
    parts.push(
      `EVIDENCE THE SCANNER RECORDED:\n${c.evidence.map((e) => `  ${e.ok ? 'yes' : 'no'} — ${e.label}${e.detail_plain ? `: ${e.detail_plain}` : ''}`).join('\n')}`
    );
  }
  if (c.levels.rr !== null) parts.push(`REWARD AGAINST RISK: ${fmt(c.levels.rr)}`);
  parts.push(levelsBlock(c));
  return parts.join('\n');
}

function sourceReason(c: Candidate): string {
  switch (c.source) {
    case 'setup':
      return 'the scanner graded a setup on it and it met its conditions';
    case 'request':
      return 'a subscriber asked for it';
    case 'winner':
      return 'Kai called it and it played out — this segment grades the call honestly, including what was wrong about it';
    default:
      return 'it moved today and it is on the watchlist; there is no plan on it';
  }
}

/* ------------------------------------------------------------------ */
/* The calls                                                           */
/* ------------------------------------------------------------------ */

type CallResult<T> = { value: T; usd: number };

export async function ask<T>(opts: {
  budget: Budget;
  segment: number;
  kind: 'analysis' | 'script';
  detail: string;
  user: string;
  maxTokens: number;
  parse: (raw: string) => T | null;
  /**
   * Replaces Kai's system prompt entirely. The director is not Kai — handing it
   * his voice, his register rules and his TTS phonetics is both confusing and
   * billed on every call.
   */
  system?: string;
}): Promise<CallResult<T> | null> {
  const model = config.kaiModel();
  let usd = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await anthropic().messages.create({
      model,
      max_tokens: opts.maxTokens,
      output_config: { effort: 'low' },
      system: opts.system ?? system(),
      messages: [{ role: 'user', content: attempt === 0 ? opts.user : `${opts.user}\n\nYour last answer was not valid JSON. Answer with JSON only.` }],
    });

    const cost = anthropicCostUsd(model, res.usage as unknown as import("./budget.ts").Usage);
    usd += cost;
    opts.budget.record({
      segment: opts.segment,
      kind: opts.kind,
      usd: cost,
      detail: `${opts.detail}${attempt ? ` (retry ${attempt})` : ''}`,
      measured: true,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const parsed = opts.parse(text);
    if (parsed !== null) return { value: parsed, usd };
    log('warn', 'analyze.unparseable', { detail: opts.detail, attempt, head: text.slice(0, 120) });
  }
  return null;
}

/**
 * JSON out of a model's answer.
 *
 * The deprecated show shipped a bug where a long marker-laden narration made the
 * model mis-escape its own JSON and the raw `{"narration":"…` envelope was read
 * aloud on stream. So: strict parse first, then a loose extraction of the field
 * by name, and a null if neither works — a null is a retry, and a retry is a
 * cost. Reading an envelope out loud is not recoverable.
 */
function json<T extends Record<string, unknown>>(raw: string, required: string[]): T | null {
  const fenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(fenced.slice(start, end + 1)) as T;
      if (required.every((k) => typeof o[k] === 'string' && (o[k] as string).trim())) return o;
    } catch {
      /* fall through to the loose read */
    }
  }
  const out: Record<string, unknown> = {};
  for (const key of required) {
    const m = fenced.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's'));
    if (!m) return null;
    out[key] = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/[\s"}\\]+$/, '');
  }
  return out as T;
}

/**
 * One timeframe.
 *
 * `priorConclusions` is what makes it top-down. Without it every call re-opens
 * the argument; with it, the fifteen knows the daily's bias and is told not to
 * restate it.
 */
async function analyzeTimeframe(opts: {
  budget: Budget;
  segment: number;
  candidate: Candidate;
  market: MarketBundle;
  tf: (typeof TF_ORDER)[number];
  bars: MarketTf;
  priorConclusions: { rail: string; conclusion: string }[];
  intro: string;
}): Promise<TfAnalysis | null> {
  const { tf, candidate, market } = opts;

  const prior = opts.priorConclusions.length
    ? `WHAT YOU ALREADY SAID, HIGHER UP — build on it, do not restate it:\n${opts.priorConclusions
        .map((p) => `  ${p.rail}: ${p.conclusion}`)
        .join('\n')}`
    : 'This is the first timeframe. Set the frame everything below it will work inside.';

  const user = `${candidateBlock(candidate, market)}

${timeframeBlock(opts.bars, `${tf.label} chart`)}

THE OPENING THAT JUST PLAYED: ${opts.intro}

${prior}

YOUR JOB
Write what Kai says while the chart is on the ${tf.label}. Ninety to a hundred
and forty words. Open by switching the chart with a [TF:${tf.rail}] marker before
the first words about this timeframe. Three beats: what the chart is doing, what
that means, and what would change your mind. Put four to seven markers inline,
at least one of which moves the camera.

Answer with JSON only:
{"narration": "...", "conclusion": "one sentence the next timeframe down needs from you", "bias": "up" | "down" | "sideways"}`;

  const r = await ask<{ narration: string; conclusion: string; bias?: string }>({
    budget: opts.budget,
    segment: opts.segment,
    kind: 'analysis',
    detail: `${candidate.symbol} ${tf.api}`,
    user,
    maxTokens: 1200,
    parse: (raw) => json(raw, ['narration', 'conclusion']),
  });
  if (!r) return null;

  const bias = r.value.bias === 'up' || r.value.bias === 'down' ? r.value.bias : 'sideways';
  return {
    timeframe: tf.api,
    rail: tf.rail,
    narration: r.value.narration,
    conclusion: r.value.conclusion,
    bias,
  };
}

/* ------------------------------------------------------------------ */

export type AnalyzeResult = {
  script: SegmentScript;
  usd: number;
  /** Anything that had to be repaired or dropped, for the segment's record. */
  notes: string[];
};

/**
 * The whole segment: opening, four timeframes, thesis, handoff.
 *
 * The opening and the handoff are cohost lines and are TEMPLATED, not generated.
 * They carry no analysis — they say a company's name and hand over — and paying
 * a model to write "now over to Kai" ten times a show is paying for variance
 * nobody asked for. The deprecated show made the same call for the same reason.
 */
export async function analyzeSegment(opts: {
  budget: Budget;
  segment: number;
  candidate: Candidate;
  market: MarketBundle;
  nextSymbol?: string | null;
}): Promise<AnalyzeResult | null> {
  const { candidate: c, market: m } = opts;
  const notes: string[] = [];
  const name = speakableName(m.company.name, c.symbol);
  const intro = introLine(c, name);

  const analyses: TfAnalysis[] = [];
  const conclusions: { rail: string; conclusion: string }[] = [];
  let usd = 0;

  for (const tf of TF_ORDER) {
    const bars = m.timeframes.find((t) => t.timeframe === tf.api);
    if (!bars || bars.candles.length < 10) {
      notes.push(`${tf.api}: skipped, only ${bars?.candles.length ?? 0} bars stored`);
      continue;
    }
    const a = await analyzeTimeframe({
      budget: opts.budget,
      segment: opts.segment,
      candidate: c,
      market: m,
      tf,
      bars,
      priorConclusions: conclusions,
      intro,
    });
    if (!a) {
      notes.push(`${tf.api}: the model did not answer usably; timeframe dropped`);
      continue;
    }

    // The register check, in code. A line that breaks it once is repaired; the
    // repair is recorded, because a show that quietly rewrites itself is a show
    // nobody can tune.
    const violations = registerViolations(a.narration);
    if (violations.length) {
      a.narration = scrubRegister(a.narration);
      notes.push(`${tf.api}: register repaired (${violations.map((v) => v.phrase).join(', ')})`);
    }

    analyses.push(a);
    conclusions.push({ rail: a.rail, conclusion: a.conclusion });
  }

  if (!analyses.length) return null;

  const thesis = await writeThesis({
    budget: opts.budget,
    segment: opts.segment,
    candidate: c,
    market: m,
    name,
    analyses,
  });
  if (thesis) usd += thesis.usd;

  return {
    script: {
      intro,
      timeframes: analyses,
      thesis: thesis?.value ?? fallbackThesis(analyses, name),
      outro: outroLine(name, opts.nextSymbol ?? null),
    },
    usd,
    notes,
  };
}

async function writeThesis(opts: {
  budget: Budget;
  segment: number;
  candidate: Candidate;
  market: MarketBundle;
  name: string;
  analyses: TfAnalysis[];
}): Promise<CallResult<string> | null> {
  const user = `${candidateBlock(opts.candidate, opts.market)}

WHAT KAI SAID ON EACH TIMEFRAME:
${opts.analyses.map((a) => `  ${a.rail} (${a.bias}): ${a.conclusion}`).join('\n')}

YOUR JOB
Reconcile all of that into ONE read on ${opts.name}. Ninety to a hundred and fifty
words. Say what the timeframes agree on, name the one level that decides it, and
say plainly what would prove the idea wrong. If the timeframes disagree, say they
disagree and say which one you are trusting — do not average them into mush. If
there is no clean idea here, say that; "nothing to do" is a legitimate read and
the audience is better served by it than by a manufactured one.

THIS IS ALSO THE ONE BEAT THAT LOOKS UP FROM THE CHART. The timeframe reads above
already covered the price action; repeating them here wastes the only place in
the segment where the business and the news can be said at all. So account for
WHY THIS NAME, in a sentence or two, using the filed quarters and the recent
headlines you were given:

  - Is the business behind this actually growing, flat, or shrinking? Say it in
    the plain terms a person uses — revenue, profit, earnings per share.
  - Is there something in the headlines that explains the tape, or that is
    sitting in front of it? Say what the story said and who said it.
  - Does any of it argue WITH the chart? A coiling chart under a deteriorating
    business is a different idea from the same chart with a growing one, and
    saying so is the most useful thing you can do here.

Judge it. A quarter that changed nothing and headlines that say nothing are not
worth a sentence — skip them and spend the words on the chart. But if the
business or the news is material to this idea, it belongs in this beat and
nowhere else.

Do not write markers or brackets of any kind — a director adds every chart
action afterwards, and a marker you write by hand arrives carrying a price and
corrupts the sentence around it. Do not write a price either. Filed revenue,
profit and earnings per share you may say plainly.

Answer with JSON only: {"thesis": "..."}`;

  const r = await ask<{ thesis: string }>({
    budget: opts.budget,
    segment: opts.segment,
    kind: 'script',
    detail: `${opts.candidate.symbol} thesis`,
    user,
    maxTokens: 700,
    parse: (raw) => json(raw, ['thesis']),
  });
  if (!r) return null;
  return { value: scrubRegister(r.value.thesis), usd: r.usd };
}

/* ------------------------------------------------------------------ */
/* Templated cohost lines                                              */
/* ------------------------------------------------------------------ */

function introLine(c: Candidate, name: string): string {
  switch (c.source) {
    case 'request':
      return `Next up, ${name} — somebody asked for this one. Kai, take us through it.`;
    case 'winner':
      return `Now this one we called. ${name}. Let us see how it actually played out, warts and all.`;
    case 'setup':
      return `${name} is next, and this one met every condition on the list. Kai, what are we looking at?`;
    default:
      return `Next on the board, ${name}. No plan on this one — just what the chart is doing.`;
  }
}

/**
 * The handoff names the NEXT company while the chart is still on this one, so
 * the switch happens under the line rather than after it. The deprecated show
 * found this was most of what made a rotation feel like television.
 */
function outroLine(name: string, nextSymbol: string | null): string {
  if (nextSymbol) return `That is the read on ${name}. Staying with it — next we are pulling up ${nextSymbol}.`;
  return `That is the read on ${name}. Give us a second while we line up the next one.`;
}

function fallbackThesis(analyses: TfAnalysis[], name: string): string {
  const up = analyses.filter((a) => a.bias === 'up').length;
  const down = analyses.filter((a) => a.bias === 'down').length;
  const lean = up > down ? 'pointing higher' : down > up ? 'pointing lower' : 'undecided';
  return `Putting the timeframes together on ${name}: ${lean}. Watch the levels already on the chart, and if the one holding this up gives way, the idea is over.`;
}

/** Every marker in a whole script, for the resolver and for the tests. */
export function scriptMarkers(script: SegmentScript) {
  return [
    ...parseMarkers(script.intro),
    ...script.timeframes.flatMap((t) => parseMarkers(t.narration)),
    ...parseMarkers(script.thesis),
  ];
}
