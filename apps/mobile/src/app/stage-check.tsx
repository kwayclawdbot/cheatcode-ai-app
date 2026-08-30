/**
 * `/stage-check` — the chart on a stage, driving itself.
 *
 * TWO JOBS, ONE ROUTE.
 *
 *  1. It is the ACCEPTANCE HARNESS for LIVE-1. The owner's bar for this lane is
 *     "it should feel like Kai is a real person clicking through and scrolling
 *     through charts", and you cannot review that in a screenshot — you have to
 *     watch it. This route runs the six-command choreography from the brief
 *     end to end, on fixture data, deterministically, so the same performance
 *     can be recorded, re-watched and argued about.
 *
 *  2. It is the first sketch of the LIVE-5 stage page: 1920×1080, chart
 *     dominant, a "now / next" rail down the side. When the broadcast box
 *     arrives it renders THIS, full screen, into ffmpeg.
 *
 * DEV / FIXTURES ONLY. There is nothing here a user should reach, and it draws
 * invented candles, so it refuses to render in a production build rather than
 * quietly showing fake prices to somebody with an account.
 *
 * Playwright drives it through `window.__ccStage`, not by clicking — a proof
 * that depends on hitting a button at the right moment is a proof that fails on
 * a slow machine.
 *
 * LIVE-2 ADDS A THIRD JOB, on the same route and behind a query parameter:
 * `/stage-check?show=<id>&token=<jwt>` plays a REAL generated show back through
 * this same chart. That is the point of putting it here rather than in a new
 * screen — the acceptance question for LIVE-2 is "does the brain actually fit
 * the chart", and the only honest way to answer it is to drive the identical
 * component, through the identical `applyChartCommand`, from frames a worker
 * really produced. Fixture mode and show mode share the file so they cannot
 * drift into two different charts.
 *
 * The token is in the query because this is a dev harness with no session: the
 * proof script mints a throwaway user exactly as `smoke.sh` does and hands the
 * page its access token. Nothing here is reachable in a production build.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Num, T } from '../ui/Text';
import { alpha, color, radius } from '../ui/tokens';
import { ChartView } from '../features/chart/ChartView';
import { AnnotationRail } from '../features/chart/AnnotationRail';
import { ShowPanel, type PanelName } from '../features/live/ShowPanel';

/** Bar-anchored drawings. They belong to the timeframe they were drawn on. */
const SHAPE_KINDS = new Set(['circle', 'arrow', 'box', 'trendline', 'vertical']);
import { applyChartCommand, resetChartCommandQueue } from '../features/chart/apply';
import type { ChartHandle } from '../features/chart/apply';
import { fixtureAnnotations } from '../features/portal/fixtures';
import { fixtureCandles, fixtureCandlesDaily } from '../lib/fixtures';
import type { Annotation, PortalTimeframe } from '../features/portal/types';
import { env } from '../lib/env';
import {
  LivePlayer,
  apiTransport,
  fetchCandles,
  type Bar,
} from '../features/chart/live-client';
import type { LiveFrame, OverlayFrame, PresentFrame, SayFrame } from '@shared/live';

const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/* ------------------------------------------------------------------ */
/* The six commands from the brief                                     */
/* ------------------------------------------------------------------ */

const A = fixtureAnnotations('META');
const byId = (id: string) => A.find((a) => a.id === id) as Annotation;
const wire = (a: Annotation) => ({
  id: a.id, kind: a.kind, price: a.price, price2: a.price2,
  ts_from: a.ts_from, ts_to: a.ts_to, text: a.text,
  provenance: a.provenance, status: a.status,
});

const TRIGGER_TS = byId('ann-trigger').ts_from;

/** The exact run the brief asks to see, in order, with what Kai says each time. */
const SCRIPT: {
  label: string;
  narration: string;
  cmd: Parameters<typeof applyChartCommand>[1];
  timeframe?: PortalTimeframe;
  reveal?: string[];
}[] = [
  {
    label: 'set_timeframe(D)',
    narration: 'Let me take this from the top — the daily first.',
    timeframe: 'D',
    cmd: { command: 'set_timeframe', timeframe: 'D', payload: { timeframe: 'D' } },
  },
  {
    label: 'mark_level(trigger)',
    narration: 'This is the level the alert was written against: 504.',
    reveal: ['ann-trigger'],
    cmd: { command: 'mark_level', payload: { level: 'trigger' }, annotations: [wire(byId('ann-trigger'))] },
  },
  {
    label: 'zoom_trigger',
    narration: 'Here is the candle that took it.',
    cmd: { command: 'zoom_trigger', payload: {}, focusTs: TRIGGER_TS },
  },
  {
    label: 'set_timeframe(15m)',
    narration: 'Down to the fifteen, where the entry actually happens.',
    timeframe: '15m',
    cmd: { command: 'set_timeframe', timeframe: '15m', payload: { timeframe: '15m' } },
  },
  {
    label: 'mark_plan',
    narration: 'Entry 504 to 507, stop 498, first target 520.',
    reveal: ['ann-entry', 'ann-stop', 'ann-target'],
    cmd: {
      command: 'mark_plan',
      payload: {},
      annotations: [byId('ann-entry'), byId('ann-stop'), byId('ann-target')].map(wire),
    },
  },
  {
    label: 'compare_prior',
    narration: 'And this is what the same level did in the prior session.',
    cmd: { command: 'compare_prior', payload: { bars: 40 } },
  },
];

/* ------------------------------------------------------------------ */

export default function StageCheckScreen() {
  const params = useLocalSearchParams<{ show?: string; token?: string; pace?: string; since?: string }>();
  if (params.show) return <LiveStage show={params.show} token={params.token ?? ''} pace={params.pace} since={params.since} />;
  return <ChoreographyStage />;
}

function ChoreographyStage() {
  const chart = useRef<ChartHandle | null>(null);
  const [tf, setTf] = useState<PortalTimeframe>('D');
  const [shown, setShown] = useState<Annotation[]>([]);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState<{ firstPaintMs: number; version: string; reducedMotion: boolean } | null>(null);
  const [fps, setFps] = useState<{ fps: number; worst: number } | null>(null);
  const [painted, setPainted] = useState<{ ms: number; bars: number } | null>(null);
  /** The live camera, straight off `onViewportChange`. A ref, not state: it
   *  changes on every frame of a tween and must never cause a render. */
  const viewport = useRef<{ from: number; to: number; barSpacing: number } | null>(null);
  /** A bar set the fixtures do not have. The brief's paint budget is written
   *  against 1,500 bars, so the harness has to be able to produce 1,500 bars. */
  const [stress, setStress] = useState<{ t: string; o: number; h: number; l: number; c: number; v: number }[] | null>(null);
  /** How the last performance ended. `interrupted` is the one the proof cares
   *  about: it is the evidence that a finger outranks Kai. */
  const lastResult = useRef<{ reason: string; completed: number; total: number } | null>(null);

  const candles = useMemo(
    () => stress ?? (tf === 'D' || tf === '4h' ? fixtureCandlesDaily : fixtureCandles),
    [stress, tf],
  );

  /** One command, choreographed. Returns when the performance is over. */
  const runStep = useCallback(async (i: number) => {
    const s = SCRIPT[i];
    if (!s || !chart.current) return;
    setStep(i);
    if (s.timeframe) setTf(s.timeframe);
    lastResult.current = await applyChartCommand(chart.current, s.cmd);
    if (s.reveal) setShown((prev) => [...prev, ...s.reveal!.map(byId).filter((a) => !prev.some((p) => p.id === a.id))]);
  }, []);

  const runAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setShown([]);
    setTf('D');
    resetChartCommandQueue();
    for (let i = 0; i < SCRIPT.length; i++) await runStep(i);
    setStep(-1);
    setRunning(false);
  }, [running, runStep]);

  const reset = useCallback(() => {
    resetChartCommandQueue();
    setShown([]);
    setStep(-1);
    setTf('D');
  }, []);

  /* The seam Playwright drives. One step at a time, awaited, so a frame series
     lands on the same moments on every machine. */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as unknown as Record<string, unknown>;
    w.__ccStage = {
      script: SCRIPT.map((s) => ({ label: s.label, narration: s.narration })),
      step: (i: number) => runStep(i),
      runAll,
      reset,
      showAllKinds: () => setShown(ALL_KINDS),
      /** Load N synthetic bars and let the page report what painting them cost. */
      stress: (n: number) => { setPainted(null); setStress(makeBars(n)); },
      unstress: () => { setStress(null); setPainted(null); },
      state: () => ({
        tf, step, annotations: shown.length, ready, fps, painted,
        bars: candles.length, viewport: viewport.current, lastResult: lastResult.current,
        handleReduced: chart.current?.prefersReducedMotion?.() ?? null,
      }),
    };
    return () => { delete w.__ccStage; };
  }, [runStep, runAll, reset, tf, step, shown.length, ready, fps, painted, candles.length]);

  if (!DEV && !env.FIXTURES) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <T size={14} c={color.muted} testID="stage-check-disabled">
          The stage harness draws invented candles, so it does not run outside development.
        </T>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, flexDirection: 'row' }} testID="screen-stage-check">
      {/* ---- the chart, dominant ---- */}
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <T size={22} weight="bold" c={color.text}>META</T>
          <Num size={22} weight="bold" c={color.cyan}>508.40</Num>
          <Num size={13} c={color.green}>+2.14%</Num>
          <View style={{ flex: 1 }} />
          {ready ? (
            <Num size={11} c={color.dim} testID="stage-first-paint">
              {`first paint ${ready.firstPaintMs}ms · lwc ${ready.version}`}
            </Num>
          ) : null}
          {painted ? (
            <Num size={11} c={color.dim} testID="stage-painted">{`${painted.bars} bars painted in ${painted.ms}ms`}</Num>
          ) : null}
          {fps ? <Num size={11} c={color.dim} testID="stage-fps">{`${fps.fps} fps (worst ${fps.worst})`}</Num> : null}
        </View>

        <View style={{ flex: 1 }}>
          <ChartView
            testID="stage-chart"
            ref={chart}
            symbol="META"
            timeframe={tf}
            candles={candles}
            annotations={shown}
            lastPrice={508.4}
            onTimeframeChange={setTf}
            onViewportChange={(v) => { viewport.current = v; }}
            onReady={(r) => setReady({ firstPaintMs: r.firstPaintMs, version: r.version, reducedMotion: r.reducedMotion })}
            onFps={setFps}
            onPainted={setPainted}
          />
        </View>

        <AnnotationRail annotations={shown} />
      </View>

      {/* ---- the run, as a rail ---- */}
      <View
        style={{
          width: 340, padding: 24, gap: 14,
          borderLeftWidth: 0.5, borderLeftColor: alpha.ivory08,
        }}
      >
        <T size={11} weight="bold" c={color.dim} ls={1.1}>LIVE-1 CHOREOGRAPHY</T>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            testID="stage-run"
            accessibilityRole="button"
            onPress={runAll}
            style={({ pressed }) => ({
              paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md,
              backgroundColor: color.volt, transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <T size={12} weight="bold" c={color.bg}>{running ? 'Running…' : 'Run the six'}</T>
          </Pressable>
          <Pressable
            testID="stage-reset"
            accessibilityRole="button"
            onPress={reset}
            style={({ pressed }) => ({
              paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md,
              borderWidth: 0.5, borderColor: alpha.ivory20, transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <T size={12} weight="semibold" c={color.muted}>Reset</T>
          </Pressable>
          <Pressable
            testID="stage-all-kinds"
            accessibilityRole="button"
            onPress={() => setShown(ALL_KINDS)}
            style={({ pressed }) => ({
              paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md,
              borderWidth: 0.5, borderColor: alpha.violet45, transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <T size={12} weight="semibold" c={color.violetLight}>All six kinds</T>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
          {SCRIPT.map((s, i) => {
            const on = i === step;
            return (
              <View
                key={s.label}
                testID={`stage-step-${i}`}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  gap: 4,
                  backgroundColor: on ? alpha.violet14 : 'transparent',
                  borderLeftWidth: 2,
                  borderLeftColor: on ? color.violet : 'transparent',
                }}
              >
                <Num size={10} weight="medium" c={on ? color.violetLight : color.dim}>{s.label}</Num>
                <T size={12.5} c={on ? color.text : color.muted} lh={18}>{s.narration}</T>
              </View>
            );
          })}
        </ScrollView>

        <T size={10.5} c={color.dim} lh={16}>
          Fixture candles. Every level here comes from the seeded META alert, so nothing on
          this stage is a price that was made up to look good.
        </T>
      </View>
    </View>
  );
}

/**
 * N synthetic 5-minute bars. Not a fixture anybody sees — it exists so the
 * "1,500 bars" budget in the brief can be measured rather than assumed, and it
 * is only reachable from the dev harness.
 */
function makeBars(n: number) {
  const out: { t: string; o: number; h: number; l: number; c: number; v: number }[] = [];
  const start = Date.now() - n * 300_000;
  let p = 500;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o + Math.sin(i / 11) * 0.9 + (((i * 2654435761) % 1000) / 1000 - 0.5) * 1.2;
    out.push({
      t: new Date(start + i * 300_000).toISOString(),
      o, c,
      h: Math.max(o, c) + 0.4,
      l: Math.min(o, c) - 0.4,
      v: 500_000 + (i % 97) * 1_000,
    });
    p = c;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* All six annotation primitives, for the proof shot                   */
/* ------------------------------------------------------------------ */

const base = byId('ann-trigger');
const at = (n: number) => new Date(Date.parse(String(base.ts_from)) + n * 5 * 60_000).toISOString();

/**
 * `level`, `zone`, `trendline`, `box`, `vertical`, `note` — one of each, on one
 * chart, so the drawing layer can be checked in a single frame.
 */
const ALL_KINDS: Annotation[] = [
  { ...base, id: 'k-level', kind: 'trigger', price: 504, price2: null, text: 'Level 504' },
  { ...base, id: 'k-zone', kind: 'entry', price: 505.5, price2: 507.2, text: 'Zone 505-507', provenance: 'plan' },
  { ...base, id: 'k-trend', kind: 'trendline', price: 496, price2: 506, ts_from: at(-40), ts_to: at(-4), text: 'Trend' },
  { ...base, id: 'k-box', kind: 'box', price: 499, price2: 501, ts_from: at(-30), ts_to: at(-16), text: 'FVG' },
  { ...base, id: 'k-vert', kind: 'vertical', price: null, price2: null, ts_from: at(-12), text: 'Trigger bar' },
  { ...base, id: 'k-note', kind: 'note', price: 509.5, price2: null, ts_from: at(-8), text: 'Volume dried up here' },
];

/* ------------------------------------------------------------------ */
/* LIVE-2 — a real show, played back on the real chart                 */
/* ------------------------------------------------------------------ */

/**
 * `/stage-check?show=<id>&token=<jwt>[&pace=8][&since=N]`
 *
 * Every frame here came out of `workers/kai-live` and went through the database
 * before it got here. Nothing on this screen is a fixture: the candles are the
 * app's own candles endpoint, the annotations are rows the worker persisted, and
 * the chart moves because `applyChartCommand` — the same function the Trade
 * Portal calls — is being handed a `chart` frame.
 *
 * `since` is what proves the late-join story. Loading with `since=41` starts at
 * frame 42 and lands in the same state as a client that watched from the
 * beginning, because the frames are ordered and idempotent and the player
 * refuses to apply one that would open a gap.
 */
function LiveStage({
  show,
  token,
  pace,
  since,
}: {
  show: string;
  token: string;
  pace?: string;
  since?: string;
}) {
  const chart = useRef<ChartHandle | null>(null);
  const player = useRef<LivePlayer | null>(null);
  const audio = useRef<{ pause: () => void } | null>(null);

  /**
   * SYMBOL, TIMEFRAME AND BARS MOVE AS ONE VALUE, and that is a correctness fix
   * rather than a tidiness one.
   *
   * They were three `useState`s, so a symbol change rendered once with the NEW
   * ticker and the OLD bars. `ChartView` keys its `setData` on
   * symbol|timeframe|length|firstTs|lastTs — and two daily charts of the same
   * length over the same 125 sessions differ in none of those once the symbol
   * has already been updated. The second render, carrying the right bars, was
   * therefore identical by key and never reached the chart: the proof capture
   * showed "CRM 252.05" over Invesco QQQ's candles, which is the single worst
   * thing this product can put on a screen.
   *
   * One state, set twice: emptied the instant the symbol changes (so the old
   * ticker's prices leave the screen immediately, including when the fetch then
   * fails) and filled when its own bars arrive.
   */
  const [view, setView] = useState<{ symbol: string; tf: PortalTimeframe; candles: Bar[] }>({
    symbol: '—',
    tf: 'D',
    candles: [],
  });
  const { symbol, tf, candles } = view;
  const viewRef = useRef(view);
  viewRef.current = view;
  const [headline, setHeadline] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [line, setLine] = useState<SayFrame | null>(null);
  const [transcript, setTranscript] = useState<SayFrame[]>([]);
  const [rail, setRail] = useState<Record<string, unknown> | null>(null);
  /** The panel currently up, if any. Cleared by `[SLIDE:clear]`. */
  const [panel, setPanel] = useState<{ name: PanelName; payload: Record<string, unknown> } | null>(null);
  const [cursor, setCursor] = useState(Number(since ?? -1));
  const [status, setStatus] = useState<string>('connecting');
  const [error, setError] = useState<string | null>(null);

  const apiBase = env.apiBase || 'http://localhost:3000';

  /**
   * A symbol change is the one frame the player AWAITS, because everything after
   * it draws on top of these bars. Loading them after the first `mark_level`
   * landed would put a level on the previous symbol's chart for a beat, which is
   * exactly the class of thing a viewer screenshots.
   */
  const present = useCallback(
    async (f: PresentFrame) => {
      const timeframe = f.timeframe as PortalTimeframe;
      setHeadline(f.headline);
      setAnnotations([]);
      // Empty first. A chart showing the last ticker's prices under this
      // ticker's name for even one frame is worse than a chart showing nothing.
      setView({ symbol: f.symbol, tf: timeframe, candles: [] });
      try {
        const bars = await fetchCandles({ apiBase, token, symbol: f.symbol, timeframe });
        setView({ symbol: f.symbol, tf: timeframe, candles: bars });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [apiBase, token],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;

    const p = new LivePlayer({
      transport: apiTransport({ apiBase, token, showId: show }),
      mode: 'replay',
      pace: Number(pace ?? 4),
      since: Number(since ?? -1),
      sink: {
        chart: () => chart.current,
        present,
        say: (f) => {
          setLine(f);
          setTranscript((prev) => [...prev.slice(-40), f]);
          // Audio is optional by contract: a show generated while the TTS
          // provider was unavailable carries a null url and plays as captions.
          if (f.audio_url && typeof Audio !== 'undefined') {
            try {
              audio.current?.pause();
              const el = new Audio(f.audio_url);
              audio.current = el;
              void el.play().catch(() => {});
            } catch {
              /* a browser that refuses autoplay is not a broken show */
            }
          }
        },
        overlay: (f: OverlayFrame) => {
          if (f.overlay === 'ticker_rail') setRail(f.payload as Record<string, unknown>);
          if (f.overlay === 'clear') {
            setRail(null);
            setPanel(null);
          }
          if (f.overlay === 'fundamentals' || f.overlay === 'news' || f.overlay === 'evidence' || f.overlay === 'scorecard') {
            setPanel({ name: f.overlay, payload: (f.payload ?? {}) as Record<string, unknown> });
          }
        },
        annotations: (rows) =>
          setAnnotations((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]),
        /**
         * A TIMEFRAME CHANGE IS A DATA CHANGE, NOT A LABEL CHANGE.
         *
         * `set_timeframe` used to switch the rail and nothing else, so Kai
         * would say "down to the fifteen" and the chart went on showing the
         * same daily candles under a new caption. Bars for the new timeframe
         * are fetched here, the way `present` fetches them for a new symbol —
         * the show only ever had bars for whatever the segment opened on.
         */
        applied: (f: LiveFrame, c: number) => {
          if (cancelled) return;
          setCursor(c);
          if (f.kind !== 'chart' || f.command !== 'set_timeframe') return;
          const next = (f.payload as { timeframe?: string })?.timeframe as PortalTimeframe | undefined;
          const now = viewRef.current;
          if (!next || next === now.tf) return;
          setView((v) => ({ ...v, tf: next }));
          /**
           * Shapes do not survive a timeframe change, and that is correctness
           * before it is tidiness: a circle is anchored to ONE BAR, and that bar
           * does not exist on the next rail down — the ring would sit over a
           * candle it was never about. Price levels do survive; a trigger is the
           * same number on every timeframe, and Kai goes on referring to it.
           * Clearing the shapes is also what lets him draw fresh ones without
           * the chart silting up.
           */
          setAnnotations((prev) => prev.filter((a) => !SHAPE_KINDS.has(a.kind)));
          void fetchCandles({ apiBase, token, symbol: now.symbol, timeframe: next })
            .then((bars) => {
              if (!cancelled) setView((v) => (v.symbol === now.symbol ? { ...v, tf: next, candles: bars } : v));
            })
            .catch((e) => {
              if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            });
        },
      },
    });

    player.current = p;
    setStatus('playing');
    void p.start().catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelled = true;
      p.stop();
      audio.current?.pause();
      player.current = null;
    };
  }, [apiBase, token, show, pace, since, present]);

  /**
   * The seam the proof drives.
   *
   * `state()` is what the late-join assertion reads: kill the page mid-segment,
   * reload with `since=<cursor>`, and check the cursor and the on-screen symbol
   * land in the same place.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as unknown as Record<string, unknown>;
    w.__ccLive = {
      show,
      state: () => ({
        ...(player.current?.state() ?? { cursor, applied: 0, pending: 0, symbol: null, running: false, error: null }),
        symbol,
        timeframe: tf,
        bars: candles.length,
        annotations: annotations.length,
        line: line?.text ?? null,
        audio: line?.audio_url ?? null,
        audio_state: line?.audio_state ?? null,
        glossary: line?.glossary ?? [],
        error,
      }),
      stop: () => player.current?.stop(),
      reconcile: () => player.current?.reconcile(),
    };
    return () => {
      delete w.__ccLive;
    };
  }, [show, cursor, symbol, tf, candles.length, annotations.length, line, error]);

  if (!DEV && !env.FIXTURES) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <T size={14} c={color.muted} testID="stage-check-disabled">
          The stage harness does not run outside development.
        </T>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, flexDirection: 'row' }} testID="screen-live-stage">
      <View style={{ flex: 1, padding: 24, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <T size={22} weight="bold" c={color.text} testID="live-symbol">{symbol}</T>
          {rail?.price ? <Num size={22} weight="bold" c={color.cyan}>{String(rail.price)}</Num> : null}
          {typeof rail?.change_pct === 'number' ? (
            <Num size={13} c={(rail.change_pct as number) >= 0 ? color.green : color.red}>
              {`${(rail.change_pct as number) >= 0 ? '+' : ''}${rail.change_pct}%`}
            </Num>
          ) : null}
          <View style={{ flex: 1 }} />
          <Num size={11} c={color.dim} testID="live-cursor">{`seq ${cursor} · ${tf} · ${candles.length} bars`}</Num>
        </View>

        <View style={{ flex: 1 }}>
          <ChartView
            testID="live-chart"
            ref={chart}
            symbol={symbol}
            timeframe={tf}
            candles={candles}
            annotations={annotations}
            onTimeframeChange={(next) => setView((v) => ({ ...v, tf: next }))}
          />
          {panel ? <ShowPanel key={panel.name} name={panel.name} payload={panel.payload} /> : null}
        </View>

        {/* The line Kai is saying, as a lower third. LIVE-5 makes this a real
            graphic; here it is the caption that proves the audio and the chart
            are describing the same moment. */}
        <View
          style={{
            minHeight: 92,
            padding: 16,
            borderRadius: radius.md,
            backgroundColor: alpha.violet14,
            borderLeftWidth: 2,
            borderLeftColor: line?.voice === 'cohost' ? color.volt : color.violet,
            gap: 6,
          }}
        >
          <Num size={10} weight="bold" c={color.dim}>
            {line ? (line.voice === 'kai' ? 'KAI' : 'HOST') : 'STANDING BY'}
          </Num>
          <T size={15} c={color.text} lh={22} testID="live-line">{line?.text ?? '—'}</T>
          {line?.glossary?.length ? (
            <T size={11.5} c={color.violetLight} lh={17} testID="live-glossary">
              {line.glossary.map((g: { term: string; plain: string }) => g.plain).join('  ·  ')}
            </T>
          ) : null}
        </View>
      </View>

      <View style={{ width: 340, padding: 24, gap: 14, borderLeftWidth: 0.5, borderLeftColor: alpha.ivory08 }}>
        <T size={11} weight="bold" c={color.dim} ls={1.1}>KAI LIVE — REPLAY</T>
        <T size={12} c={color.muted} lh={18} testID="live-headline">{headline || show}</T>
        <Num size={10.5} c={color.dim}>
          {`${status}${error ? ` · ${error}` : ''}${line?.audio_state === 'estimated' ? ' · captions only, no audio in this show' : ''}`}
        </Num>

        {/* The rail is a horizontal scroller with an intrinsic height; inside a
            flex column it gets squeezed to nothing by the transcript below it.
            `flexShrink: 0` is what keeps the levels index readable. */}
        <View style={{ flexShrink: 0 }}>
          <AnnotationRail annotations={annotations} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
          {transcript.slice(-14).map((s, i) => (
            <View key={`${s.seq}-${i}`} style={{ gap: 2 }}>
              <Num size={9.5} weight="medium" c={s.voice === 'kai' ? color.violetLight : color.volt}>
                {s.voice === 'kai' ? 'KAI' : 'HOST'}
              </Num>
              <T size={11.5} c={s.seq === line?.seq ? color.text : color.muted} lh={17}>{s.text}</T>
            </View>
          ))}
        </ScrollView>

        <T size={10.5} c={color.dim} lh={16}>
          Every level on this chart is a stored annotation with a reason. Anything Kai
          could not trace to a real object was dropped before this show was written.
        </T>
      </View>
    </View>
  );
}
