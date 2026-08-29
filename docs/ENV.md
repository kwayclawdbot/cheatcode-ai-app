# Environment

## apps/api/.env.local (never commit)
ANTHROPIC_API_KEY=…            # present (copied from owner env, verified 200 OK 2026-08-26)
KAI_MODEL=claude-sonnet-5
SUPABASE_URL=                  # local: http://127.0.0.1:54321 (from `supabase status`); hosted: pending (org invoice overdue)
SUPABASE_SERVICE_ROLE_KEY=     # from `supabase status`
SUPABASE_ANON_KEY=

### Market data — Polygon (updated 2026-08-29, plan upgraded)

```
POLYGON_API_KEY=…              # required for any live market data
POLYGON_REALTIME=              # a HINT ONLY. See below — the observation wins.
POLYGON_RPM=100                # requests / rolling minute. Was 5 on the old plan.
POLYGON_MAX_CONCURRENCY=8      # in-flight cap; waiters QUEUE, they are not refused
POLYGON_QUEUE_MAX_MS=8000      # how long a waiter holds on before serving cache
POLYGON_429_COOLDOWN_S=20      # one 429 parks every caller for this long
POLYGON_BASE_LIMIT=50000       # BASE aggregates scanned per request (not bars!)
POLYGON_MAX_CANDLES=1500       # bars RETURNED per request (a display cap)
POLYGON_LIVE_MAX_MIN=2         # market minutes of lateness still counted `live`
POLYGON_DELAYED_MAX_MIN=45     # beyond this, during an OPEN session, it is `stale`
POLYGON_SNAPSHOT_TTL_S=        # quote memo; default 10s open / 60s closed
POLYGON_REFILL_COOLDOWN_S=     # candle refill floor; default 20s open / 60s closed
```

**Nothing here sets a freshness.** Every variable above moves a threshold or a
budget; the verdict is always computed from the age of the data that came back.
See the block at the top of `apps/api/src/lib/market/polygon.ts`.

| Variable | What it does |
|---|---|
| `POLYGON_API_KEY` | the only required one. Without it every market surface answers `degraded` with "Live market data is not connected yet" and keeps working off the `candles` store. |
| `POLYGON_REALTIME` | **a hint, and the weakest input there is.** `1`/`true` says "assume real-time", `0`/`false` says "assume delayed", unset says nothing. It seeds an assumption and is overridden by (1) the lateness we actually measure during an open session and (2) Polygon stamping `status:"DELAYED"` on a body. Setting it to `1` on a plan that is really fifteen minutes behind changes nothing after the first quote of the first session — and it can never, on its own, make a price read `live`. It exists so a fresh process has a sensible first guess before the market opens, not so anyone can declare an entitlement. |
| `POLYGON_RPM` | the non-blocking token bucket. The old plan allowed 5 a minute and the app was built around that famine (measured 2026-08-29: twelve rapid calls, all 200 — it is gone). When the budget IS spent nothing queues: the cache answers and the response says `degraded`. |
| `POLYGON_MAX_CONCURRENCY` / `POLYGON_QUEUE_MAX_MS` | politeness, not scarcity. Over the cap a caller WAITS (up to `QUEUE_MAX_MS`, just under the 9s request timeout) rather than being refused — refusing because thirty requests are in flight this millisecond serves stale data to protect nobody. |
| `POLYGON_429_COOLDOWN_S` | a 429 is still possible on any plan. One is enough to stand every caller down for this long, instead of retrying into the wall. |
| `POLYGON_BASE_LIMIT` | **not a bar count.** Polygon's `limit` bounds the number of one-minute BASE aggregates it will scan, and the response stops when that runs out — silently, with `status:"OK"`. Passing our 1500-bar display cap into it meant the 15-minute chart ended nine days before the present (measured; see `fetchAggregates`). 50 000 is Polygon's own ceiling and covers about 50 calendar days of minute bases, so wider requests are clamped at the OLD end rather than being allowed to stop short at the new one. |
| `POLYGON_MAX_CANDLES` | how many bars go back on the wire, newest kept. A three-month 1-minute range is 30 000 bars nobody can draw. |
| `POLYGON_LIVE_MAX_MIN` / `POLYGON_DELAYED_MAX_MIN` | the two thresholds, in minutes of MARKET time (09:30–16:00 ET only — nights and weekends do not accrue). Inside the first, data reaches the present. Between them it is `delayed`: real, late, labeled, and **actions stay enabled**. Past the second, during an open session, the feed has stopped and it is `stale`. 45 is deliberately generous: it covers a 15-minute entitlement delay plus bar granularity. |
| `POLYGON_SNAPSHOT_TTL_S` / `POLYGON_REFILL_COOLDOWN_S` | how long a quote and a candle series are reused. Both default to a short window while the market is open and a long one while it is shut, because a minute is a long time in a live session and no time at all in a closed one. |

**Not set anywhere yet:** there is no websocket configuration. The account does
have real-time stock entitlement on `wss://socket.polygon.io/stocks`
(`auth_success`, and `T.`/`Q.`/`AM.` subscriptions accepted — verified
2026-08-29), but nothing in this app consumes a push stream.

### Round 5 — push (never commit; the key pair below is DEV ONLY)

```
VAPID_PUBLIC_KEY=…            # generate once: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=…           # free, no account, no third party involved
VAPID_SUBJECT=mailto:support@cheatcode.com
PUSH_DRY_RUN=1                # EXPO ONLY: build + log the message, contact nothing
PUSH_DRAIN_DEV_INTERVAL_S=20  # the local sender; hosted this is the Vercel cron
EXPO_ACCESS_TOKEN=            # optional; only needed once Expo push is enhanced-security
```

| Variable | What it does |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | the Web Push signing pair. A browser subscribes against the PUBLIC half (served to the client by `GET /api/v1/push/subscriptions` as `vapid_public_key`, and to the mobile web build as `EXPO_PUBLIC_VAPID_PUBLIC_KEY`), and only the private half can sign for it. **Rotating them invalidates every existing browser subscription** — every device has to re-register — so the dev pair and the production pair are different pairs, and neither is ever committed. |
| `VAPID_SUBJECT` | a `mailto:` or `https:` the push service can contact about us. Defaults to `mailto:support@cheatcode.com`. |
| `PUSH_DRY_RUN` | `1` = the EXPO transport builds, chunks and logs the message, marks the delivery `sent`, and contacts nothing. This is how the native path is exercised without APNs/FCM credentials — **a green run under it does not mean native push works.** It deliberately does NOT apply to web push, which has a real endpoint and a real status code. |
| `PUSH_DRAIN_DEV_INTERVAL_S` | seconds between local drains. Off unless positive AND `NODE_ENV !== 'production'`; single-instance guarded on `globalThis` so hot reload cannot start three. |
| `EXPO_ACCESS_TOKEN` | optional. Only required if Expo push security is raised on the account. |
| `INTERNAL_SECRET` | already present — also authenticates `POST /api/v1/internal/push/drain`. Unset it and that route answers 404, as if it did not exist. |

`apps/mobile/.env` gains `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (the same public half —
it is public by design; it is in every subscription the browser creates).

**Hosted, the drain is a cron** — `apps/api/vercel.json`, alongside the paper
tick. THE SENDER ONLY RUNS WHILE SOMETHING TICKS: no cron and no dev interval
means rows pile up as `queued`, and `GET /api/v1/push/health` says so.

**Owner blockers, recorded not worked around:** there are no APNs (Apple
Developer account, $99/yr) or FCM (Firebase project) credentials, so there is no
native token to send to and Expo Go cannot receive push at all. And web push
needs a secure origin — desktop `localhost` qualifies, a phone does not until
the app is hosted.

### Round 6 — admin + CRM (nothing is required; both sources are OFF)

Round 6 adds NO required variable. The `app` source reads this database and
needs no credentials, and the two deferred connectors stay switched off until
these appear — which is what `GET /api/v1/admin/sync` reports, with the exact
reason, rather than hiding them.

```
STRIPE_CRM_READONLY_KEY=       # rk_… a RESTRICTED key. NOT sk_… — see below.
KAI_SMS_SUPABASE_URL=          # the K.AI project ryprohqthwflinadqotj
KAI_SMS_SUPABASE_SERVICE_ROLE_KEY=
```

| Variable | What it does |
|---|---|
| `STRIPE_CRM_READONLY_KEY` | the `stripe` CRM source's key. It is deliberately NOT `STRIPE_SECRET_KEY`: the CRM's key is a weaker key than the one billing uses, and sharing the name is how a full-access key ends up in a read-only place. **A `sk_live_` full-access key exists in `~/breakout-alert-system/.env` and must not be reused here.** Create a restricted key (customers, subscriptions, charges: **read**) at dashboard.stripe.com → Developers → API keys → restricted. A CRM never needs write access to money — and `plan()` checks: a key beginning `sk_` is reported as a misconfiguration rather than accepted. |
| `KAI_SMS_SUPABASE_URL` / `KAI_SMS_SUPABASE_SERVICE_ROLE_KEY` | the K.AI SMS project's own connection, never this app's. Setting both moves that source from "not authorised" to "credentials present, connector not written" — the body is still deferred (brief §5). When it is written it copies **counts and timestamps only**, never the text of `conversation_history`. |
| `INTERNAL_SECRET` | already present — also authenticates `POST /api/v1/internal/crm/sync`. Unset it and that route answers 404, as if it did not exist. |

**Hosted, the ingest is a cron** — `apps/api/vercel.json`, alongside the paper
tick and the push drain:

```json
{ "path": "/api/v1/internal/crm/sync", "schedule": "0 * * * *" }
```

Hourly is enough: the funnel state it derives changes on the scale of a person's
day, and a second run inside the same hour creates zero rows anyway.

**Owner blockers, recorded not worked around:** the 2,507-row K.AI import needs
hosting (the Supabase org invoice, above) AND the owner's decision to authorise
reading another project's database; the Stripe source needs the restricted key;
and `cheatcode-crm`'s live Stripe webhook still points at the old system, so
until it is repointed, two systems both believe they are the CRM.

## workers/kai-live/.env.local (never commit — LIVE-2)

The show worker reads THIS file first and then `apps/api/.env.local`, without
overriding anything already set. Only one variable has to live here; everything
else is deliberately shared with the API so there is one copy of the Supabase
and Anthropic keys on the machine rather than two that can drift apart.

```
OPENAI_API_KEY=…              # REQUIRED for Kai's voice. The owner's key is in
                              # ~/breakout-alert-system/.env. Without it the show
                              # still runs — as captions, with audio_url null and
                              # audio_state 'estimated' on every SayFrame.
```

Optional, all with defaults in `workers/kai-live/src/config.ts` (a copy-paste
template lives at `workers/kai-live/.env.example`):

| Variable | Default | What it does |
|---|---|---|
| `LIVE_API_BASE` | `http://localhost:3000` | where `apps/api` is |
| `SHOW_BUDGET_USD_PER_HOUR` | `3.00` | hard cap; breaching it drops to cached segments |
| `SHOW_PREP_DEPTH` | `2` | segments kept ready ahead of the one playing |
| `SHOW_MAX_SEGMENTS` | `0` | 0 = run until the rundown is empty |
| `LIVE_PACE` | `1` | play the timeline N× faster (wall clock only — `t_offset_ms` stays real) |
| `LIVE_TTS_MODEL` | `gpt-4o-mini-tts` | |
| `LIVE_TTS_VOICE_KAI` / `LIVE_TTS_VOICE_COHOST` | `ash` / `coral` | standing default |
| `LIVE_TTS_SPEED` | `1.0` | |
| `LIVE_TTS_USD_PER_1K_CHARS` | `0.015` | an ESTIMATE — see `docs/16_LIVE_SHOW_OPS.md` §5 |
| `LIVE_AUDIO_BUCKET` | `live-audio` | |
| `LIVE_STAGE_USER_EMAIL` | `stage@kai-live.local` | the account the show's annotations belong to |
| `LIVE_WINNER_HOLD_DAYS` | `3` | how long after an alert closes before it may be shown as a winner |
| `LIVE_LOG_JSON` | unset | `1` for machine-readable log lines |

`INTERNAL_SECRET` (already in `apps/api/.env.local`) is what authenticates the
worker to `/api/v1/live/internal/**`. Unset it and those routes answer 404, as
if they did not exist.

## apps/mobile/.env (never commit)
EXPO_PUBLIC_SUPABASE_URL=      # same as above; on a phone use the Mac's LAN IP instead of 127.0.0.1
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_BASE=http://localhost:3000   # phone: http://<LAN-IP>:3000

## Hosted Supabase
Project creation on 2026-08-26 failed: "overdue invoices in Kway Clawd Org". Once settled: create project `cheatcode-ai` (us-west-1, $10/mo), `supabase link`, `supabase db push`, update both env files, redeploy api.

## Local (current)

Values from `supabase status` for the local stack in this repo (started with
`supabase start`; reset with `supabase db reset`). These are the Supabase demo
keys that ship with every CLI install — **not secrets**, and only valid against
127.0.0.1. A copy-paste-ready version lives at `supabase/.env.local.example`.

| Key | Value |
|---|---|
| Project URL / `SUPABASE_URL` | `http://127.0.0.1:54321` |
| REST | `http://127.0.0.1:54321/rest/v1` |
| DB (`psql`) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (auth emails) | `http://127.0.0.1:54324` |
| Studio | disabled locally — see `docs/SCHEMA-NOTES.md` §1.19 |

```
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

Newer-format equivalents (the same stack accepts both):
`SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH` ·
`SUPABASE_SECRET_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz`

On a physical phone, replace `127.0.0.1` with the Mac's LAN IP in
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_API_BASE`.

Verify the stack with `node scripts/rls-test.mjs` (expects `RLS TEST PASSED`).
