"""The CCA V5 indicators the Kai score is built from, computed one window at a
time — but every window at once.

**This is CheatCode Trend Clouds.** The upstream function is called
`supertrend`; that word appears in this package exactly once, inside the
verbatim copy in `reference_cca.py`, and nowhere else.

## Why the shape of this file is what it is

The live scanner fetches ~190 calendar days of daily bars for one ticker and
runs pandas over them. Everything it computes is RECURSIVE — LSMA-sourced trend
clouds with ratcheting bands, Wilder-smoothed swing, EMA-smoothed squeeze,
Wilder RSI seeded from the first fourteen deltas *of that fetch* — so the answer
genuinely depends on where the window starts. Computing the indicators once over
a ticker's whole history and reading off the last bar is NOT the same number,
and this lane is a test of Kai's actual score, not of a better-conditioned
relative of it.

Recomputing a 130-bar window for every ticker-day is also 100 million-odd
iterations of a Python loop.

So: for one ticker, stack every as-of date's window as a row of a
`(n_asof, W)` matrix, left-padded with NaN where a window is shorter than `W`,
and run each recursion as a loop over the 130 COLUMNS with numpy doing all the
as-of dates at once. The arithmetic is identical to the reference, bar for bar,
including the NaN branches — `tests/test_kai_score.py` asserts it on real bars.

The NaN padding is not a trick: the reference's own window begins with 11 bars
whose LSMA is NaN, and its loop's NaN branch (bands to 0.0, trend carried) is
reproduced here exactly. A longer NaN prefix behaves the same way.

## NaN semantics

`ewm(adjust=False)` in pandas skips a leading NaN block and starts the recursion
at the first valid observation. That is what `_ema2` and `_rma2` do. An INTERIOR
NaN — which in this data can only come from `denb` being exactly zero, i.e. a
stock whose high equalled its low for three sessions running — freezes the state
and emits NaN, which is close to but not exactly pandas' behaviour. Occurrences
are counted in `nan_interior_count` so the report can say how many there were
rather than assuming none.
"""

from __future__ import annotations

import numpy as np

NEUTRAL, STRONG_BULL, WEAK_BULL, STRONG_BEAR, WEAK_BEAR = 0, 1, 2, 3, 4
PHASE_NAMES = {NEUTRAL: "neutral", STRONG_BULL: "strong_bull",
               WEAK_BULL: "weak_bull", STRONG_BEAR: "strong_bear",
               WEAK_BEAR: "weak_bear"}

# counted rather than assumed away; see the module docstring
nan_interior_count = 0


def _first_valid(x: np.ndarray) -> np.ndarray:
    """Column index of the first non-NaN entry in each row (W if the row is all
    NaN)."""
    ok = np.isfinite(x)
    n, w = x.shape
    idx = np.where(ok.any(axis=1), ok.argmax(axis=1), w)
    return idx


def _ema2(x: np.ndarray, span: int) -> np.ndarray:
    """`pd.Series.ewm(span=span, adjust=False).mean()`, row-wise."""
    return _recursive_smooth(x, 2.0 / (span + 1.0))


def _rma2(x: np.ndarray, length: int) -> np.ndarray:
    """`pd.Series.ewm(alpha=1/length, adjust=False).mean()`, row-wise."""
    return _recursive_smooth(x, 1.0 / length)


def _recursive_smooth(x: np.ndarray, alpha: float) -> np.ndarray:
    global nan_interior_count
    n, w = x.shape
    out = np.full((n, w), np.nan)
    state = np.full(n, np.nan)
    started = np.zeros(n, dtype=bool)
    for j in range(w):
        col = x[:, j]
        ok = np.isfinite(col)
        seed = ok & ~started
        if seed.any():
            state[seed] = col[seed]
            started[seed] = True
        step = ok & started & ~seed
        if step.any():
            state[step] = state[step] + alpha * (col[step] - state[step])
        emit = started & ok
        out[emit, j] = state[emit]
        gap = started & ~ok
        if gap.any():
            nan_interior_count += int(gap.sum())
    return out


def _lsma2(x: np.ndarray, length: int = 12) -> np.ndarray:
    """`ta.linreg(x, length, 0)`, row-wise, as the fixed linear filter it is.

    The reference builds the same number by least squares inside a Python loop
    and emits NaN whenever the window is short or contains a NaN; both are
    reproduced.
    """
    j = np.arange(length, dtype=float)
    sx = j.sum()
    sxx = (j * j).sum()
    denom = length * sxx - sx * sx
    w = 1.0 / length + ((length - 1) / 2.0) * (length * j - sx) / denom
    n, W = x.shape
    out = np.full((n, W), np.nan)
    for i in range(length - 1, W):
        block = x[:, i - length + 1: i + 1]
        good = np.isfinite(block).all(axis=1)
        if good.any():
            out[good, i] = block[good] @ w
    return out


def _true_range2(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> np.ndarray:
    """`ta.tr`: the row's first valid bar has no prior close, and pandas' max
    over a row of NaNs-and-one-number returns the number, so the first bar is
    high-low."""
    prev = np.full_like(close, np.nan)
    prev[:, 1:] = close[:, :-1]
    a = high - low
    b = np.abs(high - prev)
    c = np.abs(low - prev)
    # fmax, not nanmax: pandas' row-wise max skips NaN, and fmax does the same
    # pairwise without warning on an all-NaN pad.
    out = np.fmax(np.fmax(a, b), c)
    out[~np.isfinite(a)] = np.nan
    return out


def _roll_extreme2(x: np.ndarray, length: int, how: str) -> np.ndarray:
    """`rolling(length, min_periods=1).max()/.min()`, row-wise, NaN-skipping."""
    n, w = x.shape
    out = x.copy()
    f = np.fmax if how == "max" else np.fmin
    for k in range(1, length):
        s = np.full((n, w), np.nan)
        s[:, k:] = x[:, :-k]
        out = f(out, s)
    return out


def _stdev2(x: np.ndarray, length: int) -> np.ndarray:
    """`rolling(length, min_periods=length).std(ddof=0)`, row-wise."""
    n, w = x.shape
    out = np.full((n, w), np.nan)
    for i in range(length - 1, w):
        block = x[:, i - length + 1: i + 1]
        good = np.isfinite(block).all(axis=1)
        if good.any():
            m = block[good].mean(axis=1, keepdims=True)
            out[good, i] = np.sqrt(((block[good] - m) ** 2).mean(axis=1))
    return out


def _sma2(x: np.ndarray, length: int) -> np.ndarray:
    n, w = x.shape
    out = np.full((n, w), np.nan)
    for i in range(length - 1, w):
        block = x[:, i - length + 1: i + 1]
        good = np.isfinite(block).all(axis=1)
        if good.any():
            out[good, i] = block[good].mean(axis=1)
    return out


# ---------------------------------------------------------------------------
# CheatCode Trend Clouds


def trend_clouds(open_: np.ndarray, high: np.ndarray, low: np.ndarray,
                 close: np.ndarray, period: int = 20,
                 multiplier: float = 1.5) -> dict:
    """CheatCode Trend Clouds — LSMA(12) source, EMA(20) of true range, bands
    that ratchet, and a trend that flips when price closes through the far band.

    Returns `st_trend`, `st_buy_signal`, `st_sell_signal`, each `(n_asof, W)`.
    """
    src = _lsma2(close, 12)
    tr = _true_range2(high, low, close)
    atr = _ema2(tr, period)

    n, w = close.shape
    up_band = np.full((n, w), np.nan)
    dn_band = np.full((n, w), np.nan)
    trend = np.ones((n, w), dtype=np.int8)

    for i in range(1, w):
        bad = ~np.isfinite(src[:, i]) | ~np.isfinite(atr[:, i])
        prev_up, prev_dn = up_band[:, i - 1], dn_band[:, i - 1]
        # the NaN branch: carry the band, or 0.0 if there is nothing to carry
        up_band[bad, i] = np.where(np.isfinite(prev_up[bad]), prev_up[bad], 0.0)
        dn_band[bad, i] = np.where(np.isfinite(prev_dn[bad]), prev_dn[bad], 0.0)
        trend[bad, i] = trend[bad, i - 1]

        g = ~bad
        if not g.any():
            continue
        up = src[g, i] - multiplier * atr[g, i]
        dn = src[g, i] + multiplier * atr[g, i]
        up1 = np.where(np.isfinite(prev_up[g]), prev_up[g], up)
        dn1 = np.where(np.isfinite(prev_dn[g]), prev_dn[g], dn)
        c_prev = close[g, i - 1]
        up_band[g, i] = np.where(c_prev > up1, np.maximum(up, up1), up)
        dn_band[g, i] = np.where(c_prev < dn1, np.minimum(dn, dn1), dn)

        pt = trend[g, i - 1]
        c_now = close[g, i]
        t = pt.copy()
        t[(pt == -1) & (c_now > dn1)] = 1
        t[(pt == 1) & (c_now < up1)] = -1
        trend[g, i] = t

    buy = trend == 1
    sell = trend == -1
    prev_buy = np.zeros_like(buy)
    prev_buy[:, 1:] = buy[:, :-1]
    prev_sell = np.zeros_like(sell)
    prev_sell[:, 1:] = sell[:, :-1]
    return {"st_trend": trend,
            "st_buy_signal": buy & ~prev_buy,
            "st_sell_signal": sell & ~prev_sell}


# ---------------------------------------------------------------------------
# CCA Swing Oscillator


def swing_oscillator(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                     lookback: int = 3, smooth1: int = 20, smooth2: int = 10,
                     signal_length: int = 3) -> dict:
    hih = _roll_extreme2(high, lookback, "max")
    lil = _roll_extreme2(low, lookback, "min")
    numb = _rma2(_rma2(close - 0.5 * (hih + lil), smooth1), smooth2)
    denb = 0.5 * _rma2(_rma2(hih - lil, smooth1), smooth2)
    denb = np.where(denb == 0.0, np.nan, denb)
    with np.errstate(invalid="ignore", divide="ignore"):
        swing = 100.0 * numb / denb
    signal = _rma2(swing, signal_length)

    prev_swing = np.full_like(swing, np.nan)
    prev_swing[:, 1:] = swing[:, :-1]
    prev_sig = np.full_like(signal, np.nan)
    prev_sig[:, 1:] = signal[:, :-1]
    with np.errstate(invalid="ignore"):
        cross_up = (swing > signal) & (prev_swing <= prev_sig)
        cross_dn = (swing < signal) & (prev_swing >= prev_sig)
    return {"swing": swing, "swing_signal": signal,
            "swing_cross_up": cross_up, "swing_cross_dn": cross_dn}


# ---------------------------------------------------------------------------
# CCA Squeeze Momentum


def squeeze_momentum(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                     lookback: int = 10, signal_smooth: int = 3) -> np.ndarray:
    """Returns the phase code per bar — see `PHASE_NAMES`."""
    v2x = (high + low + close * 2.0) / 4.0
    v3x = _ema2(v2x, lookback)
    v4x = _stdev2(v2x, lookback)
    v4x = np.where(v4x == 0.0, 1.0, v4x)      # `.replace(0, 1)`, not `0 -> NaN`
    with np.errstate(invalid="ignore", divide="ignore"):
        v5x = (v2x - v3x) * 100.0 / v4x
    v6x = _ema2(v5x, signal_smooth)
    v7x = _ema2(v6x, signal_smooth)
    ww = (_ema2(v7x, lookback) + 100.0) / 2.0 - 4.0

    prev = np.full_like(ww, np.nan)
    prev[:, 1:] = ww[:, :-1]
    with np.errstate(invalid="ignore"):
        c1 = (ww > 50) & (ww > prev)
        c2 = (ww > 50) & (ww <= prev)
        c3 = (ww <= 50) & (ww < prev)
        c4 = (ww <= 50) & (ww >= prev)
    phase = np.full(ww.shape, NEUTRAL, dtype=np.int8)
    phase[c4] = WEAK_BEAR
    phase[c3] = STRONG_BEAR
    phase[c2] = WEAK_BULL
    phase[c1] = STRONG_BULL
    return phase


# ---------------------------------------------------------------------------
# AlertBase helpers, row-wise


def wilder_rsi_last(close: np.ndarray, period: int = 14) -> np.ndarray:
    """`AlertBase.calculate_rsi(closes)` — the value at the END of each row.

    Seeded from the mean of the first `period` deltas OF THAT ROW, which is why
    it has to be done per window rather than once over the history. Returns
    `round(rsi, 1)`, and 100.0 where the reference short-circuits on a zero
    average loss.
    """
    n, w = close.shape
    d = close[:, 1:] - close[:, :-1]
    valid = np.isfinite(d)
    gains = np.where(valid & (d > 0), d, 0.0)
    losses = np.where(valid & (d < 0), -d, 0.0)

    seen = np.zeros(n, dtype=np.int64)          # valid deltas consumed so far
    sum_g = np.zeros(n)
    sum_l = np.zeros(n)
    ag = np.full(n, np.nan)
    al = np.full(n, np.nan)
    seeded = np.zeros(n, dtype=bool)
    zero_loss_at_seed = np.zeros(n, dtype=bool)

    for j in range(w - 1):
        ok = valid[:, j]
        if not ok.any():
            continue
        # a valid delta on an already-seeded row runs Wilder's recursion
        step = ok & seeded
        if step.any():
            ag[step] = (ag[step] * (period - 1) + gains[step, j]) / period
            al[step] = (al[step] * (period - 1) + losses[step, j]) / period
        # a valid delta on a row still seeding goes into the plain mean
        fill = ok & ~seeded
        if fill.any():
            sum_g[fill] += gains[fill, j]
            sum_l[fill] += losses[fill, j]
            seen[fill] += 1
            just = fill & (seen == period)
            if just.any():
                ag[just] = sum_g[just] / period
                al[just] = sum_l[just] / period
                seeded[just] = True
                zero_loss_at_seed[just] = al[just] == 0

    out = np.full(n, np.nan)
    done = seeded
    with np.errstate(invalid="ignore", divide="ignore"):
        rsi = 100.0 - (100.0 / (1.0 + ag / np.where(al == 0, np.nan, al)))
    out[done] = np.round(rsi[done], 1)
    # the reference short-circuits to 100.0 both at the seed and at the end
    out[done & (zero_loss_at_seed | (al == 0))] = 100.0
    return out


def bollinger_pct_last(close: np.ndarray, period: int = 20,
                       num_std: float = 2.0) -> np.ndarray:
    """`AlertBase.calculate_bollinger(closes)[3]` at the end of each row."""
    tail = close[:, -period:]
    m = tail.mean(axis=1)
    sd = tail.std(axis=1)             # np.std, population
    upper = m + num_std * sd
    lower = m - num_std * sd
    width = upper - lower
    pct = np.where(width > 0, (close[:, -1] - lower) / np.where(width > 0, width, 1.0), 0.5)
    return np.round(pct, 3)
