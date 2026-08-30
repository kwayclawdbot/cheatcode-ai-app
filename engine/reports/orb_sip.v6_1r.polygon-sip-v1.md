# `orb_sip.v6_1r` — a 1R take-profit on the two measured entry rules

**Verdict: NO EFFECT.** Decided on 2024-01-01 → 2026-08-28 and on nothing else. Best capped arm: `v2_1r`.

Snapshot `polygon-sip-v1`, unchanged. Selection is ENGINE-6's `selection.json.gz`, `sip` arm, byte for byte. Gate: [`../models/orb_sip.v6_1r/GATE.md`](../models/orb_sip.v6_1r/GATE.md), committed before any number below existed. Git rev `20a6c51`. Nothing was downloaded; the run took 2.1 minutes.

## In plain English

**What changed.** One thing: a resting limit order to take profit at one unit of risk from the fill. If a trade risks $1,000, it now closes for +$1,000 the moment it gets there, instead of holding to the 15:59 bell. Everything else — the range, the direction rule, the entry, the stop level, the twenty names, the costs — is untouched.

**This is the seventh reading of this window.** Every session on disk has been looked at by an earlier lane; there is no un-looked-at data left, and fetching some would mean paid Polygon calls, which this lane was forbidden. No correction is applied because none is available. Four comparisons on one window is four chances to look good by luck — nearer 19% than 5% — so the Bonferroni-corrected interval is printed beside every comparison. **Everything below is suggestive, not conclusive.**

- **v2 (the incumbent, no target)** — 10,545 trades over 667 days. Average **+20 dollars a trade** per $1,000 risked (+0.0199R); middle trade -118 dollars; **45.0% finished green**; 31.6% stopped, 0.0% hit the 1R target, 68.4% ran to the bell. 95% range -2 dollars to +42 dollars, which contains zero.
- **v2_1r (the incumbent, capped at 1R)** — 10,545 trades over 667 days. Average **+4 dollars a trade** per $1,000 risked (+0.0038R); middle trade +6 dollars; **50.2% finished green**; 28.6% stopped, 31.0% hit the 1R target, 40.4% ran to the bell. 95% range -12 dollars to +19 dollars, which contains zero.
- **c15 (15-min range on a 5-min close, no target)** — 11,476 trades over 667 days. Average **-13 dollars a trade** per $1,000 risked (-0.0128R); middle trade -36 dollars; **47.0% finished green**; 14.2% stopped, 0.0% hit the 1R target, 85.8% ran to the bell. 95% range -26 dollars to -0 dollars, which excludes zero.
- **c15_1r (the same, capped at 1R)** — 11,476 trades over 667 days. Average **-10 dollars a trade** per $1,000 risked (-0.0099R); middle trade -22 dollars; **48.2% finished green**; 13.8% stopped, 14.9% hit the 1R target, 71.3% ran to the bell. 95% range -21 dollars to +2 dollars, which contains zero.

- **`v2_1r` minus `v2`** (the cap against its own uncapped twin), paired day by day: **-16 dollars** a trade (-0.0160R), 95% range -32 dollars to +0 dollars over 667 days. The range contains zero, so no effect is established. Corrected for four shots: -36 dollars to +5 dollars.
- **`c15_1r` minus `c15`** (the cap against its own uncapped twin), paired day by day: **+3 dollars** a trade (+0.0029R), 95% range -4 dollars to +9 dollars over 667 days. The range contains zero, so no effect is established. Corrected for four shots: -5 dollars to +11 dollars.
- **`v2_1r` minus the incumbent `v2`**, paired day by day: **-16 dollars** a trade (-0.0160R), 95% range -32 dollars to +0 dollars over 667 days.

- **Verdict**: **NO EFFECT**.

**Which gates carried the verdict, in words.** X1 passed (sample, per arm (verdict)). X2 FAILED (the 1R cap helps `v2` (verdict, paired by day, net R, v2_1r minus v2)). X3 FAILED (the 1R cap helps `c15` (verdict, paired by day, net R, c15_1r minus c15)). X4 FAILED (the best capped arm beats the incumbent outright (verdict, paired by day, net R)). X5 FAILED (sign, per arm (verdict)). X6 passed (era sign agreement (2016-2019, 2020-2023, 2024-2026)).

## The amputation table — what a 1R cap deletes

A cap can only ever help if there is little profit above the cap. This table is computed on the UNCAPPED arms, so it says what was there to lose before anything was cut.

| uncapped arm | reached +0.5R | +1R | +2R | +3R | +5R | a cap KEEPS (up to +1R) | a cap GIVES AWAY (above +1R) | net |
|---|---|---|---|---|---|---|---|---|
| `v2` | 55.8% | 31.0% | 10.0% | 3.7% | 0.9% | -127 dollars | **+147 dollars** | +20 dollars |
| `c15` | 39.5% | 15.0% | 2.5% | 0.6% | 0.1% | -52 dollars | **+39 dollars** | -13 dollars |

**Read the incumbent's row across.** Everything up to the +1R mark is a net LOSS of -127 dollars a trade. The part of its winners ABOVE +1R earns +147 dollars a trade. Those two sum to the +20 dollars the strategy actually makes. **The entire result lives above the +1R line, which is precisely what a 1R cap deletes** — only 31.0% of trades ever get there, and they carry all of it. That is the mechanism, stated before the run in the GATE, and X2 is whether the higher win rate pays for it.

## The pre-registered bar, and what it read

| id | gate | threshold | observed | |
|---|---|---|---|---|
| **X1** | sample, per arm (verdict) | >=3,000 for every arm | v2=10,545, v2_1r=10,545, c15=11,476, c15_1r=11,476 | PASS |
| **X2** | the 1R cap helps `v2` (verdict, paired by day, net R, v2_1r minus v2) | 95% interval excludes zero, in the challenger's favour | -0.0160 (95%: -0.0320 to +0.0001, days=667) | **FAIL** |
| **X3** | the 1R cap helps `c15` (verdict, paired by day, net R, c15_1r minus c15) | 95% interval excludes zero, in the challenger's favour | +0.0029 (95%: -0.0036 to +0.0095, days=667) | **FAIL** |
| **X4** | the best capped arm beats the incumbent outright (verdict, paired by day, net R) | 95% interval excludes zero, in the challenger's favour | -0.0160 (95%: -0.0320 to +0.0001, days=667) | **FAIL** |
| **X5** | sign, per arm (verdict) | mean gross R > 0 AND mean net R > 0 | v2: gross=+0.0324/net=+0.0199, v2_1r: gross=+0.0163/net=+0.0038, c15: gross=-0.0038/net=-0.0128, c15_1r: gross=-0.0008/net=-0.0099 | **FAIL** |
| **X6** | era sign agreement (2016-2019, 2020-2023, 2024-2026) | for any arm clearing X2 or X3, mean net R > 0 in all three eras | v2_1r: 2016-2019=+0.0190, 2020-2023=+0.0037, 2024-2026=+0.0038; c15_1r: 2016-2019=-0.0088, 2020-2023=-0.0045, 2024-2026=-0.0099 | PASS |

## The verdict window, 2024-01-01 → 2026-08-28

| arm | trades | days | gross R | true zero cost | net R | median | money per $1,000 | 95% range | hit | stop | target | bell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `v2` | 10,545 | 667 | +0.0324 | +0.0437 | +0.0199 | -0.1180 | +20 dollars | -2 dollars to +42 dollars | 45.0% | 31.6% | 0.0% | 68.4% |
| `v2_1r` | 10,545 | 667 | +0.0163 | +0.0252 | +0.0038 | +0.0065 | +4 dollars | -12 dollars to +19 dollars | 50.2% | 28.6% | 31.0% | 40.4% |
| `c15` | 11,476 | 667 | -0.0038 | +0.0041 | -0.0128 | -0.0363 | -13 dollars | -26 dollars to -0 dollars | 47.0% | 14.2% | 0.0% | 85.8% |
| `c15_1r` | 11,476 | 667 | -0.0008 | +0.0062 | -0.0099 | -0.0224 | -10 dollars | -21 dollars to +2 dollars | 48.2% | 13.8% | 14.9% | 71.3% |

| slice | n | hit | mean R | median R | mean % | payoff | PF | total R | maxDD R | max losing run |
|---|---|---|---|---|---|---|---|---|---|---|
| v2 | 10545 | 45.0% | 0.020 | -0.118 | 0.082% | 1.28 | 1.05 | 209.4 | 66.9 | 20 |
| v2_1r | 10545 | 50.2% | 0.004 | 0.006 | 0.072% | 1.00 | 1.01 | 39.7 | 56.1 | 12 |
| c15 | 11476 | 47.0% | -0.013 | -0.036 | -0.034% | 1.07 | 0.95 | -147.4 | 149.8 | 12 |
| c15_1r | 11476 | 48.2% | -0.010 | -0.022 | -0.022% | 1.03 | 0.96 | -113.4 | 139.5 | 12 |

### The win-rate trap, stated explicitly

- `v2` → `v2_1r`: win rate 45.0% → 50.2% (+5.3 points), money +20 dollars → +4 dollars (-16 dollars a trade). **The win rate went UP and the money went DOWN. That is the exact trap a take-profit is attractive for.**
- `c15` → `c15_1r`: win rate 47.0% → 48.2% (+1.2 points), money -13 dollars → -10 dollars (+3 dollars a trade). 

### Trades resolved by the stop-before-target assumption

When one bar's range holds both the stop and the target, `fills.py` assumes the STOP was hit first. That rule was dormant in every prior lane because no model had a target. It is live here, it is pessimistic, and it was not relaxed for this lane.

| arm | ambiguous trades | share |
|---|---|---|
| `v2` | 0 | 0.0% |
| `v2_1r` | 0 | 0.0% |
| `c15` | 0 | 0.0% |
| `c15_1r` | 1 | 0.0% |

## Realised stop width — unchanged by the cap, as it must be

| arm | trades | median stop | % of price | in 14-day ATRs |
|---|---|---|---|---|
| `v2` | 10,545 | 134¢ | 2.84% | 0.75 |
| `v2_1r` | 10,545 | 134¢ | 2.84% | 0.75 |
| `c15` | 11,476 | 177¢ | 3.65% | 0.99 |
| `c15_1r` | 11,476 | 177¢ | 3.65% | 0.99 |

## Proof that the `v2` arm is the incumbent

| | ENGINE-7 reported | this run | |
|---|---|---|---|
| trades | 10,545 | 10,545 | match |
| mean gross R | +0.0324 | +0.0324 | match |
| mean net R | +0.0199 | +0.0199 | match |
| median net R | -0.1180 | -0.1180 | match |
| hit rate | 45.0% | 45.0% | match |
| stopped out | 31.6% | 31.6% | match |

## The era table — the substitute for a window nobody had seen

| arm | 2016-2019 | 2020-2023 | 2024-2026 |
|---|---|---|---|
| `v2` | +22 dollars (n=15,937) | +18 dollars (n=16,455) | +20 dollars (n=10,545) |
| `v2_1r` | +19 dollars (n=15,937) | +4 dollars (n=16,455) | +4 dollars (n=10,545) |
| `c15` | -10 dollars (n=17,456) | -7 dollars (n=17,851) | -13 dollars (n=11,476) |
| `c15_1r` | -9 dollars (n=17,456) | -5 dollars (n=17,851) | -10 dollars (n=11,476) |

## The contaminated window, 2016-01-01 → 2023-12-31 — a disclosure, not a verdict

| arm | trades | days | net R | money per $1,000 | hit | target hit |
|---|---|---|---|---|---|---|
| `v2` | 32,392 | 2,012 | +0.0202 | +20 dollars | 42.9% | 0.0% |
| `v2_1r` | 32,392 | 2,012 | +0.0112 | +11 dollars | 50.9% | 36.4% |
| `c15` | 35,307 | 2,012 | -0.0081 | -8 dollars | 46.9% | 0.0% |
| `c15_1r` | 35,307 | 2,012 | -0.0067 | -7 dollars | 48.8% | 17.9% |

## Caveats, and what would change the answer

- **The prior was written down before the run.** The GATE predicted this lane would fail, on the grounds that the incumbent's positive mean sits on a negative median and a 1R cap deletes the tail that produces it. The amputation table above is the mechanism. If the verdict is a null, **this confirms a prior rather than discovering something.**
- **Seventh reading of this window.** No correction applied because none exists. The only honest next step for any result here is forward, on sessions that have not happened yet.
- **The multiple was not swept.** 1R was tested once because that is what was asked for. 1.5R, 2R and a partial exit are different rules and each needs its own pre-registered bar; trying them now, after seeing this number, would make the result meaningless.
- **A full exit at 1R, not a partial.** 'Half off at 1R and let the rest run' is a different rule. ENGINE-5 measured it on the ETF family and it FAILED there; it has never been measured on this one.
- Fills are modelled from one-minute OHLC and cannot see inside a bar. A target fills at the level with no slippage; a stop slips. That asymmetry flatters the capped arms slightly and is unchanged from every prior lane.
- **No leveraged portfolio figure appears anywhere**, by pre-registration.

