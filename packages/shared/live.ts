/**
 * The LiveTimeline contract (spec 15 §L3, LIVE-2).
 *
 * A Kai show is not a video. It is a list of small, ordered, idempotent events:
 * *say this line*, *switch to this symbol*, *mark that level*, *put this
 * overlay on screen*. Everything downstream — the app's Live screen, the stage
 * page the broadcast box records, this lane's `/stage-check` harness — is a
 * player for that list and nothing else.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `api.ts`.
 * The chart's own vocabulary (`ChartCommandName`, `AnnotationRow`) already
 * lives in `api.ts` and is append-only and persisted, so it is IMPORTED here
 * and never redefined. What is new is the envelope around it: sequence,
 * segment, timing, voice. Keeping the show contract in its own module means a
 * change to the show cannot silently change the chart contract that round 4 and
 * LIVE-1 already ship against.
 *
 * THREE PROPERTIES EVERY FRAME HAS TO HAVE, and the reason for each:
 *
 *  1. ORDERED AND GAP-FREE (`seq`). A viewer who joins at 14:03 asks for
 *     everything after the last `seq` they saw and gets exactly that. A gap
 *     would be a silently missing level, which on a chart is indistinguishable
 *     from a level that was never drawn.
 *
 *  2. IDEMPOTENT BY `(show_id, seq)`. The worker broadcasts a frame AND writes
 *     it to `live_frames`. A client that receives both must apply it once. The
 *     broadcast is the fast path; the table is the truth; `seq` is what makes
 *     reconciling them arithmetic instead of guesswork.
 *
 *  3. REPLAYABLE FROM ZERO. Applying frames 0..N in order lands on the same
 *     state whether it happened live or six hours later. That is why a frame
 *     carries the annotations it draws rather than an id to fetch: a replay
 *     must not depend on what a row looks like now.
 *
 * NUMBERS. `ChartFrame.provenance` is not decoration. Every number Kai marks in
 * a show comes from a setup, alert or plan object, and a frame whose number
 * cannot be traced to one is DROPPED by the worker's resolver before it ever
 * gets a `seq` (see `workers/kai-live/src/resolve.ts`). Nobody is watching the
 * generation of an after-hours show, so the rule that was a guardrail in the
 * app is load-bearing here.
 */
import { z } from 'zod';
import { AnnotationRow, ChartCommandName } from './api';

/* ------------------------------------------------------------------ */
/* Show + segment                                                      */
/* ------------------------------------------------------------------ */

/**
 * Two outputs, one engine (spec 15 §1).
 *
 * `review` is the after-hours YouTube show and is free — any signed-in user can
 * read it. `market` is the in-session show and is premium. The mode is on the
 * SHOW, not on the frame, so the entitlement question is asked once when the
 * show is opened rather than on every one of a few thousand frames.
 */
export const LiveMode = z.enum(['review', 'market']);
export type LiveMode = z.infer<typeof LiveMode>;

export const LiveShowStatus = z.enum(['preparing', 'live', 'ended']);
export type LiveShowStatus = z.infer<typeof LiveShowStatus>;

/**
 * Where a segment came from. This is the source router's decision, recorded, so
 * a rundown can be audited after the fact — "why did the show spend four
 * minutes on a name nobody asked about" has an answer.
 */
export const LiveSegmentSource = z.enum(['setup', 'request', 'winner', 'watchlist']);
export type LiveSegmentSource = z.infer<typeof LiveSegmentSource>;

export const LiveSegmentState = z.enum(['prepared', 'playing', 'done']);
export type LiveSegmentState = z.infer<typeof LiveSegmentState>;

export const LiveShow = z.object({
  id: z.string(),
  mode: LiveMode,
  status: LiveShowStatus,
  title: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export type LiveShow = z.infer<typeof LiveShow>;

export const LiveSegment = z.object({
  id: z.string(),
  show_id: z.string(),
  seq: z.number().int().min(0),
  symbol: z.string(),
  source: LiveSegmentSource,
  state: LiveSegmentState,
  prepared_at: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  /** What this segment actually cost to make. Measured, not estimated. */
  cost_usd: z.number().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export type LiveSegment = z.infer<typeof LiveSegment>;

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

export const LiveFrameKind = z.enum(['say', 'chart', 'present', 'overlay']);
export type LiveFrameKind = z.infer<typeof LiveFrameKind>;

/** Kai leads; the cohost bridges. `ash` and `coral` respectively at the TTS. */
export const LiveVoice = z.enum(['kai', 'cohost']);
export type LiveVoice = z.infer<typeof LiveVoice>;

/**
 * A term defined on first use, carried as DATA rather than baked into the
 * sentence.
 *
 * The YouTube audience is beginners, and the standing teaching rule is plain
 * definition first, metaphor only as the closer. Emitting the definition beside
 * the line instead of inside it means LIVE-5 can put it on screen as a lower
 * third while the spoken sentence stays a sentence — and it means the same
 * script read to an experienced audience simply drops the glossary rather than
 * being rewritten.
 */
export const LiveGlossaryTerm = z.object({
  term: z.string().min(1).max(60),
  plain: z.string().min(1).max(240),
});
export type LiveGlossaryTerm = z.infer<typeof LiveGlossaryTerm>;

const FrameBase = {
  show_id: z.string(),
  segment_id: z.string(),
  /** Monotonic and gap-free per show. The join/replay key. */
  seq: z.number().int().min(0),
  /** Milliseconds from the START OF THE SEGMENT, never from the start of the show. */
  t_offset_ms: z.number().int().min(0),
};

/**
 * Kai (or the cohost) says a line.
 *
 * `audio_url` is nullable ON PURPOSE. A show whose narration exists but whose
 * TTS provider is unavailable is still a show — it plays as captions over a
 * moving chart — and pretending otherwise would mean a credit outage silently
 * produces an empty rundown instead of a degraded one. `duration_ms` is
 * MEASURED from the audio when there is audio and ESTIMATED from the text when
 * there is not, and `audio_state` says which, so nothing downstream has to
 * infer it from a null.
 */
export const SayFrame = z.object({
  ...FrameBase,
  kind: z.literal('say'),
  voice: LiveVoice,
  text: z.string().min(1),
  audio_url: z.string().nullable(),
  duration_ms: z.number().int().min(0),
  audio_state: z.enum(['ready', 'estimated', 'failed']).default('ready'),
  glossary: z.array(LiveGlossaryTerm).default([]),
});
export type SayFrame = z.infer<typeof SayFrame>;

/**
 * Kai works the chart. The payload is LIVE-1's `ChartCommandFrame` shape —
 * command name imported from `@shared/api`, never redefined — plus the two
 * things a SHOW needs that a one-off command did not: which persisted
 * annotations it touches, and where its numbers came from.
 */
export const ChartFrame = z.object({
  ...FrameBase,
  kind: z.literal('chart'),
  command: ChartCommandName,
  payload: z.record(z.string(), z.unknown()),
  /** Already persisted, and carried inline so a replay never has to re-fetch. */
  annotations: z.array(AnnotationRow).default([]),
  annotation_ids: z.array(z.string()).default([]),
  /** The sentence said while the chart moves. May be empty for pure camera moves. */
  narration: z.string().default(''),
  /** Which real object every number in this frame came from. Never empty. */
  provenance: z.string().min(1),
});
export type ChartFrame = z.infer<typeof ChartFrame>;

/** The chart changes symbol. The one frame that resets everything below it. */
export const PresentFrame = z.object({
  ...FrameBase,
  kind: z.literal('present'),
  symbol: z.string().min(1).max(12),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', 'D']),
  headline: z.string().min(1),
  source: LiveSegmentSource,
});
export type PresentFrame = z.infer<typeof PresentFrame>;

/**
 * Show furniture: the ticker rail, the levels card, the winners board, the app
 * CTA, or a clear.
 *
 * RENDERING IS LIVE-5's JOB. These are emitted now anyway, because the moment
 * when the director knows the winners board should be up is the moment the
 * segment is written — reconstructing it later from a finished timeline would
 * be guesswork. An unimplemented overlay is ignored by a player; a missing one
 * cannot be recovered.
 */
export const LiveOverlayName = z.enum([
  'ticker_rail',
  'levels',
  'winners',
  'cta',
  'clear',
  /**
   * The panels. Each one carries the thing a CHART STRUCTURALLY CANNOT SAY —
   * why the name is here, whether the business behind it is growing, what has
   * been written about it lately, and which of the setup's conditions are
   * actually met. Anything the chart can show belongs on the chart, drawn on
   * the price it is about, not in a box beside it.
   */
  'fundamentals',
  'news',
  'evidence',
  'scorecard',
]);
export type LiveOverlayName = z.infer<typeof LiveOverlayName>;

export const OverlayFrame = z.object({
  ...FrameBase,
  kind: z.literal('overlay'),
  overlay: LiveOverlayName,
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type OverlayFrame = z.infer<typeof OverlayFrame>;

export const LiveFrame = z.discriminatedUnion('kind', [SayFrame, ChartFrame, PresentFrame, OverlayFrame]);
export type LiveFrame = z.infer<typeof LiveFrame>;

/* ------------------------------------------------------------------ */
/* The marker grammar the analyzer writes and the resolver consumes     */
/* ------------------------------------------------------------------ */

/**
 * Inline markers in narration, e.g.
 *
 *   "It has to clear the trigger [MARK:trigger] before any of this matters."
 *
 * The model writes SENTENCES WITH MARKERS, never chart commands and never
 * numbers. That split is the anti-invention rule expressed as a data format:
 * the model can say WHICH level it means, and only the resolver — reading the
 * setup row — can say what that level's price is. A marker whose referent does
 * not exist on a real object is deleted and its sentence regenerated without
 * it, so the worst case is a show that says less, never a show that says a
 * number nobody can account for.
 *
 * Kept as a regex plus a name list rather than a parser: the grammar is small,
 * it has to survive being written by a language model, and anything the model
 * produces that is not one of these is simply not a marker.
 */
export const LIVE_MARKER_NAMES = [
  'MARK',
  'ZOOM',
  'TF',
  'COMPARE',
  'NOTE',
  /**
   * The three below exist because a presenter who only ever DRAWS is not
   * presenting. A person talking through a chart draws a level once and then
   * spends the next minute gesturing at it — "back at that trigger", "look
   * where this sits". Without a way to refer to a level already on screen, Kai
   * says those words over a chart that does not move, and the eye has nothing
   * to follow. POINT and FLASH are that gesture; CAM is stepping back from the
   * whiteboard.
   */
  'POINT',
  'FLASH',
  'CAM',
  /**
   * Shapes rather than lines. A level is a price and draws as a rule across the
   * chart; these three say something a rule cannot — the BAND between two
   * levels, the CANDLE that matters, the DISTANCE still to travel.
   */
  'ZONE',
  'CIRCLE',
  'ARROW',
  /** Brings a panel up beside the chart. `[SLIDE:clear]` takes it away again. */
  'SLIDE',
] as const;
export type LiveMarkerName = (typeof LIVE_MARKER_NAMES)[number];

/** `[MARK:trigger]` · `[POINT:support]` · `[CAM:wide]` · `[NOTE:"volume dried up"]` */
export const LIVE_MARKER_RE =
  /\[(MARK|ZOOM|TF|COMPARE|NOTE|POINT|FLASH|CAM|ZONE|CIRCLE|ARROW|SLIDE):\s*("?)([^\]"]{1,120})\2\s*\]/g;

/**
 * What `[CAM:…]` may ask for. Each one resolves to a camera move over REAL
 * stored timestamps — the timeframe's own first and last bar, or a bar count —
 * never an invented window.
 */
export const LIVE_CAM_MOVES = ['wide', 'back', 'now'] as const;
export type LiveCamMove = (typeof LIVE_CAM_MOVES)[number];

/**
 * What `[ZONE:…]` may shade, and the pair of levels each one is made of.
 *
 * A zone is never a region someone eyeballed. Each is the band between two
 * levels that already exist on the setup, so the rectangle's top and bottom are
 * both numbers the show could already have drawn as lines.
 */
export const LIVE_ZONE_TARGETS = {
  /** Trigger down to stop: what the plan is actually risking. */
  risk: ['trigger', 'stop'],
  /** Trigger up to first target: what it is reaching for. */
  reward: ['trigger', 'target'],
  /** Support up to resistance: the box price has been stuck in. */
  range: ['support', 'resistance'],
} as const;
export type LiveZoneTarget = keyof typeof LIVE_ZONE_TARGETS;

/** What `[SLIDE:…]` may raise. `clear` puts the chart back on its own. */
export const LIVE_SLIDE_NAMES = ['fundamentals', 'news', 'evidence', 'scorecard', 'clear'] as const;
export type LiveSlideName = (typeof LIVE_SLIDE_NAMES)[number];

/** The level names a `[MARK:…]` / `[ZOOM:…]` may refer to. Nothing else resolves. */
export const LIVE_MARK_TARGETS = [
  'trigger',
  'entry',
  'stop',
  'invalidation',
  'target',
  'target2',
  'support',
  'resistance',
] as const;
export type LiveMarkTarget = (typeof LIVE_MARK_TARGETS)[number];

export type LiveMarker = {
  name: LiveMarkerName;
  value: string;
  /** Character offsets in the ORIGINAL text, so a dropped marker can be excised. */
  start: number;
  end: number;
};

/** Pull the markers out of a line. Pure; the resolver and its test share it. */
export function parseMarkers(text: string): LiveMarker[] {
  const out: LiveMarker[] = [];
  const re = new RegExp(LIVE_MARKER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      name: m[1] as LiveMarkerName,
      value: m[3].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** The line as it is SPOKEN: markers removed, spacing repaired. */
export function stripMarkers(text: string): string {
  return text
    .replace(new RegExp(LIVE_MARKER_RE.source, 'g'), '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* API payloads                                                        */
/* ------------------------------------------------------------------ */

export const LiveCurrentQuery = z.object({
  /** Everything strictly after this seq. Omit for the whole show. */
  since: z.coerce.number().int().min(-1).optional(),
  mode: LiveMode.optional(),
});
export type LiveCurrentQuery = z.infer<typeof LiveCurrentQuery>;

export const LiveCurrentResponse = z.object({
  show: LiveShow.nullable(),
  segment: LiveSegment.nullable(),
  segments: z.array(LiveSegment).default([]),
  frames: z.array(LiveFrame).default([]),
  /** The highest seq in `frames`; -1 when there are none. The client's cursor. */
  cursor: z.number().int(),
  /** Realtime channel to subscribe to for everything after `cursor`. */
  channel: z.string().nullable(),
  plain: z.string(),
});
export type LiveCurrentResponse = z.infer<typeof LiveCurrentResponse>;

export const LiveFramesQuery = z.object({
  since: z.coerce.number().int().min(-1).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
  segment_id: z.string().optional(),
});
export type LiveFramesQuery = z.infer<typeof LiveFramesQuery>;

export const LiveFramesResponse = z.object({
  show: LiveShow,
  frames: z.array(LiveFrame),
  cursor: z.number().int(),
  /** True when `limit` cut the answer short — ask again from `cursor`. */
  more: z.boolean(),
});
export type LiveFramesResponse = z.infer<typeof LiveFramesResponse>;

export const LiveRequestCreate = z.object({
  symbol: z.string().min(1).max(12),
  note: z.string().max(200).nullable().optional(),
});
export type LiveRequestCreate = z.infer<typeof LiveRequestCreate>;

export const LiveRequestRow = z.object({
  id: z.string(),
  symbol: z.string(),
  note: z.string().nullable(),
  status: z.enum(['queued', 'presented', 'skipped']),
  created_at: z.string(),
});
export type LiveRequestRow = z.infer<typeof LiveRequestRow>;

export const LiveRequestResponse = z.object({
  request: LiveRequestRow,
  /** Where it sits in the queue, 1-based. Null when the show is not running. */
  queue_position: z.number().int().min(1).nullable(),
  plain: z.string(),
});
export type LiveRequestResponse = z.infer<typeof LiveRequestResponse>;

/**
 * Operator health (`GET /live/health`).
 *
 * `buffer_depth` is the number of segments PREPARED AND NOT YET PLAYED. It is
 * the single number that says whether the show is about to go quiet, which is
 * the only failure the audience can see.
 */
export const LiveHealthResponse = z.object({
  show: LiveShow.nullable(),
  segment: LiveSegment.nullable(),
  buffer_depth: z.number().int().min(0),
  segments_done: z.number().int().min(0),
  spend_usd: z.number(),
  budget_usd_per_hour: z.number(),
  /** True once the cap has forced the director onto cached/fixture segments. */
  degraded: z.boolean(),
  last_error: z.string().nullable(),
  heartbeat_at: z.string().nullable(),
  plain: z.string(),
});
export type LiveHealthResponse = z.infer<typeof LiveHealthResponse>;

/* ------------------------------------------------------------------ */
/* Realtime                                                            */
/* ------------------------------------------------------------------ */

/** One channel per show. The worker broadcasts; every client listens. */
export function liveChannel(showId: string): string {
  return `live:${showId}`;
}

/** The single broadcast event name. Payload is one `LiveFrame`. */
export const LIVE_BROADCAST_EVENT = 'frame';

/* ------------------------------------------------------------------ */
/* Reconciliation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Merge a batch of frames into an ordered, gap-free, duplicate-free list.
 *
 * This is the whole client-side reconcile rule in one pure function, because
 * both transports feed it: a broadcast frame and a fetched frame are the same
 * frame, and the one that arrives second must be a no-op. Frames that would
 * open a GAP are held back — applying seq 12 when 10 was never seen would draw
 * a chart missing a level, and a chart missing a level is a wrong chart, not a
 * late one.
 */
export function mergeFrames(
  applied: number,
  pending: LiveFrame[],
  incoming: LiveFrame[]
): { ready: LiveFrame[]; pending: LiveFrame[]; cursor: number } {
  const bySeq = new Map<number, LiveFrame>();
  for (const f of pending) bySeq.set(f.seq, f);
  for (const f of incoming) if (f.seq > applied) bySeq.set(f.seq, f);

  const ready: LiveFrame[] = [];
  let cursor = applied;
  for (;;) {
    const next = bySeq.get(cursor + 1);
    if (!next) break;
    ready.push(next);
    bySeq.delete(cursor + 1);
    cursor += 1;
  }
  return {
    ready,
    pending: [...bySeq.values()].sort((a, b) => a.seq - b.seq),
    cursor,
  };
}
