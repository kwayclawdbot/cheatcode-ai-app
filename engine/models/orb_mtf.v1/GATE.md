# Pre-registered gate — `orb_mtf.v1`

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_mtf.py`, `engine/primitives/htf_levels.py`,
`engine/backtest/mtf.py` and `engine/backtest/two_exit.py`, and that commit is
earlier in `git log` than the commit carrying any number produced by them.
ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2 did it (`b065f88` before
`1662c03`); the ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

If this model misses the bar it is recorded as measured-and-failed and it does
not ship. It is not retuned until it passes.

## The data, unchanged

| | |
|---|---|
| snapshot | `polygon-v1` — the ENGINE-1 cache, byte for byte |
| symbols | the same 32 (`engine/config.py`) |
| bars | 15,113,095 one-minute bars, 750 sessions per symbol, zero missing days |
| in-sample | 2023-09-01 → 2025-12-31 |
| **out-of-sample** | **2026-01-01 → 2026-08-28** |
| costs | $0.005/share/side commission; 1.0 bp adverse slippage on market and stop fills |

## This is the FOURTH day-trade-family model measured on this data

`orb_reclaim.v1`, `sweep_displacement_fvg.v1` and `orb_htf_structural.v1` were
measured on exactly these bars, and all three failed. Four models at a naive 5%
level give roughly a 1-in-5 chance that at least one looks good in-sample having
no edge at all — worse than ENGINE-2's 1-in-7, and worse again because this
model is a *variant of a variant*: it shares the opening range, the trigger
window, the range band, the buffer, the risk floor and the reward floor with the
model that just failed. It is not an independent draw.

Two consequences, both fixed here in advance:

1. **The out-of-sample window is the verdict.** It is evaluated once, in the
   same run, and reported beside the in-sample numbers.
2. **The report must say this out loud**, in the plain-language section, not
   buried in a caveat at the bottom.

## The session convention for 1-hour and 4-hour bars

This is a modelling decision, not an implementation detail. An ambiguous 4-hour
boundary silently changes every trend reading in the test, so it is written down
here, before the run, and used everywhere. It is implemented once in
`engine/primitives/timeframe.py` (`session_series`) and nowhere else.

* **Regular hours only.** Buckets are built from bars with `09:30 <= minute <
  the session's own close` (13:00 on a half day). Premarket and post-market
  prints are excluded entirely: they are thin, they gap, and on a midnight-
  anchored grid a single 04:12 print would set the high of the bar containing
  the open — a wick no trader has on their chart.
* **Anchored at 09:30, not at midnight.** A 4-hour bucket runs 09:30–13:30 and
  13:30–close. That is what a US-equity chart with extended hours switched off
  actually draws, and it puts the opening drive at the start of a bar rather
  than in the middle of one.
* **The day's final bucket is short and it still counts.** 1-hour gives seven
  bars, the last holding 30 minutes; 4-hour gives two, the last holding 2.5
  hours. Dropping the partial would delete every afternoon from the 4-hour
  series, which is a far larger distortion than a short bar. On an early-close
  day the 4-hour series has one bucket (09:30–13:00) and the 1-hour series has
  four.
* **A bucket is closed only once a bar in a LATER bucket has printed.** Not
  "once its final clock minute printed" — that rule cannot close a session-final
  partial, because 15:59 is not the last minute of a 4-hour window. Waiting for
  a later bar is strictly conservative and closes the partial correctly.

Consequence, stated so it is not a surprise in the results: the 4-hour reading
cannot change inside the 09:49–10:59 trigger window (every minute of it lives in
the 09:30–13:30 bucket, so the last closed 4-hour bar is always the previous
session's afternoon), while the 1-hour reading **can** change once, at 10:30,
when the 09:30–10:30 bar closes. Alignment is therefore re-checked at every
candidate bar rather than judged once at 09:49.

## The bar — ENGINE-1's five, carried forward unchanged

| id | gate | threshold |
|---|---|---|
| **G1** | sample size | ≥ 400 trades in-sample AND ≥ 100 trades out-of-sample |
| **G2** | expectancy after costs | mean net R ≥ **+0.10** in-sample AND ≥ **+0.05** out-of-sample |
| **G3** | profit factor after costs | ≥ **1.20** in-sample AND ≥ **1.10** out-of-sample |
| **G4** | MAE tail | of the trades that closed **profitable**, ≤ **40%** first went ≥ 0.75R against |
| **G5** | regime robustness | mean net R > 0 in **both** regime slices in-sample |

All five must pass. Four out of five is a failure. The thresholds are not
adjusted for this model being harder to fill; a rarer setup has to be at least
as good, not merely excused.

## Two exits, two verdicts

The owner asked for a "close it or let it run" control, so both sides of it are
measured on the same trade set and **each gets its own verdict**. One bar cannot
serve both: they are different risk profiles, and a swing exit carries a hazard
the day trade does not have at all.

* **Exit A — day trade.** Flat at 15:55 ET. Judged on G1–G5 exactly as
  ENGINE-2 was, so A is comparable to it line for line.
* **Exit B — swing.** Held to target or stop, capped at 5 trading sessions
  counting the entry day, then flat at 15:55 on the last of them. Judged on
  G1–G5 **and** on two additions that exist only because it holds overnight:

| id | gate (Exit B only) | threshold |
|---|---|---|
| **G6** | gap survivability | fewer than **5%** of trades close worse than **−2.0R** |
| **G7** | worth the extra risk | mean net R for B ≥ mean net R for A, **out-of-sample**, on the paired trades |

**Why G6.** The whole programme sizes by R, and R assumes the stop is where the
loss ends. A stop that can be gapped through does not have that property. If one
trade in twenty finishes past −2R, the tail alone is worth more than G2's entire
in-sample bar — at 5% frequency and −3R severity it costs 0.10R a trade — and
every risk statement built on R is then wrong. The number comes from that
arithmetic, not from a result.

**Why G7.** If holding overnight does not beat closing at 15:55, the honest
default for the app's control is "off", and the swing option does not ship
whatever the other gates say. This is a product gate, and it is stated in
advance so that a B that merely *survives* cannot be presented as a feature.

## A model may also be too small to judge

The double trend gate — 1-hour AND 4-hour, each confirmed, both agreeing — will
cut the count harder than ENGINE-2's single daily filter, which already went
23,840 symbol-days to 1,140 trades. A thin sample is not evidence of absence.
The three outcomes are defined here, before the count is known, and are the same
ones ENGINE-2 pre-registered:

* **PASS** — every applicable gate passes.
* **INCONCLUSIVE (sample)** — G1 fails on the low side. The model does not ship
  and nothing is claimed about whether it works.
* **INCONCLUSIVE (power)** — G1 passes, G2 fails, but the upper bound of the 95%
  interval on mean net R still reaches the threshold. "Not proven", not
  "disproven".
* **FAIL** — G1 passes and either the 95% interval on mean net R excludes the G2
  threshold, or G3/G4/G5 (or, for B, G6/G7) fail on their own terms.

**Loosening the gate to manufacture trades is forbidden.** If the count is
short, the answer is "inconclusive", not a second version of the filter. That
substitution is the exact failure this phase exists to prevent.

## Required controls, also fixed in advance

1. **Gross before net.** ENGINE-1's decisive finding was that both its models
   were below a coin flip *before costs*. ENGINE-2 was the first to beat its
   control gross (+0.099R, interval containing zero). Whether that survives here
   matters more than the net figure, and it is reported first.
2. **A matched control, run through both exits.** `null_coinflip.v1.matched`
   takes the same symbols, the same days, the same decision minute and the same
   risk and reward distances, with direction chosen by a deterministic coin
   flip, and it is booked under Exit A and Exit B identically. "Better than
   random" is measured against that, per exit.
3. **One ablation, and only one.** The same trades with
   `orb_htf_structural.v1`'s 5-minute stop and target. Selection is unchanged —
   every screen is applied to the 1h/4h levels first — so the trade set is held
   fixed and the only thing that moves is where the stop and the target sit.
   It is a diagnostic. **The gate applies to the full spec alone**; an ablation
   that scores better does not get promoted into the result.
4. **Overnight modelled honestly.** A position is exited only during regular
   hours. Everything between 16:00 and 09:30 is realised at the next session's
   open: if the session opens beyond the stop, the fill is that open and not
   the stop price. The mirror is also modelled — a session opening through the
   target fills the resting limit at the open, which is better than the level.
   The report states how many Exit B trades were resolved by a gap and what they
   cost.

## What was chosen by looking at data, and what was not

Honest disclosure, because "major level" is a definition and definitions can be
fitted.

* **Reused verbatim from `orb_htf_structural.v1`, so they cannot have been
  retuned here**: the 15-minute opening range, the 09:49–10:59 trigger window,
  the 0.15%–3.0% range sanity band, the 5bp stop buffer, the 0.10% risk floor,
  the 1.5R reward floor, the 8bp touch tolerance, the 25bp clustering distance,
  and the daily-pivot parameters (3-bar pivots, 60-day lookback).
* **The structure definition is ENGINE-2's, unchanged** — 2-bar confirmed
  fractals, higher high AND higher low with the swing low unbroken, over the
  last 120 bars of the timeframe. The same function
  (`primitives/htf.daily_structure`) is called; only the series it reads
  changes. On the 1-hour chart 120 bars is about 17 sessions; on the 4-hour
  chart about 60.
* **New: the 1-hour and 4-hour pivot lookbacks** (120 hourly bars; 60 four-hour
  bars) and their touch requirements (two touches within 8bp on the 1-hour
  series, one on the 4-hour). The one-touch rule on the 4-hour series is
  ENGINE-2's own "where practical" clause, spent for the reason it was spent on
  daily pivots: a confirmed 4-hour swing over thirty sessions is major by
  construction, and requiring it to be retested twice inside 8bp would discard
  the levels every trader on the tape is looking at.
* **New: the risk cap moves from 1.50% of price to 3.00%.** A 4-hour level is by
  construction further away, and a cap tight enough to reject most of them would
  quietly convert this model back into ENGINE-2 by skipping. 3.00% is not a new
  number: it is the upper edge of the opening-range sanity band already in use
  since `orb_reclaim.v1`. The risk floor stays at 0.10%, justified as before by
  ENGINE-1's cost arithmetic and flagged as an addition beyond the owner's words.
* **What was looked at before freezing, and what was not.** The level definition
  was checked for *sparsity and nearest-level distance* on five symbols across
  three dates — how many levels it draws, and how far the nearest one sits from
  price. **No backtest was run and no PnL, trade count, direction or expectancy
  was seen before every number above was frozen.** That check is disclosed
  because it goes one step beyond what ENGINE-2 declared, and because it
  produced the warning in the next section. No parameter was changed as a
  result of it.

## The mechanism this run is testing, and the way it can fail quietly

ENGINE-2's own conclusion was arithmetic: the setup earned 4.63¢ a share and
paid 5.61¢ to trade, and because R-multiples divide by the stop distance,
widening the stop shrinks the measured edge by exactly the factor it shrinks the
cost ratio. **Only a bigger move can change the sign.** The owner's correction
aims at that: a stop and a target taken from 1-hour and 4-hour structure should
be several times further away than a 5-minute one, so the move being aimed at is
several times larger while the round trip stays about 5.6¢.

**The way that can fail quietly, written down before the result is known.** The
level family here is not disjoint from ENGINE-2's. Prior-day and overnight
extremes and daily pivots are in both, because the brief names them as part of
what "major" means — and the sparsity check above showed that on many
symbol-dates the *nearest* level below price is one of those shared levels
rather than a 1-hour or 4-hour pivot. Where that happens, the stop lands in
exactly the place ENGINE-2 put it and the correction does nothing. So:

**Realised risk per trade (% of price), and the cost drag it implies, is a
headline result of this report whatever the verdict**, together with the share
of trades whose stop came from an `H1`/`H4` pivot rather than a shared reference
level. That pair of numbers is the direct test of whether the owner's correction
did what it was supposed to do, independent of whether the model made money.

## Survivorship and walk-forward

Unchanged from `engine/models/GATES.md`: the 32 names are liquid *today*, none
was chosen on performance, none was dropped after seeing a result, and the
universe still carries hindsight that is disclosed rather than corrected. No
parameter is fitted on the in-sample window; the out-of-sample tail is evaluated
once.
