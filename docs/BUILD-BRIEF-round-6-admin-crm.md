# BUILD BRIEF — Round 6: Admin backend + CRM (in-app)

Owner, 2026-08-29: "an admin backend dashboard in-app with a CRM so we can
manage, invite and track all users and leads." Decisions taken with the owner:

1. **The in-app admin IS the new CRM.** `~/projects/cheatcode-crm` becomes legacy
   for the SMS business; this surface supersedes it.
2. **Invites are codes / links in v1.** No email vendor is configured anywhere in
   this app; a code the owner delivers by any channel works today.
3. **Leads come from everywhere**: this app's own funnel, the K.AI SMS product,
   and Stripe.

Binding for this round.

---

## 1. What already exists (discovered 2026-08-29 — read before designing anything)

The K.AI Supabase project `ryprohqthwflinadqotj` (us-west-2) already carries a
real CRM, built for `cheatcode-crm` and still being fed:

| table | rows | what it is |
|---|---|---|
| `crm.contacts` | 2,507 | canonical person: phone, email, name, status, primary_tier, source, first/last_seen, inbound/outbound counts, total_paid_cents, current_mrr_cents, ltv_cents, six score columns, tags[], `supabase_user_id`, `cheatcode_os_user_id`, `stripe_customer_id` |
| `crm.events` | 3,320 | timeline: type, category, source, payload, utm_*, value_cents, occurred_at |
| `crm.subscriptions` | 130 | Stripe truth: status, tier, mrr_cents, trial/period dates, cancel + reason, stripe ids |
| `crm.webhook_events` | — | live Stripe webhook (endpoint `we_1TTa0sF7Tbc3pSvJpv1Cjk6x`), 11 event types, idempotent |
| `public.users` | 309 | K.AI SMS users: phone, membership_tier, status, onboarding, affiliate, stripe ids, `auth_user_id` |
| `public.conversation_history` | 19,100 | SMS conversation turns |
| `public.sent_alerts` | 2,297 | what Kai sent whom |

**Therefore: do not invent a person model.** `crm.contacts` is already the shape
this round needs, proven against real data. Port it into this app's database and
ingest those rows. The score columns come along as nullable and stay empty until
something computes them — an empty column is honest, a fabricated score is not.

This app currently has: no staff role (0014 says admin surfaces are "reached
through api-app with the service role until a staff role claim exists" — this
round is that claim), no leads, no invites, no audit log, no email provider,
Stripe scaffolded but unconfigured (`BILLING_NOT_CONFIGURED`).

## 2. Architecture

**One home of record: this app's database.** `crm_people` / `crm_identities` /
`crm_events` live here. The K.AI database and Stripe become *sources* that flow
in through connectors, exactly like any other integration. Nothing in the admin
UI reads another project's database live — a dashboard that dies when a foreign
pooler is slow is not a command surface.

```
app's own tables ──→ source: app     ─┐
K.AI Supabase   ──→ source: kai_sms ─┼─→ sync (idempotent, resumable) ─→ crm_people / crm_events ─→ admin API ─→ admin UI
Stripe API      ──→ source: stripe  ─┘        (identity resolution)

   this round: `app` only. `kai_sms` and `stripe` are registered stubs
   reporting `configured: false` — see §5.
```

## 3. Security — this is the part that must not be got wrong

An admin surface reads every user's data. The rules:

- **`staff_members` is its own table**, never a flag on `profiles`. Users can
  patch their own profile through `/settings`; a staff bit living there is one
  missing field-filter away from self-promotion. Roles: `support` (read + notes),
  `admin` (invites, entitlements, everything but staff management), `owner`
  (grants staff). Seeded exactly once, by migration, for the owner's user id.
- **`staffed()` guard** beside the existing `authed()` in `lib/http.ts`. It
  re-checks the staff row on every request from the database — never from a JWT
  claim that could be stale after a revoke. Non-staff get the app's standard
  `NOT_FOUND`, not `FORBIDDEN`: an admin route should not confirm it exists.
- **Every admin action writes `admin_audit_log`** — actor, action, target, before
  and after, request id, ip. Append-only, `revoke update, delete from every role`
  per 01 §13. Reads of a person's detail page are logged too, not just writes.
- **Private conversation bodies are not in the CRM.** The ingest copies counts and
  timestamps, never the text of `conversation_history` or this app's `kai_*`
  messages. Opening a transcript is a separate, reason-required action that
  writes an audit row and shows the user's own view, unedited. 19,100 private
  messages do not get quietly duplicated into a marketing tool.
- The admin bundle may ship in the app, but **the client is never the boundary** —
  every byte comes from a `staffed()` route. The UI hides itself for non-staff as
  a courtesy, not as a control.

## 4. Schema — `0025_admin_crm.sql` (migration number is reserved; 0024 is push)

```
staff_members(user_id pk → profiles, role check(support|admin|owner),
              granted_by, granted_at, revoked_at)

crm_people(id uuid pk,
  display_name, primary_email, primary_phone_e164,
  status check(lead|invited|signed_up|onboarded|activated|paying|churned|blocked),
  primary_tier, source, source_detail jsonb,
  first_seen_at, last_active_at, last_inbound_at, last_outbound_at,
  inbound_count int, outbound_count int,
  total_paid_cents bigint, current_mrr_cents int, ltv_cents bigint,
  tags text[], custom_fields jsonb,
  app_user_id uuid unique → profiles,          -- null for a lead
  merged_into uuid → crm_people,               -- merges are reversible
  created_at, updated_at, deleted_at)

crm_identities(id, person_id, kind check(email|phone|app_user|stripe_customer|
               kai_user|os_user|invite_code), value text, source, verified bool,
               unique(kind, value))            -- the resolution index

crm_events(id, person_id, type, category, source check(app|kai_sms|stripe|admin|import),
           payload jsonb, value_cents, occurred_at, ingested_at,
           external_id text, unique(source, external_id))   -- idempotent re-ingest

crm_notes(id, person_id, author_user_id, body, created_at)
crm_segments(id, name, filter jsonb, created_by, created_at)   -- saved filters, not a query language

invites(id, code citext unique, label, tier, entitlements jsonb,
        max_redemptions int default 1, redeemed_count int default 0,
        expires_at, created_by, revoked_at, created_at)
invite_redemptions(id, invite_id, user_id, person_id, redeemed_at, ip)

admin_audit_log(id, actor_user_id, action, target_kind, target_id,
                before jsonb, after jsonb, reason text, request_id, ip, created_at)

sync_runs(id, source, started_at, finished_at, state check(running|ok|failed),
          cursor jsonb, counts jsonb, error text)   -- resumable ingest
```

Views for the funnel (§8): `crm_funnel_v`, `crm_daily_signups_v`, `crm_mrr_v`.
All CRM tables are **service-role only** — no `authenticated` policy at all, on
any of them. The API is the only door. Every new function ends in an explicit
`REVOKE` (SCHEMA-NOTES §2.7). RLS tests: a signed-in non-staff user gets nothing
from every table above, and cannot call any admin RPC.

## 5. Sources (lane ADMIN-3)

**Owner, 2026-08-29: "just make the admin and CRM system first, we will worry
about the import later."** So this round builds the source *interface* and the one
source that needs no foreign credentials, and stops there.

**IN THIS ROUND — the `app` source.** This database. Every profile becomes a
`crm_people` row (`app_user_id` set), and the funnel state is *derived, never
stored twice*: signed_up -> onboarded (`onboarding.completed`) -> activated (armed
an alert or placed a paper order) -> paying (entitlement/Stripe). Backfills
`crm_events` from `user_events`. This is not an "import" — it is the app telling
the truth about its own users, and it is what makes the dashboard real and
testable on day one instead of an empty shell.

**DEFERRED, NOT DESIGNED AWAY — `kai_sms` and `stripe`.** Both are written as
stubs implementing the same `Source` interface (`plan()` -> `pull(cursor)` ->
`resolve()`), registered, and reported by `GET /admin/sync` as
`configured: false` with the exact reason (no read-only Stripe key; foreign
database import not yet authorised). The admin UI shows them as sources that
exist and are switched off — not as missing features. When the owner returns to
this, the work is writing two `pull()` bodies, nothing structural.

Everything the deferred sources need is nevertheless built NOW, because retrofitting
it later is what makes CRMs untrustworthy:
- `crm_identities.unique(kind, value)` and the resolution order:
  `stripe_customer_id` -> `app_user_id` -> normalised email (lowercased, trimmed)
  -> E.164 phone. Never match on name. When a candidate match would join two
  people who *both* already carry a different strong identity, **do not merge** —
  write a `merge_conflict` event and surface it for a human. Merges record
  `merged_into` plus an audit row and can be undone.
- `crm_events.unique(source, external_id)` — a second sync run of any source must
  create zero rows. Prove it with the `app` source now; the guarantee then holds
  for the others by construction.
- `sync_runs` with a resumable cursor, per source, and a dry-run mode that reports
  what it *would* change without writing.

Driver: `POST /api/v1/internal/crm/sync` (`x-internal-secret`, same pattern as the
paper tick) plus an admin "Sync now" button per source.

**Privacy rule that survives the deferral:** when the SMS source is eventually
switched on it copies counts and timestamps only — never the text of
`conversation_history`. 19,100 private messages do not get duplicated into a
marketing tool. Build the stub with that contract in its comments.

## 6. Invites (lane ADMIN-2)

Admin creates a code (or a link `/join/<code>`) carrying a tier and entitlement
grants, an optional cap and expiry. The code becomes a `crm_identities` row of
kind `invite_code`, so a redemption resolves to the person it was created for.
Sign-up accepts an optional code; redemption grants the entitlements inside one
transaction, writes `invite_redemptions`, moves the person to `signed_up`, and
audits. Redeeming an expired, revoked, or exhausted code says exactly which, in
plain words. Codes are unguessable (≥10 chars, no ambiguous glyphs) and
rate-limited by ip.

## 7. API — `/api/v1/admin/**`, all `staffed()` (lane ADMIN-2)

`GET /admin/overview` (§8 metrics) · `GET /admin/people` (search across name,
email, phone, ticker interest; filter by status, tier, source, tag; cursor
paged — never an unbounded list of 2,507) · `GET /admin/people/[id]` (identities,
timeline, subscriptions, entitlements, notes) · `POST /admin/people/[id]/notes` ·
`POST /admin/people/[id]/tags` · `POST /admin/people/merge` ·
`GET|POST /admin/invites`, `POST /admin/invites/[id]/revoke` ·
`POST /admin/users/[id]/entitlements` (grant/revoke, reason required) ·
`GET /admin/audit` · `GET|POST /admin/sync` · `GET /admin/segments`.
Public: `POST /api/v1/invites/redeem`.

## 8. Metrics that are honest (lane ADMIN-2 + views)

Overview shows only what is computed from real rows: people by status, signups
per day, activation rate (activated ÷ signed_up), paying count and MRR **from
Stripe subscriptions only**, churn in the last 30 days, invites outstanding vs
redeemed, source mix. No projected revenue, no invented tiers (`cheatcode-crm`
was already burned by fake Pro/VIP+ tiers — do not reintroduce them). A metric
with no data source renders as "not tracked yet", never as zero.

## 9. Admin UI (lane ADMIN-4) — `apps/mobile/src/app/(admin)/`

Entry: a row in Account, rendered only when `/me` reports staff. Screens:
**Overview** (the §8 numbers, one screen, scannable at a glance) ·
**People** (search + filters + saved segments; row = name, status, tier, last
seen, source) · **Person** (identity list, unified timeline across app/SMS/Stripe,
subscriptions, entitlements with grant/revoke, notes, tags, merge conflicts) ·
**Invites** (create, copy link, see redemptions) · **Audit** (what staff did).
Design register: this is the adult, dense, operator surface — tables and rules,
not consumer cards. Follows the palette lock and the standing no-generic-card-grid
rule. Never invent a metric label the API does not return.

## 10. Verification

- RLS: non-staff sees nothing, from every table, plus the RPC calls.
- Unit: identity resolution table tests, including the conflict case that must
  refuse to merge; invite redemption (expired / revoked / exhausted / valid).
- Sync: run the `app` source into local Supabase and
  report actual counts resolved / created / conflicted. Re-run it — the second
  run must create **zero** new rows (idempotence is the whole claim).
- Smoke: the admin block, on top of the existing suite, all green.
- Browser proof `proof-admin.mjs`: staff sign-in → overview → search a person →
  open detail → create an invite → redeem it as a new user → the person's status
  moves → the audit log shows every step.

## 11. Owner blockers / things to decide

1. **Stripe key** (only when the deferred `stripe` source is switched on). A
   `sk_live_` full-access key exists in
   `~/breakout-alert-system/.env`. Do not reuse it here. Create a **restricted
   read-only key** (customers, subscriptions, charges: read) at
   dashboard.stripe.com → Developers → API keys → restricted. A CRM never needs
   write access to money.
2. **Hosting.** This app has no hosted database (Supabase org invoice). The
   `app` source runs against local Supabase now; the 2,507-row K.AI import waits
   for hosting AND for the owner to return to it.
3. **Superseding `cheatcode-crm`.** It is deployed and its Stripe webhook is
   live. Two systems must not both claim to be the CRM: decide when its webhook
   is repointed here, and until then treat its `crm.*` tables as the upstream
   source of truth for SMS-side people.
4. Who besides the owner gets `staff`, and at what role.
