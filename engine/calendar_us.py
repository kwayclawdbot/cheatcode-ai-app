"""US equity session calendar.

Two sources of truth, deliberately:

* the **table** below (NYSE holidays and early closes, typed by hand), and
* the **data** — the trading days and last-RTH-bar times actually present in the
  cached SPY bars.

`validate_against_cache()` compares them and reports every disagreement. A
calendar that quietly disagrees with the tape is how a backtest ends up trading
on a day the market was shut.
"""

from __future__ import annotations

import datetime as dt

# NYSE full-day closures, 2023-2026.
HOLIDAYS = {
    # 2023
    "2023-01-02", "2023-01-16", "2023-02-20", "2023-04-07", "2023-05-29",
    "2023-06-19", "2023-07-04", "2023-09-04", "2023-11-23", "2023-12-25",
    # 2024
    "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
    "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
    # 2025 (incl. 2025-01-09, national day of mourning for Jimmy Carter)
    "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
    "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
    "2025-12-25",
    # 2026 (July 4 falls Saturday; observed Friday July 3)
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
}

# Early closes: RTH ends 13:00 ET.
EARLY_CLOSES = {
    "2023-07-03", "2023-11-24",
    "2024-07-03", "2024-11-29", "2024-12-24",
    "2025-07-03", "2025-11-28", "2025-12-24",
    "2026-11-27", "2026-12-24",
}


def is_weekend(day: str) -> bool:
    return dt.date.fromisoformat(day).weekday() >= 5


def is_trading_day(day: str) -> bool:
    return not is_weekend(day) and day not in HOLIDAYS


def is_early_close(day: str) -> bool:
    return day in EARLY_CLOSES


def rth_close_minute(day: str) -> int:
    return 13 * 60 if is_early_close(day) else 16 * 60


def trading_days(start: str, end: str) -> list[str]:
    d = dt.date.fromisoformat(start)
    last = dt.date.fromisoformat(end)
    out = []
    while d <= last:
        s = d.isoformat()
        if is_trading_day(s):
            out.append(s)
        d += dt.timedelta(days=1)
    return out
