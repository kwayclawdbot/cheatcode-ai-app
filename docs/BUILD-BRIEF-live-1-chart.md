# Cheat Code AI — LIVE-1 build brief: Chart engine + CCA indicators (2026-08-28)

Spec: `docs/15_KAI_LIVE_SPEC.md` (L1 + L2). Rounds 1–4 briefs still bind (tokens, no gamification, paper-only, security boundary, Expo SDK 54, lane path limits). Nav unchanged.

## Goal
Replace `apps/mobile/src/features/chart/PortalChart.tsx` (static SVG, 360 lines) with a real chart engine that (a) feels like a brokerage chart — 60fps pan/zoom, live last candle — (b) renders the CheatCode indicators, and (c) is a **drawing surface Kai controls** through the existing `ChartCommandFrame` + `Annotation` contracts, on iOS, Android, and web. Everything currently rendering `PortalChart` (Trade Portal, ticker page, circles) switches to it with no regression.

## Allowed new dependencies (exactly these)
- `@shopify/react-native-skia` (Expo SDK 54 compatible version; web via CanvasKit — configure `expo` web so `/stage` and the portal render on web).
- Nothing else. `react-native-gesture-handler` + `react-native-reanimated` are already present — use them for gestures and camera animation.

## Lane A — `packages/shared/indicators/` (CCA math in TypeScript)
Port from `~/breakout-alert-system/cheatcode_engine.py` (read it; functions `_ema`, `_rsi`, `rsi_heatmap`, `ema_cloud`, `reversal_bands`, `speed_bands`, `squeeze_momentum`, `swing_oscillator`, and the trend-cloud logic). Pure functions over `Candle[]` → per-bar series. Deterministic, no I/O.
- Generate **golden fixtures** by running the Python on 3 symbols × 3 timeframes (script under `scripts/indicators-fixtures.py`, outputs JSON to `packages/shared/indicators/__fixtures__/`); TS tests assert equality within 1e-6 (or the Python's own rounding).
- Export a `computeCca(candles, { timeframe })` returning `{ heatmap: HeatmapBar[], trendClouds, emaCloud, reversalBands, speedBands, squeeze, swing }` plus `ccaDisplayPolicy(timeframe)` → `{ trendClouds, emaCloud, reversalBands }` booleans (D = all on; 1m/5m/15m/1h/4h = off; heatmap always on).
- Name it **CheatCode Trend Clouds** in code/comments/labels. Never "SuperTrend".

## Lane B — `apps/mobile/src/features/chart/` (the engine)
- `ChartEngine.tsx` (Skia canvas) with a small imperative handle `ChartHandle`:
  `setCandles`, `appendOrUpdateLast`, `setTimeframe`, `focusTs(ts, {barsAround})`, `zoomToRange(ts1, ts2)`, `scrollByBars(n)`, `fitAll()`, `setIndicators(partial policy)`, `setAnnotations(Annotation[])`, `flashAnnotation(id)`, `screenshot()` — every camera change animated (reanimated spring/timing, ≤400 ms, respects reduced motion).
- Layers: grid + axes (price right, time bottom, JetBrains Mono numerals) · heatmap candles (color per `HeatmapBar`) · Trend Clouds / EMA cloud / Reversal Bands (per policy) · volume (optional, off by default) · **annotation layer**: `level` (horizontal, chip label right), `zone` (price…price2 band), `trendline` (ts/price → ts/price), `box` (FVG / order block: ts_from..ts_to × price..price2), `vertical` (ts), `note` (anchored text). Colors via `semantics.ts kindColor` + `kind` — extend `AnnotationKind` in `packages/shared` only if a kind is missing (`trendline`, `box`, `vertical` likely are; coordinate with Lane C via one append in `api.ts` + migration note in `docs/SCHEMA-NOTES.md`; do NOT change existing kinds).
- Gestures: pan (x), pinch (bar spacing), tap annotation → `onSelectAnnotation(a)`, long-press → crosshair with OHLC readout. Right-edge magnet: new bars keep the last candle in view unless the user has scrolled back (show a "jump to now" chip).
- Live candle: `appendOrUpdateLast` merges a tick into the forming bar; ≤16 ms per update; no full re-layout.
- Performance gate: 2,000 bars at 60 fps pan on an iPhone 12 class device (measure with the Expo dev client perf monitor; record numbers in the PR).
- Accessibility: chart has an accessible summary label (symbol, TF, last, range, count of annotations); annotations are focusable with their reason.
- Web: the same component renders in Expo web (CanvasKit). Add `/stage-check` dev route that mounts the chart at 1920×1080 with fixture data + 6 annotations for a visual check.

## Lane C — `apps/api` + shared contract
- `ChartCommandFrame` stays; add commands that the engine needs and the spec names but are missing today (`zoom_range`, `scroll_bars`, `set_indicators`, `flash_annotation`) with zod payload schemas in `packages/shared/api.ts` (append only). Document each command's payload + the engine method it maps to in `docs/02_API_CONTRACTS.md` (append a "Chart commands v2" section).
- Candles endpoint: ensure `GET /market/candles?symbol=&tf=1m|5m|15m|1h|4h|D&limit=` exists (Polygon aggs, cached, freshness label) and a `GET /market/cca?symbol=&tf=` that returns `computeCca` output from the shared package so mobile can use server-computed series for large ranges (client computes for live updates).

## Integration (Lane B owns)
- `src/features/portal/**` and `src/app/symbol/**` mount `ChartEngine` in place of `PortalChart`; apply incoming `chart_command` frames through a single `applyChartCommand(handle, frame)` in `src/features/chart/apply.ts` (this is the function Live will reuse). Keep the Kai narration behavior identical.
- Remove `PortalChart.tsx` when nothing imports it.

## Done gate (all must be true, proof in the PR)
1. `npm run smoke` green (181 now; add: candles + cca endpoints, chart-command v2 zod round-trip, indicator golden tests).
2. Proof screenshots in `apps/mobile/proof/live1-*.png`: portal on iOS sim (D with clouds/bands; 15m heatmap-only), 6 annotation kinds, crosshair, `/stage-check` on web at 1920×1080.
3. A short screen recording (or frame sequence) of a `mark_level` → `zoom_trigger` → `set_timeframe` command sequence animating.
4. Performance numbers recorded. No regression on existing proof flows (`p4b-06-chart-command`, `p4b-07-chart-timeframe`).
5. Design taste pass: load `taste-skill` + `emil-design-eng` before any visual work; no generic containers; Volt + Violet only.

Commit per lane, path-limited; PR titles `feat(chart): LIVE-1 …`.
