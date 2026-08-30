# BUILD BRIEF — ENGINE-11: busiest stocks + trend STRENGTH

Owner, 2026-08-29: *"what about busiest stocks + trend strength. If stock is
trending in the direction of the orb"*.

## What is already known, and must not be re-run

ENGINE-8 tested a daily trend **agreement** filter on this exact base and it
failed: it discarded 75% of trades, the discarded trades beat the kept ones by
$47 per $1,000 (interval excluding zero the wrong way), and on the two-way-break
mornings it was aimed at it kept trades returning −$723 while removing trades
returning −$729 — no discrimination at all. Roughly half of all stock-days had
no confirmed daily structure, so the filter was mostly a sit-out rule.

**This lane is NOT that.** The difference, and the whole reason to run it:
ENGINE-8's trend was BINARY (up / down / none). This is trend **strength** — a
continuous measure, used to RANK rather than to gate.

## The spec

Base is `orb_sip.v2` unchanged and the selector stays **relative volume**, which
won ENGINE-9 decisively (+$17 vs Kai's score −$54 vs random −$37). Everything
downstream is fixed: 5-minute opening range, entry on the breakout in the
direction of the first candle, stop at the opposite extreme of the opening
candle, hold to the close, same costs, 1% sizing, 4× leverage cap.

**Trend strength** — a continuous daily-chart measure at the LAST FULLY CLOSED
daily bar, never today's forming bar. Define it from components already built,
and write the definition into the gate before running. Something like the
normalised distance from a medium EMA, the slope of that EMA over N days, and
run persistence — combined into one signed number whose sign is direction and
whose magnitude is strength. Do not invent a novel indicator; state exactly what
was used and why.

Three arms, all pre-registered together:
1. `rank` — among the day's top-20 busiest, prefer names whose trend strength is
   strongest IN THE BREAK DIRECTION. Same trade count as the baseline where
   possible, so this is a re-ordering, not a reduction. This is the owner's idea
   in its most faithful form.
2. `gate_strong` — take the trade only when strength in the break direction
   exceeds a threshold stated in the gate before running. Unlike ENGINE-8 this is
   a strength cut, not a structure cut. Report how many trades it removes and
   **what the removed trades did** — ENGINE-8's filter discarded winners and that
   is the failure mode to check for.
3. `baseline` — `orb_sip.v2` as-is, for the head-to-head.

Report the relationship between trend strength and outcome **as a curve across
deciles**, not just the arms' averages. If there is no gradient, say so — that
single sentence answers the owner's question more completely than any verdict.

## Honesty requirements

- Window: build 2021-08-29 → 2025-08-28, verdict 2025-08-29 → 2026-08-28.
- **This is the held-back year's FIFTH reading.** ENGINE-7, 8, 9 and 10 all
  touched windows containing it. Say so plainly in the summary; treat any result
  as suggestive, and do not present it with more confidence than that.
- Pre-register `GATE.md` for all arms in the same commit as the specs, before any
  evaluation. Three arms on a fifth reading — state the multiple-comparison risk.
- Report the ENGINE-8 prior explicitly and compare: does a graded strength measure
  succeed where the binary structure filter failed, or does it reproduce the null?
- Gross before net, median beside mean, stop-out share, **money per $1,000 risked**.
- Watch the mechanism that has explained every result in this programme:
  **stop width.** ENGINE-9's Kai arm lost because coiled names open quietly and
  get a narrow stop. Strongly-trending names may do the same. **Report realised
  stop width per arm** — if the strength ranking narrows the stop, that is the
  explanation and it must be stated.
