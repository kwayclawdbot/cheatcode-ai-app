"""orb_mtf.v1 — the written rules, exercised without the bar cache.

The model's only two pieces of I/O are the multi-timeframe context and the prior
daily view. Both are replaced here, so what is on trial is the decision logic.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from engine.backtest.mtf import H1, H4, MtfContext
from engine.backtest.two_exit import run_symbol_two_exits
from engine.backtest.types import Costs
from engine.models import orb_mtf as M
from engine.tests.fixtures import make_multiday


def _weekdays(n: int, start: str = "2024-01-02") -> list[int]:
    d, out = dt.date.fromisoformat(start), []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(int(d.isoformat().replace("-", "")))
        d += dt.timedelta(days=1)
    return out


def _tape(n_days: int = 40, seed: int = 7, vol: float = 0.14):
    rng = np.random.default_rng(seed)
    days, px = {}, 100.0
    for d in _weekdays(n_days):
        bars = []
        for m in range(240, 1200):
            step = vol if 570 <= m < 960 else vol / 3
            px = max(1.0, px + float(rng.normal(0, step)))
            bars.append((m, px, px + abs(float(rng.normal(0, vol / 2))),
                         px - abs(float(rng.normal(0, vol / 2))), px + 0.02, 10.0))
        days[d] = bars
    return make_multiday(days)


class _Aligned(MtfContext):
    """A real context — real 1h and 4h bars, so the levels are real — with the
    trend reading forced, which is the only thing being stubbed."""

    def __init__(self, series, h1: str, h4: str) -> None:
        super().__init__(series)
        self._h1, self._h4 = h1, h4

    def trend(self, tf, day, minute):
        return self._h1 if tf == H1 else self._h4


@pytest.fixture(autouse=True)
def _no_daily(monkeypatch):
    monkeypatch.setattr(M, "prior_daily_view", lambda *a, **k: None)


def _run(series, h1="up", h4="up", **kw):
    m = M.OrbMtf(ctx_factory=lambda sym: _Aligned(series, h1, h4), **kw)
    a, b, _ = run_symbol_two_exits(series, m, Costs(), warmup_days=2)
    return m, a, b


def test_it_only_looks_at_five_minute_closes_in_the_window():
    m = M.OrbMtf()
    assert m.wants_bar(9 * 60 + 49, 20240102)      # the 09:45-09:50 bar closing
    assert not m.wants_bar(9 * 60 + 48, 20240102)  # mid-bar
    assert not m.wants_bar(9 * 60 + 44, 20240102)  # the range is still forming
    assert m.wants_bar(10 * 60 + 59, 20240102)
    assert not m.wants_bar(11 * 60 + 4, 20240102)  # past the window


def test_the_two_charts_must_agree_or_there_is_no_trade():
    s = _tape()
    assert _run(s, "up", "up")[1], "the fixture never traded; the test proves nothing"
    for h1, h4 in (("up", "down"), ("down", "up"), ("up", "none"),
                   ("none", "up"), ("none", "none")):
        _, a, b = _run(s, h1, h4)
        assert a == [] and b == [], f"{h1}/{h4} should be a day off"


def test_an_aligned_uptrend_produces_longs_only_and_one_a_day():
    s = _tape()
    _, a, _ = _run(s, "up", "up")
    assert a
    assert all(t.side == "long" for t in a)
    assert len({t.day for t in a}) == len(a)


def test_an_aligned_downtrend_produces_shorts_only():
    s = _tape()
    _, a, _ = _run(s, "down", "down")
    assert a and all(t.side == "short" for t in a)


def test_every_trade_obeys_the_written_risk_rules():
    s = _tape()
    _, a, _ = _run(s, "up", "up")
    for t in a:
        risk_pct = t.meta["risk_ps"] / t.meta["ref_close"]
        assert M.MIN_RISK_PCT <= risk_pct <= M.MAX_RISK_PCT
        assert t.meta["reward_ps"] >= M.MIN_RR * t.meta["risk_ps"] - 1e-9
        assert t.stop_price < t.meta["ref_close"] < t.target_price
        assert t.meta["stop_level"] > t.stop_price          # the buffer sits beyond
        assert t.meta["stop_label"] not in ("PH", "PL")     # never a 5m pivot


def test_the_stop_is_a_level_and_not_a_distance():
    s = _tape()
    _, a, _ = _run(s, "up", "up")
    dist = [t.meta["risk_ps"] / t.meta["ref_close"] for t in a]
    assert len(set(round(d, 6) for d in dist)) > 1


def test_the_five_minute_ablation_keeps_the_same_trades_and_moves_the_stop():
    """The ablation exists to isolate one thing. Selection stays on the 1h/4h
    levels; only the stop and the target move down to the 5-minute chart."""
    s = _tape()
    _, full, _ = _run(s, "up", "up")
    _, abl, _ = _run(s, "up", "up", level_mode=M.M5)
    keys_full = [(t.symbol, t.day) for t in full]
    keys_abl = [(t.symbol, t.day) for t in abl]
    assert set(keys_abl) <= set(keys_full)
    # a few trades have no qualifying 5-minute level at all and drop out; the
    # report pairs on the intersection and says how many were lost
    assert len(keys_abl) >= 0.5 * len(keys_full)
    by_day = {(t.symbol, t.day): t for t in full}
    assert any(by_day[k].stop_price != t.stop_price for k, t in zip(keys_abl, abl))
    for k, t in zip(keys_abl, abl):
        assert t.fill_price == by_day[k].fill_price     # same entry, always


def test_the_alignment_ablation_takes_trades_the_full_spec_refuses():
    s = _tape()
    _, full, _ = _run(s, "up", "up")
    _, open_, _ = _run(s, "up", "up", require_mtf=False)
    assert len(open_) >= len(full)
    assert any(t.side == "short" for t in open_)


def test_the_day_census_adds_up():
    s = _tape()
    m, _, _ = _run(s, "up", "up")
    seen = m.census["days_seen"]
    booked = sum(v for k, v in m.census.items()
                 if k not in ("days_seen", "triggers", "signals"))
    assert seen == booked, dict(m.census)
    assert m.census["triggers"] >= m.census["signals"]
