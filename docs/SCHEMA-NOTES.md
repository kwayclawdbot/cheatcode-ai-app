# Schema notes — Cheat Code AI v1 (SCHEMA lane)

Companion to `docs/01_DATA_MODEL.md`. Two sections:

1. **Interpretations** — every place the migrations had to decide something the
   canonical doc did not state. Nothing here contradicts 01; it fills silence.
2. **Known gaps** — things 01 *does* say that the review flagged as probably
   wrong or incomplete. **These were implemented as written.** No enum value,
   column or default was invented to "fix" them. The owner decides.

Migrations live in `supabase/migrations/0001…0015`, applied in filename order.

---

## 1. Interpretations

### 1.1 Timestamps (`created_at` / `updated_at`)
01's Conventions line says `created_at timestamptz default now()` and
"trigger-maintained `updated_at` unless noted", but most §2–§12 table bodies
omit both. Applied uniformly:

- every table gets `created_at timestamptz not null default now()` if the doc
  did not already list one;
- every **mutable** table gets `updated_at timestamptz`, maintained by a
  `set_updated_at()` trigger attached in `0013` by a DO-loop over every
  `public` table that has the column;
- **append-only** tables (`risk_policy_events`, `user_events`, `setup_events`,
  `plan_events`, `order_events`, `fills`, `notifications`, `alert_triggers`,
  `moderation_log`) get **no** `updated_at` — a row that can never change has
  nothing to stamp.

### 1.2 `on delete cascade` on user-scoped FKs — **needs an owner decision**
01 writes `references profiles` / `references auth.users` with no delete rule.
Every user-scoped FK was made `on delete cascade` so that deleting an
`auth.users` row (admin action, and the teardown path in `scripts/rls-test.mjs`)
does not fail on a foreign-key violation.

This collides with §14 Retention: *"Audit records (orders, events, financial
kai_objects, moderation_log) — not user-deletable."* Today a hard delete of the
auth user removes `user_events`, `orders`, `positions`, `debriefs` with it.
The alternative (`on delete restrict` + a soft-delete/anonymise flow in the
api-app) is the correct long-term answer; it was not built in this slice because
account deletion is not in the v1 surface. Flagged, not silently resolved.

### 1.3 Extensions live in the `extensions` schema
`vector` and `pgcrypto` are installed `with schema extensions` (Supabase
convention). Consequences visible in the DDL: embedding columns are typed
`extensions.vector(1536)` and the ivfflat index uses
`extensions.vector_cosine_ops`.

### 1.4 ivfflat index has no `lists` parameter
01 §11 ⚙ gives the index verbatim with no options, so it was created verbatim
(`lists` defaults to 100). Postgres emits `NOTICE: ivfflat index created with
little data` on an empty table. The index must be rebuilt with a tuned `lists`
value once `market_memory` holds real rows — an empty ivfflat index is a
placeholder, not a working ANN index.

### 1.5 `fk_setup_room` is deferrable
`setups.discussion_room_id → rooms` is added in `0010` as
`deferrable initially deferred`, so a setup and its discussion room can be
created in either order inside one transaction. 01 only requires that the
constraint be added after `rooms` exists.

### 1.6 Migration filenames are `0001…0015`, not timestamps
Per the lane brief. The Supabase CLI (2.75) accepts them and applies in
lexicographic order. If migrations are later pushed to a hosted project that
already has timestamp-versioned history, these versions sort *before* every
timestamp — fine for a first push, worth knowing before mixing styles.

### 1.7 Indexes beyond the two 01 specifies
01 names only `setups(mode, state, score desc)` and `setups(symbol)`. Added
supporting indexes on user-scoped foreign keys and common lookup paths (they
are unindexed FKs otherwise, which makes every owner-scoped RLS check a seq
scan): `risk_policy_events(user_id, created_at desc)`,
`user_events(user_id, occurred_at desc)`, `option_contracts(underlying, expiry)`,
`broker_connections(user_id)`, `accounts(user_id, kind)`,
`trade_plans(user_id, status)`, `plan_events(user_id, created_at desc)`,
`orders(user_id, status)`, `orders(account_id)`, `order_events(order_id, created_at)`,
`fills(order_id)`, `positions(user_id, closed_at)`, `debriefs(user_id, created_at desc)`,
`alerts(user_id, status)`, `alert_triggers(alert_id, triggered_at desc)`,
`notifications(user_id, created_at desc)`, `invest_goals(user_id)`,
`invest_recommendations(user_id, status)`, `rooms(mode, type)`,
`room_members(user_id)`, `messages(room_id, created_at desc)`,
`kai_objects(user_id, type, created_at desc)`, `kai_objects` GIN on `refs`,
`community_signals(symbol, computed_at desc)`, `market_memory` GIN on `symbols`,
`kai_user_memory(user_id, created_at desc)`, `conversations(user_id, created_at desc)`.

### 1.8 RLS: "watchlist tables" do not exist
01 §13 row 1 lists "watchlist tables" among owner-write client-direct tables.
The v2 model defines no watchlist table (the Trade tab's watchlist is served
from `scan_universes` / `instruments` in this slice). Nothing was created.

### 1.9 RLS: `kai_objects(public)` interpreted via `user_id`
01 §13 grants `kai_objects(public)` to authenticated but `kai_objects` has no
visibility column. Implemented as: `user_id is null` → global/public object
(readable by any authenticated user); `user_id = auth.uid()` → owner-only.
A user-scoped briefing is therefore never readable by another user. See gap 2.4.

### 1.10 RLS: `rooms` select is `type = 'core' OR member`
01 §13 says rooms/room_members/messages are "members" select. Applied strictly
to `room_members` and `messages`. For `rooms` it would make the Community tab's
room directory unlistable by a user who has joined nothing — the exact screen
the brief requires. Core rooms (the seeded per-mode directory) are therefore
readable by any authenticated user; `setup` and `announcement` rooms stay
member-scoped. Membership checks use `is_room_member(uuid)`, a
`security definer` function, to avoid RLS recursion on `room_members`.

### 1.11 RLS: "staff roles" has no implementation
01 §13 row 6 grants `moderation_log`, `reports` and admin tables to "staff
roles". The v2 model defines no staff role, JWT claim or admin table listing.
Those tables have RLS enabled and **no client policy and no client grant** —
reachable only through the api-app's service role. When a staff claim exists,
add the policies there.

### 1.12 RLS: tables the §13 matrix does not mention
Assigned by nearest analogy and listed here so the choice is reviewable:

| Table | Treatment | Why |
|---|---|---|
| `option_contracts`, `market_sessions` | authenticated select | reference data, same class as `instruments` |
| `entitlement_flags`, `disclosure_templates`, `system_status`, `kai_explanations` | authenticated select | the client renders gates, disclosures and degraded-state copy from them (`disclosure_templates` filtered to `active`) |
| `contributor_stats` | authenticated select | feeds `profiles_public.role_labels` |
| `subscriptions`, `notifications`, `broker_connections` | owner select, no client write | user-scoped financial/account state, same class as row 4 |
| `conversation_messages` | owner select via parent conversation | 01 lists `conversations` only |
| `allocation_models` | authenticated select **where** `active and approved_at is not null` | 01 §9 ⚙ "serving requires approved_at not null AND active" |
| `scan_universes`, `market_memory`, `legacy_imports`, `user_event_counters` | no client access at all | worker/back-office state |

`allocation_models` also carries a table check
(`active is not true or approved_at is not null`) — the "+ check" half of the
same ⚙ note.

### 1.13 Grants model
Baseline is `revoke all on all tables in schema public from anon, authenticated`,
then SELECT (and, for the four client-direct tables, INSERT/UPDATE/DELETE) is
granted back exactly per §13. **`anon` ends with zero table access** — this app
has no anonymous data surface. So a table that is added later without an
explicit grant is closed by default rather than open.

### 1.14 Append-only revokes DO include `service_role` — verified
01 §13 ⚙: *"revoke UPDATE/DELETE from every role including service paths"*.
Verified on the live local DB: with `service_role`, `INSERT` into `user_events`
still succeeds, while `UPDATE` and `DELETE` both raise `insufficient_privilege`.
So the revoke does **not** break the service role's ability to write history —
only its ability to rewrite it. The table **owner** (`postgres` /
`supabase_admin`) is unaffected, which is what keeps `supabase db reset`,
migrations and any future legal-hold operation possible.

Tables covered: `risk_policy_events`, `user_events`, `setup_events`,
`plan_events`, `order_events`, `fills`, `moderation_log`.

### 1.15 `user_events.seq` assignment
`seq` is part of the primary key and therefore cannot be nullable. A
`BEFORE INSERT` trigger (which runs before constraint checks) calls
`next_user_event_seq(user_id)`, which upserts into `user_event_counters` and
does `UPDATE … RETURNING` — taking the per-user row lock for the rest of the
transaction, exactly as 01 §3 ⚙ requires. A writer that supplies its own `seq`
is left alone. Verified: two inserts for one user produced `1, 2`.

Sequence assignment for `setup_events.seq`, `plan_events.seq` and
`messages.seq` was **not** automated — 01 assigns those to the api-app
("assigned by api-app in txn"). Their `unique` constraints are in place.

### 1.16 Views (01 names the behaviour, not the view)
| View | Security | Grants |
|---|---|---|
| `profiles_public(user_id, handle, display_name, avatar_url, role_labels)` | definer (default) — so owner-only `profiles` RLS does not hide other members' display identity | `authenticated` |
| `messages_public` | `security_invoker = true` — room-membership RLS on `messages` still applies; `body` is `null` for deleted rows and a `deleted` boolean is exposed | `authenticated` |
| `messages_moderation` | definer — retains original bodies for market-claim audit (§14) | `service_role` only; explicitly revoked from `anon`/`authenticated` |

`profiles_public` includes `user_id` (01 lists only the four display fields) —
without it the view cannot be joined to a message author.

### 1.17 New-user provisioning defaults
`handle_new_user()` (`security definer`, on `auth.users` insert) creates:
`profiles` (display_name from `raw_user_meta_data.display_name` if present),
one `accounts` row (`kind='paper'`, name **"Paper account"**, `starting_balance`
/ `cash` / `buying_power` / `equity` all 10000), `notification_prefs`,
`setup_alert_prefs`, `risk_policies` (`daily_loss_cap_usd` 60,
`max_position_pct` 25, `max_open_positions` 5, `min_reward_risk` 1.5,
`updated_by='system'`), and the `user_event_counters` row.
No `subscriptions` row is created — tier defaults to free in the absence of a
row, and 01's ⚙ does not list it.

### 1.18 Seed data choices
- **Rooms:** exactly the 19 core rooms of community spec §3 (6 day-trade,
  6 swing, 7 invest), all `type='core'` with `config = {"intel_eligible": false}`.
  No announcement room was invented.
- **Setups:** the four seed rows carry
  `scanner_run_id = '00000000-0000-0000-0000-000000000000'` and
  `score_components.seed = true`. META's plain and technical thesis strings are
  **verbatim** from the brief. NVDA / AMD / TSLA carry the brief's mandated
  state, score, band and display grade; their price levels and copy were
  written for this seed (the brief specified grades, not numbers) in the
  beginner-first register. All four are `mode='day_trade'`,
  `intent='buy_to_open'`, and every `quote_snapshot` is
  `freshness='delayed'` with `source_ts = now() - 15 minutes`.
- **Thesis:** one `active` thesis for META. `theses.timeframe` is `not null` and
  `setups` has no timeframe column (gap 2.5), so `'5m'` was chosen.
- **`entitlement_flags.value`** holds JSON scalars: numbers unquoted
  (`5`, `50`, `500`), booleans unquoted, and the premium alert cap as the JSON
  string `"unlimited"` — a value the doc gives as a word, not a number.
- Also seeded: today's `market_sessions` row with `status='unknown'` (so the
  client has an honest, non-fabricated market-status source before the calendar
  worker exists) and a `system_status` row for `database`.

### 1.19 Local stack config changes (`supabase/config.toml`)
Two services are disabled to make the stack start on this machine. Neither
affects the database, auth, or PostgREST.

- `[analytics] enabled = false` — the `vector` container bind-mounts the host
  Docker socket, and Colima's virtiofs mount cannot expose
  `~/.colima/default/docker.sock` (`operation not supported`).
- `[studio] enabled = false` — CLI 2.75 pins a Studio image with no arm64
  variant, so it crash-loops with `exec format error` inside the aarch64 Colima
  VM. Upgrading the Supabase CLI (2.116 is available) is the fix; re-enable
  after upgrading. Until then, use `psql` against
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## 2. Known gaps in `01_DATA_MODEL.md` (implemented as written — owner decides)

### 2.1 `explanation_level` has no `family` value
`profiles.explanation_level` is typed `experience_level`
(`beginner|intermediate|advanced`). There is no `family` register, so a
family/kid explanation level cannot be stored. Adding it means either a new
value on `experience_level` (which also widens `experience`, `courses.level`
and `kai_explanations.level`) or a separate `explanation_register` enum.
**Not added** — this is an owner decision, not a migration detail.

### 2.2 `alerts` has no `mode` column
Everything else user-facing is mode-scoped (`trade_plans.mode`,
`positions.mode`, `conversations.mode`, `setups.mode`), and
`setup_alert_prefs.modes` filters *setup* alerts by mode — but an individual
`alerts` row cannot say which mode it belongs to. The Alerts tab cannot filter
by mode without stuffing it into `refs` jsonb.

### 2.3 `rooms.config.intel_eligible` lives in jsonb
The community-intelligence pipeline's eligibility gate — the flag that decides
whether a room's content may be harvested under disclosed terms — is an
unconstrained jsonb key with no column, no default enforcement and no index.
A typo silently reads as "not eligible" (fail-safe) but is invisible; a missing
key is indistinguishable from a deliberate `false`. A real boolean column with
`not null default false` would make the consent state auditable.

### 2.4 `kai_objects` has no visibility column
Public/private is inferred from `user_id is null` (see 1.9). That conflates
"has no owner" with "is safe to show everyone", and leaves no way to express a
room-scoped or moderator-only object — the room summaries and community
intelligence cards in community spec §5 are exactly that shape.

### 2.5 `setups` has no `timeframe`
`theses.timeframe` is `not null`, but the setup a thesis points at carries no
timeframe of its own — only `mode`. Two setups on the same symbol in the same
mode on different timeframes are indistinguishable, and `one_active_thesis`
(unique on `symbol, mode, timeframe` where active) cannot be derived from the
setup. The seed picks `'5m'` by hand.

### 2.6 `positions.origin_room_id` has no foreign key
01 §7 declares it as a bare `uuid` ("continuity chain") while
`origin_plan_id` and `origin_setup_id` are both real FKs. The CONTINUITY RULE
in community spec §4 — a position must retain its original community thread —
therefore rests on an unenforced reference: a deleted or merged room leaves a
dangling id with no error. Implemented as written (no FK).
