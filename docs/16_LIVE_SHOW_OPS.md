# Kai Live — running a show (LIVE-2, 2026-08-28)

How to start one, what it costs, what breaks, and what LIVE-4 has to add.
Spec: `docs/15_KAI_LIVE_SPEC.md`. Brief: `docs/BUILD-BRIEF-live-2-show-brain.md`.

---

## 1. What actually exists

```
workers/kai-live/                 the show brain (Node 22+, tsx, no framework)
  src/director.ts                 producer/consumer, prep buffer depth 2
  src/sources.ts                  setups → requests → winners → watchlist
  src/analyze.ts                  D → 4h → 1h → 15m, sequential, then a thesis
  src/resolve.ts                  markers → chart frames; drops what it cannot trace
  src/voice.ts                    show register, banned list, first-use glossary
  src/tts.ts                      OpenAI gpt-4o-mini-tts, ash / coral, cached
  src/budget.ts  src/health.ts    measured spend, hard cap, heartbeat

packages/shared/live.ts           the timeline contract (zod)
supabase/migrations/0023_*.sql    live_shows · live_segments · live_frames ·
                                  live_requests · the `live-audio` bucket · RLS
apps/api/src/app/api/v1/live/**   4 public routes + 5 worker-only routes
apps/mobile/src/features/chart/live-client.ts   subscribe · reconcile · replay
apps/mobile/src/app/stage-check.tsx             `?show=` plays a real show
```

The worker owns the **show**. `apps/api` owns the **numbers** — candles, technicals,
setup derivations, annotation writes — and the worker reaches them over
`/api/v1/live/internal/**` with `INTERNAL_SECRET`. There is no second copy of the
Polygon logic, the swing detector or the setup maths anywhere in the worker, on
purpose: the show and the app must never quote different prices for one level.

---

## 2. Start a show

```bash
# 1. the stack
supabase start                      # or confirm `supabase status`
cd apps/api && npm run dev          # :3000 — the worker will not start without it

# 2. the show
cd workers/kai-live
npm install
npm run show:review                 # after-hours review mode
```

The run prints its configuration before it spends anything:

```
  kai-live
    supabase               yes
    anthropic              yes
    openai                 yes
    internal_secret        yes
    api_base               http://localhost:3000
    model                  claude-sonnet-5
    budget_usd_per_hour    3
    api                    polygon=true anthropic=true annotations=true
```

A `NO` on `supabase`, `anthropic` or `internal_secret` exits before any spend.
A `NO` on `openai` runs the show as captions with no audio (see §6).

Useful flags and variables:

| | |
|---|---|
| `--segments 4` / `SHOW_MAX_SEGMENTS` | stop after N segments (0 = until the rundown is empty) |
| `LIVE_PACE=12` | play the timeline N× faster. **Only the wall clock is scaled** — `t_offset_ms` is still real, so the recorded show plays back at true speed |
| `SHOW_PREP_DEPTH` | segments kept ready ahead of the one playing (default 2) |
| `SHOW_BUDGET_USD_PER_HOUR` | the hard cap (default 3.00) |
| `LIVE_LOG_JSON=1` | machine-readable log lines instead of the console |

Stopping: `Ctrl-C`. The director marks the show `ended`, so a later run is not
blocked by the one-live-show-per-mode unique index. A run that was killed hard
leaves a `live` row behind; the next run ends it on startup rather than refusing
to start.

## 3. Watch it

```
/stage-check?show=<id>&token=<jwt>&pace=8[&since=<seq>]
```

Requires the Expo web dev server with `EXPO_PUBLIC_FIXTURES=1` (the route is
gated out of the session-guarded app) and a Supabase access token — the harness
has no session of its own. `workers/kai-live/scripts/proof-stage.mjs` mints a
throwaway user, drives the page and deletes the user again:

```bash
cd apps/mobile && EXPO_PUBLIC_FIXTURES=1 EXPO_PUBLIC_API_BASE=http://localhost:3000 \
  npx expo start --web --port 8090
cd workers/kai-live && node scripts/proof-stage.mjs --show <id> --web http://localhost:8090
```

`since=<seq>` is the late-join path and the replay path — they are the same
request. Frames are applied strictly in `seq` order and a frame that would open
a gap is held rather than applied, so a client that joins at 41 lands in exactly
the state a client that watched from 0 is in.

## 4. Stop, health, and what to look at when it goes wrong

`GET /api/v1/live/health` (any signed-in user for a review show; premium for a
market show):

```json
{ "buffer_depth": 2, "segments_done": 3, "spend_usd": 0.0655,
  "budget_usd_per_hour": 3, "degraded": false, "last_error": null,
  "heartbeat_at": "2026-08-28T…" }
```

- **`buffer_depth` is the number that matters.** It is derived from the segment
  rows by the API, not reported by the worker, so a wedged director cannot claim
  a buffer it does not have. At 0 the next gap becomes a cohost bridge.
- **`heartbeat_at` is liveness.** A `live` show whose heartbeat is minutes old is
  a dead director — a different failure from a show that ended.
- **`last_error` and `degraded` come from the worker**, because only the process
  that paid the bill knows what it cost.

## 5. What it costs — measured, 2026-08-28

Real run, four segments, live Anthropic + Polygon keys, `claude-sonnet-5`:

| segment | symbol | source | frames | cost |
|---|---|---|---|---|
| 0 | META | setup | 26 | **$0.0261** |
| 1 | NVDA | setup | 17 | **$0.0117** |
| 2 | QQQ | watchlist | 14 | **$0.0086** |
| 3 | CRM | watchlist | 17 | **$0.0191** |
| | | | **76** | **$0.0655 total** |

Show id `22430768-8176-4411-bdfa-a439259f26d9`. Per-segment lines are in the
`show.cost_table` log entry and in `live_segments.cost_usd`.

**Per hour.** A segment plays for roughly four to seven minutes, so an hour is
nine to fifteen segments: **$0.20 – $0.30 an hour of model spend** at this
segment shape, an order of magnitude under the $3.00 cap. Two things will move
that:

- **Audio is not in this number.** OpenAI's credits were exhausted during the
  build, so no TTS call succeeded. At the estimated rate
  (`LIVE_TTS_USD_PER_1K_CHARS`, default 0.015) a segment's ~4,000 spoken
  characters is about **$0.06**, roughly doubling the per-segment cost. That rate
  is an ESTIMATE and is labelled as one in `budget.ts` — **reconcile it against a
  real invoice before quoting a per-hour figure to anybody.**
- **Deeper segments cost more.** Three of the four segments above only got the
  daily timeframe, because the local `candles` cache has too few 4h/1h/15m bars
  for the others. A full four-timeframe segment (META) cost 2–3× a one-timeframe
  one. Budget for **$0.03 – $0.05 a segment** once the market-data worker is
  keeping intraday bars warm.

**Why it is this cheap.** The frozen half of the system prompt (voice, banned
register, marker grammar, TTS rules) rides in an ephemeral cache block and fires
five times a segment; the bars are summarised into shape and technicals rather
than dumped as JSON; the cohost's opening and handoff are templates, not
generated. `output_config.effort` is `low`, matching the API's other Kai calls.

## 6. When the audio provider is dead

**It was, for this entire lane.** `OPENAI_API_KEY` is present and valid; the
account has no credits (`429 insufficient_quota`). What happens:

- The first failure **latches** — one 401/402/429 disables TTS for the run rather
  than paying the latency of four hundred failed requests to learn the same
  thing.
- Every `SayFrame` carries `audio_url: null`, `audio_state: 'estimated'`, and a
  duration worked out from the words (~165 wpm plus a beat per sentence).
- The show plays as **captions over a moving chart**. `/stage-check` says
  "captions only, no audio in this show" in its status line.

Nothing is faked and no fixture audio is substituted. To restore audio: add
credits, then re-run. The cache is keyed on `(text, voice, model, speed)` so a
re-run of the same script pays only for lines it has never spoken — and the voice
is IN the key, which is what stops a voice change from replaying the old one
forever.

## 7. The rule this lane rests on

Kai never says a number that cannot be traced to a real object.

Structurally, not by instruction: the model is given a closed list of levels by
NAME and writes `[MARK:trigger]`, never a price. The resolver looks the name up
in the level table (built from the setup / alert / computed swing levels),
persists an annotation through the API, and only then emits a `ChartFrame`. A
marker with no matching level, or whose annotation could not be persisted, is
**dropped and the sentence that referenced it is rewritten without it** — one
small model call, or the sentence is cut if that call fails.

Observed on the first real run: three markers dropped on the META segment
(`[MARK:support]`, `[ZOOM:resistance]`) because that setup carried a plan and no
swing levels. Three sentences were rewritten. Nothing untraceable was drawn.

**Known gap, and it is the important one.** The prose check
(`unbackedPrices`) only sees numbers written as DIGITS. The TTS rules require
numbers as words — "two thirty-four sixty-three" — so a number spelled out is
invisible to it. The mitigation is upstream (the model is never given a level it
may not name), and it holds in practice, but the guard behind it does not cover
the spoken form. Closing it means a words-to-number parser over the narration;
that is a LIVE-4 item, not a nice-to-have.

## 8. Test it

```bash
cd workers/kai-live && npm test    # 76 checks, no network, under a second
node scripts/rls-test.mjs          # includes the live-show paywall assertions
cd apps/api && ./scripts/smoke.sh  # the whole API surface
```

`npm test` covers the timeline round-trip, the reconcile rule (gap held, late
join lands in the same place, duplicates are no-ops), the marker grammar, the
level table and the drop rule, the register and glossary, the budget cap
tripping, the prep buffer's slot accounting and stale-prep reaper, and WAV
duration parsing including the streamed-header gotcha.

`rls-test.mjs` proves the paywall is on the DATA: a free user reads a review
show and cannot read a market-mode show, its segments or its frames; a premium
user can; no client may write a frame or start a show; only a premium user may
queue a request, and only in their own name.

## 9. What LIVE-4 (market hours) has to add

The director already treats mode as a strategy object (`Mode` in `director.ts`),
so most of this is filling one in rather than editing the loop.

1. **A `market` mode that waits instead of ending.** `MARKET_MODE.onDry = 'wait'`
   exists; what it waits ON does not. It needs to react to `setup_events`
   (discovered / forming / ready / triggered) rather than re-polling the rundown,
   which means the Phase-3 scanner from `04_BUILD_PLAN.md`.
2. **Pre-emption.** A review show plays its rundown in order. A live show has to
   be able to interrupt: a setup going `ready` mid-segment outranks the watchlist
   name currently on screen. That is a new decision — how far into a segment
   pre-emption is still allowed, and what the cohost says — and it is the main
   thing this lane deliberately did not build.
3. **Live bars.** Segments here are built from stored candles. A market-hours
   show needs the last bar to keep updating under the marks (`updateLast` on the
   bridge already exists; nothing calls it).
4. **The premium gate on the way in.** RLS and the API already refuse a free user
   a market-mode show. The Live SCREEN (LIVE-3) still has to render the locked
   preview and the "watch the review on YouTube" fallback.
5. **A words-to-number check** on narration — see §7.
6. **Intraday bar coverage.** Three of four segments in the measured run had only
   a daily read. Market hours is a 15m/5m show; without warm intraday bars it
   would be a daily show running during the session.
7. **Cost, honestly re-measured** once audio is real and segments are four
   timeframes deep. The $3/hr cap is not close to binding today and might be at
   ten to fifteen richer segments an hour with TTS.

## 10. Things worth knowing before you touch it

- **`live_segments` is unique on `(show_id, symbol)`.** The no-repeat rule is in
  the database, not only in the router. Bridges take a symbol of their own
  (`BRIDGE-n`) for exactly this reason.
- **Frames are written before they are broadcast, always.** The table is the
  truth; the broadcast is the fast path. A frame seen live and missing from the
  replay is the one inconsistency a viewer cannot fix by refreshing.
- **The show's annotations live in a stage account** (`stage@kai-live.local`,
  created on first use). `chart_annotations.user_id` is NOT NULL and is the
  OWNER, not the author (0021 §3) — so the show needs a workspace, and this is
  it. Frames carry the rows inline, so a viewer renders them without reading
  anybody's rows.
- **A failed candle load must clear the chart.** Caught in the proof capture: the
  stage page briefly showed one ticker's candles under another's name, because
  symbol and bars were separate state and `ChartView` keys `setData` on
  symbol|timeframe|length|firstTs|lastTs — identical for two 125-bar daily charts
  once the symbol had already changed. They move as one value now.
- **`LIVE_PACE` scales the wall clock only.** If it ever scales `t_offset_ms`,
  every fast run will record a show nobody can play back at the right speed.
