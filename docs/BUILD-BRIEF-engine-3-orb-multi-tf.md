# BUILD BRIEF — ENGINE-3: `orb_mtf.v1` — multi-timeframe ORB, HTF levels, two exits

Owner, 2026-08-29, verbatim: *"it should be 1hr trend, 15m orb, 5min confirmation
and entry. The stop and targets should be based on the 1hr or 4hr levels not
5min. Trade should be taken only if 1hr and 4hr is in the trend confirmation."*
Then, on the exit: *"if it doesnt hit by 3:55 close (daytrade only) or give user
option to swing."*

Read first: `docs/17_ENGINE_ARCHITECTURE.md`, and the ENGINE-2 report in
`engine/reports/` — this model exists because of what that one measured.

## Why this is not a fourth coat of paint

ENGINE-2 (`orb_htf_structural.v1`) failed, and the report isolated exactly why:
the setup earned **4.63¢/share and cost 5.61¢/share to trade**. The directional
edge was real (first model in the programme to beat its control gross) but
smaller than the round trip.

Its stop sat on structure found at the entry timeframe — median risk **0.187% of
price**. The owner's correction targets precisely that: **stops and targets come
from 1hr and 4hr levels, not 5-minute levels.** A 4hr level is materially further
away, so the move being aimed at is several times larger while the round trip
stays ~5.6¢. **This changes the numerator, which is the only thing that can
change the sign.** ENGINE-2 proved the denominator (stop width) cannot.

## The spec

**Trend gate — both must agree.** 1-hour AND 4-hour, each evaluated on its last
fully closed bar. Structure definition as in ENGINE-2: confirmed higher high AND
higher low with the last swing low unbroken (mirror for downtrend). **Both
timeframes must point the same way.** Disagreement, or either one sideways = no
trade. Longs only in an aligned uptrend, shorts only in an aligned downtrend.

**Bar construction — define it explicitly and write it down.** 1h and 4h bars
built from the cached 1-minute data. State and document the session convention:
whether bars are RTH-only or include extended hours, and how the final partial
bucket of the day is handled. This is a real modelling decision, not an
implementation detail — an ambiguous 4h boundary silently changes every trend
reading. One convention, documented in the spec, used everywhere.

**Opening range:** 09:30–09:45 ET, 15 minutes.

**Confirmation and entry:** 5-minute. A 5m bar must CLOSE beyond the opening
range in the direction of the aligned trend. One trade per symbol per day, first
qualifying trigger only, no re-entry.

**Stop:** the nearest major level from the **1h or 4h** series that lies beyond
entry and whose violation invalidates the setup. Never a 5m level. Same
"major" definition as ENGINE-2 (confirmed pivot, touch count where practical,
prior-day and overnight extremes) but computed on the higher-timeframe series.
If the nearest qualifying level implies risk beyond the pre-registered cap, skip.

**Target:** the next opposing major 1h/4h level. Skip if closer than 1.5R.

**Two exits, measured on the SAME trade set** (this is the product feature the
owner asked for, so both numbers must be real):
- **Exit A — day trade:** flat at 15:55 ET whatever the position, as ENGINE-2 did.
- **Exit B — swing:** hold until target or stop, capped at 5 trading days, then
  flat. **Overnight gaps must be modelled honestly**: if the next session opens
  beyond the stop, the fill is at that open, not at the stop price. A backtest
  that fills gapped stops at the stop price is fiction, and this is the first
  model in the programme carrying overnight risk.

Report A and B separately and side by side. The entry is identical, so the
difference between them IS the value of letting it run — that number is what the
app's "close it or let it run" control will be built on.

## Gate

Pre-register in `engine/models/orb_mtf.v1/GATE.md`, committed BEFORE the
evaluation, in the same commit as the spec — as `b065f88` preceded `1662c03`.
Carry ENGINE-2's bar structure. **State a separate verdict for Exit A and Exit
B**; they are different risk profiles and one bar cannot serve both.

**This is the fourth day-trade-family model on the same three years of bars.**
Say so in the report, and treat the out-of-sample window as the verdict. Each
additional variant raises the chance an in-sample winner is luck, and the
programme's credibility rests on saying that out loud rather than quietly hoping.

The double trend gate will cut trade count harder than ENGINE-2's single daily
gate (which already went 23,840 symbol-days → 1,140 trades). **If the sample is
too small to conclude, report INCONCLUSIVE.** Do not relax the gate to
manufacture trades.

## Required, as before

- Report **cents per share earned vs cents per share paid**, first, in plain
  words. That framing is what made ENGINE-2's result legible, and it is the
  number that decides this family.
- Realised risk-per-trade (% of price) for the HTF stop — the direct test of
  whether the owner's correction did what it should.
- **Gross versus a matched control before net.** ENGINE-2 beat its control by
  +0.099R gross with a CI containing zero; whether that survives here matters
  more than the net figure.
- Ablation, one only: the same trades with ENGINE-2's 5m-level stop and target,
  to isolate the value of moving to HTF levels.
- Anti-lookahead treatment for every new primitive, and the end-to-end
  amputated-session proof extended to this model. The 1h/4h level finder is the
  highest-risk piece — a "recent major 4h level" is trivially easy to compute
  with bars that had not closed yet.

## Report

`engine/reports/orb_mtf.v1.<snapshot>.md`, opening with a plain-language summary:
did it work, how sure are we, what would change the answer — **no R-multiples in
that section without a plain-English gloss.** The owner has asked for plain
speech; the top of the report is written for someone who does not read backtests.
