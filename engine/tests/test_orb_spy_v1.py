"""`orb_spy.v1` is `orb_sip.v2` minus the selection — and these tests are what
makes that sentence checkable rather than a claim in a docstring.

The lane's whole value rests on the spec being IDENTICAL to the one ENGINE-7
measured, so that a different answer on SPY is a statement about SPY and not
about a rule that quietly changed on the way over. Two things are asserted:

* the subclass adds NO behaviour — it overrides nothing but its name, its
  description and its parameter block, so no future edit can give it a rule of
  its own without breaking this test;
* replayed on a hand-built multi-day tape it produces trades that are identical
  to `orb_sip.v2`'s, field for field, with the model id as the only difference.

The third test is the change itself: there is no selection, so every session
that produces a signal is traded.
"""

from __future__ import annotations

import math
from dataclasses import asdict

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,
                                      OrbStocksInPlayV2Coinflip)
from engine.models.orb_spy_v1 import OrbSpyV1, OrbSpyV1Coinflip
from engine.tests.fixtures import make_multiday

SYM = "SPY"
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)
COST = Costs()

# open 100.0, close 100.8 -> bullish. candle high 101.0, candle low 99.5.
BULL_OPEN = [(100.0, 100.5, 99.8, 100.1, 1e5),
             (100.1, 100.6, 100.0, 100.3, 1e5),
             (100.3, 100.9, 100.2, 100.5, 1e5),
             (100.5, 101.0, 100.4, 100.7, 1e5),
             (100.7, 100.9, 99.5, 100.8, 1e5)]

# open 101.0, close 100.2 -> bearish. candle high 101.2, candle low 100.0.
BEAR_OPEN = [(101.0, 101.2, 100.8, 101.0, 1e5),
             (101.0, 101.1, 100.7, 100.9, 1e5),
             (100.9, 101.0, 100.5, 100.6, 1e5),
             (100.6, 100.7, 100.2, 100.4, 1e5),
             (100.4, 100.5, 100.0, 100.2, 1e5)]

# breaks the high, runs, closes up
BULL_REST = [(100.8, 101.4, 100.7, 101.3, 1e5),
             (101.3, 102.2, 101.2, 102.1, 1e5),
             (102.1, 102.3, 101.9, 102.2, 1e5)]
# breaks the low, falls, closes down
BEAR_REST = [(100.2, 100.3, 99.6, 99.7, 1e5),
             (99.7, 99.8, 98.9, 99.0, 1e5),
             (99.0, 99.1, 98.7, 98.8, 1e5)]


def _session(open_candle, rest):
    bars = [(570 + i, *open_candle[i]) for i in range(5)]
    bars += [(575 + i, *rest[i]) for i in range(len(rest))]
    return bars


def _tape():
    """Five sessions, alternating direction, every one of them tradeable."""
    plans = [(BULL_OPEN, BULL_REST), (BEAR_OPEN, BEAR_REST),
             (BULL_OPEN, BULL_REST), (BEAR_OPEN, BEAR_REST),
             (BULL_OPEN, BULL_REST)]
    return make_multiday(
        {20240102 + i: _session(o, r) for i, (o, r) in enumerate(plans)},
        symbol=SYM)


def _nan_safe(v):
    """`meta["atr14"]` is NaN when no ATR was handed in — and NaN != NaN, which
    would make an equality check between two identical trades fail. Compare a
    NaN against a NaN as equal, which is what "identical trade" means here."""
    if isinstance(v, float) and math.isnan(v):
        return "nan"
    if isinstance(v, dict):
        return {k: _nan_safe(x) for k, x in v.items()}
    return v


def _rows(trades):
    """Every field of every trade except the model id, which is the one thing
    that is meant to differ."""
    out = []
    for t in trades:
        d = {k: _nan_safe(v) for k, v in asdict(t).items()}
        d.pop("model_id")
        out.append(d)
    return out


def test_the_subclass_adds_no_behaviour():
    allowed = {"id", "description", "params",
               # dunders CPython writes into every class body
               "__module__", "__qualname__", "__doc__",
               "__firstlineno__", "__static_attributes__"}
    for cls in (OrbSpyV1, OrbSpyV1Coinflip):
        extra = set(vars(cls)) - allowed
        assert not extra, f"{cls.__name__} overrides {sorted(extra)}"


def test_it_trades_exactly_what_orb_sip_v2_trades():
    series = _tape()
    for costs in (NO_COST, COST):
        a, _ = run_symbol(series, OrbSpyV1({}), costs, warmup_days=0)
        b, _ = run_symbol(series, OrbStocksInPlayV2({}), costs, warmup_days=0)
        assert len(a) == len(b) > 0
        assert _rows(a) == _rows(b)
        assert all(t.model_id == "orb_spy.v1" for t in a)


def test_the_control_matches_orb_sip_v2s_control():
    series = _tape()
    a, _ = run_symbol(series, OrbSpyV1Coinflip({}), COST, warmup_days=0)
    b, _ = run_symbol(series, OrbStocksInPlayV2Coinflip({}), COST, warmup_days=0)
    assert len(a) == len(b) > 0
    assert _rows(a) == _rows(b)
    assert all(t.model_id == "orb_spy.v1.coinflip" for t in a)


def test_there_is_no_selection_every_session_is_traded():
    series = _tape()
    m = OrbSpyV1({})
    trades, _ = run_symbol(series, m, COST, warmup_days=0)
    m.finish()
    assert len(trades) == 5
    assert sorted(t.day for t in trades) == [20240102 + i for i in range(5)]
    assert [t.side for t in trades] == ["long", "short", "long", "short", "long"]
    assert m.params()["selection"].startswith("none")


def test_the_stop_is_still_the_other_end_of_the_opening_candle():
    trades, _ = run_symbol(_tape(), OrbSpyV1({}), NO_COST, warmup_days=0)
    longs = [t for t in trades if t.side == "long"]
    shorts = [t for t in trades if t.side == "short"]
    assert all(t.stop_price == 99.5 and t.fill_price == 101.0 for t in longs)
    assert all(t.stop_price == 101.2 and t.fill_price == 100.0 for t in shorts)
