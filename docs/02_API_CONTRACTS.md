# Cheat Code AI — API & Event Contracts (v2, canonical)

**Single current contract. Supersedes all prior drafts.** REST under `/api/v1`, Supabase JWT, zod-validated bodies from `packages/shared`. Errors: `{error:{code, message_plain, detail?}}`. Every price-bearing response embeds `quote: {symbol|occ_symbol, price, source_ts, received_ts, freshness}`.

Client reads use Supabase direct under RLS where the matrix in 01 §13 allows select; **all community posting and all financial/state mutations are api-app commands.**

## 1. Onboarding, profile, settings

| Endpoint | Purpose |
|---|---|
| `POST /onboarding/complete` | goal, starting amount ($1k–$100k paper), risk answers, involvement (hands_on/guided), experience → profile config, risk_policy, paper account |
| `PUT /risk-policy` | validated change, journaled |
| `PUT /mode` | switch primary mode; response includes `carryover` (open positions, pending confirmations remain visible) |
| `GET /memory` / `DELETE /memory/:id` / `DELETE /memory` / `PUT /memory/settings {enabled}` | Kai personalization memory controls; deletes cascade to embeddings/derived summaries |

## 2. Market data & Trade surface

| Endpoint | Purpose |
|---|---|
| `GET /market/snapshot?symbols=` · `GET /market/candles?symbol=&tf=&from=&to=` · `GET /market/session` | quotes with freshness · cached candles · session status |
| `GET /trade/landing?mode=` | **Brokerage-first hierarchy:** `{account_strip, search_ctx, watchlists, markets:{movers,sectors,calendar}, positions_snapshot, pending_orders, continue:[…], kai_opportunities:[…], catalysts}` — familiar brokerage regions lead; Continue and Kai opportunities are integrated, clearly-labeled sections, not the page |
| `GET /trade/search?q=` | instruments + natural-language intents (unresolved → offered as Kai question) |
| `GET /symbols/:symbol?mode=` | quote header, chart config, three mode lenses, Kai interpretation (+last_updated), your-context across all accounts, evidence refs, community block, actions |
| `GET /symbols/:symbol/options/chain?expiry=` · `GET /options/:occ/quote` | v1.1; cached, freshness-stamped |

Realtime `market:{symbol}`: `{type:'quote'|'session', …}` throttled ≤1/s.

## 3. Setups

| Endpoint | Purpose |
|---|---|
| `GET /setups?mode=&state=` | ranked (score desc, state urgency); caps 5 day / 3 swing; each card: grade_display · state · risk · fit · one next action |
| `GET /setups/:id` | full object incl. Live/Plan/Learn content and four explanation levels |
| `POST /setups/:id/follow` | adds to Watching + drafts default ready-alert |
| `GET /theses?symbol=&mode=` | active + superseded with supersession payloads |

Realtime `setup:{id}` (rows in setup_events, per-setup seq, replayable): `state_change` (with plain narration + confirmations + quote), `grade_change`, `annotation`, `thesis_update`, `invalidated`, `thesis_superseded`.

## 4. Plans & orders

| Endpoint | Purpose |
|---|---|
| `POST /plans` | from `{setup_id, overrides?}` or manual; server computes size suggestion; `exit_style` defaulted from involvement, overridable |
| `POST /plans/:id/actions` | `activate · cancel · adjust_stop · adjust_target · set_exit_style` — state-machine validated |
| `POST /orders/preview` | `{account_id, symbol|occ_symbol, side: position_effect, type, qty, limit_price?, stop_price?, duration, plan_id?}` — plan optional (manual path). Returns est fill, cost, resulting exposure, risk checks, `advisories[]` (dismissible: exposure, earnings proximity, missing stop, R/R rule with hard-stop copy), `blockers[]` (freshness, capability, permission, entitlement — not dismissible), `preview_id`, `expires_at`, `tolerance_bps`, disclosures. Errors: `FRESHNESS_STALE`, `CAPABILITY_UNSUPPORTED` (with alternatives), `OPTIONS_LEVEL_INSUFFICIENT`, `ENTITLEMENT_REQUIRED`, `MARKET_CLOSED`, `RISK_LIMIT_*` |
| `POST /orders/submit` | `{preview_id, idempotency_key}` → `PREVIEW_INVALID`/`PREVIEW_EXPIRED` force re-preview; duplicate key returns original (`deduplicated:true`). Bracket plans submit as one authorized unit (`bracket_group`) |
| `POST /orders/:id/cancel` · `POST /positions/:id/close` · `POST /positions/:id/debrief` | pre-fill cancel · convenience close preview · Kai debrief |

Order status flow: `draft → previewed → submitted → accepted → (partially_filled)* → filled | cancelled | rejected`. Accepted ≠ filled, everywhere, both drivers.

## 5. Broker (SnapTrade)

| Endpoint | Purpose |
|---|---|
| `POST /broker/connect` | SnapTrade portal URL; `connection_type` requested per broker support (Robinhood → read; Webull → trade offered in v1.1) |
| `GET /broker/status` | per-connection: status, `access` (read/trade), discovered capabilities, `data_lag`, sync age |
| `POST /broker/sync` · `DELETE /broker/connections/:id` | force sync · disconnect (plans survive; mirrors freeze) |
| `POST /webhooks/snaptrade` | order acks/fills/rejects (v1.1), auth expiry, account updates → domain events + user_events |

**Contract rule:** the client renders broker order actions only when `access='trade'` **and** capabilities cover the instrument + order type. Read-only connections power portfolio context, position monitoring (labeled with `data_lag`), and Kai analysis — never an order ticket. Externally-placed trades on lagged connections surface as delayed portfolio updates, not realtime position events.

## 6. Alerts

| Endpoint | Purpose |
|---|---|
| `POST /alerts/draft` | natural language (+refs) → Kai-parsed **alert_preview** object: structured condition, data dependencies, frequency, expiry — shown before activation |
| `POST /alerts` | activate draft or structured condition; tier limits enforced |
| `POST /alerts/:id/actions` | pause / resume / cancel / edit(→ new draft) |

Condition atoms: `price_cross, price_range, pct_change, rvol_min, setup_state, time_at, volume_above, catalyst_within`; composition `all/any`. Trigger → user_events `alert_trigger` (+push) with eval-trace snapshot, `late` flag when back-evaluated after a feed gap, and deep link to symbol/chart/changed evidence.

## 7. Kai

| Endpoint | Purpose |
|---|---|
| `POST /kai/conversations` | context: `{mode, pinned:{symbols?, position_ids?, setup_ids?}}` |
| `POST /kai/conversations/:id/messages` | SSE stream: text deltas + object frames + action_suggestions; long research → `{async_job_id}`, completion via user_events `kai_result` |
| `POST /kai/actions` | execute a Kai-proposed action after user tap — routes to alert draft / plan create / comparison / watchlist. **Kai has no execution path; financial actions always land in the preview/confirm flow above** |
| `GET /learn/explain?context_key=&level=` | cached explanation modal (generated once by kai worker) |

### Kai structured objects

Envelope: `{id, type, created_at, model, prompt_version, disclosures[], refs, payload}`. Types (matches `kai_object_type` enum exactly): **briefing, graded_setup, comparison, research_report, verification_card, room_summary, community_intel, alert_preview, chart_response, position_update, action_preview, debrief, thesis_change.**

Key payloads: `graded_setup` mirrors the setup + `{explain:{beginner,intermediate,advanced,family}}` · `verification_card {claim, result, sources, timestamp, uncertainty, effect_on_setup}` · `community_intel {sample_size, sentiment, common_levels, common_risks, window, confidence_limits}` (always labeled + separated from Kai's own conclusion) · `thesis_change {previous_view, new_evidence, why_failed, entry_passed, new_state, plain_summary}` · `chart_response {symbol, timeframe, annotations: ChartAnnotation[], rationale_plain, validity}` where ChartAnnotation = `{kind: level|zone|arrow|label|measure, price?|range?, ts_range?, text?, semantic: entry|stop|target|invalidation|note}` — semantics only, the client maps to Volt & Violet tokens; the backend never sends colors.

All financial objects pass the contradiction validator pre-publication; persistent failure publishes nothing (`VALIDATION_INCOHERENT` is internal-only).

### Chart commands v2 (LIVE-1)

`ChartCommandFrame` is unchanged: `{type:'chart_command', command, payload, annotations[], narration, provenance}`. `ChartCommandName` is **appended to, never reordered** — round 4's eleven keep their meaning and five camera commands join them:

| Command | Payload | What has to be real |
|---|---|---|
| `zoom_range` | `{from, to, padding?, duration_ms?}` — ISO timestamps | **Both timestamps.** They come from a setup window, an alert's session or `priorSession`; a range over invented times frames a stretch of chart that means nothing, so the command is dropped instead |
| `scroll_bars` | `{bars, duration_ms?}` — negative goes back | Nothing. Bars are a view offset, not a price |
| `scroll_to_now` | `{duration_ms?}` | Nothing |
| `flash_annotation` | `{annotation_id, pulses?}` | **The annotation must already exist** on that symbol for that user. Two pulses of opacity; the line never moves, because a price line that moves is a lie about the price |
| `pointer_hint` | `{price?, ts?, rail?, linger?, duration_ms?}` | The level if one is named (resolved the same way `mark_level` resolves it). Changes no state at all — it points |

Why they exist: round 4's vocabulary could say *mark this* and *switch to that* but had no way to say *look over here*, so Kai could draw a level 400 bars off screen and narrate it as if the user could see it. Describing a level nobody can see is the same class of mistake as inventing one.

`AnnotationKind` is likewise appended to: **`trendline`, `box`, `vertical`** join the eight semantic kinds. The first eight say what a level *means*; these three are *shapes* with no single meaning (a trendline between two anchors, a time × price region for an FVG or order block, a moment on the time axis), and all three map to the neutral `level` semantic — the API still never sends a colour. DB constraint widened in `supabase/migrations/0022_live1_annotation_kinds.sql`.

**Client↔chart bridge.** `packages/shared/chart-bridge.ts` (zod) is the protocol between the app and the chart page (`apps/mobile/chart-web/`), not a server contract — no endpoint speaks it. Host→chart: `setData` · `updateLast` · `setTimeframe` · `camera.*` · `annotations.set|add|remove|flash|hidden` · `pointer.*` · `setTheme` · `setReducedMotion`. Chart→host: `ready` (carries a **measured** `firstPaintMs`) · `done{id, reason}` · `viewport` · `timeframe` · `annotationTap` · `crosshair` · `fps` · `error`. Every host message carries an `id` and every message that takes time answers `done{id, reason}` where reason is `done` | `interrupted` (a finger landed on the glass) | `superseded` — which is what lets a choreography be a real sequence and what lets the user's touch abandon the rest of it.

## 7b. Kai Live (LIVE-2)

Contract: `packages/shared/live.ts`. Storage: `supabase/migrations/0023_live_shows.sql`.

A show is an ordered list of frames. `LiveFrame = SayFrame | ChartFrame | PresentFrame | OverlayFrame`, every one carrying `show_id`, `segment_id`, `seq` and `t_offset_ms` (milliseconds from the START OF ITS SEGMENT, never from the start of the show). `ChartFrame` wraps LIVE-1's command vocabulary — `ChartCommandName` and `AnnotationRow` are IMPORTED from `api.ts`, never redefined — and adds `annotation_ids[]` and `provenance`, which is required and non-empty on every one.

**Idempotent by `(show_id, seq)`, gap-free, replayable from zero.** Those three properties are the whole contract and each one buys something specific: a broadcast frame and a fetched frame are the same frame and the second is a no-op; a frame that would open a gap is HELD rather than applied, because a chart missing a level is a wrong chart rather than a late one; and applying 0..N lands on one state whether it happened at 4pm or is being watched at midnight. `mergeFrames()` in the shared module is that rule, imported by both ends so they cannot drift.

| Route | Who | What |
|---|---|---|
| `GET /live/current?since=&mode=` | any signed-in user (review) · premium (market) | the show on air, its segments, and every frame after `since`. Omitting `since` returns the whole timeline — late join and replay are the same request, deliberately: a catch-up path that differs from the replay path is a second implementation of the same reconciliation |
| `GET /live/shows/:id/frames?since=&limit=&segment_id=` | same | replay, paged |
| `POST /live/requests` | **premium only** | ask Kai to pull up a symbol. Rate limited to 3/hour — the show gets through ~10 names an hour, so one enthusiast with a loop could own the rundown. The symbol is validated against `instruments` first |
| `GET /live/health` | same as the show | show state, buffer depth, measured spend, last error, heartbeat |

`GET /live/current` also returns `channel` — the Supabase Realtime broadcast channel (`live:<show_id>`), one message per frame on event `frame`. **Broadcast is the fast path; the table is the truth.** Clients reconcile by `seq` and treat the poll not as a fallback for a dropped broadcast but as the correction for one.

**The paywall is asked twice, and neither ask is redundant.** RLS (0023) makes a `market` show, its segments and its frames invisible to a free user's own JWT — the paywall as a property of the data, which holds even if a route is ever wrong. The API additionally checks `loadEntitlements()` and answers `ENTITLEMENT_REQUIRED` with the tier, the price and the upgrade link (§11), because RLS can only return an empty set and an empty set reads to a user as "the show is broken".

**Worker-only routes** (`/live/internal/**`, `x-internal-secret` matched against `INTERNAL_SECRET`, 404 — not 401 — when the secret is unset, exactly like the paper tick): `GET /ping`, `GET /rundown` (everything the show could talk about, ranked, with levels/evidence/plain English already derived by `lib/setups.ts`), `GET /market` (candles + technicals + company for several timeframes in one round trip), `POST /annotations` (persist Kai's marks — the choke point the anti-invention rule runs through), `POST /requests/settle`. They exist so the worker never carries a second copy of the Polygon logic, the swing detector or the setup maths: the show and the app must never quote different prices for the same level.

## 8. Invest (v1.1)

`POST /invest/goals` · `GET /invest/goals/:id/status` (progress, drift, projected range + assumptions + disclosures) · `POST /invest/recommendations/:id/preview|confirm|dismiss` (confirm applies via the paper order pipeline) · v1.2 adds `GET /invest/guidance?goal_id=` (add_on_pullback / trim_at_high objects).

## 9. Community

All posting via api-app (validation, rate limits, spam precheck, seq assignment, audit):

| Endpoint | Purpose |
|---|---|
| `POST /rooms/:id/messages` | kinds: text, chart, voice_note (Storage signed upload), position_update. Structured ideas prompt position disclosure |
| `POST /rooms/:id/kai` | `{command: summarize|mark_levels|verify|to_alert|compare|explain, args, message_id?}` — async; `kai_status` events; result posts as kai_object message |
| `POST /messages/:id/structured-assist` | Kai improves a draft idea; **publishes only on explicit user approval post** |
| `POST /messages/:id/report` · `POST /moderation/actions` | reports · staff actions (journaled; market-claim originals retained in audit) |

Realtime `room:{id}`: message events (per-room seq, replayable), presence, pinned_update, kai_status. No polls, DMs, or live-session endpoints in v1 — Phase 2 annex.

## 10. Replay

- `GET /events/replay?scope=user&after_seq=&limit=` → ordered `user_events` (the unified user stream: order, fill, alert, plan, position, kai_result, thesis, recommendation events).
- `GET /events/replay?scope=setup|room&id=&after_seq=` → per-entity event tables.
Client: on reconnect, replay each subscription before resuming live; de-dupe on `(scope,id?,seq)`.

## 11. Billing & entitlements

`POST /billing/checkout` · `POST /billing/portal` · `POST /webhooks/stripe`. Entitlement middleware injects the tier flag map into every request; `ENTITLEMENT_REQUIRED` returns `{tier:'premium', price, upgrade_link}`. Free: paper, 5 active alerts, community read + beginner-room posting, Kai daily budget. Premium $99/mo: full alerts, full posting, broker connect, options (v1.1), full LMS (v1.2), priority Kai budget. All gate placement is `entitlement_flags` config.

## 12. Error codes (canonical set)

`FRESHNESS_STALE · PREVIEW_INVALID · PREVIEW_EXPIRED · RISK_LIMIT_DAILY_LOSS · RISK_LIMIT_POSITION_SIZE · RISK_LIMIT_CONCENTRATION · PDT_WARNING(advisory) · MARKET_CLOSED · IDEMPOTENT_REPLAY · STATE_CONFLICT · CAPABILITY_UNSUPPORTED · BROKER_DISCONNECTED · BROKER_AUTH_EXPIRED · BROKER_PERMISSION_MISSING · OPTIONS_LEVEL_INSUFFICIENT · ENTITLEMENT_REQUIRED · ROOM_RESTRICTED · RATE_LIMITED · CONSENT_REQUIRED · EXTENDED_HOURS_UNSUPPORTED`

Every error carries beginner-readable `message_plain`.

## 13. Analytics events (PostHog; server-emitted where authoritative)

`search_performed · research_opened · alert_created · plan_created · order_previewed · order_submitted(driver, instrument_kind, side) · order_filled · thesis_change_opened · debrief_completed · kai_question_asked(context) · community_to_research · broker_connected(access) · paper_reset · subscription_started`
