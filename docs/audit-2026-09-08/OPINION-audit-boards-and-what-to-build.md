# COMPLETE OPINION — the audit, the boards, and what to actually build

Companion to `GAP-ASSESSMENT-boards-vs-app.md` (boards vs code) and
`BELT-MERGE-spec.md` (the merged belt system the owner asked for).
This one is the judgment call.

---

## 1. THE AUDIT IS GOOD, AND I CHECKED ITS TEETH

I did not take it on trust. I pulled its two most load-bearing claims into the
source and both are real:

**F04 — Kai conversation identity (P0). Confirmed.**
`useKaiWall(mode, seed)` at `apps/mobile/src/lib/useKai.ts:41` takes exactly two
arguments — a mode and a seed — and owns its own `convoId` in a ref (`:50`). There is
no conversation ID input. Selecting a saved conversation on Home can therefore change
the label and the seed text while the next turn goes to whatever conversation the ref
is holding. The audit's description is precise, and this is the most serious defect in
the document: it is a correctness bug that can put one member's answer in the wrong
thread, and no board fixes it.

**F12 — mastery inflates on repeat. Confirmed.**
`features/training/store.tsx` dedupes `completedLessonIds` (`:91-93`) and dedupes the
per-day list (`:107-113`) — and then adds `result.masteryGain` unconditionally at
`:95-98`. Re-run the same lesson and the bar moves again. That is competence you can
tap for.

**F10 — progress belongs to the device. Confirmed, and worse than I put it.**
I wrote this up as a persistence gap. The audit is right that it is a
product-integrity bug: `ccai.training.profile.v2` is one constant key with no account
ID, the provider wraps the whole app, and there is no reset on sign-out. Two accounts
on one handset inherit each other's learning — and because `useStageEvolution` feeds
readiness evidence *from that local profile*, the contamination reaches
`profiles.stage`. It is not "sync is missing", it is "the readiness signal can be
wrong about the wrong person".

**One correction to the audit.** Its "significant delivery distinction" — that the
component kit (TradeMap, RiskRewardRuler, SetupPreview, TradeStatusStrip,
KaiAnnotation, PinnedTradePreview, ConversationPreview) is not in the audited app —
was true at its baseline `7f75801` and is now stale by three commits. All seven
components landed on 8 September in `aedc10c` and `113ec2c`, live at
`apps/mobile/src/ui/trade/index.tsx`, reading the shared model from
`packages/trade-ui/model`. The audit's underlying point still stands, though: exactly
**one** file imports them (`features/community/ui/PinnedSetup.tsx`). A kit with one
consumer out of ~54 customer routes is not adoption. Everything the audit says about
integrating it applies; it just no longer needs writing first.

**Where the audit and I disagree on emphasis.** It rates F13 (rooms change global
mode) P1 and F12 (competing progress systems) P2. I would raise F12, because the
owner's belt decision now makes it structural rather than cosmetic — see §3.

---

## 2. THE HONEST SUMMARY: TWO DOCUMENTS, ONE VERDICT

The boards are a **redesign**. The audit is a **repair list**. They agree far more
than they conflict, and where they overlap they are describing the same three holes:

| The hole | Boards call it | Audit calls it |
|---|---|---|
| Training is an empty promise | "Foundations in development" | F09 (P0) — 1 of 31 lessons playable |
| Progress is not the learner's | "Progress saved", "Saved to your account" | F10 (P0) — device, not learner |
| Room switching hijacks the mode | "Reading a room keeps your trading preferences" | F13 (P1) |

**My verdict: do not build the boards first.** Five new screens on top of a
device-local progress store, a conversation wall that can answer into the wrong thread,
and a settings screen whose accessibility toggles are saved but never read (F19 —
also confirmed: `text_scale` and `reduced_motion` appear only in settings, types,
fixtures and adapters, never in the `T` primitive) is five new screens' worth of extra
surface over the same bugs.

The boards are not wasted in the meantime. Most of what they ask for is small
(§4), and the pieces that are cheap are also the pieces that *demonstrate* the repairs
— a paper-order screen with a working risk-budget bar is a better proof that the
lifecycle is sound than any amount of green CI.

---

## 3. ON THE BELT DECISION — IT IS THE RIGHT CALL, AND IT PAYS FOR ITSELF

The owner's instruction: **XP accrues from lessons *and* trade calls; the belt itself
is only earned by taking and passing a test.**

That is the correct answer, and not only as a product preference. It resolves, in one
decision, the thing both documents were circling:

- It answers my §6.1 (which belt is *the* belt) — there is now one belt, with two
  income streams.
- It answers the audit's blunt warning under F12: *"Do not present a Black Belt as
  proof of safety... If discipline is meant to earn progression, it must be measured
  by the scoring system before the UI claims it."* An exam measures it. A points total
  never did.
- It kills the failure mode 0039 was already nervous about and `xp.ts` already fights:
  a ladder you can climb by volume. `xp.ts` states the rule in as many words —
  *"belts cannot be farmed by letting videos play"* — and enforces it as arithmetic.
  The exam gate is that same rule applied one level up.

And it is *cheaper than it sounds*, because it forces the work that was already
Batch 1. A belt you have to pass a test for cannot be graded on the phone. So the
merged belt requires server-side training progress — which is F10, the audit's own
P0. One project, not two.

The full design — schema, the ledger, the exam, eligibility per rung, what happens to
belts people already hold — is in `BELT-MERGE-spec.md`.

One thing I want to say plainly, because it is the risk in this decision: **an exam
that is easy is worse than no exam.** The moment a Blue Belt is available for tapping
through ten multiple-choice questions, the belt means less than the points total it
replaced, and the audit's "do not present a belt as proof of safety" becomes a live
liability rather than a caution. The spec's applied tasks — mark the entry, put the
stop where the idea is wrong, size it to 1R — are not decoration. They are the reason
the exam is worth building.

---

## 4. WHAT I WOULD ACTUALLY BUILD, IN ORDER

The audit's four batches are sound. This is those batches with the boards folded in
and the belt decision applied — the differences from the audit's order are marked.

### Batch 1 — Repair trust (nothing new ships until this is done)
- **F04** conversation identity: make `conversationId` an explicit input to the wall,
  load the transcript, abort the old stream on switch.
- **F10 + the belt decision together**: learner-owned, server-side training progress,
  keyed to the account, with the XP ledger and competency awards enforced server-side.
  *Changed from the audit:* this is now also the foundation of the belt, so build it
  to `BELT-MERGE-spec.md` rather than as a straight lift-and-shift of the local shape.
- **F12 repeat-safety**: fixed for free by the ledger's idempotency key (spec §3).
- **F09** curriculum honesty: advertise the one playable lesson, label the rest
  planned. The boards already do this ("Foundations in development") — take their
  copy.
- **F19** accessibility provider; **F17** entitlements rendered from their own
  `included` value.

### Batch 2 — First useful experience
- The whole paper-practice board (§4 of the gap assessment): risk-budget bar, R ruler,
  review chart, fill stepper. **Zero backend.** `OrderPreviewResponse` already returns
  `rr`, `daily_cap`, `daily_used`, `daily_remaining`, and `RiskRewardRuler` already
  exists at `ui/trade/index.tsx:301`. This is the cheapest visible win on either list.
- **F06** SetupPreview as the default alert object — the component exists, it needs
  call sites.
- **F03** stage-specific opening; **F08** one execution vocabulary; **F11** mid-lesson
  checkpoint and resume.
- Board 08's three-step path and Lesson Complete.

### Batch 3 — Connect the app
- **F13** room independence + the boards' room switcher sheet + the Main room
  decision. These are one piece of work; do not do them separately.
- **F14** a welcoming room: pinned setup in the feed and the thread (component exists,
  two call sites missing), question starters, "Ask Kai to explain the stop".
- Presence, or an honest proxy — decide which before drawing "342 online".
- **F15** desk, **F16** Account, **F18** shared quiet/stale/failed states.

### Batch 4 — Finish the experience
- Belt Profile screen and the exam UI (blocked on Batch 1, not before).
- Board 07: trade-review adherence (`process_receipt` is the right-shaped field and is
  not populated with it today), Quiet Market Home, then the offline layer — NetInfo is
  not installed and `api.available()` only means "is a base URL configured".
- **F05** Kai recovery/stop, **F07** chart refinement, **F20** contrast and type
  (`color.dim` #6E675F on #0B0B0E is ~3.5:1, under the 4.5:1 floor), **F21** the
  funnel's mailto ending.

### Running on its own clock, starting now
Lesson content and video production. 30 unwritten lessons; every human video is in
state `filming`. Nothing in engineering shortens this, and after the belt merge it is
on the critical path for the *belt*, not just for training. Start it this week.

---

## 5. THE FIVE DECISIONS STILL OUTSTANDING

The belt question is settled. These are not:

1. **Main room — rename Day Trade, or add a fifth room?** 0043 asserts one core room
   per `app_mode` in SQL and raises if violated.
2. **"342 online" — real presence, or an honest proxy label?** `discussing_count` is
   declared in the client type and computed nowhere.
3. **Does an explicit mode control survive, and where?** F13 says room selection
   becomes local navigation; something still has to own the trading goal.
4. **Seven days or three steps?** The boards promise three. Recommend taking it.
5. **Who writes the lessons and shoots the videos, and by when?** See above.

---

## 6. WHAT NOBODY HAS CHECKED

Both documents are source reviews. Neither is a running app.

The audit is explicit about its own boundary — no signed-in session, no release build,
proof images from earlier commits — and lists the validation that would close it:
signed-in iOS and Android builds, mobile web, small phone with enlarged text,
VoiceOver/TalkBack, dropped connection, market closed, free and paid accounts, account
switch and two-device progress, interrupted orders. Its own note is the one to take
seriously: *"prior cases where fixture previews skipped routing failures, so fixture
screenshots alone cannot close this gate."*

Everything above inherits that boundary. Two accounts on one device is the first test
to run, because Batch 1 is largely a bet on that bug being exactly what it looks like.
