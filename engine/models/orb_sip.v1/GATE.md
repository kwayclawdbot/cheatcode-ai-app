# Pre-registered gate — `orb_sip.v1` (ENGINE-6, Phase 1: REPLICATION)

**Written and committed before the first evaluation was run.** This file lands
in the same commit as `engine/models/orb_sip.py`, `engine/sip/`, and their
tests. That commit is earlier in `git log` than the commit carrying any number
produced by them. ENGINE-1 did it (`2b448ef` before `f70576b`), ENGINE-2
(`b065f88` before `1662c03`), ENGINE-3 (`1021168` before `a43595d`), ENGINE-4
(`a06611d` before `19d3234`), ENGINE-5 (`d8e592b` before its report). The
ordering is the receipt, and it is the only part of this programme that cannot
be faked afterwards.

## This gate is a different KIND of gate, and that is deliberate

ENGINE-1 through ENGINE-5 asked *"does this model have edge"* and set an
expectancy bar. This one asks a prior question: **can this harness see an edge
that has already been documented by somebody else?**

Zarattini, Barbon & Aziz measured ORB across 7,000+ US stocks, 2016–2023, and
reported 29% total return at a 0.48 Sharpe unfiltered against 1,637% at a 2.81
Sharpe when the same rules are restricted to the day's "stocks in play". Our
seven nulls were all built on the unfiltered universe with a capped exit. **Our
nulls replicate their null.** So the useful question is not whether `orb_sip.v1`
clears +0.05R; it is whether a faithful implementation of a published,
peer-reviewed result comes back positive in our machinery at all.

**If it does not, that is a finding about the machinery, not an eighth failed
model, and the report must say so first and loudest.** Phase 2 — the owner's
variations — does not run. No parameter is tuned. The question becomes why a
documented edge is invisible here, which is worth more than any variant.

## The model, exactly as published

- **Universe**, as of the PRIOR close: price > $5, 20-day average volume > 1M
  shares, 14-day ATR > $0.50. Computed from grouped daily bars for every ticker
  that traded that session, so it carries no survivorship bias.
- **Selection**: the day's **top 20 by opening relative volume**, measured at
  **09:35** as the 09:30–09:35 volume over the mean of the same five minutes
  across the previous 14 sessions, with a floor of 1.0 ("abnormal" = at least
  normal). Ties broken by symbol.
- **Range**: 09:30–09:35, high and low.
- **Direction**: the sign of that five-minute candle. Bullish → long only, on a
  break above its high. Bearish → short only, below its low. The other side is
  not traded whatever price does.
- **Entry**: a resting stop order at the range edge, working from 09:35 to the
  close. Filled at the worse of the level and the bar's open, plus slippage.
- **Stop**: **10% of the 14-day ATR** from the fill. The ATR comes from daily
  bars through the prior close.
- **Target**: **NONE.** Exit at the end of the day. The published QQQ variant
  wins 24% of its trades and still returns 676% because the winners run to the
  close; our 2R cap and near-level targets amputated exactly that tail.
- **Sizing** (portfolio arm only): 1% of equity risked per position, with total
  gross exposure capped at 4× equity and all of a day's positions scaled down
  proportionally when the cap binds. Equity compounds daily.

Nothing is added. No trend filter, no range-size band, no minimum reward, no
risk floor, no management rule, no 2R target. All of those are Phase 2.

## The data, and the honest size of the compromise

| | |
|---|---|
| snapshot | `polygon-sip-v1` — a THIRD immutable snapshot; no report mixes it with `polygon-v1` or `polygon-deep-v1` |
| grouped daily | every US ticker, every session, 2015-10-01 → 2026-08-28, unadjusted |
| pool | top `POOL_N` of the day's eligible set by 20-day average DOLLAR volume as of the prior close |
| intraday | 5-minute opening bars for the pool; 1-minute bars only for the symbol-days actually selected |
| replication window | **2016-01-01 → 2023-12-31** — the paper's own window |
| held back | 2024-01-01 → 2026-08-28, evaluated once and reported separately |
| costs | $0.005/share/side commission; 1.0 bp adverse slippage on market and stop fills — ENGINE-1's model, unchanged for the sixth time |

**The pool is ours and it is a weakening of the paper's filter.** The report
states the realised pool size beside the realised eligible count for the same
days, and says plainly what fraction of the eligible universe was visible to the
selector. A pool that is small relative to the eligible set biases the selection
toward large caps, which is the *wrong* direction for a filter whose whole
premise is that a mid-cap doubling its opening volume on news is the trade. **If
Phase 1 fails, an insufficient pool is a live explanation and must be offered as
one rather than concluded against the strategy.**

Prices in this snapshot are **unadjusted**. On split-adjusted prices a stock
that later reverse-split 1-for-10 would be back-promoted into a "price > $5"
universe at a price it never traded at. That is lookahead through universe
construction, and it is the exact failure mode this lane was warned about.

## The anti-lookahead treatment, which is the point of the lane

The selection is the one place where a bug produces a beautiful, wrong answer.
It gets three independent kinds of enforcement, and the tests land in this
commit:

1. **The data does not exist.** `sip/fetch_open5.py` keeps only 09:30–10:30 of
   each session. The afternoon of the day being selected for is never written to
   disk.
2. **The index cannot reach it.** `OpenStore.baseline` slices `[j-14 : j]` — the
   upper bound is exclusive of the day being scored, and there is no path from a
   day to a later day.
3. **The tests attack it.** `tests/test_sip_selection.py` runs the poisoned-
   future and amputated-future attacks against `select_day`, plus the attack
   this lane specifically needs — **delete every bar after 09:35 on the
   selection day itself and require an identical selection** — and runs a
   deliberately cheating selector through the same harness, which must be
   caught. A test that cannot fail proves nothing.

## The bar

Evaluated on the **replication window**, after costs, with gross reported first.
Median printed beside every mean.

| id | gate | threshold |
|---|---|---|
| **R1** | sample | ≥ **5,000** trades in the replication window |
| **R2** | sign | mean **gross** R > 0 **and** mean **net** R > 0 |
| **R3** | direction beats a coin flip | paired against the matched control (same symbols, days, decision minutes and stop distances, direction flipped), gross, 95% interval **excludes zero** in the model's favour |
| **R4** | **the filter is the thing** | mean net R of the stocks-in-play arm minus the same rules on a random 20 eligible names a day, 95% interval on the difference **excludes zero** in the model's favour |
| **R5** | portfolio, directionally consistent | the 1%-risk / 4×-capped portfolio has positive total return **and** an annualised Sharpe ≥ **1.0**, net of costs |

R5 does not ask for 1,637% or for 2.81. It asks whether the portfolio is in the
same direction and the same broad class as the published number rather than a
rounding error away from zero. A Sharpe of 1.0 against a published 2.81 is a
weaker result on a smaller pool and is still a reproduction.

### The verdict, fixed before any count is known

- **REPRODUCED** — R1–R5 all pass.
- **PARTIALLY REPRODUCED** — R1–R4 pass and R5 fails. The filter works and the
  edge is real but materially smaller than published; the report says so and
  Phase 2 may run against this baseline.
- **NOT REPRODUCED** — R2, R3 or R4 fails. **Phase 2 does not run.** The report
  leads with "this harness cannot reproduce a published result", and the
  candidate explanations — pool size, cost model, fill model, the selection
  definition, the window — are enumerated and, where cheap, measured.
- **INCONCLUSIVE (sample)** — R1 missed and nothing else is read.

### What may not happen after a number exists

No threshold in this file moves. No parameter of the model changes. No variant
is added to rescue a miss. `POOL_N` is not raised after seeing a result — if the
pool is diagnosed as the binding constraint, that is stated as a limitation and
any larger-pool re-run is a NEW pre-registered run with this file's history
intact, reported beside the original rather than in place of it.
