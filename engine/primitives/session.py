"""Time and session. The dimension the current engine does not have."""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

from engine import calendar_us, config
from engine.series import BarView

PREMARKET = "premarket"
RTH = "rth"
POSTMARKET = "postmarket"
OUTSIDE = "outside"


def day_str(d: int) -> str:
    s = str(int(d))
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def rth_close_minute(day: int) -> int:
    return calendar_us.rth_close_minute(day_str(day))


def session_of(minute: int, day: int) -> str:
    if minute < config.PREMARKET_OPEN_MIN:
        return OUTSIDE
    if minute < config.RTH_OPEN_MIN:
        return PREMARKET
    if minute < rth_close_minute(day):
        return RTH
    if minute < config.POSTMARKET_CLOSE_MIN:
        return POSTMARKET
    return OUTSIDE


def current_session(view: BarView) -> str:
    b = view.last
    return session_of(b.minute, b.day)


def minutes_since_open(view: BarView) -> int:
    return int(view.last.minute) - config.RTH_OPEN_MIN


def minutes_to_close(view: BarView) -> int:
    b = view.last
    return rth_close_minute(b.day) - int(b.minute)


class Range(NamedTuple):
    high: float
    low: float
    high_idx: int
    low_idx: int
    bars: int
    complete: bool

    @property
    def mid(self) -> float:
        return (self.high + self.low) / 2.0

    @property
    def size(self) -> float:
        return self.high - self.low


EMPTY_RANGE = Range(float("nan"), float("nan"), -1, -1, 0, False)


def _range_over(view: BarView, sl: slice, complete: bool) -> Range:
    hi, lo = view.high[sl], view.low[sl]
    if len(hi) == 0:
        return EMPTY_RANGE
    hj, lj = int(np.argmax(hi)), int(np.argmin(lo))
    off = sl.start or 0
    return Range(float(hi[hj]), float(lo[lj]), off + hj, off + lj, len(hi), complete)


def _today_mask_slice(view: BarView, lo_min: int, hi_min: int) -> slice:
    """Indices of today's bars with lo_min <= minute < hi_min."""
    today = view.today_slice()
    m = view.minute[today]
    keep = np.flatnonzero((m >= lo_min) & (m < hi_min))
    if len(keep) == 0:
        return slice(0, 0)
    return slice(today.start + int(keep[0]), today.start + int(keep[-1]) + 1)


def premarket_range(view: BarView) -> Range:
    """04:00 -> 09:30 ET today. Complete once the last visible bar is >= 09:30."""
    sl = _today_mask_slice(view, config.PREMARKET_OPEN_MIN, config.RTH_OPEN_MIN)
    if sl.stop == sl.start:
        return EMPTY_RANGE
    return _range_over(view, sl, complete=int(view.last.minute) >= config.RTH_OPEN_MIN)


def opening_range(view: BarView, minutes: int = 15) -> Range:
    """09:30 -> 09:30+minutes ET today.

    `complete` is True only once a bar at or after the end of the window has
    closed. A model must not act on an incomplete opening range; that is the
    ORB version of lookahead.
    """
    end = config.RTH_OPEN_MIN + minutes
    sl = _today_mask_slice(view, config.RTH_OPEN_MIN, end)
    if sl.stop == sl.start:
        return EMPTY_RANGE
    return _range_over(view, sl, complete=int(view.last.minute) >= end)


def session_range(view: BarView, session: str = RTH) -> Range:
    """Today's range so far within one session. Never complete before the close."""
    day = int(view.last.day)
    if session == RTH:
        lo, hi = config.RTH_OPEN_MIN, rth_close_minute(day)
    elif session == PREMARKET:
        lo, hi = config.PREMARKET_OPEN_MIN, config.RTH_OPEN_MIN
    elif session == POSTMARKET:
        lo, hi = rth_close_minute(day), config.POSTMARKET_CLOSE_MIN
    else:
        raise ValueError(session)
    sl = _today_mask_slice(view, lo, hi)
    if sl.stop == sl.start:
        return EMPTY_RANGE
    return _range_over(view, sl, complete=int(view.last.minute) >= hi)
