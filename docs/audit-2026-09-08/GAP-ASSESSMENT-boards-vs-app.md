# GAP ASSESSMENT — the 2026-09-08 concept boards against the app as it stands

What each board asks for, what the app already does, and what is actually missing —
split into frontend and backend, and sized.

Read against `feat/everything-on-57` at `29599ae` + the five boards added alongside
this file. Every claim below names the file or migration it came from, so the next
person can check it rather than trust it.

---

## 0. THE HEADLINE

**The backend is not the problem.** Four of the five boards are, in the main, a
rendering job against contracts that already exist and already carry the numbers the
boards print.

Three findings drive nearly all of the real work, and none of them is a screen:

1. **There are two belt systems, and the boards pick the one that is device-local.**
   `user_points.belt` (migration 0039) is earned by resolved *calls* and is the belt
   already drawn on every name in the room. The training belt — the one Board 09's
   Belt Profile actually shows, with Knowledge · Planning · Discipline and a Blue Belt
   checklist — comes from `features/training/xp.ts` and lives **only in AsyncStorage
   on the device**. Board 08 prints "Progress saved" and "Saved to your account"; today
   neither is true. This is the single largest piece of backend work on the list, and
   it needs an owner decision before a line of it is written (§6).

2. **The boards change the room model.** The switcher lists Main room · Beginners ·
   Swing · Investing and says *"Reading a room keeps your trading preferences."*
   Today there are four core rooms — `day-trade`, `swing`, `investing` (0019) and
   `beginners` (0043) — and reading a room **is** the global mode: `(tabs)/community.tsx`
   is explicit that one headbar control writes `profiles.primary_mode` and the feed
   simply shows whatever room that mode names. The boards want the two decoupled and
   Day Trade renamed to a mode-less "Main room". That is a schema seed change plus an
   argued reversal of a documented decision, not a new sheet.

3. **The app has no offline layer.** `api.available()` means "is an API base URL
   configured", not "is there a network". There is no NetInfo, no cached read, no
   draft persistence. Board 07's Offline/Recovery screen is a genuinely new capability.

Everything else is smaller than it looks.

---

## 1. COMMUNITY — rooms, switcher, focused discussion
`board-community-rooms.png`

### Already built
| Board element | Where it lives |
|---|---|
| Belt on the author's name | `features/social/MemberName.tsx`, wired at `community/ui/Message.tsx:129` and `ClubFeed.tsx:178` |
| Circles row with ticker + TTL | `features/circles/CirclesRow.tsx`, `GET /v1/circles` |
| Pinned setup card with mini chart + Entry/Stop/Target | `community/ui/PinnedSetup.tsx` |
| One-level thread with indented answers | `app/thread/[id].tsx` — quotes resolve to a top-level anchor (0033 §1, 0035 §3) |
| Reactions, replies count, overflow actions | `MessageActionsSheet`, `POST /v1/messages/:id/reactions` |
| Member count | `roomStats()` in `apps/api/src/lib/rooms.ts:127` |
| Composer, attachments, realtime | `RoomComposer`, `lib/realtime.ts` |

### Frontend gaps
- **"Find your room" sheet** — does not exist. Today's control is `ModeSegmented` in
  the headbar. New bottom sheet: four rooms with descriptions, Circles strip with
  "See all", and the preferences footnote. **S.**
- **Pinned setup in the feed and in the thread.** `PinnedSetup` is rendered in exactly
  one place, `app/room/[id]/index.tsx:417`. The boards show it at the top of the
  community feed *and* pinned above a focused discussion. Component exists; two call
  sites do not. **S.**
- **"Ask Kai to explain the stop" inside a thread.** `thread/[id].tsx:277` deliberately
  punts Kai back to the room (`onKai={() => router.back()}`). The board puts a
  contextual Kai CTA in the thread, bound to the pinned setup. **S–M** — needs a
  question pre-seeded from the setup's levels, not a generic composer.
- **"342 online".** `Room.discussing_count` is declared in
  `features/community/types.ts:57` and **never set by the API** — grep returns nothing
  in `apps/api/src`. It is a dead field today. **See backend.**

### Backend gaps
- **Presence.** There is no online count anywhere. Two options: (a) cheap — define
  "online" as distinct posters in a rolling window and finally compute the
  `discussing_count` the client type already reserves; (b) real — Supabase Realtime
  presence on the room channel. (a) is **S** and honest if the label says "active
  today"; (b) is **M** and is the only thing that earns the word "online".
- **The Main room.** Requires a seed migration plus a decision — is Main a *fifth*
  room, or is Day Trade renamed? 0043 asserts in SQL that every `app_mode` has exactly
  one core room and raises if not, so a rename must satisfy that check or amend it.
  **S** as code; the decision is the hard part.
- **Decoupling room from mode.** `GET /v1/rooms` already returns every core room to
  everybody and only *echoes* the mode — the API is ready. The coupling is entirely in
  the client. **No backend work.**

---

## 2. LEARNING — training path, interactive lesson, companion video
`board-08-learning-you-can-touch.png`

### Already built
- The path screen (`app/training/index.tsx`), lesson runner
  (`features/training/engine/LessonRunner.tsx`) and five visual screen kinds:
  `share_grid`, `flow`, `cards`, `split`, `formula` (`engine/screens.tsx:288-292`).
- **The board's middle screen is already shipped.** "Own a piece of the company /
  10 shares = 10% ownership" is the `share_grid` visual in `content/day1-lesson1.ts`.
- The honesty mechanism the board's "Foundations in development" needs: `hasContent`
  on each lesson node, so the path will not offer a lesson that does not exist.

### The problem
**One lesson of thirty has content.** `curriculum.ts` says so in as many words:
*"`hasContent` is true for `d1l1` and false for the other twenty-nine, because
`content/day1-lesson1.ts` is the only lesson that has been written."* The seven-day
path is scaffolded end to end and empty behind the first door.

Note the boards quietly reframe seven days as three steps — 01 Market basics ·
02 Read a chart · 03 Build a plan, with 02 and 03 marked "Coming next". That maps
cleanly onto `day-1` and `day-2` and is a *smaller* promise than the current screen
makes. Worth taking.

### Frontend gaps
- **Inline video player + transcript.** `engine/screens.tsx:596` links out
  ("Open 6:12 on YouTube"). The board shows an embedded player with scrubber, CC,
  fullscreen and a Transcript link. The code already names the fix: YouTube's terms
  require their player, so native means `react-native-youtube-iframe` over
  `react-native-webview` (webview is installed; the iframe package is not). Transcript
  is a new content field with no source today. **M.**
- **Three-step path presentation** over the seven-day list. **S.**

### Backend gaps
- **None for this board** beyond §3's persistence, *but the content is the work*:
  29 unwritten lessons, and every human video is in state `filming`
  (`types.ts:325`) — i.e. not shot. That is a content programme, not an engineering
  ticket, and it is the true critical path for the whole learning half of the product.

---

## 3. PROGRESS & BELTS — lesson complete, skill progress, belt profile
`board-09-progress-with-meaning.png`

### Already built
- `app/training/progress.tsx` — skill bars, per-day gates, mastery tags, competency
  signals (`unproven → developing → passed → strong → mastered`).
- Anti-farming arithmetic that the belt ladder depends on: `xp.ts` enforces that a
  competency is satisfied **only** by a passed assessment, and there is a test
  (`training-gates-test.mts`) that walks every farming route and checks each one stops.
  Do not rebuild this; it is the good part.
- A separate, server-side, fully-built belt: 0039's `point_events` / `user_points` /
  `belt_for()`, surfaced through `BeltBlock` in `packages/shared/api.ts:1930`, the
  leaderboard, and `BeltUpSheet`.

### Frontend gaps
- **Belt Profile screen** — no route exists. Needs the belt render, the three pillars
  (Knowledge · Planning · Discipline), the completion ring and the "Next: Blue Belt"
  checklist. **M.**
- **Lesson Complete screen** — the board's version restates the concept, shows the
  visual again and offers "Continue learning / Back to my path". The runner ends
  differently today. **S.**
- **Skill Progress** reshaped to one module ring + Passed/Practising/Next rows + a
  "Next skill" card. The data behind it exists; the layout does not. **S–M.**

### Backend gaps — **this is the big one**
- **Training progress is device-local.** `features/training/store.tsx` writes
  AsyncStorage key `ccai.training.profile.v2` and nothing else. Reinstall the app,
  change phone, and every belt and competency is gone. The boards promise the
  opposite in text on two screens.
- **The LMS tables exist and are unused.** `lessons`, `lesson_progress`,
  `course_modules`, `courses` were created in 0012 and a grep across `apps/` and
  `workers/` returns **no reads and no writes**. They were built for a different
  curriculum shape than the one `curriculum.ts` now describes.
- Work required: decide whether to adopt 0012's tables or add a training-progress
  table matching today's model; write `GET/PUT /v1/training/progress`; move the XP
  ledger and competency signals server-side **with the award rules enforced in SQL or
  in the route**, not on the phone — the anti-farming rule is worthless if a client
  can POST its own competency; migrate existing device profiles on first sync.
  **L — 5–8 days.** Everything else on Board 09 is blocked behind it.

---

## 4. PAPER TRADING — order review, receipt, active position
`board-practice-with-confidence.png`

**This board is essentially free.** The contract already carries every number it prints.

`OrderPreviewResponse` (`packages/shared/api.ts:3052`) returns, in `risk`:
`per_share_risk`, `max_loss_usd`, **`rr`**, **`daily_cap`**, **`daily_used`**,
**`daily_remaining`**, plus `hard_stop_plain`. `dailyRisk()` is already computed and
already surfaced on home, plans, symbols and trade/landing.

### Already built
`app/order/review.tsx` (paper chip, account, quantity, order type, limit, duration,
estimated cost and fees, buying power after, Kai risk check, stop and target legs,
maximum planned loss, blockers), `app/order/confirmed.tsx`, `app/order/[id].tsx`,
`app/position/[id].tsx` (planned entry, actual entry, stop, target, Ask Kai).

### Frontend gaps
- **Daily risk budget bar** — "$26 of $100 planned · 26%". Data is in the response;
  the bar is not on this screen. **S.**
- **Risk 1R → 2.6R meter** — `risk.rr` is right there. **S.**
- **Mini chart with entry/stop/target bands** on the review screen. `MiniChart` and
  the `PinnedSetup` chart already draw this shape. **S.**
- **Submitted → Filled two-step tracker** on the receipt. Order status exists; the
  stepper does not. **S.**

### Backend gaps
**None.** Confirmed by reading the contract, not inferred.

---

## 5. RETURN · REVIEW · RECOVER
`board-07-return-review-recover.png`

### 5a. Trade Review — **M**
Today's debrief (`DebriefPayload`, `api.ts:1416`) carries `outcome`, `process_receipt`,
`what_worked`, `what_failed`, `timeline`, `lesson_plain`. `app/debrief/[id].tsx`
renders it with a Save-lesson action.

The board asks a narrower and better question: **did you follow your own plan?** —
"Entry followed ✓ · Stop respected ✓ · Exit changed ⚠ — you exited at 186.20, not your
195.00 target", then "Practise the exit".

`process_receipt` is the right-shaped field for this (`label` / `ok` / `detail_plain`)
but it is not populated with plan-adherence today. The inputs all exist —
`trade_plans`, `orders`, `fills`, `positions` — so this is a computation to add to the
debrief builder, not new data. **Backend S–M.**

Two things the board shows that are genuinely absent: the **closed-trade chart with
entry/exit/target markers** — the screen currently says *"Chart replay arrives with
live market data"* — and the **"Practise the exit" hand-off** from a debrief into a
targeted training exercise, which does not exist in either direction. **M each.**

### 5b. Quiet Market Home — **S–M**
`HomeResponse` returns `market`, `briefing`, `lead_setup`, `watching`, `daily_risk`.
There is no "nothing needs a decision" state, no "Last checked 8:42 AM", and no
practice recommendation. Training already rides on home
(`features/training/HomeObject.tsx`), so the hook exists.
Backend: a quiet determination (empty `watching` + no lead setup + session closed or
flat) and a recommended-practice pointer. **S** on top of what `/v1/home` already knows.

### 5c. Offline / Recovery — **M–L, and new**
Nothing here exists. Required:
- `@react-native-community/netinfo` (not installed) and a connectivity provider.
- A read cache so the saved plan, levels and last candles survive going offline —
  the board renders the chart greyed and the plan labelled "not live".
- "Last updated 8:42 AM" provenance on cached reads.
- "Retry connection".
- **Composer draft persistence** — the board's "Draft saved". Drafts are in-memory today.

Note the app is *not* starting from zero conceptually: `FreshnessMark`
(`live | delayed | stale | closed`) is exactly the right vocabulary and already
refuses to let a price render without a freshness. Extending it to a real
connectivity state is the coherent move. Backend: **none** — every endpoint already
returns timestamps.

---

## 6. DECISIONS THE OWNER OWES BEFORE BUILD

1. **Which belt is *the* belt?** Calls-earned (0039, live, on every name) or
   training-earned (Board 09, device-local)? If both, they need different names and
   different marks — one member wearing two different belts on two screens is the
   worst outcome. Board 09 shows a training belt in the same visual language as the
   calls belt already in the room.
2. **Main room: rename Day Trade, or a fifth room?** 0043 asserts one core room per
   mode in SQL and will raise on a careless change.
3. **Does reading a room still set your trading mode?** The boards say no. The current
   design says yes, deliberately and in writing ("one switch, not two", owner, 7 Sept).
   This reverses that.
4. **"342 online" — real presence, or an honest proxy?** A fabricated number on a
   community screen is the kind of thing this codebase has so far refused to ship.
5. **Seven days or three steps?** The boards promise less. Recommend taking it.
6. **Who writes the 29 lessons and shoots the videos?** No amount of frontend work
   moves this.

---

## 7. SUGGESTED ORDER

**First — cheap and visible, no decisions needed (~1 week)**
Board 4 in full (risk budget bar, R meter, review chart, fill stepper); pinned setup
in the feed and the thread; the three-step training path; Lesson Complete.

**Second — the unblocker (~1–1.5 weeks)**
Server-side training progress. Board 09 cannot ship honestly without it, and
"Progress saved" is currently a false statement on a shipped screen.

**Third — needs decisions first**
Room switcher + Main room + mode decoupling; presence; Belt Profile once §6.1 is
settled.

**Fourth — new capability**
Offline layer, then Quiet Market Home on top of it.

**Running in parallel, on its own clock**
Lesson content and video production. Start now; it is the longest pole and nothing
in engineering shortens it.

---

## 8. WHAT I DID NOT ASSESS

- The **PDF audit** (`3be587b0-CheatCodeAIUXUIAudit.pdf`) — this compares the five
  boards to the code, not the written audit. Its findings may add to or contradict
  what is above.
- `apps/site` (the marketing funnel) and `workers/kai-live` — no board touches them.
- The four boards already in this directory (three home states, A Personal Start,
  Investing Made Clear, the trade-idea detail). The stage-aware home they show is
  substantially built — `homeOrderFor(profile?.stage)` at
  `app/(tabs)/home.tsx:93`, backed by 0042 and `POST /v1/stage/evaluate`.
