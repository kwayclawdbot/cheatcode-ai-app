/**
 * `ChartView` — the chart everywhere in the app (Live spec L1).
 *
 * ONE COMPONENT, THREE PLATFORMS. The chart is a self-contained page
 * (`assets/chart/index.html`, built from `chart-web/`). Native mounts it in a
 * `WebView`; Expo web mounts the SAME file in an `<iframe>`. Not "a WebView on
 * mobile and a React chart on web" — one implementation, so a fix to the feel
 * lands everywhere at once and the stage page that will stream to YouTube is
 * pixel-for-pixel the chart in the user's pocket.
 *
 * WHY A WEBVIEW AT ALL. Lightweight Charts is the brokerage-grade gesture stack
 * — real kinetic scrolling, pinch anchored on the pinch centre, a crosshair
 * that tracks at 60fps over 1,500 bars. Reimplementing that on `react-native-svg`
 * is a year of work to arrive back where TradingView already is. The cost is a
 * bridge; this file is that cost, paid once.
 *
 * WHAT THIS FILE OWNS
 *  - the bridge: every message out carries an `id`, and the ones that take time
 *    resolve a promise when the page answers `done{id, reason}`. That promise is
 *    what makes `apply.ts` able to say "then" instead of "after 500ms, probably";
 *  - the queue: commands sent before the page reports `ready` are held, not
 *    dropped, and replayed in order;
 *  - re-hydration: a WebView can be reloaded out from under us (a dev refresh, a
 *    memory-pressure reload on Android). When `ready` arrives again, the whole
 *    visible state — theme, data, annotations, timeframe — is re-sent, so the
 *    chart never comes back empty.
 *
 * PAPER-ONLY, DATA-ONLY: the page has no network access. Every number on it
 * arrived through this bridge from an object the app can account for.
 */
import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { color, radius } from '../../ui/tokens';
import type { Candle } from '../../lib/types';
import type { Annotation, PortalTimeframe } from '../portal/types';
import { PORTAL_TIMEFRAMES } from '../portal/types';
import type { ChartHandle, DoneReason, MoveOpts } from './apply';
import type { ChoreoAnnotation, PointerTarget } from './choreography';

/* The page. Registered as an asset by metro.config.js. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CHART_PAGE = require('../../../assets/chart/index.html');

/**
 * Resolve the asset to a URL the iframe can load.
 *
 * Metro hands the same `require` back in three different shapes: a plain URL
 * string on web, a descriptor with `uri` in some configurations, and a numeric
 * asset id on native (where `Image.resolveAssetSource` turns it into a URL, and
 * where we do not need this at all because the WebView takes the require
 * directly). react-native-web has no `resolveAssetSource`, so reaching for it
 * unguarded is what broke the web build the first time.
 */
function pageUri(): string {
  const a: unknown = CHART_PAGE;
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object' && 'uri' in (a as Record<string, unknown>)) {
    return String((a as { uri: unknown }).uri ?? '');
  }
  const resolve = (Image as unknown as { resolveAssetSource?: (x: unknown) => { uri?: string } })
    .resolveAssetSource;
  return resolve ? resolve(a)?.uri ?? '' : '';
}

/* `react-native-webview` has no web build. Requiring it on web would break the
   bundle, so it is pulled in only on the platforms that have it. */
type WebViewLike = React.ComponentType<Record<string, unknown>>;
let RNWebView: WebViewLike | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNWebView = require('react-native-webview').WebView as WebViewLike;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export type ChartViewProps = {
  symbol: string;
  timeframe: PortalTimeframe;
  candles: Candle[];
  annotations: Annotation[];
  /** The last traded price, drawn as the market-cyan price line. */
  lastPrice?: number | null;
  /** The candle the screen opened focused on (§6 context restoration). */
  focusTs?: string | null;
  timeframes?: PortalTimeframe[];
  hideAnnotations?: boolean;
  showVolume?: boolean;
  reducedMotion?: boolean;
  /** A fixed height, or omit to fill the parent (the stage page does). */
  height?: number;

  onSelectAnnotation?: (a: Annotation) => void;
  /** Fired when the RAIL changes it — Kai's own switches do not echo back. */
  onTimeframeChange?: (tf: PortalTimeframe) => void;
  onViewportChange?: (v: { from: number; to: number; barSpacing: number }) => void;
  onCrosshair?: (c: { time: string | number; open: number; high: number; low: number; close: number } | null) => void;
  /** `firstPaintMs` is measured inside the page on the real device. */
  onReady?: (info: { version: string; firstPaintMs: number; reducedMotion: boolean }) => void;
  onFps?: (f: { fps: number; worst: number }) => void;
  /** Measured on the frame that actually shows the bars, after every `setData`. */
  onPainted?: (p: { ms: number; bars: number }) => void;

  testID?: string;
};

/* ------------------------------------------------------------------ */
/* Bridge plumbing                                                     */
/* ------------------------------------------------------------------ */

type Outbound = { type: string; id?: string | null; payload?: Record<string, unknown> };

const toWire = (a: Annotation): ChoreoAnnotation => ({
  id: a.id,
  kind: a.kind,
  price: a.price,
  price2: a.price2,
  ts_from: a.ts_from,
  ts_to: a.ts_to,
  text: a.text,
  provenance: a.provenance,
  status: a.status,
});

const toWireCandle = (c: Candle) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? null });

export const ChartView = forwardRef<ChartHandle, ChartViewProps>(function ChartView(props, ref) {
  const {
    symbol, timeframe, candles, annotations, lastPrice = null, focusTs = null,
    timeframes = PORTAL_TIMEFRAMES, hideAnnotations = false, showVolume = false,
    reducedMotion = false, height,
    onSelectAnnotation, onTimeframeChange, onViewportChange, onCrosshair, onReady, onFps, onPainted,
    testID = 'chart-view',
  } = props;

  const webRef = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  /** What the PAGE reports about the OS preference. The app's own switch is the
   *  `reducedMotion` prop; either one suppresses motion. */
  const pageReducedMotion = useRef(false);

  /** Commands waiting for `ready`. Held, never dropped — a chart that silently
   *  swallows the first `mark_level` is worse than one that is briefly late. */
  const queue = useRef<Outbound[]>([]);
  const pending = useRef(new Map<string, (r: DoneReason) => void>());
  const seq = useRef(0);

  /** The latest props, for re-hydration after a reload. Refs, not state: this is
   *  a snapshot to replay, never a reason to re-render. */
  const latest = useRef({ symbol, timeframe, candles, annotations, lastPrice, hideAnnotations, showVolume, reducedMotion });
  latest.current = { symbol, timeframe, candles, annotations, lastPrice, hideAnnotations, showVolume, reducedMotion };

  const cb = useRef({ onSelectAnnotation, onTimeframeChange, onViewportChange, onCrosshair, onReady, onFps, onPainted });
  cb.current = { onSelectAnnotation, onTimeframeChange, onViewportChange, onCrosshair, onReady, onFps, onPainted };

  const uri = useMemo(() => pageUri(), []);

  /* ---------------- send ---------------- */

  const raw = useCallback((msg: Outbound) => {
    const json = JSON.stringify(msg);
    if (Platform.OS === 'web') {
      frameRef.current?.contentWindow?.postMessage(msg, '*');
      return;
    }
    // Delivered as a real `message` event so the page has ONE receive path on
    // every platform rather than a native-only side door.
    webRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(json)}}));true;`
    );
  }, []);

  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    const msg: Outbound = { type, payload };
    if (ready) raw(msg); else queue.current.push(msg);
  }, [ready, raw]);

  /** Send and wait for the page to say how it ended. This is the `then`. */
  const sendAwait = useCallback((type: string, payload: Record<string, unknown> = {}): Promise<DoneReason> => {
    const id = `c${++seq.current}`;
    const msg: Outbound = { type, id, payload };
    return new Promise<DoneReason>((resolve) => {
      pending.current.set(id, resolve);
      if (ready) raw(msg); else queue.current.push(msg);
      // A page that has gone away must not leave a sequence waiting forever.
      // Six seconds is longer than the longest choreography by a wide margin.
      setTimeout(() => {
        if (pending.current.delete(id)) resolve('superseded');
      }, 6000);
    });
  }, [ready, raw]);

  /* ---------------- receive ---------------- */

  const receive = useCallback((data: unknown) => {
    type Inbound = { type?: string; id?: string; payload?: Record<string, unknown> };
    let msg: Inbound | null = null;
    if (typeof data === 'string') { try { msg = JSON.parse(data) as Inbound; } catch { return; } }
    else if (data && typeof data === 'object') msg = data as Inbound;
    if (!msg?.type) return;
    const p = (msg.payload ?? {}) as Record<string, unknown>;

    switch (msg.type) {
      case 'ready': {
        setReady(true);
        pageReducedMotion.current = !!p.reducedMotion;
        cb.current.onReady?.({
          version: String(p.version ?? ''),
          firstPaintMs: Number(p.firstPaintMs ?? 0),
          reducedMotion: !!p.reducedMotion,
        });
        break;
      }
      case 'done': {
        const r = pending.current.get(String(msg.id));
        if (r) { pending.current.delete(String(msg.id)); r((p.reason as DoneReason) ?? 'done'); }
        break;
      }
      case 'annotationTap': {
        const a = latest.current.annotations.find((x) => x.id === String(p.id));
        if (a) cb.current.onSelectAnnotation?.(a);
        break;
      }
      case 'timeframe': {
        // Only the RAIL echoes back. Kai's own switch was already applied by the
        // caller; re-emitting it would loop the state through the screen twice.
        if (p.by === 'user') cb.current.onTimeframeChange?.(p.timeframe as PortalTimeframe);
        break;
      }
      case 'viewport':
        cb.current.onViewportChange?.({
          from: Number(p.from), to: Number(p.to), barSpacing: Number(p.barSpacing),
        });
        break;
      case 'crosshair':
        cb.current.onCrosshair?.({
          time: p.time as string | number,
          open: Number(p.open), high: Number(p.high), low: Number(p.low), close: Number(p.close),
        });
        break;
      case 'crosshairEnd': cb.current.onCrosshair?.(null); break;
      case 'fps': cb.current.onFps?.({ fps: Number(p.fps), worst: Number(p.worst) }); break;
      case 'painted': cb.current.onPainted?.({ ms: Number(p.ms), bars: Number(p.bars) }); break;
      default: break;
    }
  }, []);

  /* ---------------- web: listen on the window ---------------- */

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMsg = (e: MessageEvent) => {
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      receive(e.data);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [receive]);

  /* ---------------- re-hydrate on ready ---------------- */

  useEffect(() => {
    if (!ready) return;
    const s = latest.current;
    // Order matters: motion preference, then bars, then marks. Annotations sent
    // before their bars would have no price scale to land on.
    raw({ type: 'setReducedMotion', payload: { on: s.reducedMotion } });
    raw({ type: 'setVolume', payload: { on: s.showVolume } });
    raw({
      type: 'setData',
      payload: {
        symbol: s.symbol, timeframe: s.timeframe,
        candles: s.candles.map(toWireCandle), lastPrice: s.lastPrice,
      },
    });
    raw({ type: 'annotations.set', payload: { annotations: s.annotations.map(toWire) } });
    raw({ type: 'annotations.hidden', payload: { on: s.hideAnnotations } });

    const held = queue.current;
    queue.current = [];
    held.forEach(raw);
  }, [ready, raw]);

  /* ---------------- prop → page ---------------- */

  const candleKey = useMemo(
    () => `${symbol}|${timeframe}|${candles.length}|${candles[0]?.t ?? ''}|${candles[candles.length - 1]?.t ?? ''}`,
    [symbol, timeframe, candles],
  );
  const firstData = useRef(true);
  useEffect(() => {
    if (!ready) return;
    send('setData', {
      symbol, timeframe, candles: candles.map(toWireCandle), lastPrice,
      // The first load frames the timeframe's default window. Later loads for
      // the same view (a refresh, a tick) leave the camera where the user put it.
      resetView: firstData.current || candles.length === 0,
    });
    firstData.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, candleKey]);

  useEffect(() => { if (ready) send('setData', { symbol, timeframe, candles: candles.map(toWireCandle), lastPrice, resetView: false }); },
    // Price-only updates: same bars, new last. Cheap, and it never moves the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastPrice]);

  const annKey = useMemo(
    () => annotations.map((a) => `${a.id}:${a.status}:${a.price}:${a.price2}:${a.text}`).join(','),
    [annotations],
  );
  useEffect(() => {
    if (ready) send('annotations.set', { annotations: annotations.map(toWire) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, annKey]);

  useEffect(() => { if (ready) send('annotations.hidden', { on: hideAnnotations }); }, [ready, hideAnnotations, send]);
  useEffect(() => { if (ready) send('setVolume', { on: showVolume }); }, [ready, showVolume, send]);
  useEffect(() => { if (ready) send('setReducedMotion', { on: reducedMotion }); }, [ready, reducedMotion, send]);
  useEffect(() => {
    // The rail follows the screen's timeframe when the screen is the one that
    // changed it (a route param, a restored alert context).
    if (ready) send('setTimeframe', { timeframe });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, timeframe]);

  /* ---------------- the imperative handle ---------------- */

  useImperativeHandle(ref, (): ChartHandle => ({
    isReady: () => ready,
    prefersReducedMotion: () => reducedMotion || pageReducedMotion.current,

    setData: (p) => send('setData', p as unknown as Record<string, unknown>),
    updateLast: (c) => send('updateLast', { candle: c }),
    setVolume: (on) => send('setVolume', { on }),
    setReducedMotion: (on) => send('setReducedMotion', { on }),
    setGestures: (own) => send('setGestures', { own }),
    setBroadcast: (on) => send('setBroadcast', { on }),

    scrollByBars: (bars, o) => sendAwait('camera.scrollByBars', { bars, ...o }),
    scrollToTime: (time, o) => sendAwait('camera.scrollToTime', { time, ...o }),
    scrollToNow: (o) => sendAwait('camera.scrollToNow', { ...o }),
    zoomTo: (barSpacing, o) => sendAwait('camera.zoomTo', { barSpacing, ...o }),
    zoomToRange: (from, to, o) => sendAwait('camera.zoomToRange', { from, to, ...o }),
    fit: (o?: MoveOpts) => sendAwait('camera.fit', { ...o }),
    cancelMotion: () => send('camera.cancel'),

    setTimeframe: (tf) => sendAwait('setTimeframe', { timeframe: tf }),

    pointerMoveTo: (target: PointerTarget, o) => sendAwait('pointer.moveTo', { ...target, ...o }),
    pointerPress: (rail) => sendAwait('pointer.press', rail ? { rail } : {}),
    pointerHide: () => send('pointer.hide'),

    setAnnotations: (list) => send('annotations.set', { annotations: list }),
    addAnnotations: (list) => send('annotations.add', { annotations: list }),
    removeAnnotations: (ids) => send('annotations.remove', { ids }),
    flashAnnotation: (id, pulses) => send('annotations.flash', { id, pulses: pulses ?? 2 }),
    setAnnotationsHidden: (on) => send('annotations.hidden', { on }),
  }), [ready, send, sendAwait]);

  /* ---------------- the surface ---------------- */

  const frame = {
    // A number pins it; omitting it lets the chart fill whatever it is given —
    // a 248pt panel in the Portal, a whole 1080p stage on the Live page.
    ...(typeof height === 'number' ? { height } : { flex: 1 }),
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    // Painted the surface colour BEFORE anything mounts. The three moments a
    // WebView can flash white — creation, first paint, canvas insertion — are
    // all already this colour.
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,247,232,0.08)',
  };

  if (Platform.OS === 'web') {
    return (
      <View testID={testID} style={frame}>
        {/* react-native-web passes unknown DOM elements straight through. */}
        <iframe
          ref={frameRef}
          src={uri}
          title={`${symbol} chart`}
          onLoad={() => { /* the page announces itself with `ready`; nothing to do here */ }}
          style={{ border: 0, width: '100%', height: '100%', display: 'block', background: color.bg }}
        />
      </View>
    );
  }

  const WV = RNWebView as WebViewLike;
  return (
    <View testID={testID} style={frame}>
      <WV
        ref={webRef as never}
        source={CHART_PAGE}
        originWhitelist={['*']}
        // The page is a PANEL inside a scroll view. Every one of these exists so
        // a finger on the chart moves the chart, and a finger anywhere else
        // moves the page — never both, never neither.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // Nothing on this page navigates. Anything that tries is a bug or an
        // injection, and either way it does not get to leave.
        onShouldStartLoadWithRequest={() => true}
        style={{ flex: 1, backgroundColor: color.bg }}
        containerStyle={{ backgroundColor: color.bg }}
        onMessage={(e: { nativeEvent: { data: string } }) => receive(e.nativeEvent.data)}
        onLoadStart={() => setReady(false)}
      />
    </View>
  );
});

export type { ChartHandle } from './apply';
