"""Stocks in play — the selection, and the reason it is the riskiest code here.

Everything else in ENGINE-6 is arithmetic we have run before. This module is
the one place where a bug produces a *beautiful* wrong answer: rank a day's
names by anything that knows how the day went and the backtest that follows
will look like the published result and mean nothing.

So the as-of rule is written three times over, in three different kinds of
enforcement:

1. **The data does not exist.** `sip/fetch_open5.py` keeps only 09:30-10:30 of
   each session. The afternoon is not on disk, so no amount of sloppiness in
   here can read it.
2. **The index cannot reach it.** `OpenStore` holds, per symbol, a
   day-ascending array of the 09:30-09:35 volume. `rvol(symbol, day)` divides
   that day's value by the mean of the `n` rows STRICTLY BEFORE it, located by
   `searchsorted`. There is no path from a day to a later day.
3. **The tests attack it.** `tests/test_sip_selection.py` runs the poisoned-
   future and amputated-future attacks from `tests/test_no_lookahead.py`
   against `select_day`, plus the attack this lane specifically needs: delete
   every bar after 09:35 on the selection day itself and require a byte-
   identical selection. A deliberately cheating selector is run through the
   same harness and must be caught, because a test that cannot fail proves
   nothing.

Definition, from the paper as the brief states it: relative volume is the
opening five minutes' volume over the average of the same five minutes across
the previous 14 sessions, and the day's "stocks in play" are the top 20 of the
candidate pool by that ratio.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from engine.sip import config as scfg

OPEN_MINUTE = 9 * 60 + 30          # the 09:30-09:35 five-minute bar


@dataclass(frozen=True)
class Pick:
    day: int
    symbol: str
    rvol: float
    open_volume: float
    baseline: float
    rank: int


class OpenStore:
    """Per-symbol, day-ascending opening-five-minute volume.

    Constructed once from the `open5` parquet tree. Holds nothing else — not
    the rest of the morning, not the close, not tomorrow.
    """

    __slots__ = ("_days", "_vol", "_dollar")

    def __init__(self, days: dict[str, np.ndarray], vol: dict[str, np.ndarray],
                 dollar: dict[str, np.ndarray] | None = None) -> None:
        self._days = {}
        self._vol = {}
        self._dollar = {}
        for sym, d in days.items():
            order = np.argsort(d, kind="stable")
            self._days[sym] = np.ascontiguousarray(np.asarray(d)[order], dtype="int64")
            self._vol[sym] = np.ascontiguousarray(np.asarray(vol[sym])[order], dtype="float64")
            if dollar is not None and sym in dollar:
                self._dollar[sym] = np.ascontiguousarray(
                    np.asarray(dollar[sym])[order], dtype="float64")

    def symbols(self) -> list[str]:
        return sorted(self._days)

    def has(self, symbol: str) -> bool:
        return symbol in self._days

    def _at(self, symbol: str, day: int) -> int | None:
        d = self._days.get(symbol)
        if d is None:
            return None
        j = int(np.searchsorted(d, day, side="left"))
        if j >= len(d) or int(d[j]) != int(day):
            return None
        return j

    def open_volume(self, symbol: str, day: int) -> float | None:
        j = self._at(symbol, day)
        return None if j is None else float(self._vol[symbol][j])

    def open_dollar(self, symbol: str, day: int) -> float | None:
        j = self._at(symbol, day)
        if j is None or symbol not in self._dollar:
            return None
        return float(self._dollar[symbol][j])

    def baseline(self, symbol: str, day: int,
                 n: int = scfg.RVOL_BASELINE_DAYS) -> float | None:
        """Mean opening volume over the `n` sessions STRICTLY BEFORE `day`.

        `j` is this day's index; the slice is `[j-n : j]`. The upper bound is
        exclusive of `j`, so today's own volume is not in its own baseline, and
        no index above `j` is reachable from here at all.
        """
        j = self._at(symbol, day)
        if j is None or j < n:
            return None
        window = self._vol[symbol][j - n:j]
        if len(window) != n:
            return None
        m = float(np.mean(window))
        return m if m > 0 else None

    def rvol(self, symbol: str, day: int,
             n: int = scfg.RVOL_BASELINE_DAYS) -> float | None:
        v = self.open_volume(symbol, day)
        b = self.baseline(symbol, day, n)
        if v is None or b is None or not (v > 0):
            return None
        return v / b


def select_day(day: int, pool: list[str], store: OpenStore,
               k: int = scfg.TOP_K, min_rvol: float = scfg.MIN_RVOL,
               n: int = scfg.RVOL_BASELINE_DAYS) -> list[Pick]:
    """The day's stocks in play, decided at 09:35 and never revised.

    Ties are broken by symbol so the answer is a function of the data and not
    of dict ordering; two runs of the same snapshot select the same names.
    """
    scored: list[tuple[float, str, float, float]] = []
    for sym in pool:
        r = store.rvol(sym, day, n)
        if r is None or r < min_rvol:
            continue
        scored.append((r, sym, store.open_volume(sym, day) or 0.0,
                       store.baseline(sym, day, n) or 0.0))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [Pick(int(day), s, float(r), float(v), float(b), i + 1)
            for i, (r, s, v, b) in enumerate(scored[:k])]
