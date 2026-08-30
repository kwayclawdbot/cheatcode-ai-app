"""The owner's stop, on a hand-built tape — including his own worked example.

    "the trigger candle was 105 to 106, and the five minute candlestick before
     that was 103 to 105, then the stop should be at 103."

That sentence is the first test in this file and the number 103 is asserted
directly. Every other expected value is read off the fixture, not pasted from a
run.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_15c import OrbSip15Close
from engine.models.orb_sip_15c_prior import OrbSip15ClosePriorStop
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)


def _bar(m, o, h, l, c, v=1e5):
    return (m, o, h, l, c, v)


def _owners_example():
    """09:30-09:45 range 100..105. 09:45-09:50 is the 103->105 candle.
    09:50-09:55 is the 105->106 trigger candle, closing at 106 above the range."""
    bars = []
    # the 15-minute opening range: high 105, low 100
    for i in range(15):
        bars.append(_bar(570 + i, 102.0, 105.0 if i == 3 else 104.0,
                         100.0 if i == 7 else 101.0, 102.0))
    # 09:45-09:50 — the candle BEFORE the trigger: 103 low, 105 high
    for i in range(5):
        bars.append(_bar(585 + i, 103.5, 105.0 if i == 2 else 104.5,
                         103.0 if i == 1 else 103.8, 104.0))
    # 09:50-09:55 — the TRIGGER candle: 105 low, 106 high, closes 106
    for i in range(5):
        bars.append(_bar(590 + i, 105.0, 106.0 if i == 4 else 105.5,
                         105.0, 106.0 if i == 4 else 105.4))
    # the fill bar and the rest of the session
    bars.append(_bar(595, 106.1, 106.4, 106.0, 106.3))
    for i in range(6):
        bars.append(_bar(596 + i, 106.3, 106.5, 106.1, 106.4))
    return make(bars, day=DAY, symbol=SYM)


def test_the_owners_worked_example_puts_the_stop_at_103():
    trades, _ = run_symbol(_owners_example(), OrbSip15ClosePriorStop(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.decision_minute == 594          # the 09:50-09:55 block closes here
    assert t.entry_minute == 595             # filled on the NEXT bar's open
    assert t.fill_price == pytest.approx(106.1)
    assert t.stop_price == pytest.approx(103.0)          # <-- the owner's number
    assert t.meta["prev_low"] == pytest.approx(103.0)
    assert t.meta["prev_high"] == pytest.approx(105.0)
    assert t.risk_per_share == pytest.approx(106.1 - 103.0)


def test_it_differs_from_engine13_only_in_the_stop():
    """Same tape, same side, same fill — ENGINE-13 stops at the 15-minute range
    low, this stops at the preceding candle's low. Nothing else moves."""
    tape = _owners_example()
    a, _ = run_symbol(tape, OrbSip15Close(ATR), NO_COST, warmup_days=0)
    b, _ = run_symbol(tape, OrbSip15ClosePriorStop(ATR), NO_COST, warmup_days=0)
    assert a[0].side == b[0].side
    assert a[0].decision_minute == b[0].decision_minute
    assert a[0].fill_price == pytest.approx(b[0].fill_price)
    assert a[0].stop_price == pytest.approx(100.0)       # the RANGE low
    assert b[0].stop_price == pytest.approx(103.0)       # the PRECEDING candle
    assert b[0].risk_per_share < a[0].risk_per_share     # the point of the change
    assert b[0].meta["range_stop"] == pytest.approx(100.0)


def _short_tape():
    bars = []
    for i in range(15):                       # range 100..105
        bars.append(_bar(570 + i, 102.0, 105.0 if i == 3 else 104.0,
                         100.0 if i == 7 else 101.0, 102.0))
    for i in range(5):                        # preceding candle: 100.5 .. 102
        bars.append(_bar(585 + i, 101.5, 102.0 if i == 2 else 101.8,
                         100.5 if i == 1 else 101.0, 101.0))
    for i in range(5):                        # trigger: closes 99.5, below 100
        bars.append(_bar(590 + i, 100.5, 100.6, 99.5, 99.5 if i == 4 else 100.2))
    bars.append(_bar(595, 99.4, 99.6, 99.2, 99.3))
    for i in range(6):
        bars.append(_bar(596 + i, 99.3, 99.5, 99.1, 99.2))
    return make(bars, day=DAY, symbol=SYM)


def test_a_short_stops_at_the_preceding_candles_HIGH():
    trades, _ = run_symbol(_short_tape(), OrbSip15ClosePriorStop(ATR),
                           NO_COST, warmup_days=0)
    t = trades[0]
    assert t.side == "short"
    assert t.stop_price == pytest.approx(102.0)          # the preceding HIGH
    assert t.fill_price == pytest.approx(99.4)


def test_the_preceding_candle_may_sit_inside_the_opening_range():
    """When the trigger is the 09:45-09:50 block, the candle before it is
    09:40-09:45 — inside the range. That is well defined and it is traded."""
    bars = []
    for i in range(15):
        lo = 103.0 if i >= 10 else (100.0 if i == 7 else 101.0)
        bars.append(_bar(570 + i, 102.0, 105.0 if i == 3 else 104.0, lo, 104.0))
    for i in range(5):                        # 09:45-09:50 triggers immediately
        bars.append(_bar(585 + i, 105.0, 106.0 if i == 4 else 105.3,
                         104.9, 106.0 if i == 4 else 105.2))
    bars.append(_bar(590, 106.1, 106.3, 106.0, 106.2))
    for i in range(6):
        bars.append(_bar(591 + i, 106.2, 106.4, 106.0, 106.3))
    trades, _ = run_symbol(make(bars, day=DAY, symbol=SYM),
                           OrbSip15ClosePriorStop(ATR), NO_COST, warmup_days=0)
    assert len(trades) == 1
    assert trades[0].decision_minute == 589
    assert trades[0].stop_price == pytest.approx(103.0)   # the 09:40-09:45 low


def test_a_decision_time_inversion_cannot_happen_for_the_first_trigger():
    """The guard exists, but it is unreachable on a first trigger and that is
    worth pinning down rather than assuming.

    For a long, the preceding candle's low can only sit above the trigger
    candle's close if that preceding candle were itself entirely above the
    opening range — in which case it would have CLOSED outside the range and
    become the trigger. So the guard is defensive, not load-bearing, and the
    real edge is the gap case below.
    """
    m = OrbSip15ClosePriorStop(ATR)
    trades, _ = run_symbol(_owners_example(), m, NO_COST, warmup_days=0)
    assert len(trades) == 1
    assert m.census["skip_inverted_stop"] == 0


def test_a_fill_that_gaps_THROUGH_the_stop_is_an_immediate_loss_not_a_skip():
    """The decision is taken at the trigger close (106) with a planned stop at
    103. The next bar opens at 102.5 — already below the stop. The trader's
    market order fills there and the position is dead on arrival.

    That is modelled as what it is: an immediate stop-out. It is NOT rescued
    into a tradeable position and the stop is NOT moved to accommodate the gap.
    `run_engine17.py` counts how often it happens, because a tiny fill-to-stop
    distance makes R meaningless and the reader has to be able to see the size
    of that.
    """
    bars = []
    for i in range(15):                       # range 100..105
        bars.append(_bar(570 + i, 102.0, 105.0 if i == 3 else 104.0,
                         100.0 if i == 7 else 101.0, 102.0))
    for i in range(5):                        # preceding: low 103, closes INSIDE
        bars.append(_bar(585 + i, 104.0, 105.0 if i == 2 else 104.5,
                         103.0 if i == 1 else 103.5, 104.0))
    for i in range(5):                        # trigger closes 106, above 105
        bars.append(_bar(590 + i, 105.2, 106.0 if i == 4 else 105.6,
                         105.0, 106.0 if i == 4 else 105.4))
    bars.append(_bar(595, 102.5, 102.8, 102.2, 102.6))   # gaps DOWN below 103
    for i in range(6):
        bars.append(_bar(596 + i, 102.6, 102.9, 102.3, 102.7))
    trades, _ = run_symbol(make(bars, day=DAY, symbol=SYM),
                           OrbSip15ClosePriorStop(ATR), NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.fill_price == pytest.approx(102.5)
    assert t.stop_price == pytest.approx(103.0)   # unmoved, still the prior low
    assert t.exit_reason == "stop"
    assert t.exit_minute == t.entry_minute        # dead on arrival


def test_the_stop_is_fully_closed_at_the_decision_and_reaches_nothing_forward():
    """Both the trigger candle and the one before it are complete when the
    decision is taken, so destroying everything after the decision bar cannot
    change the answer."""
    full = _owners_example()
    a, _ = run_symbol(full, OrbSip15ClosePriorStop(ATR), NO_COST, warmup_days=0)
    # amputate: the session ends one bar after the decision (the fill bar)
    trimmed = full.subrange(0, 26)
    b, _ = run_symbol(trimmed, OrbSip15ClosePriorStop(ATR), NO_COST,
                      warmup_days=0)
    assert a[0].stop_price == pytest.approx(b[0].stop_price)
    assert a[0].fill_price == pytest.approx(b[0].fill_price)
    assert a[0].side == b[0].side
