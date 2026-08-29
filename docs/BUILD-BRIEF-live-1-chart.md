# Cheat Code AI — LIVE-1 build brief: the chart Kai drives (v2, 2026-08-28)

Supersedes v1 (Skia). Owner decision 2026-08-28: **TradingView Lightweight Charts**, not a from-scratch engine. Indicator migration is explicitly NOT the priority of this lane. **The priority is camera control and native feel — it must feel like Kai is a real person clicking through timeframes and scrolling/zooming the chart, not a script teleporting the view.**

Spec: `docs/15_KAI_LIVE_SPEC.md`. Rounds 1–4 briefs still bind (tokens, Expo SDK 54, lane path limits, no gamification, paper-only, security boundary). Nav unchanged.

## Goal
Replace `apps/mobile/src/features/chart/PortalChart.tsx` with a Lightweight-Charts-based chart that (a) feels like the brokerage charts users already know — momentum scrolling, pinch zoom, crosshair, tap a level — (b) exposes a **camera + drawing API** Kai controls through the existing `ChartCommandFrame` / `Annotation` contracts, and (c) **performs every Kai command with human choreography**. Same component on iOS, Android, and web. Everything that mounts `PortalChart` today (Trade Portal, ticker page, circles) switches over with no regression.

## Allowed new dependencies (exactly these)
- `lightweight-charts` (v5 — use the primitives/plugin API for drawings).
- `react-native-webview` (install via `npx expo install` for SDK 54 compatibility).
Nothing else.

## Architecture
- `apps/mobile/chart-web/` — a tiny standalone web bundle (Vite or esbuild script; output committed as a single self-contained `index.html` under `apps/mobile/assets/chart/`) containing Lightweight Charts + our layers. No network fetch from inside the page; data and commands arrive over the bridge. Loaded by `WebView source={require(...)}` on native; on Expo web mount the same page in an `<iframe srcDoc>` (or direct DOM mount if cleaner — your call, document it).
- `apps/mobile/src/features/chart/ChartView.tsx` — the React Native component. Props: `symbol`, `timeframe`, `candles`, `annotations`, `onSelectAnnotation`, `onTimeframeChange`, `onViewportChange`, plus an imperative `ChartHandle` (below). Owns the bridge (`postMessage` / `injectJavaScript`), queues commands until the page reports `ready`, and re-sends state on reload.
- `apps/mobile/src/features/chart/apply.ts` — `applyChartCommand(handle, frame)`: maps every `ChartCommandFrame.command` to a **choreographed sequence** on the handle. This is the function Live reuses later; keep it pure and testable (sequence = array of steps with durations).
- Bridge protocol in `packages/shared/chart-bridge.ts` (zod): `Host→Chart`: `setData`, `updateLast`, `setTimeframe`, `camera.*`, `annotations.set/add/remove/flash`, `pointer.*`, `setTheme`; `Chart→Host`: `ready`, `viewport`, `annotationTap`, `crosshair`, `error`. Every message has `id`; camera commands resolve with `done{id}` so sequences can await them.

## Camera API (the point of this lane)
`ChartHandle`:
- `scrollByBars(n, {duration})`, `scrollToTime(ts, {align: 'center'|'right', duration})`, `scrollToNow({duration})`
- `zoomTo(barSpacing, {anchorTime?, duration})`, `zoomToRange(ts1, ts2, {padding, duration})`, `fit({duration})`
- `setTimeframe(tf)` — the **rail button visibly presses** (pressed state → chart crossfades, ≤250 ms) — never a hard cut.
- `pointer.moveTo(x|time, y|price, {duration})`, `pointer.press()`, `pointer.hide()` — **Kai's pointer**: a small violet cursor/halo overlay that travels to where Kai is about to act.
- All motion: eased (cubic-out for scroll, spring-ish settle for zoom), interruptible by the user (a user touch cancels the running Kai motion and reports `interrupted` to the host), respects reduced-motion (durations → 0 but state still applies). Implement zoom/scroll tweens with `requestAnimationFrame` over `timeScale().applyOptions({ barSpacing })` / `scrollToPosition` / `setVisibleLogicalRange`; use `kineticScroll` + `handleScroll/handleScale` options for user gestures.

## Choreography (how "a real person" is achieved)
Every Kai command is a short sequence, not an instant state change. Defaults (tunable in one `choreography.ts`):
- `mark_level`: pointer moves to the price (350–500 ms, slight ease-out overshoot ≤2 px) → 120 ms pause → level draws in left→right (220 ms) → chip label fades in → pointer lingers 200 ms → hides. Total ≈ 1.1 s.
- `zoom_trigger`: scroll so the trigger candle is at ~62% width (450 ms) → pause 150 ms → zoom in over 500 ms anchored on that candle → flash the candle (2 pulses).
- `set_timeframe`: pointer to the rail button (300 ms) → press (90 ms) → crossfade (250 ms) → `fit` to a sensible default window per TF (D: 120 bars, 4h: 120, 1h: 100, 15m: 96, 5m: 78, 1m: 90) → if a focus time is given, `scrollToTime` it.
- `show_invalidation`: pointer to the stop → dashed level + faint red zone below (long) / above (short) → 2-pulse.
- `mark_plan` (entry, stop, targets): sequential, ~700 ms apart, in the order Kai narrates.
- `compare_prior`: scroll left to the prior session (600 ms) → hold 1 s → scroll back (600 ms).
- Random jitter ±10% on durations so repeated commands don't look mechanical. Between commands in a stream: min 250 ms gap.
- Narration pairing: the host receives `done{id}` so text/audio can be aligned (Live will use it); the Portal keeps narrating as today.

## Chart layers (this lane)
- Candles (Lightweight `CandlestickSeries`), volume histogram (off by default), price line for last, session shading for pre/after-hours, right price axis + bottom time axis with **JetBrains Mono** numerals, crosshair with OHLC readout on long-press/hover.
- Per-bar candle colors are supported by the library — wire the hook (`color`/`wickColor` per bar) so the heatmap can plug in later with zero chart changes. **Do NOT port indicators in this lane.** Trend Clouds / EMA cloud / Reversal Bands = a follow-up lane (LIVE-1b) that only adds series.
- **Annotation layer** as v5 primitives: `level` (horizontal + chip on the right), `zone` (price…price2 band), `trendline` (two anchors), `box` (ts_from..ts_to × price..price2, for FVG / order blocks), `vertical` (time), `note` (anchored text). Colors via `semantics.ts kindColor`. Add missing kinds (`trendline`, `box`, `vertical`) to `AnnotationKind` in `packages/shared/api.ts` append-only + note in `docs/SCHEMA-NOTES.md`.
- Theme from tokens (Volt + Violet, dark surface); no library default colors leak through.

## Native feel checklist (must all pass on a real device or simulator, recorded in the PR)
- Horizontal drag scrolls the chart with momentum; vertical drag on the chart does NOT scroll the page (WebView `scrollEnabled=false`, `overScrollMode=never`, `bounces=false`, page `touch-action: none`).
- Pinch zooms around the pinch center; double-tap resets to the TF default window.
- No white flash on mount (WebView background = surface token; page pre-painted).
- First paint < 400 ms after mount with 1,500 bars; scroll at 60 fps on an iPhone 12 class device.
- Tap on an annotation chip selects it (host gets `annotationTap`), Portal shows its reason as today.
- Kai motion is interruptible by touch and resumes cleanly on the next command.

## Lane C — API
- Cherry-pick **only** `apps/api/src/app/api/v1/market/candles/route.ts` and `apps/api/src/lib/market/polygon.ts` from branch `wip/live1-agent-partial` (candles for 1m/5m/15m/1h/4h/1d + cap). Ignore the circles/rooms/seed edits on that branch.
- Append to `packages/shared/api.ts`: `ChartCommandName` additions `zoom_range`, `scroll_bars`, `scroll_to_now`, `flash_annotation`, `pointer_hint` with zod payloads. Document in `docs/02_API_CONTRACTS.md` ("Chart commands v2").

## Integration
- `src/features/portal/**` and `src/app/symbol/**` mount `ChartView`; incoming `chart_command` frames go through `applyChartCommand`. Delete `PortalChart.tsx` when unreferenced.

## Done gate (proof in the PR)
1. `npm run smoke` green (181 now; add candles 6-TF + chart-command v2 zod round-trip + a choreography sequence unit test).
2. **A screen recording** (or ≥12-frame sequence) on the iOS simulator of: `set_timeframe(D)` → `mark_level(trigger)` → `zoom_trigger` → `set_timeframe(15m)` → `mark_plan` → `compare_prior`, showing the pointer, presses, eased motion. This is the primary acceptance artifact; the owner will judge whether it "feels like a person."
3. Proof screenshots `apps/mobile/proof/live1-*.png`: portal iOS, all 6 annotation kinds, crosshair, Expo web at 1920×1080 (`/stage-check` dev route with fixture data).
4. Native-feel checklist results + perf numbers. No regression on `p4b-06-chart-command`, `p4b-07-chart-timeframe`.
5. Design taste pass: load `taste-skill` + `emil-design-eng` + `apple-design` (motion/spring guidance) before visual work.

Commit per lane, path-limited; PR titles `feat(chart): LIVE-1 …`.
