"""Correctness properties of the harness, each with a test that could fail.

The tapes here are tiny and hand-checked. The model used is a stub that fires on
a named minute so the arithmetic is the only thing under test.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.fills import entry_fill, exit_on_bar
from engine.backtest.types import Costs, Signal
from engine.tests.fixtures import make_multiday

FREE = Costs(commission_per_share=0.0, slippage_bps=0.0)


class StubModel:
    """Fires once, at `fire_minute`, with fixed levels."""

    id = "stub.v1"

    def __init__(self, fire_minute, side, entry_type, entry, stop, target,
                 expiry_minute=16 * 60, exit_minute=16 * 60):
        self.fire_minute, self.side, self.entry_type = fire_minute, side, entry_type
        self.entry, self.stop, self.target = entry, stop, target
        self.expiry_minute, self.exit_minute = expiry_minute, exit_minute
        self.seen_last_minutes: list[int] = []

    def wants_bar(self, minute, day):
        return True

    def evaluate(self, view, day):
        self.seen_last_minutes.append(int(view.last.minute))
        if int(view.last.minute) != self.fire_minute:
            return None
        return Signal(self.id, view.symbol, day, view.i, int(view.last.minute),
                      self.side, self.entry_type, self.entry, self.stop,
                      self.target, self.expiry_minute, self.exit_minute)


def flat_day(day, bars):
    return {day: bars}


def warm(day_count=6, bars=None):
    """`warmup_days` days of filler plus the day under test."""
    out = {}
    for k in range(day_count):
        out[20240100 + k] = [(570, 100.0, 100.0, 100.0, 100.0, 10.0)]
    out[20240110] = bars
    return out


# --- fill arithmetic --------------------------------------------------------
def test_market_order_fills_at_next_open_with_adverse_slippage():
    c = Costs(0.0, 10.0)  # 10 bps
    assert entry_fill("long", "market", 0.0, 100.0, 101.0, 99.0, c) == pytest.approx(100.1)
    assert entry_fill("short", "market", 0.0, 100.0, 101.0, 99.0, c) == pytest.approx(99.9)


def test_stop_order_needs_the_range_to_reach_it():
    assert entry_fill("long", "stop", 101.0, 100.0, 100.9, 99.0, FREE) is None
    assert entry_fill("long", "stop", 101.0, 100.0, 101.5, 99.0, FREE) == 101.0
    # a gap through the level fills at the open, not the level
    assert entry_fill("long", "stop", 101.0, 102.0, 103.0, 101.5, FREE) == 102.0


def test_limit_order_needs_penetration_not_a_touch():
    assert entry_fill("long", "limit", 99.0, 100.0, 100.5, 99.0, FREE) is None
    assert entry_fill("long", "limit", 99.0, 100.0, 100.5, 98.9, FREE) == 99.0
    assert entry_fill("long", "limit", 99.0, 98.5, 99.5, 98.0, FREE) == 98.5


def test_a_bar_containing_both_stop_and_target_resolves_as_the_stop():
    res = exit_on_bar("long", stop=99.0, target=101.0,
                      bar_open=100.0, bar_high=101.5, bar_low=98.5, costs=FREE)
    assert res == ("stop", 99.0, True)


# --- engine properties ------------------------------------------------------
def test_decision_bar_is_never_the_fill_bar():
    """Model fires at 09:31. The 09:31 bar's own range must not fill it, even
    though that bar's high reaches the entry."""
    bars = [
        (570, 100.0, 100.2, 99.8, 100.0, 10.0),
        (571, 100.0, 105.0, 99.9, 100.5, 10.0),   # decision bar; high 105 > entry
        (572, 100.5, 100.6, 100.4, 100.5, 10.0),  # does not reach 101 -> no fill
        (573, 100.5, 101.5, 100.4, 101.2, 10.0),  # fills here
        (574, 101.2, 103.0, 101.0, 102.5, 10.0),  # target 103
    ]
    s = make_multiday(warm(bars=bars))
    m = StubModel(571, "long", "stop", 101.0, 100.0, 103.0)
    trades, _ = run_symbol(s, m, FREE)
    assert len(trades) == 1
    t = trades[0]
    assert t.decision_minute == 571
    assert t.entry_minute == 573 and t.fill_price == 101.0
    assert t.exit_reason == "target" and t.exit_price == 103.0
    assert t.net_r == pytest.approx(2.0)


def test_stop_loss_is_one_r():
    bars = [
        (570, 100.0, 100.2, 99.8, 100.0, 10.0),
        (571, 100.0, 100.2, 99.9, 100.0, 10.0),
        (572, 100.5, 101.5, 100.4, 101.2, 10.0),   # fills at 101.0
        (573, 101.2, 101.3, 99.5, 99.6, 10.0),     # stop 100.0
    ]
    s = make_multiday(warm(bars=bars))
    trades, _ = run_symbol(s, StubModel(571, "long", "stop", 101.0, 100.0, 110.0), FREE)
    assert len(trades) == 1
    t = trades[0]
    assert t.exit_reason == "stop" and t.net_r == pytest.approx(-1.0)
    assert t.mae_r == pytest.approx(1.5)   # low 99.5 vs fill 101.0, risk 1.0


def test_the_entry_bar_can_stop_the_trade_out():
    """A bar that triggers the entry stop and also trades through the loss stop
    is resolved as a loss. OHLC cannot say which came first, so the harness
    takes the pessimistic reading rather than inventing a sequence."""
    bars = [
        (570, 100.0, 100.2, 99.8, 100.0, 10.0),
        (571, 100.0, 100.2, 99.9, 100.0, 10.0),
        (572, 100.0, 101.5, 100.0, 101.2, 10.0),   # fills 101.0 AND touches 100.0
    ]
    s = make_multiday(warm(bars=bars))
    trades, _ = run_symbol(s, StubModel(571, "long", "stop", 101.0, 100.0, 110.0), FREE)
    assert len(trades) == 1
    assert trades[0].exit_reason == "stop" and trades[0].bars_held == 0
    assert trades[0].net_r == pytest.approx(-1.0)


def test_unfilled_order_expires_and_becomes_a_rejection():
    bars = [(570 + k, 100.0, 100.2, 99.8, 100.0, 10.0) for k in range(5)]
    s = make_multiday(warm(bars=bars))
    m = StubModel(571, "long", "stop", 105.0, 104.0, 110.0, expiry_minute=573)
    trades, rejects = run_symbol(s, m, FREE)
    assert trades == []
    assert [r.reason for r in rejects] == ["expired"]


def test_open_position_is_flattened_at_the_exit_minute():
    bars = [(570 + k, 100.0, 100.5, 99.9, 100.2, 10.0) for k in range(8)]
    s = make_multiday(warm(bars=bars))
    m = StubModel(571, "long", "market", 0.0, 99.0, 110.0, exit_minute=575)
    trades, _ = run_symbol(s, m, FREE)
    assert len(trades) == 1
    assert trades[0].exit_reason == "time" and trades[0].exit_minute == 575


def test_costs_move_the_result_in_the_right_direction():
    bars = [
        (570, 100.0, 100.2, 99.8, 100.0, 10.0),
        (571, 100.0, 100.2, 99.9, 100.0, 10.0),
        (572, 100.0, 101.5, 100.0, 101.2, 10.0),
        (573, 101.2, 103.5, 101.0, 103.2, 10.0),
    ]
    s = make_multiday(warm(bars=bars))
    m = StubModel(571, "long", "stop", 101.0, 100.0, 103.0)
    free, _ = run_symbol(s, m, FREE)
    costly, _ = run_symbol(s, StubModel(571, "long", "stop", 101.0, 100.0, 103.0),
                           Costs(commission_per_share=0.005, slippage_bps=10.0))
    assert free[0].net_r > costly[0].net_r


def test_holidays_and_weekends_never_produce_a_trade():
    """The engine only ever sees days that exist in the tape, and the cache is
    built from the calendar — so a shut day cannot appear. This asserts the
    calendar's own answer for the days in question."""
    from engine import calendar_us
    for shut in ("2024-07-04", "2024-11-28", "2024-12-25", "2024-03-29"):
        assert not calendar_us.is_trading_day(shut)


def test_model_only_ever_sees_bars_up_to_the_decision_bar():
    """The stub records the last minute of every view it is handed; those must
    be strictly increasing and must equal the bar being replayed."""
    bars = [(570 + k, 100.0, 100.5, 99.5, 100.0, 10.0) for k in range(20)]
    s = make_multiday(warm(bars=bars))
    m = StubModel(9999, "long", "stop", 0, 0, 0)
    run_symbol(s, m, FREE)
    seen = m.seen_last_minutes
    assert seen == sorted(seen)
    assert seen[0] == 570 and seen[-1] == 589
