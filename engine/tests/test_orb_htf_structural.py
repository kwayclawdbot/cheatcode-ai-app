"""orb_htf_structural.v1 — the rules, exercised without the bar cache.

The daily-trend lookup and the prior-daily view are the model's only two pieces
of I/O; both are replaced here so the test is about the decision logic and
nothing else.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.backtest.engine import run_symbol
from engine.backtest.types import Costs
from engine.models import orb_htf_structural as M
from engine.primitives import levels as lv
from engine.tests.fixtures import make_multiday


def _tape(days: int = 16, seed: int = 7, vol: float = 0.16):
    """Sessions with premarket, RTH and post-market bars, enough movement for
    an opening range to break."""
    rng = np.random.default_rng(seed)
    out, px = {}, 100.0
    for k in range(days):
        d = 20240102 + k
        bars = []
        for minute in (list(range(240, 570, 3)) + list(range(570, 960))
                       + list(range(960, 1200, 6))):
            o = px
            c = max(1.0, o + rng.normal(0, vol if 570 <= minute < 960 else vol / 2))
            bars.append((minute, o, max(o, c) + abs(rng.normal(0, vol / 2)),
                         min(o, c) - abs(rng.normal(0, vol / 2)), c,
                         float(rng.integers(500, 20_000))))
            px = c
        out[d] = bars
    return make_multiday(out)


@pytest.fixture
def uptrend(monkeypatch):
    monkeypatch.setattr(M, "daily_trend_cached",
                        lambda *a, **k: _AlwaysUp())
    monkeypatch.setattr(M, "prior_daily_view", lambda *a, **k: None)


class _AlwaysUp(dict):
    def get(self, key, default=None):
        return "up"


def test_it_only_looks_at_five_minute_closes_in_the_window():
    m = M.OrbHtfStructural()
    assert m.wants_bar(9 * 60 + 49, 20240102)      # 09:45-09:50 bar closing
    assert not m.wants_bar(9 * 60 + 48, 20240102)  # mid-bar
    assert not m.wants_bar(9 * 60 + 44, 20240102)  # the range is still forming
    assert m.wants_bar(10 * 60 + 59, 20240102)
    assert not m.wants_bar(11 * 60 + 4, 20240102)  # past the window


def test_no_daily_trend_means_no_trade(monkeypatch):
    monkeypatch.setattr(M, "daily_trend_cached", lambda *a, **k: {})
    monkeypatch.setattr(M, "prior_daily_view", lambda *a, **k: None)
    s = _tape()
    trades, _ = run_symbol(s, M.OrbHtfStructural(), Costs())
    assert trades == []


def test_it_trades_and_every_trade_obeys_the_written_rules(uptrend):
    s = _tape()
    m = M.OrbHtfStructural()
    trades, _ = run_symbol(s, m, Costs())
    assert trades, "the fixture never produced a trade; the test proves nothing"
    seen_days = set()
    for t in trades:
        assert t.side == "long", "an uptrend may only produce longs"
        assert t.day not in seen_days, "one trade per symbol per day"
        seen_days.add(t.day)
        risk_pct = t.meta["risk_ps"] / t.meta["ref_close"]
        assert M.MIN_RISK_PCT <= risk_pct <= M.MAX_RISK_PCT
        assert t.meta["reward_ps"] >= M.MIN_RR * t.meta["risk_ps"] - 1e-9
        assert t.meta["stop_level"] > t.stop_price      # the buffer sits beyond
        assert t.meta["target_level"] > t.meta["ref_close"]
        assert t.stop_price < t.meta["ref_close"] < t.target_price


def test_the_stop_is_a_level_and_not_a_distance(uptrend):
    """The point of the whole model: the stop is wherever the nearest major
    level is, so its distance varies trade to trade."""
    s = _tape()
    trades, _ = run_symbol(s, M.OrbHtfStructural(), Costs())
    dist = [t.meta["risk_ps"] / t.meta["ref_close"] for t in trades]
    assert len(set(round(d, 6) for d in dist)) > 1


def test_the_htf_ablation_takes_shorts_the_full_spec_refuses(uptrend):
    s = _tape()
    full, _ = run_symbol(s, M.OrbHtfStructural(True, M.STRUCTURAL), Costs())
    open_, _ = run_symbol(s, M.OrbHtfStructural(False, M.STRUCTURAL), Costs())
    assert all(t.side == "long" for t in full)
    assert len(open_) >= len(full)


def test_the_range_edge_ablation_keeps_the_same_trades(uptrend):
    s = _tape()
    a, _ = run_symbol(s, M.OrbHtfStructural(True, M.STRUCTURAL), Costs())
    b, _ = run_symbol(s, M.OrbHtfStructural(True, M.RANGE_EDGE), Costs())
    assert [(t.symbol, t.day) for t in a] == [(t.symbol, t.day) for t in b]
    assert [t.target_price for t in a] == [t.target_price for t in b]
    assert any(x.stop_price != y.stop_price for x, y in zip(a, b))


def test_the_day_is_spent_on_the_first_break(uptrend):
    """First qualifying trigger only. A break that fails the risk screens does
    not get a second attempt later in the window."""
    s = _tape()
    m = M.OrbHtfStructural()
    run_symbol(s, m, Costs())
    assert m.census["triggers"] >= m.census["signals"]
    assert m.census["days_seen"] >= m.census["triggers"]
