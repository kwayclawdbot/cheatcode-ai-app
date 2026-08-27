# apps/api — Cheat Code AI api-app (Unit 1)

Next.js 16 App Router. The authenticated command surface for the v1 slice:
onboarding, mode, Home, setups, the Kai conversation stream, and alert drafts.

Canonical specs: `docs/02_API_CONTRACTS.md` (shapes + error envelope),
`docs/03_SERVICE_SPECS.md` (Unit 1 + Unit 3), `docs/01_DATA_MODEL.md` (schema),
`docs/07_UX_SPEC_v3_extracted.md` §7/§10 (copy pattern + acceptance),
`docs/BUILD-BRIEF-v1-slice.md` (binding scope).

**The backend never sends colours.** Every visual state is a semantic enum —
`state`, `freshness`, `grade_band`, `emphasis`, `semantic` — and the client maps
it to the Volt & Violet palette (`docs/14_PALETTE_LOCK_VOLT_VIOLET.md`).

---

## Endpoints

All under `/api/v1`. Every authenticated route expects
`Authorization: Bearer <supabase access token>`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | `{ok, supabase, anthropic}`. Unauthenticated. `supabase` is a real round-trip, not a config check. |
| `POST` | `/onboarding/complete` | `{goal_mode, starting_balance, risk_answer, involvement, experience, practice_choice?}` → profile + risk policy + paper account. **Idempotent**: a second call after completion changes nothing and returns `idempotent_replay:true`. Journals to `risk_policy_events`. |
| `PUT` | `/mode` | `{mode}` → `{mode, carryover:{open_positions, pending_confirmations}}`. Switching never hides open risk (07 §10). |
| `GET` | `/home?mode=` | `{mode, market, briefing, lead_setup, watching, daily_risk, degraded, degraded_reason, invest_mode_notice}`. |
| `GET` | `/setups?mode=&state=` | Ranked score-desc, capped 5 day / 3 swing. Each card: `grade_display · state · risk · fit · next_action`. |
| `POST` | `/kai/conversations` | `{mode, pinned?}` → `{id, mode, created_at}` (201). |
| `POST` | `/kai/conversations/:id/messages` | `{content}` → **SSE**. Persists both turns. |
| `POST` | `/alerts/draft` | `{natural_language, refs}` → `alert_preview` object + `alerts` row status `draft` (201). |
| `GET` | `/alerts` | `{needs_attention, watching, resolved, empty_copy}`. Drafts sit in Watching as "draft — Activate". |

### Error envelope

Every non-2xx is `{error:{code, message_plain, detail?}}` with an
`x-request-id` header. Codes are the canonical 02 §12 set plus
`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL`,
`KAI_UNAVAILABLE`. `message_plain` is always beginner-readable — no jargon, no
stack traces, no identifiers, no secrets.

```json
{"error":{"code":"VALIDATION_FAILED","message_plain":"Paper accounts start between $1,000 and $100,000.","detail":[{"path":"starting_balance","message":"…"}]}}
```

### Kai SSE frames

`event:` is one of `text_delta` · `object` · `done` · `error`; `data:` is the
matching frame from `packages/shared/api.ts`.

```
event: text_delta
data: {"type":"text_delta","text":"**Meaning:** Buyers have stepped in and defended the $480 level…"}

event: object
data: {"type":"object","object":{"id":"…","type":"graded_setup","created_at":"…","model":"claude-sonnet-5","prompt_version":"kai-v1-slice-2026-08-26","disclosures":["paper_only","education_not_advice"],"refs":{…},"payload":{…}}}

event: done
data: {"type":"done","conversation_id":"…","message_id":"…","seq":2,"degraded":false}
```

Objects are produced by asking the model for a fenced ```` ```kai_object ````
block. The fence never reaches the client as text: `FenceSplitter`
(`src/lib/kai/stream.ts`) holds back partial markers, splits the body out, and
text before and after it streams as deltas. Each body is zod-validated, run
through the contradiction validator, persisted to `kai_objects` with `model` +
`prompt_version`, and only then emitted as an envelope.

---

## Layout

```
src/lib/
  auth.ts            Bearer → supabase.auth.getUser(token); 401 envelope
  db.ts              service-role client (RLS-bypassing → every query user-scoped)
  errors.ts          ApiError + canonical codes + envelope
  events.ts          emitUserEvent() → user_events outbox
  http.ts            authed() wrapper, zod body/query parsing, request-id logging
  market.ts          America/New_York session status, freshness passthrough
  env.ts / log.ts    server-only env access, structured logs
  kai/
    system-prompt.ts  copy pattern, four questions, execution boundary, object protocol, untrusted-content policy
    context.ts        profile + risk policy + mode + ranked setups + pinned + last 20 turns
    stream.ts         Anthropic streaming → SSE, FenceSplitter, object gate
    briefing.ts       one briefing per user per market day, cached in kai_objects
    contradiction.ts  orientation / stop / narrative-vs-structured / coherence
    objects.ts        envelope, persist, cache lookup, deterministic graded_setup from a row
src/app/api/v1/…      the routes above
scripts/smoke.sh      end-to-end smoke against the local stack
```

`packages/shared/api.ts` holds the zod schemas and TS types for every request
and response body, the Kai SSE frames, and the `KaiObject` envelope. It is
plain `.ts` with no build step; `apps/api` reaches it via the `@shared/*`
tsconfig path, and `next.config.ts` sets `turbopack.root` to the repo root so
Turbopack can resolve outside the app directory. There are no npm workspaces —
`packages/shared/package.json` exists only so `zod` resolves for both apps.

---

## Environment

`apps/api/.env.local` (git-ignored, never committed):

```
ANTHROPIC_API_KEY=…
KAI_MODEL=claude-sonnet-5
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
```

Local Supabase values come from `supabase status`; a copy-paste version is in
`supabase/.env.local.example` and `docs/ENV.md`.

## Running

```bash
cd apps/api
npm install
npm run dev            # http://localhost:3000
npm run build          # must be clean

./scripts/smoke.sh     # creates a throwaway user, exercises every endpoint
API_BASE=http://localhost:3000 ./scripts/smoke.sh
```

`scripts/smoke.sh` creates a test user through the Supabase admin API, signs in
with the anon key, asserts the 401 and 400 envelopes, then curls every endpoint
including a real SSE call whose frames it prints verbatim. It exits non-zero if
anything fails.

---

## Known gaps (Phase 0)

1. **Outbox transaction gap.** `01 §3` requires the domain write and its
   `user_events` row in *one* transaction. PostgREST offers no multi-statement
   transaction, so `emitUserEvent()` is a second round-trip after the domain
   write, is best-effort, and is logged rather than raised — a failed outbox
   write never fails the user's request. Closing this needs a SQL function
   (`append_user_event(...)`, or one RPC per command) that does both inserts
   inside a single `plpgsql` body; the API lane cannot write migrations, so it
   is handed to the schema lane. `user_events.seq` itself is already correct —
   the `user_events_assign_seq` BEFORE-INSERT trigger takes the row lock on
   `user_event_counters` (supabase/migrations/0013), so we omit `seq` on insert.
2. **No market-holidays table.** `src/lib/market.ts` computes the session from
   the America/New_York clock and weekends only. US market holidays are not
   known, and every market block says so via `holidays_known:false`. The
   session engine in the market-intelligence worker (03 Unit 2) becomes the
   authority when it exists.
3. **Microphone / voice is not implemented.** The composer mic in the artboards
   is visual only in this slice; there is no speech endpoint.
4. **`conversation_messages.seq` is read-then-write.** Two messages posted to
   the same conversation in the same instant could collide on the
   `unique (conversation_id, seq)` constraint. One conversation is driven by one
   user on one device, so this is accepted for the slice; a counter table or
   RPC (same shape as `user_event_counters`) removes it.
5. **Kai has no tools.** No market snapshot, no candles, no research fetch, no
   memory retrieval. Kai talks about the rows in `setups` for the user's mode
   and nothing else, and is instructed to say so when asked about anything
   outside that. `kai_user_memory` / `market_memory` retrieval is a later phase.
6. **`GET /home` generates the briefing inline.** The first Home load of a
   market day makes a blocking Anthropic call (a few seconds); subsequent loads
   hit the `kai_objects` cache keyed on `refs {user_id, market_date}`. Moving
   this to the proactive kai worker (03 Unit 3) is the Phase-1 fix.
7. **`lead_setup` is derived, not generated.** It mirrors the top-ranked
   `setups` row deterministically (`model:"deterministic/v1"`) rather than
   costing a model call per Home load. `explain` is used from the row when the
   scanner supplies it, otherwise composed from the row's own text — nothing is
   invented either way.
8. **No entitlement middleware, no Stripe, no rate limiting.** Out of scope for
   this slice (02 §11); every user is effectively free-tier and unmetered.
