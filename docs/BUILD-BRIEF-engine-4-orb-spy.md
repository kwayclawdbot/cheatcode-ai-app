# BUILD BRIEF — ENGINE-4: `orb_simple` on SPY — 1h and 4h variants

Owner, 2026-08-29, verbatim: *"15min h/l, a breakout in either direction on 5min
candle close above or below the h/l + htf trend confirmation for the entry. Stop
at the previous 5min candlestick high/low and tp at 2rr"* — and earlier: *"it
should be testing on spy… lets test both 1hr confirmation and 4hr confirmation
strats"*.

## Why the previous runs had so few trades (fix this first)

ENGINE-3 produced 20 SPY trades in three years. That was the SPEC's fault, not the
market's: it required 1h AND 4h to agree, skipped any trade whose structural
target was under 1.5R, and skipped any whose nearest level implied risk over a
cap. **This model has none of those skip rules.** A fixed 2R target cannot be "too
close" and a previous-candle stop is always available, so essentially every
breakout day with a confirming trend produces a trade. Expect a far higher count;
if it is still low, something is wrong — say so rather than shipping the number.

## The spec — exactly as dictated, no additions

- **Range:** 09:30–09:45 ET. Take its high and low.
- **Trigger:** a **5-minute candle closing** above the range high (long) or below
  the range low (short). Either direction qualifies.
- **Filter:** the higher-timeframe trend must confirm that direction. Two
  variants, each with its own pre-registered gate, each run separately:
  - **`orb_simple_1h.v1`** — 1-hour trend only
  - **`orb_simple_4h.v1`** — 4-hour trend only
  Same structure definition and same RTH bar convention ENGINE-3 documented
  (RTH-only, anchored 09:30, short final bucket kept, a bucket closes only once a
  later bar prints). Reuse it; do not re-litigate it.
- **Entry:** the open of the next 5-minute bar after the trigger bar closes.
- **Stop:** the **low (long) / high (short) of the trigger candle** — the last
  5-minute candle closed before entry. Nothing structural, no levels, no cap.
  *If the owner meant the candle before the trigger candle instead, that is a
  one-line change — record which reading was used, prominently, at the top of the
  report so it can be corrected in one pass.*
- **Target:** fixed **2R**. No structural target, no minimum-reward skip.
- **Exit:** flat at 15:55 ET if neither stop nor target is hit. Day trade only.
- **Frequency:** at most one trade per direction per day; a failed long does not
  block a later short. State the realised distribution of trades per day.

## Universe and history — this is the other half of the job

**SPY is the subject.** QQQ and IWM run too but are reported SEPARATELY, never
pooled into a SPY number.

**Extend the cache for these three symbols as far back as the plan allows —
target 10+ years.** The current cache is 2023-09 → 2026-08, which on one symbol
cannot produce an interpretable sample no matter how good the model is. This is
now cheap: the plan has no call cap (verified 2026-08-29). Extend the cache
under the existing versioned-snapshot discipline, give the new snapshot its own
name, and record the exact date range obtained per symbol along with any gaps.
Do not silently mix snapshots between models.

**Why SPY may genuinely differ, and it has never been isolated:** SPY's spread is
about a penny on a ~$770 instrument. On a $50 stock the same penny is ~15× more
expensive relative to the move. Every prior model measured a mixed basket where
cost drag ran 9–14% of risk. **Report SPY's realised cost drag as a fraction of
risk explicitly** — if it is materially lower, that is the most important number
in the report, and it reframes the whole programme.

## Gate

Pre-register `GATE.md` for BOTH variants, committed with the specs BEFORE any
evaluation, as `1021168` preceded `a43595d`. Separate verdicts for 1h and 4h.

Honesty requirements, unchanged and non-negotiable:
- These are models five and six on this data. Say so; out-of-sample is the verdict.
- Run the matched `null_coinflip` control on the same days and geometry, and
  **report gross versus control before net**.
- Report the **median** trade beside the mean. ENGINE-3's mean was positive while
  its median lost 25¢ — three outliers carried 445 losers. Any report showing only
  a mean is incomplete.
- Anti-lookahead treatment for anything new; extend the end-to-end
  amputated-session proof to both variants.

## Report

`engine/reports/orb_simple_{1h,4h}.v1.<snapshot>.md`, opening with a plain-language
summary — did it work, how sure are we, what would change the answer — with no
R-multiples that are not glossed in plain English, and the trade count and date
range stated in the first three lines.
