# BELT MERGE — one belt, two income streams, one exam

**Owner decision, 8 September 2026:** *"merge belt system so that user gains belt xp
via lessons and/or trade calls but has to take and pass a test to earn the belt
itself."*

This is that design, written against the code that exists rather than from scratch.
It reverses nothing that 0039 argued for; it moves the belt one step further down
the chain and lets the points keep doing the job they were good at.

---

## 1. THE ONE-SENTENCE MODEL

**XP buys you the right to sit the exam. The exam gives you the belt.**

Points stop being the award and become the *eligibility*. Nothing already earned is
thrown away — the existing thresholds (250 / 750 / 1750 / 3500) survive as the
call-side half of eligibility for the same rungs they name today.

```
  lessons  ─┐
            ├─►  one XP ledger  ─►  eligibility for the next rung  ─►  EXAM  ─►  belt
  calls    ─┘         (points)         (both halves required)          (pass)
```

### Why this shape and not the obvious one

The obvious merge is "add lesson XP to the points total and keep `belt_for(points)`".
Do not do that. It has one failure mode and it is fatal: **lessons become a
points farm.** Thirty lessons at 30 XP each is a Blue Belt without a single resolved
call, and the belt on a member's name in a room is supposed to say something about
what they can do in a market. The reverse is just as bad — 0039 already refused to let
the biggest account buy a position on the board, and it should equally refuse to let a
sprayer of calls skip the learning.

So: **two half-balances, both required, and neither substitutes for the other.**

And the exam is what makes the whole thing honest. The audit's warning under F12 is
the requirement statement for this file: *"If discipline is meant to earn progression,
it must be measured by the scoring system before the UI claims it."* A test measures
it. A total never did.

---

## 2. WHAT ALREADY EXISTS AND IS BEING KEPT

| Piece | Where | Kept because |
|---|---|---|
| `point_events` — append-only, `unique(source, ref_id)` | 0039 §2 | The idempotency rule is the reason the board is not fiction. It is also, for free, the fix to the audit's F12 repeat-inflation bug. |
| `user_points` rollup + high-water-mark belt | 0039 §3 | A belt is never lost. That survives untouched. |
| `points_config()` as JSONB | 0039 §1 | Config-driven thresholds mean this merge is mostly data, not new arithmetic. |
| Award rules: win +10, loss −4, Kai trade +6/−2, accuracy multiplier, 5-call warm-up | 0039 | Unchanged. They were argued and they hold. |
| `XP_AWARD` — interactive 10, video 10, practice 20, assessment 30 | `features/training/xp.ts` | Same order of magnitude as the call awards, so the two streams share a scale without renormalising. |
| `competencyEarned` — a competency is satisfied **only** by a passed assessment | `xp.ts` | This is the precedent the exam gate generalises. Do not rewrite it; move it server-side intact. |
| `Belt` = white · blue · purple · brown · black | `packages/shared/api.ts:1543` | Five rungs is right. No new ladder. |

---

## 3. THE LEDGER — ONE TABLE, WIDENED

Two ledgers would recreate the two-systems problem this decision exists to end. Widen
`point_events` rather than adding a sibling.

```
alter table point_events
  drop constraint point_events_source_check,
  add  constraint point_events_source_check check (source in (
        'community_call',      -- unchanged: their own published call resolved
        'kai_trade',           -- unchanged: they took a house alert, it resolved
        'lesson_interactive',  -- new
        'lesson_video',        -- new
        'lesson_practice',     -- new
        'assessment_passed'    -- new
  ));

alter table point_events alter column won drop not null;
alter table point_events
  add constraint point_events_won_shape check (
    (source in ('community_call','kai_trade') and won is not null) or
    (source not in ('community_call','kai_trade') and won is null)
  );
```

`multiplier` is 1.0 on every training row and `accuracy_at_award` is null — training
XP is never scaled by trading accuracy, and a losing month must not be able to erase
something a member learned.

### The `ref_id` choice, which is the whole repeat-safety fix

For a call, `ref_id` is the call's id, as today. **For training, `ref_id` is the
LESSON's id, not the run's** — deterministic, so a second completion of the same
lesson collides with `unique(source, ref_id)` and awards nothing. The audit's F12
("repeating a lesson adds masteryGain again") stops being a bug that has to be
remembered and becomes a constraint violation.

A re-take that scores *better* may still raise a competency signal. It does not pay
twice. Those are different questions and the ledger only answers the second one.

---

## 4. THE ROLLUP — TWO HALVES, VISIBLE

```
alter table user_points
  add column xp_calls    numeric not null default 0,
  add column xp_training numeric not null default 0,
  add column belt_source text not null default 'legacy_points'
      check (belt_source in ('legacy_points','exam'));
```

`points` stays as the sum and stays the leaderboard sort key — the board is a *calls*
board and should keep ranking on the trading record, so **the board sorts on
`xp_calls`, not on `points`.** Otherwise a diligent student outranks a good caller on
a leaderboard that claims to measure calling.

`xp_calls` can go down (a loss is −4). `xp_training` can only go up. Neither is allowed
to subsidise the other.

---

## 5. THE EXAM

Two new tables. Both server-graded; the client never computes a pass.

```
belt_exams            -- one row per rung: belt, version, blueprint (jsonb), pass_pct
belt_exam_attempts    -- append-only: user_id, belt, exam_version, started_at,
                      -- submitted_at, score_pct, passed, answers (jsonb)
```

Rules, in the order they matter:

1. **Graded on the server, by the service role.** `revoke all ... from anon,
   authenticated` on the grading function, the same posture 0039 §"revoke" takes for
   `award_points`. A belt a phone can grant itself is not a belt.
2. **Mixed format, and the applied half is not optional.** Knowledge questions alone
   produce a belt you can get by reading. Every rung's blueprint carries at least two
   *applied* tasks against a chart: mark the entry, put the stop where the idea is
   wrong, size the position to 1R, say which of two plans is the sound one. The tools
   to render these already exist — `TradeMap` and `RiskRewardRuler` at
   `apps/mobile/src/ui/trade/index.tsx:115,301`, and the `share_grid`/`split` lesson
   visuals at `features/training/engine/screens.tsx`.
3. **Applied tasks are drawn from a pool per attempt**, so a failed attempt cannot be
   memorised into a passed one.
4. **Cooldown after a failure** — 48h proposed — and a cap of 3 attempts per rung per
   30 days. Both in `points_config()` so they are tunable without a migration.
5. **Every attempt is kept**, passed or failed. A ladder whose failures are deleted
   cannot be audited, and 0039 made exactly this argument about the point ledger.
6. **A pass is permanent.** `user_points.belt` remains the high-water mark it is
   today; the exam becomes the *source* of the mark rather than `belt_for(points)`.
   Losing calls afterwards lower `xp_calls` and therefore eligibility for the *next*
   rung. They never take back the rung you hold.

`belt_for(points)` is not deleted. It stops being the authority on the belt and
becomes what it should have been all along: a helper that answers *"what does this
points total make you eligible for?"* — renamed `belt_eligible_by_points()` so no
future reader mistakes it for the award.

---

## 6. ELIGIBILITY PER RUNG

Both halves required. Proposed defaults — the call-points column is the **existing**
0039 thresholds, unchanged, so nobody's trading record is devalued by this merge.

| Belt | Competencies (passed assessments) | Applied | Calls resolved | `xp_calls` | Exam |
|---|---|---|---|---|---|
| **White** | — | — | — | 0 | none — you start here |
| **Blue** *Foundations* | read a chart · explain your risk | 1 clean paper plan | 3 | 250 | 10 knowledge + 2 applied |
| **Purple** | + entries & exits · position sizing | 5 paper trades with a written plan | 10 | 750 | + build a plan from a raw chart |
| **Brown** | + risk discipline · debrief honestly | 3 debriefs where the plan was followed | 30 | 1750 | + diagnose a closed trade |
| **Black** | all nine mastery skills | sustained adherence over 20 trades | 60 | 3500 | + reviewed practical |

Blue's row is taken straight off Board 09, which already states it in the product's
own words: *"Next: Blue Belt — Read a chart ✓ · Explain your risk ✓ · Complete a clean
paper plan ○"*. Use the board's copy; it is better than anything invented here.

The rungs above Blue are proposals and should be argued before they are seeded. What
is **not** negotiable in this design is the shape: two halves, both required, exam on
top.

---

## 7. WHAT HAPPENS TO BELTS PEOPLE ALREADY HOLD

Nobody is demoted. That would be the single fastest way to make the belt worthless.

- Every current `user_points.belt` is kept and stamped `belt_source = 'legacy_points'`.
- The **next** promotion requires the exam, like everyone else's.
- A legacy holder may sit their own rung's exam voluntarily to convert
  `legacy_points` → `exam`. Worth offering, and worth showing: it is the moment the
  ladder becomes something people trust.
- The UI must not brand a legacy belt as lesser in the room. The distinction belongs on
  the Belt Profile screen, stated plainly once, not on every name in every thread.

---

## 8. WHAT THIS FORCES, AND WHY THAT IS GOOD

**All of it requires server-side training progress.** Competencies, XP and eligibility
cannot live in `ccai.training.profile.v2` on one handset if a belt depends on them.

That is the audit's F10 — its own P0 — and it is a bug that needs fixing regardless:
one AsyncStorage key with no account ID means two accounts on one device inherit each
other's learning, and because `useStageEvolution` feeds readiness evidence from that
same local profile, the contamination reaches `profiles.stage`.

So the belt merge does not *add* the persistence project. It gives it a shape and a
reason to be done properly the first time.

The 0012 LMS tables (`lessons`, `lesson_progress`, `course_modules`, `courses`) exist
and are read by nothing — they were built for a curriculum shape `curriculum.ts` no
longer describes. Decide explicitly whether to adopt or retire them; do not leave a
third unused progress store behind this one.

---

## 9. STAGE AND BELT MUST NOT BECOME THE SAME LADDER TWICE

The audit's "Separate the four concepts" page is right, and after this merge the risk
is sharper, because belt now measures roughly what stage measures.

Recommendation: **derive stage from belt.** white → beginner; blue/purple →
developing; brown/black → trade ready. Keep the `profiles.stage` column so 0042's
trigger protection and `homeOrderFor()` at `app/(tabs)/home.tsx:93` keep working
untouched, and let the exam be what writes it. Retire the local-evidence path in
`useStageEvolution` — it is the contaminated one.

Self-reported placement at signup stays, and stays **labelled as self-reported**. The
audit's finding holds: an active trader can currently land on Trade Ready from a
signup answer. That should set the *first screen they see*, never the belt.

---

## 10. WHAT THE SCREEN MAY SAY

Board 09's Belt Profile is the target, with one change the audit demands (F12: *"Show
one belt and progress toward the next, with scoring rules"*).

The ring must show progress toward **eligibility**, and the action underneath it must
be explicit:

> **WHITE BELT** · Foundations
> Knowledge · Planning · Discipline
>
> **Next: Blue Belt**
> ✓ Read a chart ✓ Explain your risk ○ Complete a clean paper plan
> ○ 3 resolved calls (you have 1)
>
> **[ Sit the Blue Belt test ]** — unlocks when the four above are done

A ring that fills to 100% and then hands over a belt is the design this decision
rejected. The ring fills to *eligible*; the member still has to sit down and pass.

Four sentences of scoring rules print verbatim on this screen, exactly as 0039 already
does with `POINTS_PLAIN`. Add a fifth for the exam:

> *You earn XP from lessons and from calls that resolve. XP is what lets you sit for
> the next belt. The belt itself is earned by passing its test.*

---

## 11. BUILD ORDER

1. Server-side training progress + the widened ledger (§3, §4). This is Batch 1 of
   `OPINION-audit-boards-and-what-to-build.md` and everything else waits on it.
2. `belt_eligibility()` and the Belt Profile screen showing eligibility only — no exam
   yet. Ships honest on day one: it can say what is left.
3. Blue Belt exam end to end, with its applied tasks. One rung, done properly, before
   the other three are seeded.
4. Purple / Brown / Black blueprints, once Blue's pass rate says whether the bar is in
   the right place.
5. Legacy conversion offer (§7).

**The dependency nobody can code around:** an exam needs a curriculum behind it, and
one lesson of thirty is authored. The content programme is the critical path for the
belt now, not just for training. It should start this week and run in parallel with
step 1.

---

## 12. THE RISK IN THIS DESIGN, STATED PLAINLY

**An easy exam is worse than no exam.** If Blue Belt is ten multiple-choice questions
a member can tap through, the belt means strictly less than the points total it
replaced — and the audit's caution (*"Do not present a Black Belt as proof of safety
or as a guarantee that someone should be copied"*) turns from a caution into a
liability, because the app will now be asserting that a test was passed.

The applied tasks are the mitigation and they are not optional. If the first version of
the exam has to ship without them, ship the eligibility screen and no exam at all
rather than an exam that grades nothing.
