/**
 * Playing a Kai show on the LIVE-1 chart.
 *
 * This is the client half of the LIVE-2 contract and it is deliberately not a
 * screen: `/stage-check` uses it as a harness now and the Live tab (LIVE-3) uses
 * the same object, so the reconciliation rules exist once. A second
 * implementation of "have I already applied frame 41" is a second chance to draw
 * a level twice.
 *
 * THREE THINGS IT HAS TO GET RIGHT, and they are all the same thing:
 *
 *  1. ORDER. Frames are applied strictly by `seq`. A frame that would open a gap
 *     is HELD, not applied — `mergeFrames` in `@shared/live` is the whole rule,
 *     shared with the server so both ends agree. Applying 42 when 41 never
 *     arrived draws a chart missing a level, and a chart missing a level is a
 *     wrong chart, not a late one.
 *
 *  2. IDEMPOTENCE. The same frame arrives twice — once on the broadcast, once
 *     from the table on the next reconcile — and the second one must be a
 *     no-op. Since `seq` is the identity, "already applied" is arithmetic.
 *
 *  3. THE SAME ANSWER LIVE OR LATE. Joining at frame 0 and joining at frame 41
 *     are the same call with a different `since`. There is no catch-up path
 *     separate from the replay path, because two paths eventually disagree.
 *
 * WHY REPLAY NEEDS A CLOCK AND LIVE DOES NOT. In a live show the wall clock is
 * supplied by the show itself — frames arrive when they are said. In a replay
 * every frame is available at once, so the player has to put the pacing back,
 * which is what `t_offset_ms` is for. Both land on the same performance; only
 * the source of the timing differs.
 */
import {
  mergeFrames,
  type LiveFrame,
  type SayFrame,
  type ChartFrame,
  type PresentFrame,
  type OverlayFrame,
} from '@shared/live';
import type { Annotation, PortalTimeframe } from '../portal/types';
import type { ChartHandle } from './apply';
import { applyChartCommand } from './apply';

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export type FramePage = { frames: LiveFrame[]; cursor: number; more: boolean };

/**
 * Where frames come from. Two implementations ship: the API (the truth, used for
 * replay and for every reconcile) and Supabase broadcast (the fast path, live
 * only). The player does not care which — it asks for frames after a seq and
 * optionally accepts pushes.
 */
export type LiveTransport = {
  /** Everything strictly after `since`. `since = -1` is the whole show. */
  getFrames(since: number, limit?: number): Promise<FramePage>;
  /** Optional push channel. Returns an unsubscribe. */
  subscribe?(onFrame: (f: LiveFrame) => void): () => void;
};

export type ApiTransportOpts = {
  apiBase: string;
  token: string;
  showId: string;
  fetchImpl?: typeof fetch;
};

/** The table, over HTTP. Always available; the only transport a replay needs. */
export function apiTransport(opts: ApiTransportOpts): LiveTransport {
  const f = opts.fetchImpl ?? fetch;
  return {
    async getFrames(since: number, limit = 500): Promise<FramePage> {
      const url = `${opts.apiBase}/api/v1/live/shows/${opts.showId}/frames?since=${since}&limit=${limit}`;
      const res = await f(url, { headers: { authorization: `Bearer ${opts.token}` } });
      if (!res.ok) throw new Error(`frames ${res.status}`);
      const body = (await res.json()) as { frames: LiveFrame[]; cursor: number; more: boolean };
      return { frames: body.frames ?? [], cursor: body.cursor ?? since, more: Boolean(body.more) };
    },
  };
}

/* ------------------------------------------------------------------ */
/* What the player drives                                              */
/* ------------------------------------------------------------------ */

export type LiveSink = {
  /** The chart. Null while it is still mounting; frames queue until it is there. */
  chart(): ChartHandle | null;
  /** A new symbol: load its candles and clear the marks. Awaited before frames land. */
  present(f: PresentFrame): Promise<void>;
  say(f: SayFrame): void;
  overlay(f: OverlayFrame): void;
  /** An annotation is about to be drawn — the host adds it to its own list. */
  annotations(rows: Annotation[]): void;
  /** Every applied frame, for a progress rail or a proof harness. */
  applied?(f: LiveFrame, cursor: number): void;
};

export type PlayerOptions = {
  transport: LiveTransport;
  sink: LiveSink;
  /**
   * `live` applies frames as they arrive. `replay` puts the pacing back from
   * `t_offset_ms`. A show that has ended can only be replayed.
   */
  mode: 'live' | 'replay';
  /** Replay speed. 1 is real time; 8 is a proof run that still lands in order. */
  pace?: number;
  /** Start from here. -1 (the default) is the whole show. */
  since?: number;
  /** How often to reconcile against the table while live. */
  pollMs?: number;
};

export type PlayerState = {
  cursor: number;
  applied: number;
  pending: number;
  symbol: string | null;
  running: boolean;
  error: string | null;
};

/**
 * The player.
 *
 * Single-consumer by construction: one queue, one drain loop, `await`ed
 * application. A chart command takes about a second of choreography, so frames
 * arriving during one are held rather than raced — running two `applyChartCommand`
 * sequences at once would have the second supersede the first, and the level the
 * first was drawing would silently never appear.
 */
export class LivePlayer {
  private applied = -1;
  private pending: LiveFrame[] = [];
  private queue: LiveFrame[] = [];
  private draining = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private symbol: string | null = null;
  private lastError: string | null = null;
  /** Wall-clock start of the segment being played, for replay pacing. */
  private segmentStartedAt = 0;
  private segmentId: string | null = null;

  constructor(private readonly opts: PlayerOptions) {
    this.applied = opts.since ?? -1;
  }

  state(): PlayerState {
    return {
      cursor: this.applied,
      applied: this.applied + 1,
      pending: this.pending.length,
      symbol: this.symbol,
      running: !this.stopped,
      error: this.lastError,
    };
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.reconcile();

    if (this.opts.mode === 'live') {
      if (this.opts.transport.subscribe) {
        this.unsubscribe = this.opts.transport.subscribe((f) => this.ingest([f]));
      }
      // The poll is not a fallback for the broadcast — it is the correction for
      // it. A dropped broadcast frame is invisible until something asks the
      // table what it missed, and `since = cursor` makes that one cheap query.
      this.timer = setInterval(() => void this.reconcile(), this.opts.pollMs ?? 4000);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Pull everything after the cursor. Safe to call at any time, from anywhere. */
  async reconcile(): Promise<void> {
    try {
      let since = this.applied;
      for (;;) {
        const page = await this.opts.transport.getFrames(since);
        if (!page.frames.length) break;
        this.ingest(page.frames);
        since = page.cursor;
        if (!page.more) break;
      }
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  private ingest(frames: LiveFrame[]): void {
    // `mergeFrames` reconciles against the last seq ACCOUNTED FOR, which is not
    // the last one applied: anything already queued is spoken for but has not
    // run yet. Passing the applied cursor instead would re-admit every queued
    // frame on the next poll and play the segment twice.
    const high = this.queue.length ? this.queue[this.queue.length - 1].seq : this.applied;
    const m = mergeFrames(high, this.pending, frames);
    this.pending = m.pending;
    this.queue.push(...m.ready);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.stopped) {
        const frame = this.queue.shift();
        if (!frame) break;
        await this.pace(frame);
        await this.apply(frame);
        this.applied = frame.seq;
        this.opts.sink.applied?.(frame, this.applied);
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Replay pacing: hold the frame until its offset inside the segment has
   * elapsed. Live pacing: none — the show already did it.
   */
  private async pace(frame: LiveFrame): Promise<void> {
    if (this.opts.mode !== 'replay') return;
    const pace = Math.max(0.1, this.opts.pace ?? 1);
    if (frame.segment_id !== this.segmentId) {
      this.segmentId = frame.segment_id;
      this.segmentStartedAt = Date.now();
      return;
    }
    const due = this.segmentStartedAt + frame.t_offset_ms / pace;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait);
  }

  private async apply(frame: LiveFrame): Promise<void> {
    switch (frame.kind) {
      case 'present': {
        this.symbol = frame.symbol;
        await this.opts.sink.present(frame);
        return;
      }
      case 'say': {
        this.opts.sink.say(frame);
        return;
      }
      case 'overlay': {
        this.opts.sink.overlay(frame);
        return;
      }
      case 'chart': {
        const chart = this.opts.sink.chart();
        if (!chart) return;
        const rows = frame.annotations.map(toAnnotation);
        if (rows.length) this.opts.sink.annotations(rows);
        await applyChartCommand(chart, {
          command: frame.command,
          payload: frame.payload as Record<string, unknown>,
          annotations: rows.map(toChoreo),
          timeframe: timeframeOf(frame),
          focusTs: (frame.payload.focus_ts as string) ?? null,
        });
        return;
      }
      default:
        return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

const RAILS: PortalTimeframe[] = ['1m', '5m', '15m', '1h', '4h', 'D'];

function timeframeOf(f: ChartFrame): PortalTimeframe | null {
  const raw = String(f.payload.timeframe ?? '');
  return (RAILS as string[]).includes(raw) ? (raw as PortalTimeframe) : null;
}

/** A wire `AnnotationRow` as the app's `Annotation`. Same fields, app's names. */
export function toAnnotation(row: ChartFrame['annotations'][number]): Annotation {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: (RAILS as string[]).includes(row.timeframe) ? (row.timeframe as PortalTimeframe) : null,
    kind: row.kind,
    price: row.price,
    price2: row.price2,
    ts_from: row.ts_from,
    ts_to: row.ts_to,
    text: row.text,
    reason: row.reason,
    provenance: row.provenance,
    status: row.status,
    source_alert_id: row.source_alert_id,
    source_setup_id: row.source_setup_id,
    source_plan_id: row.source_plan_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toChoreo(a: Annotation) {
  return {
    id: a.id,
    kind: a.kind,
    price: a.price,
    price2: a.price2,
    ts_from: a.ts_from,
    ts_to: a.ts_to,
    text: a.text,
    provenance: a.provenance,
    status: a.status,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/* ------------------------------------------------------------------ */
/* Candles for a presented symbol                                      */
/* ------------------------------------------------------------------ */

export type Bar = { t: string; o: number; h: number; l: number; c: number; v?: number | null };

/** `D` on the rail is `1d` on the wire. One place that knows it. */
export function apiTimeframe(tf: PortalTimeframe): string {
  return tf === 'D' ? '1d' : tf;
}

/**
 * The bars for one symbol at one resolution, from the app's own candles
 * endpoint — the same one the Trade Portal uses, so the show and the portal draw
 * identical charts for the same ticker.
 */
export async function fetchCandles(opts: {
  apiBase: string;
  token: string;
  symbol: string;
  timeframe: PortalTimeframe;
  fetchImpl?: typeof fetch;
}): Promise<Bar[]> {
  const f = opts.fetchImpl ?? fetch;
  const url = `${opts.apiBase}/api/v1/market/candles?symbol=${encodeURIComponent(opts.symbol)}&tf=${apiTimeframe(opts.timeframe)}`;
  const res = await f(url, { headers: { authorization: `Bearer ${opts.token}` } });
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const body = (await res.json()) as {
    candles: { ts: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }[];
  };
  return (body.candles ?? [])
    .filter((c) => c.o !== null && c.h !== null && c.l !== null && c.c !== null)
    .map((c) => ({ t: c.ts, o: c.o as number, h: c.h as number, l: c.l as number, c: c.c as number, v: c.v }));
}
