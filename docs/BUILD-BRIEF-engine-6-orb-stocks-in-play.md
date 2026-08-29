# BUILD BRIEF — ENGINE-6: replicate the published ORB, then test ours against it

Owner, 2026-08-29: *"I know the ORB is profitable I just dont know why its not
showing here"* → we searched the literature, and the answer is now specific.

## What the research says, and why our seven nulls are consistent with it

Zarattini, Barbon & Aziz tested ORB across 7,000+ US stocks, 2016–2023:

- **Unfiltered ORB: 29% total return, 0.48 Sharpe — worse than buy-and-hold.**
- **Same rules, restricted to "stocks in play": 1,637% return, 2.81 Sharpe, 12% max DD.**
- Their summary: *"abnormal opening volume did almost all the work."*

**ENGINE-1..5 built the unfiltered version.** Our null is not a refutation of ORB;
it is a replication of the published null case. Three concrete differences:

| ours (ENGINE 1–5) | published |
|---|---|
| fixed basket of 32 large caps + SPY, every day | **top 20 stocks/day by abnormal opening relative volume (>100%)** |
| 15-minute range | **5-minute range** |
| 1h/4h trend confirmation | **direction of the first 5-minute candle**, no HTF filter |
| stop at a prior 5m candle / structural level | **10% of 14-day ATR** (stocks paper); opposite extreme of the first candle (ETF paper) |
| target 2R, or a 1h level (35% of ours were <1R away) | **end of day**, or a 10R target |
| no position sizing | **1% risk per trade, 4× leverage cap** |

The exit difference matters as much as the filter: their QQQ variant wins only
**24%** of trades and still returns 676%, because winners run to the close. Our
2R cap and near-level targets amputated exactly that tail — and our own data
agrees: only 4.2% of SPY trades reached 3R, and those are the ones that pay.

## Phase 1 — REPLICATE. Do not improve, do not "fix", do not add.

Build the published spec faithfully and see whether this harness reproduces their
result. **This is a test of our machinery as much as of the strategy.** If a
faithful implementation cannot reproduce a published, peer-reviewed edge, that is
a finding about our harness and it must be reported as such, loudly, rather than
quietly recorded as another failed model.

- 5-minute opening range (09:30–09:35).
- Universe: price >$5, 20-day avg volume >1M shares, 14-day ATR >$0.50.
- Selection: the day's **top 20 by abnormal opening relative volume**.
- Entry: breakout beyond the 5-minute high/low in the direction of the first candle.
- Stop: 10% of 14-day ATR from entry.
- Exit: **end of day** if not stopped. No R target in the primary run.
- Sizing: 1% account risk per position, 4× leverage cap. Report both the R-based
  statistics this harness already produces AND a portfolio equity curve, since the
  published result is a portfolio number and is not comparable to a per-trade mean.

## The data problem — solve it honestly, this is most of the work

Selecting "stocks in play" needs the opening volume of a broad market each day,
which our 32-symbol cache cannot provide.

**Avoid the obvious lookahead trap.** Pre-filtering which symbols to download
using a full day's volume would select stocks *because* they turned out busy —
lookahead smuggled in through universe construction, and it would manufacture a
spectacular fake result. Instead:

1. Build a **rolling candidate pool knowable at 09:30**: the top N names by 20-day
   average dollar volume as of the PRIOR close (grouped daily bars,
   `/v2/aggs/grouped/locale/us/market/stocks/{date}` — one call per day, cheap).
2. Download 1-minute bars only for that rolling pool.
3. Compute opening relative volume **as-of 09:35** within the pool and take the
   top 20.

Scale N and the year range to what is achievable — the plan has no call cap, but
disk and time are real. **State the pool size and window you used, and be explicit
that a smaller pool is a weaker version of the published filter.** A pool of 200
is not the paper's 7,000 names; say so rather than implying equivalence. If the
result reproduces on a smaller pool, that is strong; if it does not, a too-small
pool is a live explanation and must be offered as one.

## Phase 2 — only if Phase 1 reproduces

Then, and only then, test the owner's variations against the replicated baseline,
one change at a time: 15-minute range; 1-hour trend confirmation; the prior-5m-
candle stop (ENGINE-5 measured this as worth +0.073R vs the trigger candle); a 2R
target; the half-off-at-1R management rule. Each isolated, each against the same
baseline, so we learn which of the owner's instincts add to a working strategy
rather than which rearrange a null.

**If Phase 1 does not reproduce, stop and report.** Do not proceed to Phase 2 and
do not tune. The question then becomes why our harness cannot see a documented
edge, which is more important than any variant.

## Discipline (unchanged)

Pre-register the gate before evaluating. For Phase 1 the bar is a REPLICATION bar
— directionally consistent with the published result and clearly beating the
unfiltered control on the same data — not our usual expectancy bar. State it
before running. Report median beside mean, gross before net, and run the matched
control. Anti-lookahead treatment for the selection logic especially: **relative
volume computed as-of 09:35 with no knowledge of the rest of the session** is the
highest-risk piece of code in this lane, and it is the one place where a bug
produces a beautiful, wrong answer.

Report: `engine/reports/orb_sip.v1.<snapshot>.md`, plain English first — trade
count, date range, pool size, did it reproduce, how sure are we.
