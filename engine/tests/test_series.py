import numpy as np
import pytest

from engine.series import LookaheadError
from engine.tests.fixtures import make

TAPE = [(570 + i, 10.0, 11.0, 9.0, 10.5, 100.0) for i in range(6)]


def test_view_length_and_last():
    s = make(TAPE)
    v = s.view(3)
    assert v.n == 4
    assert len(v.close) == 4
    assert v.last.i == 3


def test_view_refuses_the_next_bar():
    v = make(TAPE).view(3)
    with pytest.raises(LookaheadError):
        v.bar(4)
    with pytest.raises(LookaheadError):
        v.bar(-5)


def test_view_arrays_are_read_only():
    v = make(TAPE).view(3)
    with pytest.raises(ValueError):
        v.close[0] = 999.0


def test_view_holds_no_reference_to_the_series():
    """The structural guarantee. If a future refactor gives BarView a handle on
    the parent series, this fails and the anti-lookahead argument collapses."""
    s = make(TAPE)
    v = s.view(2)
    for slot in v.__slots__:
        val = getattr(v, slot)
        assert not isinstance(val, type(s)), f"BarView.{slot} exposes the parent series"
        if isinstance(val, np.ndarray):
            assert len(val) == v.n, f"BarView.{slot} is longer than the view"


def test_series_rejects_unsorted_timestamps():
    s = make(TAPE)
    ts = np.array(s.ts_ms)
    ts[2], ts[3] = ts[3], ts[2]
    with pytest.raises(ValueError):
        type(s)(s.symbol, s.timeframe, ts, s.open, s.high, s.low, s.close,
                s.volume, s.day, s.minute)
