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

# NYSE full-day closures, 2012-2026. The 2012-2022 block was added for
# ENGINE-4's `polygon-deep-v1` snapshot; `cache/manifest.py` diffs the whole
# table against the tape, so a mistyped date shows up as a MISSING or EXTRA day
# in the audit rather than as a silent trade on a closed market.
HOLIDAYS = {
    # 2012 (Oct 29-30: Hurricane Sandy)
    "2012-01-02", "2012-01-16", "2012-02-20", "2012-04-06", "2012-05-28",
    "2012-07-04", "2012-09-03", "2012-10-29", "2012-10-30", "2012-11-22",
    "2012-12-25",
    # 2013
    "2013-01-01", "2013-01-21", "2013-02-18", "2013-03-29", "2013-05-27",
    "2013-07-04", "2013-09-02", "2013-11-28", "2013-12-25",
    # 2014
    "2014-01-01", "2014-01-20", "2014-02-17", "2014-04-18", "2014-05-26",
    "2014-07-04", "2014-09-01", "2014-11-27", "2014-12-25",
    # 2015
    "2015-01-01", "2015-01-19", "2015-02-16", "2015-04-03", "2015-05-25",
    "2015-07-03", "2015-09-07", "2015-11-26", "2015-12-25",
    # 2016
    "2016-01-01", "2016-01-18", "2016-02-15", "2016-03-25", "2016-05-30",
    "2016-07-04", "2016-09-05", "2016-11-24", "2016-12-26",
    # 2017
    "2017-01-02", "2017-01-16", "2017-02-20", "2017-04-14", "2017-05-29",
    "2017-07-04", "2017-09-04", "2017-11-23", "2017-12-25",
    # 2018 (Dec 5: national day of mourning, George H. W. Bush)
    "2018-01-01", "2018-01-15", "2018-02-19", "2018-03-30", "2018-05-28",
    "2018-07-04", "2018-09-03", "2018-11-22", "2018-12-05", "2018-12-25",
    # 2019
    "2019-01-01", "2019-01-21", "2019-02-18", "2019-04-19", "2019-05-27",
    "2019-07-04", "2019-09-02", "2019-11-28", "2019-12-25",
    # 2020
    "2020-01-01", "2020-01-20", "2020-02-17", "2020-04-10", "2020-05-25",
    "2020-07-03", "2020-09-07", "2020-11-26", "2020-12-25",
    # 2021 (Juneteenth became federal in 2021; the NYSE first observed it in 2022)
    "2021-01-01", "2021-01-18", "2021-02-15", "2021-04-02", "2021-05-31",
    "2021-07-05", "2021-09-06", "2021-11-25", "2021-12-24",
    # 2022
    "2022-01-17", "2022-02-21", "2022-04-15", "2022-05-30", "2022-06-20",
    "2022-07-04", "2022-09-05", "2022-11-24", "2022-12-26",
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
    "2012-07-03", "2012-11-23", "2012-12-24",
    "2013-07-03", "2013-11-29", "2013-12-24",
    "2014-07-03", "2014-11-28", "2014-12-24",
    "2015-11-27", "2015-12-24",
    "2016-11-25",
    "2017-07-03", "2017-11-24",
    "2018-07-03", "2018-11-23", "2018-12-24",
    "2019-07-03", "2019-11-29", "2019-12-24",
    "2020-11-27", "2020-12-24",
    "2021-11-26",
    "2022-11-25",
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
