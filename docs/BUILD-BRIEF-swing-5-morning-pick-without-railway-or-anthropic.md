# SWING-5 — the whole record is in the app, and Railway delivers straight into it

Owner, 2026-09-03, in order of priority:
> "railway is live now.. the point is we need to make sure all past picks are in app history
> cards with stops targets etc using the sms history if needed to recreate.. and going forward
> it goes from railway direct to app and stored in supabase etc"

Railway is LIVE again — the expired-trial blocker is gone. Anthropic credits are STILL OUT
(probed twice on 2026-09-03 against `apps/api/.env.prod`: `400 credit balance is too low`).

## PART 1 (do this first) — every past pick wears its levels

Measured in PRODUCTION (`eqepjztjmzmpvmlqsdiz`) on 2026-09-03:

| | count |
|---|---|
| setups total | 826 |
| **no `stop`** | **446** (172 swing, 274 day_trade) |
| **`targets` = `[]`** | **446** — the same rows |
| **no `thesis_plain`** (blank card) | **309** |
| no `entry_condition` | 0 |

The source holds more than the app took. `sent_alerts` rows carrying `stop_price`:
`kai_long` 1247/1247, `kai_short` 37/37, `orb` 59/98, but `intraday` 0/160,
`kai_long_pullback_or_break` 0/45, `kai_long_or_break` 0/15, `kai_short_shadow` 0/15.
So part of the 446 is a mapping/refresh failure on levels the app was already handed — the
09-02 backfill filled the source in *behind* an ingest that had already written those history
rows once — and part is a genuine reconstruction job.

**THE ORDER OF TRUTH, and it is not negotiable:**
1. **What was published.** `humanized_message` is the SMS a subscriber actually received; the
   stored `stop_price`/`pattern_target` are what `format_alert_sms` stashed. If it went out, it
   is the answer. Parse it, do not recompute it.
2. **Deterministic as-of reconstruction.** `scripts/backfill_alert_levels.py` in
   `~/breakout-alert-system` already does this for `kai_long` and is VALIDATED against the only
   ground truth there is: VLO reproduces 273.55/301.54 exactly, EOG's stop to 0.022%. Extend
   its coverage; do not rewrite its method. Strictly as-of, never overwrites, stamps provenance.
3. **Refuse.** A flat-percentage fallback manufactures a number that was never anybody's stop.
   A card with no stop is honest; a card with an invented one is not. Count and name every
   refusal.

`thesis_plain` comes from `humanized_message`. 309 blanks is the same question asked of the
description: recover the published text where one was sent, compose from measured numbers where
one was not (see Part 3), leave it null rather than invent a thesis.

**A pick nobody received is not history.** `kai_short_shadow` (YETI, HBM, JD, VALE …) is
recorded by `record_shadow_shorts()` and deliberately NEVER broadcast — empty message, no stop,
no target. It has no SMS history because there was no SMS. Keep it OUT of History unless the
owner says otherwise, and say so in the report rather than silently importing it.

Gate: re-run the ingest and the count of setups with no stop, empty targets, or no thesis_plain
is the number of picks that genuinely have no recoverable levels — every one of them named, by
family, with the reason. The ingest must be able to FILL a row it wrote earlier; write-once on
history rows plus a fingerprint skip is what let the source get ahead of the app.

## PART 2 — Railway delivers straight into the app

Forward path: the morning job POSTs its picks to the app the moment it has them, and the app
stores them in its own Supabase. Not a pull that runs ten minutes later. `kai_morning_alerts.py`
already has the shape of this in `_mirror_alerts_to_app()` (~line 2910) — additive,
non-blocking, shared-secret, idempotent `client_id`/`run_id` — but it points at the OLD club app
(`app.familyinvestingclub.com`). This lane needs the same discipline pointed at
`cheatcode-ai-api.vercel.app`, authed with `INTERNAL_SECRET` (`lib/internal-auth.ts`), landing
through the SAME mapping the pull uses so a pick is identical whichever way it arrived —
same v5 UUID from (ticker, ET date, alert_type), same percentile score, same fan-out rules.

**The push must never be able to break the SMS send.** It runs after, it is caught, it never
raises, it never delays. And the ten-minute pull cron STAYS as the safety net: if the push fails
or Railway is pinned again, the pick still arrives, and arriving twice must be a no-op.

Deploying to Railway is now possible again. It is still OUTWARD-FACING — it changes what ~130
paying SMS subscribers receive, including the 09-01 ATR calibration that moves the median stop
2.84% → 8.57%. **Do not deploy. Report what a deploy would change and let the owner decide.**

## PART 3 — a pick still has to be generatable with no model

Railway being live does not by itself produce a pick. `run_morning_alerts()` calls
`load_scan_plan()` → `KaiVault().get_scan_plan()`, which returns None once the plan is >18h old,
and the run returns `{'error': 'No scan plan'}` before it scans anything. `generate_scan_plan()`
is an `import anthropic` call and the balance is empty. The scan itself is EODHD/Polygon and
needs no model; the owner considers the sector agents that feed the LLM plan retired.

- **A deterministic scan plan** in the same JSON shape (`thesis`, `sectors{score_adj,
  threshold_long, threshold_short, stance, direction, context}`, `priority_tickers`,
  `priority_threshold`, `individual_override`, `avoid_tickers`, `generated_at`,
  `source: "deterministic"`), computed from sector-ETF data with arithmetic only, reproducible
  on a re-run over the same as-of data, thesis composed from the numbers rather than written.
  Prefer the neutral setting over invented conviction — ENGINE-9 already measured
  `breakout_score` as no better than a coin toss at ranking outcomes.
- **A description with no model.** The Opus narrative is what fills `humanized_message` →
  `thesis_plain`. Compose it from what the scan already measured (gap, volume ratio, RSI, the
  level anchors, the sector line). Plain and concrete; it may not claim what the numbers do not.

## Gates

- Part 1's number: after a re-run, every remaining incomplete card is named and justified.
- The generation path runs with the Anthropic key REMOVED from the environment and produces a
  pick with a description. Not "degrades gracefully" — runs.
- Zero SMS from anything built here. Twilio untouched.
- End to end against PRODUCTION: a pick pushed by the Railway path appears in the hosted app as
  an Active setup with stop, target and description, and arrives exactly once when the pull cron
  also sees it.
- The 217 unit assertions and the SWING-4 proofs still pass.

## Rails

- Kai Supabase is the live SMS product. Levels/backfill writes only; no broadcast, no Twilio.
- Store what you publish. Never present the managed-trade number (38.7%, median R −1.0) as a
  performance claim. Report win rates and medians, never means — split artifacts destroy means.
