"""`orb_sip.v1` mechanics, on a hand-built tape.

Every expected number here is read off the fixture, not pasted from a run. The
model is a replication of a published spec, so the tests assert the spec:

* the direction is the sign of the 09:30-09:35 candle and the other side is
  never traded, whatever price does;
* the entry is a resting stop at that candle's high or low;
* the stop sits at 10% of the 14-day ATR from THE FILL, not from the level;
* there is no target, and an unstopped trade exits at the close.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip import ATR_STOP_FRACTION, OrbStocksInPlay
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)


def _session(open_candle, rest):
    """`open_candle` is five 1-minute bars 09:30-09:35; `rest` runs from 09:35."""
    bars = [(570 + i, *open_candle[i]) for i in range(5)]
    bars += [(575 + i, *rest[i]) for i in range(len(rest))]
    return make(bars, day=DAY, symbol=SYM)


BULL_OPEN = [(100.0, 100.5, 99.8, 100.1, 1e5),
             (100.1, 100.6, 100.0, 100.3, 1e5),
             (100.3, 100.9, 100.2, 100.5, 1e5),
             (100.5, 101.0, 100.4, 100.7, 1e5),   # candle high 101.0
             (100.7, 100.9, 99.5, 100.8, 1e5)]    # candle low 99.5, closes up
# open 100.0, close 100.8 -> bullish. high 101.0, low 99.5.


def test_bullish_opening_candle_takes_the_high_and_ignores_the_low():
    rest = [(100.6, 100.7, 98.0, 98.2, 1e5),      # blows through the LOW: no short
            (98.2, 101.4, 98.1, 101.3, 1e5),      # then through the HIGH: long fills
            (101.3, 101.4, 101.2, 101.35, 1e5)]
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == 101.0                  # the level, not the bar's open
    assert t.stop_price == pytest.approx(101.0 - ATR_STOP_FRACTION * 2.0)
    assert t.risk_per_share == pytest.approx(ATR_STOP_FRACTION * 2.0)


def test_bearish_opening_candle_takes_the_low():
    bear = [(101.0, 101.2, 100.8, 101.0, 1e5),
            (101.0, 101.1, 100.7, 100.9, 1e5),
            (100.9, 101.0, 100.5, 100.6, 1e5),
            (100.6, 100.7, 100.2, 100.4, 1e5),
            (100.4, 100.5, 100.0, 100.2, 1e5)]    # open 101.0 close 100.2: bearish
    rest = [(100.3, 102.0, 100.2, 101.9, 1e5),    # above the high: no long
            (101.9, 102.0, 99.8, 99.9, 1e5)]      # below the low: short fills
    trades, _ = run_symbol(_session(bear, rest), OrbStocksInPlay(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    assert trades[0].side == "short"
    assert trades[0].fill_price == 100.0
    assert trades[0].stop_price == pytest.approx(100.0 + ATR_STOP_FRACTION * 2.0)


def test_a_doji_opening_candle_is_not_traded():
    doji = [(100.0, 100.5, 99.8, 100.1, 1e5)] * 4 + [(100.1, 100.9, 99.5, 100.0, 1e5)]
    rest = [(100.0, 102.0, 98.0, 101.0, 1e5)]
    m = OrbStocksInPlay(ATR)
    trades, _ = run_symbol(_session(doji, rest), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_doji_opening_candle"] == 1


def test_the_stop_is_measured_from_the_fill_not_from_the_level():
    """A gap through the level fills above it, and the stop follows the fill."""
    rest = [(103.0, 103.5, 102.9, 103.2, 1e5)]    # opens far above the 101.0 level
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.fill_price == 103.0                  # the bar's open, worse than the level
    assert t.stop_price == pytest.approx(103.0 - ATR_STOP_FRACTION * 2.0)
    assert t.risk_per_share == pytest.approx(ATR_STOP_FRACTION * 2.0)


def test_there_is_no_target_and_an_unstopped_trade_runs_to_the_close():
    rest = [(100.9, 101.5, 100.85, 101.4, 1e5)]   # never revisits the 100.8 stop
    rest += [(101.4 + i, 102.0 + i, 101.3 + i, 101.9 + i, 1e5) for i in range(20)]
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.exit_reason == "time"
    assert t.net_r > 50, "a 20-point run on a 0.2 stop must not be capped"


def test_no_atr_is_not_a_trade():
    m = OrbStocksInPlay({})
    trades, _ = run_symbol(_session(BULL_OPEN, [(100.8, 101.5, 100.7, 101.4, 1e5)]),
                           m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_no_atr"] == 1


def test_an_order_that_never_triggers_is_not_a_trade():
    rest = [(100.7, 100.8, 100.6, 100.7, 1e5)] * 5
    trades, rejections = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                                    NO_COST, warmup_days=0)
    assert trades == []
    assert [r.reason for r in rejections] == ["expired"]
