# Pre-registered gate — `orb_sip.v11_hrsi` (ENGINE-19)

**Written and committed before the hourly bars were fetched.**

## The question

The owner, 2026-08-31:

> "So just add filter for extreme overbought setups on the hourly (rsi > 70) at
> market open. Overbought on daily ok (could be a parabolic runner)"

Phase 1b measured DAILY extension — `(close − EMA20)/ATR14`, signed by the
trade's direction — and found the extended trades earned −$3 per $1,000 against
+$35 for the rest. That is the first directional variable in this programme to
clear its interval. **The owner's reply distinguishes two things that study
conflated**: a daily chart that is extended may simply be a strong trend (a
parabolic runner, which he is happy to trade), whereas an HOURLY chart that is
overbought at the moment the market opens is short-term exhaustion, which he
skips. Those are different variables and only the daily one has been measured.

## The filter, exactly

    hourly RSI    Wilder's RSI(14) computed on REGULAR-HOURS one-hour bars,
                  read as of the LAST BAR STRICTLY BEFORE the session being
                  traded — i.e. the prior session's final hour. That is what a
                  trader looking at an hourly chart at 09:30 can see.

    long          SKIPPED if hourly RSI > 70.
    short         SKIPPED if hourly RSI < 30.

**The short side is a mirror and it is a declared choice, not the owner's
words.** He named the long case ("extreme overbought"). The symmetric reading of
"short-term exhaustion in the direction you are trading" is oversold for a
short, so 30 is used. The report must show both sides separately so the mirror
can be judged on its own; if the filter works on one side only, that is the
finding.

**No second threshold may be tried.** 70/30 are Wilder's own levels, named by
the owner, fixed here. Not 65, not 75, not 80.

## What is measured, and what is NOT re-run

The incumbent's trades already exist and are committed:
`reports/orb_sip.v6_1r.polygon-sip-v1.trades.csv.gz`, arm `v2`, 10,545 trades
over 2024-01-01 → 2026-08-28. **Nothing is replayed.** A filter does not change
entries, stops or exits — it only decides which of an existing set of trades are
taken. So this lane fetches hourly bars, computes one RSI number per symbol-day,
joins it to the trades that already exist, and splits them.

**The bar cache was deleted at the owner's instruction and is not rebuilt.**
Hourly bars are fetched, reduced to a single float per symbol-day, and
discarded. Only the RSI values are stored (~13k numbers).

## The prior

**ENGINE-8's failure mode is the thing to check for and it has recurred twice.**
ENGINE-8's daily-trend gate discarded 75% of trades and the DISCARDED trades
beat the kept ones by $47 per $1,000, interval excluding zero the wrong way.
ENGINE-13's SPY confluence removed 40.4% of trades and the removed ones returned
−$8 against the kept ones' −$16. **A filter that removes the better half is the
default outcome in this programme, not the exception.**

Against that: Phase 1b's daily-extension result is real and points the same way
the owner does, so a related hourly measure has a genuine mechanism behind it.
This is the first filter in nineteen lanes with a measured relative in its
favour.

## The bar — R1 to R5, on 2024-01-01 → 2026-08-28

Money per $1,000 risked. Trade count AND independent-day count beside every
interval.

| id | gate | threshold |
|---|---|---|
| **R1** | sample | ≥ **3,000** kept trades, and ≥ **500** removed trades (else the filter is not doing anything and the comparison is empty) |
| **R2** | **the removed trades are worse than the kept ones** | mean net R of KEPT minus REMOVED, unpaired two-sample, 95% interval **excludes zero in the filter's favour** |
| **R3** | **the filter improves the book** | mean net R of KEPT minus the UNFILTERED baseline, **paired by day**, 95% interval excludes zero in the filter's favour |
| **R4** | sign | mean net R of KEPT > 0 |
| **R5** | it is not the stop denominator | R2 holds in **cents per share** as well as in R |

R2, R3 and R5 are three readings on one window. **The gate stays the 95%
interval**; the Bonferroni-corrected 98.33% interval is printed beside each as a
disclosure.

**This is the eleventh reading of this window and the eighth variable tested
across three studies.** No correction exists for that and none is applied. The
report must say so in the plain-English summary.

## The verdict, fixed before any count is known

- **FILTER WORKS** — R1, R2 and R3 clear.
- **DISCRIMINATES BUT DOES NOT PAY** — R2 clears, R3 does not: the removed
  trades really are worse, but removing them does not measurably improve the
  book at this sample size.
- **NO EFFECT** — neither R2 nor R3 clears in either direction.
- **FILTER HURTS** — the R2 interval lies entirely the wrong way; the removed
  trades were the better ones. This is ENGINE-8's failure mode and the report
  must name it as such.
- **INCONCLUSIVE (sample)** — R1 misses.

## What the report must contain

1. **How many trades the filter removes, per side**, and what those trades
   earned — the ENGINE-8 check, first table.
2. **Long and short reported separately**, so the mirrored 30-level is judged on
   its own.
3. **The RSI decile curve** on the kept-and-removed set together, so the reader
   can see whether 70 is a cliff, a slope, or nothing — and whether a different
   threshold would have looked better. **Printing that curve is required
   precisely so the temptation to move the threshold is visible and refused.**
4. **The daily-extension interaction**: does the hourly filter add anything
   beyond Phase 1b's daily-extension effect, or are they the same trades? The
   owner's claim is that they are different; this is where it gets tested.
5. **Coverage** — how many trades got no RSI (insufficient hourly history) and
   were dropped from the comparison entirely.
6. **The eleventh-reading and eighth-variable disclosure.**
7. Money per $1,000 risked; no R-multiple in the plain-English section without a
   money gloss; **no leveraged portfolio figure**.

## What may not happen after a number exists

70 and 30 do not move. No second indicator is added. No combination with the
daily filter is fitted. If the filter misses, it missed.
