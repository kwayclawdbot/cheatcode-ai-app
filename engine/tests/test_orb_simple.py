"""`orb_simple_*.v1` on hand-built tapes, and the 2R-from-fill arithmetic.

Every expected number below is read off the fixture by hand. Nothing here was
produced by running the model and pasting the output.
"""

from __future__ import annotations

import pytest

from engine.backtest.fills import resolved_target
from engine.backtest.types import Costs, Signal
from engine.models.orb_simple import OrbSimple
from engine.tests.fixtures import make, make_multiday

OPEN = 9 * 60 + 30
DAY = 20240102


class FakeCtx:
    """A trend oracle the test controls. `by_minute` overrides per minute."""

    def __init__(self, direction: str = "up", by_minute: dict | None = None) -> None:
        self.direction = direction
        self.by_minute = by_minute or {}
        self.asked: list[tuple[int, int, int]] = []

    def trend(self, tf: int, day: int, minute: int) -> str:
        self.asked.append((tf, day, minute))
        return self.by_minute.get(minute, self.direction)


def model(direction="up", by_minute=None, variant="1h"):
    ctx = FakeCtx(direction, by_minute)
    return OrbSimple(variant, ctx_factory=lambda sym: ctx), ctx


def opening_range_bars(high=101.0, low=99.0):
    """09:30-09:44 inclusive: fifteen 1-minute bars spanning [low, high]."""
    bars = []
    for k in range(15):
        m = OPEN + k
        hi = high if k == 3 else 100.4
        lo = low if k == 9 else 99.6
        bars.append((m, 100.0, hi, lo, 100.0, 1000.0))
    return bars


def candle(start_minute, o, h, l, c):
    """Five 1-minute bars whose aggregate is exactly (o, h, l, c)."""
    return [
        (start_minute + 0, o, o, o, o, 100.0),
        (start_minute + 1, o, h, o, h, 100.0),
        (start_minute + 2, h, h, l, l, 100.0),
        (start_minute + 3, l, l, l, l, 100.0),
        (start_minute + 4, l, c, l, c, 100.0),
    ]


def evaluate_at(bars, minute, m):
    s = make(bars, day=DAY)
    j = int(next(k for k in range(len(s)) if int(s.minute[k]) == minute))
    return m.evaluate(s.view(j), DAY)


# --- the trigger -------------------------------------------------------------
def test_a_five_minute_close_above_the_range_is_a_long():
    bars = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 102.0)
    m, _ = model("up")
    sig = evaluate_at(bars, 589, m)
    assert sig is not None
    assert sig.side == "long"
    assert sig.entry_type == "market"
    assert sig.entry_price == 102.0          # the trigger candle's close
    assert sig.meta["or_high"] == 101.0
    assert sig.meta["or_low"] == 99.0


def test_a_wick_above_the_range_that_closes_back_inside_is_not_a_trigger():
    # high 102.2 pokes above the 101.0 range high; the close is 100.8, inside it
    bars = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 100.8)
    m, _ = model("up")
    assert evaluate_at(bars, 589, m) is None


def test_a_close_below_the_range_is_a_short_when_the_htf_is_down():
    bars = opening_range_bars() + candle(585, 99.5, 99.8, 97.6, 98.0)
    m, _ = model("down")
    sig = evaluate_at(bars, 589, m)
    assert sig is not None
    assert sig.side == "short"
    assert sig.entry_price == 98.0


def test_a_breakout_against_the_higher_timeframe_is_not_taken():
    bars = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 102.0)
    m, _ = model("down")                      # breaks up, HTF says down
    assert evaluate_at(bars, 589, m) is None
    m2, _ = model("none")
    assert evaluate_at(bars, 589, m2) is None


# --- the stop, and the ambiguity the gate records ----------------------------
def test_the_stop_is_the_trigger_candles_own_low_not_the_candle_before_it():
    """The reading declared in GATE.md. The prior candle's low is 96.0 and must
    NOT be the stop; the trigger candle's low is 100.3 and must be."""
    bars = (opening_range_bars()
            + candle(585, 100.2, 100.9, 96.0, 100.9)   # inside the range
            + candle(590, 100.5, 102.2, 100.3, 102.0))  # the trigger
    m, _ = model("up")
    sig = evaluate_at(bars, 594, m)
    assert sig is not None
    assert sig.stop_price == 100.3
    assert sig.meta["trigger_low"] == 100.3
    assert sig.meta["risk_ps"] == pytest.approx(102.0 - 100.3)


def test_the_short_stop_is_the_trigger_candles_high():
    bars = opening_range_bars() + candle(585, 99.5, 99.8, 97.6, 98.0)
    m, _ = model("down")
    sig = evaluate_at(bars, 589, m)
    assert sig.stop_price == 99.8
    assert sig.meta["risk_ps"] == pytest.approx(99.8 - 98.0)


def test_a_zero_width_stop_is_counted_and_not_traded():
    # a long whose trigger candle closes exactly on its own low
    bars = opening_range_bars() + [
        (585, 101.5, 101.5, 101.5, 101.5, 100.0),
        (586, 101.5, 101.5, 101.5, 101.5, 100.0),
        (587, 101.5, 101.5, 101.5, 101.5, 100.0),
        (588, 101.5, 101.5, 101.5, 101.5, 100.0),
        (589, 101.5, 101.5, 101.5, 101.5, 100.0),
    ]
    m, _ = model("up")
    assert evaluate_at(bars, 589, m) is None
    assert m.census["skip_zero_width_stop"] == 1
    assert m.census["triggers"] == 1


# --- the target --------------------------------------------------------------
def test_the_decision_time_target_is_two_risks_from_the_decision_price():
    bars = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 102.0)
    m, _ = model("up")
    sig = evaluate_at(bars, 589, m)
    assert sig.target_r == 2.0
    assert sig.target_price == pytest.approx(102.0 + 2 * 1.7)


def test_the_working_target_is_two_risks_from_the_FILL():
    """The point of `target_r`: the fill, not the decision close, sets 2R."""
    sig = Signal("m", "SPY", DAY, 0, 589, "long", "market",
                 100.0, 99.0, 102.0, 594, 955, {}, target_r=2.0)
    assert resolved_target(sig, 100.0) == pytest.approx(102.0)
    assert resolved_target(sig, 100.5) == pytest.approx(100.5 + 2 * 1.5)
    assert resolved_target(sig, 99.5) == pytest.approx(99.5 + 2 * 0.5)

    short = Signal("m", "SPY", DAY, 0, 589, "short", "market",
                   100.0, 101.0, 98.0, 594, 955, {}, target_r=2.0)
    assert resolved_target(short, 99.5) == pytest.approx(99.5 - 2 * 1.5)


def test_a_signal_without_target_r_keeps_its_own_price():
    """Every model written before ENGINE-4 must be untouched by this field."""
    sig = Signal("m", "SPY", DAY, 0, 589, "long", "market",
                 100.0, 99.0, 103.5, 594, 955, {})
    assert sig.target_r is None
    assert resolved_target(sig, 100.9) == 103.5


# --- frequency and the mechanical window -------------------------------------
def test_the_same_direction_is_not_traded_twice_in_a_day():
    bars = (opening_range_bars()
            + candle(585, 100.5, 102.2, 100.3, 102.0)
            + candle(590, 102.0, 103.0, 101.8, 102.8))
    s = make(bars, day=DAY)
    m, _ = model("up")
    first = m.evaluate(s.view(int(next(k for k in range(len(s)) if int(s.minute[k]) == 589))), DAY)
    second = m.evaluate(s.view(int(next(k for k in range(len(s)) if int(s.minute[k]) == 594))), DAY)
    assert first is not None
    assert second is None
    assert m.census["bars_direction_already_traded"] == 1


def test_the_other_direction_is_still_available_after_a_long():
    """A failed long does not block a later short — the brief says so."""
    bars = (opening_range_bars()
            + candle(585, 100.5, 102.2, 100.3, 102.0)     # long trigger
            + candle(590, 102.0, 102.1, 97.0, 98.0))      # then breaks down
    s = make(bars, day=DAY)
    m, _ = model(by_minute={589: "up", 594: "down"})
    a = m.evaluate(s.view(int(next(k for k in range(len(s)) if int(s.minute[k]) == 589))), DAY)
    b = m.evaluate(s.view(int(next(k for k in range(len(s)) if int(s.minute[k]) == 594))), DAY)
    assert a.side == "long"
    assert b is not None and b.side == "short"
    assert b.stop_price == 102.1


def test_only_five_minute_closes_inside_the_mechanical_window_are_offered():
    m, _ = model()
    assert not m.wants_bar(588, DAY)          # not a 5-minute close
    assert not m.wants_bar(584, DAY)          # the range is not complete yet
    assert m.wants_bar(589, DAY)              # 09:45-09:50 closes here
    assert m.wants_bar(944, DAY)              # 15:40-15:45, the last one
    assert not m.wants_bar(949, DAY)          # 15:50 leaves no bar to enter on
    assert not m.wants_bar(954, DAY)


def test_the_two_variants_differ_only_in_the_timeframe_they_read():
    a, ca = model(variant="1h")
    b, cb = model(variant="4h")
    bars = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 102.0)
    sa, sb = evaluate_at(bars, 589, a), evaluate_at(bars, 589, b)
    assert a.id == "orb_simple_1h.v1" and b.id == "orb_simple_4h.v1"
    assert ca.asked[0][0] == 60 and cb.asked[0][0] == 240
    for f in ("side", "entry_price", "stop_price", "target_price"):
        assert getattr(sa, f) == getattr(sb, f)


def test_an_unknown_variant_is_refused():
    with pytest.raises(ValueError):
        OrbSimple("2h")


# --- the census adds up ------------------------------------------------------
def test_every_day_is_booked_exactly_once():
    days = {}
    for d in (20240102, 20240103, 20240104):
        days[d] = opening_range_bars() + candle(585, 100.5, 102.2, 100.3, 102.0)
    s = make_multiday(days)
    m, _ = model("up")
    for j in range(len(s)):
        if m.wants_bar(int(s.minute[j]), int(s.day[j])):
            m.evaluate(s.view(j), int(s.day[j]))
    m.finish()
    booked = sum(v for k, v in m.census.items() if k.startswith("days_"))
    assert m.census["days_seen"] == 3
    assert booked - m.census["days_seen"] == 3
    assert m.census["days_with_1_trade_direction(s)"] == 3


# --- the whole thing, through the runner -------------------------------------
def test_the_runner_books_a_target_two_risks_from_the_actual_fill():
    """Entry gaps up 0.30 from the decision close, so 2R moves with it."""
    from engine.backtest.engine import run_symbol

    tail = [(m_, 103.0, 107.0, 102.9, 105.0, 100.0) for m_ in range(595, 960)]
    day_bars = (opening_range_bars()
                + candle(585, 100.5, 102.2, 100.3, 102.0)
                + [(590, 102.3, 102.4, 102.2, 102.35, 100.0),
                   (591, 102.35, 102.5, 102.3, 102.4, 100.0),
                   (592, 102.4, 102.6, 102.35, 102.5, 100.0),
                   (593, 102.5, 102.7, 102.45, 102.6, 100.0),
                   (594, 102.6, 102.8, 102.55, 102.7, 100.0)]
                + tail)
    s = make_multiday({20240102 + k: day_bars for k in range(7)})
    m = OrbSimple("1h", ctx_factory=lambda sym: FakeCtx("up"))
    costs = Costs(commission_per_share=0.0, slippage_bps=0.0)
    trades, _ = run_symbol(s, m, costs, warmup_days=5)

    assert trades, "the fixture must produce a trade or it proves nothing"
    t = trades[0]
    assert t.fill_price == pytest.approx(102.3)          # bar 590's open
    assert t.stop_price == pytest.approx(100.3)
    assert t.risk_per_share == pytest.approx(2.0)        # from the FILL
    assert t.target_price == pytest.approx(106.3)        # 102.3 + 2 * 2.0
    assert t.exit_reason == "target"
    assert t.net_r == pytest.approx(2.0)
