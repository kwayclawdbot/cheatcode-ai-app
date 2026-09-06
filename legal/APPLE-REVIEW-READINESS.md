# Apple review readiness — Cheat Code AI

Written 6 September 2026. Everything below was verified against the live hosted
stack (API `https://cheatcode-ai-api.vercel.app`, database `eqepjztjmzmpvmlqsdiz`)
by signing in as the demo account and calling the same endpoints the app calls.
Where something is broken, it is broken because I tried it, not because I read
about it.

---

## PART ONE — THE HEADLINE

**Do not submit this app today. It would be rejected, and the reason is not
subtle: the main feature does not work.**

Ask Kai anything and you get:

```
event: error
data: {"type":"error","code":"KAI_UNAVAILABLE",
       "message_plain":"Something went wrong on my side and I could not answer
        at all. Nothing was drawn on the chart and nothing was acted on."}
```

The cause, confirmed by calling Anthropic directly with the production key:

```
HTTP 400 — "Your credit balance is too low to access the Anthropic API."
```

Only the owner can fix this, at console.anthropic.com. Nothing in the code can work
around it. **This alone is a Guideline 2.1 rejection** — an app whose central
feature returns an error is an incomplete app.

Note that `/api/v1/health` still reports `"anthropic": true`. It tests whether the
key is *accepted*, and an exhausted balance is a 400, not a 401. The health check
will not warn you.

---

## PART TWO — WHAT A REVIEWER SEES TODAY, SCREEN BY SCREEN

Signed in as the demo account (swing mode, premium entitlement, populated).

### Welcome / sign-in — **works, with one thing to check**
Sign-in works. Sign-up works too, and that is the problem: **anyone can create an
account from inside the app with an email and a six-character password**, no invite
code. If the App Review notes say the service is private and invite-only, the
reviewer will disprove it in thirty seconds. Either gate sign-up or change the notes.

The privacy and terms links on this screen are drawn **only if
`EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` are set to real https
addresses**. They are unset today, so the links are hidden. Guideline 5.1.1 wants a
privacy policy reachable inside the app. **Blocker.**

### Home — **works, but says Kai is offline**
Renders correctly. Market status, the lead setup (SLB, grade A), the risk strip,
the opening line ("PFE needs a decision, App Review"). But the payload carries:

```
"degraded": true,  "degraded_reason": "Kai is offline right now."
```

Honest, and better than a blank screen. Still: the first screen of the app tells the
reviewer the assistant is down.

### Kai chat — **DEAD. This is the rejection.**
Every question returns `KAI_UNAVAILABLE`. Verified live on a real conversation.
The whole product is built around this. A reviewer will try it first.

### Alerts (second tab in day-trade and swing mode) — **populated and good**
- **Active: 12 cards.** SNOW, NVDA, DELL, VRNS, GTLB, CNH, PFE, COP, MPC, GAP,
  PTEN, SLB — real swing setups with grades (A, A−, B+, B, C), theses, entries,
  stops and targets.
- **History: 25 cards** drawn proportionally from the 810 alerts the SMS product
  actually sent, each with what happened to it.
- **Watching: 0 cards.** The three setups the demo account follows collapse into
  Active because their symbols are already live there. Not a fault, but the tab is
  empty and a reviewer may tap it.
- **You cannot create an alert.** Typing "tell me when NVDA closes above 185"
  returns `KAI_UNAVAILABLE` — alert drafting runs through Kai. Verified live.

**The 12 live alerts expire between 7 and 11 September 2026.** After that this tab is
empty unless the alert pipeline has produced new ones. The pipeline runs on a Vercel
cron every 10 minutes in session, so it probably will — but it is not guaranteed and
nobody should find out during review.

### Research Desk (second tab in invest mode) — **the best-looking screen in the app**
Reads the brain database. Live today: **60 themes**, **11 watchlist names** with
prices, states, grades and invalidation levels, and **44 graded picks** dated 4 and
5 September (2 A, 7 B+, 3 B, 9 C, 2 D on the 5th). Every pick carries a thesis and
a catalyst.

> **This corrects a common statement about this app.** "Invest mode has zero setups"
> is true of the `setups` table and false of the product: invest mode does not use
> `setups` at all. It uses the desk, and the desk is full.

### Day trade mode — **empty**
Switch to day trade (the app allows this, from Account or the Alerts header) and:
- `/setups` returns **0**. All 317 day-trade setups are expired; the newest is
  4 August 2026. The scanner is deliberately disabled on Railway.
- Home's lead setup is `null`.
- The Alerts tab still shows the 12 swing cards, because the alert feed is not
  filtered by mode. So the tab is not empty — it is just showing swing content under
  a day-trade heading.

**Recommendation: leave the demo account in swing mode and say so in the review
notes.** If a reviewer switches to day trade they see a thinner app, but not a broken
one.

### Trade — **works, and is unlocked for the demo account**
- Account strip: paper account, equity $9,998.68, cash $7,377.40, labelled PAPER
  with "Practice money only. Nothing here touches a real account."
- **Two open positions**: SLB 40 @ $57.03, PFE 12 @ $28.45.
- Watchlist: NVDA, SNOW, DELL, VRNS.
- Trade portal opens on any ticker; NVDA returns a full payload with chart config,
  annotations and an execution block.
- Order preview and submit **work end to end** — both positions above were placed
  through the real API, and the risk engine correctly refused a third order with
  *"This order risks $66.2 and you have $3.2 left of your $60 daily limit."*
- **Kai's commentary inside the Trade section will be dead**, same cause as above.

### Community — **populated today, and it decays**
- Core **Swing** room: 3 members, **6 real messages** — a genuine exchange about
  sector concentration and position sizing.
- **NVDA circle**: 3 members, **5 messages** — a real disagreement about where to put
  the stop.
- **The other 7 circles are empty** (0 members, 0 messages) and expire between 7 and
  11 September.
- The core **Day Trade** and **Investing** rooms are effectively empty.

> **Be straight about this:** the conversation was seeded by me on 6 September using
> two demo accounts (Marcus T., Priya R.). It is realistic and on-topic, but it is
> not organic member activity, and nobody should describe it to Apple as such.

### Account — **works**
Profile, mode switcher, notification settings, "What Kai remembers", sign out.
- **No delete-account option** as of this audit. Another lane is building it.
  **Guideline 5.1.1(v) requires it.** Blocker.
- **A Free / Pro / VIP price ladder with an Upgrade button** that opens a web
  checkout in an in-app browser. Today it dead-ends at "Upgrades open soon" because
  Stripe is not configured in production — but the code path ships. Another lane is
  stripping this. **Confirm it is gone from the build you submit.** Blocker under
  3.1.3(b).

---

## PART THREE — THE BLOCKER LIST

Ordered by what sinks the submission first.

| # | Blocker | Owner | Guideline |
|---|---|---|---|
| 1 | **Anthropic credits exhausted — Kai answers nothing, and alerts cannot be created.** | **The owner. Nobody else can fix it.** | 2.1 |
| 2 | **No account deletion** in the app or the API at the time of this audit. **In flight** — `apps/api/src/app/api/v1/account/delete/route.ts` appeared in the working tree while this was being written. Verify it end to end before ticking it off. | app lane | 5.1.1(v) |
| 3 | **No user-to-user block** in the community. `/rooms/:id/mute` mutes *yourself*; only staff can silence someone else. Re-checked after the moderation lane landed `/moderation/queue` and `lib/moderation.ts` — **still no member-level block.** | app + api lane | **1.2** |
| 4 | **The content filter catches market spam, not abuse.** Verified live: "you are a complete idiot and I hope something bad happens to you" posted successfully. Guaranteed-return and off-platform-solicitation posts were correctly refused. | app + api lane | **1.2** |
| 5 | **Privacy policy and terms are not published**, so `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` are unset and the in-app links are hidden. | owner + legal lane | 5.1.1 |
| 6 | **Pricing and the Upgrade → web checkout path still ship in the app.** | app lane | 3.1.3(b) |
| 7 | **Nobody is on the hook to answer a report within 24 hours.** The `reports` table and the moderation route exist; there is no queue, no alert, no rota. | owner | 1.2 |
| 8 | **The deployed API is behind the branch.** `/api/v1/credits` and `/api/v1/admin/spend` return 404 in production although both route files exist locally (added in the unpushed commit `292135b`). Deploy from the repo root before submitting. | app lane | 2.1 |
| 9 | **No `eas.json`** at the time of this audit. **In flight** — `apps/mobile/eas.json` and `EAS-BUILD.md` appeared in the working tree while this was being written. | app lane | — |
| 10 | **The brain database's row-level security is open** — a policy named "Allow all users" over 309 phone numbers, 243 emails and 257 Stripe ids. Not an App Review item. **It is more urgent than every App Review item on this list**, because it is other people's data, exposed now. See `HANDOFF-2026-09-05.md` §5. | owner | — |

### Things that expire and want re-checking on the day you submit
- The **12 live alerts** expire 7–11 September 2026.
- **All 8 circles** expire on the same clock, including the one with the conversation
  in it. The core Swing room does not expire.
- The desk's newest picks are dated **5 September 2026** and will look stale within a
  fortnight.

---

## PART FOUR — THE DEMO ACCOUNT

**Credentials are NOT in this repository** — it is public. They live at:

```
~/.openclaw/secrets/cheatcode_ai_app_apple_review     (chmod 600)
```

following the same pattern as `cheatcode_ai_app_owner`. Copy the email and password
from there into **App Store Connect → App Review Information → Sign-In Required**.

### What the account has

| | |
|---|---|
| Sign-in | email + password, email already confirmed, onboarding already completed — the reviewer lands straight in the app |
| Mode | **swing** (the mode with the most content). Switchable in-app from Account or the Alerts header |
| Plan | `subscriptions` row: tier `premium`, status `active`, period end 2028-09-06 → **`trade_panel` is true, nothing is gated** |
| Paper account | $10,000 start · 2 open positions (SLB 40 @ 57.03, PFE 12 @ 28.45) · equity $9,998.68 |
| Alerts | 12 active cards, 25 history cards, 3 followed setups (NVDA, SNOW, VRNS) set active |
| Watchlist | NVDA, SNOW, DELL, VRNS |
| Community | member of the core **Swing** room (6 messages) and the **NVDA circle** (5 messages) |
| Desk | 60 themes, 11 watchlist names, 44 graded picks — visible after switching to invest mode |

Two additional accounts exist **only** to give the community a second and third
voice. They are seeded demo accounts, not members. Their credentials are in the same
file.

### How it was provisioned
Through the app's own API wherever possible — orders were placed with
`/orders/preview` + `/orders/submit`, rooms joined with `/rooms/:id/join` and
`/circles/:id/join`, messages posted with `/rooms/:id/messages`, setups followed with
`/setups/:id/follow`, watchlist symbols added with `/watchlist`. Only three things
were written directly with the service role, because no route exists for them: the
profile fields, the `subscriptions` row, and flipping three draft alerts to `active`.

**No row-level security policy was created, altered or dropped. No table was
opened.** RLS is enabled on all 78 tables of `eqepjztjmzmpvmlqsdiz`; the tables with
zero policies are service-role-only by design and were left that way.

---

## PART FIVE — SUGGESTED APP REVIEW NOTES

Draft. Correct the bracketed parts before pasting. **Do not paste this until
blocker #1 is fixed — every sentence about Kai is false while the credits are out.**

> Cheat Code AI is a private, subscription-based research and practice tool for
> people who trade and invest. A demo account is provided below; it is fully
> entitled, so nothing is gated.
>
> **All subscriptions are purchased on our website. The app contains no purchase
> path and does not link to one.** Subscribers sign in to the app with the account
> they created on the web.
>
> **All trading in the app is simulated.** No real money is involved, no brokerage
> account is connected, and no order is ever sent to a market. The app is education
> and preparation; it is not investment advice, and this is stated in the app, in the
> Terms and in the Privacy Policy.
>
> What to look at:
> • **Kai** — the assistant, on Home and in the Trade section. Ask him about a
>   ticker; he can look up prices, chart levels and company details.
> • **Alerts** — the second tab. Active shows what the system is calling now;
>   History shows the past record with what happened to each one.
> • **Trade** — a chart-first practice terminal with two open paper positions.
> • **Community** — member rooms and short-lived per-setup circles. Posts can be
>   reported, [and abusive members blocked — ONLY WRITE THIS ONCE BLOCKING EXISTS].
>
> The account is in **swing** mode, which has the most live content. Mode can be
> changed from the Account tab.
>
> Privacy policy: [URL] · Terms: [URL]
