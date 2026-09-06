# App Privacy labels — Cheat Code AI

> **DRAFT. Written by an AI agent from the code and the database, not by a lawyer.**
> Every line below was checked against source or against a live query on the hosted
> database (`eqepjztjmzmpvmlqsdiz`) on **6 September 2026**. That makes it accurate
> as of that date; it does not make it legally sufficient. Apple holds the developer
> to these answers, and a wrong answer is a rejection or a removal later — so read
> the "Judgement calls" section at the end before you type these into App Store
> Connect.

---

## The short version

- **Nothing in this app tracks anybody.** There is no analytics SDK, no crash
  reporter, no advertising SDK, no attribution SDK, no Firebase, no RevenueCat.
  `apps/mobile/package.json` contains only Expo, React Native, Supabase and UI
  libraries. So **"Used to Track You" is NO for every single data type**, and the
  app does not need App Tracking Transparency.
- **Almost everything collected is Linked to the user.** There is one account, one
  user id, and nearly every table hangs off it.
- **The one that will surprise you:** `conversation_messages` stores the full text
  of every question the user has ever asked Kai, permanently, with no delete path.
  See "Things worth knowing" below.

---

## 1. The label answers, category by category

For each: **Collect?** · **Linked to identity?** · **Used for tracking?** · **Purposes** ·
**Where it lives / evidence**

### Contact Info

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Email Address** | YES | Yes | No | App Functionality; *(see judgement call #1 re: marketing)* | `auth.users.email` — created by `supabase.auth.signUp` in `apps/mobile/src/lib/session.tsx:115`. Copied into `crm_people.primary_email` / `crm_identities` by `apps/api/src/lib/crm/sources/app.ts:120-136`. |
| **Name** | YES | Yes | No | App Functionality | `profiles.display_name` and `profiles.handle`. Shown as the author of community posts (verified live: posts render "Marcus T."). Set from signup metadata / server-side. |
| **Phone Number** | NO | — | — | — | Columns exist (`crm_people.primary_phone_e164`, `legacy_imports.phone_hash`) but the only writer is the `kai_sms` CRM connector, which **throws on `pull()`** and is not implemented (`apps/api/src/lib/crm/sources/kai-sms.ts:66-79`). Both tables are empty (0 rows). Do not declare it unless that connector is switched on. |
| Physical Address | NO | — | — | — | No such column, no such field. |
| Other User Contact Info | NO | — | — | — | — |

### Financial Info

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Payment Info** | NO | — | — | — | The app never sees a card. Stripe collects payment details on Stripe's own hosted checkout. The API stores only `subscriptions.stripe_customer_id` / `stripe_subscription_id` — identifiers, not card data. |
| **Credit Info** | NO | — | — | — | No credit score, no credit check. |
| **Other Financial Info** | **YES** | Yes | No | App Functionality; Product Personalization | Two distinct things: (a) **self-reported financial profile** — onboarding stores `risk_answer` (careful/balanced/aggressive), `experience`, and a stated `starting_balance` in `profiles.onboarding`; (b) **simulated account state** — `accounts.cash/equity/buying_power`, `positions`, `orders`, `fills`, `trade_plans`. The money is fake; the risk profile is real self-disclosure. Also `risk_policies.daily_loss_cap_usd` etc. |

### Purchases

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Purchase History** | YES | Yes | No | App Functionality | `subscriptions` (tier, status, period end, Stripe ids), written by `apps/api/src/app/api/v1/webhooks/stripe/route.ts:118-124`. Also `kai_credit_wallets.lifetime_purchased` and `kai_credit_ledger` for credit top-ups. **Currently 1 row in production — the demo account's, inserted by hand.** The mechanism is real; it has not carried a real purchase yet. |

### Location · Contacts · Health & Fitness · Sensitive Info · Browsing History

**All NO.** No location code of any kind, no contacts access, no health data, no
sensitive-category data, no web browsing captured. Confirmed by grep across
`apps/mobile/src` — `expo-location`, `expo-contacts`, `expo-camera`,
`expo-media-library`, `expo-tracking-transparency` are not dependencies and are not
imported anywhere.

### User Content

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Other User Content** | **YES** | Yes | No | App Functionality; Product Personalization | This is the largest category. Four stores: <br>• `conversation_messages.content` — **every message the user has ever sent to Kai, and every answer**, keyed to `conversations.user_id`. 74 rows live today.<br>• `messages.body` — community posts, plus `structured_idea` and `position_disclosure` JSON.<br>• `kai_user_memory.content` + a 1536-dimension `embedding` — notes Kai extracts about the user.<br>• `alerts.natural_language` — the sentence the user typed to create a watch. |
| **Emails or Text Messages** | NO | — | — | — | The app does not read the user's mail or SMS. (The chat with Kai is declared under Other User Content, which is the right box for it.) |
| **Photos or Videos** | NO | — | — | — | No image picker, no upload, no camera. Avatars render a single letter, never an image (`apps/mobile/src/features/community/ui/Chrome.tsx:82-83`). |
| **Audio Data** | NO | — | — | — | The app **plays** audio (`expo-audio`, `createAudioPlayer`) but never records. No microphone permission is ever requested. The spoken answers are text-to-speech of Kai's own words, generated server-side by OpenAI. |
| Customer Support | NO | — | — | — | No in-app support channel. |
| Gameplay Content | NO | — | — | — | — |

### Identifiers

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **User ID** | YES | Yes | No | App Functionality; Analytics; Product Personalization | The Supabase `auth.users.id` UUID. It is the join key for ~30 tables. |
| **Device ID** | **YES — see judgement call #2** | Yes | No | App Functionality | `push_subscriptions.handle` holds either an Expo push token (native) or a web-push endpoint URL, plus `platform` and `device_label` ("iPhone", "Chrome on macOS"). A push token is a per-install identifier that persists across launches. Registered in `apps/mobile/src/features/notifications/register.ts:137-147`. |

### Usage Data

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Product Interaction** | YES | Yes | No | App Functionality; Analytics; Product Personalization | `user_events` (per-user event stream: order status, fills, position updates, Kai results, system events), `notification_deliveries`, `contributor_stats` (ideas posted, theses updated, a `usefulness_score`), `kai_credit_ledger` (what was spent and when), `alerts`/`watchlist_items` (what the user watches). |
| **Advertising Data** | NO | — | — | — | No advertising anywhere. |
| **Other Usage Data** | YES | Yes | No | App Functionality; Analytics | `kai_model_usage` — one row per model call with `user_id`, `conversation_id`, `feature`, `model`, token counts, `cost_usd`, `duration_ms`. This is a per-user AI cost ledger. |

### Diagnostics

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Crash Data** | NO | — | — | — | No crash reporter is installed. |
| **Performance Data** | **YES — see judgement call #3** | Yes | No | App Functionality; Analytics | `kai_model_usage.duration_ms` records how long each AI call took, keyed to `user_id`. That is latency data linked to identity. |
| Other Diagnostic Data | NO | — | — | — | — |

### Other Data

| Type | Collect | Linked | Tracking | Purposes | Evidence |
|---|---|---|---|---|---|
| **Other Data** | YES | Yes | No | App Functionality; Product Personalization | The investing-preference profile: `profiles.primary_mode` (day_trade / swing / invest), `experience`, `involvement`, `explanation_level`, `memory_enabled`, `timezone`, and the `onboarding.focus` sector chips (e.g. "tech", "ai"). |

---

## 2. Who receives data, and what exactly they get

This is the subprocessor list the privacy policy is built from. **Do not add to it
without checking the code** — every entry here was traced to a specific call site.

| Recipient | What they receive | Evidence | Notes |
|---|---|---|---|
| **Supabase** (Anthropic-unrelated; two projects) | Everything in §1. The app DB `eqepjztjmzmpvmlqsdiz` holds all user data. The phone talks to it **directly** for authentication and for reading/writing the `profiles` row. | `apps/mobile/src/lib/supabase.ts`, `session.tsx:75-80,155`; server via `apps/api/src/lib/db.ts` | This is the database of record. |
| **Supabase** (brain project `ryprohqthwflinadqotj`) | Research-desk content only. The single write path adds a **ticker symbol** to a shared watchlist with `source:'manual'` — **no user id is attached**. | `apps/api/src/lib/desk/source.ts:404-421` | No personal data goes here. But see the security note below. |
| **Anthropic** | The user's typed question, the conversation history, and the system prompt. **The system prompt includes the user's paper-account balances and their risk limits** (`apps/api/src/lib/kai/context.ts:300,322-342`), and their stated experience/involvement/explanation level. It includes `display_name` if set. | `apps/api/src/lib/kai/stream.ts:428-442, 479-487` | **No email is sent. No `metadata.user_id` is sent** — verified by reading the full request bodies. Anthropic sees content, not who wrote it. |
| **OpenAI** | Text-to-speech only: the narration text Kai composed, sent to `POST /v1/audio/speech`. | `apps/api/src/lib/kai/tts.ts:136-147` | No user identifier. |
| **Polygon.io** | Ticker symbols, dates, and the API key. Nothing else — verified by reading `polyGet()`. | `apps/api/src/lib/market/polygon.ts:276-310` | Company logos are proxied server-side so the phone never touches Polygon. |
| **Expo push service** | The push token, the notification title and body, and a small `data` object (notification id, kind, category, route). | `apps/api/src/lib/push/expo.ts:47-58` | Notification copy can name a ticker and a price level. |
| **A web-push relay** (Mozilla / Google / Apple, depending on browser) | The subscription endpoint URL and an **encrypted** payload. The relay cannot read the content. | `apps/api/src/lib/push/web.ts:96-104` | Web only. |
| **Stripe** | Email address, the app's own `user_id` as `client_reference_id` / `metadata[user_id]`, and the price id. | `apps/api/src/lib/stripe.ts:96-160` | **Not configured in production today** — no `STRIPE_SECRET_KEY` in `.env.prod`, so checkout answers "Upgrades open soon." |
| **Vercel** | Hosting. Standard platform request logs — paths, timestamps, source IP addresses. | `apps/api/vercel.json` | This is Vercel's default platform behaviour, not something the code sets. Stated as an expectation, not verified against a log export. |
| **Apple / Google** | App distribution and, for iOS, APNs delivery of the pushes Expo relays. | — | Standard platform. |

**Explicitly NOT used, despite appearing in comments, column names or old plans:**
Yahoo Finance (zero call sites), SnapTrade (a `broker_connections` table exists and is
empty; no API call anywhere), Twilio, SendGrid/Resend/Mailgun/Postmark, Benzinga,
TradingView as a data source, Sentry. Do not name any of these in the privacy policy.

---

## 3. What the app asks the device for

**One permission: notifications.** That is the entire list.

`apps/mobile/app.json` has **no `ios.infoPlist` block at all**, no `permissions`
array, no entitlements, no associated domains, no background modes. The plugins are
`expo-router`, `expo-font`, `expo-secure-store`, `expo-notifications`,
`expo-splash-screen`, `expo-audio`, `expo-image`, `expo-web-browser`,
`expo-status-bar`, `expo-asset`.

Local storage on the device: the Supabase auth session is chunked into
**SecureStore** (encrypted), with AsyncStorage holding only the chunk count
(`apps/mobile/src/lib/supabase.ts:15-42`). Plain AsyncStorage holds three
non-sensitive things: a saved-contributors list, the day's cached wake-up message,
and a "has the push priming sheet been shown" boolean.

---

## 4. Things worth knowing before you sign this

These are the findings that surprised me. Each one is a real thing the system does.

**1. Kai remembers everything, forever, and nobody can delete it.**
`conversation_messages` stores the full text of every question and every answer.
There is **no delete route for a conversation** — `apps/api/src/app/api/v1/kai/conversations/[id]/route.ts`
exposes only `PATCH`. There is **no account-deletion route anywhere in the API**;
nothing calls `auth.admin.deleteUser`. The only user-facing deletion in the whole
product is `DELETE /api/v1/memory`, which clears Kai's extracted *notes* — not the
conversations they came from. If the privacy policy promises a deletion right, and
it should, the product does not currently honour it. **Another lane is building
account deletion today; this document assumes it lands. If it does not, the policy
must not claim it.**

**2. Every AI call is priced and attributed to a person.**
`kai_model_usage` has `user_id`, `conversation_id`, model, token counts, `cost_usd`
and `duration_ms` — one row per call. It is a per-user behavioural and cost record.
Benign in purpose (it exists to enforce a credit allowance) but it is exactly the
kind of thing a label reviewer means by "Usage Data, linked".

**3. There is an internal CRM that is designed to outlive account deletion.**
`crm_people` stores `primary_email`, `primary_phone_e164`, `total_paid_cents`,
`ltv_cents`, and a set of computed behavioural scores: `score_buy_propensity`,
`score_churn_risk`, `score_upsell_propensity`, `score_predicted_ltv_cents`,
`score_predicted_days_to_churn`. Its link to the app account is
`app_user_id ... on delete set null` — the migration comment says so deliberately:
"a person who deletes their account is still a person we talked to". It is empty
today (0 rows) and the app connector that fills it pulls email and subscription
status. **This is a decision the owner has to make, not one I can make for him:**
either (a) declare "Developer's Advertising or Marketing" as a purpose for Email
Address and accept that the label says so, or (b) turn the CRM connector off before
submission and declare only App Functionality. Doing neither — running it while
declaring only App Functionality — is the option that gets you in trouble.

**4. The app has an open sign-up screen.**
`apps/mobile/src/app/(auth)/sign-up.tsx` lets anyone create an account with an email
and a six-character password. No invite code, no gate. **This contradicts the
"private, registration-only, sign up on the website" framing.** It is not a privacy
problem, but it is a Terms problem and an App Review Notes problem — do not tell
Apple the service is invite-only while shipping an open sign-up form.

**5. The app ships a working "Upgrade" button that opens a web checkout.**
`apps/mobile/src/app/account/subscription.tsx` renders a Free/Pro/VIP price ladder
and calls `WebBrowser.openBrowserAsync(checkout.url)`. Today it dead-ends at
"Upgrades open soon" because Stripe is unconfigured, but the code path is shipped.
Under Guideline 3.1.3(b) the app must not link out to a purchase for digital
content. Another lane is stripping this; **confirm it is gone from the build you
actually submit.**

**6. One logging rule is broken.** `apps/api/src/lib/log.ts` states "Never logs
tokens, keys, or message bodies", but `apps/api/src/lib/push/expo.ts:94-99` writes
the full notification `title` and `body` to the log when `PUSH_DRY_RUN=1`. That is
user-facing content in a log. Small, but it is a contradiction of the codebase's own
stated policy and worth closing.

**7. There is no age gate.** No date of birth, no minimum-age check, nothing.
Grepped for every spelling of it. If the App Store rating is 17+ that is Apple's
gate, not yours — but if you ever need to assert COPPA compliance, there is no
technical mechanism behind the assertion.

**8. The brain database's locks are open.** Not an App Privacy question, because no
personal data goes there, but it belongs in the same file as everything else about
data safety: `ryprohqthwflinadqotj` has a policy literally named "Allow all users"
over a `users` table holding 309 phone numbers, 243 emails and 257 Stripe ids from
the SMS product. See `SCOPING-2026-09-05-security-and-us-suffix.md` and
`HANDOFF-2026-09-05.md` §5. **This is a live exposure of other people's data and it
is more urgent than anything in this folder.**

---

## 5. Judgement calls — where I would want a second opinion

**#1 — Is Email Address used for marketing?** The CRM computes buy-propensity and
churn scores off it. If the connector runs, the honest label answer includes
"Developer's Advertising or Marketing". I have declared it as App Functionality only
above **on the assumption the CRM stays off for launch**. If it does not, change it.

**#2 — Is a push token a "Device ID"?** Apple defines Device ID as "any identifier
that relates to a device". An Expo push token is per-install, not per-device, and
rotates. Some developers declare it, some do not. I have declared **YES** because
under-declaring is the expensive mistake and the cost of declaring is one extra row
that carries no tracking flag. A lawyer may prefer otherwise.

**#3 — Is `duration_ms` "Performance Data"?** It is latency, linked to a user id.
Apple's examples for Performance Data are launch times, hang rates, energy use —
platform-level metrics, usually from an SDK. This is application-level and
first-party. I declared it YES for the same reason as #2. Reasonable people differ.

**#4 — Is the paper account "Other Financial Info"?** The balances are simulated.
The *risk questionnaire* is not: the user tells the app how much they intend to
start with and how much risk they want. I treated the pair as one declaration
because separating them invites the wrong answer. Worth a second look.

**#5 — Anthropic and training.** Nothing in the code sets a training opt-out, because
there is nothing to set: whether Anthropic or OpenAI train on API traffic is governed
by their commercial API terms, not by this codebase. **I cannot determine it from the
source and have not asserted it either way in the privacy policy.** Before publishing,
someone must read Anthropic's and OpenAI's current commercial terms and write the
true sentence. Do not let a plausible sentence stand in for a checked one.
