# Pre-registered gate — `orb_sip.v7_side` (ENGINE-15)

**Written and committed before a single bar of the test data was downloaded.**
This file lands in the same commit as `engine/models/gates15.py`, the runner
`engine/run_engine15.py`, and the `sip/config.py` snapshot override that makes a
second snapshot possible. That commit is earlier in `git log` than the commit
carrying any number produced by them, and earlier than the fetch itself.

## The question, and where it came from

ENGINE-14's diagnostic split `orb_sip.v2`'s trades by the sign of the opening
candle and compared each side against a matched coin flip taking the same side.
On 2016–2026 it found:

| side | model | coin flip, same side | the signal is worth |
|---|---|---|---|
| bullish (long) | +$14 | −$10 | **+$24** (95%: +$0 to +$49) |
| bearish (short) | +$26 | +$21 | **+$6** (95%: −$19 to +$30) |

Raw shorts looked better; once the control was subtracted the **bullish** side
carried roughly four times the signal. **That finding is post-hoc.** It was
produced by splitting an already-measured set of trades into subgroups and
reading the more interesting half, on a window that had been looked at seven
times. That is the single most reliable way to manufacture a false positive, and
the diagnostic said so at the time.

**This lane exists to test it on data no lane has ever read.**

## The out-of-sample window, and why it is this one

There is **no forward data**. The tape ends on the last completed session, so
"wait and see" is not available today.

The only virgin data is EARLIER in time. Every ENGINE lane that touched the
stocks-in-play universe used `polygon-sip-v1`, which begins 2016-01-01 — chosen
in ENGINE-6 to match the published paper's window. **The same universe before
2016 has never been fetched, never been selected on, and never been replayed.**

    test window     2012-01-01 → 2015-12-31, 1,006 sessions
    snapshot        polygon-sip-early-v1 — a SEPARATE snapshot in its own
                    directory. `polygon-sip-v1` is not touched, not widened and
                    not renamed, because rule 1 of this directory is that a
                    result names its snapshot.
    why not earlier `engine/calendar_us.py`'s NYSE holiday and early-close table
                    begins in 2012. Fetching 2010–2011 would mean trading days
                    the calendar cannot verify, and an unverified calendar is
                    how a backtest silently trades on a day the market was shut.

**Everything about the pipeline is held identical to ENGINE-6**: the same
universe filter (price > $5, 20-day average volume > 1M shares, 14-day ATR >
$0.50, all as of the prior close), the same 1,000-name pool by dollar volume,
the same top-20-by-opening-relative-volume selection with a floor of 1.0, the
same `orb_sip.v2` rules, the same matched coin flip with the same seed, and the
same costs. **Not one parameter is re-fitted, re-read or re-chosen for this
window.** If anything is changed to make the early window work, the test is void.

### The one contamination, disclosed rather than discovered

ENGINE-12 replayed **SPY** over 2012–2021, so this window's broad market
direction is known to me: the index rose over it, and SPY's own opening-range
break lost money in every year of it. That tells me nothing about which SIDE of
a stocks-in-play break carries signal — SPY has never once been selected by this
strategy — but it is not zero and it is written here rather than left out.
No stock in the sip universe has been read before 2016 by anything.

## What is measured

Four quantities on the test window, all after costs, all in dollars per $1,000
risked, with the trade count AND the independent-day count beside every interval:

    A  bullish (long) trades of orb_sip.v2
    B  bearish (short) trades of orb_sip.v2
    a  matched coin-flip trades that were long
    b  matched coin-flip trades that were short

    the bullish signal   = A − a
    the bearish signal   = B − b
    the ASYMMETRY        = (A − a) − (B − b)

The asymmetry is the thing ENGINE-14 found and the thing this lane is here to
confirm or kill. **A − a and B − b are unpaired two-sample comparisons**: once
split by side the model and the control no longer trade the same symbol-days, so
these are two populations over one universe and one period, not matched trades.
That is a real weakness of the estimator, it was the same weakness in ENGINE-14,
and it is stated here so the replication is judged on the same basis as the
finding.

## The bar — Y1 to Y6, on the test window, after costs

| id | gate | threshold |
|---|---|---|
| **Y1** | sample | ≥ **3,000** model trades on each side |
| **Y2** | **the bullish signal is real** | `A − a` 95% interval **excludes zero, in the model's favour** |
| **Y3** | the bearish signal is real | `B − b` 95% interval excludes zero, in the model's favour |
| **Y4** | **the ASYMMETRY replicates** | `(A − a) − (B − b)` 95% interval **excludes zero, with the BULLISH side larger** — the direction ENGINE-14 found, fixed here in advance |
| **Y5** | the bullish arm stands on its own | mean **gross** R > 0 **and** mean **net** R > 0 for A |
| **Y6** | the strategy transfers at all | the whole model (both sides) minus the whole coin flip, 95% interval excludes zero in the model's favour |

Y2, Y3, Y4 and Y6 are four intervals on one window: with four shots at a 5% test
the chance one clears by luck is nearer 19% than 5%. **The gate stays the 95%
interval**, unchanged in kind and number from ENGINE-6 onward, and the
Bonferroni-corrected 98.75% interval is printed beside every comparison as a
disclosure, not as a second gate.

**Y4 is directional and that is deliberate.** A replication test that would
accept an asymmetry pointing either way is not testing the finding, it is
testing whether the two sides differ at all. ENGINE-14 said bullish > bearish;
only bullish > bearish counts.

## The verdict, fixed before any count is known

- **BULLISH EDGE REPLICATES** — Y1, Y2 and Y4 all clear. The post-hoc finding
  survives on data nobody had seen.
- **SIGNAL REPLICATES, ASYMMETRY DOES NOT** — Y6 clears and at least one of
  Y2/Y3 clears, but Y4 does not. The strategy transfers; the side story does not.
- **NOT REPLICATED** — Y4 fails and neither Y2 nor Y3 clears. The 2016–2026 side
  split was noise, which is what a post-hoc subgroup split usually is.
- **REVERSED** — the asymmetry interval excludes zero with the BEARISH side
  larger. Named in advance because it is a real possible outcome and because
  discovering it without having named it would invite calling it a win.
- **INCONCLUSIVE (sample)** — Y1 misses.

## What the report must contain, whatever the verdict

1. **The four quantities and the asymmetry**, with intervals, trade counts and
   day counts, in the fixed order A, a, B, b.
2. **The 2016–2026 numbers printed beside the 2012–2015 ones**, so the reader
   sees the finding and its test in one table without going to another file.
3. **A data-integrity audit before any result is believed** — sessions fetched
   against sessions the calendar expects, zero bars on days the market was shut,
   the split-adjustment check from `tests/test_sip_data.py` run on the new
   snapshot, and the count of pool-days that fell short of 1,000 names. The
   2026-08-29 paginator bug produced a beautiful wrong answer in exactly this
   stage; the audit runs first and the report prints it first.
4. **Coverage**: how many of the selected symbol-days actually have one-minute
   bars, and what was dropped.
5. **The era split inside the test window** (2012–2013, 2014–2015), because a
   four-year window is not one regime and a result that only exists in half of
   it is worth knowing about.
6. **Realised stop width per side**, in cents, percent of price and ATRs — the
   parameter that has explained every result in this programme.
7. **The post-hoc disclosure**, in the plain-English summary and not a footnote:
   this lane tests a finding that was produced by subgroup-splitting, and the
   prior for such findings surviving is low.
8. **The ENGINE-12 contamination disclosure.**
9. Gross before net; median beside mean; money per $1,000 risked; and no
   R-multiple in the plain-English section without a money gloss.
10. **How confident we actually are, and what would change the answer.**

## What may not happen after a number exists

No threshold in this file moves. The window is not widened, shortened or shifted
in either direction. The universe filter, the pool size, the selection rule, the
relative-volume floor, the stop, the costs and the coin-flip seed are not
touched. No third side, no sub-split by volume, price, sector, volatility or
regime is added to rescue a miss. If the test window disagrees with 2016–2026,
**the test window is the answer**, because it is the only one of the two that
was not read before the hypothesis was formed.
