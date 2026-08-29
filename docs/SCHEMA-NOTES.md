# Schema notes — Cheat Code AI v1 (SCHEMA lane)

Companion to `docs/01_DATA_MODEL.md`. Two kinds of entry, written per round:

1. **Interpretations** — every place the migrations had to decide something the
   canonical doc did not state. Nothing here contradicts 01; it fills silence.
2. **Known gaps** — things 01 *does* say that the review flagged as probably
   wrong or incomplete. **These were implemented as written.** No enum value,
   column or default was invented to "fix" them. The owner decides.

Sections 1 and 2 cover the v1 slice (`0001…0016`); sections 3 and 4 cover round 2
(`0017`, `0018`); sections 5 and 6 cover round 3 (`0020`, paper execution);
sections 7 and 8 cover round 4 (`0021`, the Prototype: alerts as trade objects,
chart annotations, circles, conversation drawer). All continue the same
numbering.

Migrations live in `supabase/migrations/0001…0021`, applied in filename order.

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
**Superseded in round 2 — see 1.20:** `0017_watchlists` creates them.

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

---

## 3. Round 2 — interpretations (migrations `0017`, `0018`)

Numbering continues sections 1 and 2 so cross-references from the migration
comments stay stable. Source: `docs/BUILD-BRIEF-round-2.md` § SCHEMA-2.

### 1.20 `watchlists` / `watchlist_items` (0017)
01 §4 defines no watchlist table while 01 §13 row 1 lists "watchlist tables" as
owner-write client-direct — gap 1.8 above. Round 2 needs them, so they exist now
with exactly the brief's columns, plus:

- **`unique (user_id, name)`** — makes the default-watchlist provisioning
  idempotent (`on conflict do nothing`) and stops the UI from showing a user two
  lists it cannot tell apart. A user who wants two lists must name them.
- **Default list on `profiles` insert**, not on `auth.users` insert. Hung off
  `profiles` so any path that creates a profile (seeds, back-office, the
  `handle_new_user` chain) gets the same guarantee. 0017 also backfills existing
  profiles.
- **Symbol normalisation trigger** (`upper(btrim(...))`). `watchlist_items.symbol`
  is a real FK to `instruments(symbol)`, whose keys are upper case; a
  client-direct insert of `'meta'` would otherwise fail with an FK error the app
  cannot explain. Normalising is friendlier than a check constraint.
- **Client-direct writes are real**: `authenticated` holds
  SELECT/INSERT/UPDATE/DELETE and the owner policy is `for all`. The API's
  `/watchlist` endpoints are a convenience wrapper over the same rows, not a
  gate. `watchlist_items` has no `user_id`; its policy is an `exists` over
  `watchlists`, which is evaluated under the caller's own owner-policy on
  `watchlists` — no recursion, no security-definer helper.
- Supabase's **default privileges grant new public tables to anon/authenticated**,
  so 0017 revokes first and grants back (0014's blanket revoke ran before these
  tables existed). `anon` still ends with zero access.

### 1.21 `messages.seq` is now assigned in the database
01 §10 says "assigned by api-app in txn". The api-app has no transaction
(PostgREST), so `post_room_message` assigns it from **`room_seq_counters`** —
the same counter-table + `UPDATE … RETURNING` row-lock shape 01 §3 ⚙ specifies
for `user_events.seq`. `room_seq_counters` is worker-only (no client grant),
cascades with the room, and 0018 backfills it from existing messages.

### 1.22 Self-mute and moderator mute are different things
The brief puts the room mute on `room_members.muted_until` "on self", but 01
also uses that column as the moderation mute (`moderation_action` has `mute`).
One column cannot be both: a member unmuting their own notifications would lift
a moderator's mute. 0018 adds **`room_members.moderation_muted_until`** and
splits the meanings:

| Column | Meaning | Written by | Blocks posting? |
|---|---|---|---|
| `muted_until` | the member silenced this room's notifications for themselves | `set_room_mute` (self, client-callable) | **no** |
| `moderation_muted_until` | a moderator muted this member here | moderation surface (does not exist yet) | **yes** |

`post_room_message` gates on `banned` and `moderation_muted_until`, never on
`muted_until`. A self-muted member can still post — which is what the UI means
by "mute".

### 1.23 What `post_room_message` enforces (and what it does not)
The RPC is a floor under the API pipeline, not a replacement for it. In the
database: membership, `banned`, moderation mute, `config.posting_restricted`
(bypassed by role `moderator|educator|expert`), `config.slow_mode_s`, postable
kinds (`text|chart|voice_note|position_update` — `kai_object` belongs to
`post_kai_message`, `system` is back-office), **`position_disclosure` required
whenever `structured_idea` is present** (community spec), and `parent_id` in the
same room. Rate limiting and the spam precheck stay in the API (they need
per-process state and heuristics). The RPC also advances the author's
`last_read_seq`, so your own message is never counted in the "N new since you
left" pill.

### 1.24 `record_debrief` regenerates rather than duplicates
"Get Kai's debrief" is a button a user can press twice. 0018 adds a partial
unique index `debriefs(position_id)` and the RPC updates in place on the second
call, emitting `debrief_regenerated` instead of `debrief_recorded`. It refuses a
position that is not the caller's or is still open. 0018 also adds
**`debriefs.kai_object_id`** (01 §7 gives only `lesson_refs` + `kai_summary`, and
the API has to be able to resolve the persisted `kai_object` back).

### 1.25 `reset_paper_account` refuses with a value, not an exception
The monthly limit is a product rule the UI has to render ("you can reset again
on 1 September"), not an error. The RPC returns
`{ok:false, reason:'already_reset_this_month', next_allowed_at}` so the API never
parses an error string. Genuine programming errors (no profile, no account in
`simulate_closed_trade`) still raise. "Once per calendar month" is read as
`date_trunc('month', last_reset_at) = date_trunc('month', now())` in **UTC**, not
a rolling 30 days and not the user's timezone — worth revisiting if a user in
`America/New_York` resets late on the last evening of a month.

### 1.26 `simulate_closed_trade` and the `origin` envelopes
`origin.simulated = true` has to survive into the UI (MOBILE-B renders a
SIMULATED tag), but 01 §7 gives an `origin jsonb` only to `trade_plans`. 0018
adds `origin jsonb not null default '{}'` to **`orders`** and **`positions`**, and
the simulated fills carry `liquidity = 'simulated'`. Every `user_events` payload
the RPC writes carries `simulated:true` too. Defaults, when the caller omits
them: entry = latest `candles` 1d close for the symbol → else the newest
`setups.quote_snapshot.price` → else 100; exit = entry × 1.032; qty 10; held
2h14m. The symbol must already exist in `instruments` (`unknown_symbol`).

### 1.27 `notify`
`notify` is an unreserved keyword in PostgreSQL and works as a function name
(verified). It writes exactly one `channel='in_app'` row; push fan-out is a later
round, so the API should not expect a device delivery from it. The deep link
belongs in `payload.route` (e.g. `cheatcodeai://alert/<id>`) — `notifications`
has no route column.

### 1.28 Grant decisions — and a security fix that was not optional
The brief left this to the lane: *"execute to service_role only (and to
authenticated for `join_core_room`, `set_room_mute` if you make them SECURITY
DEFINER with auth.uid() checks — your call, document it)."*

**Decision:** `join_core_room` and `set_room_mute` are `security definer` and
granted to `authenticated`. Both start with

```sql
if auth.uid() is not null and auth.uid() <> p_user_id then
  raise exception 'forbidden' using errcode = '42501';
end if;
```

so a JWT holder may only act as itself, while `service_role` (no `auth.uid()`)
may act for any user. Joining a room and muting it are the two community actions
that must work with the app offline from the API; everything else
(`post_room_message`, `post_kai_message`, `record_debrief`,
`reset_paper_account`, `simulate_closed_trade`, `notify`,
`next_room_message_seq`) is **service_role only**, because each one either needs
the API's validation pipeline in front of it or writes financial history.

While testing that, the lane found that **the `revoke all on function … from
public` pattern used in 0016 does not actually close a function to clients.**
Supabase configures default privileges that grant `EXECUTE` on every new
function in `public` to `anon` and `authenticated`; revoking from `PUBLIC`
leaves those role grants in place. Verified on the local stack: before the fix,
a plain signed-in user could call

- `complete_onboarding(<any other user's uuid>, <any jsonb>)` — `security
  definer`, no `auth.uid()` check,
- `append_user_event(<any user's uuid>, …)` — writes into another user's outbox,
- `next_user_event_seq(<any user's uuid>)` — burns another user's event seq,
- `post_room_message(...)` — posts to a room bypassing rate limit and spam
  precheck,

through PostgREST `/rpc/`. 0018 therefore ends with a **function grant floor**: a
DO-loop that revokes `all` on every function in `public` from `public`, `anon`
and `authenticated`, then grants back exactly `is_room_member`, `join_core_room`
and `set_room_mute` to `authenticated`. Same model as 0014's table baseline. The
`rls-test` asserts `post_room_message` is not client-callable, and that a
client-direct `UPDATE` on `watchlists` still fires `set_updated_at` (trigger
functions are permission-checked when the trigger is created, not when it
fires — so tightening EXECUTE does not break triggers).

`is_room_member` must stay granted to `authenticated`: it is referenced by the
`rooms` / `room_members` / `messages` RLS policies, which are evaluated as the
querying role.

### 1.29 Error signalling convention
RPC failures `raise exception '<machine_token>'` with SQLSTATE `42501`
(not authorised / wrong state) or `22023` (invalid parameter), never a prose
sentence. PostgREST surfaces the token in `message`, so the API maps it to an
error envelope + user-facing copy in one place. Tokens are listed in the
signature header of `0018_rpcs.sql`.

### 1.30 `scripts/rls-test.mjs` extensions
Added: watchlist isolation both directions (B cannot read, insert into, delete
from or rename A's list; A can do all four to its own), the owner's
client-direct update path, `join_core_room` (works, idempotent, **refused on a
`setup` room**, refused for another user's id), "a joined member still cannot
insert into `messages` directly", `post_room_message` closed to client JWTs but
working as `service_role` with `seq = 1`, member vs non-member visibility through
`messages_public`, and self-mute. The test creates two temporary rooms
(`rls-tmp-core-*`, `rls-tmp-setup-*`) and deletes them in `finally`; it also
sweeps leftovers from a crashed run at start, because a stray temp room would
break the existing "19 core rooms" assertion.

---

## 4. Round 2 — known gaps (owner decides)

### 2.7 The function grant floor must be re-applied by later migrations
0018's DO-loop runs once. **Any migration after 0018 that creates a function in
`public` re-opens it** to `PUBLIC`/`anon`/`authenticated` via Postgres and
Supabase default privileges. Until that is fixed centrally (an `alter default
privileges … revoke` in a future migration, or a CI check), every new migration
must end with an explicit
`revoke all on function <sig> from public, anon, authenticated;` and grant only
what the client genuinely needs.

### 2.8 `moderation_muted_until` has no writer
1.22 splits the column, but there is no moderation surface in v1 — no staff role
(gap 1.11), no admin endpoint. The column exists and `post_room_message` honours
it; nothing sets it yet.

### 2.9 Simulated trades outlive their user
`positions.user_id` and `debriefs.user_id` are bare `uuid` columns in 01 §7 with
no FK (only `trade_plans`, `orders`, `alerts` … cascade). Deleting an auth user
therefore leaves the rows `simulate_closed_trade` created — plan/orders/fills
cascade, position and debrief do not. Same family as gap 1.2 (delete policy) and
not resolved here: adding the FK is a data-model decision, and account deletion
is still not in the v1 surface.

### 2.10 `rooms.config` still carries behaviour in unconstrained jsonb
`post_room_message` now reads `config.posting_restricted` and `config.slow_mode_s`
alongside `config.intel_eligible` (gap 2.3). Three behavioural switches, no
column, no default, no type check: a typo silently reads as "off". They should
become real columns when the moderation surface lands.

### 2.11 `watchlists.position` is not enforced unique or contiguous
The brief's `position int` orders a user's lists. Nothing stops two lists sharing
a position or a gap appearing after a delete; the client is expected to sort by
`(position, created_at)`. Fine while every user has exactly one list.

---

## 5. Round 3 — interpretations (migration `0020_paper_execution.sql`)

Round 3 is the paper-execution arc: `create_plan`, `plan_action`,
`submit_paper_order`, `apply_paper_tick`, `close_position_prepare` and the
`daily_risk_v` view. The dividing line the whole migration is built on: **the
API owns the fill model, the database owns atomicity.** Nothing in SQL decides
what a fill price should be, how big a position should be, or whether a quote is
fresh enough — those are API/round-3-brief concerns. SQL decides that an order
transition, its `order_events` row, its `fills` row, the position mutation, the
account mutation and the `user_events` outbox rows either all happen or none do.

### 1.31 `create_plan` validates orientation and computes nothing else
01 §7 gives `trade_plans` columns but no rules. The brief asks for exactly one
validation: side/entry/stop/targets orientation. Implemented as

- `intent = 'buy_to_open'` (long) → `stop < entry`, and every target `> entry`
- `intent = 'sell_short'`  (short) → `stop > entry`, and every target `< entry`

`intent` is restricted to those two values (`plan_intent_invalid`): a plan
describes how a position is **opened**; a close is an order, not a plan.
`entry` is read from `p_patch.entry`, falling back to
`p_patch.entry_condition.level`; `stop` is **required** (there is no plan without
an invalidation level), `targets` are **optional** but validated when present —
a "run it until it breaks" plan is legal, an upside-down one is not.
`targets` accept either `[110, 120]` or `[{label, level}]` and are always stored
normalised as `[{label, level}]`.
`size` and `scenarios` are stored verbatim from the patch: the risk maths lives
in the API/`packages/shared` so the client and server agree on it, exactly as
`complete_onboarding` (1.x) already does for the onboarding maths.
`mode` comes from the patch and is immutable thereafter — the 0013 trigger
already enforces that; 0020 adds nothing.

### 1.32 The plan state machine, and what `activate` means
`plan_status` (0001) is `draft, planned, active, exiting, closed, cancelled,
invalidated`. The brief names the path `draft → planned → active → exiting →
closed` and says "cancel from draft/planned only; invalidated terminal".
Split between the two writers:

- **`plan_action` (user intent)** — `activate` moves `draft → planned` only
  (idempotent when already `planned`), `cancel` moves `draft|planned →
  cancelled` and cancels every still-working order of the plan.
- **`paper_apply_fill` (market reality)** — an entry fill moves the plan to
  `active`, a partial close to `exiting`, a full close to `closed`. A plan never
  becomes `active` because a human pressed a button; it becomes active because
  shares changed hands.

`closed`, `cancelled` and `invalidated` refuse **every** action
(`plan_state_invalid`), which is how "invalidated is terminal" is enforced.
Nothing in 0020 writes `invalidated` — that is the scanner's transition
(03 Unit 2) and has no writer in v1.

### 1.33 `orders.exec_meta` — a new envelope, not an overloaded one
The paper driver needs per-order state that 01 §7 has no column for: is this
order resting, which `exit_style` governs this leg, what bracket is parked
waiting for the entry to fill, has an `alert_assisted` leg been triggered, which
quote was last seen, why was it cancelled. `preview` is the preview contract the
client renders and `origin` is provenance (1.26), so neither was overloaded.
`orders.exec_meta jsonb not null default '{}'` carries
`{resting, exit_style, bracket, level, triggered, triggered_at, trigger_price,
last_quote, cancel_reason, cancelled_at, close_of_position_id, driver}`.
The brief's "mark the leg `triggered` in payload" is
`exec_meta.triggered = true` plus an `order_events` row with
`payload.event = 'leg_triggered'`.

### 1.34 `submit_paper_order` idempotency is decided before anything is written
Two ways a resubmit is caught, both returning `{deduplicated:true, order}` with
zero writes:

1. `p_idempotency_key` already belongs to a **different** order row → that row is
   returned (someone replayed with a key that was already spent).
2. the target order has already moved past `previewed` → it is returned as-is.

Only `draft` and `previewed` orders are submittable. If the caller passes a key
that differs from the one already on the row, the row's key is updated first so
the *next* replay dedups on rule 1. The API's `IDEMPOTENT_REPLAY` envelope maps
straight onto `deduplicated`.

### 1.35 Position matching, the open-position key, and `positions.status`
Matching is on `side` (position_effect) exactly as 01 §7 requires — never
inferred from a bare buy/sell:

| side | direction | effect |
|---|---|---|
| `buy_to_open` | long | opens, or adds with a weighted-average `avg_cost` |
| `sell_to_close` | long | reduces; `realized_pnl += (price − avg_cost) × qty` |
| `sell_short` | short | opens/adds short |
| `buy_to_cover` | short | reduces; `realized_pnl += (avg_cost − price) × qty` |

Closing more than the position holds raises `position_insufficient_qty` rather
than clamping — a paper account that silently absorbs an over-close teaches the
wrong thing. `qty` reaching zero sets `closed_at`.

A partial unique index `positions_open_uniq (account_id, symbol,
coalesce(occ_symbol,''), direction) where closed_at is null` makes
"one open position per instrument per direction" a database fact, so the upsert
key in the brief cannot be violated by a concurrent tick and a submit.
`occ_symbol` is in the key so a v1.1 option position and its underlying never
collide.

`positions.status` is a **generated stored column**
(`case when closed_at is null then 'open' else 'closed' end`) rather than a
maintained one. The brief offered the choice; generated wins because `closed_at`
is already the source of truth and a maintained copy can drift. The
`check (status in ('open','closed'))` from the brief is still written out. The
client filters `?status=eq.open` exactly as it would on a plain column; it just
cannot be written.

### 1.36 The paper fill model that lives in SQL
The API computes market-order fill prices. Two fill decisions unavoidably live in
`apply_paper_tick`, because only the tick knows the crossing:

- **Resting entry limits** fill at **their own limit price**, never better.
  Price improvement is not simulated: the data is delayed (Polygon entitlement),
  and a paper engine that hands out improvement on a 60-second-old print is
  lying in the user's favour. Crossing is `limit ≥ price` for a buy,
  `limit ≤ price` for a sell, per the brief.
- **Stop and target legs** fill at the level, *or at the tick price when the
  print gapped through it*. Written as
  `stop:   sell → least(level, price)   / buy → greatest(level, price)`
  `target: sell → greatest(level, price) / buy → least(level, price)`
  i.e. the protective leg eats the gap and the target leg keeps it. With a
  single delayed print these both reduce to "fill at the tick price", which is
  the honest answer; the formula is written out so it stays correct if a future
  caller passes a level that has only just been touched.

`fills.liquidity = 'paper'` on everything this migration writes (0018 uses
`'simulated'` for the dev-tool trade; the two are deliberately distinguishable).

### 1.37 Child-row delete rules
0007 left every execution-history FK at `NO ACTION`, so deleting an `auth.users`
row cascaded `profiles → orders / trade_plans` and then **failed** on the
`fills`, `order_events`, `plan_events`, `orders.plan_id` and
`positions.origin_plan_id` rows pointing at them. `scripts/rls-test.mjs` now
creates real orders and positions, so the teardown path exposed it. 0020 sets:

- `fills.order_id`, `order_events.order_id`, `plan_events.plan_id`,
  `orders.parent_order_id` → **cascade** (a history row or bracket leg whose
  parent no longer exists is unreachable garbage)
- `orders.plan_id`, `positions.origin_plan_id`, `debriefs.plan_id` → **set null**
  (an order or position can legitimately outlive its plan)
- `debriefs.position_id` → **cascade**

Referential actions run as the table owner with the privilege check skipped, so
the append-only `revoke update, delete … from service_role` (1.14) does not block
them and the append-only guarantee for *clients and service paths* is unchanged.

### 1.38 `apply_paper_tick` ordering, and why marks are not outbox events
One user, one symbol, one transaction, in this order:

1. resting entry limits that crossed,
2. stop/target legs that crossed — over a **snapshot of the leg ids taken before
   step 1**, so a bracket raised by an entry filling on this very tick cannot
   also fire on it,
3. mark every open position (`mark_price`, `mark_ts`, `unrealized_pnl`) and
   recompute the account.

Marking writes **no `user_events` row**. Everything else in the paper path does
(order transitions, fills, position opens/reduces/closes, leg cancels, leg
triggers), but the tick runs every 60 seconds against every symbol with an open
position: a mark event per position per minute would bury the replay backbone
(01 §3) under noise it can already read off `positions`. The brief's
"all with order_events/user_events" is honoured for every *transition*; a
mark is not a transition.

`exit_style = 'auto'` legs execute; `alert_assisted` legs only set
`exec_meta.triggered` and land in `needs_attention[]`, and the API turns that
into the Attention alert + notification. A triggered `alert_assisted` leg is
never re-flagged on later ticks. An `auto` leg that finds no open position left
(closed by something else) cancels itself instead of filling.

### 1.39 `daily_risk_v`
`security_invoker = true`, so it needs no `auth.uid()` predicate of its own:
`risk_policies` and `positions` are already owner-select under RLS (0014), a
client JWT therefore sees exactly one row, and `service_role` (BYPASSRLS) sees
every user. `anon` is revoked explicitly.

- `day` = today in **America/New_York** (the market's day, not the server's).
- `realized_loss` = `Σ greatest(0, −realized_pnl)` over positions **closed
  today**. Only losing trades count: a daily *loss* cap that a morning winner
  could refill is not a loss cap.
- `open_risk` = `Σ qty × |avg_cost − stop|` over positions still open that were
  **opened today** and carry a stop.
- `used` = `realized_loss + open_risk`; `cap` = `risk_policies.daily_loss_cap_usd`.

### 1.40 The close flow contract
`close_position_prepare` is **read-only**. It returns the opposite-side order
draft (`side` = `sell_to_close` for a long, `buy_to_cover` for a short, plus qty,
symbol, account, plan, marks, levels) together with the position's resting legs,
and a `close_of_position_id`. The API previews and submits that order, passing
`p_fill.close_of_position_id`; `submit_paper_order` then cancels those resting
legs **inside the same transaction, before the closing fill**, so an automatic
stop can never act on shares a manual exit is already closing. A full close also
cancels any remaining legs on its own, so the two mechanisms are idempotent with
each other.

### 1.41 The paper account model
Paper only, v1: `cash −= price × qty` on `buy_to_open`/`buy_to_cover`,
`cash += price × qty` on `sell_to_close`/`sell_short`; `buying_power = cash`
(per the brief — no margin, no shorting requirement); `equity = cash +
Σ (long: +1 / short: −1) × qty × coalesce(mark_price, avg_cost)`. A short's
proceeds are in cash and its liability is the negative term, so equity is
correct on both sides. Equity is recomputed on every fill and every mark.

### 1.42 `scripts/rls-test.mjs` — round 3, and a stale round-2 assertion
Added: `create_plan` + `submit_paper_order` (as `service_role`) really open a
position for each of A and B; A and B each see exactly their own
`trade_plans` / `orders` (entry + 2 bracket legs) / `positions` / `fills`, and
**zero** rows of the other's `trade_plans`, `orders`, `positions`,
`order_events`, `fills`, `plan_events` even when asked for by id; a client can
insert into neither `orders` nor `positions` and cannot PATCH its own
`realized_pnl`; `create_plan`, `plan_action`, `submit_paper_order`,
`apply_paper_tick`, `close_position_prepare` and the internal
`paper_apply_fill` / `paper_recompute_account` are all closed to a client JWT
while A's order stays untouched; `daily_risk_v` returns exactly one row (the
caller's own) with `open_risk` arithmetically checked, nothing for another user,
and nothing at all for `anon`.

Two fixes to existing assertions, both stale since `0019` consolidated the
community to three rooms: the seed room is now `day-trade` (was
`dt-beginner-questions`) and the core-room count is **3** (was 19). The test was
failing before this round for that reason alone.

Teardown deletes each user's `positions` and `debriefs` explicitly before the
`auth.users` delete, because those two tables still carry no FK to `profiles`
(gap 2.9) while everything else now cascades (1.37).

`scripts/paper-exec-smoke.sql` is the psql end-to-end proof, run inside a
transaction that is rolled back: long plan → market buy with bracket → tick hits
the target → position closed with the arithmetically expected realized P/L;
the short mirror; a resting limit that only fills once the tick crosses it;
`alert_assisted` legs that flag instead of exiting; `close_position_prepare` →
close with leg cancellation; `plan_action adjust_stop`/`adjust_target`
repricing the live legs and the position; three refused orientation cases; a
partial fill; the outbox; and `daily_risk_v`.

---

## 6. Round 3 — known gaps (owner decides)

### 2.12 `exit_style` is copied onto the leg, not enforced against the plan
Each bracket leg carries its own `exec_meta.exit_style`, seeded from
`p_fill.bracket.exit_style` (which the API takes from the plan).
`plan_action set_exit_style` rewrites the live legs, but nothing stops the API
submitting a bracket whose `exit_style` disagrees with
`trade_plans.exit_style`, and a bracket with no plan behind it has no plan to
disagree with. 03 Unit 4 also says a live connection without native bracket
support **forces** `alert_assisted`; there is no live driver in v1, so nothing
forces anything yet.

### 2.13 `apply_paper_tick` is per user **and** per symbol
The signature the brief fixes is `(p_user_id, p_symbol, p_quote)`, so a tick that
should evaluate every user holding every symbol is N×M calls fanned out by the
API, each its own transaction. Consequences: no cross-symbol atomicity (a
portfolio-level rule could see a half-applied tick), and the per-call overhead
grows linearly with users. Fine at v1 volume behind a 60-second interval;
a `apply_paper_tick_batch(jsonb)` taking `{symbol: quote}` for all users at once
is the obvious next step if it stops being fine.

### 2.14 "Today's realized losses" counts only losing trades
`daily_risk_v.realized_loss` sums `greatest(0, −realized_pnl)`, so a +$300
winner does not refill a cap spent by a −$200 loser. That is the reading that
makes a *loss* cap mean something, but the brief says only "today's realized
losses" and a net-P/L reading is defensible. One `sum()` to change.

### 2.15 `open_risk` only counts positions opened **today**
The brief's view spec says `qty × |avg_cost − stop|`; its narrative says "on
today's positions". Implemented as today's, because the alternative makes a
swing position held for three weeks with a 10% stop permanently occupy a
day-mode daily cap and block every preview. The consequence is real and should
be named: **risk carried overnight is invisible to `daily_risk_v`.** A separate
`open_risk_total` column, or a mode-aware cap, is the honest fix.

### 2.16 `order_status` has no `triggered` value
An `alert_assisted` stop that has been hit is still `accepted` at the database
level; "triggered" lives in `exec_meta.triggered`. Adding an enum value is a
migration the round-2 rule ("no enum migrations ever", 03 Unit 2) argues
against, and every consumer would have to learn it. The cost is that
`?status=eq.triggered` does not exist — clients must read `exec_meta`.

### 2.17 A partial fill leaves the remainder with no re-fill path
`submit_paper_order` with `partial:true` sets `partially_filled` and leaves
`qty − filled_qty` working, exactly as 03 Unit 4 requires ("accepted ≠ filled
everywhere"). But `apply_paper_tick` only re-fills **limit** orders, so the
remainder of a partially filled *market* order never completes on its own.
Either the API tops it up with a second `paper_apply_fill`-shaped call, or the
tick learns to complete working market orders. Nothing does it today.

### 2.18 No market-hours or session gate anywhere in SQL
03 Unit 4 says "regular hours only; queued market orders → opening-auction fills
with gap-risk narration". `market_sessions` exists (0004) and neither
`submit_paper_order` nor `apply_paper_tick` consults it: a fill at 3am is
accepted without comment. The gate is assumed to live in the API's preview
pipeline (`MARKET_CLOSED`), which means the RPCs are only as safe as their
caller.

### 2.19 Fees, slippage and shortability are all zero/absent
Paper fees are $0 by the round-3 brief, slippage is the API's business, and a
short is always locatable. 03 Unit 4 calls the last one "a labelled simulation
difference"; there is no column carrying that label, so the honesty has to be
copy in the client.

### 2.20 `positions.user_id` / `debriefs.user_id` still have no FK
Gap 2.9 stands. 1.37 fixed everything that *does* have an FK, which makes the
absence more visible: deleting an `auth.users` row now cleanly removes plans,
orders, events and fills and leaves the positions and debriefs behind as
orphans. `scripts/rls-test.mjs` deletes them by hand. Adding
`references profiles on delete cascade` is a one-line migration whenever the
owner decides account deletion is a real surface.

### 2.21 `buying_power = cash` understates nothing but models nothing
No margin, no short-sale proceeds restriction, no PDT counter. A user can short
$50k of stock in a $10k paper account and the only thing that notices is
`equity`. The risk policy (`max_position_pct`, `max_open_positions`) is enforced
in the API's preview, not here, so an RPC caller that skips preview skips the
limits too.

---

## 7. Round 4 — interpretations (migration `0021_prototype_round4.sql`)

Round 4 implements `docs/BUILD-BRIEF-round-4.md` "SCHEMA-4" against
`docs/10_ALERTS_TRADE_PORTAL_SPEC_extracted.md` (§3 card content, §4 grade and
scorecard, §6 route context, §7 portal, §9 data contracts). The migration's
header block is the signature contract the API lane reads; this section is the
reasoning behind it.

### 1.43 Company profiles live in `instruments.meta.profile`, not in columns
01 §4 gives `instruments` a `meta jsonb` and no profile fields. The ticker page
(Overview: company summary, market cap, next earnings, P/E, sector) and the
alert card's two-sentence company summary need six of them. They went into
`meta` rather than into six new columns because the object is a **cache of a
third-party reference endpoint** (Polygon `/v3/reference/tickers/{sym}`),
refreshed wholesale on a weekly cadence; none of it is ever a filter, a join key
or a sort key; and the upstream payload gains fields faster than a migration
can. The shape is fixed and documented so the API and the client agree:

```
instruments.meta = { "profile": {
  "description":   text,          -- <= 2 sentences (spec §3)
  "sector":        text,
  "industry":      text|null,
  "market_cap":    number|null,   -- USD, approximate
  "next_earnings": "YYYY-MM-DD"|null,
  "pe":            number|null,
  "employees":     number|null,
  "homepage":      text|null,
  "source":        "seed"|"polygon",
  "as_of":         timestamptz
}}
```

`instruments.name` stays the canonical display name; `description` never repeats
it. `source` is always present, so a client can tell an approximate seed profile
from a refreshed one without a second lookup. The column carries a `comment on
column` saying the same thing, so `\d+ instruments` is enough.

### 1.44 Circles are **discoverable** rooms; the thread is still members-only
0014 let an authenticated user select a room only when `type = 'core'` or they
were a member (1.10). The Community board (brief §8) shows the circles row —
"META · 2d left", "NVDA · 4d left", member counts — *before* anyone joins, so
the policy now also admits `type = 'setup' and expires_at is not null`. Two
consequences worth stating plainly:

- a setup room **with a clock** is a public directory entry (id, name,
  description, member count, expiry) for every signed-in user;
- a setup room **without** a clock keeps the round-2 behaviour (members only),
  which is why `scripts/rls-test.mjs`'s temp setup room still behaves as it did.

`messages` is untouched: reading the thread still requires membership through
`is_room_member()`, and `messages_public` inherits that. A non-member sees that
a circle exists and what it is about; they do not see what was said in it.

### 1.45 `chart_annotations.user_id` is the **owner**, not the author
The brief's table sketch says "user_id nullable (Kai = null)" and its SCHEMA-4
line says the column is "the *owner* even for Kai-provenance rows — document the
choice". The second reading was implemented, and the column is `not null`:

- annotations are drawn **into one user's workspace**, from that user's alert,
  plan or Kai turn. A nullable owner would make every Kai level either globally
  visible or globally invisible, and neither matches "Kai marked the trigger,
  entry area, stop and first target on *the chart you opened*" (spec §6);
- the user may hide or delete any annotation on their chart (spec §7:
  "the user can inspect/hide/delete"). With a null owner, "hidden by A but not
  by B" needs a second per-user table for what is one boolean;
- **authorship is `provenance`** (`kai | user | community | plan`), which is what
  the UI actually labels ("Kai marked this"), and it is a separate axis from
  scope.

So: `(user_id = A, provenance = 'kai')` is a Kai level on A's chart, and A is the
only person who can see it. RLS is then a plain `user_id = auth.uid()` — no
`or user_id is null` clause that would have leaked one user's Kai levels to
everyone.

### 1.46 A client may change one column of one row: `chart_annotations.status`
Two locks, because one of them is a grant and grants are easy to widen by
accident later:

1. **Column-level grant** — `grant update (status) on chart_annotations to
   authenticated`. A PATCH that names any other column is refused by PostgreSQL
   before RLS is consulted.
2. **Trigger** `chart_annotations_client_update_guard` — for
   `current_user in ('authenticated','anon')` it refuses a status that is not
   `hidden` or `deleted` (a client may not resurrect a level to `valid`, or mark
   one `invalidated` — that is a market fact, not a preference), and it compares
   `to_jsonb(new) - 'status' - 'updated_at'` with the same slice of `old` to
   refuse anything smuggled alongside. `current_user` is the role PostgREST
   `SET ROLE`s into, so `service_role` and the migration owner pass straight
   through.

The RLS policy's `with check (user_id = auth.uid() and status in
('hidden','deleted'))` says the same thing a third time. Deletion is soft
(`status = 'deleted'`) so the "Kai drew this, and why" audit survives the user
tidying their chart.

### 1.47 `alerts` became a trade object: `lifecycle_state`, a generated `tab`, and history
Spec §9 says an alert card carries "identity, company_summary, mode, direction,
grade, score, score_components, state, event, thesis, quote, trade_plan, fit,
community, timestamps". 0008's `alerts` carried a monitoring condition and a
delivery channel list. What was added, and why each one is a column rather than
a join:

- `symbol`, `mode`, `direction`, `instrument_kind` — the card's identity row.
  This also closes gap **2.2** (`alerts` had no `mode`).
- `setup_id`, `plan_id`, `position_id` — the execution references spec §6 needs
  restored when the card routes into the Trade Portal.
- `trade_plan jsonb`, `thesis_snapshot jsonb`, `event jsonb`,
  `chart_context jsonb` — a **Watching** card is "a complete trade idea,
  including preliminary entry, stop, targets and expiration" *before* any
  `trade_plans` row exists, and History must render the card as it was even
  after the setup expired. Joining to a live setup would rewrite history; these
  are the snapshots that stop it.
- `grade_snapshot`, `score_snapshot`, `version` — "a later grade change creates
  a new version rather than rewriting history" (spec §9).
- `state_changed_at`, `last_evaluated_at` — the monitoring line ("last
  evaluation") and sort orders.

`lifecycle_state text` is **not** `alerts.status`. `status` is an enum
(`draft|active|triggered|paused|expired|cancelled`) owned by the alert engine,
and 03 Unit 2's "no enum migrations" rule stands; `lifecycle_state` is the card
state machine from spec §9 (`watching | active | planned | order_pending |
position_active | invalidated | closed | expired | dismissed | cancelled |
missed`), constrained by a `check`, which is a one-line change when the machine
grows.

`tab` is a **stored generated column** over `lifecycle_state`
(`watching → watching`; `active|planned|order_pending|position_active → active`;
everything else → `history`). The brief offered "a derived view or API-side";
a generated column beats both — PostgREST filters and indexes it
(`?tab=eq.active`), it cannot drift from `lifecycle_state`, and no two consumers
can disagree about what "History" means.

`alert_events` is the append-only timeline (spec §9 "Event history: state
transition, timestamp, source, data snapshot and user/Kai action"): one row per
transition or grade version, `unique (alert_id, seq)` with the seq assigned by a
BEFORE-INSERT trigger under a `for update` lock on the parent alert (the same
shape as `user_events_assign_seq`, so the API does not have to pass a number and
two writers cannot claim one). `update`/`delete` are revoked from
`service_role` too, exactly like the other append-only tables (1.14).

### 1.48 `conversations`: pinned + recency in the database, titles still API writes
`title` already existed (0011). Added: `pinned boolean not null default false`
and `last_message_at timestamptz`.

- `last_message_at` is maintained by an AFTER INSERT trigger on
  `conversation_messages`, not by the writer. Every path that appends a turn
  (streamed Kai reply, morning briefing, portal panel) gets correct recency for
  free, and none of them can forget.
- The drawer's exact order is one index:
  `(user_id, pinned desc, coalesce(last_message_at, created_at) desc)`.
- "Search conversations" is `?title=ilike.*meta*`. A leading wildcard cannot use
  a b-tree, so `pg_trgm` is enabled (in the `extensions` schema, like `vector`)
  and the index is
  `gin (title extensions.gin_trgm_ops)`.
- **No client UPDATE grant was added.** 01 §13 row 7 makes `conversations`
  owner-select, api-app-write, and round 4's pin/rename is a
  `PATCH /kai/conversations/:id` in the API-4 contract. Granting the client
  `update (title, pinned)` would have been convenient and is the obvious future
  change; it is not this round's, because the same grant is what an auto-title
  worker and a future sharing flow would have to reason about.
  `scripts/rls-test.mjs` asserts the closed behaviour, so widening it is a
  visible decision rather than a silent drift.

### 1.49 Circles: three functions, one clock, no deletion
`rooms.expires_at` is the clock; `rooms.config.posting_restricted` is the close.
Nothing is deleted when a circle ends, because History has to stay readable.

- `open_setup_circle(p_setup_id, p_ttl default '3 days')` is idempotent, and the
  guarantee is a **unique partial index on `rooms(setup_id)`**, not a polite
  caller: the insert carries `on conflict (setup_id) … do nothing` and re-reads
  on a lost race. The name is `'<SYM> ' || initcap(pattern)` where the pattern is
  looked for in `setups.annotations->>'pattern'`, then `catalyst`,
  `score_components`, `entry_condition`, falling back to `'<SYM> Setup'` — the
  brief's "<pattern-or-'setup'>". It seeds `room_seq_counters` (so the first
  post does not have to) and back-fills `setups.discussion_room_id`.
- `create_circle(p_user_id, p_symbol, p_ttl)` inserts the creator as a
  `moderator` member and writes a `user_events` row. The `circles_create`
  entitlement is **not** checked here: the database creates, the API gates
  (the same split as every other premium surface).
- `close_expired_circles()` sets `config.posting_restricted = true` (which
  `post_room_message` already honours for non-moderators, 1.23) plus
  `config.closed_at`, and returns **only the ids it actually flipped**, so the
  API tick can narrate each closure exactly once.

All three are `service_role` only.

### 1.50 `rule_adherence_v` reads both receipt shapes, and has no row for no sessions
Account shows "You've followed your rules N of the last M sessions". A session is
a debrief; `followed` means the process receipt exists and every item on it is
ok. `record_debrief` (0018) is called with
`p_process_review = {payload: {…}, process_receipt: [{label, ok, detail_plain}]}`
and the API's fallback path writes the same shape, so the view reads
`process_review->'process_receipt'` and falls back to
`process_review->'payload'->'process_receipt'`. Items carrying
`{"status":"ok"}` instead of `{"ok":true}` are accepted, and the whole predicate
is `coalesce(…, false)` with a `jsonb_typeof` guard — no cast that can throw on a
stray value, and a receipt item with neither key counts as *not* ok rather than
disappearing into a NULL predicate (it did, in the first draft; the rls-test
caught it).

The view is `security_invoker` over `debriefs` (owner-select), so a client JWT
sees exactly its own row and `service_role` sees everyone. It **inlines** the
receipt test instead of calling a helper function on purpose: the function grant
floor (2.7) would revoke EXECUTE from `authenticated` and make the view
unreadable to the client that needs it. A user with no debriefs has **no row**
— the API renders `{sessions: 0, followed: 0}` — which is also why the brief's
"show only when ≥ 3 sessions exist" is a client rule and not a filter here.

### 1.51 Seed additions
`supabase/seed.sql` gained three things, in the round-4 lane's scope:

- a `meta.profile` for all ten seed instruments (1.43), every one stamped
  `source: 'seed'` and `as_of: now()` by a single follow-up statement so no row
  can forget its provenance;
- the two circles the prototype's Community board shows, opened through
  `open_setup_circle(...)` with a 3-day TTL rather than by direct insert — the
  seed and the API therefore take the identical path (name, slug, counters,
  `discussion_room_id` back-fill). The META and NVDA seed setups get
  `annotations.pattern = 'breakout'` so the rooms read **META Breakout** /
  **NVDA Breakout** as the board does, instead of "META Setup";
- `entitlement_flags` rows for `circles_create` (`free` false, `premium` true).
  Strictly this is outside the brief's "instruments.meta + circles seed only",
  but the "+ Create circle" sheet is gated on a flag that no other lane owns a
  file to seed, and a missing flag reads as "denied" in a way nobody could
  debug. Called out here rather than done quietly.

### 1.52 `scripts/rls-test.mjs` — round 4
124 assertions, all green against a clean `supabase db reset`. New coverage:

- **annotations** — A sees exactly its own row *including* the Kai-provenance one
  (1.45); B sees none of A's and vice versa; a client INSERT is refused; A can
  set `hidden` and `deleted` on its own row but cannot set `valid`, cannot
  rewrite `price`, and cannot smuggle `reason` in beside `status`; B cannot
  touch A's row; the geometry and reason survive every attempt.
- **circles** — the two seeded circles are visible to a **non-member**, while the
  thread is not; `open_setup_circle` on the AMD seed setup produces the
  `'AMD Setup'` fallback name and is idempotent without extending the clock;
  `create_circle` upper-cases the symbol, names it `'MSFT Circle'`, makes the
  creator a moderator and refuses an unknown symbol; `close_expired_circles`
  restricts posting and reports the id once only; none of the three is callable
  with a client JWT.
- **conversations** — title/pin are owner-visible, the ilike search never crosses
  users, a client PATCH of the title is refused, and the `last_message_at`
  trigger fires on an inserted turn.
- **alerts** — a graded alert lands in `tab = 'active'` with its snapshot and
  version, a closed one in `history`, a client cannot move the state machine,
  `alert_events` numbers itself per alert and is append-only for `service_role`.
- **rule_adherence_v** — 2 sessions / 1 followed across both receipt shapes, no
  row for the other user, nothing for `anon`.

Teardown nulls `setups.discussion_room_id` before dropping the circles it
opened (the FK is deferrable but not `on delete`), and the entitlement-flag
count assertion moved 12 → 14 (1.51).

---

## 8. Round 4 — known gaps (owner decides)

### 2.22 A circle's existence is public to every signed-in user
1.44 is a deliberate privacy trade: name, description, member count and expiry of
every time-boxed setup room are readable by any authenticated user, member or
not. That is what a discoverable circles row means, and it is fine while circles
are opened by the setup lifecycle or by a premium member for a public ticker. It
stops being fine the moment a circle can be private or invite-only — there is no
`rooms.visibility` column, so "private circle" has no representation today.

### 2.23 `close_expired_circles()` closes on the clock only
The brief says circles are "closable by the setup's lifecycle". Nothing in SQL
closes a circle because its setup was invalidated or expired — only
`expires_at <= now()` does. An invalidated A-grade setup keeps a live circle
until its TTL runs out. The fix is either a second predicate in the function
(join `setups` and close on `state in ('invalidated','expired')`) or an API
decision to shorten `expires_at` on invalidation; neither was invented here.

### 2.24 `open_setup_circle` never extends the clock and never re-opens
A second call returns the existing room **unchanged**, even when the caller
passes a longer TTL and even when the circle is already closed. That is the safe
reading of "idempotent" (a retry cannot silently resurrect a closed room or hand
a setup a fresh 7 days), but it also means there is **no supported way to extend
a circle** — the API would have to `update rooms` directly, which no RPC
sanctions. If "extend by 24h" becomes a product action it needs its own function.

### 2.25 `alerts.lifecycle_state` is a `check`, not a state machine
Any `service_role` writer can move an alert from `closed` straight back to
`watching`, or to `position_active` with no position attached. Spec §9's
transition table is enforced in the API, not here — unlike `trade_plans`, whose
transitions live in `plan_action` (1.32). The reason is that the alert engine's
transitions are driven by market evaluation the database cannot see; the cost is
that `alert_events` can record a history the state machine forbids. An
`alert_action(p_user_id, p_alert_id, p_action, p_payload)` RPC in the shape of
`plan_action` is the obvious symmetry whenever the owner wants it.

### 2.26 `alert_events` has no writer function, so the transaction boundary is the API's
The API inserts the event row and updates `alerts` as two PostgREST calls. A
crash between them leaves an alert whose `lifecycle_state` and `version`
disagree with its history — exactly the split that `create_plan`/`plan_action`
exist to prevent for plans. Acceptable while the alert engine is a single
serialized tick; not acceptable once two writers (tick and user action) can race.

### 2.27 `rule_adherence_v` is all-time, not "the last M sessions"
The Account line reads "the last M sessions"; the view returns every debrief the
user has ever written. A 40-session user with a bad week still shows their
lifetime ratio. A windowed version needs either a parameter (a function, which
then collides with the grant floor — see 1.50) or a fixed window baked into the
view (`created_at > now() - interval '90 days'`, or a `row_number()` cut at 20).
Left all-time because inventing the window silently would have been worse.

### 2.28 The seeded company profiles are approximations, not market data
Market caps, P/Es and next-earnings dates in `supabase/seed.sql` are plausible
round numbers for a local database, stamped `source: 'seed'`. They are not
sourced from a data vendor and must not be shown as though they were —
API-4's weekly Polygon refresh replaces the whole object with
`source: 'polygon'`, and any client copy that quotes a number should key off
that field. Nothing in the schema *stops* a seed profile being rendered as fact.

### 2.29 `chart_annotations` validates its vocabulary, not its geometry
`kind`, `provenance` and `status` are constrained; `price`, `price2`, `ts_from`
and `ts_to` are not. Nothing requires a price on a `trigger`, forbids
`price2 < price` on a zone, checks that a `target` sits on the correct side of an
`entry` for the direction, or caps how many annotations one chart may carry. A
buggy Kai turn can therefore draw an impossible level, and the client has to
render whatever it is handed.

### 2.30 `chart_annotations.kind` grew three SHAPES alongside its eight meanings
LIVE-1 added `trendline`, `box` and `vertical` to the check constraint
(`0022_live1_annotation_kinds.sql`) so Kai can mark things a horizontal line
cannot say. The column now mixes two vocabularies: eight values that say what a
level MEANS (trigger, entry, stop, …) and three that say what SHAPE to draw. The
chart derives the shape from `kind` plus which coordinates are present, so
nothing has to send a shape name twice — but the column no longer answers one
question, and a future reader looking for "the semantic" has to know that
`trendline` is not one. `annotations.ts` maps all three to the neutral `level`
semantic on the wire, which keeps the client's colour mapping honest.

The widening is additive: the constraint is replaced by a superset, no existing
row changes, and nothing legal before is illegal now. Gap 2.29 is untouched —
geometry is still unvalidated, so a `box` with no time range or a `trendline`
with a single anchor is still storable, and the renderer still has to cope with
whatever it is handed.

## 0023 — live shows (LIVE-2)

`live_shows` · `live_segments` · `live_frames` · `live_requests`, plus the
`live-audio` storage bucket. Contract in `packages/shared/live.ts`, operations in
`docs/16_LIVE_SHOW_OPS.md`.

Decisions worth knowing, and the reason for each:

- **`live_frames.payload` is the whole frame, stored verbatim, not normalised.**
  The four frame kinds share almost no fields, the client parses the union
  anyway, and adding an overlay kind would otherwise mean a migration for
  something that is purely presentational. The columns that ARE broken out are
  exactly the ones queried: show, segment, seq, kind, offset.
- **`unique (show_id, seq)` is the idempotency key.** A frame that arrives twice
  — broadcast and table, a retried write, a resumed director — is the same frame.
  `seq` is assigned in one place in the worker and only after a successful write,
  which is what makes it gap-free.
- **`unique (show_id, symbol)` on `live_segments`** puts the router's no-repeat
  rule in the database rather than only in the process that happens to be
  running. Cohost bridges therefore take a symbol of their own (`BRIDGE-n`).
- **`unique (mode) where status = 'live'`** — one show on air per mode. Two would
  mean two directors interleaving frames into one audience.
- **`cost_usd` is on the SEGMENT, not the show**, because the budget cap is
  enforced one segment ahead: the director has to answer "can I afford the next
  one" before it makes it.
- **`live_shows.meta.health`** carries the worker's own state (spend, last error,
  heartbeat). Buffer depth is deliberately NOT read from there by the API — it is
  derived from the segment rows, so a wedged director cannot report a buffer it
  does not have.
- **`live_can_watch_market()`** is a security-definer predicate used by three
  policies. `subscriptions` is itself RLS'd to its owner, and making that
  dependency implicit across three tables is how a policy quietly starts
  returning false for everyone.
- **The `live-audio` bucket is PUBLIC READ.** The audio is a broadcast: the same
  file is played to everyone in the app and streamed to YouTube by a headless
  browser with no session. A signed URL per listener per line would be a
  per-viewer secret protecting something being said out loud. The paywall is on
  the FRAMES — without the timeline, a URL to a wav of one sentence is not a show.
- **A show's annotations belong to a stage account.** `chart_annotations.user_id`
  is NOT NULL and is the OWNER rather than the author (1.45 / 0021 §3), so the
  show needs a workspace; it gets one ordinary account
  (`LIVE_STAGE_USER_EMAIL`). No change to `chart_annotations` was needed and
  none was made.

**Known gap.** Nothing constrains `live_frames.payload` to parse as a
`LiveFrame`. The API parses on read and logs a frame it cannot understand rather
than serving it, so a contract change that forgets the writer shows up as one
loud frame rather than a client rendering nothing — but the store itself would
accept `{}`.
