"""Hand-checked session windows.

Tape: two premarket bars at 09:00 and 09:29, then RTH minute by minute from
09:30. The opening range is 09:30 -> 09:45 inclusive of 09:30, exclusive of
09:45, so exactly 15 bars.
"""

from engine import calendar_us
from engine.primitives.session import (PREMARKET, RTH, current_session,
                                       minutes_since_open, minutes_to_close,
                                       opening_range, premarket_range, session_range)
from engine.tests.fixtures import make

BARS = [
    (540, 99.0, 99.5, 98.0, 99.2, 10.0),    # 09:00 premarket
    (569, 99.2, 101.0, 99.0, 100.5, 10.0),  # 09:29 premarket, PM high 101.0
]
for k in range(60):                          # 09:30 .. 10:29
    px = 100.0 + (0.5 if k < 15 else 2.0)
    BARS.append((570 + k, px, px + 0.5, px - 0.5, px, 10.0))
TAPE = make(BARS, day=20240102)


def test_sessions_are_labelled():
    assert current_session(TAPE.view(0)) == PREMARKET
    assert current_session(TAPE.view(2)) == RTH
    assert minutes_since_open(TAPE.view(2)) == 0
    assert minutes_since_open(TAPE.view(12)) == 10
    assert minutes_to_close(TAPE.view(2)) == 390


def test_premarket_range_ignores_rth():
    r = premarket_range(TAPE.view(20))
    assert (r.high, r.low) == (101.0, 98.0)
    assert r.bars == 2 and r.complete is True


def test_opening_range_is_incomplete_until_09_45():
    r = opening_range(TAPE.view(10), 15)   # 09:38
    assert r.complete is False and r.bars == 9
    r = opening_range(TAPE.view(16), 15)   # 09:44 -> 15 bars, still incomplete
    assert r.bars == 15 and r.complete is False
    r = opening_range(TAPE.view(17), 15)   # 09:45 has closed
    assert r.bars == 15 and r.complete is True
    assert (r.high, r.low) == (101.0, 100.0)
    assert r.mid == 100.5 and r.size == 1.0


def test_session_range_grows_with_the_day():
    r = session_range(TAPE.view(20), RTH)
    assert r.complete is False
    assert (r.high, r.low) == (102.5, 100.0)


def test_calendar_half_days_and_holidays():
    assert calendar_us.is_trading_day("2024-07-03") is True
    assert calendar_us.is_trading_day("2024-07-04") is False
    assert calendar_us.is_trading_day("2024-07-06") is False   # Saturday
    assert calendar_us.rth_close_minute("2024-07-03") == 13 * 60
    assert calendar_us.rth_close_minute("2024-07-02") == 16 * 60
    days = calendar_us.trading_days("2024-11-25", "2024-11-30")
    assert days == ["2024-11-25", "2024-11-26", "2024-11-27", "2024-11-29"]
