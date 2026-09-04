/**
 * Kai answering a question ON the chart (LIVE-8).
 *
 * A user is looking at a chart in the Trade Portal and asks a question about it.
 * Kai does not reply with a paragraph. He works the chart — moves the camera,
 * marks the level he is talking about, rings the candle, points at what he names
 * — and narrates it. THE ANSWER IS THE CHART MOVING.
 *
 * WHAT THIS FILE IS NOT. It is not a second director and it is not a second
 * resolver. The director is `packages/shared/director.ts`, the same one the show
 * runs, in its `answer` form; the numbers come from `resolveLevel` and
 * `executeChartCommand` in `./chart-commands.ts`, the same ones every other chat
 * command goes through. This file is the join between them: it builds the level
 * table the director is allowed to name, turns the markers the director places
 * back into chart commands, and puts a time on each one.
 *
 * THE ANTI-INVENTION RULE IS UNCHANGED AND IS NOT RESTATED HERE. The director
 * never sees a price. The markers it emits are symbolic. `executeChartCommand`
 * resolves each against a real row and returns null when it cannot, and a null
 * is dropped rather than filled in with a plausible number. Nothing in this file
 * creates a number, which is why nothing in this file needs a rule about them.
 *
 * THE TIMEFRAME ON SCREEN IS THE TIMEFRAME. There is no top-down analysis pass
 * here: the user is looking at one chart and asked about it, and the four
 * sequential timeframe analyses are what cost the show 37 of its 41 seconds to
 * first action. The director's `answer` form is forbidden from cueing `[TF:]`
 * for the same reason.
 */
import { direct, type DirectorAsk, type DirectorLevel } from '@shared/director';
import { LIVE_MARK_TARGETS, parseMarkers, stripMarkers, type LiveMarker } from '@shared/live';
import type { ChartAnswerAction } from '@shared/api';
import { completeOnce } from './stream';
import { answerVoiceEnabled, speak } from './tts';
import { executeChartCommand, resolveLevel, type ChartContext, type ChartCommandRequest } from './chart-commands';
import { log } from '../log';

/* ------------------------------------------------------------------ */
/* Pacing                                                              */
/* ------------------------------------------------------------------ */

/**
 * THE TIMEFRAME THE LEVELS WERE MEASURED ON.
 *
 * `loadChartContext` computes support and resistance from a hundred and fifty
 * DAILY bars, and reads the plan and setup levels off rows that were graded the
 * same way. So every number an answer can draw is a daily number, whatever the
 * user happens to have the chart set to. Naming it here is what lets the
 * director cut the camera to it before it points at anything — see the
 * timeframe injector in `packages/shared/director.ts`.
 *
 * It is a constant because the loader is: change the loader's timeframe and this
 * has to change with it, and having them disagree is exactly the bug that made
 * every mark land off-screen.
 */
export const ANALYSIS_TIMEFRAME = 'D';

/**
 * HOW A CHARACTER POSITION BECOMES A TIME.
 *
 * Silent first: there is no audio to align to, so the offsets are derived from
 * where the marker sits in the sentence at a fixed speaking rate. Seventeen
 * characters a second is the rate the show's own numbers imply — the director's
 * floor of one action per 170 characters is described as "about every ten
 * seconds", and a measured TTS line ran 29.6 seconds for a beat of roughly that
 * length.
 *
 * IT IS LINEAR ON PURPOSE. The acceptance checker inverts this exact mapping —
 * `(t - start) / duration * len(text)` — to ask which sentence was being spoken
 * when an action fired. A non-linear estimate would make the check disagree with
 * the thing it is checking.
 *
 * When voice is switched on, the real per-character timings from the TTS replace
 * this and nothing else about the file changes.
 */
const CHARS_PER_SECOND = 17;

export function spokenDurationMs(spoken: string): number {
  return Math.round((spoken.length / CHARS_PER_SECOND) * 1000);
}

/* ------------------------------------------------------------------ */
/* The level table                                                     */
/* ------------------------------------------------------------------ */

/**
 * Every level this answer is allowed to name, and where each number came from.
 *
 * Built by asking the SAME `resolveLevel` the chat's chart commands use, once
 * per name in the marker grammar's closed list. A name that resolves to nothing
 * is simply absent, and the director is told about the ones that are left — so
 * an answer about a symbol with no plan on it can talk about support and
 * resistance and cannot talk about a stop, because there is no stop to talk
 * about.
 */
/** A stored timeframe string as the chart rail names it. `1d` and `D` are one. */
function railOf(tf: string): string {
  const v = String(tf ?? '').trim().toLowerCase();
  if (v === 'd' || v === '1d' || v === 'daily' || v === 'day') return 'D';
  return v;
}

export function levelTableFor(ctx: ChartContext): Map<string, DirectorLevel> {
  const table = new Map<string, DirectorLevel>();
  for (const name of LIVE_MARK_TARGETS) {
    const r = resolveLevel(ctx, name);
    if (!r) continue;
    // `resolveLevel` returns the annotation kind, which has values a level
    // cannot be (`note`, `box`). Only the seven that name a level go in.
    const kind = r.kind;
    if (
      kind !== 'trigger' &&
      kind !== 'entry' &&
      kind !== 'stop' &&
      kind !== 'invalidation' &&
      kind !== 'target' &&
      kind !== 'support' &&
      kind !== 'resistance'
    ) {
      continue;
    }
    table.set(name, {
      name,
      price: r.price,
      kind,
      reason: r.reason,
      provenance: r.provenance,
      // THE CANDLE A LEVEL BELONGS TO. The trigger's comes off the alert; a
      // computed level's comes off the bar that printed it — the session that
      // made the previous day's high, the day the year's low was set. Only an
      // average has none, because it belongs to its whole window and to no
      // single bar, and `markShape` falls back to the most recent one.
      ts: r.ts ?? (name === 'trigger' || name === 'entry' ? ctx.triggerTs : null),
    });
  }
  return table;
}

/* ------------------------------------------------------------------ */
/* The director's LLM call, on the API's own budget                    */
/* ------------------------------------------------------------------ */

function apiAsk(requestId: string): DirectorAsk {
  return async (a) => {
    try {
      const raw = await completeOnce({
        system: a.system,
        messages: [{ role: 'user', content: a.user }],
        maxTokens: a.maxTokens,
      });
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      const v = JSON.parse(raw.slice(start, end + 1));
      return Array.isArray(v?.cues) ? { cues: v.cues } : null;
    } catch (e) {
      log('warn', requestId, 'chart_answer.direct_failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Marker -> command                                                   */
/* ------------------------------------------------------------------ */

/**
 * One marker as the chart command that performs it.
 *
 * TWO RULES LIVE HERE AND BOTH WERE MEASURED IN THE SHOW.
 *
 *   A LEVEL IS DRAWN ONCE. Nothing used to stop a director marking the same
 *   level five times, and it did: a measured segment spent nine of its
 *   twenty-three chart actions drawing lines, several already on the screen.
 *   Redrawing a line the viewer can already see is not an action, so a later
 *   MARK silently becomes what the director meant — the cursor travelling to it.
 *
 *   A GESTURE AT AN UNDRAWN LEVEL DRAWS IT. Dropping a POINT at a level that is
 *   not on screen yet costs a sentence rewrite to fix a cue that was right about
 *   WHAT mattered and only wrong about the order. So the line arrives instead.
 */
function commandFor(m: LiveMarker, drawn: Set<string>, ctx: ChartContext): ChartCommandRequest | null {
  const v = m.value.trim().toLowerCase();

  /**
   * THE LINE THAT ARRIVES WHEN A LEVEL IS FIRST NAMED.
   *
   * `invalidation` gets its own command because it draws a different line with a
   * different sentence — "what kills this" rather than "here is the stop". The
   * STOP DOES NOT. Routing it there too, as the show's resolver does, drew a
   * line labelled Invalidation while Kai said the word "stop", and left a later
   * `FLASH:stop` hunting for an annotation of kind `stop` that was never created.
   */
  const draw = (): ChartCommandRequest => {
    drawn.add(v);
    return v === 'invalidation'
      ? { command: 'show_invalidation', args: {} }
      : { command: 'mark_level', args: { level: v } };
  };

  switch (m.name) {
    case 'MARK':
      // Redrawing a line already on screen shows the viewer nothing, so a
      // second MARK silently becomes what the director meant: the cursor
      // travelling to it.
      if (drawn.has(v)) return { command: 'pointer_hint', args: { level: v, linger: true } };
      return draw();

    case 'POINT':
    case 'FLASH': {
      // The gesture arrived before the line. Draw it rather than point at
      // empty chart — the cue was right about what mattered, only early.
      if (!drawn.has(v)) return draw();
      return m.name === 'POINT'
        ? { command: 'pointer_hint', args: { level: v, linger: true } }
        : { command: 'flash_annotation', args: { kind: v === 'invalidation' ? 'invalidation' : v, pulses: 2 } };
    }

    case 'ZOOM':
      // The camera arriving at the candle a level comes from. `zoom_trigger`
      // anchors on the alert's stored trigger timestamp, so it never frames a
      // window nobody recorded.
      return { command: 'zoom_trigger', args: { level: v } };

    case 'CIRCLE':
    case 'ARROW':
    case 'ZONE':
      // Shapes ride `mark_level`; see `markShape` in chart-commands.ts.
      drawn.add(v);
      return { command: 'mark_level', args: { level: v, shape: m.name.toLowerCase() } };

    case 'CAM':
      if (v === 'now') return { command: 'scroll_to_now', args: {} };
      if (v === 'back') return { command: 'scroll_bars', args: { bars: -40 } };
      // `wide` frames the whole stored range — both ends are real bars. Without
      // them `zoom_range` falls back to the prior session, which is a day, not
      // the wide shot the cue asked for.
      return ctx.bars.firstTs && ctx.bars.lastTs
        ? { command: 'zoom_range', args: { from: ctx.bars.firstTs, to: ctx.bars.lastTs, padding: 0.08 } }
        : null;

    case 'COMPARE':
      return { command: 'compare_prior', args: {} };

    case 'NOTE':
      return { command: 'pointer_hint', args: { linger: true } };

    case 'TF':
      // The cut to the timeframe the levels were measured on. The server
      // normalises every spelling; `1d` and `D` are the same command.
      return { command: 'set_timeframe', args: { timeframe: m.value.trim() } };

    // `SLIDE` cannot reach here: the director's `answer` form refuses it,
    // because a chat answer already has the chat.
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

export type ChartAnswer = {
  /** What Kai says, markers removed. The chat renders this. */
  spoken: string;
  /**
   * How long the answer takes.
   *
   * MEASURED WHEN THERE IS AUDIO, estimated when there is not. Every action's
   * offset is a fraction of this, so which one it is decides whether a gesture
   * lands on its word or near it.
   */
  duration_ms: number;
  /** Kai speaking the answer. Null when voice is off or the TTS could not. */
  audio_url: string | null;
  audio_state: 'ready' | 'estimated' | 'failed';
  actions: ChartAnswerAction[];
  /** For the log and the proof harness. */
  directed: { cues: number; dropped: number; injected: string[] };
};

/**
 * Direct one finished answer and resolve it into timed chart actions.
 *
 * Never throws. An answer that resolves to nothing is still an answer — the
 * caller shows the prose and the chart does not move, which is the honest
 * outcome when nothing in the loaded context backs what Kai said.
 */
export async function answerOnChart(
  ctx: ChartContext,
  opts: { answer: string; requestId?: string; voice?: boolean }
): Promise<ChartAnswer> {
  const requestId = opts.requestId ?? '-';
  const prose = opts.answer.trim();
  const empty: ChartAnswer = {
    spoken: stripMarkers(prose),
    duration_ms: spokenDurationMs(stripMarkers(prose)),
    audio_url: null,
    audio_state: 'estimated',
    actions: [],
    directed: { cues: 0, dropped: 0, injected: [] },
  };
  if (!prose) return empty;

  const table = levelTableFor(ctx);

  /**
   * THE WRITER MUST NOT HAVE WRITTEN MARKERS, AND SOMETIMES DOES.
   *
   * It writes them carrying prices — `[MARK:resistance:625.66]` — which splice
   * into the middle of numbers and corrupt the sentence they were meant to
   * annotate. The director owns every marker in this pipeline, so anything the
   * writer left behind is stripped before it is handed over, not merged with
   * what the director produces.
   */
  const clean = stripMarkers(prose);

  const t0 = Date.now();
  const directed = await direct({
    beats: [{ key: 'answer', text: clean }],
    table,
    form: 'answer',
    ask: apiAsk(requestId),
    available: {
      priorSession: Boolean(ctx.priorSession),
      lastPrice: ctx.bars.lastPrice,
      analysisTimeframe: ANALYSIS_TIMEFRAME,
      chartTimeframe: railOf(ctx.timeframe),
    },
    label: ctx.symbol,
    log: (level, event, fields) => log(level, requestId, event, { symbol: ctx.symbol, ...fields }),
  });

  const marked = directed.beats[0]?.text ?? clean;
  const spoken = stripMarkers(marked);

  /**
   * SPEAK IT FIRST, THEN TIME THE GESTURES AGAINST THE REAL AUDIO.
   *
   * Order matters and this is the whole reason voice is worth switching on. The
   * silent path has to guess how long the answer takes — seventeen characters a
   * second — and every gesture is a fraction of that guess. Real audio replaces
   * the guess with a measurement off the WAV header, and each action's fraction
   * is multiplied by that instead. Same linear mapping, real total, so a level
   * drawn 60% of the way through actually lands on the word 60% of the way
   * through rather than near it.
   *
   * IT RUNS IN PARALLEL WITH NOTHING, on purpose. The director has already
   * finished, so the TTS is the last thing between the question and the answer —
   * measured at roughly five times realtime, so a twenty-second answer costs
   * about four seconds. Failing costs nothing but the audio: the fallback is the
   * estimate this function used before there was a voice at all.
   */
  const wantVoice = opts.voice ?? answerVoiceEnabled();
  const audio = wantVoice
    ? await speak({ text: spoken, voice: 'kai', requestId })
    : null;
  const duration = audio?.state === 'ready' && audio.duration_ms > 0
    ? audio.duration_ms
    : spokenDurationMs(spoken);

  /**
   * WHERE THE MARKER SITS IN THE SPOKEN LINE, not in the marked-up one.
   *
   * The offsets `parseMarkers` reports are positions in text that still contains
   * every earlier marker, and a marker is fifteen characters nobody says. Left
   * uncorrected, a gesture near the end of a densely cued answer lands seconds
   * after the words it belongs to — the error grows with every marker before it.
   */
  const markers = parseMarkers(marked);
  const drawn = new Set<string>();
  const actions: ChartAnswerAction[] = [];
  let consumed = 0;
  let cursor = 0;

  for (const m of markers) {
    consumed += m.start - cursor;
    cursor = m.end;
    const req = commandFor(m, drawn, ctx);
    if (!req) continue;
    const frame = await executeChartCommand(ctx, req, requestId);
    if (!frame) {
      log('warn', requestId, 'chart_answer.unresolved', { marker: `${m.name}:${m.value}` });
      continue;
    }
    actions.push({
      // A FRACTION OF THE LINE, turned into a time. The fraction is what the
      // director decided; the duration is whatever the audio turned out to be.
      t_offset_ms: Math.max(0, Math.round((consumed / Math.max(1, spoken.length)) * duration)),
      frame,
    });
  }

  log('info', requestId, 'chart_answer.directed', {
    symbol: ctx.symbol,
    chars: spoken.length,
    markers: markers.length,
    actions: actions.length,
    cues: directed.cues,
    dropped: directed.dropped,
    audio: audio?.state ?? 'off',
    cached: audio?.cached ?? false,
    ms: Date.now() - t0,
  });

  return {
    spoken,
    duration_ms: duration,
    audio_url: audio?.audio_url ?? null,
    audio_state: audio?.state ?? 'estimated',
    actions,
    directed: { cues: directed.cues, dropped: directed.dropped, injected: directed.injected },
  };
}
