"""ENGINE-6 (`orb_sip.v1`) data configuration.

A THIRD immutable snapshot. `polygon-v1` (32 names) and `polygon-deep-v1`
(SPY/QQQ/IWM) are untouched and no report mixes any of the three.

Why the window is 2016-01-01 -> 2026-08-28: Zarattini, Barbon & Aziz measured
2016-2023. Testing only 2024+ would answer "has it decayed", not "can this
harness see it". So the replication window IS the paper's window, and the years
after publication are held back and reported separately.

Every price series in this snapshot is UNADJUSTED. The universe filter is
"price > $5" as a trader saw it on the day; on split-adjusted prices a stock
that later did a 1-for-10 reverse split would be back-promoted into the
universe at a price it never traded at, which is lookahead through the back
door. The cost is that a 20-day average volume window spanning a split date is
wrong for one name on a couple of days. That is noise. The other is bias.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- snapshot identity, overridable for a SEPARATE snapshot ------------------
# ENGINE-15 needs an out-of-sample window that no lane has ever read, and the
# only one available is EARLIER in time (there is no forward data: the tape ends
# on the last completed session). It must not be mixed into `polygon-sip-v1`,
# because rule 1 of this directory is that a result names its snapshot and
# quietly widening what a snapshot name covers breaks every report that already
# cites it. So the identity and the window are read from the environment, with
# the ENGINE-6 values as defaults, and an early snapshot is fetched under its
# own name into its own directory:
#
#   SIP_SNAPSHOT=polygon-sip-early-v1 SIP_WARMUP_START=2011-10-03 \
#   SIP_START=2012-01-01 SIP_END=2015-12-31 .venv/bin/python sip/fetch_grouped.py
#
# Nothing reads these implicitly: every report prints `scfg.SNAPSHOT`, so a run
# under the wrong override names itself in its own output.
SNAPSHOT = os.environ.get("SIP_SNAPSHOT", "polygon-sip-v1")

# grouped daily bars are fetched from WARMUP_START so that the first trading day
# of the window already has 20 prior sessions of volume and 14 of ATR
WARMUP_START = os.environ.get("SIP_WARMUP_START", "2015-10-01")
START = os.environ.get("SIP_START", "2016-01-01")
END = os.environ.get("SIP_END", "2026-08-28")

# the paper's window; everything after it is held back and reported separately
REPLICATION_END = "2023-12-31"

ENGINE_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ENGINE_ROOT / "data" / SNAPSHOT
GROUPED_DIR = DATA_ROOT / "grouped"
OPEN5_DIR = DATA_ROOT / "open5"          # first 5-minute bars of each session
MIN1_DIR = DATA_ROOT / "1m"              # full sessions, selected symbol-days only

# --- the paper's universe filter, computed as of the PRIOR close -------------
MIN_PRICE = 5.0
MIN_AVG_VOLUME = 1_000_000.0     # 20-day average, shares
MIN_ATR = 0.50                   # 14-day ATR, dollars
AVG_VOLUME_DAYS = 20
ATR_DAYS = 14

# --- the candidate pool ------------------------------------------------------
# We cannot download one-minute bars for every eligible name. POOL_N is the top
# N of the eligible set by 20-day average DOLLAR volume as of the prior close.
# This is knowable at 09:30 and it is the honest way to shrink the problem; it
# is also a real weakening of the paper's filter and every report says so.
POOL_N = 1000

# --- selection ---------------------------------------------------------------
OPEN_WINDOW_MINUTES = 5          # 09:30-09:35
RVOL_BASELINE_DAYS = 14
TOP_K = 20
MIN_RVOL = 1.0                   # "abnormal": at least normal opening volume
