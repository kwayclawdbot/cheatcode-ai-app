"""ENGINE-11 configuration — the windows, the arms, the two numbers, and where
the new artefacts live.

Nothing here touches `engine/sip/config.py` or the `polygon-sip-v1` snapshot.
The strength panel and the selection this lane produces are written to
`engine/data/trend-str-v1/`, a directory ENGINE-11 owns outright, so the shared
snapshot stays byte-identical to what ENGINE-6, -7, -8 and -9 read.

There are exactly TWO free numbers in this lane and both are fixed here, in the
same commit as `models/orb_trend_str.v1/GATE.md`, before any evaluation ran:
`POND_K` (how wide a pond the `rank` arm re-orders) and `GATE_STRENGTH` (the
`gate_strong` threshold). Neither is swept. Neither moves afterwards.
"""

from __future__ import annotations

from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ENGINE_ROOT / "data" / "trend-str-v1"
STRENGTH_PATH = DATA_ROOT / "strength.parquet"
SELECTION_PATH = DATA_ROOT / "selection11.json.gz"
PAIRS_PATH = DATA_ROOT / "pairs11.json"

# --- the window, and it does not move ---------------------------------------
# The owner's five years. The last one is held back and is the only thing that
# decides anything; the four before it exist so a reader can see whether the
# held-back year looks like the years around it.
BUILD_START = "2021-08-29"
BUILD_END = "2025-08-28"
HELD_START = "2025-08-29"
HELD_END = "2026-08-28"

# --- the three arms ----------------------------------------------------------
ARM_BASELINE = "baseline"
ARM_RANK = "rank"
ARM_GATE = "gate_strong"
ARMS = (ARM_BASELINE, ARM_RANK, ARM_GATE)

TOP_K = 20               # ENGINE-6's twenty stocks in play, unchanged
MIN_RVOL = 1.0           # ENGINE-6's floor, unchanged

# --- free number 1: the pond the `rank` arm re-orders ------------------------
# The owner's idea is "busiest stocks + trend strength", so the busy leg stays
# hard: the pond is the day's forty most abnormally active names — the top 4% of
# a ~985-name candidate list — and strength decides which twenty of those get
# traded. Two times TOP_K, because a pond equal to TOP_K makes re-ordering a
# no-op (the same twenty names, in a different order, is the same twenty trades)
# and a pond much wider than that stops being "the busiest stocks" at all.
# Declared, not swept.
POND_K = 40

# --- free number 2: the `gate_strong` threshold ------------------------------
# Directional trend strength runs on [-1, +1] by construction (see measure.py).
# +0.20 is the pre-registered cut: "meaningfully trending the way the range
# broke", set a priori rather than read off a distribution, and reported with
# the whole decile curve beside it so a reader can see what every other cut
# would have done.
GATE_STRENGTH = 0.20
