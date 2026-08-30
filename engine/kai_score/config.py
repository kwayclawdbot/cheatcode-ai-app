"""ENGINE-9 configuration — the windows, the arms, and where the new artefacts live.

Nothing here touches `engine/sip/config.py` or the `polygon-sip-v1` snapshot.
The daily bars, the split table and the selection this lane produces are written
to `engine/data/kai-sel-v1/`, a directory ENGINE-9 owns outright, so that the
shared snapshot stays byte-identical to what ENGINE-6 and ENGINE-7 read.
"""

from __future__ import annotations

from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ENGINE_ROOT / "data" / "kai-sel-v1"
DAILY_PATH = DATA_ROOT / "daily.parquet"
SPLITS_PATH = DATA_ROOT / "splits.json"
SCORES_PATH = DATA_ROOT / "scores.parquet"
SELECTION_PATH = DATA_ROOT / "selection9.json.gz"
PAIRS_PATH = DATA_ROOT / "pairs9.json"

# --- the window, and it does not move ---------------------------------------
# Five years. The last one is held back and is the only thing that decides
# anything; the four before it exist so that a reader can see whether the
# held-back year looks like the years around it.
BUILD_START = "2021-08-29"
BUILD_END = "2025-08-28"
HELD_START = "2025-08-29"
HELD_END = "2026-08-28"

# daily bars have to reach back far enough that the FIRST session of the build
# window already has a full 190-calendar-day scoring window behind it
DAILY_WARMUP_START = "2021-01-01"

# --- the live scanner's two fetches, in calendar days ------------------------
# `get_historical_df(ticker, lookback_days=N)` asks Polygon for
# `today - (N + 10)` to `today`. The prefilter passes 90, the scorer passes 180.
PREFILTER_LOOKBACK_CALENDAR_DAYS = 100
SCORE_LOOKBACK_CALENDAR_DAYS = 190

# the live scanner's own floors, reproduced
MIN_BARS = 50
MIN_PRICE = 5.0
MIN_AVG_VOLUME = 500_000.0
FRESH_SIGNAL_BARS = 3

# --- selection ---------------------------------------------------------------
TOP_K = 20
MIN_RVOL = 1.0

ARM_RELVOL = "relvol"
ARM_KAI = "kai"
ARM_BOTH = "both"
ARMS = (ARM_RELVOL, ARM_KAI, ARM_BOTH)
