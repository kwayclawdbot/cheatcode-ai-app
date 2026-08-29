# Cheat Code AI — Kai Live (spec v1, 2026-08-28)

Owner decisions (2026-08-28, final):
- **Kai Live = one show engine, two outputs.** Market hours (9:30–4 ET) → **live inside the app, paid**. After hours → **review show on YouTube, free**, as marketing for the app.
- **The core is Kai analyzing setups live, in real time** as they form during the session. Everything else (cohost, graphics, music) is furniture around that.
- Built from scratch in this repo. `~/projects/trading-stream` (repo `kwayclawdbot/cheatcode-live`) is **deprecated — reference only** for show format, prompt style, voice direction, and the per-timeframe indicator policy. No code carries over.
- The chart built for Live is **the** chart everywhere in the app (Trade Portal, ticker page, circles, alerts). Not a Live-only component.

## 1. What the viewer gets

**In the app (premium, market hours).** A Live screen. Kai is working the chart: when the scanner flags a setup, Kai pulls it up, walks the timeframes, marks trigger / entry / stop / target on the chart while explaining why, and keeps commentary going as price moves. The viewer hears Kai and watches the chart get marked up in place. They can request a ticker, tap any Kai annotation to read its reason, and one tap opens the same symbol in their own Trade Portal with Kai's annotations already there. Free users see a locked preview + "Watch the review on YouTube."

**On YouTube (free, after hours + weekends).** The same engine in review mode: today's setups replayed and graded, Kai's winners, what to watch tomorrow, subscriber requests from YouTube chat. Show graphics (ticker rail, Kai avatar, "Get Cheat Code AI" banner, cohost intros/outros). Every segment ends with the app CTA.

## 2. How it works (plain English)

Kai's show is not a video. It is a **timeline of small events**: *say this line*, *mark a level*, *switch to the 1-hour*, *zoom to the trigger candle*, *show what invalidates*. The app already has this vocabulary — `ChartCommandFrame` in `packages/shared/api.ts` (`mark_level`, `set_timeframe`, `zoom_trigger`, `show_invalidation`, `mark_plan`, …) with narration + provenance on every frame. Live extends it with `say` (audio) and `present` (switch symbol) events and broadcasts the timeline to everyone watching. The app plays the timeline on its own chart. For YouTube, a web page renders the same timeline full-screen and a cloud machine records it.

```
market-intelligence worker ─ setup_events (discovered / forming / ready / triggered)
            │
   workers/kai-live  ── picks what to present (ready A/B setups first, requests, winners)
            │           analyzes top-down (D → 4H → 1H → 15m → 5m), writes Kai's lines,
            │           generates audio, emits a LiveTimeline of frames
            ▼
   Supabase Realtime broadcast `live:<show_id>` + audio in Storage `live-audio/`
            │
     ┌──────┴──────────────┐
  app Live screen       web stage page (Expo web route, 1920×1080)
  (premium gate)        → headless Chromium + ffmpeg → RTMP → YouTube
```

## 3. Components

| # | Component | Where | What it is |
|---|---|---|---|
| L1 | **Chart engine** | `apps/mobile/src/features/chart/` | Skia-rendered candle chart: pan/zoom, 1m/5m/15m/1h/4h/D, live last-candle updates, CCA indicators, annotation layer Kai can draw on (level, zone, trendline, box/FVG, vertical, note), camera commands (focus ts, zoom to range, scroll), replaces `PortalChart`. Runs on iOS/Android/web. |
| L2 | **CCA indicators in TS** | `packages/shared/indicators/` | Port of `~/breakout-alert-system/cheatcode_engine.py` math: RSI heatmap candle coloring, Trend Clouds, EMA cloud, Reversal Bands, Speed Bands, Squeeze, Swing. Golden-fixture tested against the Python output. Per-TF display policy: **D = clouds + EMA + bands; intraday = heatmap only**, Kai toggles layers on demand. |
| L3 | **LiveTimeline contract** | `packages/shared/api.ts` | `LiveFrame = ChartCommandFrame \| SayFrame \| PresentFrame \| OverlayFrame` with `t_offset_ms`, `show_id`, `seq`. `SayFrame{ voice: kai\|cohost, text, audio_url, duration_ms }`. Zod-validated; replayable; idempotent by `seq`. |
| L4 | **kai-live worker** | `workers/kai-live/` | Director loop: source router (ready setups → subscriber requests → Kai winners → watchlist), top-down analysis prompts (Claude 5), Kai voice per experience level, TTS (OpenAI `gpt-4o-mini-tts`, ash=Kai, coral=cohost), prep buffer depth 2 so the next segment is ready before the current ends, budget cap ($/hr), health. Market-hours mode reacts to `setup_events` in real time; after-hours mode runs the review rundown. |
| L5 | **Live screen (app)** | `apps/mobile/src/app/(tabs)/…/live` | Subscribes to the show, plays audio (`expo-audio`), applies frames to L1, "now / up next" rail, request-a-ticker composer, tap-annotation-for-reason, "Open in Trade Portal" (carries annotations), premium gate + locked preview. |
| L6 | **Stage page (web)** | `apps/mobile/src/app/stage/[show]` (Expo web) | 1920×1080 layout: chart + Kai avatar + ticker rail + CTA banner + slideshow panel (intro/thesis), same frames, autoplay audio. |
| L7 | **Broadcast box** | `infra/stage-capture/` | Docker: Xvfb + Chromium + ffmpeg → RTMP to YouTube (direct; simulcast via YouTube). ~$40/mo VM. YouTube chat poll → `$TICKER` requests into L4's source router. |
| L8 | **Monetization hooks** | api + app | `premium` entitlement gates L5; in-app "request a ticker" (premium) and later tip-to-jump-queue; YouTube → app deep link with attribution. |

## 4. Build order

1. **LIVE-1 Chart engine + indicators (L1, L2)** — usable in the Trade Portal immediately; the foundation for everything.
2. **LIVE-2 Timeline contract + kai-live worker after-hours mode (L3, L4)** — review show runs end-to-end in a local stage page.
3. **LIVE-3 Live screen in app + premium gate (L5, L8)**.
4. **LIVE-4 Market-hours mode (L4)** — the real-time setup loop off `setup_events`; requires Phase 3 scanner from `04_BUILD_PLAN.md`.
5. **LIVE-5 Stage page + broadcast box → YouTube (L6, L7)**.
6. **LIVE-6 Furniture** — cohost, intros/outros, music bed with ducking, winners leaderboard, tipping.

## 5. Rules that bind
- Never the word "SuperTrend" — it's **CheatCode Trend Clouds**. Data is **Polygon only**.
- Every number Kai marks comes from a setup/alert/plan object with provenance; Kai never invents a level (existing `chart_command` rule).
- Kai is an analyst, not a broker: no fill/execution language in the show. Paper-only execution stays in Trade.
- Palette Volt + Violet (`14_PALETTE_LOCK_VOLT_VIOLET.md`): user = volt, Kai = violet, market = cyan. Tickers always with logo (shared `<Ticker>`).
- Design register: premium, confident, adult-first; never generic card grids.
