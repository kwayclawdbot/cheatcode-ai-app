# BUILD BRIEF — ENGINE-9: does Kai's own score pick better ORB candidates?

Owner, 2026-08-29: *"look at kai scoring for kai sms currently.. use it to
determine top 20 trades each day then run orb on those also"*.

## The question, stated fairly

ENGINE-7 established that selecting the day's 20 most abnormally active stocks
("stocks in play") is what makes the ORB work — that filter beat 20 random
eligible names by a margin clearing its error bar. The selector is the engine.

So: is Kai's existing score a BETTER selector than relative volume?

**Three selectors, identical rules downstream, judged head to head:**
1. `relvol` — top 20 by abnormal opening relative volume (the current, working one)
2. `kai` — top 20 by Kai's breakout score
3. `both` — high Kai score AND high relative volume

Everything after selection is held fixed and unchanged from `orb_sip.v2`/`v3`:
5-minute opening range, entry on the breakout in the direction of the first
candle, stop at the opposite extreme of the opening candle, hold to the close,
same costs, same 1% sizing and 4× leverage cap.

## The honest prior, which must appear in the report

Kai's score has a measured track record and it is poor. From
`alert_performance_honest` (167 graded alerts, 2026-05-15 → 07-14), grouped by
`breakout_score`: A (80+) n=126 → −0.56%, 47.6% win · B (70–79) n=20 → +2.42%,
35.0% · C (60–69) n=9 → −2.74% · D (<60) n=12 → −0.63%, **58.3% win**. No
monotonic relationship; the top band underperformed the bottom one.

**But that measured it as a SWING selector over 5–10 day horizons.** Using it to
choose which names to day-trade is a different job, and the fair test is the one
being run here. Report the prior, do not let it prejudge the result, and do not
quietly bury it if the new result is also negative.

There is a real mechanism by which it could help: relative volume selects stocks
that are BUSY TODAY; Kai's score selects stocks that are COILED (trend alignment,
squeeze, compression). Those are different properties and may be complementary —
which is why arm 3 exists.

## Porting the score

Source: `~/breakout-alert-system/cheatcode_scanner.py` (`score_cheatcode`) and
`cheatcode_engine.py` (the CCA V5 indicators — Trend Clouds, swing oscillator,
squeeze momentum, EMA cloud, reversal bands). Components: trend signal 0–20,
squeeze 0–20, swing 0–15, confluence 0–10, volume surge 0–12, plus RSI, BB
position, 52-week proximity and resistance room.

Read that code and port it faithfully — this is a test of Kai's actual score, not
of an approximation of it. Where the live scanner's behaviour cannot be
reproduced exactly (it fetches 180 days per name at scan time), say so precisely
rather than substituting your own judgement.

**Never call it "SuperTrend" anywhere. It is CheatCode Trend Clouds.**

**Lookahead:** the score is computed from DAILY bars, so compute it on the last
FULLY CLOSED daily bar before the session. It is then knowable at 09:30 and the
selection is clean. Give it the same poisoned-future / amputated-future treatment
as every other primitive. Vectorise per ticker over full history and index by
date rather than recomputing 180-day windows a million times.

## Window and discipline

Same as ENGINE-8, and do not widen it: **build 2021-08-29 → 2025-08-28, verdict
2025-08-29 → 2026-08-28 held back.** Pre-register `GATE.md` for all three arms in
the same commit as the specs, before evaluating any of them.

**Three arms on one held-back year triples the chance one looks good by luck.**
State that plainly and report ALL THREE outcomes regardless — no leading with the
winner, no de-emphasising the losers. If `relvol` still wins, say so; that is a
perfectly good result and it protects the thing that already works.

Gross before net, median beside mean, stop-out share, and **the money figure per
$1,000 risked** — the owner reads money, not R-multiples. If an arm's sample is
too thin to conclude, report it INCONCLUSIVE rather than reading a small number
as a verdict.
