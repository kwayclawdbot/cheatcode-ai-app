# Environment

## apps/api/.env.local (never commit)
ANTHROPIC_API_KEY=…            # present (copied from owner env, verified 200 OK 2026-08-26)
KAI_MODEL=claude-sonnet-5
SUPABASE_URL=                  # local: http://127.0.0.1:54321 (from `supabase status`); hosted: pending (org invoice overdue)
SUPABASE_SERVICE_ROLE_KEY=     # from `supabase status`
SUPABASE_ANON_KEY=

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
