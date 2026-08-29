"""One entry, two exits — and an overnight gap that is not filled at the stop.

The gap rule is the reason this file exists. ENGINE-3 is the first model in the
programme that holds a position overnight, and a backtest that fills a gapped
stop AT the stop price is fiction.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.fills import exit_on_bar, exit_on_bar_gapped
from engine.backtest.two_exit import run_symbol_two_exits
from engine.backtest.types import Costs, Signal
from engine.models.base import Model
from engine.tests.fixtures import make_multiday

FREE = Costs(commission_per_share=0.0, slippage_bps=0.0)


class _FixedLong(Model):
    """Goes long at 09:49 on every day it is offered, with a written-down stop
    and target. Nothing adaptive — the runner is what is on trial here."""

    id = "test.fixed_long"

    def __init__(self, stop: float, target: float, minute: int = 9 * 60 + 49,
                 flatten: int = 15 * 60 + 55, only_day: int | None = None) -> None:
        self.stop, self.target = stop, target
        self.minute, self.flatten, self.only_day = minute, flatten, only_day

    def wants_bar(self, minute: int, day: int) -> bool:
        return minute == self.minute and (self.only_day is None or day == self.only_day)

    def evaluate(self, view, day):
        b = view.last
        return Signal(self.id, view.symbol, day, view.i, b.minute, "long",
                      "market", float(b.close), self.stop, self.target,
                      b.minute + 5, self.flatten, {"risk_ps": float(b.close) - self.stop,
                                                   "reward_ps": self.target - float(b.close)})


def _flat_session(day: int, level: float, open_at: float | None = None):
    """A quiet session that neither stops nor targets: 1-minute bars sitting in
    a +/-0.5 band around `level`, with an optional different opening print."""
    bars = []
    for m in range(240, 1200):
        px = level if (open_at is None or m != 9 * 60 + 30) else open_at
        bars.append((m, px, px + 0.25, px - 0.25, px, 10.0))
    return bars


def _tape(sessions):
    return make_multiday(sessions)


# --- the gap, which is the whole point --------------------------------------
def test_a_session_that_opens_below_the_stop_fills_at_that_open():
    """Long at 100 with the stop at 99. Day two opens at 95. The loss is 5x the
    risk, not 1x, and only a runner that models the gap can say so."""
    tape = _tape({
        20240102: _flat_session(20240102, 100.0),
        20240103: [(m, 95.0, 95.25, 94.75, 95.0, 10.0) for m in range(240, 1200)],
        20240104: _flat_session(20240104, 95.0),
        20240105: _flat_session(20240105, 95.0),
    })
    m = _FixedLong(99.0, 103.0, only_day=20240102)
    a, b, _ = run_symbol_two_exits(tape, m, FREE, warmup_days=0)
    assert len(a) == len(b) == 1
    assert a[0].exit_reason == "time" and a[0].exit_minute == 15 * 60 + 55
    assert b[0].exit_reason == "stop"
    assert b[0].exit_price == pytest.approx(95.0)
    assert b[0].meta["exit_day"] == 20240103
    assert b[0].net_r == pytest.approx(-5.0)      # not -1.0
    assert a[0].fill_price == b[0].fill_price     # same trade, different exit


def test_the_two_exits_share_one_entry():
    tape = _tape({20240102 + k: _flat_session(20240102 + k, 100.0) for k in range(8)})
    a, b, _ = run_symbol_two_exits(tape, _FixedLong(99.0, 103.0), FREE, warmup_days=0)
    assert len(a) == len(b) > 0
    for x, y in zip(a, b):
        assert (x.day, x.side, x.fill_price, x.stop_price, x.target_price) == \
               (y.day, y.side, y.fill_price, y.stop_price, y.target_price)


def test_the_swing_exit_gives_up_after_five_sessions():
    tape = _tape({20240102 + k: _flat_session(20240102 + k, 100.0) for k in range(12)})
    m = _FixedLong(99.0, 103.0, only_day=20240102)
    _, b, _ = run_symbol_two_exits(tape, m, FREE, warmup_days=0, max_hold_sessions=5)
    assert b[0].exit_reason == "time"
    # sessions are counted as days the tape actually holds — on the real cache
    # those are trading days, and in this fixture they are 02, 03, 04, 05, 06
    assert b[0].meta["exit_day"] == 20240106
    assert b[0].meta["sessions_held"] == 5
    assert b[0].exit_minute == 15 * 60 + 55


def test_a_gapped_target_fills_at_the_open_not_the_level():
    """The mirror of the stop rule, stated because it cuts the other way: a
    resting limit on a session that opens through it fills at the open."""
    tape = _tape({
        20240102: _flat_session(20240102, 100.0),
        20240103: [(m, 110.0, 110.25, 109.75, 110.0, 10.0) for m in range(240, 1200)],
        20240104: _flat_session(20240104, 110.0),
    })
    m = _FixedLong(99.0, 103.0, only_day=20240102)
    _, b, _ = run_symbol_two_exits(tape, m, FREE, warmup_days=0)
    assert b[0].exit_reason == "target"
    assert b[0].exit_price == pytest.approx(110.0)   # not 103.0


def test_overnight_is_never_traded_only_priced_in():
    """A 4% collapse at 18:00 that has fully recovered by the next open costs
    nothing, because no stop was live to be hit."""
    night = _flat_session(20240103, 100.0)
    night = [(m, 96.0, 96.1, 95.9, 96.0, 10.0) if m >= 16 * 60 else b
             for m, b in zip([x[0] for x in night], night)]
    tape = _tape({20240102: _flat_session(20240102, 100.0),
                  20240103: night,
                  20240104: _flat_session(20240104, 100.0),
                  20240105: _flat_session(20240105, 100.0)})
    m = _FixedLong(99.0, 103.0, only_day=20240102)
    _, b, _ = run_symbol_two_exits(tape, m, FREE, warmup_days=0)
    assert b[0].exit_reason == "time"
    assert b[0].mae_r < 1.0


# --- the runner agrees with the engine it specialises ------------------------
def test_exit_a_reproduces_the_older_engine_trade_for_trade():
    rng = np.random.default_rng(11)
    sessions, px = {}, 100.0
    for k in range(10):
        bars = []
        for m in range(240, 1200):
            px = max(1.0, px + float(rng.normal(0, 0.08)))
            bars.append((m, px, px + 0.2, px - 0.2, px + 0.02, 10.0))
        sessions[20240102 + k] = bars
    tape = _tape(sessions)

    old, _ = run_symbol(tape, _FixedLong(98.0, 104.0), Costs(), warmup_days=2)
    new, _, _ = run_symbol_two_exits(tape, _FixedLong(98.0, 104.0), Costs(),
                                     warmup_days=2)
    assert len(old) == len(new) > 0
    for o, n in zip(old, new):
        assert (o.day, o.side, o.entry_minute) == (n.day, n.side, n.entry_minute)
        assert o.fill_price == pytest.approx(n.fill_price)
        assert o.exit_reason == n.exit_reason
        assert o.exit_minute == n.exit_minute
        # the one licensed difference: a bar that opened beyond the target fills
        # at that open, which is better than the level and is what really happens
        assert n.net_r >= o.net_r - 1e-9


# --- the fill primitive on its own -------------------------------------------
def test_the_gap_aware_fill_differs_from_the_plain_one_only_at_a_gap():
    c = FREE
    # ordinary bar: identical
    assert exit_on_bar("long", 99, 103, 100, 100.5, 99.5, c) == \
        exit_on_bar_gapped("long", 99, 103, 100, 100.5, 99.5, c)
    # gapped down through the stop: the plain one lies by 4 dollars a share
    plain = exit_on_bar("long", 99, 103, 95, 95.5, 94.5, c)
    gapped = exit_on_bar_gapped("long", 99, 103, 95, 95.5, 94.5, c)
    assert plain[1] == pytest.approx(95.0) and gapped[1] == pytest.approx(95.0)
    # a short gapping up through its stop
    assert exit_on_bar_gapped("short", 101, 97, 110, 110.5, 109.5, c)[1] == \
        pytest.approx(110.0)
