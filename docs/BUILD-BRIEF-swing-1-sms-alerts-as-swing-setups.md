# SWING-1 — the SMS alert engine becomes the app's swing family

Owner decision, 2026-09-01: **ship it.** The Kai SMS scanner's picks become swing
setups inside Cheat Code AI, and **the grade medallion is driven by the scoring
system.** This brief is binding. Where it conflicts with an older doc, this wins.

## What was measured first, and why it constrains the build

All 838 distinct picks (2026-02-01 → 2026-09-01) were graded on 2026-09-01 with
the direction-aware close-to-close engine in `~/breakout-alert-system/alert_outcomes.py`
(`scripts/repair_alert_outcomes.py --since 2026-02-01`; 2,313 rows, 0 errors,
backup at `data/backups/alert_performance_pre_v3_20260901T203247Z.json`).
This is **live forward evidence**, not a backtest: every pick was published to
paying subscribers before its outcome existed.

- **838 picks, 49.3% win at +5 sessions.** Long 358/692 = **51.7%**. Short 46/128 = **35.9%**.
- Long-only win rate by scanner score band: `<70` 54.1% (n=159), `70–89` 46.2% (n=234),
  `90–109` **57.6%** (n=172), `110+` 51.2% (n=127). **No slope, and the top band is not the best.**
- `breakout_score` runs 31→190, median 86. Under the app's existing `>=90 = gold`
  rule, **45.8% of picks would be an A**.
- Five picks carry impossible returns (ELPW +2707%, ELAB +778%, MVLL −81%) — an
  `alert_price` captured against unadjusted bars. Win rate is sign-only and
  survives it; **any mean does not.** Report win rates and medians, never means.

Three constraints fall out and they are not negotiable:

1. **Long only.** `alert_type LIKE 'kai_long%'`. The short family is excluded from
   ingestion entirely — 35.9% over 128 picks is a measured loser, not a thin sample.
2. **The medallion score is a PERCENTILE, not the raw scanner score.** See §2.
3. **The medallion never implies a win rate.** `features/grade/bands.ts` already says
   "Gold never means profit". It is a SETUP-QUALITY mark and the copy must stay that way.

## 1. The pipe

Source: Kai Supabase `ryprohqthwflinadqotj` (creds `~/breakout-alert-system/.env`,
DB password `~/.openclaw/secrets/supabase_db_password`, pooler
`aws-0-us-west-2.pooler.supabase.com:6543`). **Read-only. This build never writes
to the Kai DB** — that is the live SMS product and a separate lane (SWING-2) owns it.

Read `sent_alerts` joined to `alert_performance` (`is_primary` marks the pick-level
row; `win_5d`, `gain_5d_pct`, `direction`, `anchor_date` are the graded fields).

Target: the app's own Supabase, `setups` + `alerts`. The schema already fits —
`app_mode` has `swing`, and `setups` carries `entry_condition`, `stop`, `targets`,
`invalidation`, `score`, `score_components`, `grade_band`, `grade_display`,
`thesis_plain`, `quote_snapshot`, `scanner_run_id`, `valid_until`. **No migration
should be needed for the core object; if you find one is, say so before writing it.**

Field mapping, locked:

| `sent_alerts` | `setups` |
|---|---|
| `ticker` | `symbol` |
| `alert_price` | `entry_condition` (the published trigger — it is what the system is held to) |
| `stop_price` | `stop` |
| `pattern_target`, `next_resistance` | `targets` |
| `alert_type` | `intent` = `buy_to_open`; `mode` = `swing` |
| `breakout_score`,`quality_score`,`catalyst_score`,`flow_score`,`volume_ratio`,`rsi_at_alert` | `score_components` (see §3) |
| `setup_label`, `detected_pattern` | `thesis_technical` |
| `humanized_message` | `thesis_plain` |
| `sector`, `sector_stance`, `scan_metadata` | `quote_snapshot` |

**Idempotent by (ticker, ET date, alert_type).** Re-running the ingest writes
identical rows; it never duplicates a pick. Model it on `dedupe_alerts`/`pick_key`
in `alert_outcomes.py` — same unit of truth, do not invent a second one.

`valid_until`: a swing hold is 3–15 sessions (docs/17 §3b). Expire a setup that is
never acted on at +5 sessions from its anchor, so the Alerts tab does not fill with
stale objects.

## 2. The medallion — percentile in, existing bands untouched

**Do not change `apps/api/src/lib/round4/grade.ts` or `features/grade/bands.ts`.**
They already do the right thing: a 0–100 score drives the bands at 90/85/80/70/60.
The bug would be feeding them a 31–190 number.

Emit `setups.score` = **the percentile rank of this pick's `breakout_score` within a
trailing 180-day distribution of long picks, × 100.** Then, for free and with no UI
change: gold (≥90) = the top decile of picks, violet = the upper half, amber = the
bottom. Today's distribution (p50=86, p75=100, p90=124) is a *sanity check on your
implementation, not a constant to hardcode* — the window must recompute so the bands
self-calibrate as the scanner drifts.

`grade_band` (`A|B|C`) follows the same percentile: A ≥ p90, B ≥ p50, C below.
`grade_display` is the letter, using U+2212 for the minus per `displayGrade`.

## 3. The scorecard

`grade.ts` §2 rule holds: **no fractions cross the wire.** `score_components` is the
grading engine's business; the API emits a word from spec §4's vocabulary plus a 0–5
segment count and an English explanation. A component the scanner had no read on comes
back `Unknown` with strength 0 — a missing measurement is not a zero and not a pass.

Map the scanner's real components (volume ratio, RSI, catalyst, flow, pattern) onto
that contract. Do not invent components the scanner does not produce.

## 4. The honest performance line

Separate from the medallion, each swing alert carries a factual line sourced from
`alert_performance`: how this family has actually done. Long-only, pick-level,
win rate at +5 sessions, with the n. It is a fact with a sample size attached, never
a prediction, and it is never folded into the medallion or its colour.

## 5. Environment

`SUPABASE_URL` is still `http://127.0.0.1` — the app is NOT hosted (Supabase org
invoice). Everything here must be env-driven so it flips to hosted without a code
change. Do not hardcode a local URL anywhere.

## 6. The gate — what "done" means

1. A proof script that ingests a real window from the live Kai DB into the local app
   DB and asserts: pick count matches the source dedup, zero shorts, zero duplicate
   (ticker, date, type), and the band split lands near 10/40/50 rather than 46% gold.
2. Re-run the ingest twice; the second run changes nothing. Prove it, don't claim it.
3. **Verify in a real browser** (standing rule): the Alerts tab and one alert detail,
   screenshotted, medallion visible with a calibrated band. A Playwright pass against
   the running app, not a unit test.
4. Report the band distribution you actually produced. If gold comes out near 46%,
   the percentile mapping is wrong — say so rather than shipping it.

Report what failed as plainly as what worked. A number that disagrees with this brief
is a finding, not a mistake to hide.
