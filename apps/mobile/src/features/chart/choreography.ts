/**
 * Choreography — how a Kai command LOOKS while it happens.
 *
 * The owner's bar for this lane: *"It should feel like Kai is a real person
 * clicking through and scrolling through charts."* Everything in this file
 * exists to close the gap between those two sentences:
 *
 *   a script:  annotations.push(level); setState()
 *   a person:  the cursor travels to the price · pauses · the line draws itself
 *              left to right · the label catches up · the cursor lingers a beat
 *              on what it just did · and leaves
 *
 * Same end state. Completely different thing to watch.
 *
 * PURE ON PURPOSE. This module imports no React, no WebView, no handle — it
 * turns one command into an ARRAY OF STEPS with durations, and nothing else.
 * That is what makes the feel of the product testable: you can assert that
 * `mark_level` puts the pointer on the price BEFORE the line appears, in a unit
 * test, with no simulator and no eyes. `apply.ts` is the only thing that runs
 * these steps, and Kai Live (LIVE-2) will reuse the same sequences to drive the
 * broadcast chart.
 *
 * THREE RULES ENCODED HERE
 *  1. Attention precedes change. The pointer arrives before the thing it is
 *     about to do. A level that appears where nobody was looking is a render.
 *  2. Nothing is instant, and nothing is slow. Every number below was chosen to
 *     be felt but not waited for; the whole of `mark_level` is ~1.1s, which is
 *     roughly how long a person takes to point at something and say what it is.
 *  3. Nothing is exact. Every duration is jittered ±10% at the bridge, so six
 *     `mark_level`s in a row are six slightly different lengths rather than a
 *     metronome. Machines are precise. People are not.
 */
import type { ChartCommandName } from '../portal/types';
import type { PortalTimeframe } from '../portal/types';

/* ------------------------------------------------------------------ */
/* Timings — one table, tunable in one place                           */
/* ------------------------------------------------------------------ */

export const CHOREO = {
  /** Pointer travel across the plot. Long enough to follow, short enough not to wait for. */
  pointerTravel: 420,
  /** Travel to a rail button — a shorter, more confident move to a known target. */
  pointerToRail: 300,
  /** The beat between arriving somewhere and acting on it. This is the "person" beat. */
  beforeAct: 120,
  /** How long the pointer stays on what it just did, before leaving. */
  linger: 200,
  /** The line drawing itself left → right. Matches ANN_DRAW_MS in the page. */
  drawIn: 220,
  /** The label catching up behind the line. */
  chipIn: 160,
  /** Rail press → crossfade → new bars. */
  press: 90,
  crossfade: 250,
  /** Camera moves. */
  scroll: 450,
  scrollLong: 600,
  zoom: 500,
  fit: 380,
  /** How long a comparison is held before coming back. */
  hold: 1000,
  /** Between the legs of a multi-level plan, in the order Kai narrates them. */
  planLeg: 700,
  /** The floor between two commands in a stream. Below this they read as one event. */
  gap: 250,
} as const;

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** An annotation as the chart page needs it. Geometry and meaning, never colour. */
export type ChoreoAnnotation = {
  id: string;
  kind: string;
  price?: number | null;
  price2?: number | null;
  ts_from?: string | number | null;
  ts_to?: string | number | null;
  text?: string | null;
  provenance?: string;
  status?: string;
};

export type PointerTarget = {
  price?: number | null;
  time?: string | number | null;
  /** 0..1 fraction of the plot width, when there is no meaningful time. */
  x?: number;
  y?: number;
  /** Park on a timeframe button — the one target that is not on the plot. */
  rail?: PortalTimeframe;
};

export type ChoreoStep =
  | { do: 'pointer.moveTo'; target: PointerTarget; duration: number }
  | { do: 'pointer.press'; rail?: PortalTimeframe }
  | { do: 'pointer.hide' }
  | { do: 'wait'; duration: number }
  | { do: 'setTimeframe'; timeframe: PortalTimeframe }
  | { do: 'camera.scrollToTime'; time: string | number; align: 'left' | 'center' | 'right'; duration: number }
  | { do: 'camera.scrollByBars'; bars: number; duration: number }
  | { do: 'camera.scrollToNow'; duration: number }
  | { do: 'camera.zoomTo'; barSpacing: number; anchorTime?: string | number | null; duration: number }
  | { do: 'camera.zoomToRange'; from: string | number; to: string | number; padding: number; duration: number }
  | { do: 'camera.fit'; duration: number }
  | { do: 'annotations.add'; annotations: ChoreoAnnotation[] }
  | { do: 'annotations.remove'; ids: string[] }
  | { do: 'annotations.flash'; id: string; pulses: number };

/** What `sequenceFor` needs to know. Already RESOLVED — no numbers are invented here. */
export type ChoreoInput = {
  command: ChartCommandName;
  /** Annotations this command creates or changes, resolved from real objects. */
  annotations?: ChoreoAnnotation[];
  removeIds?: string[];
  timeframe?: PortalTimeframe | null;
  /** The candle the command is about (a trigger, an event). */
  focusTs?: string | number | null;
  /** For `compare_prior` / `zoom_range`. */
  rangeFrom?: string | number | null;
  rangeTo?: string | number | null;
  bars?: number | null;
  flashId?: string | null;
  pulses?: number | null;
  pointer?: PointerTarget | null;
  /** Leave the pointer on screen when the sequence ends (`pointer_hint` linger). */
  linger?: boolean;
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Where the pointer should stand for one annotation. Price wins; time places it laterally. */
function anchorOf(a: ChoreoAnnotation): PointerTarget {
  return {
    price: isNum(a.price) ? a.price : null,
    time: a.ts_from ?? null,
    x: a.ts_from == null ? 0.62 : undefined,
  };
}

/**
 * Point at it, wait a beat, draw it, let the label catch up, linger, leave.
 * This four-step shape is the atom every marking command is built from.
 */
function markOne(a: ChoreoAnnotation, opts: { hide?: boolean; travel?: number } = {}): ChoreoStep[] {
  return [
    { do: 'pointer.moveTo', target: anchorOf(a), duration: opts.travel ?? CHOREO.pointerTravel },
    { do: 'wait', duration: CHOREO.beforeAct },
    { do: 'annotations.add', annotations: [a] },
    { do: 'wait', duration: CHOREO.drawIn + CHOREO.chipIn },
    { do: 'wait', duration: CHOREO.linger },
    ...(opts.hide === false ? [] : ([{ do: 'pointer.hide' }] as ChoreoStep[])),
  ];
}

/* ------------------------------------------------------------------ */
/* The sequences                                                       */
/* ------------------------------------------------------------------ */

/**
 * One command → the steps that make it look performed rather than applied.
 * Returns an empty array when there is nothing to show, which is a real answer:
 * a command whose level could not be resolved must move nothing at all.
 */
export function sequenceFor(input: ChoreoInput): ChoreoStep[] {
  const anns = input.annotations ?? [];

  switch (input.command) {
    /* ---- marking ---- */

    case 'mark_level':
    case 'highlight_community': {
      if (!anns.length) return [];
      // One level is the atom. Several arriving from one command are still one
      // gesture, so they share a single pointer trip rather than staging a
      // little performance each.
      if (anns.length === 1) return markOne(anns[0]);
      return [
        { do: 'pointer.moveTo', target: anchorOf(anns[0]), duration: CHOREO.pointerTravel },
        { do: 'wait', duration: CHOREO.beforeAct },
        { do: 'annotations.add', annotations: anns },
        { do: 'wait', duration: CHOREO.drawIn + CHOREO.chipIn + CHOREO.linger },
        { do: 'pointer.hide' },
      ];
    }

    case 'show_invalidation': {
      if (!anns.length) return [];
      const stop = anns[0];
      return [
        ...markOne(stop, { hide: false }),
        // Two pulses on what breaks the trade. The line does not move — a price
        // line that moves to get attention is a lie about the price.
        { do: 'annotations.flash', id: stop.id, pulses: 2 },
        { do: 'wait', duration: 640 },
        { do: 'pointer.hide' },
      ];
    }

    case 'mark_plan': {
      if (!anns.length) return [];
      // Entry, then stop, then target — the order Kai narrates them, ~700ms
      // apart. Drawing all three at once would be correct and unreadable: the
      // user would have no idea which one he was talking about.
      const steps: ChoreoStep[] = [];
      anns.forEach((a, i) => {
        steps.push({ do: 'pointer.moveTo', target: anchorOf(a), duration: i === 0 ? CHOREO.pointerTravel : 320 });
        steps.push({ do: 'wait', duration: CHOREO.beforeAct });
        steps.push({ do: 'annotations.add', annotations: [a] });
        if (i < anns.length - 1) steps.push({ do: 'wait', duration: CHOREO.planLeg - 320 - CHOREO.beforeAct });
      });
      steps.push({ do: 'wait', duration: CHOREO.drawIn + CHOREO.chipIn + CHOREO.linger });
      steps.push({ do: 'pointer.hide' });
      return steps;
    }

    /* ---- camera ---- */

    case 'zoom_trigger': {
      const ts = input.focusTs;
      if (ts == null) return [];
      // Get there, breathe, then close in. Scrolling and zooming at the same
      // time is disorienting: two axes of change with nothing to hold on to.
      const steps: ChoreoStep[] = [
        { do: 'camera.scrollToTime', time: ts, align: 'center', duration: CHOREO.scroll },
        { do: 'wait', duration: 150 },
        { do: 'camera.zoomTo', barSpacing: 18, anchorTime: ts, duration: CHOREO.zoom },
      ];
      // The candle itself gets a two-pulse mark, so "the trigger candle" is a
      // thing on screen rather than a thing in the sentence.
      const mark = anns.find((a) => a.kind === 'vertical') ?? {
        id: `focus:${String(ts)}`,
        kind: 'vertical',
        ts_from: ts,
        text: 'Trigger',
        provenance: 'kai',
        status: 'valid',
      };
      steps.push({ do: 'annotations.add', annotations: [mark] });
      steps.push({ do: 'annotations.flash', id: mark.id, pulses: 2 });
      steps.push({ do: 'wait', duration: 640 });
      return steps;
    }

    case 'set_timeframe': {
      const tf = input.timeframe;
      if (!tf) return [];
      // The button is pressed, visibly, by something. A rail that changes state
      // on its own while a cursor sits elsewhere is the tell that nobody did it.
      const steps: ChoreoStep[] = [
        { do: 'pointer.moveTo', target: { rail: tf }, duration: CHOREO.pointerToRail },
        { do: 'pointer.press', rail: tf },
        { do: 'setTimeframe', timeframe: tf },
        { do: 'wait', duration: CHOREO.crossfade },
        { do: 'camera.fit', duration: CHOREO.fit },
        { do: 'pointer.hide' },
      ];
      if (input.focusTs != null) {
        steps.splice(steps.length - 1, 0, {
          do: 'camera.scrollToTime', time: input.focusTs, align: 'center', duration: CHOREO.scroll,
        });
      }
      return steps;
    }

    case 'compare_prior': {
      const back = isNum(input.bars) ? -Math.abs(input.bars) : -60;
      if (input.rangeFrom != null && input.rangeTo != null) {
        return [
          { do: 'camera.zoomToRange', from: input.rangeFrom, to: input.rangeTo, padding: 0.12, duration: CHOREO.scrollLong },
          { do: 'wait', duration: CHOREO.hold },
          { do: 'camera.scrollToNow', duration: CHOREO.scrollLong },
        ];
      }
      // No stored range: go back, hold long enough to actually read it, come
      // back the same way. Enter and exit along the same path — anything else
      // loses the user's place.
      return [
        { do: 'camera.scrollByBars', bars: back, duration: CHOREO.scrollLong },
        { do: 'wait', duration: CHOREO.hold },
        { do: 'camera.scrollByBars', bars: -back, duration: CHOREO.scrollLong },
      ];
    }

    /* ---- chart commands v2 ---- */

    case 'zoom_range': {
      if (input.rangeFrom == null || input.rangeTo == null) return [];
      return [
        { do: 'camera.zoomToRange', from: input.rangeFrom, to: input.rangeTo, padding: 0.12, duration: CHOREO.scrollLong },
      ];
    }

    case 'scroll_bars': {
      if (!isNum(input.bars) || input.bars === 0) return [];
      return [{ do: 'camera.scrollByBars', bars: input.bars, duration: CHOREO.scroll }];
    }

    case 'scroll_to_now':
      return [{ do: 'camera.scrollToNow', duration: CHOREO.scroll }];

    case 'flash_annotation': {
      const id = input.flashId ?? anns[0]?.id ?? null;
      if (!id) return [];
      const a = anns.find((x) => x.id === id);
      // Point at it first when we know where it is. "This one" needs a *this*.
      return [
        ...(a ? ([{ do: 'pointer.moveTo', target: anchorOf(a), duration: 320 }] as ChoreoStep[]) : []),
        { do: 'annotations.flash', id, pulses: input.pulses ?? 2 },
        { do: 'wait', duration: 640 },
        { do: 'pointer.hide' },
      ];
    }

    case 'pointer_hint': {
      const t = input.pointer;
      if (!t) return [];
      return [
        { do: 'pointer.moveTo', target: t, duration: t.rail ? CHOREO.pointerToRail : CHOREO.pointerTravel },
        ...(input.linger ? [] : ([{ do: 'wait', duration: 900 }, { do: 'pointer.hide' }] as ChoreoStep[])),
      ];
    }

    /* ---- state changes with nothing to fly the camera at ---- */

    case 'annotation_remove':
      return input.removeIds?.length ? [{ do: 'annotations.remove', ids: input.removeIds }] : [];

    case 'annotation_explain': {
      const id = input.flashId ?? anns[0]?.id ?? null;
      // Explaining is a conversation, not a camera move. The one thing the chart
      // owes the sentence is showing WHICH mark is being explained.
      return id ? [{ do: 'annotations.flash', id, pulses: 1 }] : [];
    }

    // Proposals. They open a sheet; the chart has nothing to perform.
    case 'alert_from_level':
    case 'prepare_trade':
    default:
      return [];
  }
}

/** Total wall time of a sequence, for tests and for narration pacing. */
export function sequenceDuration(steps: ChoreoStep[]): number {
  return steps.reduce((ms, s) => {
    if (s.do === 'wait') return ms + s.duration;
    if ('duration' in s && typeof s.duration === 'number') return ms + s.duration;
    if (s.do === 'pointer.press') return ms + CHOREO.press;
    return ms;
  }, 0);
}
