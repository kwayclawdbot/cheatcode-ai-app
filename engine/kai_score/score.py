"""Kai's breakout score, as `CheatCodeScanner.score_cheatcode` computes it,
evaluated on the last daily bar that had closed before the session opened.

The ten components, and their upstream ranges:

| # | component | range | where it comes from |
|---|---|---|---|
| 1 | CheatCode Trend Clouds signal | 0-20 | fresh flip in the last 2 bars, else last 5, else trend |
| 2 | squeeze momentum phase | 0-20 | phase now, against the phase 6-10 bars ago |
| 3 | swing oscillator | 0-15 | crossover, and how oversold it crossed |
| 4 | EMA cloud alignment | **0** | dead upstream — see below |
| 5 | multi-indicator confluence | 0-10 | how many of 1-3 fired hard |
| 6 | volume surge | 0-12 | today's volume over the 20-day mean |
| 7 | RSI confirmation | -3 to +10 | Wilder RSI, seeded inside the window |
| 8 | 52-week proximity | 0-8 | over the fetched window, which is ~180 CALENDAR days |
| 9 | resistance room | -5 to +8 | pivot-cluster S/R over the last 60 bars |
| 10 | Bollinger position | 0-7 | %B on the last 20 closes |

Total clipped to 0-100.

**Component 4 always contributes zero, in production and here.** `ema_cloud`
writes `ema_fast_bullish`/`ema_slow_bullish`; the scorer asks for
`ema_fast_bull`/`ema_slow_bull`. The keys do not match, so a tenth of the score
has never fired. Reproducing that is the whole job — this is a test of the score
that exists, not of the score that was intended.

## As of when

The live scanner runs during the session and reads today's partial daily bar as
`iloc[-1]`. A selector that did that here would be reading the future: the bar it
would use is the bar of the session being traded. So the as-of bar is **the last
FULLY CLOSED daily bar before the session**, and the two fetch windows are the
same 100 and 190 calendar days the live code asks for, ending on that bar. The
score for a Monday session is a function of Friday's close and everything before
it, and is knowable at 09:30 on the Monday.

`tests/test_kai_score.py` runs the poisoned-future and amputated-future attacks:
overwrite every bar from the session onwards with garbage, or delete them, and
the score must not move by one point.
"""

from __future__ import annotations

import numpy as np

from engine.kai_score import cca
from engine.kai_score import config as kcfg

COMPONENTS = ("st", "squeeze", "swing", "ema", "confluence", "vol", "rsi",
              "w52", "resistance", "bb")


def _to_dt64(days: np.ndarray) -> np.ndarray:
    """yyyymmdd integers to real dates, because the live fetch window is stated
    in CALENDAR days and a trading-day count is not the same window."""
    s = np.asarray(days, dtype="int64")
    return np.array([f"{a // 10000:04d}-{(a // 100) % 100:02d}-{a % 100:02d}"
                     for a in s], dtype="datetime64[D]")


def _windows(arr: np.ndarray, asof_idx: np.ndarray, start_idx: np.ndarray,
             width: int) -> np.ndarray:
    """Right-aligned windows as rows, NaN where a window is shorter than
    `width`. Column `width-1` is always the as-of bar."""
    off = (width - 1) - np.arange(width)
    idx = asof_idx[:, None] - off[None, :]
    ok = (idx >= start_idx[:, None]) & (idx >= 0)
    gathered = arr[np.clip(idx, 0, len(arr) - 1)]
    return np.where(ok, gathered, np.nan)


def _resistance_scores(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                       rows: np.ndarray) -> np.ndarray:
    """`AlertBase.calculate_resistance_proximity` over the last 60 bars.

    `find_support_resistance` slices `closes[-60:]` out of whatever frame it is
    given and detects 3-bar fractals inside it, so the answer depends on the last
    60 bars and nothing else. The clustering is order-dependent (a cluster's
    centre moves as it absorbs members) and the tie-break is Python's stable
    sort, so this is done the same way the reference does it rather than
    vectorised into something that would be almost the same.
    """
    out = np.zeros(len(high), dtype="int64")
    for i in rows:
        # `find_support_resistance` slices `[-60:]` off whatever frame it is
        # given, so a window with fewer than 60 bars is scanned whole. Padding
        # is never part of it.
        n_valid = int(np.isfinite(close[i]).sum())
        span = min(60, n_valid)
        h = high[i, -span:]
        lo = low[i, -span:]
        c = close[i, -span:]
        pivots = []
        for k in range(3, span - 3):
            if h[k] == h[k - 3:k + 4].max():
                pivots.append((h[k], k, "high"))
            if lo[k] == lo[k - 3:k + 4].min():
                pivots.append((lo[k], k, "low"))
        if not pivots:
            out[i] = 5                      # no levels -> the "clear runway" score
            continue
        # sorted by price; Python's sort is stable, so pivots at equal prices
        # keep the order the fractal scan produced them in, high before low
        raw = sorted(pivots, key=lambda x: x[0])
        current = float(c[-1])
        # only the six strongest clusters survive upstream, and the nearest
        # resistance is chosen from those six — not from all of them
        levels = _clusters(raw, current, span)
        res = [lv for lv in levels if lv[1] == "resistance" and lv[0] > current * 1.005]
        if not res:
            out[i] = 5
            continue
        nearest = min(res, key=lambda lv: lv[0])
        dist = (nearest[0] / current - 1) * 100
        out[i] = -5 if dist < 2 else 0 if dist < 5 else 5 if dist < 10 else 8
    return out


def _clusters(raw: list[tuple[float, int, str]], current: float, span: int):
    """The reference's cluster -> KeyLevel -> sort -> `[:6]` pipeline."""
    used = [False] * len(raw)
    levels = []
    for a in range(len(raw)):
        if used[a]:
            continue
        prices = [raw[a][0]]
        idxs = [raw[a][1]]
        types = [raw[a][2]]
        used[a] = True
        for b in range(a + 1, len(raw)):
            if used[b]:
                continue
            m = sum(prices) / len(prices)
            if abs(raw[b][0] - m) / m < 0.015:
                prices.append(raw[b][0])
                idxs.append(raw[b][1])
                types.append(raw[b][2])
                used[b] = True
        if len(prices) < 2:
            continue
        avg = sum(prices) / len(prices)
        if avg < current * 0.99:
            ltype = "support"
        elif avg > current * 1.01:
            ltype = "resistance"
        else:
            ltype = "support" if "low" in types else "resistance"
        levels.append((round(float(avg), 2), ltype, min(5, len(prices)),
                       span - 1 - max(idxs)))
    levels.sort(key=lambda lv: (-lv[2], lv[3]))
    return levels[:6]


def score_symbol(book, sym: str, sessions: np.ndarray) -> dict | None:
    """Score one ticker for every session in `sessions` (yyyymmdd, ascending).

    Returns arrays aligned to the sessions that had an as-of bar at all.
    """
    day = book.day.get(sym)
    if day is None or len(day) < kcfg.MIN_BARS:
        return None
    asof_idx = np.searchsorted(day, sessions, side="left") - 1
    keep = asof_idx >= 0
    sessions, asof_idx = sessions[keep], asof_idx[keep]
    if len(sessions) == 0:
        return None

    dts = _to_dt64(day)
    asof_dt = dts[asof_idx]
    start90 = np.searchsorted(
        dts, asof_dt - np.timedelta64(kcfg.PREFILTER_LOOKBACK_CALENDAR_DAYS, "D"),
        side="left")
    start180 = np.searchsorted(
        dts, asof_dt - np.timedelta64(kcfg.SCORE_LOOKBACK_CALENDAR_DAYS, "D"),
        side="left")

    n90 = asof_idx - start90 + 1
    n180 = asof_idx - start180 + 1
    w90 = int(n90.max())
    w180 = int(n180.max())

    scale = book.factor[sym][asof_idx][:, None]        # into as-of-date money

    def px(arr, starts, width):
        return _windows(arr, asof_idx, starts, width) * scale

    def vol(starts, width):
        return _windows(book.volume[sym], asof_idx, starts, width) / scale

    # --- stage 1: the prefilter, on the 100-calendar-day fetch ---------------
    o9 = px(book.open[sym], start90, w90)
    h9 = px(book.high[sym], start90, w90)
    l9 = px(book.low[sym], start90, w90)
    c9 = px(book.close[sym], start90, w90)
    v9 = vol(start90, w90)

    price = c9[:, -1]
    avg_vol20 = np.nanmean(v9[:, -20:], axis=1)
    tc9 = cca.trend_clouds(o9, h9, l9, c9)
    k = kcfg.FRESH_SIGNAL_BARS
    has_buy = tc9["st_buy_signal"][:, -k:].any(axis=1)
    has_sell = tc9["st_sell_signal"][:, -k:].any(axis=1)

    candidate = ((n90 >= kcfg.MIN_BARS) & (price >= kcfg.MIN_PRICE)
                 & (avg_vol20 >= kcfg.MIN_AVG_VOLUME) & (has_buy | has_sell))
    bullish = has_buy                       # BUY wins when both fired

    rows = np.flatnonzero(candidate)
    score = np.full(len(sessions), -1, dtype="int64")
    comps = {k2: np.zeros(len(sessions), dtype="int64") for k2 in COMPONENTS}
    rsi_out = np.full(len(sessions), np.nan)
    volr_out = np.full(len(sessions), np.nan)
    if len(rows) == 0:
        return {"session": sessions, "asof": day[asof_idx], "candidate": candidate,
                "bullish": bullish, "score": score, "components": comps,
                "rsi": rsi_out, "vol_ratio": volr_out}

    # --- stage 2: the score, on the 190-calendar-day fetch -------------------
    o = px(book.open[sym], start180, w180)
    h = px(book.high[sym], start180, w180)
    lo_ = px(book.low[sym], start180, w180)
    c = px(book.close[sym], start180, w180)
    v = vol(start180, w180)

    tc = cca.trend_clouds(o, h, lo_, c)
    sw = cca.swing_oscillator(h, lo_, c)
    phase = cca.squeeze_momentum(h, lo_, c)

    bull = bullish
    with np.errstate(invalid="ignore"):
        # 1. trend clouds
        buy2 = tc["st_buy_signal"][:, -2:].any(axis=1)
        buy5 = tc["st_buy_signal"][:, -5:].any(axis=1)
        sell2 = tc["st_sell_signal"][:, -2:].any(axis=1)
        sell5 = tc["st_sell_signal"][:, -5:].any(axis=1)
        trend_last = tc["st_trend"][:, -1]
        st = np.where(bull,
                      np.where(buy2, 20, np.where(buy5, 12,
                                                  np.where(trend_last == 1, 5, 0))),
                      np.where(sell2, 20, np.where(sell5, 12, 0)))

        # 2. squeeze phase
        pl = phase[:, -1]
        prev = phase[:, -10:-5]
        prev_bear = ((prev == cca.STRONG_BEAR) | (prev == cca.WEAK_BEAR)).any(axis=1)
        prev_bull = ((prev == cca.STRONG_BULL) | (prev == cca.WEAK_BULL)).any(axis=1)
        is_bull_phase = (pl == cca.WEAK_BULL) | (pl == cca.STRONG_BULL)
        is_bear_phase = (pl == cca.WEAK_BEAR) | (pl == cca.STRONG_BEAR)
        sq = np.where(
            bull,
            np.where(is_bull_phase & prev_bear, 20,
                     np.where(is_bull_phase, 10,
                              np.where(pl == cca.WEAK_BEAR, 6, 0))),
            np.where(is_bear_phase & prev_bull, 20, np.where(is_bear_phase, 10, 0)))

        # 3. swing oscillator
        sv = sw["swing"][:, -1]
        ss = sw["swing_signal"][:, -1]
        cu = sw["swing_cross_up"][:, -1]
        cd = sw["swing_cross_dn"][:, -1]
        swing = np.where(
            bull,
            np.where(cu & (sv < -10), 15, np.where(cu, 10, np.where(sv > ss, 4, 0))),
            np.where(cd & (sv > 30), 15, np.where(cd, 10, 0)))

        # 4. EMA cloud — dead upstream, and dead here
        ema = np.zeros(len(sessions), dtype="int64")

        # 5. confluence
        cnt = (st > 10).astype("int64") + (sq > 10) + (swing > 8)
        conf = np.where(cnt >= 3, 10, np.where(cnt >= 2, 5, 0))

        # 6. volume surge
        avg20 = np.nanmean(v[:, -20:], axis=1)
        ratio = np.where(avg20 > 0, v[:, -1] / np.where(avg20 > 0, avg20, 1.0), 1.0)
        volsc = np.where(ratio >= 2.0, 12, np.where(ratio >= 1.5, 8,
                                                    np.where(ratio >= 1.2, 4, 0)))

        # 7. RSI
        rsi = cca.wilder_rsi_last(c)
        rsi_sc = np.where(
            bull,
            np.where((rsi >= 50) & (rsi <= 70), 10,
                     np.where((rsi >= 40) & (rsi < 50), 5,
                              np.where(rsi > 80, -3, 0))),
            np.where((rsi >= 30) & (rsi <= 50), 10, np.where(rsi < 20, -3, 0)))

        # 8. 52-week proximity, over the ~180-calendar-day fetch
        hi_w = np.nanmax(h, axis=1)
        lo_w = np.nanmin(lo_, axis=1)
        p = c[:, -1]
        dist_hi = np.where(p > 0, (hi_w / np.where(p > 0, p, 1.0) - 1) * 100, 100.0)
        dist_lo = np.where(lo_w > 0, (p / np.where(lo_w > 0, lo_w, 1.0) - 1) * 100, 100.0)
        w52 = np.where(
            bull,
            np.where(dist_hi < 5, 8, np.where(dist_hi < 10, 5,
                                              np.where(dist_hi < 20, 3, 0))),
            np.where(dist_lo < 5, 8, np.where(dist_lo < 10, 5, 0)))

        # 10. Bollinger position
        bbp = cca.bollinger_pct_last(c)
        bb = np.where(bull, np.where(bbp > 1.0, 7, np.where(bbp > 0.5, 4, 0)),
                      np.where(bbp < 0, 7, np.where(bbp < 0.5, 4, 0)))

    # 9. resistance room
    res = _resistance_scores(h, lo_, c, rows)

    total = (st + sq + swing + ema + conf + volsc + rsi_sc + w52 + res + bb)
    total = np.clip(total, 0, 100)

    for name, arr in (("st", st), ("squeeze", sq), ("swing", swing), ("ema", ema),
                      ("confluence", conf), ("vol", volsc), ("rsi", rsi_sc),
                      ("w52", w52), ("resistance", res), ("bb", bb)):
        comps[name][rows] = np.asarray(arr, dtype="int64")[rows]
    score[rows] = total[rows]
    rsi_out[rows] = rsi[rows]
    volr_out[rows] = ratio[rows]

    return {"session": sessions, "asof": day[asof_idx], "candidate": candidate,
            "bullish": bullish, "score": score, "components": comps,
            "rsi": rsi_out, "vol_ratio": volr_out}
