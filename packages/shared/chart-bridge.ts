/**
 * The chart bridge — the wire between the app and the page Kai draws on.
 *
 * `apps/mobile/chart-web/` is a WebView (native) / iframe (web) with no network
 * access of its own. Everything it knows arrives over this protocol, and
 * everything it observes goes back over it. That boundary is deliberate: a chart
 * that could fetch is a chart that could display a number nobody in the app can
 * account for, and rule 5 of the Live spec is that every number Kai marks comes
 * from a real object with provenance.
 *
 * THE `id`/`done` CONTRACT IS THE WHOLE POINT.
 * Every host→chart message carries an `id`. Every message that takes TIME —
 * every camera move, every pointer travel — answers with `done{id, reason}`.
 * That is what turns a pile of commands into choreography: step 3 begins when
 * step 2 actually finished on this device at this frame rate, and when the user
 * grabs the chart mid-move the running step answers `interrupted`, so the rest
 * of the sequence is abandoned instead of fighting the finger.
 *
 * `reason`:
 *   done        — the motion ran to completion
 *   interrupted — a finger landed on the glass; the user owns the camera now
 *   superseded  — another command replaced it (a newer intent, not a conflict)
 *
 * Nothing here is validated on a hot path in production — the two ends ship
 * together — but the schemas are the executable spec, and the smoke suite
 * round-trips them so a rename on one side cannot land silently.
 */
import { z } from 'zod';

/** The rail. Mirrors `PortalTimeframe` in the app and `CANDLE_TIMEFRAMES` in the API. */
export const ChartTimeframe = z.enum(['1m', '5m', '15m', '1h', '4h', 'D']);
export type ChartTimeframe = z.infer<typeof ChartTimeframe>;

/** Bars per screen when a timeframe opens. From the LIVE-1 brief. */
export const CHART_TF_DEFAULT_BARS: Record<ChartTimeframe, number> = {
  '1m': 90, '5m': 78, '15m': 96, '1h': 100, '4h': 120, D: 120,
};

export const ChartCandle = z.object({
  /** ISO string or unix seconds — the page normalises both. */
  t: z.union([z.string(), z.number()]),
  o: z.number(), h: z.number(), l: z.number(), c: z.number(),
  v: z.number().nullable().optional(),
  /** Per-bar colouring hook. Unused in LIVE-1; the RSI heatmap (LIVE-1b) fills it. */
  color: z.string().optional(),
  wickColor: z.string().optional(),
});
export type ChartCandle = z.infer<typeof ChartCandle>;

/**
 * An annotation as the PAGE needs it. This is the app's `AnnotationRow` with the
 * fields the renderer actually reads — the page is handed geometry and meaning,
 * never a colour and never a shape name (shape is derived from `kind` plus which
 * coordinates are present).
 */
export const ChartAnnotationWire = z.object({
  id: z.string(),
  kind: z.string(),
  price: z.number().nullable().optional(),
  price2: z.number().nullable().optional(),
  ts_from: z.union([z.string(), z.number()]).nullable().optional(),
  ts_to: z.union([z.string(), z.number()]).nullable().optional(),
  text: z.string().nullable().optional(),
  provenance: z.string().optional(),
  status: z.string().optional(),
});
export type ChartAnnotationWire = z.infer<typeof ChartAnnotationWire>;

/** Where a camera move parks the subject of the move. */
export const ChartAlign = z.enum(['left', 'center', 'right']);
export type ChartAlign = z.infer<typeof ChartAlign>;

/** Every timed command takes these. `jitter:false` opts out of the ±10% wobble. */
const Timed = {
  duration: z.number().min(0).max(6000).optional(),
  jitter: z.boolean().optional(),
};

/* ------------------------------------------------------------------ */
/* Host → chart                                                        */
/* ------------------------------------------------------------------ */

export const ChartBridgeOutbound = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), id: z.string().nullable().optional(), payload: z.object({}).optional() }),

  z.object({
    type: z.literal('setTheme'),
    id: z.string().nullable().optional(),
    payload: z.object({ tokens: z.record(z.string(), z.string()) }),
  }),
  z.object({
    type: z.literal('setReducedMotion'),
    id: z.string().nullable().optional(),
    payload: z.object({ on: z.boolean() }),
  }),
  z.object({
    type: z.literal('setVolume'),
    id: z.string().nullable().optional(),
    payload: z.object({ on: z.boolean() }),
  }),

  z.object({
    type: z.literal('setData'),
    id: z.string().nullable().optional(),
    payload: z.object({
      symbol: z.string(),
      timeframe: ChartTimeframe,
      candles: z.array(ChartCandle),
      lastPrice: z.number().nullable().optional(),
      /** false keeps the camera where the user left it (a live tick, not a switch). */
      resetView: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('updateLast'),
    id: z.string().nullable().optional(),
    payload: z.object({ candle: ChartCandle }),
  }),
  z.object({
    type: z.literal('setTimeframe'),
    id: z.string().nullable().optional(),
    payload: z.object({ timeframe: ChartTimeframe }),
  }),

  /* camera */
  z.object({
    type: z.literal('camera.scrollByBars'),
    id: z.string().nullable().optional(),
    payload: z.object({ bars: z.number(), ...Timed }),
  }),
  z.object({
    type: z.literal('camera.scrollToTime'),
    id: z.string().nullable().optional(),
    payload: z.object({ time: z.union([z.string(), z.number()]), align: ChartAlign.optional(), ...Timed }),
  }),
  z.object({
    type: z.literal('camera.scrollToNow'),
    id: z.string().nullable().optional(),
    payload: z.object({ ...Timed }),
  }),
  z.object({
    type: z.literal('camera.zoomTo'),
    id: z.string().nullable().optional(),
    payload: z.object({
      barSpacing: z.number().min(0.5).max(200),
      anchorTime: z.union([z.string(), z.number()]).nullable().optional(),
      ...Timed,
    }),
  }),
  z.object({
    type: z.literal('camera.zoomToRange'),
    id: z.string().nullable().optional(),
    payload: z.object({
      from: z.union([z.string(), z.number()]),
      to: z.union([z.string(), z.number()]),
      padding: z.number().min(0).max(1).optional(),
      ...Timed,
    }),
  }),
  z.object({
    type: z.literal('camera.fit'),
    id: z.string().nullable().optional(),
    payload: z.object({ ...Timed }),
  }),
  z.object({
    type: z.literal('camera.cancel'),
    id: z.string().nullable().optional(),
    payload: z.object({}).optional(),
  }),

  /* annotations */
  z.object({
    type: z.literal('annotations.set'),
    id: z.string().nullable().optional(),
    payload: z.object({ annotations: z.array(ChartAnnotationWire) }),
  }),
  z.object({
    type: z.literal('annotations.add'),
    id: z.string().nullable().optional(),
    payload: z.object({ annotations: z.array(ChartAnnotationWire) }),
  }),
  z.object({
    type: z.literal('annotations.remove'),
    id: z.string().nullable().optional(),
    payload: z.object({ ids: z.array(z.string()) }),
  }),
  z.object({
    type: z.literal('annotations.flash'),
    id: z.string().nullable().optional(),
    payload: z.object({ id: z.string(), pulses: z.number().min(1).max(6).optional() }),
  }),
  z.object({
    type: z.literal('annotations.hidden'),
    id: z.string().nullable().optional(),
    payload: z.object({ on: z.boolean() }),
  }),

  /* Kai's pointer */
  z.object({
    type: z.literal('pointer.moveTo'),
    id: z.string().nullable().optional(),
    payload: z.object({
      /** Absolute px, or a 0..1 fraction of the plot width. */
      x: z.number().optional(),
      y: z.number().optional(),
      /** Chart coordinates win over pixels when both are present. */
      time: z.union([z.string(), z.number()]).nullable().optional(),
      price: z.number().nullable().optional(),
      /** Park on a rail button instead — the one target that is not on the plot. */
      rail: ChartTimeframe.optional(),
      ...Timed,
    }),
  }),
  z.object({
    type: z.literal('pointer.press'),
    id: z.string().nullable().optional(),
    payload: z.object({ rail: ChartTimeframe.optional() }).optional(),
  }),
  z.object({ type: z.literal('pointer.show'), id: z.string().nullable().optional(), payload: z.object({}).optional() }),
  z.object({ type: z.literal('pointer.hide'), id: z.string().nullable().optional(), payload: z.object({}).optional() }),
]);
export type ChartBridgeOutbound = z.infer<typeof ChartBridgeOutbound>;
export type ChartBridgeOutboundType = ChartBridgeOutbound['type'];

/* ------------------------------------------------------------------ */
/* Chart → host                                                        */
/* ------------------------------------------------------------------ */

export const ChartDoneReason = z.enum(['done', 'interrupted', 'superseded']);
export type ChartDoneReason = z.infer<typeof ChartDoneReason>;

export const ChartBridgeInbound = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    payload: z.object({
      version: z.string(),
      /** Measured on the device, not estimated on a build machine. */
      firstPaintMs: z.number(),
      reducedMotion: z.boolean(),
      timeframes: z.array(ChartTimeframe),
    }),
  }),
  z.object({
    type: z.literal('done'),
    id: z.string().nullable().optional(),
    payload: z.object({ reason: ChartDoneReason }),
  }),
  z.object({
    type: z.literal('viewport'),
    payload: z.object({
      from: z.number(), to: z.number(), barSpacing: z.number(),
      firstTime: z.number().nullable(), lastTime: z.number().nullable(),
    }),
  }),
  z.object({
    type: z.literal('timeframe'),
    payload: z.object({ timeframe: ChartTimeframe, by: z.enum(['user', 'kai']) }),
  }),
  z.object({ type: z.literal('annotationTap'), payload: z.object({ id: z.string() }) }),
  z.object({
    type: z.literal('crosshair'),
    payload: z.object({
      time: z.union([z.string(), z.number()]),
      open: z.number(), high: z.number(), low: z.number(), close: z.number(),
    }),
  }),
  z.object({ type: z.literal('crosshairEnd'), payload: z.object({}) }),
  z.object({ type: z.literal('fps'), payload: z.object({ fps: z.number(), worst: z.number() }) }),
  z.object({
    type: z.literal('error'),
    id: z.string().nullable().optional(),
    payload: z.object({ message: z.string() }),
  }),
]);
export type ChartBridgeInbound = z.infer<typeof ChartBridgeInbound>;
export type ChartBridgeInboundType = ChartBridgeInbound['type'];
