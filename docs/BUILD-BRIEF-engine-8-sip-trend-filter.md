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

## The evaluation window — owner's call, 2026-08-29

*"only use data from past 5 years. we should keep the current strat + the trend
confluence + top 20 etc"*

**Window: 2021-08-29 → 2026-08-28.** Everything before that is out. The rationale
is a trading judgement rather than a statistical one — market character (spreads,
participation, the retail/0DTE regime) is not the same as 2016's, and a model that
has to work in today's market should be judged on today's market. Earlier years
stay in the cache; they are simply not the subject.

**Split, to keep this a test rather than a fit:**
- **Build window: 2021-08-29 → 2025-08-28** (four years). Everything is decided here.
- **Verdict window: 2025-08-29 → 2026-08-28** (twelve months, held back). Nothing
  looks at it until the spec and gate are frozen.

Say plainly in the report that the 2024–2026 span has been touched by earlier
lanes, so the final year is not virgin data in the strictest sense — it is the
cleanest available under the owner's constraint, and the honest framing is
"suggestive, not conclusive". Do not overstate it either way.

A consequence to state, not to work around: five years and a trend filter that
sits out sideways markets will cut the sample hard. **If the held-back year has
too few trades to conclude, say INCONCLUSIVE.** Do not widen the window to
manufacture significance — the owner chose the window deliberately.

## Out of scope

No other change. No stop tuning, no target, no timeframe sweep, no second trend
definition. One filter, one gate, one verdict. If it fails, report the failure.
