# BUILD BRIEF — ENGINE-2: ORB with HTF confirmation and a structural stop

Owner, 2026-08-29, verbatim: *"build trade strategy with ORB, only triggered if
HTF trend confirmation, and stop loss should be at most recent major S/R line or
pivot that invalidates the setup."*

This is `orb_htf_structural.v1`. It is NOT a tweak of `orb_reclaim.v1` (which
failed its gate) — it changes the two things that plausibly caused that failure:
no trend filter, and a stop that had nothing to do with where the idea is wrong.

Read first: `docs/17_ENGINE_ARCHITECTURE.md`, the ENGINE-1 brief, and
`engine/reports/` — especially the cost-floor finding.

## Why this model is worth the run (the arithmetic that changed)

ENGINE-1 measured a hard floor: median risk per trade was 0.18–0.29% of price, so
commission plus slippage ate **9–14% of the risk on every trade**. Anything
intraday needed roughly **+0.15R of gross edge just to break even**.

A structural stop is usually wider — behind a real level rather than a few ticks
past the range edge. If risk per trade lands near 1% of price instead of 0.25%,
the same costs eat ~2.5% of risk instead of ~10%, and the break-even edge drops to
roughly **+0.04R**. **The owner's stop rule is not a detail; it is the main
mechanism by which this family could become viable.** Report realised risk-per-
trade as a headline number, next to the cost drag it implies.

## The spec (one model, fully specified before it runs)

**Session & range.** Opening range = 09:30–09:45 ET (15 minutes). ORB length is a
known variant; it is NOT to be swept in this lane — one length, pre-registered.

**HTF trend confirmation (the filter).** Daily timeframe, evaluated on the last
fully closed daily bar before the session — never today's forming bar:
- **Uptrend** = the most recent daily structure is a higher high AND a higher low
  (confirmed swing points), and the last confirmed swing low is unbroken.
- **Downtrend** = the mirror.
- Anything else = **no trade that day**. Not "weak signal" — no trade.

Longs only in an uptrend, shorts only in a downtrend. This is the whole point of
the filter; do not add a "counter-trend but strong" exception.

**Trigger.** Price closes (on the entry timeframe, 5-minute) beyond the opening
range in the direction of the daily trend. One trade per symbol per day, first
qualifying trigger only. No re-entry after a stop — a second entry is a different
model with its own gate.

**Stop — the owner's rule, and the part to get exactly right.** The stop goes at
**the most recent major level, beyond the entry, whose violation means the setup
is wrong** — not at a fixed distance, not at the range edge unless that edge IS
the level.

Define "major" explicitly and defensibly, as-of only:
- a confirmed pivot (N bars either side, N pre-registered) on a timeframe at or
  above the entry timeframe;
- with a **touch count ≥ 2** where practical — a level price has respected more
  than once, not every wiggle;
- candidates include prior-day high/low, premarket high/low, and the overnight
  session extremes.
Choose the nearest qualifying level on the far side of entry. If the nearest such
level implies risk beyond a stated cap (pre-register the cap as a % of price),
**skip the trade** rather than widen — a level too far away means this setup is
not offering a defined risk today.

**Target.** The next opposing major level, by the same definition. Skip the trade
if that target is closer than **1.5R** at entry. Time stop: flat at the close;
nothing is held overnight.

## Pre-register the gate BEFORE running (same discipline as ENGINE-1)

Commit `engine/models/orb_htf_structural.v1/GATE.md` in the SAME commit as the
spec, before any evaluation. Carry ENGINE-1's bar structure forward, and note
this is now the **third** day-trade model measured on the same data — so state the
out-of-sample window and treat the OOS result as the verdict, because testing
several variants makes an in-sample winner increasingly likely by chance alone.
Say that plainly in the report rather than quietly hoping.

The HTF filter and the skip rules will cut trade count hard — possibly below
ENGINE-1's minimum instance count. **If the sample is too small to conclude
anything, say so and report it as inconclusive.** Do not loosen the filter to
manufacture trades; that would be tuning to reach a verdict.

## Required controls

1. Re-run **`null_coinflip.v1`** restricted to the same days and symbols this
   model traded, with the same structural-stop geometry, so "better than random"
   is measured on a like-for-like basis rather than against the whole tape.
2. Report **gross of costs first**, then net. ENGINE-1's decisive finding was that
   both models were below random BEFORE costs — check that first here too, because
   if it is below the coin flip gross, the net number is already decided.
3. **Ablation, two runs only** (not a sweep): the same model with the HTF filter
   removed, and with the structural stop replaced by ENGINE-1's stop. That
   isolates whether either of the owner's two changes actually did anything. These
   are diagnostics, clearly labelled — the pre-registered gate applies to the full
   spec alone.

## Report

`engine/reports/orb_htf_structural.v1.<snapshot>.md`, in the ENGINE-1 format, plus
a plain-language summary at the top: did it work, how sure are we, what would
change the answer. The owner reads that section first — no R-multiples in it
without a plain-English gloss.
