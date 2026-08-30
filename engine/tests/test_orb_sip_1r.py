"""The 1R take-profit, on hand-built tapes.

Three things are asserted, and the first is the one that would silently corrupt
the lane if it were wrong:

* the target is measured from the FILL, not from the decision-time price, so a
  gapped entry gets a 1R target on the risk it actually carries;
* a target fills AT the level with no slippage (it is a resting limit) while a
  stop still slips, which is the asymmetry `fills.py` has always had;
* when one bar holds both the stop and the target, the STOP is assumed and the
  trade is flagged ambiguous — dormant until this lane, live now.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_1r import OrbSip15Close1R, OrbSipV2Target1R
from engine.models.orb_sip_v2 import OrbStocksInPlayV2
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)

# bullish 09:30-09:35 candle: open 100.0 close 100.8, high 101.0, low 99.5
BULL = [(100.0, 100.5, 99.8, 100.1, 1e5),
        (100.1, 100.6, 100.0, 100.3, 1e5),
        (100.3, 100.9, 100.2, 100.5, 1e5),
        (100.5, 101.0, 100.4, 100.7, 1e5),
        (100.7, 100.9, 99.5, 100.8, 1e5)]


def _session(rest):
    bars = [(570 + i, *BULL[i]) for i in range(5)]
    bars += [(575 + i, *rest[i]) for i in range(len(rest))]
    return make(bars, day=DAY, symbol=SYM)


def test_the_target_is_one_R_measured_from_the_fill():
    """Entry level 101.0, stop 99.5. A clean fill at 101.0 risks 1.50, so the
    target is 102.50 — and the trade must exit there, not at the bell."""
    rest = [(100.8, 101.4, 100.7, 101.3, 1e5),      # fills at 101.0
            (101.3, 103.0, 101.2, 102.9, 1e5),      # reaches 102.50
            (102.9, 103.0, 102.8, 102.95, 1e5)]
    trades, _ = run_symbol(_session(rest), OrbSipV2Target1R(ATR), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.fill_price == pytest.approx(101.0)
    assert t.risk_per_share == pytest.approx(1.5)
    assert t.exit_reason == "target"
    assert t.exit_price == pytest.approx(102.5)     # AT the level, no slippage
    assert t.net_r == pytest.approx(1.0)


def test_a_gapped_fill_gets_a_bigger_R_and_a_further_target():
    """The decision-time estimate would be 102.50. The fill gaps to 102.0, so
    the real risk is 2.50 and the real target is 104.50. Booking the estimate
    would have made this a 0.2R trade dressed as a 1R trade."""
    rest = [(102.0, 102.4, 101.9, 102.3, 1e5),      # gapped fill at 102.0
            (102.3, 105.0, 102.2, 104.9, 1e5),
            (104.9, 105.0, 104.8, 104.95, 1e5)]
    trades, _ = run_symbol(_session(rest), OrbSipV2Target1R(ATR), NO_COST,
                           warmup_days=0)
    t = trades[0]
    assert t.fill_price == pytest.approx(102.0)
    assert t.stop_price == pytest.approx(99.5)      # still the candle LOW
    assert t.risk_per_share == pytest.approx(2.5)
    assert t.exit_reason == "target"
    assert t.exit_price == pytest.approx(104.5)     # 1R from the FILL
    assert t.meta["target_estimate"] == pytest.approx(102.5)   # what it is NOT


def test_the_stop_is_assumed_when_one_bar_holds_both_levels():
    rest = [(100.8, 101.4, 100.7, 101.3, 1e5),      # fills at 101.0
            (101.3, 103.0, 99.0, 99.2, 1e5)]        # holds 102.50 AND 99.50
    trades, _ = run_symbol(_session(rest), OrbSipV2Target1R(ATR), NO_COST,
                           warmup_days=0)
    t = trades[0]
    assert t.exit_reason == "stop"
    assert t.ambiguous_bar is True
    assert t.net_r == pytest.approx(-1.0)


def test_the_cap_changes_the_exit_and_nothing_else():
    """Same tape, capped and uncapped: identical side, fill and stop; the capped
    one banks 1R while the uncapped one runs to the bell."""
    rest = [(100.8, 101.4, 100.7, 101.3, 1e5),
            (101.3, 106.0, 101.2, 105.9, 1e5),      # runs far past 1R
            (105.9, 106.0, 105.8, 105.95, 1e5)]
    capped, _ = run_symbol(_session(rest), OrbSipV2Target1R(ATR), NO_COST,
                           warmup_days=0)
    plain, _ = run_symbol(_session(rest), OrbStocksInPlayV2(ATR), NO_COST,
                          warmup_days=0)
    assert capped[0].side == plain[0].side
    assert capped[0].fill_price == pytest.approx(plain[0].fill_price)
    assert capped[0].stop_price == pytest.approx(plain[0].stop_price)
    assert capped[0].exit_reason == "target" and plain[0].exit_reason == "time"
    assert capped[0].net_r == pytest.approx(1.0)
    assert plain[0].net_r > capped[0].net_r          # the amputated tail
    assert plain[0].net_r == pytest.approx((105.95 - 101.0) / 1.5)


def test_an_unreached_target_still_exits_at_the_bell():
    rest = [(100.8, 101.4, 100.7, 101.3, 1e5),
            (101.3, 101.8, 101.2, 101.7, 1e5),      # never reaches 102.50
            (101.7, 101.9, 101.6, 101.75, 1e5)]
    trades, _ = run_symbol(_session(rest), OrbSipV2Target1R(ATR), NO_COST,
                           warmup_days=0)
    assert trades[0].exit_reason == "time"


def test_the_15_minute_variant_carries_the_same_target_contract():
    bars = [(570 + i, 100.0 + i * 0.05, 101.0, 99.5, 100.0 + i * 0.05, 1e5)
            for i in range(15)]
    # range high 101.0, low 99.5; a 5-min block closing above it at 589
    bars += [(585 + i, 100.7, 100.8, 100.6, 100.7, 1e5) for i in range(4)]
    bars += [(589, 100.7, 101.5, 100.6, 101.4, 1e5)]
    bars += [(590, 101.4, 101.6, 101.3, 101.5, 1e5)]        # fill at 101.4
    bars += [(591, 101.5, 103.5, 101.4, 103.4, 1e5)]        # 1R = 101.4+1.9
    bars += [(592, 103.4, 103.5, 103.3, 103.45, 1e5)]
    trades, _ = run_symbol(make(bars, day=DAY, symbol=SYM),
                           OrbSip15Close1R(ATR), NO_COST, warmup_days=0)
    t = trades[0]
    assert t.fill_price == pytest.approx(101.4)
    assert t.risk_per_share == pytest.approx(101.4 - 99.5)
    assert t.exit_reason == "target"
    assert t.exit_price == pytest.approx(101.4 + (101.4 - 99.5))
