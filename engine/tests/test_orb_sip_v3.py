"""`orb_sip.v3` and `orb_sip.v3_15m` mechanics, on hand-built tapes.

Every expected number is read off the fixture, not pasted from a run. Three
things are asserted, and the third is the one that would silently ruin the lane
if it were wrong:

* **the gate does what the owner asked** — long only in a daily uptrend, short
  only in a daily downtrend, and sideways or opposing is NO TRADE rather than a
  smaller one;
* **nothing else changed** — with the trend always agreeing, `orb_sip.v3` emits
  the identical trade `orb_sip.v2` does, entry, stop, exit and all;
* **the 15-minute variant is the same model on a longer range** — its range is
  09:30-09:45, its direction is the sign of that whole candle, and its stop is
  the opposite extreme of that whole range rather than of the last five minutes
  inside it, which is the judgement call the gate records.
"""

from __future__ import annotations

import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_v2 import OrbStocksInPlayV2
from engine.models.orb_sip_v3 import (OrbSipV2M5, OrbSipV2M15,
                                      OrbSipV2M15Coinflip, OrbStocksInPlayV3,
                                      OrbStocksInPlayV3M15)
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
UP = {(SYM, DAY): "up"}
DOWN = {(SYM, DAY): "down"}
FLAT = {(SYM, DAY): "none"}
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


# --- the gate ---------------------------------------------------------------

def test_a_bullish_break_in_a_daily_uptrend_is_taken():
    m = OrbStocksInPlayV3(ATR, UP)
    trades, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), m, NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == pytest.approx(101.0)
    assert t.stop_price == pytest.approx(99.5)
    assert t.meta["daily_trend"] == "up"


def test_a_bullish_break_in_a_daily_downtrend_is_not_taken_at_all():
    """The owner's sentence, verbatim: 'If daily trend bearish and bullish orb
    dont take the trade'. Not a smaller trade. No trade."""
    m = OrbStocksInPlayV3(ATR, DOWN)
    trades, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_trend_opposes"] == 1
    assert m.census["signals"] == 0


def test_a_sideways_daily_trend_is_also_no_trade():
    m = OrbStocksInPlayV3(ATR, FLAT)
    trades, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_trend_none"] == 1


def test_a_symbol_day_the_trend_map_has_never_heard_of_is_no_trade():
    """A missing label must default to 'none' and skip, never to 'trade it'."""
    m = OrbStocksInPlayV3(ATR, {("OTHER", DAY): "up"})
    trades, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_trend_none"] == 1


def test_a_bearish_break_needs_a_daily_downtrend():
    rest = [(100.3, 102.0, 100.2, 101.9, 1e5),    # above the high: no long
            (101.9, 102.0, 99.8, 99.9, 1e5)]      # below the low: short arms
    ok, _ = run_symbol(_session(BEAR_OPEN, rest), OrbStocksInPlayV3(ATR, DOWN),
                       NO_COST, warmup_days=0)
    assert len(ok) == 1 and ok[0].side == "short"
    assert ok[0].stop_price == pytest.approx(101.2)
    blocked, _ = run_symbol(_session(BEAR_OPEN, rest), OrbStocksInPlayV3(ATR, UP),
                            NO_COST, warmup_days=0)
    assert blocked == []


def test_an_empty_trend_map_is_a_loud_failure_not_a_silent_pass():
    """A model whose gate input failed to load must not quietly become v2."""
    with pytest.raises(ValueError):
        OrbStocksInPlayV3(ATR, {})


# --- nothing else changed ---------------------------------------------------

def test_with_the_trend_agreeing_v3_is_exactly_v2():
    v3, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), OrbStocksInPlayV3(ATR, UP),
                       NO_COST, warmup_days=0)
    v2, _ = run_symbol(_session(BULL_OPEN, BREAK_BOTH), OrbStocksInPlayV2(ATR),
                       NO_COST, warmup_days=0)
    assert len(v3) == len(v2) == 1
    for f in ("side", "fill_price", "stop_price", "exit_price", "exit_reason",
              "risk_per_share", "gross_r", "net_r", "entry_minute", "exit_minute"):
        assert getattr(v3[0], f) == getattr(v2[0], f), f


def test_the_shared_base_at_five_minutes_reproduces_v2_signal_for_signal():
    """`OrbSipV2M5` is not a model; it exists so this assertion can be made. If
    it ever fails, the 15-minute variant's numbers are not comparable with the
    5-minute ones and the report is wrong before it is written."""
    cases = [(BULL_OPEN, BREAK_BOTH),
             (BEAR_OPEN, [(100.3, 102.0, 100.2, 101.9, 1e5),
                          (101.9, 102.0, 99.8, 99.9, 1e5)]),
             (BULL_OPEN, [(100.7, 100.8, 100.6, 100.7, 1e5)] * 5),
             (BULL_OPEN, [(103.0, 103.5, 102.9, 103.2, 1e5)])]
    for open_bars, rest in cases:
        a, _ = run_symbol(_session(open_bars, rest), OrbSipV2M5(ATR), NO_COST,
                          warmup_days=0)
        b, _ = run_symbol(_session(open_bars, rest), OrbStocksInPlayV2(ATR),
                          NO_COST, warmup_days=0)
        assert len(a) == len(b)
        for x, y in zip(a, b):
            assert (x.side, x.fill_price, x.stop_price, x.exit_price,
                    x.exit_reason) == (y.side, y.fill_price, y.stop_price,
                                       y.exit_price, y.exit_reason)


def test_a_doji_opening_candle_is_still_not_traded_and_the_trend_cannot_rescue_it():
    doji = [(100.0, 100.5, 99.8, 100.1, 1e5)] * 4 + [(100.1, 100.9, 99.5, 100.0, 1e5)]
    m = OrbStocksInPlayV3(ATR, UP)
    trades, _ = run_symbol(_session(doji, [(100.0, 102.0, 98.0, 101.0, 1e5)]), m,
                           NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["skip_doji_opening_candle"] == 1


# --- the 15-minute variant --------------------------------------------------
#
# Fifteen 1-minute bars, 09:30-09:45. Read off the page:
#   whole-range high 102.0 (bar 9), whole-range low 99.0 (bar 1)
#   open 100.0 (bar 0), close 101.5 (bar 14)  -> bullish
#   the LAST FIVE minutes, bars 10-14, run 101.0..101.6 high and 100.8 low
# so the two readings of "the opposite extreme" are 99.0 and 100.8, and the test
# below pins which one this lane chose.
M15_OPEN = (
    [(100.0, 100.4, 99.9, 100.2, 1e5),
     (100.2, 100.3, 99.0, 99.4, 1e5)]
    + [(99.4 + 0.1 * i, 99.8 + 0.1 * i, 99.3 + 0.1 * i, 99.7 + 0.1 * i, 1e5)
       for i in range(7)]
    + [(100.4, 102.0, 100.3, 101.0, 1e5)]
    + [(101.0, 101.6, 100.8, 101.1, 1e5),
       (101.1, 101.5, 101.0, 101.2, 1e5),
       (101.2, 101.5, 101.0, 101.3, 1e5),
       (101.3, 101.5, 101.1, 101.4, 1e5),
       (101.4, 101.6, 101.2, 101.5, 1e5)])

M15_BREAK = [(101.5, 102.4, 101.4, 102.3, 1e5),   # through the 102.0 range high
             (102.3, 102.5, 102.2, 102.4, 1e5)]


def test_the_fifteen_minute_range_is_the_whole_candle_and_so_is_its_stop():
    m = OrbStocksInPlayV3M15(ATR, UP)
    trades, _ = run_symbol(_session(M15_OPEN, M15_BREAK), m, NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.fill_price == pytest.approx(102.0)        # the whole range's HIGH
    assert t.stop_price == pytest.approx(99.0)         # the whole range's LOW
    assert t.stop_price != pytest.approx(100.8), (
        "100.8 is the low of the last five minutes — the reading this lane "
        "did NOT take, and the gate says so")
    assert t.meta["range_minutes"] == 15


def test_the_fifteen_minute_model_does_not_decide_at_0935():
    """A 15-minute model that armed at 09:35 would be a 5-minute model with a
    different stop. The decision minute is the range close."""
    m = OrbStocksInPlayV3M15(ATR, UP)
    assert not m.wants_bar(9 * 60 + 34, DAY)
    assert not m.wants_bar(9 * 60 + 39, DAY)
    assert m.wants_bar(9 * 60 + 44, DAY)
    trades, _ = run_symbol(_session(M15_OPEN, M15_BREAK), m, NO_COST, warmup_days=0)
    assert trades[0].decision_minute == 9 * 60 + 44


def test_the_fifteen_minute_gate_behaves_the_same_way():
    blocked = OrbStocksInPlayV3M15(ATR, DOWN)
    trades, _ = run_symbol(_session(M15_OPEN, M15_BREAK), blocked, NO_COST,
                           warmup_days=0)
    assert trades == []
    assert blocked.census["skip_trend_opposes"] == 1


def test_the_ungated_fifteen_minute_base_takes_what_the_gate_removes():
    """`orb_sip.v2_15m` is what the filter is subtracted from; it must take the
    trade the gated model refuses, or 'what the filter removed' is unmeasurable."""
    base = OrbSipV2M15(ATR, DOWN)
    trades, _ = run_symbol(_session(M15_OPEN, M15_BREAK), base, NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    assert trades[0].meta["daily_trend"] == "down"
    assert trades[0].side == "long"


def test_the_fifteen_minute_control_keeps_the_geometry_and_flips_only_the_side():
    rest = [(101.5, 102.4, 98.5, 98.8, 1e5),      # takes both ends of the range
            (98.8, 99.0, 98.6, 98.9, 1e5)]
    c = OrbSipV2M15Coinflip(ATR)
    trades, _ = run_symbol(_session(M15_OPEN, rest), c, NO_COST, warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    if t.side == "long":
        assert (t.signal_entry, t.stop_price) == (pytest.approx(102.0),
                                                  pytest.approx(99.0))
    else:
        assert (t.signal_entry, t.stop_price) == (pytest.approx(99.0),
                                                  pytest.approx(102.0))


def test_the_control_uses_the_seed_every_other_lane_used():
    from engine.models.orb_sip import OrbStocksInPlayCoinflip
    a, b = OrbSipV2M15Coinflip(ATR), OrbStocksInPlayCoinflip(ATR)
    assert a.SEED == b.SEED
    for sym in ("AAPL", "TSLA", "NVDA", "F"):
        for day in (20210830, 20250828, 20260828):
            assert a._flip(sym, day) == b._side(sym, day)


# --- the pre-registered verdict logic ---------------------------------------
#
# The function that turns five booleans into a word decides the answer, so it is
# tested before it is ever run on real numbers.

from engine.models import gates  # noqa: E402


class _Sum:
    def __init__(self, n, mean_r):
        self.n, self.mean_r = n, mean_r


class _Pf:
    def __init__(self, total_return, sharpe, max_drawdown=0.1):
        self.total_return, self.sharpe, self.max_drawdown = (
            total_return, sharpe, max_drawdown)


def _gates(n=1_000, net=0.05, gross=0.06, flip=None, unf=None,
           total=0.5, sharpe=1.5, prefix="T"):
    flip = [0.05] * 500 if flip is None else flip
    unf = [0.05] * 500 if unf is None else unf
    return gates.evaluate_sip_v3(_Sum(n, net), gross, flip, unf,
                                 _Pf(total, sharpe), prefix)


def test_all_five_passing_is_confirmed_out_of_sample():
    assert gates.verdict_sip_v3(_gates()) == gates.CONFIRMED_OOS
    assert gates.verdict_sip_v3(_gates(prefix="U")) == gates.CONFIRMED_OOS


def test_a_negative_mean_is_failed_whatever_else_passes():
    assert gates.verdict_sip_v3(_gates(net=-0.01)) == gates.FAILED_OOS
    assert gates.verdict_sip_v3(_gates(gross=-0.01)) == gates.FAILED_OOS


def test_a_thin_sample_is_inconclusive_and_nothing_else_is_read():
    assert gates.verdict_sip_v3(_gates(n=749)) == gates.INCONCLUSIVE_SAMPLE
    assert gates.verdict_sip_v3(_gates(n=749, prefix="U")) == gates.INCONCLUSIVE_SAMPLE


def test_money_without_the_mechanism_is_partial_not_a_pass():
    for kw in ({"flip": [0.0] * 500}, {"unf": [0.0] * 500},
               {"total": -0.2}, {"sharpe": 0.4}):
        assert gates.verdict_sip_v3(_gates(**kw)) == gates.PARTIAL_OOS


def test_an_interval_that_straddles_zero_does_not_pass_t3_or_t4():
    straddle = [0.5, -0.5] * 250
    g = {x.id: x for x in _gates(flip=straddle, unf=straddle)}
    assert not g["T3"].passed and not g["T4"].passed


def test_the_windows_are_the_owners_and_the_thresholds_are_engine_sevens():
    assert gates.SIPV3_BUILD == ("2021-08-29", "2025-08-28")
    assert gates.SIPV3_HELD_BACK == ("2025-08-29", "2026-08-28")
    # everything except the sample floor is carried over unchanged
    assert gates.SIPV3_MIN_SHARPE == gates.SIPV2_MIN_SHARPE == 1.0
    assert gates.SIPV3_MIN_TRADES == 750
    assert gates.SIPV3_MODELS == 2
