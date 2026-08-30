"""The SPY reference panel — ENGINE-13's index confluence, and its as-of rule.

SPY is a DIFFERENT SERIES from the one being traded, so the `BarView` argument
that makes lookahead structurally impossible everywhere else in this engine does
not automatically cover it. A model that reads SPY reads it through this class,
and this class is written so that the future is unreachable from inside it:

* it is indexed per ET day, so no query can cross a day boundary;
* within a day it locates a bar with `searchsorted(minutes, m, side="right") - 1`,
  which returns the last bar whose minute is **<= m** and cannot return a later
  one;
* `direction()` asserts that both minutes it reads are at or before the caller's
  decision minute, so a caller that passes a future minute raises instead of
  quietly answering.

`tests/test_orb_sip_15c.py` attacks it with the poisoned-future and
amputated-future harness from `tests/test_no_lookahead.py`, and runs a
deliberately cheating panel through the same attacks, which must be caught.

The bars come from `polygon-deep-v1`, which already holds SPY 2012-01-03 ->
2026-08-28 on disk. Nothing here downloads anything, and no statistic mixes SPY
prices with the `polygon-sip-v1` prices being traded — the panel returns a SIGN
and nothing else.
"""

from __future__ import annotations

import numpy as np

from engine.series import BarSeries


class SpyPanel:
    """Per-ET-day one-minute closes for one reference symbol, read as-of only."""

    __slots__ = ("symbol", "_minute", "_close")

    def __init__(self, series: BarSeries) -> None:
        self.symbol = series.symbol
        self._minute: dict[int, np.ndarray] = {}
        self._close: dict[int, np.ndarray] = {}
        for day, (a, b) in series.day_bounds().items():
            m = np.ascontiguousarray(series.minute[a:b], dtype="int64")
            c = np.ascontiguousarray(series.close[a:b], dtype="float64")
            order = np.argsort(m, kind="stable")
            self._minute[int(day)] = m[order]
            self._close[int(day)] = c[order]

    def has_day(self, day: int) -> bool:
        return int(day) in self._minute

    def close_at(self, day: int, minute: int) -> float | None:
        """The close of the last bar on `day` whose minute is <= `minute`.

        `side="right"` then `- 1` is the whole as-of rule: the returned index is
        the last position whose minute does not exceed `minute`, so a bar that
        prints later in the session is not reachable from here.
        """
        m = self._minute.get(int(day))
        if m is None:
            return None
        j = int(np.searchsorted(m, int(minute), side="right")) - 1
        if j < 0:
            return None
        return float(self._close[int(day)][j])

    def direction(self, day: int, minute: int, ref_minute: int) -> int | None:
        """sign(close at `minute` - close at `ref_minute`), both as-of.

        Returns +1, -1, 0, or None when either reference is unavailable. Raises
        if asked for a minute after the caller's own decision minute, because
        that is the bug this class exists to make impossible.
        """
        if int(ref_minute) > int(minute):
            raise ValueError(
                f"{self.symbol}: reference minute {ref_minute} is after the "
                f"decision minute {minute}")
        a = self.close_at(day, ref_minute)
        b = self.close_at(day, minute)
        if a is None or b is None:
            return None
        if b > a:
            return 1
        if b < a:
            return -1
        return 0
