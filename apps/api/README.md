# apps/api — Cheat Code AI api-app (Unit 1)

Next.js 16 App Router. The authenticated command surface. Round 1 shipped
onboarding, mode, Home, setups, the Kai conversation stream and alert drafts;
round 2 adds setup detail, the alerts lifecycle, real market data, the Trade and
symbol surfaces, watchlists, debriefs, Community with `@Kai`, and Account.

Canonical specs: `docs/02_API_CONTRACTS.md` (shapes + error envelope),
`docs/03_SERVICE_SPECS.md` (Unit 1 + Unit 3), `docs/01_DATA_MODEL.md` (schema),
`docs/07_UX_SPEC_v3_extracted.md` §7/§10 (copy pattern + acceptance),
`docs/BUILD-BRIEF-v1-slice.md` and `docs/BUILD-BRIEF-round-2.md` (binding scope).

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

### Round 2

**Market data** — real, delayed, labeled. See "Market data" below.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/market/snapshot?symbols=` | `{quotes[], market, degraded}`. One grouped Polygon call covers every symbol, so cost does not grow with the list. |
| `GET` | `/market/candles?symbol=&tf=1d\|5m&from=&to=` | Cache-first out of the `candles` table; Polygon only refills what is missing. |
| `GET` | `/market/session` | Session from the ET clock + weekends. `holidays_known:false`. |

**Setups**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/setups/:id?mode=` | The whole object: `live {quote, state, stepper, narration_plain, confirmations[]}`, `plan {entry, invalidation, stop, targets, size_suggestion, scenarios[3], risk_reward, actions[]}`, `learn {why_plain, evidence[], similar_example, quiz}`, `explain{beginner…family}`, `fit{ok, reasons[]}`, `next_action`. |
| `POST` | `/setups/:id/follow` | Adds the symbol to the watchlist **and** drafts the default ready-alert. Idempotent: a second call returns the first alert. |
| `GET` | `/theses?symbol=&mode=` | `{active[], superseded[]}` with the supersession payload. |

**Alerts**

| Method | Path | Notes |
|---|---|---|
| `POST` | `/alerts` | `{draft_id}` → active. Tier limit from `entitlement_flags`; over it returns `ENTITLEMENT_REQUIRED` (402) with `{tier, price, upgrade_link}`. |
| `GET` | `/alerts/:id` | Plain condition, structured logic, data dependency, status history from `user_events`, originating refs resolved to labels, one primary action. |
| `POST` | `/alerts/:id/actions` | `pause \| resume \| cancel \| edit`. `edit` cancels the old alert and returns a NEW draft — a live watch is never silently rewritten. |

Every active alert carries `monitoring:'armed_no_feed'` and its copy. There is no
alerts engine in this round; the app says "armed · live evaluation starts when
market data goes live" rather than implying tick-by-tick checking.

**Trade & symbols**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/trade/landing?mode=` | 02 §2 shape. `account_strip` is paper only; `markets.movers` are computed from real closes across the mode's scan universe; `kai_opportunities` are the ranked setups; `notices[]` names what is not live yet instead of rendering empty boxes. |
| `GET` | `/trade/search?q=` | Instruments by symbol/name. No match → `intent:{kind:'kai_question', text}`. |
| `GET` | `/symbols/:symbol?mode=` | Quote header, chart config with the setup's levels as **semantic** annotations, one lens per mode, Kai interpretation, your context, news evidence with `published_utc`, community placeholder, actions. |

**Watchlist** — both paths exist on purpose (00 §4 allows client-direct writes under RLS).

| Method | Path | Notes |
|---|---|---|
| `GET` | `/watchlist` | Items with live quotes and any attached setup. |
| `POST` | `/watchlist` | `{symbol, note?}`. Unknown symbol → 404. |
| `DELETE` | `/watchlist/:symbol` | Returns the list back. |

**Positions & debriefs**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/positions?status=closed\|open\|all` | Simulated positions carry `simulated:true`. |
| `POST` | `/positions/:id/debrief` | Kai writes it; persisted through `record_debrief`. Numbers are computed, only the judgement is generated. Regenerates in place on a second call. |
| `GET` | `/debriefs` · `/debriefs/:id` | List (plus closed positions `awaiting` one) and detail with the stored `kai_object`. |
| `POST` | `/debriefs/:id/save-lesson` | Writes `kai_user_memory` kind `pattern`. Refused (as a value, not an error) when `memory_enabled` is off. |
| `POST` | `/dev/simulate-closed-trade` | **`DEV_TOOLS=1` only** — 404 otherwise. Plan → filled orders → fills → closed position, all `origin.simulated=true`. |

**Community**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/rooms?mode=` | **The three core rooms** — `#day-trade`, `#swing`, `#investing`, in that order — with member/message counts and unread. Every member sees all three: `?mode=` is accepted for compatibility and echoed back as `mode`, but it does **not** filter. `setup_rooms` is an empty array this release (`INCLUDE_SETUP_ROOMS = false` in the route; the shaping is intact and a deep link into a setup room still works, it is just not listed). Not in the brief's list — added because counts are aggregates a client cannot compute under RLS. `live_notice` says live sessions are a later release. |
| `POST` | `/rooms/:id/join` | Core rooms only, via `join_core_room`. |
| `GET` | `/rooms/:id/messages?after_seq=&limit=` | Through `messages_public` (deleted rows keep their place, body nulled). Membership enforced. Advances `last_read_seq`. `catch_up.count` never counts the caller's own posts — you did not miss your own writing. Kai's posts do count. |
| `POST` | `/rooms/:id/messages` | Pipeline in order: zod → membership → moderation mute/ban → posting restriction → slow mode → rate limit 10/min → spam precheck → **disclosure required when `structured_idea` is present** → `post_room_message` (assigns `seq`). |
| `POST` | `/rooms/:id/kai` | `summarize \| verify \| to_alert \| compare \| explain \| mark_levels`. **Synchronous** this round. Returns the object and posts it into the room. `mark_levels` returns a `chart_response` built without the model — see note 19. |
| `POST` | `/rooms/:id/read` | `{seq}` → advances `room_members.last_read_seq`. Forward-only and clamped to the room's last seq, so a stale or wild client cannot rewind the mark or read past the end. Returns the recomputed `unread`. |
| `POST` | `/messages/:id/structured-assist` | An improved draft of a POSTED message. `published:false` is a literal — nothing is posted. |
| `POST` | `/rooms/:id/structured-assist` | `{structured_idea, body?}` → the same review on a draft that does not exist yet, which is the order 08 §7 asks for. Nothing is written at all. Adds `improved_draft` / `feedback_plain` (aliases of `improved` / `plain`) and `gaps[]` — the 08 §7 fields still empty. |
| `POST` | `/messages/:id/report` | Files a report; the message is not removed. |
| `POST` | `/rooms/:id/mute` · `/unmute` | The member's OWN notification mute (`muted_until`). A moderator mute lives in `moderation_muted_until` and only that one blocks posting. |
| `GET` | `/contributors/:user_id` | Role labels, contribution counts, disclosures on recent posts **in rooms the caller is also in**. `rankings` is a null literal — 08 §8 forbids them. |

**Account**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/me` | Profile, risk policy, paper account (+ `can_reset`), subscription tier, entitlement flags, memory switch, prefs incl. accessibility, broker state, badge counts. |
| `PUT` | `/settings` | `explanation_level`, `quiet_hours`, `notifications.per_mode`, `accessibility{reduced_motion, text_scale}`. Cannot touch risk policy. |
| `GET`/`DELETE` | `/memory` · `DELETE /memory/:id` · `PUT /memory/settings` | List, hard-delete one, hard-delete all, master switch. |
| `POST` | `/paper/reset` | Once per **calendar** month, via `reset_paper_account`. Closes and deletes nothing. |
| `GET` | `/notifications?group=` | Grouped `action_required \| changes \| fyi`, each with a deep-link route. |
| `POST` | `/notifications/:id/read` | Stamps `delivery.read_at`. |
| `POST` | `/billing/checkout` | Stripe Checkout (subscription, `cheatcodeai://billing/...` deep links). No keys → `BILLING_NOT_CONFIGURED`, "Upgrades open soon." |
| `POST` | `/webhooks/stripe` | Unauthenticated by design — the **signature is** the authentication. Updates `subscriptions`. |

**Notification rows** are created on: alert activated · Kai replying to your
`@Kai` in a room · a debrief being ready · a paper reset. Every mutation also
calls `emitUserEvent`.

### Round 3 — V5 consolidation + paper execution

The canvas gained a **V5 (consolidation)** tier and `docs/09_UX_SIMPLIFICATION_AUDIT_extracted.md`
is the why behind all of it. Three payloads were RESTRUCTURED — as supersets, so
every round-2 key is still present and still means the same thing — and a paper
execution chain was added.

**Restructured**

| Method | Path | What changed |
|---|---|---|
| `GET` | `/home?mode=` | `+ opening_line, priority{kind,object,primary_action{label,route}}, also_watching[], paper_plain`. ONE priority object, ONE primary action, and the label is **state-driven** (`STATE_ACTION_LABEL`: Forming → *Watch this* · Ready → *Review setup* · Planned → *Buy* · Active → *Manage* · Invalidated → *Review what changed*). The briefing is still here but it now lives BELOW the priority. |
| `GET` | `/symbols/:symbol?mode=` | The asset workspace: `+ identity, chart_config, overview{setup_module, position, key_levels, what_changed[]}, kai{interpretation, scenarios, research_refs}, plan{existing_plan, suggested, order_state, daily_risk}, community{thread_summary, sentiment, verified_claims[]}, history[], actions[]`. **`lenses` is now always `[]`** — mode is global context, so per-asset mode lenses are gone (audit §10). A setup is a MODULE here, never a separate destination. |
| `GET` | `/alerts?filter=` | `+ attention[], monitoring[], history[], filters[], composer`. Five internal states collapse into three sections with type FILTERS. "Active Trades" is gone: a position's stop and target appear as `monitoring` rows pointing at `/position/:id`, so Alerts has no second position-management destination (audit §6). |
| `GET` | `/trade/landing?mode=` | `+ account{value,day_change,buying_power,kind:'paper'}, positions[], open_orders[], needs_action[], watchlist[], recent[], discovery{movers,catalysts}, daily_risk`. Re-ordered to the brokerage hierarchy in audit §7. |
| `POST` | `/kai/conversations` | `+ context:{kind:'symbol'\|'setup'\|'alert'\|'order'\|'position'\|'room', id?, symbol?}` → `{header_plain, context_plain, available_actions[]}`. The real object is loaded into the system prompt (order preview numbers, position state + P/L, alert condition, room posts, setup module), so the sheet answers **in place**. Kai still never executes: it emits `action_preview` frames (`watch` · `alert` · `plan`) that the client routes to the real endpoints. |

**Plans**

| Method | Path | Notes |
|---|---|---|
| `POST` | `/plans` | From `{setup_id}` or manual `{symbol, side, entry, stop, targets, size?}`. The server computes the size from the user's own risk policy and paper equity, so one number reaches the plan, the preview and the app. New plans are `draft` — written down, not armed. Orientation is validated in `create_plan` (long: stop < entry < targets), so a stop on the wrong side is refused with plain copy. |
| `GET` | `/plans/:id` | Levels, size, R/R, the two outcomes in dollars, today's risk budget, and one primary action. |
| `POST` | `/plans/:id/actions` | `activate \| cancel \| adjust_stop \| adjust_target \| set_exit_style`. `adjust_*` re-price the open position's stop/target **and** any resting bracket leg, in one transaction. |

**Orders**

| Method | Path | Notes |
|---|---|---|
| `POST` | `/orders/preview` | The whole review screen. Gates in order: instrument → freshness → entitlement → capability → risk → estimate → persist. Returns `estimate`, `risk` (with the mandatory "You can lose up to $X…" sentence), `checks[]`, `advisories[]` (dismissible), `blockers[]` (not), `can_submit`, `bracket`, `expires_at` (60s day / 10m swing-invest), `tolerance_bps` (25 / 50), `confirm_label: "Place paper order"`, `footer_plain`. The preview is PERSISTED on the order row (`status='previewed'`, `preview` jsonb). |
| `POST` | `/orders/submit` | `{preview_id, idempotency_key}`. `PREVIEW_EXPIRED` / `PREVIEW_INVALID` (price past tolerance) / the preview's own blocker code all send the user back to look again. A repeated key returns the ORIGINAL order with `deduplicated:true`. |
| `POST` | `/orders/:id/cancel` | Working orders only. Cancelling an entry cancels its bracket legs; cancelling a stop says out loud that the position now has no protection. |
| `GET` | `/orders?status=&symbol=` · `/orders/:id` | `open` means still working. A `previewed` row is an abandoned review, kept for the audit trail, never listed as an order. `/orders/:id` returns the legs, the fills and the whole event trail — that is what the client polls to move from accepted to filled. |

**Positions**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/positions?status=` | `+ open[]` (mark, freshness, stop/target, health), `daily_risk`, `totals`. Health is measured against the PLAN, not the P/L. |
| `GET` | `/positions/:id` | The position now, the plan it came from, an explicit `plan_vs_now`, its orders, the conditions being watched, and the decision chain. |
| `POST` | `/positions/:id/close` | Two-stage. Without `confirm:true` it answers `stage:'preview'` and nothing is sent. With `{confirm:true, idempotency_key}` it previews and submits in one round-trip, and the position's resting legs are cancelled **inside the same transaction**, before the closing fill. |

**Internal**

| Method | Path | Notes |
|---|---|---|
| `POST` | `/internal/paper/tick` | `x-internal-secret: $INTERNAL_SECRET`. No bearer token, no user. Without the env var set it answers **404**, exactly as if it did not exist. |


### Round 4 — actionable alerts + the chart-first Trade Portal

`docs/10_ALERTS_TRADE_PORTAL_SPEC_extracted.md` is binding for everything in
this section. The one-line version: **an alert is a complete trade object, not a
notification**, and **Trade opens as a working chart, not a dashboard**.

**What a watch is about.** `POST /alerts/draft` used to store the request's
`refs` verbatim, so the symbol and level Kai parses out of the sentence never
reached the row — and a watch with no symbol produced no card at all. The
identity now comes from the PARSED CONDITION (`lib/round4/alert-identity.ts`),
is written into `refs` AND onto 0021's `alerts.symbol` / `mode` / `direction` /
`lifecycle_state` on both draft and activate, and the feed reads the row rather
than any client hint. A symbol we do not follow still goes into `refs` but not
into the FK column. "Tell me when TSLA gets back to 400", with no refs at all,
now lands on the right ticker — the smoke asserts exactly that.

**Alerts as trade objects**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/alerts?tab=active\|watching\|history&filter=` | `+ tab, tabs[], cards[]`. `cards` is the spec §9 contract: identity, company summary, grade medallion, qualitative `score_components`, state, event, quote with freshness, trade plan, Kai interpretation, personal fit, community, ONE state-driven `primary_action`, expandable `detail`, and a `version`. The round-2 and round-3 keys (`needs_attention` · `watching` · `resolved` · `attention` · `monitoring` · `history` · `filters`) are all still there and still mean the same thing. |

Three tabs and nothing else (spec §1). Type, mode and delivery stay FILTERS.

A card is built from the strongest fact available — an open position beats a
working order beats a saved plan beats a verified trigger beats the setup's own
state — so the card cannot drift out of sync with the books. There is no second
copy of the state to go stale. `lib/round4/alert-cards.ts` is that table written
as code.

**No fractions.** The scanner's `score_components` are 0–100 numbers; the wire
carries a WORD from spec §4's vocabulary and a 0–5 segment count. `18/20` cannot
appear in the interface because it cannot appear in a payload. The smoke test
greps every card and every technicals block for `\d+/\d+` and fails on a match.

**Watching → Active is a verified event, not a timer.** Round 2 shipped alerts
as `armed_no_feed` because there was no evaluation loop. Round 4 evaluates armed
alerts inside the paper tick, against the same delayed marks, and records the
evaluation whether or not it fired (`lib/round4/alert-tick.ts`). Two condition
shapes exist in this database — `{compose, atoms[]}` from `/alerts/draft` and
`{all:[…]}` from a position exit — and both are normalised in one place.

**Versioning.** A grade change makes a NEW version and writes a `graded` row to
0021's append-only `alert_events`; the earlier snapshot is never rewritten
(spec §9). A state change writes a `state_change` row and does not bump the
version — the version is about the GRADE.

**Trade Portal**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/trade/portal/:symbol?alert=&setup=&ctx=&timeframe=` | `{identity, quote, chart_config{timeframe, focus_ts, range}, annotations[], contexts{selected, kai, alert, plan, community}, restored{…}, execution{state, primary_action}, drawers{account, positions, open_orders, watchlist, recent}}`. |

There is no generic alert-detail screen (spec §6). An alert card's primary action
comes straight here, and "restored" means it: the timeframe the setup lives on,
the trigger candle, the levels, the thesis, the grade snapshot, the monitoring
condition and its progress, the plan/order/position refs, and the room. Opening
from an alert also **draws the plan** — trigger, entry, stop, invalidation, first
target — as real persisted annotations, and returns spec §6's opening message
verbatim:

> This is the META alert you opened. I marked the trigger, entry area, stop and first target on the chart.

The smoke test asserts that sentence character for character.

The round-3 Trade landing content was not deleted; it moved into `drawers`,
which is what the top bar opens.

**Annotations**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/annotations?symbol=&timeframe=&include_hidden=` | Kai's marks and the user's in ONE list. |
| `POST` | `/annotations` | `{symbol, kind, price, text?, reason?, provenance}`. |
| `PATCH` | `/annotations/:id` | `{status: valid\|hidden\|deleted, text?, price?}`. |

Every annotation carries the six things spec §7 asks for, and `reason` is never
null on a Kai mark — a line the user cannot argue with is the thing this product
is supposed not to be. `deleted` is a STATUS, not a row removal: the chart stops
showing it and the record of what Kai drew, when and why survives. The user can
hide or delete every Kai annotation.

**Kai chart control**

`POST /kai/conversations/:id/messages` can now emit a `chart_command` SSE frame:

```
event: chart_command
data: {"type":"chart_command","command":"mark_level","payload":{"level":"trigger","price":604.5,"label":"Trigger","kind":"trigger","symbol":"META","timeframe":"5m"},"annotations":[…],"narration":"I marked trigger at $604.5 on the chart. …","provenance":"Entry condition on the META setup."}
```

**Kai names WHICH level; the server resolves WHAT the number is.** The model
emits `{"command":"mark_level","args":{"level":"trigger"}}` — a symbolic
reference, never a price — and `lib/kai/chart-commands.ts` looks it up in the
setup, the plan, the room's most-mentioned level or the computed swing levels
that were loaded into the context. A reference nothing defines is DROPPED, not
filled in with a plausible number. A price written into `args` is discarded, and
the prompt says so, because the fastest way to stop a model guessing is to tell
it the guess will be thrown away.

Commands: `mark_level` · `set_timeframe` · `show_invalidation` · `mark_plan` ·
`zoom_trigger` · `compare_prior` · `highlight_community` · `annotation_remove` ·
`annotation_explain` · `alert_from_level` · `prepare_trade`. The last two
PROPOSE — Kai still never arms a watch and never places an order.

Every frame carries `narration` (spec §8: chart changes are narrated, never
silent) and `provenance` (which row the number came from). If the user clearly
asked for a chart change and the model answered in prose without the block, ONE
cheap classification call runs BEHIND the model — not a keyword matcher in front
of it — and the payload is resolved from the same real objects, so the worst case
is that nothing is drawn.

The fence is split by a second `FenceSplitter` chained after the `kai_object`
one, so a reply can carry both and neither marker leaks as visible text.

**Kai's voice**

`lib/kai/voice.ts`. `new` gets a glossary note the FIRST time a term appears and
the plain word after that — the terms already spent are remembered on
`conversations.context.explained`, because re-teaching "volume" in every answer
is the tone of a product that thinks its user is not learning. `some` is plain
and skips basics. `pro` loses the preamble and leads with levels. The definitions
live in code and are appended verbatim: the model is told to USE the glossary,
not to write one.

**Circles**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/circles` | Open setup rooms with time left, members, last activity, grade. |
| `POST` | `/circles` | `{symbol, ttl: 24h\|3d\|7d}` — gated on the `circles_create` entitlement flag. |

**A missing flag is FALSE.** `circles_create` is not in `supabase/seed.sql` and
this lane does not own that file, so today `can_create` is `false` for everyone
and the sheet says why. That is the safe direction for a gate to fail. To switch
it on, one row:

```sql
insert into entitlement_flags (tier, flag, value)
values ('premium', 'circles_create', 'true')
on conflict (tier, flag) do update set value = excluded.value;
```

The tick opens a circle for every `ready` A/B setup that has none, and closes
every circle whose clock has run out (0021's `close_expired_circles()`) or whose
setup has died. Closing is read-only plus a move to History — nothing is deleted,
because a room where the conversation vanishes teaches nobody anything.

**Conversations**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/kai/conversations?q=&limit=` | `{pinned[], recent[], q, total, …}` for the Home drawer. |
| `PATCH` | `/kai/conversations/:id` | `{title?, pinned?}`. |

Auto-titled after the first exchange: the daily briefing is named
deterministically ("Morning Briefing · Aug 28"); anything else gets ONE short,
cheap completion capped at six words, falling back to a derived title
("META Day Trade") when that call fails. A row in the drawer is never a UUID.
A user-set title is final — `autoTitle` only ever fills an empty one. Search
matches the title AND the first message, because "the one where I asked about
volume" has no matching title at all.

`GET /home` gains `conversation` (id, title, pinned, drawer route) and nothing
else changed.

**Ticker page** — `GET /symbols/:symbol` gains `company`, `ticker_overview`,
`technicals`, `kai_view`, `ticker_community`, `active_alert`, `chart_timeframes`
and `open_in_trade`. Every round-3 key survives.

**Company profiles** (`lib/market/profile.ts`) come from Polygon
`/v3/reference/tickers/{sym}`, are cached in `instruments.meta.profile` and
refresh weekly, so a symbol viewed twice in a week costs zero requests out of the
5/minute budget. The filing description is TRIMMED to two sentences — trimmed,
never rewritten. We do not paraphrase a company description with a language
model; that is how a factual field becomes a generated one. The ten seeded
symbols have hand-written summaries used when Polygon has nothing, returned with
`source:'seed'` so the app can be honest that the copy is ours.

**Technicals** (`lib/market/technicals.ts`) are ARITHMETIC, computed from the
stored daily bars every time and never judged by a model:

| Meter | What it actually is |
|---|---|
| Trend | EMA(20) slope over ten bars as a percent of price, plus price against EMA(20)/EMA(50) |
| Momentum | RSI(14), read as a band |
| Volatility | ATR(14) as a percent of price, read as a band |
| Support / resistance | pivot highs and lows in the window, clustered at 0.75% so three touches of one shelf read as one level |

Under 30 stored bars every meter is `Unknown` with strength 0 and the block is
`degraded`. A meter that said "Strong" off six bars would be a lie with a
progress bar attached.

**Personalize** — `POST /onboarding/complete` accepts `experience: new|some|pro`
(the three database levels still work and are mapped) plus `focus[]`.
`PUT /settings` accepts `experience`, `focus` and `mode` so the Account board's
Kai-profile rows can change them later; changing `experience` moves
`explanation_level` too, because that is what the row promises. `GET /me` gains
`kai_profile` and `rule_adherence`.

**Rule adherence** is computed from `debriefs.process_review` — a session is one
debrief, followed means every receipt item came back ok — and is HIDDEN below
three sessions (`show:false`). A 1-of-2 is noise, and this product has no
streaks, so a ratio that is not yet meaningful is not shown at all rather than
shown small.

**The tick** gains `alerts_evaluated`, `alerts_triggered`, `circles_opened` and
`circles_closed`.

### Round-4 schema, and running before it

SCHEMA-4's `0021_prototype_round4.sql` lands on its own clock, so every round-4
read probes for what it needs ONCE per process (`lib/round4/schema-probe.ts`)
and has a documented fallback:

| Object | Fallback when 0021 is not applied |
|---|---|
| `chart_annotations` | none — annotations are a first-class object with their own RLS, and hiding them in another table's jsonb would put one user's marks in a row another user can read. Missing → `degraded` with plain copy. |
| `alerts.version` / `grade_snapshot` / `score_snapshot` / `lifecycle_state` | `alerts.refs.round4`, user-scoped jsonb that already exists |
| `alert_events` | the timeline is empty; versioning still works |
| `conversations.pinned` / `last_message_at` | `conversations.context.round4.pinned` and `updated_at` |
| `rooms.expires_at` | `rooms.config.expires_at` |
| `rule_adherence_v` | the same count computed in TypeScript over `debriefs` |

Two details worth naming. `alerts.tab` is a GENERATED column and is never
written, only read. `conversations.last_message_at` is trigger-maintained by
0021, so `touchConversation` is a deliberate NO-OP once the column exists — two
authors for one value is how a timestamp starts lying.

### Round 5 — push

| Method | Path | Notes |
|---|---|---|
| `POST` | `/push/subscriptions` | register this device. Goes through 0024's `register_push_subscription`, because registration decides a device's OWNER: re-registering your own revoked device re-activates it, and a handle already registered to someone else is **taken over** by the registrant (a handed-down phone). The response never carries the handle or the keys. |
| `GET` | `/push/subscriptions` | the account's devices, `push_enabled`, and the `vapid_public_key` a browser must subscribe against. Revoked rows are not offered back. |
| `DELETE` | `/push/subscriptions/:id` | turn this device off. Revokes rather than deletes, so the ledger keeps its join. A row that is not yours and a row that does not exist give the same 404. |
| `POST` | `/push/test` | "Send a test". Bypasses the category switches and the daily budget — the user just pressed the button — but **not** quiet hours, because "you are in quiet hours right now" is the answer they actually need. Returns `{sent, suppressed:[{reason, plain}]}`. Rate limited 1/min/user. |
| `GET` | `/push/health` | configured transports, whether native is in dry-run, queue depth, last drain. Authenticated; not user data. |
| `POST` | `/internal/push/drain` | not a user route — `x-internal-secret`, 404 when the secret is unset. The Vercel cron. |

`PUT /settings` gains `push_enabled` and `notification_categories` (a MERGED
patch, not a replacement); `GET /me` and `PUT /settings` both return them under
`prefs`. See "Push notifications (round 5)" below.

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

## Market data (Polygon)

Polygon REST only — no websockets, no options. `src/lib/market/polygon.ts`.

### Delayed is not stale

The key on this account is a **delayed plan**: `/v2/aggs/...` answers
`status:"DELAYED"` and `/v2/snapshot/...` answers `NOT_AUTHORIZED`. That is the
licensing reality named in 00 §2, not a fault. So every quote comes back:

```json
{"price": 570.05, "source_ts": "2026-08-25T20:00:00.000Z", "received_ts": "…",
 "freshness": "delayed", "delay_reason": "entitlement",
 "label_plain": "Delayed · last close Aug 25, 4:00 PM ET"}
```

`freshness:'delayed'` with `delay_reason:'entitlement'`, **never `stale`**.
`stale` means the feed broke and the UI should stop offering actions; `delayed`
means the number is real, late, labeled, and perfectly usable. The app renders
"Delayed" and **keeps its buttons enabled**. `DelayReason` is
`entitlement | feed_gap | market_closed | seed`.

Thresholds are still 00 §5 (`live` <3s, `delayed` 3–60s, `stale` >60s) — the
entitlement rule short-circuits them, and if the plan ever becomes real-time
the same code path starts returning `live` with no other change.

### Rate limit: 5 requests a minute

Measured — the 6th call in a burst is a 429. Three defences, in order:

1. **The `candles` table is the store.** A symbol already backfilled costs zero
   Polygon calls. `getCandles` only fetches when the stored bars do not reach
   the last trading day.
2. **Grouped aggregates.** `/v2/aggs/grouped/…/{date}` returns every US ticker
   for one date in ONE call, so an N-symbol snapshot costs 2 calls (latest close
   + prior close) regardless of N, cached in memory for 60s.
3. **A non-blocking token bucket.** When the minute's budget is spent we do not
   queue and we do not fail — we serve the cache and set `degraded` with plain
   copy. `POLYGON_RPM` overrides the limit.

A delayed plan publishes the daily bar late, so "no bar for today" is normal and
is **not** degraded: the previous session's close is genuinely the newest price
that exists, and `delayed`/`entitlement` already says so. Only a symbol we have
nothing at all for sets `degraded`.

Daily bars are restamped at the 16:00 ET close — Polygon stamps them at the
session START (04:00Z), which otherwise reads as "last close 12:00 AM".

### `scripts/refresh-seed-setups.mjs` — the interim scanner

The four rows in `supabase/seed.sql` were written with invented levels (META at
$504). Real META trades near $570, so every screen showing a seeded setup beside
a live quote was showing a contradiction. This script fixes that and is the
interim scanner **until the market-intelligence worker (03 Unit 2) exists**.

```bash
cd apps/api
node scripts/refresh-seed-setups.mjs --dry-run   # print the levels, write nothing
node scripts/refresh-seed-setups.mjs             # apply
```

The rule, deliberately simple and documented in the file:

| Field | Rule |
|---|---|
| `entry` | the last 10 sessions' high |
| `stop` | the last 10 sessions' low |
| `targets[0]` | `entry + 1.5 × (entry − stop)` |
| `invalidation` | a daily close below the stop |

Grade, score and state are **not** recomputed — they came from the seed and
there is no detector behind this script, so changing them would be inventing
analysis. `thesis_plain` / `thesis_technical` are rewritten from a template with
the real numbers. Every row is stamped `score_components.seed = true`,
`source: 'polygon-daily'`, `refreshed_at`, and its `quote_snapshot` carries
`freshness:'delayed'`, `delay_reason:'entitlement'`. The 30 daily bars are also
written into `candles`, which warms the cache the API reads from.

Run once on 2026-08-26 it produced:

```
META  last $570.05  entry $604.50  stop $537.27  target $705.35  (risk $67.23/share, 1.5R)
NVDA  last $213.05  entry $227.92  stop $207.25  target $258.93  (risk $20.67/share, 1.5R)
AMD   last $479.18  entry $517.35  stop $451.00  target $616.88  (risk $66.35/share, 1.5R)
TSLA  last $350.25  entry $366.50  stop $323.64  target $430.79  (risk $42.86/share, 1.5R)
```

It throttles 13s between symbols. A dry run immediately followed by a real run
will hit the rate limit — wait a minute; the script is idempotent.

---

## Paper execution

PAPER ONLY. There is no broker, no SnapTrade, and no path to real money.

### The fill model (`src/lib/execution/paper.ts`)

03 Unit 4 specifies fills "marketable at NBBO opposite ± slippage". **We have no
NBBO.** The Polygon plan on this account is delayed aggregates — no level 1, no
book, no displayed size. Inventing a bid/ask from a last trade would be a
fabricated number in a financial product, so the model is stated plainly instead
and its assumptions are named in copy the user actually sees:

| Input | What it really is |
|---|---|
| reference price | the last delayed print. The only real number here. |
| spread proxy | `SPREAD_PROXY_BPS = 5` of price. A stand-in for a book we cannot see. |
| slippage | `SLIPPAGE_BPS = 2`, applied against the taker: a buy pays up, a sell receives less. |
| displayed size proxy | `DISPLAYED_SIZE_PROXY = 500` shares. Over `3×` that, the first clip fills and the rest rests (03 Unit 4's ">3× displayed" rule). |
| shorts | always locatable. A simulation difference, and the preview says so. |

Rules: **market** fills at the marketable price. **Buy limit** fills when the
print is at or below the limit (sell limit mirrors), and never worse than the
limit. **Stop** triggers on the losing side and becomes a market order — the
copy says out loud that a stop is not a guaranteed price. Everything is
deterministic: same inputs, same fill, every time, which is what lets the smoke
test assert on an execution chain at all.

**"Paper fills use delayed prices."** is one exported constant
(`PAPER_FILL_PLAIN`) and it appears on every surface that shows a fill.

### Status flow, and why accepted ≠ filled

`draft → previewed → submitted → accepted → (partially_filled)* → filled | cancelled | rejected`

`submitted` and `accepted` are always separate `order_events` with separate
timestamps, and `OrderRow` carries `accepted_at` and `filled_at` as separate
fields. A resting limit comes back `accepted` with `filled_at: null` and reads
"accepted and waiting — accepted is not filled". No copy anywhere implies a fill
that has not been booked.

### Brackets

A filled entry creates its exit legs as ONE authorized unit: same
`bracket_group`, `leg` of `stop` / `target`, status `accepted` (armed, not
filled). They are OCO — when one fills the other is cancelled — and `exit_style`
decides what "firing" means:

- **`auto`** (the `guided` default) — the leg executes. The stop is real protection.
- **`alert_assisted`** (the `hands_on` default) — the leg does **not** execute.
  An Attention alert and a notification are raised with one-tap close, and the
  copy says plainly that this is a notification, not protection.

Closing a position cancels its resting legs inside the same transaction as the
closing fill, and before it — otherwise a stop could fire on shares the manual
exit is already closing and open a brand-new position in the opposite direction.

### Advisory vs blocker

A **blocker** is not dismissible and sets `can_submit:false`: a stale quote, an
unsupported capability, no buying power, a spent daily loss cap, a position cap
already reached. An **advisory** IS dismissible and is rendered as a caution —
never as a pass. Sector exposure and reward:risk are ALWAYS advisories: a 58%
concentration is a judgement call, and showing it as a green "Passes" would be
the worst possible lie on that screen. A check whose answer is unknown comes
back `status:'unknown'`, which is also not a pass.

One correctness note worth naming: a setup's stop is written for the setup's own
entry, so an order priced elsewhere can inherit a stop on the WRONG side of its
fill. Computing "risk" from that produces a number that is not risk (a long with
a stop above the fill) and was consuming a daily cap it had no business
touching. Such a stop is now **dropped**, and the order raises the missing-stop
advisory instead — the honest reading is that no level here has been decided as
"I was wrong".

### Daily risk

`used = today's realised losses + open risk (qty × |avg_cost − stop|) on
positions opened today`. Money still on the table is still spent from the
budget: three live trades each risking $50 have committed $150 even though
nothing has been lost. 0020 ships this as the `daily_risk_v` view and that is
what runs; `src/lib/execution/risk.ts` keeps the same computation in TypeScript
as the fallback.

### The tick

`POST /api/v1/internal/paper/tick` refreshes one delayed quote per symbol with
an open position or a resting order, then calls `apply_paper_tick` once per
user+symbol. The RPC fills crossed resting entries, fires `auto` bracket legs
and re-marks every position, in one transaction each; the API raises the
notification for a fired leg and the Attention alert for an `alert_assisted`
one, because that is where the copy lives.

**Cost:** `getSnapshot()` covers every symbol in ONE `/v2/aggs/grouped` call
(plus one cached call for the prior close), so a tick costs at most two Polygon
requests regardless of how many symbols are in flight — a 60s interval sits
inside the 5/min budget with room for the rest of the app.

Two ways it runs:

- **Locally** — an in-process `setInterval`, started by `ensureDevTicker()` and
  guarded by a flag on `globalThis` (a module-level `let` would reset on hot
  reload and leave three tickers racing into duplicate fills). It is off unless
  `PAPER_TICK_DEV_INTERVAL_S` is a positive number AND `NODE_ENV !== 'production'`,
  and a slow tick never overlaps the next one.
- **Hosted** — a Vercel cron. Both crons live in `apps/api/vercel.json`:

  ```json
  { "crons": [
      { "path": "/api/v1/internal/paper/tick",  "schedule": "* * * * *" },
      { "path": "/api/v1/internal/push/drain",  "schedule": "* * * * *" }
  ] }
  ```

  with the secret supplied by a header rewrite. Note for whoever deploys this:
  Vercel's Hobby plan allows two crons at daily granularity only — a per-minute
  tick needs Pro, and without it neither fills nor pushes happen between
  requests.

`{"quotes":{"META":573.0}}` overrides the quote for a symbol so a test can cross
a level on demand. It is **`DEV_TOOLS=1` only** — a synthetic price that could
book a real-looking fill is exactly the kind of fixture that ends up in a
screenshot as if it happened.

### Where the atomicity lives

0020 owns the transactions: `create_plan`, `plan_action`, `submit_paper_order`,
`apply_paper_tick`, `close_position_prepare`, and the `daily_risk_v` view. This
app owns the DECISION — the fill model decides whether an order transacts, at
what price and for how many shares; the RPC books whatever was decided. Market
judgement in TypeScript where it can be read and tested, bookkeeping in SQL
where it can be transactional.

Every RPC call goes through `src/lib/execution/adapter.ts`, and each one is
paired with a multi-round-trip TypeScript path in `engine.ts` used only when the
function is absent. Those fallbacks are **not atomic** — see "Known gaps".

## Kai in a room — the security boundary

`POST /rooms/:id/kai` is the endpoint where other people's writing reaches the
model, so 03 Unit 3's normative clause is implemented in two halves, both in
`src/lib/kai/guard.ts`:

**Input.** Messages never enter the prompt as prose. `wrapUntrusted()` puts them
in a delimited `<untrusted_content>` block, one `<item>` per message, with every
`<` escaped so a member cannot close the block and start writing instructions.
The system prompt already states that anything inside such a block is DATA.

**Output.** `scanPayload()` walks every string in the produced object looking for
the marks of a successful injection: directives at the system ("ignore previous
instructions"), persona overrides, tool-call or system-prompt artifacts, and
off-context action claims ("I placed", "I changed your settings", "I fetched").
A hit publishes **nothing** from the model — the deterministic fallback goes out
and the finding is logged as `room_kai.INJECTION_SCAN_BLOCKED`.

Kai *quoting* an injection attempt is correct and expected ("a post asked me to
do something I will not do"); obeying it is what the scan stops. `scripts/smoke.sh`
posts a real injection attempt and asserts the obedience markers never reach the
published object.

`to_alert` produces a **preview** only. Nothing in this path can arm an alert,
and nothing in the whole app can place an order.

---

## Push notifications (round 5)

`docs/BUILD-BRIEF-round-5-push.md` is binding. The one-line version: **one
notification, two transports.**

`notify()` is still the single writer. It writes the in-app row exactly as it
did before, and then enqueues one `notification_deliveries` row per outcome. The
inbox and the buzz say the same thing because they ARE the same row — the banner
title and body are `payload.title_plain` and `payload.body_plain`, and there is
deliberately no second, punchier copy path for notifications anywhere in
`lib/push/`.

**A push can never fail an order.** `notify()` is called from the middle of a
fill, a trigger and a debrief. The enqueue is raced against a 2.5s timeout, the
drain is fire-and-forget, and every throw is caught and logged. The worst a
broken push service can do to a trade is leave a `queued` row behind.

### The decision is one pure function

`resolveDelivery()` in `src/lib/push/policy.ts` takes `(kind, user, prefs,
subscriptions, now, sentToday)` and returns who to send to and, for everyone
else, why not. No database, no network, no clock — `now` is an argument. Every
bug a notification system has ever had lives in this function, so it is the one
piece that can be run a thousand times in a millisecond with no stack around it:
`npm test` (`scripts/push-policy-test.ts`) is a table of 89 cases including the
quiet-hours window that wraps past midnight, the same instant falling inside one
user's night and outside another's, and the budget that must never touch a
trigger the user asked for.

The order is fixed, and the order is the product:

```
entitlement → push_enabled → category → quiet hours → budget (proactive only) → devices
```

- **Quiet hours suppress everything, including a triggered alert.** No critical
  override in v1: our evaluation runs off delayed quotes and the market is shut
  during typical quiet hours, so waking someone for a trade they cannot take is
  worse than the inbox. Nothing is replayed when the window ends.
- **`max_per_day` caps proactive kinds only** — `alert_activated` and `system`,
  the ones nobody asked for. A trigger on an alert the user created themselves is
  never capped and never deduped away.
- **An absent category key means ON.** `notification_prefs.categories` starts
  `{}`, and `PUT /settings` MERGES a patch into it rather than replacing it.

### A suppressed push is a record, not a drop

Every path out writes a row: `quiet_hours`, `prefs_off`, `category_off`,
`budget`, `no_subscription`, `keys_missing`, `entitlement`, or the provider's own
code. A user-level suppression carries `transport:'none'` and no
`subscription_id`, because no device was ever chosen. That is what lets
`POST /push/test` answer "you are in quiet hours right now" instead of appearing
broken, and what answers "why did I not get that" six hours later.
`notifications.sent_at` is stamped on the FIRST successful send to any transport
and stays null when everything was suppressed — it answers "did this ever reach
them", not "did it reach all their devices".

### The two transports are not equally proven

| | web | expo (native) |
|---|---|---|
| Encryption | real: AES-128-GCM to the browser's own `{p256dh, auth}` | Expo's |
| Signature | real: ES256 VAPID JWT | account token |
| Furthest honest state | `sent` — Web Push has no receipt | `delivered`, via receipts ≥15 min later |
| Proven end to end | **yes** — see the smoke block | **no** |

**Native push is NOT verified and must not be claimed.** There are no APNs
(Apple Developer account) or FCM (Firebase) credentials, and no dev build to
receive a token, so the expo path runs under `PUSH_DRY_RUN=1`: it builds, chunks
and logs the message, marks the row `sent`, and contacts nothing. It records no
ticket id, so no receipt is ever asked for. A green smoke run proves the
plumbing and nothing about a phone.

`PUSH_DRY_RUN` deliberately does **not** apply to web push, which has a real
endpoint and a real status code. `src/lib/push/web.ts` uses `web-push`'s
`generateRequestDetails` (the encryption and the VAPID signature) and posts the
result with `fetch`, because the library's own sender hard-codes `https.request`
and would make the one provable transport testable only against mocks. The bytes
on the wire are identical.

`src/app/api/v1/dev/push-sink` (DEV_TOOLS only) is a stand-in push service:
`web-push` cannot tell it from Mozilla's, and `?status=` reproduces the responses
that matter. The smoke asserts that 345 bytes of `aes128gcm` ciphertext arrive
with a VAPID `Authorization` header, and that a `410` revokes the row.

### The sender only runs while something ticks

Same shape as the paper tick. Locally, `PUSH_DRAIN_DEV_INTERVAL_S` starts an
in-process `setInterval` guarded on `globalThis`. Hosted, it is the Vercel cron
in `apps/api/vercel.json` hitting `POST /api/v1/internal/push/drain`, which is
`x-internal-secret`-gated and answers 404 when the secret is unset. **No cron and
no dev interval means no push** — rows pile up as `queued` and
`GET /api/v1/push/health` says so.

Retries are 1m, 5m, 25m, then `failed`. `DeviceNotRegistered` (expo) and
404/410 (web) revoke the token rather than retrying; five consecutive failures
mark a device `stale`.

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
  market/
    index.ts         America/New_York session status, freshness passthrough
    polygon.ts       aggregates, grouped snapshot, news, candles cache, token bucket
    profile.ts       company profiles cached in instruments.meta, refreshed weekly
    technicals.ts    EMA / RSI / ATR / swing levels — arithmetic, never generated
  entitlements.ts    tier from `subscriptions` + flags from `entitlement_flags`
  rpc.ts             SCHEMA-2 command RPCs + the documented PostgREST fallbacks
  notify.ts          the single writer: the in-app row, then one delivery row per outcome
  push/
    policy.ts        resolveDelivery() — PURE. entitlement → switch → category → quiet hours → budget → devices
    payload.ts       one payload from the notification row; the banner copy IS the inbox copy
    expo.ts          expo-server-sdk: chunks, tickets, receipts, DeviceNotRegistered → revoke. PUSH_DRY_RUN
    web.ts           web-push + VAPID: real encryption, real signature, 404/410 → revoke, 429 → back off
    send.ts          enqueue + the queue drain: claim, send, backoff, receipts, prune
    drain-dev.ts     the local setInterval sender (tick-dev.ts for push)
  ratelimit.ts       in-memory per-user buckets (community posting, @Kai)
  spam.ts            community spam heuristics
  rooms.ts           room shaping, membership, message/author/object hydration
  setups.ts          stepper, confirmations, size suggestion, scenarios, quiz, fit
  watchlist.ts       watchlist tables (0017) with a "not applied yet" path
  watchlist-view.ts  watchlist rows + quotes + attached setups
  debriefs.ts        loads everything that happened on a position
  paper.ts           once-per-calendar-month reset policy
  prefs.ts           accessibility in profiles.onboarding -> 'prefs'
  stripe.ts          checkout session + webhook signature, no SDK
  kai/
    system-prompt.ts  copy pattern, four questions, execution boundary, object protocol, untrusted-content policy
    context.ts        profile + risk policy + mode + ranked setups + pinned + last 20 turns
    stream.ts         Anthropic streaming → SSE, FenceSplitter, object gate
    briefing.ts       one briefing per user per market day, cached in kai_objects
    contradiction.ts  orientation / stop / narrative-vs-structured / coherence
    objects.ts        envelope, persist, cache lookup, deterministic graded_setup from a row
    guard.ts          untrusted-content wrapping + output injection scan
    room.ts           the @Kai commands, synchronous
    debrief.ts        computed facts + generated judgement
    sheet-context.ts  the contextual sheet: loads the real order/position/alert/room into the prompt
    chart-commands.ts Kai names the LEVEL, the server resolves the NUMBER (spec §7)
    voice.ts          new / some / pro, and the first-use glossary
  execution/
    paper.ts          the fill model — pure, deterministic, no database, no network
    risk.ts           daily risk budget + the advisory/blocker check builders
    preview.ts        the preview pipeline: gates → estimate → persist
    submit.ts         preview → order, the three refusals, idempotency
    engine.ts         the non-atomic PostgREST fallback for fills, positions, legs
    adapter.ts        the thin wrapper over 0020's RPCs (the atomic path)
    tick.ts           mark-to-market + bracket evaluation, one grouped quote call
    tick-dev.ts       the dev-only setInterval, guarded on globalThis
    plans.ts          size, scenarios, R/R, plan shaping and events
    shape.ts          orders/positions → wire shape, with the accepted≠filled copy
    positions-view.ts open positions + mark + freshness + stop/target
    chain.ts          the decision chain: discovery → … → review
  v5/
    priority.ts       Home's one priority object and its state-driven action
    workspace.ts      the asset workspace's modules, sentiment and verified claims
  round4/
    schema-probe.ts   one-shot capability probes for 0021 + the documented fallbacks
    alert-identity.ts what a watch is ABOUT, read from the parsed condition
    grade.ts          medallion, grade families, and the QUALITATIVE scorecard (no fractions)
    alert-cards.ts    the card contract, the state machine, versioned grade snapshots
    alerts-feed.ts    every card in one pass — one query per table, not one per card
    alert-tick.ts     armed alerts evaluated against the tick's marks (Watching → Active)
    annotations.ts    chart marks CRUD + markPlanLevels (what "I marked the trigger" does)
    chart-context.ts  the real objects a chart command may be resolved against
    circles.ts        time-boxed setup rooms: open, list, sweep, close
    conversations.ts  drawer list, search, pin, auto-title
    profile-round4.ts experience + focus + Kai voice line + rule adherence
src/proxy.ts          CORS for /api/* (Next 16 renamed `middleware.ts` → `proxy.ts`)
src/app/api/v1/…      the routes above
scripts/
  smoke.sh                 end-to-end smoke against the local stack (241 assertions,
                           including the whole plan → preview → submit → tick →
                           bracket → close → debrief chain, long and short, plus
                           round 4: a watch promoted Watching → Active on a
                           verified tick, a grade change bumping the version,
                           the portal's exact opening message, annotations CRUD,
                           a real mark_level chart_command out of a Kai turn,
                           the beginner voice's first-use glossary note, circles
                           opening and expiring, and the conversations drawer)
  refresh-seed-setups.mjs  interim scanner — real levels onto the seeded setups
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
POLYGON_API_KEY=…
DEV_TOOLS=1                 # gates POST /dev/simulate-closed-trade and the tick's
                            # synthetic {quotes} override; 404 without it
INTERNAL_SECRET=…           # x-internal-secret for POST /internal/paper/tick.
                            # UNSET = the route answers 404, as if it did not exist
PAPER_TICK_DEV_INTERVAL_S=60  # dev only: in-process tick interval. 0/unset = off,
                              # and it never starts when NODE_ENV=production
POLYGON_RPM=5               # optional, matches the plan's requests-per-minute
POLYGON_MAX_CANDLES=1500    # optional, aggregate page size
STRIPE_SECRET_KEY=…         # optional — absent means BILLING_NOT_CONFIGURED
STRIPE_PRICE_PREMIUM=…      # optional
STRIPE_WEBHOOK_SECRET=…     # optional — absent means every webhook is rejected
```

`POLYGON_API_KEY` was empty in `.env.local` when this round started; the value
in use is the same Polygon key the owner's other projects carry. No key is ever
invented: with Stripe unset the checkout endpoint answers
`BILLING_NOT_CONFIGURED` rather than falling back to a test link.

Local Supabase values come from `supabase status`; a copy-paste version is in
`supabase/.env.local.example` and `docs/ENV.md`.

### CORS

Native Expo does not do CORS; **Expo web does**. `src/proxy.ts` answers the
`OPTIONS` preflight with `204` and puts `Access-Control-Allow-Origin` on every
`/api/*` response — the SSE route included, because `NextResponse.next()`
headers are merged into the route handler's streaming response.

The request `Origin` is echoed back only when it matches one of:

| | |
|---|---|
| `^http://localhost(:\d+)?$` | `npx expo start --web` on 8081, 8082, or whatever port Metro grabs |
| `^http://127\.0\.0\.1(:\d+)?$` | same, by IP |
| `^http://192\.168\.\d+\.\d+(:\d+)?$` | LAN dev — a phone browser hitting the laptop |
| anything in `ALLOWED_ORIGINS` | exact match, comma-separated. **This is where the deployed web origin goes.** |

```
ALLOWED_ORIGINS=https://app.cheatcode.com,https://cheatcode-ai.vercel.app
```

An unlisted origin gets no `ACAO` header (the browser blocks it) — the request
itself is still served, because auth is the Bearer token, not the origin.
`Vary: Origin` is set on every response so no cache serves one origin's answer
to another. `Access-Control-Allow-Credentials` is deliberately **not** sent:
this API has no cookie session, so the echoed origin can never ride one.

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
with the anon key, asserts the 401 and 400 envelopes, then curls every endpoint.
It exits non-zero if anything fails. 82 assertions, all green as of this round.

It is not only a happy path. It makes real calls and prints them verbatim:

- the Kai SSE stream, frame by frame;
- a real `POST /rooms/:id/kai {command:'summarize'}` over three posted messages,
  printing the `room_summary` object in full;
- a real injection attempt posted to the room, then a summarize over it,
  asserting the obedience markers never reach the published object;
- `POST /dev/simulate-closed-trade` → `POST /positions/:id/debrief` →
  `GET /debriefs/:id`, printing the debrief payload in full;
- `GET /symbols/META?mode=day_trade` with a live delayed quote, real candles and
  real Polygon news.

And it asserts the refusals, because a guard that never fires is not a guard:

| Assertion | Expect |
|---|---|
| reading a room before joining | 403 |
| a structured idea with no position disclosure | 403 `CONSENT_REQUIRED` |
| a "guaranteed returns / DM me" post | 400, spam precheck |
| a 6th active alert on the free tier | 402 `ENTITLEMENT_REQUIRED` |
| a second paper reset in one month | 409 |
| checkout with no Stripe keys | 503 `BILLING_NOT_CONFIGURED` |
| an unsigned Stripe webhook | 400/503 |

---

## Known gaps (Phase 0)

1. **Outbox transaction gap — closed for onboarding, open elsewhere.**
   `01 §3` requires the domain write and its `user_events` row in *one*
   transaction, and PostgREST offers no multi-statement transaction. The fix is
   one SQL function per command (supabase/migrations/0016):
   `complete_onboarding(p_user_id, p_patch)` does profile + risk policy +
   `risk_policy_events` journal + paper-account balance + `user_events` in a
   single `plpgsql` body, and decides idempotency inside that transaction under
   a row lock on `profiles` — so `POST /onboarding/complete` is now atomic.
   Every OTHER write path (`PUT /mode`, `POST /alerts/draft`, the Kai stream)
   still calls `emitUserEvent()` as a second round-trip after its domain write.
   That call now goes through `append_user_event(...)` (same migration), which
   returns the assigned `seq`, but it is still a separate transaction from the
   domain write, so it stays best-effort — logged, never raised, and a failed
   outbox write never fails the user's request. Closing the rest means giving
   each of those commands its own RPC in the same shape.
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
8. ~~**No entitlement middleware, no Stripe, no rate limiting.**~~ Closed in
   round 2: `lib/entitlements.ts` reads the tier from `subscriptions` and the
   flags from `entitlement_flags`, `POST /alerts` enforces `alerts_max_active`,
   `lib/ratelimit.ts` covers community posting and `@Kai`, and Stripe checkout +
   webhook are implemented behind env. See gaps 9-14 for what is left.

---

### Known gaps (round 2)

9.  **The command RPCs have PostgREST fallbacks, and those are not atomic.**
    Every 0018 RPC call in this app is paired with a fallback used only when the
    function is not present (`isMissingObject`). They exist because API-2 and
    SCHEMA-2 were built in parallel and the lane had to be demonstrable before
    0018 landed. 0018 IS applied now, so the RPC path is what runs — the
    fallbacks are dead code on a migrated database and are logged as
    `rpc.fallback` if they ever fire. The one with teeth is `post_room_message`:
    its fallback assigns `seq` read-then-write, so two simultaneous posts to one
    room could collide on `unique (room_id, seq)`. `post_room_message` takes the
    `room_seq_counters` row lock and removes that. Deleting the fallbacks once
    0018 is guaranteed everywhere is a clean follow-up.
10. **Rate limiting is in-process.** `lib/ratelimit.ts` holds its buckets in
    module memory. That is a floor, not a guarantee: two Vercel instances each
    allow the full 10/min. The Redis counter in 00 §3 is the real fix. The
    Polygon token bucket has the same caveat, which matters more — two instances
    could between them exceed 5 requests a minute and take 429s. Both degrade
    into "serve the cache", never into a wrong number.
11. **No alert evaluation.** Activation arms an alert and nothing checks it.
    Every active alert says so through `monitoring:'armed_no_feed'` and its
    copy, so the app can be honest instead of implying monitoring that is not
    happening. The evaluator is 03 Unit 2.
12. **`@Kai` room commands are synchronous.** 02 §9 specifies async with
    `kai_status` events. Without a kai worker the request runs the model inline
    (a few seconds) and returns the finished object. `mark_levels` is not
    implemented — it needs chart annotations from the setup engine.
13. **The spam precheck is heuristics only.** 03 Unit 1 also calls for an
    efficient-model screen on structured ideas; that is not wired up. And there
    is no verification pipeline, so `@Kai verify` answers `unverifiable` for
    anything the room context cannot settle, and says why. Unverifiable is not
    false, and the copy says that too.
14. **Community intelligence and moderation actions are absent.**
    `community_signals` is v1.2 and stays empty; the symbol page's community
    block returns `thread_summary:null, sentiment:null` rather than a fabricated
    number (08 §6 prohibits treating sentiment as evidence).
    `POST /moderation/actions` is not implemented — reports are filed and the
    message stays up.
15. **No push.** Notifications are `channel:'in_app'` with `sent_at` null, ready
    for a push sender to pick up. No Expo push, no receipts.
16. **Stripe is implemented but untested end to end.** There are no keys on this
    account, so checkout has never returned a real session. The signature check
    is exercised negatively (an unsigned webhook is rejected) and the
    unconfigured path is exercised positively.
17. **Accessibility preferences live in `profiles.onboarding -> 'prefs'`.** 01
    §2 has no accessibility column and adding one is SCHEMA-2's call. `prefs`
    namespaces them so an onboarding rewrite cannot collide with them.
18. **`GET /rooms` is an addition, not in the round-2 brief.** The Community
    screen needs member and message counts, which are aggregates a client cannot
    compute under RLS, and `rooms` RLS only shows a non-member the CORE rooms,
    so setup rooms would otherwise be invisible.
19. **`mark_levels` never calls the model.** Every other room command asks Kai;
    this one reads the prices out of the text with a regex and counts distinct
    authors. Two reasons, both in `src/lib/kai/room.ts`: a model asked for "the
    levels people mentioned" will round 604.50 to 605 or add the obvious round
    number nobody typed, and "mentioned by N members" is a COUNT — models cannot
    count, and a wrong count here reads as social proof, the exact thing 08 §5
    forbids. A useful side effect is that no member text reaches the payload, so
    there is no injection surface. When nobody has named a price, the object
    carries no annotations and the posted message says so in plain English.

20. **The smoke test posts into a room it creates and then deletes.** It writes
    spam and prompt-injection fixtures and then asks Kai to summarise them.
    Pointed at a seeded room, that text stays there for real members to read —
    with Kai's summary quoting it back. `cleanup_smoke_room` runs on `trap EXIT`,
    so the room, its messages, its members and the Kai objects they produced go
    away on failure too.

21. **Seed setups are still seed setups.** `refresh-seed-setups.mjs` gives them
    real levels from real bars and labels them `seed:true, source:'polygon-daily'`,
    but the 10-session high/low rule is not a detector. Nothing derived from it
    should be read as analysis, and grade/score/state are untouched for exactly
    that reason.

### Known gaps (round 3)

22. **The execution fallbacks are not atomic.** Every 0020 RPC call goes through
    `src/lib/execution/adapter.ts` and is paired with a TypeScript path in
    `engine.ts` that does the same work in several PostgREST round-trips. 0020
    IS applied, so the RPC path is what runs and the fallbacks are logged as
    `rpc.fallback` if they ever fire — but a crash mid-sequence on the fallback
    would leave an order filled with no position row. They exist because API-3
    and SCHEMA-3 were built in parallel. Deleting them once 0020 is guaranteed
    everywhere is a clean follow-up, and the same is true of the pre-0020
    `preview.bracket_role` reading in `shape.ts` now that `orders.leg` exists.
23. **The fill model is a model, not a market.** No NBBO, no book, no displayed
    size — see "The fill model" above for exactly which numbers are real (the
    last delayed print) and which are stand-ins (spread, displayed size). Fills
    are optimistic in one specific way worth naming: a resting limit crossed on
    a tick fills at the limit in full, with no queue position and no partial. A
    real book would not always oblige.
24. **The tick is a cron, not a feed.** Between ticks nothing is evaluated, so a
    stop can only fire on a delayed print at most one interval old — and on a
    delayed plan that print is itself late. A position can therefore "gap
    through" its stop and fill materially worse than the level. That is honest
    for practice and it is why `exit_style:'alert_assisted'` exists, but it is
    not what a real broker's stop does.
25. **Sector exposure is usually `unknown`.** `instruments.meta` carries no
    sector for the seeded universe, so the concentration check reports that it
    cannot work it out rather than inventing a bucket. `unknown` is deliberately
    NOT a pass — the client must not render it as one.
26. **Partial fills are barely exercised.** The `>3× displayed size` rule is
    implemented and unit-shaped, but nothing in the smoke buys 1,500 shares, so
    the partial path is reasoned-about rather than proven.
27. **No PDT counter, no options, no extended hours.** `PDT_WARNING`,
    `OPTIONS_LEVEL_INSUFFICIENT` and `EXTENDED_HOURS_UNSUPPORTED` have status
    codes and copy but no producer. Options are refused at the capability gate
    with `CAPABILITY_UNSUPPORTED` and the equity alternative.
28. **The Kai sheet's `action_preview` frames are proposals only.** The model is
    told the three shapes (`watch` · `alert` · `plan`) and the client routes
    them to the real endpoints; there is no server-side execution path and no
    `POST /kai/actions` yet, so a tap goes to `/alerts/draft`, `/watchlist` or
    `/plans` exactly as if the user had typed it.
29. **`GET /home`'s priority is derived, not generated.** It is computed from
    rows (a position on its stop, a triggered alert, a ready setup, an armed
    plan…), which is why Home still answers "what needs my attention" when
    Anthropic is down. The consequence is that it cannot notice something a
    query cannot express — a cross-symbol portfolio decision, for instance.
30. **`recent[]` on Trade is inferred.** There is no view history in the data
    model, so "recent" is what the user actually touched — positions, working
    orders, then the setups Kai is watching. It is honest about why each row is
    there (`reason_plain`) rather than pretending to be a visit log.

### Known gaps (round 5 — push)

1. **Native push is not verified and must not be claimed.** No APNs key, no FCM
   project, no dev build. `PUSH_DRY_RUN=1` exercises the path and contacts
   nothing. Owner blockers: an Apple Developer account ($99/yr) and a Firebase
   project. Expo Go cannot receive push at all — it was removed in SDK 53.
2. **The queue claim is a lease, not a lock.** `drainPush` claims rows with an
   UPDATE that pushes `next_attempt_at` out by 60s, rather than
   `select … for update skip locked`. Two drains racing inside that window could
   both claim a row and send it twice. There is one drainer locally
   (single-instance guard) and one cron hosted, so the window is not currently
   open; closing it properly needs an RPC, which is the schema lane's to write.
3. **`enqueuePush` costs five reads per notification** (profile, prefs, alert
   prefs, subscriptions, entitlements — issued in parallel, plus one count for
   proactive kinds). They are awaited inside `notify()` so the ledger is written
   before the response, capped at 2.5s. On a tick that notifies many users this
   is the dominant cost, and the fix is a per-request cache of
   `entitlement_flags`, which is global seeded config.
4. **Web push stops at `sent`.** The protocol has no receipt, so `delivered` is
   reachable only through Expo. The table in the push section says so; nothing
   in the UI should imply a web push was seen.
5. **Quiet hours default to `America/New_York`** when neither the window nor the
   profile names a timezone. That is a guess — a correct one for a US-market
   product, a wrong one for a user in London who never set a timezone. The
   profile's timezone is never collected by onboarding today; collecting it is a
   client change, not an API one.
6. **`resolveDelivery` is only reachable through `notify()`.** There is no
   admin route to ask "what would happen if you notified this user right now",
   which is the question support will want. The unit table covers the logic; an
   operator cannot yet run it against a real account.
