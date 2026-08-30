# Pre-registered gate — `orb_sip.v4_prior` (ENGINE-10)

**One gate governs both arms of this lane and it is
[`../orb_sip.v4_trigger/GATE.md`](../orb_sip.v4_trigger/GATE.md).**

`orb_sip.v4_trigger` and `orb_sip.v4_prior` are not two models that happened to
be run together. They are the two readings of one ambiguous sentence in the
owner's spec — *"stop at the low of 5min candle before the entry candle"* —
pre-registered as arms precisely so that the ambiguity is settled with numbers
instead of a guess, run once, together, and reported together. Splitting the
bar into two files would make it possible to quietly drop one after a number
existed. It is one file, and P1-P5 are defined in it beside S1-S5.

This arm's stop: **the extreme of the five-minute candle immediately BEFORE the
one the fill happened in** — the low for a long, the high for a short. It is the
owner's earlier *"previous 5min h/l"* reading, the one ENGINE-5 measured and
found better on average. On the trades that fill inside 09:35-09:40 the candle
before is the 09:30-09:35 opening range itself, so on those this arm **is**
`orb_sip.v2`; the report states the realised share.
