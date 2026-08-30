/**
 * The director.
 *
 * WHY THIS IS A SEPARATE CALL FROM THE ONE THAT WRITES THE WORDS.
 *
 * Until LIVE-2 the model writing Kai's narration also placed the chart markers,
 * inline, as it wrote. That is one model doing two jobs, and it did the second
 * one badly — not wrongly, badly. Markers came out sparse and evenly spread,
 * because a model concentrating on prose treats them as punctuation: something
 * to sprinkle, not something to time. Instructions to write more of them moved
 * the count around and never moved the JUDGEMENT. A tighter cadence rule
 * ("never more than fifteen words without a marker") measured WORSE than a
 * looser one, which is the signature of an instruction being pattern-matched
 * rather than understood.
 *
 * So the jobs are split, the way they are split in a television gallery. The
 * script model writes what Kai says. THIS pass reads the finished prose and
 * calls the shots: where the camera goes, when the cursor moves, which line
 * gets pulsed. It has one job and it is judged on one thing, so it can be told
 * — in detail — what actually makes a moment worth a visual.
 *
 * IT READS THE WHOLE THING AT ONCE. A director who has read the script knows
 * the trigger gets drawn in beat two and can therefore be POINTED at during the
 * thesis in beat five. A per-line pass cannot know that, and would either
 * redraw the level or gesture at nothing.
 *
 * WHAT IT CANNOT DO. It emits markers from the closed grammar against the
 * closed level list, and nothing else — it never sees a price and never types
 * one. Everything it produces still goes through a resolver that drops a marker
 * naming a level that was not persisted, exactly like a hallucinated one. This
 * pass can be wrong about emphasis. It cannot be wrong about a number, because
 * it is never given the opportunity to write one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES IN `packages/shared` RATHER THAN IN THE SHOW WORKER (LIVE-8).
 *
 * There are two callers now: the show, which directs a five-minute segment, and
 * Kai answering a question on the chart in the Trade Portal, which directs
 * fifteen seconds. They want the SAME judgement — the difference between them
 * is length, not taste — and the four deterministic injectors below are the
 * part of this file that took the most iteration to get right and would drift
 * fastest if copied. So the pure half lives here and the LLM call is injected:
 * the worker passes its budgeted `ask`, the API passes its own, and neither
 * knows the other exists.
 */
import { LIVE_CAM_MOVES, LIVE_MARK_TARGETS, type LiveSlideName } from './live';

/**
 * A level the director is allowed to name. Structurally identical to the show
 * worker's `LevelEntry` and to what the API builds out of a `ChartContext`,
 * which is the point: the director does not care which resolver filled it in.
 */
export type DirectorLevel = {
  name: string;
  price: number;
  kind: 'trigger' | 'entry' | 'stop' | 'invalidation' | 'target' | 'support' | 'resistance';
  reason: string;
  provenance: string;
  ts: string | null;
};

/** Where a cue can land. The show's rails are named by their own timeframe. */
export type CueBeat = { key: string; text: string };

export type Cue = { beat: string; sentence: number; cue: string };

/**
 * The LLM call, injected.
 *
 * Returns null when the model could not be reached or answered with something
 * that is not the expected JSON. A director that cannot be reached is not an
 * error: the caller keeps the prose exactly as it was and runs with whatever
 * markers its writer left in it.
 */
export type DirectorAsk = (opts: {
  user: string;
  system: string;
  maxTokens: number;
  /** For the caller's own logging. The director never reads it. */
  detail: string;
}) => Promise<{ cues: Cue[] } | null>;

/**
 * `segment` is a five-minute show segment: seven beats, a top-down walk, panels.
 * `answer` is Kai replying to one question about the chart already on screen:
 * one beat, fifteen to thirty seconds, no panels.
 *
 * The DENSITY RULES DO NOT CHANGE BETWEEN THEM. `PER_ACTION_CHARS` is a rate,
 * not a total, so a 400-character answer earns about two actions from the same
 * constant that gives a 3,000-character segment eighteen. What changes is the
 * prompt, the guaranteed shapes, and whether panels exist at all.
 */
export type DirectorForm = 'segment' | 'answer';

export type DirectOptions = {
  /** The finished prose, in the order it is spoken. */
  beats: CueBeat[];
  /** Every level that may be named. A cue naming anything else is dropped. */
  table: Map<string, DirectorLevel>;
  ask: DirectorAsk;
  form?: DirectorForm;
  /** What can actually be built on this symbol. Anything absent is forbidden. */
  available?: {
    /** `[CAM:back]` and `[COMPARE:prior]` need a stored prior session. */
    priorSession?: boolean;
    /** Panels with data behind them. Ignored in `answer` form. */
    panels?: LiveSlideName[];
    /** Last traded price, for the `ARROW` injector. Null disables it. */
    lastPrice?: number | null;
    /**
     * The timeframe the LEVELS were measured on, and the one the user is
     * currently looking at. When they differ, the answer opens by cutting to
     * the first — see the injector below for why that is not optional.
     */
    analysisTimeframe?: string | null;
    chartTimeframe?: string | null;
  };
  /** Beat keys that carry no cues — the show's cohost intro. */
  skip?: string[];
  /** For the caller's own logging. */
  label?: string;
  log?: (level: 'info' | 'warn', event: string, fields: Record<string, unknown>) => void;
};

export type DirectResult = {
  /** The beats with markers spliced in. Same keys, same order. */
  beats: CueBeat[];
  cues: number;
  dropped: number;
  /** The cues the injectors added, by name, for a proof harness. */
  injected: string[];
};

/* ------------------------------------------------------------------ */
/* What makes a moment worth a visual                                  */
/* ------------------------------------------------------------------ */

/**
 * This is the part that could not be expressed as a density rule. Each entry is
 * a thing a presenter's hands do without being told, and the reason they do it.
 */
const REFERENCE_GRAMMAR = `WHAT A REFERENCE LOOKS LIKE, AND WHAT IT EARNS

  "the candle that took it", "right here", "the day it broke", "look at this bar"
      -> [ZOOM:<level>] to get there, then [CIRCLE:<level>] to ring it.
         The camera arrives, then the ring lands. Both, in that order.

  "this range", "the box it's stuck in", "the space between", "room to run",
  "what you're risking"
      -> [CAM:wide] to show the whole thing, then [ZONE:risk|reward|range].
         A band cannot be understood at a zoom that cuts off one of its edges.

  "still twenty five dollars under", "it has to get up to", "how far it has to go"
      -> [ARROW:<level>]. That is the shape that means distance. A line does
         not say it and neither does a sentence.

  "back at the trigger", "that level again", "still under it"
      -> [POINT:<level>]. He is gesturing at something already on screen.

  "below this the idea is dead", "that's the line that kills it"
      -> [FLASH:<level>]. Two pulses on what decides the trade.`;

const PAIRING_RULE = `THE RULE THAT OUTRANKS EVERYTHING ELSE

  WHENEVER KAI REFERS TO A SPECIFIC CANDLE, A ZONE, OR AN AREA OF THE CHART, THE
  CAMERA MOVES AND SOMETHING IS DRAWN ON IT.

Not sometimes. Every time. A sentence that points at a place on the chart and
gets no camera move and no shape is a failure of your job — the viewer hears
"look at this" and sees nothing happen. That pairing is the show. Everything
below is detail about how to execute it.`;

const DRAW_ONCE = `DRAW EACH LEVEL ONCE, THEN GESTURE AT IT FOREVER

The FIRST time the script names a level, [MARK:] it — the line has to exist
before anything can point at it, and a chart with no levels on it is not a chart
anyone can follow. One MARK per level, on its first mention.

After that, marking it again does nothing a viewer can see. Every later mention
is [POINT:], [FLASH:], [CIRCLE:] or [ARROW:]. A stretch that is mostly MARK is a
stretch where the chart drew some lines and then sat still — that is the failure
this rule exists to prevent, and so is one with no lines at all.`;

const SEGMENT_DIRECTION = `You are the director of a live market show. Kai is already talking — the
script below is finished and you may not change a word of it. Your job is the
chart behind him.

${PAIRING_RULE}

${REFERENCE_GRAMMAR}

  "what happened last time", "the prior session"
      -> [CAM:back], then [CAM:now] when he returns to the present.

${DRAW_ONCE}

EVERY BEAT NEEDS THE CAMERA TO MOVE AT LEAST ONCE. A beat of a hundred words
where the view never changes is a beat where the viewer is looking at a
photograph. Timeframe changes do NOT count — a [TF:] is a cut, not a move.

WHAT EARNS NOTHING

  - a definition, a caveat, or background about the company
  - a restatement of something you cued two sentences ago
  - the second half of a thought whose first half you already cued

THE TEST for every cue: if the viewer looked away and looked back at this exact
moment, would the chart tell them what Kai is talking about?`;

/**
 * THE ANSWER FORM.
 *
 * A user is looking at one chart and asked one question about it. Kai does not
 * reply with a paragraph — he works the chart and narrates it, and the answer IS
 * the chart moving. So the prompt keeps the pairing rule and the reference
 * grammar verbatim, because they are what makes the gesture land on the word,
 * and drops everything that only makes sense across a five-minute segment: the
 * per-beat camera quota, the top-down walk, the panels.
 *
 * THE TIMEFRAME ON SCREEN IS THE TIMEFRAME. A [TF:] cue in an answer takes the
 * user off the chart they were looking at when they asked, which is the one
 * thing an answer must never do.
 */
const ANSWER_DIRECTION = `You are directing the chart behind Kai while he answers ONE question about the
chart the user is looking at right now. His answer is below and is finished —
you may not change a word of it. Your job is what the chart does while he says
it.

This is an answer, not a broadcast. It is one short passage, fifteen to thirty
seconds. There is no introduction, no tour of the timeframes and no summing up.

${PAIRING_RULE}

${REFERENCE_GRAMMAR}

${DRAW_ONCE}

GO TO THE TIMEFRAME THE LEVELS ARE ACTUALLY ON.

The levels below were measured on ONE timeframe. If the user is looking at a
different one, those levels can be far outside what is on their screen — a daily
support is a long way from a five-minute chart's range — and marking them there
draws lines nobody can see. So when your answer is about the levels, open with
[TF:<the timeframe they were measured on>] and let the camera arrive before you
gesture at anything.

ONE CUT, AT THE START, AND ONLY WHEN THE LEVELS NEED IT. This is an answer, not a
tour: do not walk the timeframes, and do not cut back and forth. If the question
is about what price is doing right now on the chart they already have open,
leave it alone.

WHAT EARNS NOTHING

  - a definition, a caveat, or background about the company
  - a restatement of something you cued one sentence ago

THE TEST for every cue: if the user looked away and looked back at this exact
moment, would the chart tell them what Kai is talking about?`;

/* ------------------------------------------------------------------ */
/* Pure helpers, shared by both forms and by the tests                 */
/* ------------------------------------------------------------------ */

export function levelBlock(table: Map<string, DirectorLevel>): string {
  if (!table.size) return 'LEVELS AVAILABLE: none. You may not MARK, POINT, FLASH or ZOOM anything.';
  const rows = [...table.entries()].map(([name, l]) => `  ${name} — ${l.kind}; ${l.reason}`);
  return `LEVELS AVAILABLE (these names, nothing else):\n${rows.join('\n')}`;
}

/**
 * A beat, cut into the sentences a cue can land in front of.
 *
 * THE FIRST VERSION ASKED THE DIRECTOR TO QUOTE THE SCRIPT BACK and spliced on
 * the quotation. Half the cues were thrown away: the model paraphrased, or
 * changed a comma, or quoted across a boundary, and a phrase that is not found
 * character for character cannot be placed — a marker in roughly the right
 * place is a chart action on the wrong words. Numbering the sentences removes
 * the failure mode entirely. The director picks an index; there is nothing to
 * misquote, and it is also how a director actually thinks: cue on a line.
 */
export function sentencesOf(text: string): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = [];
  const re = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body.length > 1) out.push({ at: m.index + lead, text: body });
  }
  return out;
}

/**
 * `mark:TRIGGER` → `MARK:trigger`.
 *
 * ONLY THE MARKER NAME IS CASE-INSENSITIVE DOWNSTREAM. The resolver's
 * `railFor()` does not lowercase, so uppercasing a whole cue turns `TF:15m`
 * into `TF:15M` and every timeframe cue is silently dropped. Hence the split:
 * name up, value down, and `TF` gets its own normalisation because `D` is the
 * one value that is legitimately upper case.
 */
export function normaliseCue(cue: string): string {
  const i = cue.indexOf(':');
  if (i < 0) return cue.trim().toUpperCase();
  const name = cue.slice(0, i).trim().toUpperCase();
  const value = cue.slice(i + 1).trim();
  if (name === 'TF') {
    const v = value.toLowerCase();
    return `TF:${v === 'd' || v === '1d' || v === 'daily' ? 'D' : v}`;
  }
  return `${name}:${value.toLowerCase()}`;
}

/** `MARK:trigger` → valid only against the closed vocabularies. */
export function cueIsSane(
  cue: string,
  table: Map<string, DirectorLevel>,
  form: DirectorForm = 'segment',
): boolean {
  const [name, ...rest] = cue.split(':');
  const value = rest.join(':').trim().toLowerCase();
  switch (name.trim().toUpperCase()) {
    case 'MARK':
    case 'POINT':
    case 'FLASH':
    case 'ZOOM':
    case 'CIRCLE':
    case 'ARROW':
      return (LIVE_MARK_TARGETS as readonly string[]).includes(value) && table.has(value);
    case 'ZONE':
      return value === 'risk' || value === 'reward' || value === 'range';
    // Panels are a broadcast device. A chat answer already has the chat.
    case 'SLIDE':
      return form === 'segment' && ['fundamentals', 'news', 'evidence', 'scorecard', 'clear'].includes(value);
    case 'CAM':
      return (LIVE_CAM_MOVES as readonly string[]).includes(value);
    /**
     * A CUT TO THE TIMEFRAME THE ANALYSIS WAS DONE ON.
     *
     * An answer used to be forbidden from cueing this at all, on the reasoning
     * that the user is looking at one chart and asked about it. That was right
     * about the intent and wrong about the mechanics: the levels are measured on
     * the daily and the Trade Portal opens on the five-minute, so an answer
     * pinned to the screen's timeframe was drawing daily levels several percent
     * outside an intraday pane. Correct, invisible, and worse than useless.
     *
     * What the brief was actually guarding against is the top-down WALK — four
     * timeframe analyses before a word is spoken, which is what costs the show
     * most of its time to first action. One cut costs nothing: no extra model
     * call, no extra data, one command.
     */
    case 'TF':
      return ['d', '1d', 'daily', '4h', '1h', '15m', '5m', '1m'].includes(value);
    case 'COMPARE':
      return form === 'segment' && value === 'prior';
    default:
      return false;
  }
}

/**
 * Every band this symbol's levels can actually build, for the prompt, and the
 * one the injector reaches for, in that order of preference.
 *
 * They are separate on purpose. The director may cue any zone whose two edges
 * exist — telling it about only one would narrow what it is allowed to say. The
 * injector, which fires when the director cued no shape at all, has to choose,
 * and what a plan is RISKING is the more explanatory of the two.
 */
export function zonesAvailable(table: Map<string, DirectorLevel>): ('risk' | 'reward' | 'range')[] {
  const out: ('risk' | 'reward' | 'range')[] = [];
  if (table.has('trigger') && table.has('stop')) out.push('risk');
  if (table.has('trigger') && table.has('target')) out.push('reward');
  if (table.has('support') && table.has('resistance')) out.push('range');
  return out;
}

/** The band the injector draws when the director drew none. */
export function zoneFor(table: Map<string, DirectorLevel>): 'risk' | 'reward' | 'range' | null {
  return zonesAvailable(table)[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Direct                                                              */
/* ------------------------------------------------------------------ */

/**
 * Direct a passage of finished prose.
 *
 * Returns the beats with markers spliced in. NEVER THROWS AND NEVER FAILS THE
 * CALLER: a director that cannot be reached returns the beats exactly as they
 * arrived, and the caller runs with whatever markers their writer left in.
 */
export async function direct(opts: DirectOptions): Promise<DirectResult> {
  const form: DirectorForm = opts.form ?? 'segment';
  const answer = form === 'answer';
  const beats = opts.beats.filter((b) => typeof b.text === 'string' && b.text.trim().length > 0);
  const skip = new Set(opts.skip ?? []);
  const table = opts.table;
  const log = opts.log ?? (() => {});
  const label = opts.label ?? '';
  /** Beats a cue may land in. The show's cohost intro carries none by design. */
  const cueable = beats.filter((b) => !skip.has(b.key));

  const unchanged: DirectResult = { beats: opts.beats, cues: 0, dropped: 0, injected: [] };
  if (!beats.length) return unchanged;

  const zones = zonesAvailable(table);
  const zoneName = zones[0] ?? null;
  const zoneLine = zones.length
    ? `ZONES AVAILABLE on this symbol: ${zones.map((z) => `[ZONE:${z}]`).join(', ')}. No others can be built.`
    : 'NO ZONES can be built on this symbol — it does not have the pairs of levels they are made of.';
  const prior = opts.available?.priorSession
    ? 'A prior session exists, so [CAM:back] and [COMPARE:prior] are available.'
    : 'There is NO stored prior session. Do not cue [CAM:back] or [COMPARE:prior].';
  const panels = answer ? [] : (opts.available?.panels ?? []).map((p) => `[SLIDE:${p}]`);
  const panelLine = panels.length
    ? `PANELS THAT HAVE DATA on this symbol: ${panels.join(', ')}. Raising any other shows an empty box.`
    : '';

  const scriptBlock = (list: CueBeat[]) =>
    list
      .map((b) => `[${b.key}]\n${sentencesOf(b.text).map((sn, i) => `  ${i + 1}. ${sn.text}`).join('\n')}`)
      .join('\n\n');

  const user = answer
    ? `${ANSWER_DIRECTION}

${levelBlock(table)}

${prior}
${zoneLine}

KAI'S ANSWER, by sentence:

${scriptBlock(cueable)}

Answer with JSON only:
{"cues": [{"beat": "${cueable[0]?.key ?? 'answer'}", "sentence": <number>, "cue": "MARK:trigger"}]}

The cue fires as that sentence begins. At most two cues on one sentence, and
only if one is a camera move and the other draws something.`
    : `${SEGMENT_DIRECTION}

${levelBlock(table)}

${prior}
${zoneLine}
${panelLine}

THE SCRIPT, in the order it is spoken. Beat keys are on the left.

${scriptBlock(beats)}

Answer with JSON only:
{"cues": [{"beat": "<beat key>", "sentence": <number>, "cue": "MARK:trigger"}]}

The cue fires as that sentence begins. One cue per sentence at most. Across a
beat, expect to cue somewhere near half its sentences — the ones that put
something on the chart. Leave the rest alone.`;

  const r = await opts.ask({
    user,
    maxTokens: answer ? 700 : 1600,
    detail: `${label} direction`,
    system:
      'You are a live television director calling chart actions over a finished script. ' +
      'You answer with JSON and nothing else. You never rewrite the script and you never write a price.',
  });

  if (!r) {
    log('warn', 'cue.unavailable', { note: 'the script runs with the markers its writer left in it' });
    return unchanged;
  }

  /* ---- place what came back ------------------------------------- */

  const byBeat = new Map<string, Cue[]>();
  for (const c of r.cues ?? []) {
    if (!c?.beat || !c?.cue || c.sentence == null) continue;
    if (!cueIsSane(c.cue, table, form)) continue;
    const list = byBeat.get(c.beat) ?? [];
    list.push(c);
    byBeat.set(c.beat, list);
  }

  let placed = 0;
  let dropped = 0;
  const applied = new Map<string, string>();
  for (const b of beats) applied.set(b.key, b.text);

  for (const beat of beats) {
    const sentences = sentencesOf(beat.text);
    /**
     * A sentence may carry TWO cues, and only if they are different kinds.
     *
     * The rule the whole thing hangs on is "the camera moves AND something is
     * drawn on it" — one reference, two actions. A flat one-cue-per-sentence
     * cap made that impossible to express, and quietly threw away every shape
     * the director added to a sentence that already had a camera move on it.
     * Two of the same kind is still refused: two zooms on one phrase is a
     * fight, not a pairing.
     */
    const kinds = new Map<number, Set<string>>();
    const classOf = (cue: string) => (/^(ZOOM|CAM)/i.test(cue) ? 'camera' : 'draw');
    const cues = (byBeat.get(beat.key) ?? [])
      .filter((c) => {
        const i = Math.round(Number(c.sentence)) - 1;
        if (!Number.isFinite(i) || i < 0 || i >= sentences.length) {
          dropped += 1;
          return false;
        }
        const have = kinds.get(i) ?? new Set<string>();
        const k = classOf(normaliseCue(c.cue));
        if (have.has(k) || have.size >= 2) {
          dropped += 1;
          return false;
        }
        have.add(k);
        kinds.set(i, have);
        return true;
      })
      // Back to front, so an earlier splice cannot shift a later offset.
      .sort((a, b) => Number(b.sentence) - Number(a.sentence));

    let text = beat.text;
    for (const c of cues) {
      const at = sentences[Math.round(Number(c.sentence)) - 1].at;
      text = `${text.slice(0, at)}[${normaliseCue(c.cue)}] ${text.slice(at)}`;
      placed += 1;
    }
    applied.set(beat.key, text);
  }

  /* ---- did it do the job, and if not, ask for the missing half --- */

  /**
   * Wording alone does not hold this. Two attempts moved the marker COUNT and
   * never the judgement: a segment came back with nine of twenty-three actions
   * drawing lines, no camera move inside any beat, and not one circle, arrow or
   * zone — against a prompt that named all three. So the rule is measured after
   * the fact and, where a beat missed it, asked for again by name. One extra
   * call, only when it is needed, and only for the beats that fell short.
   */
  const CAMERA = /^(ZOOM|CAM)/i;
  const SHAPE = /^(CIRCLE|ARROW|ZONE)/i;
  const short: string[] = [];
  for (const beat of cueable) {
    const mine = (byBeat.get(beat.key) ?? []).map((c) => normaliseCue(c.cue));
    if (!mine.some((c) => CAMERA.test(c))) short.push(`[${beat.key}] has no camera move`);
  }
  const everyCue = [...byBeat.values()].flat().map((c) => normaliseCue(c.cue));
  if (!everyCue.some((c) => SHAPE.test(c))) {
    short.push(
      answer
        ? 'the answer has no circle, arrow or zone — nothing was emphasised, only listed'
        : 'the whole segment has no circle, arrow or zone — nothing was emphasised, only listed',
    );
  }

  if (short.length) {
    log('info', 'cue.repair', { label, missing: short.length });
    const repair = await opts.ask({
      maxTokens: answer ? 500 : 1200,
      detail: `${label} direction (repair)`,
      system:
        'You are a live television director. You answer with JSON and nothing else. ' +
        'You never rewrite the script and you never write a price.',
      user: `${levelBlock(table)}

${zoneLine}

You directed this and it came back short of the one rule that matters: whenever
Kai refers to a specific candle, a zone, or an area of the chart, the camera
moves AND something is drawn on it.

WHAT IS MISSING:
${short.map((x) => `  - ${x}`).join('\n')}

ALREADY CUED (do not repeat these):
${[...byBeat.entries()].map(([k, cs]) => `  [${k}] ${cs.map((c) => `${c.sentence}:${normaliseCue(c.cue)}`).join(', ')}`).join('\n') || '  nothing'}

THE SCRIPT, by beat and sentence:

${scriptBlock(cueable)}

Give me ONLY the additional cues that fix what is missing — a camera move
([ZOOM:<level>] or [CAM:wide]) on the sentence that most points at a place on
the chart, and at least one shape ([CIRCLE:<level>] rings a candle,
[ARROW:<level>] shows distance still to travel, [ZONE:…] shades a band) on the
sentence it belongs to. Do not touch sentences already cued.

Answer with JSON only:
{"cues": [{"beat": "<beat key>", "sentence": <number>, "cue": "ZOOM:trigger"}]}`,
    });

    for (const c of repair?.cues ?? []) {
      if (!c?.beat || !c?.cue || c.sentence == null) continue;
      if (!cueIsSane(normaliseCue(c.cue), table, form)) continue;
      const beat = beats.find((b) => b.key === c.beat);
      if (!beat || skip.has(beat.key)) continue;
      const text = applied.get(beat.key) ?? beat.text;
      const sentences = sentencesOf(text);
      const i = Math.round(Number(c.sentence)) - 1;
      if (!(i >= 0 && i < sentences.length)) continue;
      const at = sentences[i].at;
      // The repair exists to ADD the missing half of a pairing, so a sentence
      // already carrying a camera move is exactly where a shape belongs. Only
      // refuse when this sentence already has two.
      const lead = text.slice(Math.max(0, at - 80), at);
      if ((lead.match(/\]/g) ?? []).length >= 2) continue;
      applied.set(beat.key, `${text.slice(0, at)}[${normaliseCue(c.cue)}] ${text.slice(at)}`);
      placed += 1;
    }
  }

  /* ---- the pairing, enforced rather than requested ---------------- */

  /**
   * "Whenever Kai refers to a specific candle, a zone or an area, the camera
   * moves and something is drawn on it." The prompt says it three ways and five
   * measured runs still came back with zooms and no rings, and not one circle,
   * arrow or zone in any of them. A model that will not reach for a tool does
   * not start reaching because the instruction is rephrased, so the missing
   * half is added here instead of asked for again.
   *
   * Everything injected names a level the passage already established. Nothing
   * new is asserted and no number is invented — a ring on the candle the camera
   * just flew to is the same claim the zoom already made.
   */
  const injected: string[] = [];
  const insert = (beatKey: string, at: number, cue: string) => {
    const text = applied.get(beatKey) ?? '';
    applied.set(beatKey, `${text.slice(0, at)}[${cue}] ${text.slice(at)}`);
    placed += 1;
    injected.push(cue);
  };

  /**
   * 1. THE CURSOR IS ON WHATEVER HE JUST NAMED, EVERY TIME HE NAMES IT.
   *
   * The first version fired once per SENTENCE and took the first level word it
   * found. Two things went wrong and both are visible in a measured segment:
   * fifteen of twenty-one level-bearing actions landed on the trigger because
   * that is the word Kai says most, and the chart sat still for twenty-four
   * seconds at a stretch because one gesture had to cover a fifty-second line.
   *
   * A presenter's hand does not work per sentence. It moves to the thing they
   * are saying, as they say it. So every MENTION of a level gets the cursor, at
   * that word — not the first one in the sentence, and not one per sentence.
   * The marker's position in the text is what the resolver turns into a time,
   * so placing it at the word is what makes the gesture land on the word.
   */
  const MENTION = new RegExp(`\\b(${LIVE_MARK_TARGETS.join('|')})\\b`, 'gi');
  for (const beat of [...cueable].reverse()) {
    const text = applied.get(beat.key) ?? beat.text;
    const spots: { at: number; level: string }[] = [];
    for (const m of text.matchAll(MENTION)) {
      const at = m.index ?? 0;
      const level = m[1].toLowerCase();
      if (!table.has(level)) continue;
      // Inside a marker already ([MARK:trigger]) — that is the cue, not prose.
      const before = text.lastIndexOf('[', at);
      const closed = text.lastIndexOf(']', at);
      if (before > closed) continue;
      // Something already acts on this phrase within the preceding 60 chars.
      if (/\[(MARK|POINT|FLASH|CIRCLE|ARROW|ZONE):[^\]]*\]\s*$/i.test(text.slice(Math.max(0, at - 60), at))) continue;
      spots.push({ at, level });
    }
    // Back to front so each insert leaves the earlier offsets alone.
    for (const spot of spots.reverse()) insert(beat.key, spot.at, `POINT:${spot.level}`);
  }

  /**
   * 2. A ZOOM RINGS THE CANDLE IT FLEW TO — and only that.
   *
   * The previous rule put a circle after ANY camera move and, when the move was
   * a [CAM:] with no level of its own, fell back to the first ringable level in
   * the table. That is where "a trigger circle appears while he is talking
   * about something else" came from: a wide shot of the range would ring the
   * trigger for no reason. A ZOOM names its own level; a CAM does not name one,
   * so it gets no ring.
   */
  for (const beat of [...cueable].reverse()) {
    const text = applied.get(beat.key) ?? beat.text;
    const zooms = [...text.matchAll(/\[ZOOM:\s*([a-z0-9]+)\s*\]/gi)];
    for (const m of zooms.reverse()) {
      const level = m[1].toLowerCase();
      if (!table.has(level)) continue;
      const idx = (m.index ?? 0) + m[0].length;
      if (/\[CIRCLE:/i.test(text.slice(idx, idx + 160))) continue;
      insert(beat.key, idx, `CIRCLE:${level}`);
    }
  }

  /**
   * 3. NO LONG SILENCES: the cursor rests on the current subject.
   *
   * Even with a gesture on every mention, a measured segment still held a
   * twenty-five second stretch with nothing moving — the passages where Kai
   * talks about momentum, or the business, and names no level at all. A
   * presenter's hand does not leave the chart during those; it stays on
   * whatever they were last talking about.
   *
   * So any run of roughly two hundred characters — about twelve seconds of
   * speech — with no chart action gets one, pointing at the level most recently
   * named. It asserts nothing new; it is the same level, still being discussed.
   */
  const QUIET_CHARS = 200;
  /**
   * The subject CARRIES ACROSS BEATS. Without this every line began with a
   * silence: the filler needs something to point at, had nothing at character
   * zero, and so left the opening stretch of all seven beats empty — which is
   * where the worst gaps were. A presenter's hand does not reset to nothing when
   * they start a new sentence; it is still on the last thing they discussed.
   */
  let subject: string | null =
    ['trigger', 'support', 'resistance', 'stop'].find((n) => table.has(n)) ?? null;
  const fillPlan: { key: string; fills: { at: number; level: string }[] }[] = [];
  for (const beat of cueable) {
    const text = applied.get(beat.key) ?? beat.text;
    const marks = [...text.matchAll(/\[[A-Z]+:[^\]]*\]/g)].map((m) => ({
      at: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      level: /^\[(MARK|POINT|FLASH|CIRCLE|ARROW|ZOOM):\s*([a-z0-9]+)/i.exec(m[0])?.[2]?.toLowerCase() ?? null,
    }));
    const fills: { at: number; level: string }[] = [];
    let cursor = 0;
    for (const m of [...marks, { at: text.length, end: text.length, level: null }]) {
      if (m.at - cursor > QUIET_CHARS && subject) {
        // Halfway through the silence, so it does not crowd either neighbour.
        fills.push({ at: Math.round(cursor + (m.at - cursor) / 2), level: subject });
      }
      if (m.level && table.has(m.level)) subject = m.level;
      cursor = m.end;
    }
    fillPlan.push({ key: beat.key, fills });
  }
  // Applied per beat, back to front, so no insert disturbs an earlier offset.
  for (const plan of fillPlan.reverse()) {
    for (const f of plan.fills.reverse()) insert(plan.key, f.at, `POINT:${f.level}`);
  }

  /**
   * A FLOOR, because gap heuristics kept leaving one beat behind.
   *
   * Even with a gesture on every mention and a filler for quiet runs, a measured
   * segment still produced a beat with ONE action across fifty-three seconds
   * while its neighbours had eight to fifteen — a line that happened to name no
   * levels and whose one marker sat at the top. Rather than add a fourth
   * heuristic, the density is simply guaranteed: roughly one action per 170
   * characters of speech, which is about every ten seconds, spread evenly across
   * whatever the beat has not already covered.
   *
   * IT IS A RATE, NOT A TOTAL, which is why the answer form does not touch it.
   * A four-hundred-character answer earns about two actions from the same
   * constant that gives a three-thousand-character segment eighteen.
   */
  const PER_ACTION_CHARS = 170;
  for (const beat of [...cueable].reverse()) {
    const text = applied.get(beat.key) ?? beat.text;
    const spoken = text.replace(/\[[^\]]*\]/g, '');
    const want = Math.floor(spoken.length / PER_ACTION_CHARS);
    const have = (text.match(/\[[A-Z]+:/g) ?? []).length;
    if (have >= want) continue;
    const sn = sentencesOf(text).filter((x) => !/\[[A-Z]+:/.test(x.text));
    const need = Math.min(want - have, sn.length);
    const step = Math.max(1, Math.floor(sn.length / Math.max(1, need)));

    /**
     * WHICH LEVEL, THOUGH — and this is where the first version went wrong.
     *
     * It took the first level named anywhere in the BEAT and pointed at that for
     * every fill, which is how the cursor ended up on the stop while Kai was
     * talking about the range, and on the trigger during a sentence about the
     * business. Measured: 36% of level-bearing actions named something the
     * sentence was not about, and it got worse toward the end of a segment
     * because that is where the floor does most of its work.
     *
     * A fill now points at the level named most recently BEFORE that position —
     * the thing still under discussion. If nothing has been named yet at that
     * point, there is no honest answer, and no gesture is made.
     */
    const named = [...text.matchAll(new RegExp(`\\b(${LIVE_MARK_TARGETS.join('|')})\\b`, 'gi'))]
      .map((m) => ({ at: m.index ?? 0, level: m[1].toLowerCase() }))
      .filter((x) => table.has(x.level));
    /**
     * A subject goes stale. Pointing at the trigger during a sentence about last
     * quarter's revenue is not "the cursor resting on the subject", it is the
     * cursor stranded on something nobody has mentioned for four sentences.
     * Beyond about 350 characters — twenty-odd seconds of speech — there is no
     * honest subject and the right number of gestures is none.
     */
    const STALE_CHARS = 350;
    const subjectAt = (pos: number) => {
      let cur: { at: number; level: string } | null = null;
      for (const n of named) {
        if (n.at > pos) break;
        cur = n;
      }
      return cur && pos - cur.at <= STALE_CHARS ? cur.level : null;
    };

    const picks: { at: number; level: string }[] = [];
    for (let i = 0; i < sn.length && picks.length < need; i += step) {
      const level = subjectAt(sn[i].at);
      if (!level) continue;
      picks.push({ at: sn[i].at, level });
    }
    for (const pick of picks.reverse()) insert(beat.key, pick.at, `POINT:${pick.level}`);
  }

  /**
   * 4 AND 5. THE BAND AND THE DISTANCE.
   *
   * A segment gets both, guaranteed: over five minutes, a show that never shades
   * what is at risk and never shows how far price has to travel has left its two
   * most explanatory shapes on the shelf.
   *
   * AN ANSWER GETS AT MOST ONE, AND ONLY IF IT EARNED IT. Fifteen seconds is one
   * thought. Shading a band and drawing a distance arrow over a single sentence
   * is two claims competing for the same moment, and neither reads. So in
   * `answer` form the first of the two that matches the prose wins and the other
   * is not injected — and if the answer discusses neither a band nor a distance,
   * neither is.
   */
  const all = () => [...applied.values()].join(' ');
  /** The show puts them in the thesis; an answer has only the one beat. */
  const shapeBeat =
    cueable.find((b) => b.key === 'thesis')?.key ?? cueable[cueable.length - 1]?.key ?? null;
  let shapesInjected = 0;
  const shapeBudget = answer ? 1 : 2;

  if (shapeBeat && zoneName && !/\[ZONE:/i.test(all()) && shapesInjected < shapeBudget) {
    const text = applied.get(shapeBeat) ?? '';
    const sn = sentencesOf(text);
    const hit = sn.find((x) => /\b(stop|risk|below|invalidat|room|between|range|band)\b/i.test(x.text));
    if (hit) {
      insert(shapeBeat, hit.at, `ZONE:${zoneName}`);
      shapesInjected += 1;
    }
  }

  const last = opts.available?.lastPrice ?? null;
  const trig = table.get('trigger')?.price ?? null;
  if (
    shapeBeat &&
    shapesInjected < shapeBudget &&
    last !== null &&
    trig !== null &&
    Math.abs(last - trig) / Math.max(1, Math.abs(trig)) > 0.005 &&
    !/\[ARROW:/i.test(all())
  ) {
    const text = applied.get(shapeBeat) ?? '';
    const sn = sentencesOf(text);
    const hit = sn.find((x) => /\b(away|under|short of|has to|until it|reach|clear|above)\b/i.test(x.text));
    if (hit) {
      insert(shapeBeat, hit.at, 'ARROW:trigger');
      shapesInjected += 1;
    }
  }

  /**
   * NOTHING STACKS. Three markers landing within a few characters of each other
   * resolve to the same moment, and three gestures fired at one instant is not
   * emphasis — it is a glitch. A measured segment put three cursor moves on the
   * same timestamp in the middle of a sentence about revenue.
   */
  const MIN_APART = 45;
  for (const beat of beats) {
    const text = applied.get(beat.key);
    if (!text) continue;
    const found = [...text.matchAll(/\[[A-Z]+:[^\]]*\]/g)];
    const drop: { at: number; end: number }[] = [];
    let lastAt = -Infinity;
    for (const m of found) {
      const at = m.index ?? 0;
      if (at - lastAt < MIN_APART) drop.push({ at, end: at + m[0].length });
      else lastAt = at;
    }
    if (!drop.length) continue;
    let out = text;
    for (const d of drop.reverse()) out = `${out.slice(0, d.at)}${out.slice(d.end)}`;
    applied.set(beat.key, out.replace(/\s{2,}/g, ' '));
    placed -= drop.length;
  }

  /**
   * 0. GET TO THE TIMEFRAME THE LEVELS ARE ON, BEFORE DRAWING ANY OF THEM.
   *
   * The levels come from an analysis run on one timeframe — on the chat side,
   * a hundred and fifty DAILY bars. The Trade Portal opens on the five-minute.
   * A daily support sits several percent from a five-minute chart's range, so
   * every mark, ring and band landed outside the visible pane: drawn at exactly
   * the right price, on a chart that could not show it.
   *
   * The camera has to arrive before the hand points. This is that, and it is
   * injected rather than asked for because it is not a judgement — if the
   * levels are daily and the screen is not, the cut is simply required, and a
   * model that forgets it produces an answer that looks like nothing happened.
   *
   * ONLY WHEN THE ANSWER IS ABOUT LEVELS. A question about what price is doing
   * right now is answered on the chart the user already chose, and cutting away
   * from it would be taking them somewhere they did not ask to go.
   *
   * IT RUNS LAST, AND INSERTS AT ZERO. It used to run first, and the thinning
   * pass ate it: an injected arrow landed on the same opening sentence, the two
   * markers sat within `MIN_APART` of each other, and the one that got dropped
   * was the cut. The chart then marked daily levels on a five-minute pane —
   * the exact failure this rule exists to prevent, reintroduced by a later rule
   * that could not tell a camera cut from a third gesture on one instant.
   *
   * Nothing after this can move it, and being at character zero it is the first
   * thing that happens. A cut is not a gesture; it does not compete for the
   * moment, it creates the chart the moments happen on.
   */
  const analysisTf = opts.available?.analysisTimeframe ?? null;
  const chartTf = opts.available?.chartTimeframe ?? null;
  if (analysisTf && chartTf && analysisTf !== chartTf && cueable.length) {
    const text = [...applied.values()].join(' ');
    const namesALevel =
      /\[(MARK|POINT|FLASH|CIRCLE|ARROW|ZOOM|ZONE):/i.test(text) ||
      new RegExp(`\\b(${LIVE_MARK_TARGETS.join('|')})\\b`, 'i').test(text);
    if (namesALevel && !/\[TF:/i.test(text)) {
      insert(cueable[0].key, 0, `TF:${analysisTf}`);
    }
  }


  if (injected.length) log('info', 'cue.paired', { label, added: injected.length, kinds: injected });
  log('info', 'cue.directed', { label, form, placed, dropped });

  return {
    beats: opts.beats.map((b) => ({ ...b, text: applied.get(b.key) ?? b.text })),
    cues: placed,
    dropped,
    injected,
  };
}
