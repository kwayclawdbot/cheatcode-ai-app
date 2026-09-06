# Privacy Policy — Cheat Code AI

> ## ⚠ THIS IS A DRAFT, NOT A LEGAL DOCUMENT
> It was written by an AI agent from the actual code and the actual database, so
> the facts in it are real and checkable. That is not the same as being legally
> sufficient. **A lawyer must read this before it is published.** The section at
> the bottom, "What I most want a lawyer to read", says where I am least confident.
> Placeholders in `[SQUARE BRACKETS]` are things only the owner can fill in.

**Last updated:** [DATE OF PUBLICATION]
**Applies to:** the Cheat Code AI mobile app and the Cheat Code AI website.

---

## 1. Who we are

Cheat Code AI is operated by **[LEGAL ENTITY NAME]**, at **[REGISTERED ADDRESS]**.
You can reach us about anything in this policy at **[PRIVACY CONTACT EMAIL]**.

Cheat Code AI is a private, registration-based service. You get an account, you sign
in, and you use it to research trades, practise with simulated money, and talk to an
AI assistant we call Kai.

## 2. What this policy covers, in one paragraph

We collect the things you tell us (your email, your answers to a short questionnaire
about how you invest, everything you type to Kai, and anything you post in the
community), the things you do in the app (what you watch, what practice trades you
place, what you tap), and the technical bits needed to deliver a notification to your
phone. We do not track you across other companies' apps or websites. We do not sell
your information. We do not run advertising. There is no analytics SDK, no crash
reporter and no advertising SDK in the app at all.

## 3. What we collect, and why

### 3.1 Things you give us

| What | Why we have it |
|---|---|
| **Your email address and password** | To create and secure your account. Passwords are handled by our authentication provider (Supabase) and we never see or store the password itself. |
| **Your display name and handle** | So the community knows who wrote a post. |
| **Your answers to onboarding** — which mode you want (day trading, swing, investing), how much experience you have, how much risk you are comfortable with, how much you want to start your practice account with, and which sectors interest you | To decide what Kai shows you, how he explains things, and what your practice limits are. |
| **Everything you type to Kai** | To answer you, and to give Kai the thread of the conversation so his next answer makes sense. |
| **Everything you post in the community** | It is a message board. Other members in the same room see it. |
| **The sentences you type to create an alert** | To turn "tell me when NVDA closes above 185" into a condition we can actually watch. |

### 3.2 Things the app creates as you use it

- **Your practice account.** Simulated cash, simulated positions, simulated orders
  and fills. **No real money is ever involved and no real broker is connected.**
- **Your watchlist and your alerts.**
- **What Kai remembers about you** — short notes he extracts from your conversations
  (a preference, a pattern he noticed, something you told him once) so he does not
  make you repeat yourself. You can see every one of these in Account → *What Kai
  remembers*, delete them one at a time, delete all of them, or turn the whole
  feature off.
- **A record of your activity** — orders placed, positions changed, alerts fired,
  notifications delivered, and a per-question record of how much each answer from
  Kai cost us to produce. That last one exists so we can enforce a fair daily
  allowance, and so we can tell you exactly why you have run out of it.
- **Your subscription status**, if you have one, including the customer and
  subscription identifiers Stripe gives us. We never see or store your card details.

### 3.3 Your device

- **Notifications.** If you allow them, we store a push token for your device (or,
  on the web, a push subscription), along with the platform and a friendly label like
  "iPhone" so you can tell your devices apart in settings.
- **Nothing else.** The app never asks for your camera, your photos, your location,
  your contacts, your calendar, your microphone or your files. It does not read your
  mail or your text messages. There is no advertising identifier and no App Tracking
  Transparency prompt, because there is nothing to track you with.

### 3.4 What we deliberately do not collect

We do not ask for your phone number, your address, your date of birth, your income,
your real brokerage account, or your real holdings.

## 4. Who else sees your information

These are the companies that process data on our behalf. This list is complete as of
the last-updated date and was checked against our own source code, not assembled from
a template.

| Company | What they receive | What they do with it |
|---|---|---|
| **Supabase** | Everything described in section 3 — this is our database and our sign-in system. | Stores and serves it. Your phone talks to Supabase directly to sign you in and to load your profile. |
| **Anthropic** | The text of your conversation with Kai, together with the context we assemble for him: which mode you are in, your stated experience level, how you want things explained, your display name if you have set one, **and the balances and risk limits of your simulated practice account.** | Generates Kai's answers. **We do not send your email address, and we do not attach your account identifier to the request.** |
| **OpenAI** | The words Kai has already written, when you ask him to speak an answer aloud. | Turns text into speech. No identifier is attached. |
| **Polygon.io** | Ticker symbols and dates. Nothing about you. | Supplies prices, company details and logos. |
| **Expo** | Your push token and the title and body of the notification. | Delivers the notification to Apple, who deliver it to your phone. A notification may name a ticker and a price. |
| **A web push service** (Mozilla, Google or Apple, depending on your browser) | On the web only: a subscription address and an **encrypted** payload they cannot read. | Delivers browser notifications. |
| **Stripe** | Your email address, our own identifier for your account, and which plan you are buying. | Takes the payment. **Stripe collects your card details on their own page; we never receive them.** |
| **Vercel** | Hosting for our servers. As with any web host, their platform logs record request paths, timestamps and the IP address a request came from. | Runs the service. |
| **Apple** | App distribution and notification delivery. | — |

**We do not sell your personal information, and we do not share it with data brokers
or advertisers.** We have never done so and there is no mechanism in the product for
doing so.

**On AI training:** whether Anthropic or OpenAI use API traffic to improve their
models is governed by their own commercial terms, not by us. **[OWNER: read
Anthropic's and OpenAI's current commercial API terms and state the true position
here. Do not let this sentence be guessed at.]**

## 5. How long we keep things

- **Your account and everything attached to it** is kept while your account exists.
- **Your conversations with Kai** are kept as part of your account.
- **Community posts** stay in the room they were posted in. A post removed by a
  moderator is hidden from other members but is retained in our records so we can
  answer a dispute or a legal request.
- **[GAP — OWNER MUST RESOLVE BEFORE PUBLISHING]** We do not currently run any
  scheduled deletion of old data. If you want to state a retention period here, one
  has to be built first. Stating one you do not enforce is worse than stating none.

## 6. Your choices and your rights

- **See what Kai remembers about you, and delete it.** Account → *What Kai
  remembers*. Delete one item, delete everything, or turn memory off entirely.
- **Turn notifications off**, per category, in Account → Settings, or at the
  operating-system level.
- **Delete your account.** **[GAP — OWNER MUST CONFIRM BEFORE PUBLISHING. As of
  6 September 2026 no account-deletion route existed in the API and no deletion
  screen existed in the app. Another lane is building it. This section must not
  claim a deletion right until that ships and has been tested end to end — Apple
  Guideline 5.1.1(v) requires it for any app with account creation, and a policy
  promising something the product cannot do is the worse of the two failures.]**
  When it ships, this section should say: what deleting does, what is removed
  immediately, what is retained and why, and how long it takes.
- Depending on where you live, you may have rights to access, correct, export,
  restrict or object to our use of your information, and to complain to a regulator.
  Write to **[PRIVACY CONTACT EMAIL]** and we will respond within
  **[STATUTORY PERIOD — depends on jurisdiction; a lawyer should set this]**.

**One thing to be straight about:** we keep a separate internal record of people we
have done business with, for accounting and support. If you delete your account, that
business record does not automatically disappear with it. **[OWNER + LAWYER: decide
the policy here and then make the code match it. Today `crm_people` is deliberately
built to survive account deletion.]**

## 7. Security

- Traffic between the app and our servers is encrypted in transit.
- Your sign-in session is stored in your device's secure keychain, not in plain
  storage.
- Access to the database from our servers uses a privileged key that never leaves
  the server and is never sent to your phone.
- Row-level security is enabled on every table in the app database.

We are not going to claim our security is perfect. No one should. If you find a
problem, tell us at **[SECURITY CONTACT EMAIL]** and we will take it seriously.

## 8. Children

Cheat Code AI is not for children. It is intended for adults, and it discusses
markets, risk and money. Do not use it if you are under **[MINIMUM AGE — 18, or the
age of majority where you are; a lawyer should set this]**. We do not knowingly
collect information from children. **We currently have no technical age check** — if
you believe a child has created an account, write to **[PRIVACY CONTACT EMAIL]** and
we will remove it.

## 9. Where your information is processed

Our database, our servers and our AI providers are in the **United States**. If you
use Cheat Code AI from outside the United States, your information is transferred
there. **[LAWYER: if the service is offered in the EEA or the UK, this section needs
a transfer mechanism — Standard Contractual Clauses or equivalent — and it needs to
be true, meaning the agreements have to actually be in place.]**

## 10. Changes

If we change this policy in a way that matters, we will say so in the app before the
change takes effect, and update the date at the top.

## 11. Contact

**[LEGAL ENTITY NAME]**
**[REGISTERED ADDRESS]**
**[PRIVACY CONTACT EMAIL]**

---

## What I most want a lawyer to read

Ranked, most important first. These are the places where I know the draft is thin,
not the places I forgot about.

1. **Section 6, the deletion right.** Apple requires account deletion from inside the
   app for any app that creates accounts. Today the product cannot do it. This
   section is written as a gap on purpose. Do not publish it as a promise until the
   feature exists and someone has actually deleted a test account with it.
2. **Section 4, what Anthropic receives — specifically that we send the balances of
   the user's practice account into a third-party model.** The money is simulated, so
   I do not think it is financial data in the regulated sense. I am not confident
   enough in that to want it unchecked.
3. **Section 4 and 6 together, on the internal CRM.** It stores email, lifetime spend
   and computed scores like churn risk and buy propensity, and it is designed to
   survive account deletion. Under GDPR that is profiling, and under CCPA it is a
   disclosure question. The code and the policy have to be made to agree, and a
   lawyer should say which one moves.
4. **Section 9, international transfers.** If the app ships to the EU or the UK
   store — which it will unless the owner restricts territories — this section is
   currently a description, not a compliance mechanism.
5. **Section 8, children.** No age gate exists. Combined with a trading app, a
   lawyer should decide whether an age assertion at sign-up is required and what the
   App Store age rating has to be.
6. **The absence of a retention schedule (section 5).** "We keep it while your
   account exists" is honest but it is not a retention policy, and several regimes
   expect one.
