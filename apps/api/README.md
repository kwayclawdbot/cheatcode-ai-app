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
- **Hosted** — a Vercel cron:

  ```json
  { "crons": [{ "path": "/api/v1/internal/paper/tick", "schedule": "* * * * *" }] }
  ```

  with the secret supplied by a header rewrite.

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
  entitlements.ts    tier from `subscriptions` + flags from `entitlement_flags`
  rpc.ts             SCHEMA-2 command RPCs + the documented PostgREST fallbacks
  notify.ts          in-app notification rows with deep-link routes
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
src/proxy.ts          CORS for /api/* (Next 16 renamed `middleware.ts` → `proxy.ts`)
src/app/api/v1/…      the routes above
scripts/
  smoke.sh                 end-to-end smoke against the local stack (181 assertions,
                           including the whole plan → preview → submit → tick →
                           bracket → close → debrief chain, long and short)
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
