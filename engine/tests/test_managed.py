"""The management rule, and the proof that switching it off is the old runner.

Every expected number here is read off a hand-built tape, not pasted from a run.
The last test is the one that matters most: with `manage=False`,
`run_symbol_managed` must reproduce `engine/backtest/engine.run_symbol` trade
for trade on the real tape. Without that, the "unmanaged control" would be a
second implementation of a similar idea rather than the same trade measured
without the rule.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.managed import run_symbol_managed
from engine.backtest.types import Costs, Signal
from engine.cache.load import has_symbol, load
from engine.models.base import Model
from engine.tests.fixtures import make

FREE = Costs(commission_per_share=0.0, slippage_bps=0.0)
DAY = 20240102


class OneShot(Model):
    """Emits one long signal at `at_minute`, and nothing else."""

    id = "fixture.v1"

    def __init__(self, at_minute: int, entry: float, stop: float, target: float,
                 side: str = "long", target_r=None) -> None:
        self.at, self.entry, self.stop = at_minute, entry, stop
        self.target, self.side, self.target_r = target, side, target_r
        self.done = False

    def wants_bar(self, minute: int, day: int) -> bool:
        return minute == self.at and not self.done

    def evaluate(self, view, day):
        self.done = True
        return Signal(self.id, view.symbol, day, view.i, int(view.last.minute),
                      self.side, "market", self.entry, self.stop, self.target,
                      int(view.last.minute) + 5, 15 * 60 + 55, {},
                      target_r=self.target_r)


def _bar(minute, o, h, l, c):
    return (minute, o, h, l, c, 1000.0)


def _run(bars, model, manage=True, costs=FREE):
    return run_symbol_managed(make(bars, DAY), model, costs, manage=manage,
                              warmup_days=0)[0]


# --- the rule itself ---------------------------------------------------------
def test_half_off_at_1r_then_target_pays_one_and_a_half_r():
    """Entry 100, stop 99 (risk 1), target 102 (2R). Price touches 101 on one
    bar and 102 on a later one. Half at +1R and half at +2R is +1.5R."""
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),      # fill here at 100
            _bar(602, 100.1, 101.0, 100.1, 100.5),  # touches +1R, never back to 100
            _bar(603, 100.6, 102.0, 100.6, 101.9)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0))
    assert t.meta["partial_taken"] is True
    assert t.exit_reason == "partial+target"
    assert t.gross_r == pytest.approx(1.5)


def test_the_stop_beats_the_partial_inside_one_bar():
    """A bar that reaches both +1R and the stop is booked as the loss, with no
    partial — the same pessimism `fills.exit_on_bar` already applies."""
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100, 101.5, 98.5, 99.0)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0))
    assert t.meta["partial_taken"] is False
    assert t.exit_reason == "stop"
    assert t.ambiguous_bar is True
    assert t.gross_r == pytest.approx(-1.0)


def test_the_same_bar_can_take_the_partial_and_then_stop_at_breakeven():
    """+1R and a return through the entry inside one bar. The order is
    unknowable, so it is assumed to cost money: +0.5R banked, remainder flat."""
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100, 101.2, 99.5, 99.6)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0))
    assert t.meta["partial_taken"] is True
    assert t.meta["same_bar_partial_and_breakeven"] is True
    assert t.exit_reason == "partial+be"
    assert t.gross_r == pytest.approx(0.5)


def test_the_breakeven_stop_ends_a_trade_that_would_otherwise_have_lost():
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100, 101.0, 99.8, 100.9),   # partial at 101
            _bar(603, 100.9, 100.9, 99.2, 99.3)]  # back through 100 -> BE
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0))
    assert t.exit_reason == "partial+be"
    assert t.gross_r == pytest.approx(0.5)


def test_a_target_nearer_than_1r_never_partials():
    """Target 100.5 is +0.5R. Price cannot reach +1R without passing it."""
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100, 101.5, 99.9, 101.4)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 100.5))
    assert t.meta["partial_taken"] is False
    assert t.exit_reason == "target"
    assert t.gross_r == pytest.approx(0.5)


def test_a_short_mirrors_it():
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 99.9, 99.95, 99.0, 99.2),   # touches -1R (99), never back to 100
            _bar(603, 99.2, 99.2, 98.0, 98.1)]
    t, = _run(bars, OneShot(600, 100.0, 101.0, 98.0, side="short"))
    assert t.exit_reason == "partial+target"
    assert t.gross_r == pytest.approx(1.5)


def test_an_infinite_target_runs_to_the_flat_and_still_partials():
    """No level in the trade's direction is not a skip: the trade has no price
    target and ends at 15:55, with the +1R half already banked."""
    bars = ([_bar(600, 100, 100, 100, 100), _bar(601, 100, 100, 100, 100),
             _bar(602, 100.1, 101.0, 100.1, 100.9)]
            + [_bar(m, 100.9, 100.95, 100.85, 100.9) for m in range(603, 957)])
    t, = _run(bars, OneShot(600, 100.0, 99.0, float("inf")))
    assert t.exit_reason == "partial+time"
    assert t.meta["partial_taken"] is True
    # half at +1R, half at +0.9R
    assert t.gross_r == pytest.approx(0.95)


def test_costs_charge_one_entry_and_two_half_exits():
    """Commission is $0.005 a share a side. One entry at full size and two
    half-size exits is 2 x commission per unit of position, so the managed
    trade pays exactly what the unmanaged one pays."""
    costs = Costs(commission_per_share=0.005, slippage_bps=0.0)
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100.1, 101.0, 100.1, 100.5),
            _bar(603, 100.6, 102.0, 100.6, 101.9)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0), costs=costs)
    assert t.gross_r == pytest.approx(1.5)
    assert t.net_r == pytest.approx(1.5 - 0.01 / 1.0)


def test_unmanaged_is_the_plain_trade():
    bars = [_bar(600, 100, 100, 100, 100),
            _bar(601, 100, 100, 100, 100),
            _bar(602, 100, 101.0, 99.5, 100.5),
            _bar(603, 100.6, 102.0, 100.6, 101.9)]
    t, = _run(bars, OneShot(600, 100.0, 99.0, 102.0), manage=False)
    assert t.meta["partial_taken"] is False
    assert t.exit_reason == "target"
    assert t.gross_r == pytest.approx(2.0)


# --- the equivalence that makes the control a control ------------------------
@pytest.mark.skipif(not has_symbol("SPY", "1m", "polygon-deep-v1"),
                    reason="polygon-deep-v1 cache not present")
@pytest.mark.parametrize("symbol", ["SPY", "IWM"])
def test_manage_off_reproduces_the_old_runner_trade_for_trade(symbol):
    from engine.models.orb_managed import OrbManaged

    series = load(symbol, "1m", "polygon-deep-v1")
    days = sorted(series.day_bounds())[:400]
    keep = set(days)
    costs = Costs()

    a, _ = run_symbol(series, OrbManaged("orb_1h_unmanaged.v1",
                                         snapshot="polygon-deep-v1"), costs,
                      day_filter=keep.__contains__)
    b, _ = run_symbol_managed(series, OrbManaged("orb_1h_unmanaged.v1",
                                                 snapshot="polygon-deep-v1"),
                              costs, manage=False,
                              day_filter=keep.__contains__)
    assert len(a) == len(b) > 50
    for x, y in zip(a, b):
        assert (x.day, x.decision_minute, x.side) == (y.day, y.decision_minute, y.side)
        assert x.fill_price == y.fill_price
        assert x.exit_price == y.exit_price
        assert x.exit_reason == y.exit_reason
        assert x.net_r == pytest.approx(y.net_r, abs=1e-12)
        assert x.mae_r == pytest.approx(y.mae_r, abs=1e-12)


@pytest.mark.skipif(not has_symbol("SPY", "1m", "polygon-deep-v1"),
                    reason="polygon-deep-v1 cache not present")
def test_managing_never_changes_which_trades_were_taken():
    """The rule is an EXIT rule. It may not move a single entry, or the managed
    and unmanaged numbers would not be measuring the same setup."""
    from engine.models.orb_managed import OrbManaged

    series = load("SPY", "1m", "polygon-deep-v1")
    days = set(sorted(series.day_bounds())[:400])
    costs = Costs()
    a, _ = run_symbol_managed(series, OrbManaged("orb_1h_managed.v1",
                                                 snapshot="polygon-deep-v1"),
                              costs, manage=True, day_filter=days.__contains__)
    b, _ = run_symbol_managed(series, OrbManaged("orb_1h_unmanaged.v1",
                                                 snapshot="polygon-deep-v1"),
                              costs, manage=False, day_filter=days.__contains__)
    assert [(t.day, t.decision_minute, t.side, t.fill_price) for t in a] == \
           [(t.day, t.decision_minute, t.side, t.fill_price) for t in b]
    assert any(t.meta["partial_taken"] for t in a)
