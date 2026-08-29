# BUILD BRIEF — Round 5: Push notifications

Owner, 2026-08-29: "push notifications are core experience — as a PWA *and* as an
app-store app." Decision: build both transports in one round. Native credentials
(APNs / FCM) do not exist yet — the native path is written and tested dry, and the
credential gap is recorded as an owner blocker, not worked around.

This brief is binding. Where it disagrees with an older doc, this wins for push.

---

## 1. What is already true (verified 2026-08-29, do not rebuild)

- `apps/api/src/lib/notify.ts` writes an in-app row for every notable event and
  is already called from 7 places: alert activated, **alert triggered**
  (`lib/round4/alert-tick.ts`), order filled and position closed
  (`lib/execution/tick.ts`), @Kai room reply, debrief ready, paper reset.
  Every row carries `payload.route` — a deep link — and a `group`
  (`action_required` / `changes` / `fyi`).
- Alerts DO evaluate. `evaluateArmedAlerts` runs inside the paper tick
  (`POST /api/v1/internal/paper/tick`, dev `setInterval`, hosted = Vercel cron).
  A trigger is only written from a quote we actually received, with freshness
  recorded. **Push does not need a new event source. It needs a transport.**
- `notification_prefs` (per_mode jsonb, quiet_hours jsonb) and
  `setup_alert_prefs` (min_grade, modes, max_per_day, quiet_hours) exist since
  0008. Quiet hours are collected by `account/settings.tsx` and consumed by
  **nothing**. `notifications.sent_at` has never been written — 0008 left it for
  "a future push sender". This round is that sender.
- `notif_channel` enum is already `('push','in_app')`.

## 2. What is missing (the whole of this round)

No device/subscription registry. No Expo push. No Web Push, service worker or
PWA manifest. No preference/quiet-hours/budget resolution. No receipts or token
pruning. No tap-to-deep-link. `expo-notifications` is not installed.

---

## 3. The rule this round is built on

**One notification, two transports.** Push is not a parallel system with its own
copy of the truth. `notify()` stays the single writer. It writes the in-app row
exactly as it does today, then enqueues one delivery per eligible subscription.
The inbox and the buzz always say the same thing, because they are the same row.

A push that was suppressed is recorded as suppressed with its reason. It is
never silently dropped, and the in-app row always survives — if we decided not
to buzz you at 3am, the thing is still in your inbox in the morning.

## 4. Product decisions (locked — flagged to owner, override before merge if wrong)

1. **Quiet hours suppress everything, including a triggered alert.** No
   "critical override" in v1. Rationale: our alert evaluation runs off delayed
   quotes and the market is shut during typical quiet hours; waking someone for
   a trade they cannot take is worse than the inbox. Suppressed deliveries are
   marked `suppressed`/`quiet_hours` and are NOT replayed at the end of quiet
   hours (a 7am flush of six stale trade alerts is a worse product than silence).
2. **`max_per_day` caps proactive pushes only** (setup alerts Kai chose to send
   you). A trigger on an alert the user created themselves is never capped and
   never deduped away — they asked for exactly this one.
3. **Never prompt for permission cold.** The OS/browser prompt is only reached
   from a priming screen the user opened, or immediately after an act that
   implies wanting it (arming an alert). Denied once = never auto-asked again;
   we show the path to Settings instead.
4. **In-app while foregrounded, no banner.** If the app is open and the user is
   looking at the thing the notification is about, no push banner — the screen
   already updated.
5. Categories (what a user can switch off, mapped from `NotifyKind`):
   `trade_alerts` (alert_trigger, alert_activated) · `order_status`
   (order filled/closed) · `community` (kai_room_reply) · `coaching`
   (debrief_ready) · `system` (paper_reset, system). Default: all on.

---

## 5. Schema — migration `0024_push.sql` (lane SCHEMA-5)

```
push_subscriptions
  id uuid pk
  user_id uuid not null references profiles on delete cascade
  transport text not null check (transport in ('expo','web'))
  handle text not null              -- ExponentPushToken[...] | web endpoint URL
  keys jsonb                        -- web: {p256dh, auth}; expo: null
  platform text                     -- ios | android | web
  device_label text                 -- "iPhone" / "Chrome on macOS", for the UI
  state text not null default 'active' check (state in ('active','stale','revoked'))
  failure_count int not null default 0
  last_seen_at timestamptz, last_success_at timestamptz
  created_at timestamptz not null default now(), updated_at timestamptz
  unique (transport, handle)        -- a token belongs to one row, re-register = upsert

notification_deliveries
  id uuid pk
  notification_id uuid not null references notifications on delete cascade
  subscription_id uuid references push_subscriptions on delete set null
  transport text not null
  state text not null check (state in ('queued','sent','delivered','failed','suppressed'))
  reason text                       -- quiet_hours | prefs_off | budget | no_subscription |
                                    -- entitlement | DeviceNotRegistered | http_410 | ...
  ticket_id text, receipt_checked_at timestamptz
  attempts int not null default 0, next_attempt_at timestamptz
  error text
  created_at timestamptz not null default now(), updated_at timestamptz
  index (state, next_attempt_at)    -- the drain query
  index (notification_id)
```

Also: extend `notification_prefs` with `categories jsonb not null default '{}'`
(per §4.5; empty = all on) and `push_enabled boolean not null default true`
(the master switch the priming screen writes).

RPCs (each ending in an **explicit REVOKE** — Supabase default-grants EXECUTE to
`authenticated` on every new function; see SCHEMA-NOTES §2.7):
- `register_push_subscription(p_transport, p_handle, p_keys, p_platform, p_label)`
  — upsert on (transport, handle), re-activates a revoked row, sets `user_id` to
  `auth.uid()`. This is how a client registers; it may not write another user's row.
- `revoke_push_subscription(p_id)` — owner-only, sets `state='revoked'`.

RLS: owner select/delete on `push_subscriptions`; `notification_deliveries` is
service-role only (a user has no business reading ticket ids). Add both to
`scripts/rls-test.mjs`: user A must not read, update, or delete B's subscription,
and must not be able to insert a row with B's `user_id`.

Regenerate `packages/shared/db.types.ts`.

---

## 6. Shared contracts — `packages/shared/api.ts` (lane API-5 owns this file)

```
PushSubscribeRequest  = { transport:'expo'|'web', handle:string,
                          keys?:{p256dh:string,auth:string}|null,
                          platform?:'ios'|'android'|'web', device_label?:string }
PushSubscribeResponse = { subscription:{ id, transport, platform, device_label,
                                         state, created_at } }
PushSubscriptionsResponse = { subscriptions:[...], push_enabled:boolean,
                              vapid_public_key:string|null }
PushTestRequest  = {}   PushTestResponse = { sent:number, suppressed:[{reason}] }
NotificationCategory = 'trade_alerts'|'order_status'|'community'|'coaching'|'system'
```
`SettingsRound4Request` gains `push_enabled?: boolean` and
`notification_categories?: Partial<Record<NotificationCategory, boolean>>`;
`SettingsResponse` returns both.

---

## 7. API — lane API-5

New: `apps/api/src/lib/push/**`
- `policy.ts` — **`resolveDelivery()` is the heart of this round and is a pure
  function**: `(kind, userRow, prefs, subscriptions, now, sentTodayCount) →
  {send:[subscription], suppressed:[{subscription|null, reason}]}`. Resolution
  order is fixed: entitlement → `push_enabled` → category pref → quiet hours →
  daily budget (proactive only) → active subscriptions. Unit-tested with a table
  of cases including the quiet-hours wrap past midnight in the user's timezone.
  No network, no db, no clock reads inside it — `now` is an argument.
- `expo.ts` — `expo-server-sdk`: chunking, tickets, `getPushNotificationReceiptsAsync`.
  `DeviceNotRegistered` → revoke the subscription. Honours `PUSH_DRY_RUN=1`
  (log the payload, mark `sent`, contact nothing) — this is how the native path
  is exercised without APNs/FCM.
- `web.ts` — `web-push` with VAPID. 404/410 → revoke. 429 → back off.
- `send.ts` — the queue drain: claim `queued`/retryable rows, group by transport,
  send, record ticket ids, schedule receipt checks ≥15 min out, exponential
  backoff (1m, 5m, 25m, then `failed`).
- `payload.ts` — one payload builder from the notification row: title/body from
  `title_plain`/`body_plain` (never invent new copy for the banner — the inbox and
  the banner must match), `data.route` = the deep link, category, notification id.

Wire-in: `notify()` gains a final step — insert `notification_deliveries` rows via
`resolveDelivery()`, then `void drain()` fire-and-forget with a short timeout so
the API response is never blocked by a push. It must not throw into its caller;
a push failure can never fail an order or an alert.

Routes:
- `POST /api/v1/push/subscriptions` (register), `GET` (list mine),
  `DELETE /api/v1/push/subscriptions/[id]` (this device off).
- `POST /api/v1/push/test` — sends "Notifications are on." to the caller's own
  subscriptions, bypassing category prefs but NOT quiet hours; returns what was
  suppressed and why, so the UI can say "you're in quiet hours right now" instead
  of appearing broken. Rate limit 1/min/user.
- `POST /api/v1/internal/push/drain` — `x-internal-secret` exactly like the paper
  tick (404 when the secret is unset), plus a dev `setInterval`
  (`PUSH_DRAIN_DEV_INTERVAL_S`, single-instance guard, same pattern as
  `execution/tick-dev.ts`). Drains the queue, checks due receipts, prunes tokens.
- `GET /api/v1/push/health` — configured transports, VAPID present y/n, queue
  depth, last drain. Not user data; auth'd.

`vercel.json` gains the cron entry (documented, alongside the paper tick).
`apps/api/scripts/smoke.sh` grows the push block: register → notify → delivery row
queued → drain (dry-run) → sent → suppressed-by-quiet-hours case → test route →
unsubscribe. Existing 269 assertions must stay green.

---

## 8. Mobile — lane MOBILE-5

**Native (`expo-notifications`, SDK 54 — read the versioned docs, this is the
version that removed Expo Go push):**
- `src/features/notifications/register.ts` — permission request, token fetch
  (`getExpoPushTokenAsync` with the projectId from `expo-constants`), POST to the
  registry, Android channel setup (`trade-alerts` channel, importance HIGH).
  **Guard: if `Constants.appOwnership === 'expo'` (Expo Go) the app must say so
  in plain words — "Notifications need the installed app; this is the Expo Go
  preview" — and not fail silently or throw.**
- Foreground handler per §4.4. Response listener + `getLastNotificationResponseAsync`
  for cold start → `router.push(data.route)`.
- Badge count = unread inbox count; cleared when the inbox opens.

**Web / PWA:**
- `apps/mobile/public/manifest.webmanifest` (name "Cheat Code AI", standalone,
  background/theme `#0B0B0E`, maskable icons from `assets/images/`), linked from
  the web head, plus the iOS `apple-mobile-web-app-*` tags — on iOS, web push
  only exists once the app is on the home screen, so the install path IS the
  feature.
- `apps/mobile/public/sw.js` — `push` → `showNotification(title, {body, data,
  tag: notification id})`; `notificationclick` → focus an existing client and
  postMessage the route, else `openWindow(origin + route)`. No caching layer this
  round (an offline strategy is its own decision; do not sneak one in).
- `src/features/notifications/web-push.ts` — register the SW, subscribe with the
  VAPID public key from `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, POST endpoint + keys.
  Secure-context guard: over plain http on a LAN IP there is no SW — say that
  plainly rather than showing a dead switch.

**UX:**
- `account/notifications.tsx` keeps the inbox and gains a header state: off →
  "Turn on notifications" (primes, then prompts); on → this device listed with
  "Send a test" and a per-category switch list; denied → the Settings path.
- One priming moment in the flow: after arming an alert, a single sheet — "Want a
  buzz when this triggers?" — shown once ever.
- Copy follows the app's register: plain, adult, no exclamation marks, no
  "Don't miss out!". A notification says what happened and what it wants:
  *"META crossed 604.50 — the level your alert was watching."*

Proof script `scripts/proof-push.mjs` (Playwright, Chromium, real localhost):
permission granted via context, SW registers, subscription POSTs, a push is
delivered to the SW through CDP `ServiceWorker.deliverPushMessage`, the
notification renders, the click lands on the deep-linked route. Screenshots into
`proof/`.

---

## 9. Verification bar

- Unit: `resolveDelivery()` table tests, incl. midnight-wrapping quiet hours.
- API smoke: the block in §7, dry-run native + real web queueing.
- RLS: the cases in §5.
- Browser: `proof-push.mjs` green end-to-end on desktop Chromium at localhost.
- Native: **not verifiable this round** (no dev build, no credentials). Dry-run
  proof + a written checklist in the ops doc for the day the build exists.
  Do not claim native push works.

## 10. Env (add to `docs/ENV.md`)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:support@cheatcode.com`
(generate locally with `web-push generate-vapid-keys`; free, no account),
`EXPO_ACCESS_TOKEN` (optional), `PUSH_DRY_RUN`, `PUSH_DRAIN_DEV_INTERVAL_S`,
`EXPO_PUBLIC_VAPID_PUBLIC_KEY` (mobile). Keys go in `.env.local`, never tracked.

## 11. Owner blockers to record, not work around

1. **APNs / FCM**: iOS needs an Apple Developer account ($99/yr) for an APNs key;
   Android needs a Firebase project for FCM v1. Until then there is no native
   token to send to, and Expo Go cannot receive push at all (removed in SDK 53).
2. **HTTPS**: web push needs a secure origin. Desktop `localhost` qualifies; the
   phone does not until the app is hosted — which is still behind the overdue
   Supabase invoice.
3. **The sender only runs while something ticks.** Hosted, that is the Vercel
   cron; locally it is the dev interval on a laptop. No cron, no push.

---

## 12. Addenda after SCHEMA-5 landed (`0024_push.sql`, commit 368a06b) — binding on API-5

1. **A web subscription with null `keys` is storable and undeliverable.** No check
   constraint was added, deliberately, because §6 types `keys` as optional. The
   sender must therefore skip such a row and mark it `state='stale'` with reason
   `keys_missing`, rather than throwing inside the drain.
2. **`notification_deliveries.transport = 'none'`** for a suppression decided
   before any transport is chosen (quiet hours, prefs off, budget, no device).
   `resolveDelivery()` returns those with `subscription: null`.
3. **`notifications.sent_at` semantics (decided here, not left to the lane):** set
   it to the timestamp of the FIRST successful send to any transport, and leave it
   null when every delivery was suppressed or failed. It answers "did this ever
   reach them", not "did it reach all of their devices" — the per-device truth
   lives in `notification_deliveries` and belongs nowhere else.
4. `register_push_subscription` takes a 6th, defaulted `p_user_id` consulted only
   when `auth.uid()` is null (the API calls it with the service-role client). Pass
   the authenticated user's id from the route; a JWT sending someone else's id is
   refused with 42501.
5. A token already registered to another user is **taken over** by the new
   registrant (device handover). Do not treat a takeover as an error.
