# BUILD BRIEF — ENGINE-8: `orb_sip.v3` — daily trend must agree with the breakout

Owner, 2026-08-29: *"adding a filter for trades that are already in momentum
going in the direction of the breakout.. so bullish orb + bullish trend. If daily
trend bearish and bullish orb dont take the trade"*.

## Why this is worth a run rather than another variant

ENGINE-7 (`orb_sip.v2`) came out marginally positive on held-back data
(+$20 per $1,000 risked, interval −$2 to +$42) and, importantly, **located its
own failure**: the entire loss comes from the 2,081 mornings where BOTH ends of
the opening range broke. On those days the side the first candle points at is the
losing end. The model has no rule for choosing between two breaks — and a daily
trend filter is exactly such a rule.

Note honestly: ENGINE-3 and ENGINE-5 tested trend filters (1h, 4h, both) and
found nothing. That was on a fixed 32-name basket with a stop we now know was
wrong — a filter on a broken base. This is a filter on a base that clears zero.
Different experiment; do not treat the earlier null as settling it, and do not
treat it as irrelevant either. Report the comparison.

## The spec — `orb_sip.v3`

Identical to `orb_sip.v2` in every respect (same universe, same top-20 selection
as-of 09:35, same 5-minute opening range, same entry on the breakout in the
direction of the first candle, same stop at the opposite extreme of the opening
candle, same hold-to-close exit, same costs and sizing) plus ONE gate:

**The daily trend must agree with the breakout direction.** Long breakouts only
when the daily trend is up, shorts only when it is down. Anything else — trend
sideways, or trend opposing — is **no trade**, not a smaller trade.

Use the daily structure definition already built and documented (confirmed higher
high AND higher low, last swing low unbroken; mirror for down), evaluated on the
**last fully closed daily bar** before the session. Never today's forming bar.

## What must be reported, beyond the usual

1. **The both-sides-broke subset, separately.** That is the diagnosed failure and
   the reason this filter is being tried. Report those mornings before and after,
   and whether the filter picks the right side on them. If it fixes that subset
   but nothing else, that is still the most useful sentence in the report.
2. **How many trades the filter removes**, and what those removed trades did.
   A filter that skips trades that would have won is not helping, even if the
   average improves.
3. Whether the filter's benefit (if any) survives when the both-sides-broke
   mornings are excluded — i.e. is it a genuine directional edge or just a tie-break?

## The data honesty problem — state it in the plain-English summary

**The held-back window (2024-01 → 2026-08) has already been used twice.** This
would be a third look, and a third look is weak evidence no matter how the number
comes out.

So: **evaluate primarily on 2016–2023.** This filter is a NEW idea and was not
chosen by looking at that window, so it is a fair test there — unlike the stop
width, which was. Report 2024–2026 as a clearly-labelled **third use, weakened
evidence**, not as the verdict.

Pre-register `engine/models/orb_sip.v3/GATE.md` in the same commit as the spec,
before any evaluation. Run the matched control and the random-20 comparison.
Report gross before net, median beside mean, stop-out share, and the money figure
per $1,000 risked so the owner can read it without R-multiples.

## Out of scope

No other change. No stop tuning, no target, no timeframe sweep, no second trend
definition. One filter, one gate, one verdict. If it fails, report the failure.
