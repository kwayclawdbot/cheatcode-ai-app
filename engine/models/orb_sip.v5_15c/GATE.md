# Pre-registered gate — `orb_sip.v5_15c` and `orb_sip.v5_15c_spy` (ENGINE-13)

**Written and committed before the first evaluation was run.** This file lands in
the same commit as `engine/models/orb_sip_15c.py`, `engine/models/spy_ref.py`,
`engine/models/gates13.py`, their tests, and the runner
`engine/run_engine13.py`. That commit is earlier in `git log` than the commit
carrying any number produced by them. ENGINE-1 did it (`2b448ef` before
`f70576b`), ENGINE-2 (`b065f88` before `1662c03`), ENGINE-3 (`1021168` before
`a43595d`), ENGINE-4 (`a06611d` before `19d3234`), ENGINE-5 (`d8e592b` before its
report), ENGINE-6 (`2eed597` before `5fb757f`), ENGINE-7 (`6598f47` before
`b14e879`), ENGINE-8 (`6dc2a50` before `2435728`), ENGINE-9 (`6f19f50` before
`69c7efc`), ENGINE-11 (`21feb24` before `957f968`), ENGINE-12 (`dcd3048` before
`d35c932`). The ordering is the receipt, and it is the only part of this
programme that cannot be faked afterwards.

## The question

The owner, 2026-08-30: *"instead of first 5 min do the 15orb with 5min candle
break close. Then add spy confluence going same direction as break"*.

Two changes to the one thing this programme has ever measured as not-losing —
`orb_sip.v2`, the stocks-in-play ORB with the opposite-extreme stop:

- **A wider range and a stricter trigger.** The opening range becomes
  09:30–09:45 instead of 09:30–09:35, and the trade requires a five-minute
  candle to **CLOSE** outside that range rather than a resting stop order to be
  touched by a wick.
- **An index filter.** Take the trade only if SPY is moving the same way as the
  break at the moment the break is confirmed.

## Read this before the numbers

### 1. This window has been read five times and there is no virgin data left

Every session in the `polygon-sip-v1` snapshot has been looked at. ENGINE-6 read
the whole 2016–2026 tape. The stop-width sweep contaminated 2016–2023.
ENGINE-7 took 2024-01-01 → 2026-08-28 as its held-back window; ENGINE-8, -9, -10
and -11 all read windows inside it. **There is no un-looked-at span left in any
cached snapshot, and fetching one would mean paid Polygon calls, which this lane
is forbidden.** No correction for that is applied and none is available.

**What that specifically costs here.** The one thing prior looks taught this
programme is *wider stops did better on this tape*. Variant A's stop is
mechanically wider than the incumbent's — a 15-minute range is wider than a
5-minute one, and the confirming close pushes the fill further from the far
side still. **So Variant A is partly pre-selected to look good by knowledge
taken from a window this lane is about to reuse.** That is the honest reason the
comparison here is against the incumbent and never against zero: the incumbent
carries the same wide-stop advantage, so the difference between them is the only
quantity the contamination does not inflate.

What the prior looks do NOT contaminate is the outcome of these particular
trades: no lane has ever traded a 15-minute range or a close-confirmed entry, so
these trade outcomes have not been seen by anyone. That narrows the problem. It
does not remove it.

**The substitute for a held-back window, fixed here in advance.** Because no
virgin span exists, W6 below requires the sign of any winning arm to agree
across three era blocks — 2016–2019, 2020–2023, 2024–2026 — that span different
regimes and were never used to choose anything in this lane. Sign agreement
across three decades-apart regimes is a weaker guarantee than a virgin window
and it is not being sold as an equal one. **The honest framing, fixed here
before any number exists, is "suggestive, not conclusive", and no result in this
lane may be reported more strongly than that.** The plain-English summary must
say the words "sixth reading".

### 2. Three intervals on one window is three chances to look good by luck

W2, W3 and W4 are three 95% intervals. With three shots at a 5% test the chance
that at least one clears by chance alone is nearer 14% than 5%. **The gate stays
the 95% interval**, unchanged in kind and in number from ENGINE-6 through -12,
because a lane that awards itself an easier or a harder bar than the ones before
it has not been measured against anything. The Bonferroni-corrected 98.33%
interval is printed beside every comparison. That is not a second gate; it is
the size of the multiplicity problem, printed where it cannot be missed.

### 3. The selection is not this lane's variable and is not re-run

The day's twenty names come from ENGINE-6's `selection.json.gz`, **the same file
on disk, byte for byte** — top 20 of the 1,000-name pool by 09:30–09:35 relative
volume, floor 1.0. Two reasons, and the second is a constraint, not a choice:

1. The selector is the one component ENGINE-7 and ENGINE-9 measured as doing the
   work. Changing the entry rule and the selector in one lane would make the
   result uninterpretable.
2. One-minute bars exist on disk **only** for the symbol-days that selector
   chose. A 15-minute relative-volume selector would name different symbol-days
   and would require paid downloads. It is therefore out of scope for this lane
   and is named here so that its absence is a declared limit rather than a
   silent one.

The selection is decided at 09:35 from the 09:30–09:35 volume, which is complete
before the 09:45 range closes. It is knowable at decision time and carries no
lookahead.

## Variant A — `orb_sip.v5_15c`, exactly, before it was run on anything

    preconditions  regular hours; the symbol is one of the day's twenty stocks
                   in play, from ENGINE-6's selection file, unchanged; the
                   09:30-09:45 opening range has closed.

    range          the HIGH and LOW of 09:30-09:45, assembled from the
                   one-minute bars of that window. Fifteen minutes, three
                   five-minute candles, one range.

    trigger        the first five-minute candle, of the blocks beginning at
                   09:45, whose CLOSE is strictly outside the range. A wick
                   through the level is NOT a trigger and does not arm
                   anything. Blocks are 09:45-09:50, 09:50-09:55, and so on.

    direction      the side that was closed through. A close above the range
                   high is a long; a close below the range low is a short.
                   This REPLACES the incumbent's rule, which took its side from
                   the sign of the opening candle. A 15-minute range has three
                   candles and no single sign, and the owner's rule names the
                   break itself as the trigger, so the break decides the side.

    entry          a MARKET order, filled at the open of the next one-minute
                   bar after the confirming block closed, plus adverse
                   slippage. It is not filled at the confirming close: that
                   price is gone by the time the candle is known to have closed
                   there.

    stop           the OPPOSITE EXTREME of the 09:30-09:45 range. A long stops
                   at the range LOW, a short at the range HIGH. It is a PRICE
                   fixed by the setup, not a distance carried from the fill —
                   the incumbent's rule, read on the wider range.

    target         NONE. Exit at the end of the day, exactly as the incumbent.

    horizon        flat at 15:59 ET, or the early close on a half day.

    costs          $0.005/share/side commission, 1.0 bp adverse slippage.
                   Unchanged for the thirteenth time.

### The stop, and why it was not swept

The incumbent stops at the opposite extreme of the range it breaks. Carried onto
a 15-minute range that rule gives the opposite extreme of the 15-minute range,
and that is what is written above. **No other stop was considered, computed, or
tried, and none may be after a number exists.**

The consequence is stated here rather than discovered later: this stop is
**wider** than the incumbent's, and the confirming close puts the fill further
from it again, so the risk denominator grows. R-multiples divide by that
denominator. **A wider stop mechanically shrinks the measured R of the same
dollar move**, so Variant A can earn more cents a share than the incumbent and
still report a smaller R. The report must therefore print, for every arm:
realised stop width in cents, in percent of price, and in ATR units; and the
per-trade result in **dollars per $1,000 risked**, which is the unit the
comparison is decided in.

### The three free choices, declared before the run

**`RANGE_END = 09:45`.** The owner's number. Not varied.

**`LAST_CONFIRM = 15:30`.** The last five-minute block that may confirm a break
ends at 15:30, so the last possible entry bar is 15:30–15:31 and every trade has
at least 28 minutes before the 15:59 flatten. The incumbent's resting order is
live all day, so the closest match to it is "all day", and 15:30 is that with a
floor under the holding time. **One value, tested once, not swept.**

**Direction from the break, not from a candle sign.** Stated above. It is a
researcher degree of freedom and it is a real one: it is not the incumbent's
rule, and it means Variant A and the incumbent can take opposite sides on the
same name on the same morning. The report must count how often they do.

## Variant B — `orb_sip.v5_15c_spy`, Variant A plus SPY confluence

Everything in Variant A, unchanged, plus one gate:

    confluence     the trade is taken ONLY if SPY moved the same way as the
                   break over the window in which the break happened.

    definition     SPY_direction = sign( SPY close at the confirming block's
                   end  -  SPY close at 09:45 ).
                   A long requires SPY_direction > 0. A short requires
                   SPY_direction < 0. Exactly zero takes no trade.

    data           SPY one-minute bars from `polygon-deep-v1`, which already
                   holds 2012-01-03 -> 2026-08-28 on disk. Nothing is
                   downloaded. This is the ONLY place a report in this
                   programme reads two snapshots at once, and it is disclosed:
                   the traded tape is `polygon-sip-v1`, the SPY reference is
                   `polygon-deep-v1`, and no statistic mixes prices from the
                   two.

**This definition is a researcher degree of freedom and it is one of many.**
"SPY going the same way" could equally have meant SPY above or below its own
opening range, SPY's own 5-minute candle sign, SPY above a VWAP, SPY's move over
the last N minutes, or a magnitude threshold rather than a sign. **One
definition was chosen, written here, and tested once. No second definition may
be tried after a number exists** — that is the whole failure mode this file
exists to prevent, and with an index filter it is an easy one to fall into,
because there is always another reading that would have worked.

The reason for this reading: it measures SPY over exactly the window in which
the stock's break formed — from the moment the stock's range closed to the
moment its break was confirmed — so the two are the same event measured on two
instruments, and it needs no parameter beyond the ones Variant A already fixed.

### Lookahead, and how it is guaranteed rather than promised

SPY is a different series, so the `BarView` argument that protects every other
model does not automatically cover it. Three enforcements, the same shape the
selection got in ENGINE-6:

1. **Structural.** `SpyPanel.close_at(day, m)` locates its bar with
   `searchsorted(minutes, m, side="right") - 1`, so it returns the last SPY bar
   whose minute is **<= m**, within that ET day only. There is no path from a
   minute to a later minute and no path from a day to a later day.
2. **Asserted at the call site.** The model computes SPY direction only at the
   close of the confirming block, minute `m`, and both SPY reads use minutes
   `<= m`. The fill happens on the stock's bar at minute `> m`. The model
   raises if either SPY minute exceeds the decision minute.
3. **Attacked by tests.** `tests/test_orb_sip_15c.py` runs the poisoned-future
   and amputated-future attacks against the SPY panel — replace every SPY bar
   after minute `m` with nonsense, and delete them entirely — and requires a
   byte-identical direction and a byte-identical trade both times. A
   deliberately cheating panel that reads the bar AFTER `m` is run through the
   same harness and must be caught, because a test that cannot fail proves
   nothing.

## The windows

| | |
|---|---|
| snapshot (traded) | `polygon-sip-v1`, unchanged |
| snapshot (SPY reference, Variant B only) | `polygon-deep-v1`, unchanged |
| selection | ENGINE-6's `selection.json.gz`, byte for byte |
| **verdict window** | **2024-01-01 → 2026-08-28** — ENGINE-7's held-back window, chosen because it is the window the incumbent's own PARTIAL was decided on, so the comparison is like for like, and because it is the largest sample available |
| disclosure window | 2016-01-01 → 2023-12-31 — contaminated by the ENGINE-6 stop sweep. Printed in full, decides nothing |
| era blocks (W6) | 2016-01-01→2019-12-31, 2020-01-01→2023-12-31, 2024-01-01→2026-08-28 |

The window is not widened, in either direction, for any reason, after a number
exists.

## The bar — W1 to W6, on the VERDICT window, after costs

Gross reported before net. Median printed beside every mean. The money figure
per $1,000 risked printed beside every R. **Trade count AND independent-day
count printed beside every interval**, because trades on the same morning are
not independent of each other and the day count is the honest sample size.

| id | gate | threshold |
|---|---|---|
| **W1** | sample | ≥ **3,000** trades for `orb15c`; ≥ **1,000** for `orb15c_spy` |
| **W2** | **A beats the incumbent** | mean net R of `orb15c` minus `baseline`, **paired by day**, 95% interval **excludes zero in the challenger's favour** |
| **W3** | **B beats the incumbent** | the same comparison for `orb15c_spy` |
| **W4** | **does SPY confluence add anything** | mean net R of `orb15c_spy` minus `orb15c`, paired by day, 95% interval **excludes zero** — in EITHER direction |
| **W5** | sign, per arm | mean **gross** R > 0 **and** mean **net** R > 0 |
| **W6** | era sign agreement | for any arm that clears W2 or W3, mean net R > 0 in **all three** era blocks |

`orb15c_spy`'s floor is lower than `orb15c`'s because it removes trades by
construction. 1,000 is between ENGINE-8's power-derived 750 and the full-arm
3,000; at n=1,000 the 95% half-width is about ±0.075R, enough to separate a
per-trade edge worth trading (≥0.10R, i.e. ≥$100 per $1,000 risked) from zero
and deliberately **not** enough to resolve a v2-sized +0.02R. **A passed W5 whose
interval spans zero therefore settles nothing, and the report must say so rather
than let a positive mean stand in for a measured edge.**

**W2, W3 and W4 are paired by day, not by trade**, for ENGINE-6's reason: trades
on the same morning are not independent, and the day effect is exactly what a
comparison of entry rules has to remove.

**W4 decides no arm and it is the most useful line in the report for the owner's
second question.** It is two-sided on purpose: an index filter that measurably
HURTS is as much of an answer as one that helps, and "no difference" is a third
answer worth more than either.

**No leveraged portfolio figure appears in this report.** ENGINE-7's +223.9%
came from four-times-levered exposure on a near-zero per-trade edge and was
misread as a result. The per-trade dollars and its interval are the number.

## The verdict, fixed before any count is known

- **A WINS** — `orb15c` clears W1 and W2 (and W6).
- **B WINS** — `orb15c_spy` clears W1 and W3 (and W6), and `orb15c` does not
  clear W2, or clears it by a smaller paired mean.
- **INCUMBENT HOLDS** — neither W2 nor W3 clears. The incumbent is not
  displaced. **This is a good outcome and is reported as one**: it protects the
  one component this programme has measured as working from being replaced by a
  rule that has never been measured.
- **INCONCLUSIVE (sample)** — an arm misses W1. That arm is reported
  INCONCLUSIVE and cannot win; the other comparisons still stand on their own.

If both W2 and W3 clear, the arm with the larger paired mean is named and the
other is reported at equal length in the same table.

## What the report must contain, whatever the verdict

Pre-registered so that a good result cannot quietly drop the awkward parts, and
so a bad one cannot be padded.

1. **Per-trade dollars per $1,000 risked, its 95% interval, the trade count and
   the independent-day count**, for every arm and every comparison. No headline
   return. No leverage. No portfolio curve.
2. **REALISED STOP WIDTH PER ARM** — median cents, percent of price, ATR units,
   commission as a share of risk, and the stop-out share. Every result in this
   programme has been explained by stop width, and this lane changes it by
   construction. **If the wider range explains the whole difference between A
   and the incumbent, the report must say so in those words.**
3. **How often A and the incumbent take OPPOSITE sides on the same symbol-day**,
   and what each side earned. That is the price of taking direction from the
   break rather than from the opening candle's sign.
4. **How many trades the 15-minute close-confirmation rule never opens at all** —
   days where the range never closed through — and what the incumbent earned on
   exactly those symbol-days. A rule that trades less is not automatically
   better and the skipped trades must be priced.
5. **How many trades the SPY filter removes, and what those removed trades did.**
   If the removed trades' mean net R is **above** the kept trades', the report
   must say so in those words, whatever the verdict says. That is ENGINE-8's
   failure mode and it is the specific thing to check for.
6. **The era table** — mean net R and money per $1,000 in each of the three era
   blocks, per arm, whether or not W6 is reached.
7. **The sixth-reading disclosure and the multiplicity paragraph**, both in the
   plain-English summary, not in a footnote.
8. **The wide-stop contamination paragraph** — that Variant A's stop is wider
   because of something learned on a window being reused — in the plain-English
   summary.
9. All three arms in the fixed order `baseline`, `orb15c`, `orb15c_spy`, in
   every table. The winner is not moved to the top and the losers are not
   shortened.
10. Gross before net; median beside mean; stop-out share; **money per $1,000
    risked** — and **no R-multiple or ATR unit in the plain-English section
    without a money gloss.**
11. **The random-20 coin toss** and the incumbent's own published numbers on the
    same window, as the reference points that make a losing arm readable.
12. **Proof that the baseline arm is the incumbent** — the `baseline` arm's
    trades must reproduce ENGINE-7's held-back figures, and the report must
    print the match rather than assert it.
13. The count of symbol-days where the SPY reference was unavailable.
14. **How confident we actually are, and what would change the answer.** Not a
    number dressed as certainty.

## What may not happen after a number exists

No threshold in this file moves. `RANGE_END` is not re-tried at another value.
`LAST_CONFIRM` is not re-tried at another value. The stop is not re-read. The
SPY confluence definition is not re-defined, re-windowed, or given a magnitude
threshold. No fourth arm is added to rescue a miss. The selector is not changed.
The window is not widened. If the verdict window disagrees with the disclosure
window, the verdict window is the answer and the disagreement is reported as the
finding it is.
