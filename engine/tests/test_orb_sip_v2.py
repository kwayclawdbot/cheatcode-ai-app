"""`orb_sip.v2` mechanics, on a hand-built tape.

Every expected number here is read off the fixture, not pasted from a run. v2
differs from v1 in exactly one thing, so these tests assert two things: that the
one thing changed, and that nothing else did.

* the direction is still the sign of the 09:30-09:35 candle and the other side
  is still never traded, whatever price does;
* the entry is still a resting stop at that candle's high or low;
* **the stop is now the OPPOSITE EXTREME of that candle, and it is a LEVEL** —
  it does not move when the fill gaps through the entry, which is exactly where
  it differs from v1;
* there is still no target, and an unstopped trade still exits at the close;
* the ATR is no longer required, because the model no longer uses one.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip import ATR_STOP_FRACTION, OrbStocksInPlay
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,
                                      OrbStocksInPlayV2Coinflip)
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


def test_a_long_stops_at_the_opening_candle_low():
    rest = [(100.6, 100.7, 98.0, 98.2, 1e5),      # blows through the LOW: no short
            (98.2, 101.4, 98.1, 101.3, 1e5),      # then through the HIGH: long fills
            (101.3, 101.4, 101.2, 101.35, 1e5)]
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == 101.0                  # the level, not the bar's open
    assert t.stop_price == pytest.approx(99.5)    # the candle LOW
    assert t.risk_per_share == pytest.approx(101.0 - 99.5)


def test_a_short_stops_at_the_opening_candle_high():
    rest = [(100.3, 102.0, 100.2, 101.9, 1e5),    # above the high: no long
            (101.9, 102.0, 99.8, 99.9, 1e5)]      # below the low: short fills
    trades, _ = run_symbol(_session(BEAR_OPEN, rest), OrbStocksInPlayV2(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "short"
    assert t.fill_price == 100.0
    assert t.stop_price == pytest.approx(101.2)   # the candle HIGH
    assert t.risk_per_share == pytest.approx(101.2 - 100.0)


def test_the_stop_is_a_level_and_does_not_follow_the_fill():
    """This is the whole difference from v1, so it gets its own test.

    v1's stop is a DISTANCE from the fill: gap through the entry and the stop
    gaps with it, so the risk is constant. v2's stop is a LEVEL on the chart:
    gap through the entry and the risk grows, because the trader's stop did not
    move. Both models are run on the identical tape here so the two answers sit
    side by side.
    """
    rest = [(103.0, 103.5, 102.9, 103.2, 1e5)]    # opens far above the 101.0 level
    v2, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                       NO_COST, warmup_days=0)
    v1, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                       NO_COST, warmup_days=0)
    assert len(v2) == len(v1) == 1
    assert v2[0].fill_price == v1[0].fill_price == 103.0

    assert v2[0].stop_price == pytest.approx(99.5)              # unmoved
    assert v2[0].risk_per_share == pytest.approx(103.0 - 99.5)  # risk GREW

    assert v1[0].stop_price == pytest.approx(103.0 - ATR_STOP_FRACTION * 2.0)
    assert v1[0].risk_per_share == pytest.approx(ATR_STOP_FRACTION * 2.0)


def test_the_stop_is_wider_than_v1_on_the_same_setup():
    """Not a tuning assertion — an assertion about which rule is which.

    The fixture's candle is 1.5 wide against an ATR of 2.0, so v1 risks 0.20 and
    v2 risks 1.50 on the identical entry. If this ever inverts, the two models
    have been swapped somewhere.
    """
    rest = [(100.9, 101.5, 100.85, 101.4, 1e5)]
    v2, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                       NO_COST, warmup_days=0)
    v1, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlay(ATR),
                       NO_COST, warmup_days=0)
    assert v2[0].risk_per_share > v1[0].risk_per_share


def test_a_doji_opening_candle_is_not_traded():
    doji = [(100.0, 100.5, 99.8, 100.1, 1e5)] * 4 + [(100.1, 100.9, 99.5, 100.0, 1e5)]
    rest = [(100.0, 102.0, 98.0, 101.0, 1e5)]
    m = OrbStocksInPlayV2(ATR)
    trades, _ = run_symbol(_session(doji, rest), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_doji_opening_candle"] == 1


def test_there_is_no_target_and_an_unstopped_trade_runs_to_the_close():
    rest = [(100.9, 101.5, 100.85, 101.4, 1e5)]   # never revisits the 99.5 stop
    rest += [(101.4 + i, 102.0 + i, 101.3 + i, 101.9 + i, 1e5) for i in range(20)]
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.exit_reason == "time"
    assert t.net_r > 10, "a 20-point run on a 1.5 stop must not be capped"


def test_no_atr_is_still_a_trade_because_the_model_does_not_use_one():
    """v1 skips a symbol-day with no ATR; v2 has no reason to, and must not,
    because silently trading a different set of days would make the two models
    incomparable."""
    m = OrbStocksInPlayV2({})
    trades, _ = run_symbol(_session(BULL_OPEN, [(100.8, 101.5, 100.7, 101.4, 1e5)]),
                           m, NO_COST, warmup_days=0)
    assert len(trades) == 1
    assert m.census["no_atr_reported"] == 1
    assert m.census["skip_no_atr"] == 0


def test_an_order_that_never_triggers_is_not_a_trade():
    rest = [(100.7, 100.8, 100.6, 100.7, 1e5)] * 5
    trades, rejections = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                                    NO_COST, warmup_days=0)
    assert trades == []
    assert [r.reason for r in rejections] == ["expired"]


def test_a_stop_hit_on_the_entry_bar_resolves_there():
    """A breakout that reverses through the whole opening range in one minute
    is a real thing and must resolve on the bar it happened, at -1R."""
    rest = [(100.9, 101.2, 99.0, 99.2, 1e5)]      # takes the 101.0 high, then the 99.5 low
    trades, _ = run_symbol(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR),
                           NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.exit_reason == "stop"
    assert t.exit_price == pytest.approx(99.5)
    assert t.net_r == pytest.approx(-1.0)


# --- the matched control ----------------------------------------------------

def test_the_coinflip_control_keeps_the_geometry_and_only_flips_the_side():
    """Whichever way the hash points, the control enters at one extreme of the
    opening candle and stops at the other — the same geometry the model uses,
    so the only thing being measured is the direction call."""
    rest = [(100.6, 100.7, 98.0, 98.2, 1e5),      # takes the low
            (98.2, 101.4, 98.1, 101.3, 1e5),      # takes the high
            (101.3, 101.4, 101.2, 101.35, 1e5)]
    c = OrbStocksInPlayV2Coinflip(ATR)
    trades, _ = run_symbol(_session(BULL_OPEN, rest), c, NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    if t.side == "long":
        assert t.signal_entry == pytest.approx(101.0)
        assert t.stop_price == pytest.approx(99.5)
    else:
        assert t.signal_entry == pytest.approx(99.5)
        assert t.stop_price == pytest.approx(101.0)


def test_the_coinflip_side_is_deterministic_and_reproducible():
    c = OrbStocksInPlayV2Coinflip(ATR)
    sides = {c._flip("AAPL", 20240102), c._flip("AAPL", 20240102)}
    assert len(sides) == 1
    assert sides.pop() in ("long", "short")
    # and it is not a constant function of the symbol
    assert len({c._flip("AAPL", d) for d in range(20240102, 20240140)}) == 2


def test_the_coinflip_control_uses_the_same_seed_as_v1s_control():
    """Deliberate: the two lanes' controls must flip the same way on the same
    symbol-days, or ENGINE-6 and ENGINE-7 are not comparable."""
    from engine.models.orb_sip import OrbStocksInPlayCoinflip
    a, b = OrbStocksInPlayV2Coinflip(ATR), OrbStocksInPlayCoinflip(ATR)
    assert a.SEED == b.SEED
    for sym in ("AAPL", "TSLA", "NVDA", "F"):
        for day in (20160104, 20200320, 20240102, 20260828):
            assert a._flip(sym, day) == b._side(sym, day)


def test_the_control_trades_exactly_the_days_the_model_trades():
    """Same skip rules, same range, same doji rejection — the control differs in
    the direction call and in nothing else."""
    doji = [(100.0, 100.5, 99.8, 100.1, 1e5)] * 4 + [(100.1, 100.9, 99.5, 100.0, 1e5)]
    m, c = OrbStocksInPlayV2(ATR), OrbStocksInPlayV2Coinflip(ATR)
    run_symbol(_session(doji, [(100.0, 102.0, 98.0, 101.0, 1e5)]), m,
               NO_COST, warmup_days=0)
    run_symbol(_session(doji, [(100.0, 102.0, 98.0, 101.0, 1e5)]), c,
               NO_COST, warmup_days=0)
    assert m.census["skip_doji_opening_candle"] == c.census["skip_doji_opening_candle"] == 1
    assert m.census["signals"] == c.census["signals"] == 0


# --- the pre-registered verdict logic ---------------------------------------
#
# The function that turns five booleans into a word is the thing that actually
# decides the answer, so it is tested before it is ever run on real numbers.

from engine.models import gates  # noqa: E402


class _Sum:
    def __init__(self, n, mean_r):
        self.n, self.mean_r = n, mean_r


class _Pf:
    def __init__(self, total_return, sharpe, max_drawdown=0.1):
        self.total_return, self.sharpe, self.max_drawdown = (
            total_return, sharpe, max_drawdown)


def _gates(n=10_000, net=0.05, gross=0.06, flip=None, unf=None,
           total=0.5, sharpe=1.5):
    flip = [0.05] * 500 if flip is None else flip
    unf = [0.05] * 500 if unf is None else unf
    return gates.evaluate_sip_v2(_Sum(n, net), gross, flip, unf,
                                 _Pf(total, sharpe))


def test_all_five_passing_is_confirmed_out_of_sample():
    assert gates.verdict_sip_v2(_gates()) == gates.CONFIRMED_OOS


def test_a_negative_mean_is_failed_whatever_else_passes():
    assert gates.verdict_sip_v2(_gates(net=-0.01)) == gates.FAILED_OOS
    assert gates.verdict_sip_v2(_gates(gross=-0.01)) == gates.FAILED_OOS


def test_too_few_trades_is_inconclusive_and_nothing_else_is_read():
    assert gates.verdict_sip_v2(_gates(n=4_999)) == gates.INCONCLUSIVE_SAMPLE


def test_money_without_the_mechanism_is_partial_not_a_pass():
    """H2 passes but the direction call, the filter, or the portfolio does not.
    PARTIAL must never collapse into CONFIRMED."""
    for kw in ({"flip": [0.0] * 500}, {"unf": [0.0] * 500},
               {"total": -0.2}, {"sharpe": 0.4}):
        assert gates.verdict_sip_v2(_gates(**kw)) == gates.PARTIAL_OOS


def test_an_interval_that_straddles_zero_does_not_pass_h3_or_h4():
    straddle = [0.5, -0.5] * 250
    g = {x.id: x for x in _gates(flip=straddle, unf=straddle)}
    assert not g["H3"].passed and not g["H4"].passed


def test_the_held_back_window_is_the_verdict_window():
    assert gates.SIPV2_HELD_BACK == ("2024-01-01", "2026-08-28")
    assert gates.SIPV2_CONTAMINATED == gates.SIP_REPLICATION_WINDOW
    # carried over from ENGINE-6 unchanged, in kind and in number
    assert gates.SIPV2_MIN_TRADES == gates.SIP_MIN_TRADES == 5_000
    assert gates.SIPV2_MIN_SHARPE == gates.SIP_MIN_SHARPE == 1.0
