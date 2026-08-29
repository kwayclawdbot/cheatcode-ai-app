# BUILD BRIEF — ENGINE-1: primitives + backtest harness

Owner 2026-08-29: Polygon upgraded (real-time entitlement + no call cap, both
verified by probe), engine architecture agreed. This is phase one of
`docs/17_ENGINE_ARCHITECTURE.md` — read that first, it is the reasoning behind
every choice here.

## 0. What this phase delivers, and what it deliberately does not

**Delivers:** a primitive library, a historical data cache, a backtest harness,
and a measured report for two or three day-trade models.

**Does NOT deliver:** a single alert, a single row in `setups`, any change to the
app. Nothing connects to the product in this phase.

That separation is the point. The existing SMS engine shipped a BREAKOUT setup
that returned −4.05% over 55 alerts and a score whose A-band underperformed its
D-band, because there was never a gate between "this seems reasonable" and "this
is live." This phase builds the gate before anything can slip past it.

## 1. Where it lives

`engine/` in this repository — Python, deployed to Railway from that
subdirectory later. Same repo as the app so the eventual ingest contract is
versioned alongside the schema that receives it. It does NOT import from
`apps/`, and `apps/` does not import from it; the only coupling, later, is one
HTTP contract.

Do not build this inside `~/breakout-alert-system`. That codebase is the SMS
product, it keeps running for its subscribers, and its assumptions are what we
are testing our way out of.

## 2. Historical data cache (build first — everything depends on it)

Two-plus years of 1-minute and daily bars for the day-trade universe (index ETFs
+ ~60–100 liquid names; start with ~30 for the first pass, widen once the harness
is proven).

- **Check for Polygon flat files (S3 bulk) first.** If the new plan includes
  them, bulk download beats several million paginated REST calls. If not, use
  `/v2/aggs` with the now-uncapped call budget, chunked and resumable.
- Store as **parquet on disk, queried with DuckDB**. Not Postgres — this is
  columnar scan work, and it must not touch the app's database.
- The cache is **immutable and versioned**. A backtest result must name the data
  snapshot it ran against, or it is not reproducible.
- Record, per symbol, the first and last bar actually obtained. Silent gaps are
  how backtests lie.

## 3. Primitive library (`engine/primitives/`)

Pure functions over a bar series. No I/O, no network, no globals. Each one
independently unit-tested against hand-checked fixtures — a chart you verified by
eye, encoded as a test.

- **Structure** — swing highs/lows, break of structure, change of character
- **Liquidity** — equal highs/lows, prior day/week high & low, session high/low,
  sweep detection with reclaim state
- **Imbalance** — fair value gaps with fill state, order blocks, breaker blocks
- **Time & session** — premarket range, opening range, session windows, holiday
  and half-day calendar
- **Trend & participation** — HTF trend state, relative strength vs index and
  sector, volume regime (dry-up / expansion)

Every primitive takes an explicit "as of bar i" argument and may only read bars
`<= i`. **A primitive that can see the future is the single most expensive bug in
this project** — make lookahead structurally impossible, not merely avoided, and
write a test that fails if a primitive reads ahead.

## 4. Backtest harness (`engine/backtest/`)

Event-driven replay, bar by bar, over the cached data.

Correctness properties, each with a test:
1. **No lookahead.** Decisions use only bars closed at or before the decision bar.
2. **Realistic fills.** A stop or limit fills only if the bar's range actually
   touched it; market orders fill at the next bar's open. State the slippage and
   commission assumptions explicitly and make them a parameter, not a constant
   buried in code.
3. **Session-aware.** Holidays, half days, and the 09:30/16:00 boundaries are
   real. A model that trades on a day the market was shut invalidates everything.
4. **Survivorship stated.** A curated liquid universe carries less survivorship
   bias than a screen, but the universe is still chosen with hindsight. Say so in
   the report; do not pretend otherwise.

Statistics reported per model — and the distribution matters more than the mean,
because the existing engine's +11.93% average peak concealed a −10.49% average
drawdown:
- instance count, hit rate, average and median return, expectancy after costs
- **maximum adverse excursion distribution** — specifically, what fraction of
  trades go more than X% against you first. This is the metric that exposed the
  current engine.
- payoff ratio, longest losing run, results split by regime and by session
- an equity curve, and per-trade records dumped so any result can be inspected

## 5. The models to measure first

From the ingested corpus (541 ICT videos, JadeCap's ICT models — see 17 §2), and
from the one empirical hint in the outcome data (`kai_orb_bullish` 71.4% on n=14,
suggestive only):

1. **`orb_reclaim.v1`** — opening range, sweep of one side, reclaim, entry on
   displacement back through the range edge.
2. **`sweep_displacement_fvg.v1`** — the canonical ICT day model: liquidity swept
   → displacement → entry on the resulting fair value gap, invalidation beyond
   the sweep.
3. **`daily_bias_po3.v1`** (if time allows) — HTF bias, accumulation → manipulation
   → distribution across the session.

Each model is a declarative spec: preconditions, trigger, levels derived from
structure (never a fixed percentage), invalidation, expiry. Model id carries a
version; changing a rule makes a new version rather than silently rewriting
history.

## 6. The gate — pre-registered, before any test is run

For each model, **write the bar down first, in the repo, in the same commit as
the model spec**: minimum instance count, minimum expectancy after costs, maximum
acceptable MAE tail, and the out-of-sample window held back. Then run it.

Moving the bar after seeing results is the failure mode this whole phase exists
to prevent. If a model misses its bar, it is recorded as measured-and-failed and
it does not ship. **A negative result here is a successful outcome of this phase**,
not a problem to be worked around — it costs a week instead of a paying customer.

Walk-forward: fit or tune on the earlier window, evaluate on a held-out tail that
is touched exactly once.

## 7. Deliverable

`engine/reports/<model_id>.<data_snapshot>.md` per model, plus a summary README:
what was tested, over what data, against what pre-registered bar, and what
happened. Written so the owner can decide what to build next from evidence
instead of intuition.

## 8. Explicitly out of scope this phase

Swing and invest families (17 §3b, §3c). Live scanning. The `/internal/setups/ingest`
contract. Any app change. Options. The Kai narration layer. Real-time WebSocket
consumption — this phase is historical bars only.

## 9. Environment notes

- Polygon: real-time entitlement and no call cap, verified 2026-08-29. The key in
  `apps/api/.env.local` is **shared with `~/breakout-alert-system`** — do not
  design as if you own the whole budget, and do not modify that file.
- Never run `supabase db reset`, and do not touch the app's database at all this
  phase.
- macOS has no `timeout` binary.
- Python 3.14 is what is on this machine; `websockets` is available.
