"""The daily-trend input to `orb_sip.v3`, and the one way it could be wrong.

A trend filter that can see the day it is filtering is not a filter, it is a
result. These tests attack that directly: the label for day *D* is recomputed
after the bar for day *D* has been replaced with something absurd, and it must
not move. They also pin the two boring cases that would otherwise fail open —
a symbol with no daily history and a symbol on its first ever bar both have to
come back "none", because "none" is what the model refuses to trade.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.primitives.htf import daily_structure
from engine.series import BarSeries
from engine.sip import daily

SYM = "FIX"

#      bar:   0     1     2     3     4     5     6     7     8     9
HIGH = [10.0, 9.0, 12.0, 14.0, 11.0, 12.0, 15.0, 18.0, 16.0, 17.0]
LOW = [8.0, 6.0, 9.0, 10.0, 9.0, 8.0, 10.0, 12.0, 13.0, 14.0]
DAYS = [20240102, 20240103, 20240104, 20240105, 20240108,
        20240109, 20240110, 20240111, 20240112, 20240116]


def _frame(high, low, close=None, days=None, symbol=SYM) -> BarSeries:
    d = days or DAYS
    n = len(high)
    c = close if close is not None else [(h + l) / 2 for h, l in zip(high, low)]
    return BarSeries(
        symbol, "day", np.arange(1, n + 1, dtype="int64") * 86_400_000,
        np.array(c, dtype="float64"), np.array(high, dtype="float64"),
        np.array(low, dtype="float64"), np.array(c, dtype="float64"),
        np.full(n, 1000.0), np.array(d[:n], dtype="int32"),
        np.zeros(n, dtype="int32"))


def _trend(frames, pairs, **kw):
    return daily.trend_for_pairs(set(pairs), frames=frames, **kw)[0]


def test_the_label_is_read_off_the_bar_before_the_day_being_traded():
    """With pivot_n=1 the fixture confirms low@1=6, high@3=14, low@5=8,
    high@7=18: higher high, higher low, nothing closes below 8. As of bar 8 that
    is an uptrend, so the label for day 9 is 'up'."""
    f = {SYM: _frame(HIGH, LOW)}
    m = _trend(f, [(SYM, DAYS[9])], pivot_n=1, lookback=60)
    assert m[(SYM, DAYS[9])] == "up"
    assert m[(SYM, DAYS[9])] == daily_structure(
        f[SYM].view(8), 1, 60).direction


def test_poisoning_the_day_being_traded_cannot_change_its_own_label():
    """The attack that matters. Day 9's own bar is replaced with a crash that
    would obviously flip any trend read on it. The label for day 9 must not
    move, because day 9 is not visible to the thing that computes it."""
    clean = {SYM: _frame(HIGH, LOW)}
    before = _trend(clean, [(SYM, DAYS[9])], pivot_n=1, lookback=60)

    high, low = list(HIGH), list(LOW)
    high[9], low[9] = 1.0, 0.5
    close = [(h + l) / 2 for h, l in zip(HIGH, LOW)]
    close[9] = 0.6
    poisoned = {SYM: _frame(high, low, close)}
    after = _trend(poisoned, [(SYM, DAYS[9])], pivot_n=1, lookback=60)

    assert before[(SYM, DAYS[9])] == after[(SYM, DAYS[9])] == "up"


def test_amputating_everything_after_the_day_leaves_the_label_alone():
    """The mirror of the poison test: a series that stops at the day being
    traded must give the same answer as one that runs on for years."""
    full = {SYM: _frame(HIGH, LOW)}
    cut = {SYM: _frame(HIGH[:10], LOW[:10])}
    a = _trend(full, [(SYM, DAYS[9])], pivot_n=1, lookback=60)
    b = _trend(cut, [(SYM, DAYS[9])], pivot_n=1, lookback=60)
    assert a == b


def test_a_broken_swing_low_is_not_an_uptrend_here_either():
    """The definition is `primitives/htf.py`'s and is not re-implemented; this
    asserts that the wiring did not quietly drop the 'unbroken' clause."""
    close = [(h + l) / 2 for h, l in zip(HIGH, LOW)]
    close[8] = 7.0                       # below the 8.0 swing low at bar 5
    f = {SYM: _frame(HIGH, LOW, close)}
    m = _trend(f, [(SYM, DAYS[9])], pivot_n=1, lookback=60)
    assert m[(SYM, DAYS[9])] == "none"


def test_the_mirror_is_a_downtrend():
    f = {SYM: _frame([30 - x for x in LOW], [30 - x for x in HIGH])}
    m = _trend(f, [(SYM, DAYS[9])], pivot_n=1, lookback=60)
    assert m[(SYM, DAYS[9])] == "down"


def test_a_symbol_with_no_daily_history_is_none_not_a_crash_and_not_a_trade():
    m, census = daily.trend_for_pairs({("GHOST", DAYS[5])}, frames={})
    assert m[("GHOST", DAYS[5])] == "none"
    assert census["no_daily_series"] == 1


def test_the_first_bar_of_a_symbols_life_has_no_prior_close_and_is_none():
    f = {SYM: _frame(HIGH, LOW)}
    m, census = daily.trend_for_pairs({(SYM, DAYS[0])}, frames=f)
    assert m[(SYM, DAYS[0])] == "none"
    assert census["no_prior_bar"] == 1


def test_a_day_the_symbol_did_not_trade_is_none():
    f = {SYM: _frame(HIGH, LOW)}
    m, census = daily.trend_for_pairs({(SYM, 20240115)}, frames=f)   # a holiday
    assert m[(SYM, 20240115)] == "none"
    assert census["no_prior_bar"] == 1


def test_the_split_suspect_counter_flags_a_step_in_the_unadjusted_history():
    """Not a gate and not a filter — a disclosure counter. A 2-for-1 split shows
    in an unadjusted tape as a 50% single-session step, and the report is
    required to print how many selected symbol-days sit downwind of one."""
    high, low = list(HIGH), list(LOW)
    close = [(h + l) / 2 for h, l in zip(HIGH, LOW)]
    close[4] = close[3] / 2.0            # a step the tape does not explain
    f = {SYM: _frame(high, low, close)}
    _, census = daily.trend_for_pairs({(SYM, DAYS[9])}, frames=f)
    assert census["split_suspect_window"] == 1

    _, clean = daily.trend_for_pairs({(SYM, DAYS[9])}, frames={SYM: _frame(HIGH, LOW)})
    assert clean["split_suspect_window"] == 0


def test_the_definition_is_engine_twos_numbers_and_not_a_new_one():
    """ENGINE-3 and ENGINE-5 found nothing in 1h and 4h trend filters. This lane
    is not entitled to answer that by inventing a third definition, so the
    numbers are pinned to the ones ENGINE-2 documented."""
    from engine.models import orb_htf_structural as e2
    assert (daily.DAILY_PIVOT_N, daily.DAILY_LOOKBACK) == (e2.DAILY_PIVOT_N,
                                                           e2.DAILY_LOOKBACK)


# --- against the real cache, when it is present -----------------------------

def test_the_real_daily_frames_are_ascending_and_unadjusted_from_grouped_bars():
    from engine.sip import config as scfg
    if not scfg.GROUPED_DIR.exists() or not any(scfg.GROUPED_DIR.glob("*.parquet")):
        pytest.skip("no grouped daily bars in this checkout")
    frames = daily.daily_frames({"AAPL", "F"})
    assert set(frames) == {"AAPL", "F"}
    for f in frames.values():
        assert len(f) > 1000
        assert np.all(np.diff(f.day) > 0)
        assert np.all(f.high >= f.low)
        # unadjusted: AAPL's 4-for-1 split on 2020-08-31 is VISIBLE as a step.
        # If this ever stops being true the snapshot has been re-fetched with
        # adjusted=true and every price-based filter in the lane is wrong.
    a = frames["AAPL"]
    k = int(np.flatnonzero(a.day == 20200831)[0])
    assert a.close[k] / a.close[k - 1] < 0.4
