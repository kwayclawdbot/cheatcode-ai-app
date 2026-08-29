/**
 * The director: one producer, one consumer, a buffer of two between them.
 *
 * While segment N plays, N+1 is finished and waiting and N+2 is being analyzed.
 * That is the entire reason the show can be generated live rather than rendered
 * in advance — a segment takes tens of seconds to write and speak, and plays for
 * several minutes, so the pipeline only has to stay one segment ahead.
 *
 * MODE IS A STRATEGY OBJECT, NOT A FORK. `Mode` below has exactly three
 * decisions in it — what to do when the rundown runs dry, whether the show ends
 * when it does, and how long a segment may run. LIVE-4 (market hours) adds a
 * mode that waits on `setup_events` instead of ending, and nothing else in this
 * file changes. The brief asks for that shape specifically, and it is worth the
 * indirection: an `if (marketHours)` sprayed through a producer/consumer loop is
 * the kind of thing that is impossible to remove later.
 *
 * THE THING THE AUDIENCE CAN SEE IS SILENCE. Everything else — a dropped level,
 * a skipped timeframe, a degraded budget — is invisible to them. So the one
 * failure this loop refuses is an empty buffer with nothing to say: it emits a
 * cohost bridge and keeps going. A bridge that says "give us a second" is a show.
 * Four seconds of nothing is a stream that has crashed.
 *
 * FRAMES ARE WRITTEN BEFORE THEY ARE BROADCAST, always. The table is the truth
 * and the broadcast is the fast path; a frame seen live and missing from the
 * replay is the one inconsistency a viewer cannot fix by refreshing.
 */
import {
  type ChartFrame,
  type LiveFrame,
  type LiveSegmentSource,
  liveChannel,
} from '../../../packages/shared/live.ts';
import { Broadcaster, db } from './db.ts';
import { config } from './config.ts';
import { log, money, say } from './log.ts';
import { Budget } from './budget.ts';
import { Health } from './health.ts';
import { PrepBuffer } from './buffer.ts';
import { SourceRouter } from './sources.ts';
import { fetchMarket, type Candidate, type MarketBundle } from './api.ts';
import { analyzeSegment, TF_ORDER } from './analyze.ts';
import { contradictions, resolveScript, type ResolvedBeat } from './resolve.ts';
import { estimateDurationMs, speak, ttsStatus } from './tts.ts';

/* ------------------------------------------------------------------ */
/* Mode                                                                */
/* ------------------------------------------------------------------ */

export type Mode = {
  name: 'review' | 'market';
  title: (date: Date) => string;
  /** What to do when the router has nothing. `end` closes the show. */
  onDry: 'end' | 'wait';
  /** How long to wait before asking again, when `onDry` is `wait`. */
  dryPollMs: number;
};

export const REVIEW_MODE: Mode = {
  name: 'review',
  title: (d) =>
    `Kai Live — the review, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
  // A review show covers today's setups, requests and winners and then it is
  // over. Padding it out is how a fifteen-minute show becomes a bad hour.
  onDry: 'end',
  dryPollMs: 0,
};

/** LIVE-4 fills this in: the same loop, fed by `setup_events` instead. */
export const MARKET_MODE: Mode = {
  name: 'market',
  title: (d) => `Kai Live — ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
  onDry: 'wait',
  dryPollMs: 20_000,
};

/* ------------------------------------------------------------------ */
/* A prepared segment                                                  */
/* ------------------------------------------------------------------ */

type Prepared = {
  candidate: Candidate;
  market: MarketBundle;
  beats: ResolvedBeat[];
  costUsd: number;
  notes: string[];
  dropped: { marker: string; why: string }[];
};

export type DirectorResult = {
  showId: string;
  segments: number;
  frames: number;
  spendUsd: number;
  perSegment: { seq: number; symbol: string; source: string; cost_usd: number; frames: number }[];
  degraded: boolean;
  ttsAvailable: boolean;
};

export class Director {
  private readonly budget: Budget;
  private readonly buffer: PrepBuffer<Prepared>;
  private readonly router: SourceRouter;
  private broadcaster: Broadcaster | null = null;
  private health: Health | null = null;

  private showId = '';
  private seq = 0;
  private segmentSeq = 0;
  /** Row counter for `live_segments.seq`. Bridges take a slot like anything else. */
  private segmentRow = 0;
  private frameCount = 0;
  private readonly perSegment: DirectorResult['perSegment'] = [];
  private stopping = false;

  constructor(
    private readonly mode: Mode,
    opts: { budget?: Budget; maxSegments?: number } = {}
  ) {
    this.budget = opts.budget ?? new Budget();
    this.buffer = new PrepBuffer<Prepared>(config.prepDepth());
    this.router = new SourceRouter(mode.name);
    this.maxSegments = opts.maxSegments ?? config.maxSegments();
  }

  private readonly maxSegments: number;

  /* ---------------------------------------------------------------- */
  /* Show lifecycle                                                    */
  /* ---------------------------------------------------------------- */

  async run(): Promise<DirectorResult> {
    await this.openShow();
    this.health = new Health(this.showId, this.budget);

    const heartbeat = setInterval(() => {
      void this.health!.beat({
        bufferDepth: this.buffer.readyDepth,
        segmentsDone: this.perSegment.length,
        ttsReady: ttsStatus().available,
      });
    }, 5000);

    const stop = () => {
      this.stopping = true;
      this.buffer.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
      await Promise.all([this.produce(), this.consume()]);
    } finally {
      clearInterval(heartbeat);
      await this.closeShow();
      await this.broadcaster?.close();
    }

    return {
      showId: this.showId,
      segments: this.perSegment.length,
      frames: this.frameCount,
      spendUsd: this.budget.total(),
      perSegment: this.perSegment,
      degraded: this.budget.degraded,
      ttsAvailable: ttsStatus().available,
    };
  }

  private async openShow(): Promise<void> {
    // One live show per mode is a unique index in 0023, so an abandoned show
    // from a crashed run would block this one. Ending it is correct rather than
    // rude: nobody is watching a show whose director is gone.
    await db()
      .from('live_shows')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('mode', this.mode.name)
      .eq('status', 'live');

    const { data, error } = await db()
      .from('live_shows')
      .insert({
        mode: this.mode.name,
        status: 'live',
        title: this.mode.title(new Date()),
        started_at: new Date().toISOString(),
        meta: { generator: 'kai-live', model: config.kaiModel() },
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`could not open a show: ${error?.message}`);
    this.showId = String(data.id);
    say('');
    say(`  ${this.mode.title(new Date())}`);
    say(`  show ${this.showId}`);
    say(`  channel ${liveChannel(this.showId)}`);
    say('');

    this.broadcaster = new Broadcaster(this.showId);
    await this.broadcaster.open();
  }

  private async closeShow(): Promise<void> {
    await db()
      .from('live_shows')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', this.showId);
  }

  /* ---------------------------------------------------------------- */
  /* Producer                                                          */
  /* ---------------------------------------------------------------- */

  private async produce(): Promise<void> {
    /**
     * Consecutive failed preps.
     *
     * The first four-segment run spun here: the budget degraded, every
     * `prepare` returned null, `settle('skipped')` handed the symbol back to the
     * router, and the router handed it straight back — a hot loop that only
     * stopped because the segment limit did. A producer that cannot make
     * progress has to stop rather than try faster.
     */
    let consecutiveFailures = 0;

    while (!this.stopping) {
      if (this.maxSegments && this.segmentSeq >= this.maxSegments && !this.buffer.readyDepth) break;
      if (this.maxSegments && this.segmentSeq >= this.maxSegments) {
        // Enough queued. Wait for the consumer to drain rather than spinning.
        await sleep(500);
        continue;
      }

      const slot = await this.buffer.waitForSlot();
      if (!slot || this.stopping) break;

      const candidate = await this.router.next(this.buffer.blocked());
      if (!candidate) {
        if (this.mode.onDry === 'end') break;
        await sleep(this.mode.dryPollMs);
        continue;
      }

      this.buffer.startPrep(candidate.symbol);
      try {
        const prepared = await this.prepare(candidate);
        if (prepared) {
          this.buffer.push(candidate.symbol, prepared);
          consecutiveFailures = 0;
        } else {
          this.buffer.abortPrep(candidate.symbol, 'nothing usable came back');
          await this.router.settle(candidate.symbol, 'skipped');
          consecutiveFailures += 1;
        }
      } catch (e) {
        this.health?.recordError(`prepare ${candidate.symbol}`, e);
        this.buffer.abortPrep(candidate.symbol, String(e));
        await this.router.settle(candidate.symbol, 'skipped');
        consecutiveFailures += 1;
      }

      if (consecutiveFailures >= 3) {
        // Degraded with nothing cached means there is no cheaper segment to
        // fall back to, so the honest end is to stop producing and let the
        // consumer play out what is already made.
        log('warn', 'director.producer_stopped', {
          consecutive_failures: consecutiveFailures,
          degraded: this.budget.degraded,
          note: this.budget.degraded
            ? 'the cap is reached and nothing is cached to fall back to'
            : 'three preps in a row produced nothing usable',
        });
        this.health?.recordDegraded('The producer stopped after three preps in a row produced nothing.');
        break;
      }
      // A beat between failures. Without it a failing router is a busy loop.
      if (consecutiveFailures) await sleep(750);
    }
    // The consumer must not wait forever on a producer that has finished.
    this.buffer.close();
  }

  /**
   * One segment, built.
   *
   * The budget check happens FIRST, before a single token is spent, using the
   * running average cost of a segment. Checking afterwards would mean the cap is
   * discovered by breaching it, and the whole point of a projection is that the
   * expensive thing does not happen.
   */
  private async prepare(candidate: Candidate): Promise<Prepared | null> {
    const seq = this.segmentSeq;

    if (this.budget.wouldBreach()) {
      this.budget.markDegraded();
      this.health?.recordDegraded(
        `Spending would pass ${money(this.budget.cap)} an hour, so segments are cached-only from here.`
      );
      // Degraded means: no new model spend. A segment whose audio is already in
      // the cache still plays for free, but there is nothing cached for a symbol
      // that has never been on the show, so this one is skipped rather than
      // half-made.
      log('warn', 'director.segment_skipped_budget', { symbol: candidate.symbol });
      return null;
    }

    const t0 = Date.now();
    const market = await fetchMarket(
      candidate.symbol,
      TF_ORDER.map((t) => t.api)
    );

    const usable = market.timeframes.filter((t) => t.candles.length >= 10).length;
    if (!usable) {
      log('warn', 'director.no_bars', { symbol: candidate.symbol });
      return null;
    }

    const next = this.buffer.peekNext();
    const analysis = await analyzeSegment({
      budget: this.budget,
      segment: seq,
      candidate,
      market,
      nextSymbol: next?.symbol ?? null,
    });
    if (!analysis) return null;

    /**
     * The contradiction gate, applied to the WHOLE script.
     *
     * `lib/kai/contradiction.ts` semantics: a narration that disagrees with the
     * setup's own direction or levels, or that quotes a price no object carries,
     * is rejected. Rejected once means regenerated once — which here means the
     * resolver's per-sentence rewrite gets its chance first — and a script still
     * contradicting itself after that is skipped, not shipped.
     */
    const spokenName = market.company.name ?? '';
    const structural = contradictions(candidate, '', [spokenName]).filter(
      (f) => !f.startsWith('narration says')
    );
    if (structural.length) {
      log('warn', 'director.setup_incoherent', { symbol: candidate.symbol, failures: structural });
      return null;
    }

    const resolved = await resolveScript({
      script: analysis.script,
      candidate,
      market,
      budget: this.budget,
      segment: seq,
    });

    const after = resolved.beats.map((b) => b.text).join(' ');
    const stillWrong = contradictions(candidate, after, [spokenName]);
    if (stillWrong.length) {
      log('warn', 'director.contradiction_after_rewrite', {
        symbol: candidate.symbol,
        failures: stillWrong,
        note: 'segment dropped rather than aired',
      });
      return null;
    }

    if (resolved.dropped.length) {
      log('warn', 'director.markers_dropped', {
        symbol: candidate.symbol,
        dropped: resolved.dropped.map((d) => `${d.marker} — ${d.why}`),
        rewrites: resolved.rewrites,
      });
    }

    log('info', 'director.prepared', {
      symbol: candidate.symbol,
      source: candidate.source,
      beats: resolved.beats.length,
      annotations: resolved.annotationsCreated,
      dropped: resolved.dropped.length,
      ms: Date.now() - t0,
      usd: money(this.budget.forSegment(seq)),
    });

    this.segmentSeq += 1;
    return {
      candidate,
      market,
      beats: resolved.beats,
      costUsd: this.budget.forSegment(seq),
      notes: analysis.notes,
      dropped: resolved.dropped,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Consumer                                                          */
  /* ---------------------------------------------------------------- */

  private async consume(): Promise<void> {
    let played = 0;
    for (;;) {
      if (this.stopping) break;
      const item = await this.buffer.popNext();
      if (!item) break;

      // The slot is released BEFORE the segment plays, so the producer starts on
      // the next one immediately instead of waiting out several minutes of
      // playback. This is the whole pipelining trick.
      this.buffer.markPlayed(item.symbol);

      await this.playSegment(item.value, played);
      played += 1;

      if (this.maxSegments && played >= this.maxSegments) {
        this.stopping = true;
        this.buffer.close();
        break;
      }

      // Nothing ready and the producer still working: bridge rather than go
      // quiet. The bridge is a real frame with a real seq — a viewer joining
      // during it sees the show saying something, not a gap in the timeline.
      if (!this.buffer.readyDepth && !this.buffer.inFlightCount && this.router.done) break;
      if (!this.buffer.readyDepth && !this.stopping) await this.bridge();
    }
  }

  /** Emitted when the buffer is empty and the show would otherwise be silent. */
  private async bridge(): Promise<void> {
    // `live_segments` is unique on (show_id, symbol) — the router's no-repeat
    // rule made durable — so a bridge needs a symbol of its own rather than a
    // placeholder that would collide with the second bridge of the show.
    const segmentId = await this.openSegment({
      symbol: `BRIDGE-${this.segmentRow}`,
      source: 'watchlist',
      meta: { kind: 'bridge', reason: 'buffer empty' },
    });
    if (!segmentId) return;
    const text = 'Give us a moment while we line the next one up.';
    const audio = await speak({ text, voice: 'cohost', budget: this.budget, segment: -1 });
    await this.emit({
      kind: 'say',
      show_id: this.showId,
      segment_id: segmentId,
      seq: this.seq,
      t_offset_ms: 0,
      voice: 'cohost',
      text,
      audio_url: audio.audio_url,
      duration_ms: audio.duration_ms,
      audio_state: audio.state,
      glossary: [],
    });
    await this.closeSegment(segmentId, 0);
    log('info', 'director.bridge', { note: 'buffer was empty' });
  }

  private async openSegment(opts: {
    symbol: string;
    source: LiveSegmentSource;
    meta?: Record<string, unknown>;
  }): Promise<string | null> {
    const { data, error } = await db()
      .from('live_segments')
      .insert({
        show_id: this.showId,
        seq: this.segmentRow++,
        symbol: opts.symbol,
        source: opts.source,
        state: 'playing',
        prepared_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        meta: opts.meta ?? {},
      })
      .select('id')
      .single();
    if (error || !data) {
      this.health?.recordError('openSegment', error?.message ?? 'no row');
      return null;
    }
    return String(data.id);
  }

  private async closeSegment(id: string, costUsd: number): Promise<void> {
    await db()
      .from('live_segments')
      .update({ state: 'done', ended_at: new Date().toISOString(), cost_usd: costUsd })
      .eq('id', id);
  }

  /**
   * Play one prepared segment: a `present` frame, then, per beat, a `say` frame
   * followed by that beat's chart frames at their measured offsets.
   *
   * PLAYBACK IS ON THE WALL CLOCK. The director waits out each line's real
   * duration before emitting the next, because the timeline is consumed live by
   * anyone watching — emitting a whole segment at once would deliver forty
   * frames in a hundred milliseconds and leave the client to invent the pacing
   * from `t_offset_ms`. A replay reconstructs pacing from the offsets; a live
   * viewer gets it from the clock, and both land on the same show.
   */
  private async playSegment(p: Prepared, index: number): Promise<void> {
    const segmentId = await this.openSegment({
      symbol: p.candidate.symbol,
      source: p.candidate.source,
      meta: {
        headline: p.candidate.headline,
        grade: p.candidate.grade_display,
        notes: p.notes,
        dropped: p.dropped,
      },
    });
    if (!segmentId) return;

    /**
     * TWO CLOCKS, AND THE DIFFERENCE MATTERS.
     *
     * `t` is the LOGICAL clock: milliseconds from the start of the segment,
     * accumulated from the real measured duration of each line. It is what goes
     * into `t_offset_ms`, so a replay reconstructs the exact pacing of the show.
     *
     * The wall clock is what the director actually sleeps on, and `LIVE_PACE`
     * divides it. A dev run at pace 8 produces a timeline identical to a live
     * one — same offsets, same order — in an eighth of the time. If the pace
     * scaled `t` as well, a fast run would record a show nobody could play back
     * at the right speed, which is the kind of test artifact that lies.
     */
    let t = 0;
    let framesHere = 0;
    const emit = async (f: LiveFrame) => {
      await this.emit(f);
      framesHere += 1;
    };
    const pace = Math.max(1, Number(process.env.LIVE_PACE ?? 1));

    say('');
    say(`  ── ${index + 1}. ${p.candidate.symbol} (${p.candidate.source}) ─────────────`);

    await emit({
      kind: 'present',
      show_id: this.showId,
      segment_id: segmentId,
      seq: this.seq,
      t_offset_ms: 0,
      symbol: p.candidate.symbol,
      timeframe: 'D',
      headline: p.candidate.headline,
      source: p.candidate.source,
    });

    await emit({
      kind: 'overlay',
      show_id: this.showId,
      segment_id: segmentId,
      seq: this.seq,
      t_offset_ms: 0,
      overlay: 'ticker_rail',
      payload: {
        symbol: p.candidate.symbol,
        name: p.market.company.name,
        price: p.market.quote.price,
        change_pct: p.market.quote.change_pct,
        grade: p.candidate.grade_display,
      },
    });

    for (const beat of p.beats) {
      const audio = ttsStatus().available
        ? await speak({ text: beat.text, voice: beat.voice, budget: this.budget, segment: index })
        : {
            audio_url: null,
            duration_ms: estimateDurationMs(beat.text),
            state: 'estimated' as const,
            cached: false,
          };

      await emit({
        kind: 'say',
        show_id: this.showId,
        segment_id: segmentId,
        seq: this.seq,
        t_offset_ms: t,
        voice: beat.voice,
        text: beat.text,
        audio_url: audio.audio_url,
        duration_ms: audio.duration_ms,
        audio_state: audio.state,
        glossary: beat.glossary,
      });

      say(`     ${beat.voice === 'kai' ? 'KAI ' : 'HOST'} │ ${beat.text}`);

      // Chart actions land under the words that describe them: the fraction the
      // resolver recorded, against this line's real duration.
      let spoken = 0;
      for (const a of beat.actions) {
        const at = Math.round(a.at * audio.duration_ms);
        if (at > spoken) {
          await sleep((at - spoken) / pace);
          spoken = at;
        }
        await emit({
          kind: 'chart',
          show_id: this.showId,
          segment_id: segmentId,
          seq: this.seq,
          t_offset_ms: t + spoken,
          command: a.command,
          payload: a.payload,
          annotations: a.annotations as ChartFrame['annotations'],
          annotation_ids: a.annotation_ids,
          narration: a.narration,
          provenance: a.provenance,
        });
        say(`          ↳ ${a.command}${a.payload.level ? ` ${a.payload.level}` : ''}`);
      }

      if (audio.duration_ms > spoken) await sleep((audio.duration_ms - spoken) / pace);
      // A beat of air between lines. Below about a quarter second two lines run
      // together and read as one confusing sentence.
      await sleep(320 / pace);
      t += audio.duration_ms + 320;
    }

    await emit({
      kind: 'overlay',
      show_id: this.showId,
      segment_id: segmentId,
      seq: this.seq,
      t_offset_ms: t,
      overlay: 'clear',
      payload: {},
    });

    await this.closeSegment(segmentId, p.costUsd);
    await this.router.settle(p.candidate.symbol, 'presented', segmentId);
    this.perSegment.push({
      seq: index,
      symbol: p.candidate.symbol,
      source: p.candidate.source,
      cost_usd: Math.round(p.costUsd * 1_000_000) / 1_000_000,
      frames: framesHere,
    });
  }

  /**
   * Table first, broadcast second. Always in that order — see the header.
   *
   * `seq` is assigned here and nowhere else, which is what makes it gap-free:
   * there is exactly one counter, incremented only after a successful write, so
   * a failed write leaves no hole.
   */
  private async emit(frame: LiveFrame): Promise<void> {
    const { error } = await db().from('live_frames').insert({
      show_id: frame.show_id,
      segment_id: frame.segment_id,
      seq: frame.seq,
      kind: frame.kind,
      payload: frame,
      t_offset_ms: frame.t_offset_ms,
    });
    if (error) {
      this.health?.recordError('emit', error.message);
      return;
    }
    this.seq += 1;
    this.frameCount += 1;
    await this.broadcaster?.send(frame);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
