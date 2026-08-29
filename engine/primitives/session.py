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


def overnight_range(view: BarView) -> Range:
    """Prior session's close through today's open — the hours the day session
    has to price in when it starts.

    Spans the previous ET day's post-market (from its own RTH close, which is
    13:00 on a half day) and today's premarket. Complete once the last visible
    bar is at or after 09:30, because nothing after that adds to it.
    """
    today = int(view.last.day)
    prior = view.prior_day()
    parts: list[slice] = []
    if prior is not None:
        psl = view.day_slice(prior)
        if psl is not None:
            m = view.minute[psl]
            keep = np.flatnonzero(m >= rth_close_minute(prior))
            if len(keep):
                parts.append(slice(psl.start + int(keep[0]), psl.start + int(keep[-1]) + 1))
    pre = _today_mask_slice(view, config.PREMARKET_OPEN_MIN, config.RTH_OPEN_MIN)
    if pre.stop > pre.start:
        parts.append(pre)
    if not parts:
        return EMPTY_RANGE
    hi = lo = None
    hi_idx = lo_idx = -1
    bars = 0
    for sl in parts:
        h, l = view.high[sl], view.low[sl]
        bars += len(h)
        hj, lj = int(np.argmax(h)), int(np.argmin(l))
        if hi is None or float(h[hj]) > hi:
            hi, hi_idx = float(h[hj]), (sl.start or 0) + hj
        if lo is None or float(l[lj]) < lo:
            lo, lo_idx = float(l[lj]), (sl.start or 0) + lj
    # a prior-day slice is contiguous only within itself; `bars` is the count
    # across both legs, which is what a caller wants to know about the sample.
    return Range(float(hi), float(lo), hi_idx, lo_idx, bars,
                 complete=int(view.last.minute) >= config.RTH_OPEN_MIN)
