# Pre-registered gate — `orb_htf_structural.v1`

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_htf_structural.py`, and that commit is
earlier in `git log` than the commit carrying any number produced by it. ENGINE-1
did the same thing (`2b448ef` precedes `f70576b`); the ordering is the receipt.

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

## This is the THIRD day-trade model measured on this data

`orb_reclaim.v1` and `sweep_displacement_fvg.v1` were measured on exactly these
bars and both failed. Every additional model tested on the same tape makes an
in-sample winner more likely by chance alone — three models at a naive 5% level
give roughly a 1-in-7 chance that at least one looks good in-sample having no
edge at all. Two consequences, both fixed here in advance:

1. **The out-of-sample window is the verdict.** In-sample is a sanity check on
   whether the model is even worth reading; the 2026 tail decides. It is
   evaluated once, in the same run, and reported beside the in-sample numbers.
2. **The report must say this out loud**, not bury it in caveats.

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

## The addition: a model may also be too small to judge

The daily-trend filter plus the four skip rules (no qualifying level, risk too
wide, risk too tight, reward under 1.5R) will cut the trade count hard, possibly
below G1. A thin sample is not evidence of absence, and reporting it as a
failure of edge would be as dishonest as reporting a fluke as a success. So the
verdict has three outcomes, defined here before the count is known:

* **PASS** — all five gates pass.
* **INCONCLUSIVE (sample)** — G1 fails on the low side. The model does not ship,
  and nothing is claimed about whether it works.
* **INCONCLUSIVE (power)** — G1 passes, G2 fails, but the upper bound of the 95%
  confidence interval on mean net R still reaches the threshold. The sample says
  "not proven", not "disproven".
* **FAIL** — G1 passes and either the 95% CI on mean net R excludes the G2
  threshold, or G3/G4/G5 fail on their own terms.

**Loosening the filter to manufacture trades is forbidden.** If the count is
short, the answer is "inconclusive", not a second version of the filter. That
substitution is the exact failure this phase exists to prevent.

## Required controls, also fixed in advance

1. **Gross before net.** ENGINE-1's decisive finding was that both models were
   below a coin flip *before costs*, which settles the net number without
   further argument. Gross expectancy is reported first here. If this model is
   below its control gross, that is the finding, whatever the net table says.
2. **A matched control.** `null_coinflip.v1.matched` takes the same symbols, the
   same days, the same decision minute and the same risk and reward distances,
   with the direction chosen by a deterministic coin flip. "Better than random"
   is measured against that, not against the whole tape.
3. **Two ablations, and only two** — the HTF filter removed, and the structural
   stop replaced by a stop just inside the broken range edge (ENGINE-1's
   geometry), on an identical trade set. They are labelled diagnostics. **The
   gate applies to the full spec alone**; an ablation that scores better does
   not get promoted into the result, it goes in the report as a fact about the
   owner's two changes.

## What was chosen by looking at data, and what was not

Honest disclosure, because "major level" is a definition and definitions can be
fitted:

* The **level definition** (6-bar pivots on 5-minute bars, ≥2 touches within
  8bp, levels within 25bp merged, plus prior-day/premarket/overnight extremes
  and 3-bar daily pivots) was set by checking how many levels it draws on five
  symbols across three dates — whether the chart looks like one a trader would
  mark. Level *sparsity* was the only thing looked at. **No backtest was run and
  no PnL was seen before these numbers were frozen.**
* The **session window** (09:45–11:00), the **opening-range length** (15
  minutes) and the **range sanity band** (0.15%–3.0% of price) are reused
  verbatim from `orb_reclaim.v1` rather than re-chosen, so they cannot have been
  tuned for this model.
* The **risk cap** (1.50% of price) and the **reward floor** (1.5R) come from
  the brief.
* The **risk floor** (0.10% of price) is an addition beyond the owner's words,
  and is flagged as such in the report. Its justification is ENGINE-1's cost
  arithmetic, not any result: at a 0.10% stop, $0.01/share plus 2bp of slippage
  is about a quarter of the risk, and a trade that starts −0.25R cannot be
  rescued by direction.

## The number this run exists to produce

ENGINE-1 measured median risk per trade at 0.18–0.29% of price, so costs took
9–14% of the risk on every trade and the family needed roughly **+0.15R of gross
edge just to break even**. A structural stop should be wider and that hurdle
should fall. **Realised risk per trade, and the cost drag it implies, is a
headline result of this report** whatever the verdict — it is the mechanism by
which this family either becomes viable or does not.

## Survivorship and walk-forward

Unchanged from `engine/models/GATES.md`: the 32 names are liquid *today*, none
was chosen on performance, none was dropped after seeing a result, and the
universe still carries hindsight that is disclosed rather than corrected. No
parameter is fitted on the in-sample window; the out-of-sample tail is evaluated
once.
