"""`orb_sip.v2+strength` mechanics, on hand-built tapes.

Three things are asserted, and the third is the one that would silently ruin the
lane if it were wrong:

* **the cut is directional** — a bullish break needs strength ABOVE the
  threshold, a bearish break needs strength BELOW its negative, and a name whose
  daily chart is going hard the wrong way is NO TRADE rather than a smaller one;
* **nothing else changed** — when the cut passes, this model emits the identical
  trade `orb_sip.v2` does: same entry, same stop, same exit;
* **it is a strict subset** — over a set of tapes, every trade this model takes
  is a trade `orb_sip.v2` also took on the same symbol-day at the same level, so
  "what the gate removed" is an exact set and never an inference.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_v2 import OrbStocksInPlayV2
from engine.models.orb_trend_str import OrbSipStrengthGate
from engine.strength import config as tcfg
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)

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

BREAK_BOTH = [(100.6, 100.7, 98.0, 98.2, 1e5),    # through the LOW first
              (98.2, 101.4, 98.1, 101.3, 1e5),    # then through the HIGH
              (101.3, 101.4, 101.2, 101.35, 1e5)]


def _session(open_bars, rest, start=570):
    bars = [(start + i, *open_bars[i]) for i in range(len(open_bars))]
    bars += [(start + len(open_bars) + i, *rest[i]) for i in range(len(rest))]
    return make(bars, day=DAY, symbol=SYM)


def _run(strength, open_bars=BULL_OPEN):
    m = OrbSipStrengthGate(ATR, {(SYM, DAY): strength})
    trades, _ = run_symbol(_session(open_bars, BREAK_BOTH), m, NO_COST,
                           warmup_days=0)
    return m, trades


# --- the cut ----------------------------------------------------------------

def test_a_bullish_break_in_a_strong_uptrend_is_taken():
    m, trades = _run(0.55)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == pytest.approx(101.0)
    assert t.stop_price == pytest.approx(99.5)
    assert t.meta["directional_strength"] == pytest.approx(0.55)


def test_a_bullish_break_in_a_downtrend_is_not_taken_at_all():
    m, trades = _run(-0.55)
    assert trades == []
    assert m.census["skip_weak_trend"] == 1
    assert m.census["signals"] == 0


def test_a_bullish_break_in_a_weak_uptrend_is_not_taken_either():
    """The cut is on STRENGTH, not on sign. Drifting the right way is not
    enough, which is the whole difference from ENGINE-8's three-state gate."""
    m, trades = _run(tcfg.GATE_STRENGTH - 0.01)
    assert trades == []
    assert m.census["skip_weak_trend"] == 1


def test_the_threshold_is_inclusive_at_its_own_value():
    m, trades = _run(tcfg.GATE_STRENGTH)
    assert len(trades) == 1


def test_a_bearish_break_needs_the_daily_chart_going_DOWN_hard():
    strong_down, trades_down = _run(-0.55, BEAR_OPEN)
    assert len(trades_down) == 1
    assert trades_down[0].side == "short"
    assert trades_down[0].fill_price == pytest.approx(100.0)
    assert trades_down[0].stop_price == pytest.approx(101.2)
    assert trades_down[0].meta["directional_strength"] == pytest.approx(0.55)

    strong_up, trades_up = _run(+0.55, BEAR_OPEN)
    assert trades_up == []
    assert strong_up.census["skip_weak_trend"] == 1


def test_an_unmeasurable_strength_is_no_trade_and_is_counted_separately():
    m = OrbSipStrengthGate(ATR, {("OTHER", DAY): 0.9})
    trades, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), m, NO_COST,
                           warmup_days=0)
    assert trades == []
    assert m.census["skip_no_strength"] == 1
    assert m.census["skip_weak_trend"] == 0


def test_an_empty_strength_map_is_a_wiring_failure_not_a_filter():
    with pytest.raises(ValueError):
        OrbSipStrengthGate(ATR, {})


# --- nothing else changed ----------------------------------------------------

def test_a_passing_trade_is_byte_for_byte_the_v2_trade():
    _, gated = _run(0.9)
    base = OrbStocksInPlayV2(ATR)
    plain, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), base, NO_COST,
                          warmup_days=0)
    assert len(gated) == len(plain) == 1
    a, b = gated[0], plain[0]
    for f in ("symbol", "day", "side", "fill_price", "stop_price",
              "exit_price", "exit_reason", "gross_r", "net_r"):
        assert getattr(a, f) == pytest.approx(getattr(b, f)) \
            if isinstance(getattr(a, f), float) else getattr(a, f) == getattr(b, f)


def test_the_gate_is_a_strict_subset_of_the_base_over_many_tapes():
    """The property the runner asserts on the real tape, checked here on tapes
    where the answer is knowable by hand."""
    for i, s in enumerate([-0.9, -0.3, -0.19, 0.0, 0.19, 0.2, 0.5, 0.9]):
        for opens in (BULL_OPEN, BEAR_OPEN):
            m = OrbSipStrengthGate(ATR, {(SYM, DAY): s})
            gated, _ = run_symbol(_session(opens, BREAK_BOTH), m, NO_COST,
                                  warmup_days=0)
            base = OrbStocksInPlayV2(ATR)
            plain, _ = run_symbol(_session(opens, BREAK_BOTH), base, NO_COST,
                                  warmup_days=0)
            keys = {(t.symbol, t.day, t.side, round(t.fill_price, 9),
                     round(t.stop_price, 9)) for t in plain}
            for t in gated:
                assert (t.symbol, t.day, t.side, round(t.fill_price, 9),
                        round(t.stop_price, 9)) in keys, f"case {i}"
