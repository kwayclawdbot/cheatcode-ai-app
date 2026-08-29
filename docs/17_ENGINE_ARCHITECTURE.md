# 17 — Setup & Alert Engine Architecture

Status: DESIGN, agreed with the owner 2026-08-29. Supersedes the implicit
"port the SMS scanner" assumption. Nothing here is built yet.

---

## 1. Why we are not porting the existing engine

`~/breakout-alert-system` is mature, deployed, and has real subscribers. It is
also, on its own recorded evidence, without demonstrated edge.

**167 graded alerts, 2026-05-15 → 2026-07-14, 36 trading days**
(`alert_performance_honest` in the K.AI database — the project's own grading,
not ours):

| | n | avg 5d | avg 10d | win 5d | avg drawdown | went >8% underwater |
|---|---|---|---|---|---|---|
| LONG | 141 | **+0.41%** | +0.68% | 49.6% | −10.49% | **47.5%** |
| SHORT | 26 | **−4.29%** | −3.60% | 30.8% | −11.38% | 46.2% |

Average *peak* gain on longs was +11.93%. Realised 5-day return was +0.41%. The
peak is real and almost nobody captures it; nearly half the alerts put a holder
8%+ underwater first.

**By setup type:**

| setup | n | avg 5d | win 5d |
|---|---|---|---|
| BREAKOUT | 55 | **−4.05%** | 34.5% |
| WEEKLY_MOMENTUM | 42 | +2.66% | 57.1% |
| CONTINUATION | 28 | +2.87% | 64.3% |
| kai_orb_bullish | 14 | **+4.83%** | 71.4% |
| PUT SWING | 9 | −1.73% | 44.4% |
| kai_orb_bearish | 6 | −10.88% | 16.7% |
| BREAKDOWN | 6 | −3.53% | 0.0% |

**The score does not rank.** Grouped by the engine's own `breakout_score`:
A (80+) n=126 → −0.56% / 47.6% win · B (70–79) n=20 → +2.42% / 35.0% ·
C (60–69) n=9 → −2.74% / 44.4% · D (<60) n=12 → −0.63% / **58.3%**.
No monotonic relationship. This is the number Round 4 renders to users as a
**grade medallion**.

**RSI is predictive, inverted.** Longs only: RSI <50 → +2.09% / 54.2% ·
50–59 → +3.16% / 52.6% · 60–69 → −1.15% / 38.7% · 70+ → **−4.64%** / 41.4%.
Monotone. A breakout scanner fires on strength; strength is where the returns
are worst. The engine systematically buys extension.

**Honest limits of this evidence:** 167 alerts, two months, one regime, 5- and
10-day horizons, the project's own grading. The score and RSI findings are
directionally strong (A-band n=126). The ORB result is n=14 and suggestive only.
This does not prove the engine can never work. It proves it has no measured edge
today, and that shipping it into a paid product would be selling a number we
cannot stand behind.

## 2. What the ingested corpus actually contains

`coach_kb_chunks` (K.AI database), built from YouTube ingestion:

| source | videos | words |
|---|---|---|
| Inner Circle Trader | 541 | 325,527 |
| JadeCap | 38 | 167,544 |
| Max Options Trading | 12 | 93,283 |
| The Trading Geek | 2 | 15,698 |

Overwhelmingly **structural and time-based**: fair value gaps, liquidity sweeps,
order and breaker blocks, SMT divergence, Power of 3, daily bias, Asian range,
killzones, top-down analysis, order flow. The current engine has no
representation of structure, liquidity, session or displacement — it computes an
indicator composite and thresholds it. The corpus cannot be expressed in it.

This matters because it is the same methodology family FTA teaches (opening
range, HTF→LTF confirmation, structure, S/R) and the same family the outcome data
rewarded (ORB, continuation). Teaching, evidence and corpus agree with each
other and disagree with the engine.

## 3. Three families, three shapes

Modes are not parameters of one engine. They are different questions.

### 3a. Day trade — structure, liquidity, session
Universe: index ETFs plus a curated high-liquidity list (03 §: ~60–100 names).
Horizon: intraday; every setup dies at the close. Models come from the corpus:
sweep → displacement → FVG entry, opening range, daily bias / Power of 3, SMT
divergence against the index. Invalidation is structural, never a percentage.
Needs 1m/5m bars — this is the family that forces the data-plan decision.

### 3b. Swing — continuation, not breakout
The evidence is unusually direct here, because all three are swing-shaped:
continuation 64.3%, weekly momentum 57.1%, breakout 34.5%. **Buying the
resolution of a base loses; buying the pullback inside an established trend
wins.** Built on: higher-timeframe trend state, pullback depth into prior
structure, relative strength vs sector and index, volume dry-up then expansion.
Two rules the data hands us directly:
- **no initiation above RSI 70** (−4.64%, monotone);
- **earnings-aware** — a 3–15 day hold that straddles a print is not the model
  that was tested.
Data: daily and weekly bars, one grouped snapshot a day. Cheap.

### 3c. Invest — thesis monitoring, plus screened ideas
Not a setup engine. Over a multi-year horizon the entry barely matters and being
wrong about the business matters entirely. The unit is **a position with a
written thesis and the conditions that would falsify it**. Alerts are
`thesis_change`: growth decelerating, margin trend inflecting, guidance cut,
valuation leaving its 5-year band, allocation drifting from the goal,
contribution cadence. The schema already anticipates all of it —
`invest_recommendations.kind` is
`contribution|rebalance|allocation_change|add_on_pullback|trim_at_high`, and 03
already specifies thesis supersession and a `thesis_change` push category.

Owner decision 2026-08-29: **monitoring AND screened ideas** — the fundamental
screens 03 §describes (growth, margin trend, valuation vs 5-year range, quality
gates) also surface candidates. Note the consequence in §8: proposing securities
to buy is closer to advice than monitoring something a user already owns.

Data: quarterly fundamentals plus daily price. Nearly free.

### Options
Owner decision: **expression layer now, first-class detection later.** Detection
runs on the underlying in all three families; a separate layer proposes how to
express a setup in options (strike, expiry) for users who want it — the Max
Options corpus feeds that layer, not detection. Flow/IV/skew as detection inputs
is a later phase with its own data bill. Note PUT SWING scored −1.73% / 44.4% in
the outcome data, which is why options are not being added as a second source of
error before the equity models have measured edge.

## 4. Shared primitive layer

One library, used by all three families, computed once per symbol per timeframe:

- **Structure** — swing points, break of structure, change of character
- **Liquidity** — equal highs/lows, prior day/week extremes, session highs/lows,
  sweep (stop-run) detection with reclaim state
- **Imbalance** — fair value gaps with fill state, order blocks, breakers
- **Time** — premarket range, opening range, session windows. The entire
  dimension the current engine lacks, and the one ORB's 71% lives in.
- **Trend & participation** — HTF trend state, relative strength vs index and
  sector, volume regime (dry-up / expansion)
- **Fundamentals** (invest only) — growth, margin trend, valuation vs own
  5-year range, quality gates

The existing CheatCode Trend Clouds / CCA indicators are NOT deleted — they
remain available as *context and chart rendering*, and LIVE-1b still wants them
in TypeScript. They stop being the thing that decides what to alert on.

## 5. A setup is a named model, not a score

```
model:        stable id + version (e.g. orb_reclaim.v1)
preconditions: what must already be true (regime, session, trend state)
trigger:       the event that arms it, with the bar/time it occurred
levels:        entry, invalidation, targets — derived from structure, not %
invalidation:  the condition that kills it, checked continuously
horizon:       when it expires unfilled
```

Grade is **not** a hand-weighted confluence sum. It is derived from the model's
own realised statistics over its historical instances — a band computed from hit
rate and payoff, per model, per regime. "A" must mean "this model, in this
regime, has resolved this way N times out of M", and the app must be able to show
that N and M. Anything else reproduces the medallion we cannot defend.

## 6. The backtest gate — and why it differs per family

Owner decision 2026-08-29: **nothing ships live until it clears its gate.** The
absence of this gate is what produced a −4% flagship setup.

- **Day trade** — thousands of instances; walk-forward on 2+ years of intraday
  bars, out-of-sample tail held back. Bar stated per model before the test is
  run, never after.
- **Swing** — hundreds of instances a year; walk-forward on daily bars across at
  least one full regime change.
- **Invest** — a hit-rate bar is meaningless at this horizon and sample. Its
  validation is an **event study**: on historical cases of fundamental
  deterioration, did the thesis-change condition fire *before* the drawdown, and
  how early? The gate is lead time and false-positive rate, not win rate.

Applying one gate to all three would either block invest forever or wave through
day-trade models that have not earned it.

Every model, once live, keeps being graded — the outcome loop that already
exists in `alert_performance_honest` must feed the grade band, which is the part
that is missing today.

## 7. Where it runs

Detection is a long-running job over a universe; Vercel functions cap at 60s and
cannot hold it. Proposed seam, unchanged from the earlier discussion:

- **Engine (Python, Railway)** owns detection: universe sweep, primitives,
  models, levels. POSTs candidates to `/api/v1/internal/setups/ingest` behind the
  same `x-internal-secret` pattern as the paper tick. Never touches user data.
- **App (Next, Vercel)** owns lifecycle and users: the `setups` row, the state
  machine (discovered → watching → forming → ready → invalidated/expired), grade
  bands, the contradiction validator, per-user fan-out through
  `setup_alert_prefs`, alert evaluation, and the push that Round 5 built.

## 8. Owner blockers and open items

1. **Polygon plan — decided to upgrade, not yet done.** The app and the SMS
   engine currently share ONE key (verified identical) at 5 requests/minute,
   delayed. Intraday structure models are impossible on that. Verify current
   tier pricing before committing; the app should also get its own key so it
   stops contending with 14 Railway crons.
2. **Fundamentals source** for invest — Polygon financials vs the existing EODHD
   key. Not yet chosen.
3. **Screened investment ideas sharpen the adviser question** raised in the
   go-live review. Monitoring something a user owns is materially different from
   proposing securities to buy. Legal review should cover the screened-ideas
   surface specifically.
4. **What happens to the SMS engine.** It keeps running for its subscribers.
   Whether its alerts eventually come from this engine is a separate decision.
