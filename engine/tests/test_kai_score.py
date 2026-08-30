"""The port of Kai's score, attacked three ways.

1. **Fidelity.** `engine/kai_score/reference_cca.py` is a verbatim copy of the
   production scanner and its indicators. This file requires the fast windowed
   port in `kai_score/cca.py` + `kai_score/score.py` to return the SAME integer
   score, and the same candidacy and direction, on the same bars — component by
   component, over hundreds of ticker-days of synthetic tape. A port that is
   "close" is not a test of Kai's score.
2. **Lookahead.** The poisoned-future and amputated-future attacks from
   `tests/test_no_lookahead.py`, applied to the score: overwrite every daily bar
   from the session onward with nonsense, or delete them from the book entirely,
   and the score must not move by one point. A deliberately cheating scorer is
   run through the identical harness and must be caught.
3. **Mechanics.** The published component boundaries, checked on frames built to
   sit either side of each one.

The bars are synthetic on purpose. `engine/data/` is not in the repository, so a
test that needed the cache would be a test that does not run.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from engine.kai_score import cca
from engine.kai_score import config as kcfg
from engine.kai_score import reference_cca as ref
from engine.kai_score import score as ks

RNG = np.random.default_rng(20260829)


# ---------------------------------------------------------------------------
# a synthetic book


def _dates(n: int, start: int = 20210104) -> np.ndarray:
    """`n` weekday dates as yyyymmdd, so the calendar-day windows behave like
    real ones."""
    d0 = np.datetime64(f"{start//10000:04d}-{(start//100)%100:02d}-{start%100:02d}")
    out, cur = [], d0
    while len(out) < n:
        if int(cur.astype("datetime64[D]").astype(int) + 4) % 7 not in (5, 6):
            out.append(cur)
        cur = cur + np.timedelta64(1, "D")
    iso = np.array(out, dtype="datetime64[D]").astype(str)
    return np.array([int(s.replace("-", "")) for s in iso], dtype="int64")


def _walk(n: int, seed: int) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(seed)
    ret = rng.normal(0.0004, 0.028, n)
    close = 40.0 * np.exp(np.cumsum(ret))
    spread = np.abs(rng.normal(0.012, 0.008, n)) + 0.002
    high = close * (1 + spread)
    low = close * (1 - spread)
    open_ = close * (1 + rng.normal(0, 0.006, n))
    high = np.maximum.reduce([high, open_, close])
    low = np.minimum.reduce([low, open_, close])
    vol = np.abs(rng.lognormal(14.0, 0.55, n))
    return {"open": open_, "high": high, "low": low, "close": close, "volume": vol}


class Book:
    """The shape `score.score_symbol` reads, with no split adjustment (factor 1)
    so the reference and the port see literally the same numbers."""

    def __init__(self, symbols: dict[str, dict], days: np.ndarray) -> None:
        self.day = {s: days.copy() for s in symbols}
        self.factor = {s: np.ones(len(days)) for s in symbols}
        for k in ("open", "high", "low", "close", "volume"):
            setattr(self, k, {s: v[k].copy() for s, v in symbols.items()})
        self.raw_close = {s: v["close"].copy() for s, v in symbols.items()}


def _book(n_sym: int = 6, n_days: int = 420) -> tuple[Book, np.ndarray]:
    days = _dates(n_days)
    syms = {f"T{i}": _walk(n_days, 500 + i) for i in range(n_sym)}
    return Book(syms, days), days


def _reference_for(book: Book, sym: str, session_day: int):
    """What the live scanner would compute, given the two fetches it makes."""
    d = book.day[sym]
    j = int(np.searchsorted(d, session_day, side="left")) - 1
    if j < 0:
        return None
    asof = np.datetime64(f"{d[j]//10000:04d}-{(d[j]//100)%100:02d}-{d[j]%100:02d}")
    iso = np.array([f"{x//10000:04d}-{(x//100)%100:02d}-{x%100:02d}" for x in d],
                   dtype="datetime64[D]")

    def frame(cal_days: int) -> pd.DataFrame:
        s = int(np.searchsorted(iso, asof - np.timedelta64(cal_days, "D"), side="left"))
        idx = pd.to_datetime(iso[s:j + 1].astype(str))
        return pd.DataFrame({
            "Open": book.open[sym][s:j + 1], "High": book.high[sym][s:j + 1],
            "Low": book.low[sym][s:j + 1], "Close": book.close[sym][s:j + 1],
            "Volume": book.volume[sym][s:j + 1]}, index=idx)

    pre = ref.prefilter_reference(frame(kcfg.PREFILTER_LOOKBACK_CALENDAR_DAYS))
    if pre is None:
        return {"candidate": False}
    sc = ref.score_cheatcode_reference(frame(kcfg.SCORE_LOOKBACK_CALENDAR_DAYS),
                                       pre["signal_type"])
    return {"candidate": True, "signal_type": pre["signal_type"], **(sc or {})}


# ---------------------------------------------------------------------------
# 1. fidelity


def test_port_matches_the_live_scanner_on_every_ticker_day():
    book, days = _book()
    sessions = days[260:]                      # every one has a full 190-day window
    checked = candidates = 0
    for sym in book.day:
        got = ks.score_symbol(book, sym, sessions)
        assert got is not None
        for i, sess in enumerate(got["session"]):
            want = _reference_for(book, sym, int(sess))
            assert want is not None
            checked += 1
            assert bool(got["candidate"][i]) == want["candidate"], (sym, sess)
            if not want["candidate"]:
                continue
            candidates += 1
            assert bool(got["bullish"][i]) == (want["signal_type"] == "BUY"), (sym, sess)
            for name in ks.COMPONENTS:
                assert int(got["components"][name][i]) == int(want["components"][name]), \
                    (sym, sess, name, got["components"][name][i], want["components"][name])
            assert int(got["score"][i]) == int(want["breakout_score"]), (sym, sess)
    assert checked > 800, f"only {checked} ticker-days compared"
    assert candidates > 40, f"only {candidates} of {checked} were candidates"


def test_the_ema_component_is_dead_upstream_and_dead_here():
    """Component 4 is nominally 0-10 and is always 0, because `ema_cloud` writes
    `ema_fast_bullish` and the scorer reads `ema_fast_bull`. If someone ever
    fixes that upstream, this test fails and the port has to be revisited."""
    book, days = _book()
    seen = 0
    for sym in book.day:
        got = ks.score_symbol(book, sym, days[260:])
        assert (got["components"]["ema"] == 0).all()
        seen += int(got["candidate"].sum())
    assert seen > 0
    frame = pd.DataFrame({k.capitalize() if k != "volume" else "Volume": v
                          for k, v in _walk(200, 7).items()})
    frame.index = pd.to_datetime(_dates(200).astype(str))
    out = ref.score_cheatcode_reference(frame, "BUY")
    assert out["components"]["ema"] == 0


# ---------------------------------------------------------------------------
# 2. lookahead


def _poison(book: Book, session_day: int) -> Book:
    """Every daily bar from the session onwards is nonsense."""
    syms = {}
    for s in book.day:
        d = book.day[s]
        bad = d >= session_day
        v = {k: getattr(book, k)[s].copy() for k in
             ("open", "high", "low", "close", "volume")}
        for k in ("open", "high", "low", "close"):
            v[k][bad] = 1e7
        v["volume"][bad] = 1e15
        syms[s] = v
    return Book(syms, book.day[next(iter(book.day))])


def _amputate(book: Book, session_day: int) -> Book:
    keep = book.day[next(iter(book.day))] < session_day
    syms = {}
    for s in book.day:
        syms[s] = {k: getattr(book, k)[s][keep].copy() for k in
                   ("open", "high", "low", "close", "volume")}
    return Book(syms, book.day[next(iter(book.day))][keep])


def _scores_at(book: Book, session_day: int) -> dict:
    out = {}
    for s in book.day:
        got = ks.score_symbol(book, s, np.array([session_day], dtype="int64"))
        out[s] = (bool(got["candidate"][0]), bool(got["bullish"][0]),
                  int(got["score"][0]))
    return out


def test_the_score_cannot_see_the_session_it_selects_for():
    book, days = _book()
    session = int(days[330])
    honest = _scores_at(book, session)
    assert any(c for c, _, _ in honest.values()), "nothing to attack"
    assert _scores_at(_poison(book, session), session) == honest
    assert _scores_at(_amputate(book, session), session) == honest


def test_the_attack_catches_a_scorer_that_cheats():
    """Same harness, a scorer that reads one bar too far. It must be caught, or
    the two tests above prove nothing."""
    book, days = _book()
    session = int(days[330])

    def cheat(bk, sym, sessions):
        d = bk.day[sym]
        j = int(np.searchsorted(d, sessions[0], side="left"))   # <- today, not
        j = min(j, len(d) - 1)                                  #    yesterday
        return {"session": sessions, "asof": np.array([d[j]]),
                "candidate": np.array([True]), "bullish": np.array([True]),
                "score": np.array([int(bk.close[sym][j] * 100) % 101]),
                "components": {k: np.zeros(1, dtype="int64") for k in ks.COMPONENTS},
                "rsi": np.array([np.nan]), "vol_ratio": np.array([np.nan])}

    real, ks.score_symbol = ks.score_symbol, cheat
    try:
        honest = _scores_at(book, session)
        poisoned = _scores_at(_poison(book, session), session)
    finally:
        ks.score_symbol = real
    assert poisoned != honest, "the cheating scorer was not caught"


# ---------------------------------------------------------------------------
# 3. mechanics


def test_window_builder_is_right_aligned_and_nan_padded():
    arr = np.arange(20, dtype="float64")
    # row 0 is a short window and must be left-padded; row 1 fills the width
    w = ks._windows(arr, np.array([3, 12]), np.array([0, 7]), 6)
    assert w.shape == (2, 6)
    assert np.isnan(w[0][:2]).all()
    assert list(w[0][2:]) == [0.0, 1.0, 2.0, 3.0]
    assert list(w[1]) == [7.0, 8.0, 9.0, 10.0, 11.0, 12.0]
    # the as-of bar is always the last column, never anywhere else
    assert w[0][-1] == 3.0 and w[1][-1] == 12.0


def test_trend_clouds_match_the_reference_bar_for_bar():
    n = 300
    w = _walk(n, 11)
    frame = pd.DataFrame({"Open": w["open"], "High": w["high"], "Low": w["low"],
                          "Close": w["close"], "Volume": w["volume"]})
    want = ref.supertrend(frame.copy())
    got = cca.trend_clouds(w["open"][None, :], w["high"][None, :],
                           w["low"][None, :], w["close"][None, :])
    assert np.array_equal(got["st_trend"][0], want["st_trend"].to_numpy())
    assert np.array_equal(got["st_buy_signal"][0], want["st_buy_signal"].to_numpy())
    assert np.array_equal(got["st_sell_signal"][0], want["st_sell_signal"].to_numpy())


def test_squeeze_phase_and_swing_match_the_reference():
    n = 300
    w = _walk(n, 12)
    frame = pd.DataFrame({"Open": w["open"], "High": w["high"], "Low": w["low"],
                          "Close": w["close"], "Volume": w["volume"]})
    want = ref.squeeze_momentum(frame.copy())
    got = cca.squeeze_momentum(w["high"][None, :], w["low"][None, :],
                               w["close"][None, :])
    names = np.array([cca.PHASE_NAMES[int(x)] for x in got[0]])
    assert list(names) == list(want["squeeze_phase"].astype(str))

    want_sw = ref.swing_oscillator(frame.copy())
    got_sw = cca.swing_oscillator(w["high"][None, :], w["low"][None, :],
                                  w["close"][None, :])
    assert np.allclose(got_sw["swing"][0], want_sw["swing"].to_numpy(),
                       equal_nan=True, atol=1e-9)
    assert np.array_equal(got_sw["swing_cross_up"][0],
                          want_sw["swing_cross_up"].to_numpy())


def test_rsi_and_bollinger_match_the_reference():
    for seed in (21, 22, 23):
        w = _walk(200, seed)
        c = w["close"][None, :]
        assert cca.wilder_rsi_last(c)[0] == ref.calculate_rsi(w["close"])
        assert cca.bollinger_pct_last(c)[0] == ref.calculate_bollinger(w["close"])[3]


def test_resistance_room_matches_the_reference():
    for seed in (31, 32, 33, 34):
        w = _walk(200, seed)
        frame = pd.DataFrame({"Open": w["open"], "High": w["high"], "Low": w["low"],
                              "Close": w["close"], "Volume": w["volume"]})
        want = ref.calculate_resistance_proximity(frame)["resistance_score"]
        got = ks._resistance_scores(w["high"][None, :], w["low"][None, :],
                                    w["close"][None, :], np.array([0]))[0]
        assert int(got) == int(want), seed


@pytest.mark.parametrize("n", [52, 55, 60, 61, 130])
def test_resistance_room_on_a_window_shorter_than_sixty_bars(n):
    """`find_support_resistance` slices `[-60:]` off whatever it is given, so a
    name with 52 bars of history is scanned whole. The padded matrix must not
    let the pad leak into that slice."""
    w = _walk(n, 41)
    frame = pd.DataFrame({"Open": w["open"], "High": w["high"], "Low": w["low"],
                          "Close": w["close"], "Volume": w["volume"]})
    want = ref.calculate_resistance_proximity(frame)["resistance_score"]
    pad = 8
    row = lambda k: np.concatenate([np.full(pad, np.nan), w[k]])[None, :]  # noqa: E731
    got = ks._resistance_scores(row("high"), row("low"), row("close"),
                                np.array([0]))[0]
    assert int(got) == int(want), n


@pytest.mark.parametrize("floor,field", [(kcfg.MIN_PRICE, "close"),
                                         (kcfg.MIN_AVG_VOLUME, "volume")])
def test_the_live_floors_are_applied(floor, field):
    """A name under $5, or under 500k average shares, is not a candidate however
    good its chart looks — the live prefilter drops it before scoring."""
    book, days = _book(n_sym=1, n_days=420)
    sym = next(iter(book.day))
    scale = 0.001 if field == "close" else 1e-6
    for k in (("open", "high", "low", "close") if field == "close" else ("volume",)):
        getattr(book, k)[sym] = getattr(book, k)[sym] * scale
    book.raw_close[sym] = book.close[sym]
    got = ks.score_symbol(book, sym, days[300:])
    assert not got["candidate"].any()
