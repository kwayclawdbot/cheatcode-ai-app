# HANDOFF — 2026-09-04, Cheat Code AI app

Everything done today on the app, where it lives, and what the next person picks up.
Plain English on the owner's standing instruction — no technical vocabulary.

**NOTHING IS PUSHED. NOTHING IS DEPLOYED.** All of today's work lives on one laptop, on
local branches. That is the single biggest risk in this handoff.

---

## 1. WHERE THE WORK IS

**Everything is on `feat/everything-on-57` in the worktree `~/projects/cheatcode-ai-sdk57`.**

That worktree is a second copy of the app repo, created so the Expo upgrade could run
without fighting the parallel Kai Live lane. It is where the owner runs the app.

```
9dd45d3  desk: make the research pages readable at a glance
a745f79  Invest finally means something: the second tab is alerts or the desk
0a425f4  merge: the research desk
7bf345a  There is one Trade section now, and the old one is gone
c58c6ff  merge: home
7af599c  merge: trade portal
2cc02f1  merge: chart vocabulary
b6aee40  The research desk, in the app        (desk lane, another session)
cf6fe17  SDK 57
78c0711  SDK 56
e67d2dc  SDK 55
bc5cd57  Trade is one job in three beats
cea74f8  Kai has something to draw with
654e163  Home: Kai wakes up
```

`~/projects/cheatcode-ai` is the ORIGINAL checkout. Leave it alone — the Kai Live lane owns
it and has **13 uncommitted files** there (chart apply/choreography, the shared director,
everything under `workers/kai-live`). They were untouched by every lane today and must stay
that way.

`~/projects/kai-brain` — the research brain. Latest `9f0af11`.

---

## 2. HOW TO RUN IT

```bash
pkill -f "expo start"
cd ~/projects/cheatcode-ai-sdk57/apps/mobile && npx expo start --clear   # phone, Expo Go
cd ~/projects/cheatcode-ai-sdk57/apps/api    && npm run dev              # second terminal
```

**The API must be running or the app signs you in and then shows nothing.**

### The env trap that cost an hour today — read this before making another copy

Git does not track `.env` files, so a fresh worktree gets NONE. Four are needed:

- `apps/mobile/.env` — Supabase URL and key, API base, VAPID key
- `apps/api/.env.local` — the real one
- `apps/api/.env.prod` — hosted credentials
- `apps/api/.env.development.local` — **DISABLED ON PURPOSE**, see below

They are copied into the worktree already. If you make another copy of the repo, copy them again.

### The stale override that cost the rest of that hour

`apps/api/.env.development.local` came from the 3 September Kai Live verification run and
points Supabase at **port 55321**, a separate stack. Next.js loads that file at HIGHER
priority than `.env.local`, so the API validated sign-in tokens against a database that had
never heard of the owner — while the app signed him in against 54321. Every request came
back "we could not find your account" while he was, in fact, signed in.

It is renamed to `.env.development.local.disabled-by-claude` in the worktree.
**The original is still live in `~/projects/cheatcode-ai/apps/api/` — anyone running the API
from there hits the same wall.** The file says "DELETE WHEN THE RUN IS DONE". The run is done.

---

## 3. WHAT WAS BUILT TODAY

### Expo SDK 54 → 57 — the owner's phone works again
Expo Go 57.0.9 reached the App Store on 2 September and Expo Go for iOS only ever runs the
NEWEST SDK, so his app stopped opening. Nothing in the app had changed; the client updated
underneath him. Upgraded one version at a time. Exactly one thing broke: in SDK 56 Expo
Router stopped being built on React Navigation, so the tab bar's type description was wrong —
Expo ships a fixer, one line, one file. `@react-navigation/bottom-tabs` removed because
nothing imported it any more. All 48 routes checked on 54 first, then again on 55, 56 and 57.
46 of 48 identical; one improved. Expo's own checker went 16/18 → 21/21.

### Home — Kai wakes up
One message on the first open of a day, built from what the app knows: market state, the one
thing that needs a decision, overnight movement, then a question and two or three offers.
Reopening later shows the same message marked EARLIER TODAY, no animation, no second
greeting. On a day with nothing it says so — *"I am not going to manufacture one."* On a
morning the data fails it says *"I would rather come up short than guess"*, and that failed
morning is NOT filed as the day's greeting. Removed: the top bar, thread title, market dot,
mode badge, opening line, priority card, "also watching" list — four things that were
competing.

### Kai's chart vocabulary
The complaint was "Kai doesn't accurately draw on charts". He was not drawing badly — he had
almost nothing to draw with. Ten level names, all off a graded setup; on a symbol with no
setup, **two of ten produced a number**. Now 22 levels and 7 drawings, all computed
server-side: yesterday's high/low/close, the year's high and low, swing highs and lows, the
8/21/50/200-day averages, the premarket high and low, the opening range, the day's high and
low, VWAP, trendlines that know whether they still hold, fib grids off a measured swing,
anchored VWAP. **The rule is unchanged and must stay: Kai names WHICH level, the server
resolves the number, the model never emits a price.**

Deliberately NOT carried over from the War Room: its trade-setup tools, which manufacture an
entry, stop and two targets for any symbol out of average-range arithmetic. This app grades
setups; a conjured plan looks identical to a graded one. (Also: the War Room's own
`compute_trade_setup` has never worked — it passes an argument the function does not accept.)

### Trade — one job in three beats
LOOK (chart, Kai marks it up) → DECIDE (grade, the three levels, what would prove it wrong) →
TAKE (confirmation card: entry, stop, target, size, dollars at risk, R; then Send, then a
receipt that goes Accepted → Filled and never claims a fill early). The old portal is
DELETED, the flag and the `?v=1|2` switch are gone, `?v=1` lands on the new one.

On a symbol with no graded setup Kai refuses to invent a plan and step 3 is locked with the
reason written out. **The trap that makes this necessary:** the server computes
`suggestedEntry = entry ?? quote.price`, so an ungraded symbol still returns an "entry" that
is just the last traded price with a label on it. The new section requires an entry AND a
stop before it will call something a plan. **The old plan screen still shows that fake entry —
flagged, not fixed.**

### The second tab is mode-aware — this is how the watchlist got in
Five tabs is the ceiling on a phone. The owner chose: day trade / swing → **Alerts**;
invest → **Research** (the desk), with its own icon and no alert badge. The mode chip sits on
the tab itself and a grey line says where the other half went. This finally makes Invest mean
something — onboarding used to say "coming in a later release".

Found and fixed on the way: `/desk` was never added to the route gate in `_layout.tsx`, so
**Account → Research desk bounced back to Home on any real login** — the desk was effectively
unreachable outside fixtures. Also the desk cards had no padding and text ran off the edge.

### The research pages, made visual
The owner: *"not just paragraph on paragraph"*. A thesis runs 4,000-11,000 characters — PDYN
is 11,054 — but every write-up is ALREADY filed under named headings and the app was printing
them flat. Now it renders an index of the analyst's own sections with a plain-English gloss
and a length bar each, **THE CALL open on landing**. Nothing summarised or reworded. Two
heading styles exist in the data and both are read; a write-up with none says so.

The dashboard is one ruled strip, hairlines, **no rounded rectangles anywhere on the screen**
— the standing design rule. Grade as a six-step ruler, the call as a drawn arrow, the horizon
as quarter ticks, the theme with its size meter and its timing on a clock kept separate.

**A real bug caught here:** the old screen showed *"Move potential 0.597"* — which was the
`score` column, the unitless number the desk sorts by. **It was never a return.** Removed;
eight tests now stop score, market cap or theme size leaking into that slot.

### The brain — every idea carries its conditions
Owner's ruling: *"the brain should build watchlist and track idea conditions etc then we will
later build triggers to turn the watchlist into alerts."* **Triggers are NOT built. Do not
build them.**

Conditions used to be computed for two chart states only, so all 7 watchlist names had none.
Now **7 of 7 carry an invalidation** plus written reasoning, how far the stock normally
travels, its band, how busy it is against its own normal, and the last-3-vs-last-50 range
reading. **0 of 7 carry a trigger, and that is the honest answer** — every name is `no_base`,
and the top of a 66%-wide range is not a level anyone defends. Verified correct: 38 of 48
large liquid names also read `no_base` that day.

It also caught that NREF is a SHORT and was being handed a long's conditions — an
invalidation 19% below the price, in the direction the idea wants to go.

**LATER CORRECTION FROM THE OWNER, which limits the above:** *"the desk is not a technical
trade alert system its a research analyst long term/swing accumulation system we have to build
the technical side into kai."* So do not extend the chart-trigger direction on the desk. For a
research desk, "what would kill this" is the thesis falsifier the brain already writes — not a
price level.

---

## 4. WHAT THE NEXT PERSON SHOULD DO

1. **PUSH.** Fourteen commits of work exist on one laptop. Nothing else matters if it is lost.
2. **Delete the stale override** in `~/projects/cheatcode-ai/apps/api/.env.development.local`.
3. **`potential_move_pct`** — the app is wired and waiting. The brain writes it on
   `brain_picks` as a percentage; the app reads it as `potentialMovePct` and prints it with no
   further app work. The owner said "build the compute later". This is that job.
4. **The desk barely grades anything** — 56 of 57 write-ups have no grade, 1 of 57 has
   catalysts, 24 of 57 have a horizon. The screens handle it honestly, but the output is thin.
5. **Import the remaining research fields**: `entry_benchmark`, `excess_pct`, `outcome`,
   `return_pct`, `revisit_count`, `news_90d`, `nominated_by`. For an accumulation system,
   performance against benchmark is the scoreboard and it is not in the app.
6. **The security item, unscoped:** `KAI_SUPABASE_KEY` has full write AND delete on the
   brain's tables and row-level security on that schema is open. It stays server-side and no
   route forwards it, but it is one mistake from emptying the watchlist and the research.
7. **The `.US` suffix bug:** `content_engine.py:92` and `trade_executor.py:135` send `SPY.US`
   to Polygon, which rejects it — verified, `SPY` works and `SPY.US` returns NotFound. Left
   alone because fixing it changes behaviour.

---

## 5. DATA — WHICH DATABASE HOLDS WHAT

- **Local Supabase** (`127.0.0.1:54321`, db on 54322) — where the owner's account lives, 309
  users. Setups only ran to 1 September until today's sync.
- **Hosted app database** (`eqepjztjmzmpvmlqsdiz`) — has today's setups, but **only 4 users
  and the owner is NOT one of them.** Pointing the app there means he cannot sign in.
- **The brain / SMS scanner** (`ryprohqthwflinadqotj`) — 2,328 sent alerts, `brain_picks` 57,
  `themes` 6, `theme_history` 52, `theme_nominations` 106, `vault_store` 3,661,
  `watchlist_status` 7. The desk reads this directly, read-only except adding a manual ticker.

**Today's fix:** 9 recent setups were copied from hosted into local, so DELL / SNOW / NVDA
(4 Sep) and CNH / VRNS / GTLB (3 Sep) now show in Alerts without moving the owner to a
database he does not exist in. **That was a one-off copy, not a sync — it will go stale.**

**The app's alerts are the `setups` table, not `alerts`.** The `alerts` table is empty in both
databases. A mistake was made today reading `alerts` and concluding the hosted database was
empty; it was not.

---

## 6. HOW TO WORK ON THIS APP

- Read the versioned Expo docs before writing component code — `apps/mobile/AGENTS.md`
  insists, and the app is now on SDK 57.
- Two recorded traps: a font gate returning null before fonts load kills clicks on web (guard
  with `Platform.OS !== 'web'`), and Expo Router index collisions at "/" give a silent blank
  screen.
- Prove screens in fixtures mode: `EXPO_PUBLIC_FIXTURES=1` renders everything with no network.
  A screen that compiles is not a screen that works — tap through it.
- **Never generic card containers.** No boxed rounded-rectangle grids. Compose with
  typography, rules, and objects that have their own identity. Volt is the user, violet is
  Kai, cyan is the market.
- Plain English to the owner, in chat AND in documents. He has asked three times.
- Never manufacture a number. A blank with an honest reason beats a plausible wrong figure —
  that principle is now enforced in the chart resolver, the trade section, the watchlist
  conditions and the potential-move slot.
