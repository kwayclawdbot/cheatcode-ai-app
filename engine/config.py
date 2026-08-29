"""ENGINE-1 configuration. No secrets live here; the Polygon key is read from
apps/api/.env.local at call time and is never written to disk by this package."""

from __future__ import annotations

import os
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = ENGINE_ROOT.parent
DATA_ROOT = ENGINE_ROOT / "data"
REPORTS_ROOT = ENGINE_ROOT / "reports"

# --- data snapshot -----------------------------------------------------------
# Bumping this creates a new immutable cache directory. A backtest report names
# the snapshot it ran against; without that the number is not reproducible.
SNAPSHOT = "polygon-v1"

CACHE_START = "2023-09-01"
CACHE_END = "2026-08-28"

# --- universe ----------------------------------------------------------------
# Chosen with hindsight: these are liquid *today*. See the survivorship note in
# every report. None of them were selected on performance.
INDEX_ETFS = ["SPY", "QQQ", "IWM", "DIA"]
SECTOR_ETFS = ["XLF", "XLE", "SMH"]
NAMES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD", "NFLX",
    "AVGO", "CRM", "JPM", "BAC", "XOM", "WMT", "COST", "DIS", "BA", "UBER",
    "PLTR", "COIN", "MU", "INTC", "QCOM", "GS",
]
UNIVERSE = INDEX_ETFS + SECTOR_ETFS + NAMES
BENCHMARK = "SPY"

# sector map used by relative-strength primitives; ETFs map to themselves
SECTOR_ETF_OF = {
    "AAPL": "SMH", "MSFT": "QQQ", "NVDA": "SMH", "AMZN": "QQQ", "META": "QQQ",
    "GOOGL": "QQQ", "TSLA": "QQQ", "AMD": "SMH", "NFLX": "QQQ", "AVGO": "SMH",
    "CRM": "QQQ", "JPM": "XLF", "BAC": "XLF", "XOM": "XLE", "WMT": "SPY",
    "COST": "SPY", "DIS": "SPY", "BA": "SPY", "UBER": "QQQ", "PLTR": "QQQ",
    "COIN": "XLF", "MU": "SMH", "INTC": "SMH", "QCOM": "SMH", "GS": "XLF",
}

# --- sessions (US/Eastern) ---------------------------------------------------
PREMARKET_OPEN_MIN = 4 * 60          # 04:00
RTH_OPEN_MIN = 9 * 60 + 30           # 09:30
RTH_CLOSE_MIN = 16 * 60              # 16:00
EARLY_CLOSE_MIN = 13 * 60            # 13:00 on half days
POSTMARKET_CLOSE_MIN = 20 * 60       # 20:00


def polygon_api_key() -> str:
    key = os.environ.get("POLYGON_API_KEY")
    if key:
        return key
    env = REPO_ROOT / "apps" / "api" / ".env.local"
    for line in env.read_text().splitlines():
        if line.startswith("POLYGON_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("POLYGON_API_KEY not found in env or apps/api/.env.local")
