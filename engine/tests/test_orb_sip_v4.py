"""`orb_sip.v4_trigger` and `orb_sip.v4_prior` mechanics, on a hand-built tape.

Every expected number here is read off the fixture, not pasted from a run.

The two arms differ from `orb_sip.v2` in exactly one thing — where the stop
sits — so these tests assert three groups of things:

* **the one thing changed**: the stop is the extreme of a five-minute candle at
  the breakout, the trigger arm taking the candle the fill happened in and the
  prior arm the one before it, low for a long and high for a short;
* **nothing else did**: same 09:35 decision, same direction rule, same resting
  stop entry at the range edge, same never-trade-the-other-side, same no
  target, same exit at the close, same coin-flip seed;
* **the machinery is the same machinery**: the candle-stop runner reproduces
  `run_symbol` trade for trade on a model that does not use the hook, and the
  resolver cannot see past the fill bar.
"""

from __future__ import annotations

from dataclasses import asdict

import numpy as np
import pytest

from engine.backtest.candle_stop import run_symbol_candle_stop
from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_v2 import (OrbStocksInPlayV2,
                                      OrbStocksInPlayV2Coinflip)
from engine.models.orb_sip_v4 import (OrbSipV4Prior, OrbSipV4PriorCoinflip,
                                      OrbSipV4Trigger, OrbSipV4TriggerCoinflip,
                                      candle_start)
from engine.series import LookaheadError
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


def _run(series, model, costs=NO_COST):
    return run_symbol_candle_stop(series, model, costs, warmup_days=0)


# --- the candle grid --------------------------------------------------------

def test_the_five_minute_grid_is_anchored_at_0930():
    assert candle_start(570) == 570 and candle_start(574) == 570
    assert candle_start(575) == 575 and candle_start(579) == 575
    assert candle_start(580) == 580
    assert candle_start(15 * 60 + 58) == 15 * 60 + 55


# --- the trigger arm --------------------------------------------------------

def test_trigger_long_stops_at_the_low_of_the_candle_it_filled_in():
    # fills at 09:36 on the break of 101.0. The 09:35-09:40 candle so far is the
    # 09:35 bar (low 100.60) and the 09:36 bar (low 100.90) -> stop 100.60.
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),     # 09:35, no break
            (100.90, 101.40, 100.90, 101.30, 1e5),     # 09:36, breaks 101.0
            (101.30, 101.35, 100.50, 100.55, 1e5),     # 09:37, takes out 100.60
            (100.55, 100.60, 100.40, 100.50, 1e5)]
    trades, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Trigger(ATR))
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == pytest.approx(101.0)
    assert t.stop_price == pytest.approx(100.60)        # NOT v2's 99.5
    assert t.meta["v2_stop"] == pytest.approx(99.5)
    assert t.exit_reason == "stop"
    assert t.risk_per_share == pytest.approx(0.40)


def test_trigger_short_stops_at_the_high_of_the_candle_it_filled_in():
    # bearish open, breaks 100.0 on the 09:36 bar. 09:35-09:40 so far: highs
    # 100.30 and 100.15 -> stop 100.30.
    rest = [(100.20, 100.30, 100.05, 100.10, 1e5),     # 09:35, no break
            (100.10, 100.15, 99.60, 99.70, 1e5),       # 09:36, breaks 100.0
            (99.70, 100.35, 99.65, 100.32, 1e5),       # 09:37, takes out 100.30
            (100.32, 100.40, 100.20, 100.30, 1e5)]
    trades, _ = _run(_session(BEAR_OPEN, rest), OrbSipV4Trigger(ATR))
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "short"
    assert t.fill_price == pytest.approx(100.0)
    assert t.stop_price == pytest.approx(100.30)        # NOT v2's 101.2
    assert t.exit_reason == "stop"


def test_trigger_uses_only_the_candle_bars_up_to_the_fill():
    # The 09:35-09:40 candle's FINAL low is 99.00, printed at 09:38, AFTER the
    # 09:36 fill. A resolver that could see the whole candle would stop at
    # 99.00 and the trade would survive; the causal one stops at 100.60 and is
    # taken out at 09:37. This is the lookahead test with money attached.
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),     # 09:35
            (100.90, 101.40, 100.90, 101.30, 1e5),     # 09:36, fills at 101.0
            (101.30, 101.35, 100.50, 100.55, 1e5),     # 09:37, through 100.60
            (100.55, 100.60, 99.00, 99.10, 1e5),       # 09:38, the candle's low
            (99.10, 99.20, 99.05, 99.15, 1e5)]
    trades, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Trigger(ATR))
    assert trades[0].stop_price == pytest.approx(100.60)
    assert trades[0].exit_reason == "stop"
    assert trades[0].exit_minute == 577


def test_trigger_on_a_fill_in_the_first_minute_of_a_candle_uses_that_bar_alone():
    # fills at 09:35 itself: the candle has printed exactly one bar, so the stop
    # is that bar's low. The owner's rule has no floor and none is added.
    rest = [(100.90, 101.30, 100.85, 101.20, 1e5),     # 09:35, fills at 101.0
            (101.20, 101.25, 100.80, 100.82, 1e5),     # 09:36, takes out 100.85
            (100.82, 100.90, 100.70, 100.80, 1e5)]
    trades, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Trigger(ATR))
    assert trades[0].stop_price == pytest.approx(100.85)
    assert trades[0].risk_per_share == pytest.approx(0.15)
    assert trades[0].exit_reason == "stop"


# --- the prior arm ----------------------------------------------------------

def test_prior_on_an_early_fill_is_exactly_v2():
    # fills inside 09:35-09:40, so "the candle before" IS the opening range and
    # the stop is v2's. The report has to say how often this happens; the test
    # pins that it does.
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),     # fills at 101.0
            (101.30, 101.35, 100.50, 100.55, 1e5),
            (100.55, 100.60, 99.40, 99.45, 1e5),       # takes out 99.5
            (99.45, 99.50, 99.30, 99.40, 1e5)]
    v4, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Prior(ATR))
    v2, _ = _run(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR))
    assert len(v4) == len(v2) == 1
    assert v4[0].stop_price == pytest.approx(99.5)
    assert v4[0].stop_price == pytest.approx(v2[0].stop_price)
    assert v4[0].net_r == pytest.approx(v2[0].net_r)


def test_prior_on_a_later_fill_uses_the_candle_before_the_breakout_one():
    # nothing breaks until 09:41, which is in the 09:40-09:45 candle. The candle
    # before it is 09:35-09:40, whose low is 100.10 -> that is the stop.
    rest = [(100.80, 100.90, 100.60, 100.70, 1e5),     # 09:35
            (100.70, 100.85, 100.30, 100.40, 1e5),     # 09:36
            (100.40, 100.50, 100.10, 100.20, 1e5),     # 09:37  <- candle low
            (100.20, 100.60, 100.15, 100.55, 1e5),     # 09:38
            (100.55, 100.95, 100.50, 100.90, 1e5),     # 09:39
            (100.90, 100.99, 100.80, 100.95, 1e5),     # 09:40
            (100.95, 101.50, 100.90, 101.40, 1e5),     # 09:41, fills at 101.0
            (101.40, 101.45, 100.05, 100.10, 1e5)]     # 09:42, through 100.10
    trades, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Prior(ATR))
    assert len(trades) == 1
    assert trades[0].entry_minute == 581
    assert trades[0].stop_price == pytest.approx(100.10)
    assert trades[0].exit_reason == "stop"


def test_prior_short_takes_the_high_of_the_candle_before():
    rest = [(100.20, 100.30, 100.05, 100.10, 1e5),     # 09:35
            (100.10, 100.45, 100.05, 100.40, 1e5),     # 09:36  <- candle high
            (100.40, 100.42, 100.10, 100.15, 1e5),     # 09:37
            (100.15, 100.20, 100.05, 100.10, 1e5),     # 09:38
            (100.10, 100.15, 100.02, 100.05, 1e5),     # 09:39
            (100.05, 100.08, 99.50, 99.60, 1e5),       # 09:40, breaks 100.0
            (99.60, 100.50, 99.55, 100.48, 1e5)]       # 09:41, through 100.45
    trades, _ = _run(_session(BEAR_OPEN, rest), OrbSipV4Prior(ATR))
    assert len(trades) == 1
    assert trades[0].entry_minute == 580
    assert trades[0].stop_price == pytest.approx(100.45)
    assert trades[0].exit_reason == "stop"


# --- everything that must NOT have changed ---------------------------------

def test_the_other_side_is_never_traded_by_either_arm():
    # bullish open, price only ever breaks the LOW. No trade, either arm.
    rest = [(100.7, 100.8, 99.0, 99.1, 1e5),
            (99.1, 99.4, 98.6, 98.8, 1e5),
            (98.8, 99.0, 98.5, 98.7, 1e5)]
    for cls in (OrbSipV4Trigger, OrbSipV4Prior):
        trades, rej = _run(_session(BULL_OPEN, rest), cls(ATR))
        assert trades == []
        assert [r.reason for r in rej] == ["expired"]


def test_both_arms_take_the_same_trades_as_v2_and_only_the_stop_differs():
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),
            (101.30, 102.60, 101.20, 102.50, 1e5),
            (102.50, 102.70, 102.40, 102.60, 1e5)]
    tr, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Trigger(ATR))
    pr, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Prior(ATR))
    v2, _ = _run(_session(BULL_OPEN, rest), OrbStocksInPlayV2(ATR))
    for a in (tr, pr, v2):
        assert len(a) == 1
        assert a[0].side == "long"
        assert a[0].fill_price == pytest.approx(101.0)
        assert a[0].entry_minute == 576
        assert a[0].exit_reason == "time"            # no target, held to the close
        assert a[0].exit_price == pytest.approx(102.60)
    assert tr[0].stop_price == pytest.approx(100.60)
    assert pr[0].stop_price == pytest.approx(99.5) == v2[0].stop_price


def test_a_doji_opening_candle_is_still_no_trade():
    flat = [(100.0, 100.5, 99.8, 100.1, 1e5)] * 4 + [(100.1, 100.6, 99.9, 100.0, 1e5)]
    rest = [(100.0, 101.0, 99.0, 100.5, 1e5)] * 3
    for cls in (OrbSipV4Trigger, OrbSipV4Prior):
        m = cls(ATR)
        trades, _ = _run(_session(flat, rest), m)
        assert trades == []
        assert m.census["skip_doji_opening_candle"] == 1


def test_the_atr_is_reporting_only_and_a_missing_one_is_not_a_skip():
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),
            (101.30, 101.40, 101.20, 101.35, 1e5)]
    for cls in (OrbSipV4Trigger, OrbSipV4Prior):
        trades, _ = _run(_session(BULL_OPEN, rest), cls())     # no ATR map at all
        assert len(trades) == 1


def test_the_coinflip_controls_keep_v2s_seed_and_the_arms_stop_reading():
    # The seed is v1's and v2's, so the control draws the same side on the same
    # symbol-day as every other lane in this family.
    a = OrbStocksInPlayV2Coinflip(ATR)._flip(SYM, DAY)
    for cls in (OrbSipV4TriggerCoinflip, OrbSipV4PriorCoinflip):
        assert cls(ATR)._flip(SYM, DAY) == a
    assert OrbSipV4TriggerCoinflip.STOP_READING == "trigger"
    assert OrbSipV4PriorCoinflip.STOP_READING == "prior"
    assert OrbSipV4TriggerCoinflip.DIRECTION == "coinflip"


def test_if_stopped_out_we_take_the_loss_there_is_no_re_entry():
    # stopped on the 09:37 bar, then price runs straight back through the entry
    # level and closes far above it. One trade, one loss, and the model does not
    # come back for a second attempt.
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),     # fills 101.0
            (101.30, 101.35, 100.50, 100.55, 1e5),     # stops at 100.60
            (100.55, 103.00, 100.50, 102.90, 1e5),     # would have paid
            (102.90, 103.50, 102.80, 103.40, 1e5)]
    trades, _ = _run(_session(BULL_OPEN, rest), OrbSipV4Trigger(ATR))
    assert len(trades) == 1
    assert trades[0].exit_reason == "stop"
    assert trades[0].net_r < 0


def test_the_opening_candle_helper_agrees_with_v2s():
    s = _session(BULL_OPEN, [(100.8, 100.9, 100.7, 100.85, 1e5)])
    view = s.view(4)
    assert (OrbSipV4Trigger._opening_candle(view)
            == OrbStocksInPlayV2._opening_candle(view))


# --- the runner is the same runner -----------------------------------------

@pytest.mark.parametrize("open_candle,rest", [
    (BULL_OPEN, [(100.80, 100.95, 100.60, 100.90, 1e5),
                 (100.90, 101.40, 100.90, 101.30, 1e5),
                 (101.30, 101.35, 99.40, 99.45, 1e5),
                 (99.45, 99.60, 99.30, 99.50, 1e5)]),
    (BEAR_OPEN, [(100.20, 100.30, 100.05, 100.10, 1e5),
                 (100.10, 100.15, 99.60, 99.70, 1e5),
                 (99.70, 101.30, 99.65, 101.25, 1e5),
                 (101.25, 101.40, 101.20, 101.30, 1e5)]),
    (BULL_OPEN, [(100.7, 100.8, 99.0, 99.1, 1e5),
                 (99.1, 99.4, 98.6, 98.8, 1e5),
                 (98.8, 99.0, 98.5, 98.7, 1e5)]),
])
def test_the_candle_stop_runner_reproduces_run_symbol_when_the_hook_is_absent(
        open_candle, rest):
    """v2 has no `stop_at_fill`, so both runners must produce the same trades,
    field for field. That equivalence is what makes v2 replayed through the new
    runner a control for v4 replayed through it."""
    s = _session(open_candle, rest)
    costs = Costs()          # the real cost model, not the free one
    for cls in (OrbStocksInPlayV2, OrbStocksInPlayV2Coinflip):
        a, ra = run_symbol(s, cls(ATR), costs, warmup_days=0)
        b, rb = run_symbol_candle_stop(s, cls(ATR), costs, warmup_days=0)
        assert [asdict(x) for x in a] == [asdict(x) for x in b]
        assert [(r.symbol, r.day, r.reason) for r in ra] \
            == [(r.symbol, r.day, r.reason) for r in rb]


def test_the_resolver_is_handed_a_view_that_cannot_reach_past_the_fill():
    seen = {}

    class Spy(OrbSipV4Trigger):
        def stop_at_fill(self, view, signal, fill_price):
            seen["n"] = view.n
            seen["last_minute"] = int(view.minute[-1])
            with pytest.raises(LookaheadError):
                view.bar(view.n)
            assert not view.low.flags.writeable
            return super().stop_at_fill(view, signal, fill_price)

    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),     # fills here, 09:36
            (101.30, 101.35, 100.50, 100.55, 1e5),
            (100.55, 100.60, 95.00, 95.10, 1e5)]
    trades, _ = _run(_session(BULL_OPEN, rest), Spy(ATR))
    assert seen["last_minute"] == 576
    assert seen["n"] == 7                     # five opening bars + 09:35 + 09:36
    assert trades[0].stop_price == pytest.approx(100.60)


def test_a_stop_the_resolver_cannot_produce_is_a_rejection_not_a_guess():
    class NoCandle(OrbSipV4Trigger):
        def stop_at_fill(self, view, signal, fill_price):
            return None

    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),
            (101.30, 101.40, 101.20, 101.35, 1e5)]
    trades, rej = _run(_session(BULL_OPEN, rest), NoCandle(ATR))
    assert trades == []
    assert [r.reason for r in rej] == ["no_stop_candle"]


def test_a_zero_width_stop_is_rejected_rather_than_dividing_by_zero():
    class AtTheFill(OrbSipV4Trigger):
        def stop_at_fill(self, view, signal, fill_price):
            return fill_price

    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),
            (101.30, 101.40, 101.20, 101.35, 1e5)]
    trades, rej = _run(_session(BULL_OPEN, rest), AtTheFill(ATR))
    assert trades == []
    assert [r.reason for r in rej] == ["zero_risk_at_fill"]


def test_a_realistic_stop_is_always_strictly_beyond_the_fill_on_this_tape():
    """The two arms cannot produce a stop on the wrong side of the entry, and
    the argument is structural rather than empirical: a long fills at or above
    the range high, every bar of the breakout candle up to the fill has a low
    at or below that bar's open, and no earlier candle traded through the level
    or the order would already have filled. The test pins it on both arms."""
    rest = [(100.80, 100.95, 100.60, 100.90, 1e5),
            (100.90, 101.40, 100.90, 101.30, 1e5),
            (101.30, 102.00, 101.10, 101.90, 1e5),
            (101.90, 102.10, 101.80, 102.00, 1e5)]
    for cls in (OrbSipV4Trigger, OrbSipV4Prior):
        trades, _ = _run(_session(BULL_OPEN, rest), cls(ATR))
        assert trades[0].stop_price < trades[0].fill_price
        assert trades[0].risk_per_share > 0
