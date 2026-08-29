/**
 * Running a choreography against a chart.
 *
 * `choreography.ts` decides WHAT the sequence is. This file decides what it
 * means to run one, and it is the only place in the app that knows:
 *
 *  - a step waits for the PREVIOUS step to actually finish on the device, not
 *    for a `setTimeout` that guessed how long it would take;
 *  - a step that comes back `interrupted` ends the sequence THERE. The user put
 *    a finger on the chart; Kai stops moving it. Not "queue behind them", not
 *    "resume when they let go" — stop, and say so;
 *  - two commands arriving back to back are separated by a minimum gap, because
 *    below about 250ms two changes read as one confusing event rather than two
 *    clear ones;
 *  - a new command supersedes the one still running. The latest intent wins,
 *    and the abandoned one reports it rather than dying silently.
 *
 * `ChartHandle` is the imperative surface `ChartView` exposes. It is defined
 * here rather than next to the component so this module — the part with the
 * behaviour worth testing — can be unit-tested against a fake handle in bare
 * Node, with no React, no WebView and no simulator.
 */
import type { ChartCommandName } from '../portal/types';
import type { PortalTimeframe } from '../portal/types';
import type { ChoreoAnnotation, ChoreoInput, ChoreoStep, PointerTarget } from './choreography';
import { CHOREO, sequenceFor } from './choreography';

/** Why a timed command stopped. Mirrors `ChartDoneReason` on the bridge. */
export type DoneReason = 'done' | 'interrupted' | 'superseded';

export type MoveOpts = { duration?: number; jitter?: boolean };

/**
 * The camera and the pen. Every method that takes TIME resolves with the reason
 * it stopped — that return value is the whole interruption story.
 */
export type ChartHandle = {
  isReady(): boolean;

  /* data */
  setData(p: {
    symbol: string;
    timeframe: PortalTimeframe;
    candles: { t: string | number; o: number; h: number; l: number; c: number; v?: number | null }[];
    lastPrice?: number | null;
    resetView?: boolean;
  }): void;
  updateLast(c: { t: string | number; o: number; h: number; l: number; c: number; v?: number | null }): void;
  setVolume(on: boolean): void;
  setReducedMotion(on: boolean): void;

  /* camera */
  scrollByBars(bars: number, o?: MoveOpts): Promise<DoneReason>;
  scrollToTime(time: string | number, o?: MoveOpts & { align?: 'left' | 'center' | 'right' }): Promise<DoneReason>;
  scrollToNow(o?: MoveOpts): Promise<DoneReason>;
  zoomTo(barSpacing: number, o?: MoveOpts & { anchorTime?: string | number | null }): Promise<DoneReason>;
  zoomToRange(from: string | number, to: string | number, o?: MoveOpts & { padding?: number }): Promise<DoneReason>;
  fit(o?: MoveOpts): Promise<DoneReason>;
  cancelMotion(): void;

  /** The rail button presses, then the chart crossfades. Never a hard cut. */
  setTimeframe(tf: PortalTimeframe): Promise<DoneReason>;

  /* Kai's pointer */
  pointerMoveTo(target: PointerTarget, o?: MoveOpts): Promise<DoneReason>;
  pointerPress(rail?: PortalTimeframe): Promise<DoneReason>;
  pointerHide(): void;

  /* annotations */
  setAnnotations(list: ChoreoAnnotation[]): void;
  addAnnotations(list: ChoreoAnnotation[]): void;
  removeAnnotations(ids: string[]): void;
  flashAnnotation(id: string, pulses?: number): void;
  setAnnotationsHidden(on: boolean): void;
};

/* ------------------------------------------------------------------ */
/* Running one sequence                                                */
/* ------------------------------------------------------------------ */

export type RunResult = { reason: DoneReason; completed: number; total: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Walk the steps. Stops at the first `interrupted` or `superseded`.
 *
 * `abort` lets a caller kill a sequence it no longer wants (the screen
 * unmounted, a newer command arrived) without waiting for the current step.
 */
export async function runSequence(
  handle: ChartHandle,
  steps: ChoreoStep[],
  abort?: { aborted: boolean },
): Promise<RunResult> {
  let completed = 0;
  for (const step of steps) {
    if (abort?.aborted) return { reason: 'superseded', completed, total: steps.length };

    let reason: DoneReason = 'done';
    switch (step.do) {
      case 'wait': await sleep(step.duration); break;
      case 'pointer.moveTo': reason = await handle.pointerMoveTo(step.target, { duration: step.duration }); break;
      case 'pointer.press': reason = await handle.pointerPress(step.rail); break;
      case 'pointer.hide': handle.pointerHide(); break;
      case 'setTimeframe': reason = await handle.setTimeframe(step.timeframe); break;
      case 'camera.scrollToTime':
        reason = await handle.scrollToTime(step.time, { align: step.align, duration: step.duration });
        break;
      case 'camera.scrollByBars': reason = await handle.scrollByBars(step.bars, { duration: step.duration }); break;
      case 'camera.scrollToNow': reason = await handle.scrollToNow({ duration: step.duration }); break;
      case 'camera.zoomTo':
        reason = await handle.zoomTo(step.barSpacing, { anchorTime: step.anchorTime, duration: step.duration });
        break;
      case 'camera.zoomToRange':
        reason = await handle.zoomToRange(step.from, step.to, { padding: step.padding, duration: step.duration });
        break;
      case 'camera.fit': reason = await handle.fit({ duration: step.duration }); break;
      case 'annotations.add': handle.addAnnotations(step.annotations); break;
      case 'annotations.remove': handle.removeAnnotations(step.ids); break;
      case 'annotations.flash': handle.flashAnnotation(step.id, step.pulses); break;
      default: break;
    }
    completed += 1;

    if (reason !== 'done') {
      // The finger wins. Take the pointer off the glass so Kai is not left
      // hovering over a chart he is no longer driving.
      if (reason === 'interrupted') handle.pointerHide();
      return { reason, completed, total: steps.length };
    }
  }
  return { reason: 'done', completed, total: steps.length };
}

/* ------------------------------------------------------------------ */
/* One command, end to end                                             */
/* ------------------------------------------------------------------ */

/**
 * The frame as the portal has already resolved it: the annotations are real
 * rows (from the server, or derived client-side from the alert / plan / setup
 * on screen), and no number is created here. This module only performs.
 */
export type ResolvedCommand = {
  command: ChartCommandName;
  payload?: Record<string, unknown>;
  annotations?: ChoreoAnnotation[];
  removeIds?: string[];
  timeframe?: PortalTimeframe | null;
  focusTs?: string | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Read the choreography's inputs out of a resolved frame. Pure, and tested. */
export function choreoInput(cmd: ResolvedCommand): ChoreoInput {
  const p = cmd.payload ?? {};
  const range = (p.range ?? {}) as Record<string, unknown>;
  const pointer: PointerTarget | null =
    cmd.command === 'pointer_hint'
      ? {
          price: num(p.price),
          time: str(p.ts),
          rail: (['1m', '5m', '15m', '1h', '4h', 'D'] as string[]).includes(String(p.rail))
            ? (String(p.rail) as PortalTimeframe)
            : undefined,
        }
      : null;

  return {
    command: cmd.command,
    annotations: cmd.annotations ?? [],
    removeIds: cmd.removeIds ?? (str(p.annotation_id) ? [String(p.annotation_id)] : []),
    timeframe: cmd.timeframe ?? null,
    focusTs: cmd.focusTs ?? str(p.focus_ts) ?? str(p.ts),
    rangeFrom: str(p.from) ?? str(range.from),
    rangeTo: str(p.to) ?? str(range.to),
    bars: num(p.bars),
    flashId: str(p.annotation_id),
    pulses: num(p.pulses),
    pointer,
    linger: p.linger === true,
  };
}

/**
 * A queue of one. Two commands in the same breath are spaced by `CHOREO.gap`;
 * a third arriving while the second is mid-flight supersedes it, because the
 * newest intent is the one the user is owed.
 */
let running: { abort: { aborted: boolean } } | null = null;
let lastEndedAt = 0;

/** Test seam: the queue is module state, and a test must be able to reset it. */
export function resetChartCommandQueue(): void {
  if (running) running.abort.aborted = true;
  running = null;
  lastEndedAt = 0;
}

/**
 * Apply one Kai command to the chart, choreographed.
 *
 * Returns the run result so the caller can pace narration against it — Live
 * (LIVE-2) aligns audio to `done`, and the Portal keeps narrating as it does
 * today.
 */
export async function applyChartCommand(
  handle: ChartHandle,
  cmd: ResolvedCommand,
  opts: { now?: () => number } = {},
): Promise<RunResult> {
  const steps = sequenceFor(choreoInput(cmd));
  if (!steps.length) return { reason: 'done', completed: 0, total: 0 };

  if (running) {
    running.abort.aborted = true;
    handle.cancelMotion();
  }
  const mine = { abort: { aborted: false } };
  running = mine;

  const now = opts.now ?? (() => Date.now());
  const since = now() - lastEndedAt;
  if (lastEndedAt && since < CHOREO.gap) await sleep(CHOREO.gap - since);
  if (mine.abort.aborted) return { reason: 'superseded', completed: 0, total: steps.length };

  const result = await runSequence(handle, steps, mine.abort);
  if (running === mine) running = null;
  lastEndedAt = now();
  return result;
}
