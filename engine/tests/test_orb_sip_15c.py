"""`orb_sip.v5_15c` mechanics and the SPY confluence's as-of rule, on hand-built
tapes. Every expected number here is read off the fixture, not pasted from a run.

Three things are asserted:

* the range is 09:30-09:45 and the trigger is a five-minute CLOSE outside it —
  a wick through the level arms nothing, which is the whole difference from the
  incumbent's resting stop order;
* the stop is the OPPOSITE EXTREME of the 15-minute range and it is a LEVEL, and
  the entry is the NEXT bar's open, not the confirming close;
* the SPY confluence cannot see the future — attacked with the poisoned-future
  and amputated-future harness, with a deliberately cheating panel run through
  the identical attacks, which must be caught.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models.orb_sip_15c import (FIRST_DECIDE, LAST_DECIDE,
                                       OrbSip15Close, OrbSip15CloseSpy,
                                       is_block_close)
from engine.models.spy_ref import SpyPanel
from engine.tests.fixtures import make

DAY = 20240102
SYM = "FIX"
ATR = {(SYM, DAY): 2.0}
NO_COST = Costs(commission_per_share=0.0, slippage_bps=0.0)

# 09:30-09:45, fifteen one-minute bars. Range high 101.0, range low 99.5.
RANGE_BARS = [(100.0, 100.5, 99.8, 100.1, 1e5),
              (100.1, 100.6, 100.0, 100.3, 1e5),
              (100.3, 100.9, 100.2, 100.5, 1e5),
              (100.5, 101.0, 100.4, 100.7, 1e5),      # the HIGH, 101.0
              (100.7, 100.9, 99.5, 100.8, 1e5),       # the LOW, 99.5
              (100.8, 100.9, 100.6, 100.7, 1e5),
              (100.7, 100.8, 100.5, 100.6, 1e5),
              (100.6, 100.9, 100.5, 100.8, 1e5),
              (100.8, 100.9, 100.6, 100.7, 1e5),
              (100.7, 100.8, 100.4, 100.5, 1e5),
              (100.5, 100.7, 100.3, 100.6, 1e5),
              (100.6, 100.8, 100.5, 100.7, 1e5),
              (100.7, 100.9, 100.6, 100.8, 1e5),
              (100.8, 100.9, 100.5, 100.6, 1e5),
              (100.6, 100.8, 100.4, 100.7, 1e5)]
OR_HIGH, OR_LOW = 101.0, 99.5


def _session(rest: list[tuple], day: int = DAY):
    """`RANGE_BARS` occupy 09:30-09:45; `rest` runs from 09:45 (minute 585)."""
    bars = [(570 + i, *RANGE_BARS[i]) for i in range(15)]
    bars += [(585 + i, *rest[i]) for i in range(len(rest))]
    return make(bars, day=day, symbol=SYM)


def _flat(n: int, px: float = 100.7) -> list[tuple]:
    return [(px, px + 0.05, px - 0.05, px, 1e5) for _ in range(n)]


# --------------------------------------------------------------------------
# block boundaries


def test_block_closes_are_the_only_decision_minutes():
    assert is_block_close(FIRST_DECIDE)                 # 589 -> 09:45-09:50
    assert is_block_close(594) and is_block_close(599)
    assert not is_block_close(585) and not is_block_close(590)
    assert not is_block_close(584)                      # inside the range
    assert is_block_close(LAST_DECIDE)                  # 929 -> ends 15:30
    assert not is_block_close(LAST_DECIDE + 5)          # past the cutoff


# --------------------------------------------------------------------------
# mechanics


def test_a_wick_through_the_high_is_not_a_trigger():
    """The block trades ABOVE the range high but CLOSES back inside it. The
    incumbent's resting stop order would have been filled here; this model
    takes nothing, which is the entire point of the owner's change."""
    rest = _flat(4) + [(100.7, 102.0, 100.6, 100.9, 1e5)]   # 589: wick to 102.0
    rest += _flat(10)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    assert trades == []


def test_a_close_above_the_high_is_a_long_filled_on_the_next_bar():
    # 585..588 flat, 589 closes at 101.4 (above 101.0) -> long, fill at 590 open
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]
    rest += [(101.2, 101.6, 101.1, 101.5, 1e5)]             # 590: the fill bar
    rest += _flat(10, 101.5)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "long"
    assert t.decision_minute == 589
    assert t.entry_minute == 590
    assert t.fill_price == pytest.approx(101.2)          # the NEXT bar's open
    assert t.fill_price != pytest.approx(101.4)          # not the confirming close
    assert t.stop_price == pytest.approx(OR_LOW)         # the 15-minute range LOW
    assert t.risk_per_share == pytest.approx(101.2 - 99.5)


def test_a_close_below_the_low_is_a_short_stopped_at_the_range_high():
    rest = _flat(4) + [(100.6, 100.7, 99.2, 99.3, 1e5)]     # 589 closes below 99.5
    rest += [(99.4, 99.5, 99.0, 99.1, 1e5)]                 # 590: the fill bar
    rest += _flat(10, 99.1)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    t = trades[0]
    assert t.side == "short"
    assert t.fill_price == pytest.approx(99.4)
    assert t.stop_price == pytest.approx(OR_HIGH)
    assert t.risk_per_share == pytest.approx(101.0 - 99.4)


def test_the_stop_is_a_level_and_does_not_move_with_a_gapped_fill():
    """A long that gaps far above the confirming close risks MORE, because the
    stop is a price on the chart. Same contract as `orb_sip.v2`."""
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]
    rest += [(103.0, 103.2, 102.9, 103.1, 1e5)]             # gapped fill
    rest += _flat(10, 103.1)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    t = trades[0]
    assert t.fill_price == pytest.approx(103.0)
    assert t.stop_price == pytest.approx(OR_LOW)            # unmoved
    assert t.risk_per_share == pytest.approx(103.0 - 99.5)


def test_only_the_first_confirmed_break_is_taken():
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]   # 589 confirms long
    rest += [(101.2, 101.6, 101.1, 101.5, 1e5)]
    rest += _flat(3, 101.5)
    rest += [(101.5, 101.6, 98.0, 98.1, 1e5)]               # 594 closes below low
    rest += _flat(8, 98.1)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    assert trades[0].side == "long"


def test_a_later_block_can_confirm_when_the_first_does_not():
    rest = _flat(4) + [(100.7, 100.9, 100.5, 100.8, 1e5)]   # 589 inside
    rest += _flat(4, 100.8)
    rest += [(100.8, 101.6, 100.7, 101.5, 1e5)]             # 594 closes above
    rest += [(101.4, 101.7, 101.3, 101.6, 1e5)]             # 595 fill bar
    rest += _flat(8, 101.6)
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    assert trades[0].decision_minute == 594
    assert trades[0].entry_minute == 595


def test_an_unstopped_trade_exits_at_the_close_with_no_target():
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]
    rest += [(101.2, 101.6, 101.1, 101.5, 1e5)]
    rest += _flat(10, 105.0)                                # runs far, no target
    trades, _ = run_symbol(_session(rest), OrbSip15Close(ATR), NO_COST,
                           warmup_days=0)
    t = trades[0]
    assert t.exit_reason == "time"
    assert t.exit_price == pytest.approx(105.0)


def test_no_atr_is_not_a_reason_to_skip():
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]
    rest += [(101.2, 101.6, 101.1, 101.5, 1e5)]
    rest += _flat(10, 101.5)
    trades, _ = run_symbol(_session(rest), OrbSip15Close({}), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1


# --------------------------------------------------------------------------
# the SPY panel and its as-of rule


def _spy(day: int, minute_close: dict[int, float]):
    bars = [(m, px, px + 0.05, px - 0.05, px, 1e6)
            for m, px in sorted(minute_close.items())]
    return SpyPanel(make(bars, day=day, symbol="SPY"))


SPY_UP = {584: 500.0, 585: 500.1, 586: 500.2, 587: 500.3, 588: 500.4,
          589: 500.5, 590: 500.6, 594: 500.9, 595: 501.0}
SPY_DOWN = {584: 500.0, 585: 499.9, 586: 499.8, 587: 499.7, 588: 499.6,
            589: 499.5, 590: 499.4, 594: 499.1, 595: 499.0}

LONG_REST = (_flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]
             + [(101.2, 101.6, 101.1, 101.5, 1e5)] + _flat(10, 101.5))


def test_spy_direction_is_the_sign_over_the_break_window():
    p = _spy(DAY, SPY_UP)
    assert p.direction(DAY, 589, 584) == 1
    p = _spy(DAY, SPY_DOWN)
    assert p.direction(DAY, 589, 584) == -1


def test_spy_close_at_never_returns_a_later_bar():
    p = _spy(DAY, SPY_UP)
    assert p.close_at(DAY, 589) == pytest.approx(500.5)
    # a minute with no bar of its own falls back to the last one BEFORE it
    assert p.close_at(DAY, 593) == pytest.approx(500.6)   # the 590 bar, not 594
    assert p.close_at(DAY, 583) is None                   # nothing at or before


def test_spy_panel_refuses_a_reference_after_the_decision():
    p = _spy(DAY, SPY_UP)
    with pytest.raises(ValueError):
        p.direction(DAY, 589, 594)


def test_a_long_is_taken_when_spy_agrees_and_declined_when_it_does_not():
    up = OrbSip15CloseSpy(ATR, spy=_spy(DAY, SPY_UP))
    trades, _ = run_symbol(_session(LONG_REST), up, NO_COST, warmup_days=0)
    assert len(trades) == 1 and trades[0].side == "long"
    assert up.census["spy_agrees"] == 1

    down = OrbSip15CloseSpy(ATR, spy=_spy(DAY, SPY_DOWN))
    trades, _ = run_symbol(_session(LONG_REST), down, NO_COST, warmup_days=0)
    assert trades == []
    assert down.census["spy_disagrees"] == 1


def test_a_declined_break_does_not_re_arm_on_a_later_block():
    """The break happened once and was declined. It is not retried."""
    rest = _flat(4) + [(100.9, 101.5, 100.8, 101.4, 1e5)]   # 589 confirms long
    rest += _flat(4, 101.4)
    rest += [(101.4, 102.0, 101.3, 101.9, 1e5)]             # 594 also above
    rest += _flat(6, 101.9)
    m = OrbSip15CloseSpy(ATR, spy=_spy(DAY, SPY_DOWN))
    trades, _ = run_symbol(_session(rest), m, NO_COST, warmup_days=0)
    assert trades == []


def test_a_missing_spy_reference_declines_rather_than_guesses():
    m = OrbSip15CloseSpy(ATR, spy=_spy(DAY, {700: 500.0}))
    trades, _ = run_symbol(_session(LONG_REST), m, NO_COST, warmup_days=0)
    assert trades == []
    assert m.census["spy_reference_missing"] == 1


# --------------------------------------------------------------------------
# the attacks


def _poison_after(minute_close: dict[int, float], m: int) -> dict[int, float]:
    """Every SPY bar after `m` replaced with nonsense."""
    return {k: (v if k <= m else -1e9) for k, v in minute_close.items()}


def _amputate_after(minute_close: dict[int, float], m: int) -> dict[int, float]:
    """Every SPY bar after `m` does not exist at all."""
    return {k: v for k, v in minute_close.items() if k <= m}


class CheatingSpyPanel(SpyPanel):
    """A panel that reads the bar AFTER the one it was asked for.

    It exists so the attacks below can be shown to catch something. A test that
    cannot fail proves nothing.
    """

    def close_at(self, day: int, minute: int) -> float | None:
        m = self._minute.get(int(day))
        if m is None:
            return None
        j = int(np.searchsorted(m, int(minute), side="right"))
        if j >= len(m):
            j = len(m) - 1
        if j < 0:
            return None
        return float(self._close[int(day)][j])


# A SPY tape that goes DOWN through the decision minute and reverses UP after
# it. An honest panel sees only the fall and declines the long; a cheat sees the
# reversal and takes it.
SPY_TRAP = {584: 500.0, 585: 499.9, 586: 499.8, 587: 499.7, 588: 499.6,
            589: 499.5, 590: 501.0, 594: 502.0, 595: 503.0}


@pytest.mark.parametrize("attack", [_poison_after, _amputate_after])
def test_the_confluence_survives_the_future_being_destroyed(attack):
    honest = _spy(DAY, SPY_TRAP)
    base = honest.direction(DAY, 589, 584)
    attacked = _spy(DAY, attack(SPY_TRAP, 589))
    assert attacked.direction(DAY, 589, 584) == base

    t_full, _ = run_symbol(_session(LONG_REST),
                           OrbSip15CloseSpy(ATR, spy=honest), NO_COST,
                           warmup_days=0)
    t_attacked, _ = run_symbol(_session(LONG_REST),
                               OrbSip15CloseSpy(ATR, spy=attacked), NO_COST,
                               warmup_days=0)
    assert t_full == [] and t_attacked == []      # SPY fell; the long is declined
    assert [(t.side, t.fill_price) for t in t_full] == \
           [(t.side, t.fill_price) for t in t_attacked]


def test_the_attacks_catch_a_cheating_panel():
    cheat = CheatingSpyPanel(make(
        [(m, px, px + 0.05, px - 0.05, px, 1e6)
         for m, px in sorted(SPY_TRAP.items())], day=DAY, symbol="SPY"))
    # The cheat reads 590 (501.0) instead of 589 (499.5) and calls it a rise.
    assert cheat.direction(DAY, 589, 584) == 1
    t_cheat, _ = run_symbol(_session(LONG_REST),
                            OrbSip15CloseSpy(ATR, spy=cheat), NO_COST,
                            warmup_days=0)
    assert len(t_cheat) == 1                      # it takes the trade it should not

    amputated = CheatingSpyPanel(make(
        [(m, px, px + 0.05, px - 0.05, px, 1e6)
         for m, px in sorted(_amputate_after(SPY_TRAP, 589).items())],
        day=DAY, symbol="SPY"))
    # With the future gone the cheat cannot cheat, so its answer MOVES — which
    # is exactly what the attack is built to detect.
    assert amputated.direction(DAY, 589, 584) == -1
    t_amp, _ = run_symbol(_session(LONG_REST),
                          OrbSip15CloseSpy(ATR, spy=amputated), NO_COST,
                          warmup_days=0)
    assert t_amp == []
    assert len(t_cheat) != len(t_amp)


def test_the_model_never_reads_a_spy_minute_after_its_decision():
    """The call-site assertion, exercised: every SPY read is at or before the
    decision minute, and the fill is strictly after it."""
    seen: list[tuple[int, int]] = []

    class Recording(SpyPanel):
        def close_at(self, day: int, minute: int):
            seen.append((int(day), int(minute)))
            return super().close_at(day, minute)

    panel = Recording(make(
        [(m, px, px + 0.05, px - 0.05, px, 1e6)
         for m, px in sorted(SPY_UP.items())], day=DAY, symbol="SPY"))
    trades, _ = run_symbol(_session(LONG_REST),
                           OrbSip15CloseSpy(ATR, spy=panel), NO_COST,
                           warmup_days=0)
    assert len(trades) == 1
    decision = trades[0].decision_minute
    assert seen and all(m <= decision for _, m in seen)
    assert trades[0].entry_minute > decision
