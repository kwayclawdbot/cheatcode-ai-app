# Cheat Code AI — LIVE-2 build brief: Kai's show brain (2026-08-28)

Spec: `docs/15_KAI_LIVE_SPEC.md` (L3 + L4). Follows LIVE-1 (the chart Kai drives — shipped, commits `9145876`…`0607e49`). Rounds 1–4 briefs still bind. **Market-hours real-time mode is LIVE-4 and NOT in this lane** — but the director must be built so mode is a strategy object, not a fork sprayed through the code.

## Goal
A worker that runs the **after-hours review show** end to end without a human: it decides what to talk about, analyzes it top-down, writes Kai's lines, generates the audio, and emits a **timeline of frames** that the LIVE-1 chart plays back. Acceptance is a recorded playback of a real generated show driving the real chart.

## Where it lives
`workers/kai-live/` — a plain Node 22 TypeScript process (run with `tsx`; no framework). It imports `@cheatcode/shared` and talks to Supabase with the service role key. It is NOT a Next.js route: the director is a long-running loop and `apps/api` is serverless. Deployment (Railway, alongside Kai's existing services) is LIVE-5's problem; this lane must run locally with `npm run show:review`.

**Path limits for this lane** (another agent is active in this repo — do not touch anything else): `workers/kai-live/**`, `packages/shared/live.ts` (NEW file — do **not** edit `packages/shared/api.ts`, it is contended), `supabase/migrations/0023_live_shows.sql`, `apps/api/src/app/api/v1/live/**`, `apps/mobile/src/app/stage-check.tsx` + `apps/mobile/src/features/chart/live-client.ts` (NEW), `docs/**`.

## The timeline contract — `packages/shared/live.ts` (zod, new file)
```
LiveFrame = SayFrame | ChartFrame | PresentFrame | OverlayFrame
```
- Common: `show_id`, `seq` (monotonic, gap-free per show), `segment_id`, `t_offset_ms` (from segment start), `kind`.
- `SayFrame` — `{ voice: 'kai' | 'cohost', text, audio_url, duration_ms, glossary?: {term, plain}[] }`.
- `ChartFrame` — wraps the LIVE-1 `chart_command` payload shape (import the command names from `@shared/api`; **do not redefine or edit them**) plus `annotation_ids[]` and `provenance`.
- `PresentFrame` — `{ symbol, timeframe, headline, source: 'setup'|'request'|'winner'|'watchlist' }` — the chart switches symbol.
- `OverlayFrame` — `{ overlay: 'ticker_rail'|'levels'|'winners'|'cta'|'clear', payload }` (rendering is LIVE-5; emit them now).
- Every frame is **idempotent by `(show_id, seq)`** and replayable: a late joiner reads the table from `seq 0` (or the current segment) and arrives at the same state.

## Schema — `supabase/migrations/0023_live_shows.sql`
- `live_shows(id, mode 'review'|'market', status 'preparing'|'live'|'ended', started_at, ended_at, title, meta jsonb)`
- `live_segments(id, show_id, seq, symbol, source, state 'prepared'|'playing'|'done', prepared_at, started_at, ended_at, cost_usd numeric, meta jsonb)`
- `live_frames(id, show_id, segment_id, seq, kind, payload jsonb, t_offset_ms, created_at)` — unique `(show_id, seq)`.
- RLS: **read** = any authenticated user for `mode='review'`; `mode='market'` requires the `premium` entitlement (reuse `lib/entitlements.ts` semantics — API-side check plus a policy; document which enforces what). **Write = service role only.** End every function with the explicit revoke (gap 2.7). Extend `scripts/rls-test.mjs`: a free user must not read a market-mode show.
- Storage bucket `live-audio` (public read, service-role write) for the TTS wavs/mp3s.

## The worker
**Director loop** (`src/director.ts`) — producer/consumer with a prep buffer of depth 2: while segment N plays, N+1 is prepared and N+2 is being analyzed. Consumer emits frames on the wall clock and marks segments played. Never let the buffer empty mid-show (emit a short cohost bridge rather than silence).

**Source router** (`src/sources.ts`), in priority order, never repeating a symbol within a show:
1. Ready **A/B setups** from today (`setups` + `alerts`; reuse `lib/setups.ts` helpers — `levels`, `narration`, `whyPlain`, `scenarios`, `toEvidence`).
2. **Subscriber requests** (a `live_requests` row — table in this migration; premium only, API-inserted).
3. **Recent winners** — alerts whose outcome played out, excluding anything still inside its hold window.
4. **Watchlist / movers** fallback.

**Analyzer** (`src/analyze.ts`) — per symbol, top-down **D → 4h → 1h → 15m**, using the real objects only: candles + CCA-less technicals via `apps/api`'s market libs (call the API over HTTP with `INTERNAL_SECRET`, do not duplicate Polygon logic), company profile, the setup/alert object, community mentions if present. Claude via the same `ANTHROPIC_API_KEY` / `KAI_MODEL` the API uses.
- Output per timeframe: narration text **with inline markers** (`[MARK:trigger]`, `[ZOOM:trigger]`, `[TF:15m]`, `[COMPARE:prior]`, `[NOTE:"…"]`) — same grammar family as LIVE-1's commands.
- A **resolver** (`src/resolve.ts`) turns each marker into a `ChartFrame` by looking up a **persisted annotation** (create it through the annotations API first). **A marker whose number cannot be traced to a real object is dropped, and the sentence that referenced it is regenerated without it.** Kai never invents a level — this is the existing rule and it is load-bearing here because nobody is watching the generation.
- Contradiction check: reuse `lib/kai/contradiction.ts` semantics — a segment whose narration disagrees with the setup's own direction/levels is rejected and re-generated once, then skipped.

**Voice** (`src/voice.ts`) — the show register, distinct from the per-user `lib/kai/voice.ts` (read it; match its spirit, don't import its user-experience branching). One rule from standing guidance: **plain definition first, metaphor only as the closer, and define a term the first time it appears** — the YouTube audience is beginners. Emit the definition as `SayFrame.glossary` so LIVE-5 can show it on screen. Banned register (from the deprecated show's hard-won list): "notably / interestingly / moreover / furthermore", passive voice, three-adjective stacks, "as you can see on the chart", "boom".

**TTS** (`src/tts.ts`) — OpenAI `gpt-4o-mini-tts`; **ash = Kai (lead), coral = cohost** (standing default). Per-segment audio uploaded to `live-audio`, `SayFrame` carries the URL + measured duration. Cache by hash of (text, voice, model) so re-runs cost nothing. New env `OPENAI_API_KEY` — the owner's key is in `~/breakout-alert-system/.env`; copy the value into `workers/kai-live/.env.local` (gitignored) for local runs and **document the var in `docs/ENV.md`. Never commit a key.**

**Budget + health** (`src/budget.ts`, `src/health.ts`) — hard cap `SHOW_BUDGET_USD_PER_HOUR` (default 3.00); when the projected spend of the next segment would breach it, the director drops to cached/fixture segments and logs it loudly rather than silently degrading. Track per-segment `cost_usd`. A `GET /api/v1/live/health` returns show state, buffer depth, spend, last error.

## API (`apps/api/src/app/api/v1/live/**`)
- `GET /live/current` → the active show + current segment + the frames since a given `seq` (late-join).
- `GET /live/shows/:id/frames?since=` → replay.
- `POST /live/requests` → a premium user requests a symbol (rate-limited via `lib/ratelimit.ts`).
- Realtime: the worker **broadcasts** each frame on channel `live:<show_id>` (Supabase Realtime broadcast) *and* writes it to `live_frames`. Broadcast is the fast path; the table is the truth. Clients reconcile by `seq`.

## Client proof (`apps/mobile`)
Extend the existing `/stage-check` dev route: given `?show=<id>` (or "latest"), subscribe, and drive the **real LIVE-1 chart** — `PresentFrame` switches symbol, `ChartFrame` goes through the existing `applyChartCommand`, `SayFrame` plays its audio and shows the line. This is the proof that the brain and the chart actually fit together. `live-client.ts` holds the subscribe/reconcile/replay logic (Live screen reuses it in LIVE-3).

## Done gate (proof in the PR)
1. **A real generated show**, not fixtures: run `npm run show:review` against the live Anthropic + OpenAI + Polygon keys and produce **≥3 segments** for real symbols. Record the actual spend and paste the per-segment `cost_usd`.
2. **A screen recording** of `/stage-check?show=<that show>` playing back at least one full segment — chart moving under Kai's narration, audio audible in the capture if the tooling allows, otherwise a frame sequence plus the audio file. This is the primary artifact; the owner judges whether it reads as a show.
3. Replay/late-join proven: kill the client mid-segment, reconnect, and show it lands in the same state (assert on `seq`).
4. `npm run smoke` still green (260/1 pre-existing failure documented in the LIVE-1 report — do not "fix" it here) plus new: live contract zod round-trip, resolver drops an untraceable level, RLS test (free user cannot read a market-mode show), budget cap trips to cached.
5. A `docs/16_LIVE_SHOW_OPS.md`: how to start/stop a show, env vars, cost per hour measured, and what LIVE-4 (market hours) will need to add.
6. If Anthropic or OpenAI credits are dead, do not fake the show — say so, ship everything else, and make the fixture path explicit.

Commit per area, path-limited; PR titles `feat(live): LIVE-2 …`.
