# Environment

## apps/api/.env.local (never commit)
ANTHROPIC_API_KEY=…            # present (copied from owner env, verified 200 OK 2026-08-26)
KAI_MODEL=claude-sonnet-5
SUPABASE_URL=                  # local: http://127.0.0.1:54321 (from `supabase status`); hosted: pending (org invoice overdue)
SUPABASE_SERVICE_ROLE_KEY=     # from `supabase status`
SUPABASE_ANON_KEY=

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
