"""The live scanner's own code, copied here so the port can be tested against it.

Every function below is a VERBATIM copy of production code from
`~/breakout-alert-system`, taken 2026-08-29. It is slow, it is pandas, and it is
not used by the backtest — `engine/kai_score/cca.py` and `score.py` are the fast
port that runs, and `tests/test_kai_score.py` requires the two to agree on real
bars. Copying rather than importing is deliberate: the other repository is not a
dependency of this one, it changes without notice, and a fidelity test that
silently starts passing against a moved target is not a test.

Provenance, file by file:

* `cheatcode_engine.py` — `_ema`, `_rma`, `_stdev`, `_lsma`, `_true_range`,
  `_highest`, `_lowest`, `supertrend`, `swing_oscillator`, `squeeze_momentum`,
  `ema_cloud`
* `alert_base.py` — `calculate_rsi`, `calculate_bollinger`,
  `calculate_resistance_proximity` (the body of it; the `try/except` wrapper is
  reproduced in `score_cheatcode_reference`)
* `pattern_engine.py` — `detect_swing_points`, `find_support_resistance`
* `cheatcode_scanner.py` — `prefilter_reference`, `score_cheatcode_reference`

**Naming.** The upstream function is called `supertrend`. In this codebase the
indicator is **CheatCode Trend Clouds** and it is called that everywhere except
inside this file, where the upstream name is preserved because the whole point
of the file is that it is a copy. Nothing outside this module uses the old name.

**Two defects are preserved on purpose**, because reproducing the score means
reproducing the score that actually runs:

1. `ema_cloud` writes `ema_fast_bullish` / `ema_slow_bullish`; the scorer reads
   `ema_fast_bull` / `ema_slow_bull`. Those keys are not in the frame, so the
   EMA-cloud component of the score is **always zero**. Component 4 of ten is
   dead code in production and it is dead here.
2. `CheatCodeScanner` calls `engine.supertrend(...)` on a `CheatCodeEngine`
   instance, and that class has no such method — the indicators are module-level
   functions. Every call raises `AttributeError` inside the scanner's own
   `try/except`, so `CheatCodeScanner.scan_market()` returns nothing at all as
   the code stands today. `prefilter_reference` and `score_cheatcode_reference`
   below call the module-level functions, i.e. they compute the score the
   scanner was WRITTEN to compute rather than the empty list it currently
   returns. That choice is stated in the report.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# cheatcode_engine.py — indicator primitives, verbatim


def _ema(series: pd.Series, length: int) -> pd.Series:
    """ta.ema — alpha = 2/(length+1)"""
    return series.ewm(span=length, adjust=False).mean()


def _rma(series: pd.Series, length: int) -> pd.Series:
    """ta.rma — Wilder's smoothing, alpha = 1/length"""
    return series.ewm(alpha=1.0 / length, adjust=False).mean()


def _sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length, min_periods=length).mean()


def _stdev(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length, min_periods=length).std(ddof=0)


def _lsma(series: pd.Series, length: int) -> pd.Series:
    """ta.linreg(series, length, 0) — linear regression value (LSMA)"""
    result = pd.Series(np.nan, index=series.index)
    values = series.values
    for i in range(length - 1, len(values)):
        window = values[i - length + 1: i + 1]
        if np.any(np.isnan(window)):
            continue
        x = np.arange(length, dtype=float)
        slope = (length * np.sum(x * window) - np.sum(x) * np.sum(window)) / \
                (length * np.sum(x * x) - np.sum(x) ** 2)
        intercept = (np.sum(window) - slope * np.sum(x)) / length
        result.iloc[i] = intercept + slope * (length - 1)
    return result


def _true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


def _highest(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length, min_periods=1).max()


def _lowest(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(window=length, min_periods=1).min()


def supertrend(df: pd.DataFrame, period: int = 20, multiplier: float = 1.5,
               sensitivity: str = 'Medium') -> pd.DataFrame:
    """CCA V5 trend clouds — LSMA source, EMA-based ATR, ratcheting bands.

    Verbatim from `cheatcode_engine.supertrend`. The name is the upstream one;
    the indicator is CheatCode Trend Clouds.
    """
    close = df['Close']
    high = df['High']
    low = df['Low']

    if sensitivity == 'Medium':
        src = _lsma(close, 12)
    elif sensitivity == 'High':
        ohlc4 = (df['Open'] + high + low + close) / 4
        half_len = max(int(10 / 2), 1)
        sqrt_len = max(int(math.sqrt(10)), 1)
        wma1 = close.rolling(half_len).apply(
            lambda x: np.average(x, weights=np.arange(1, len(x) + 1)), raw=True)
        wma2 = ohlc4.rolling(10).apply(
            lambda x: np.average(x, weights=np.arange(1, len(x) + 1)), raw=True)
        src = (2 * wma1 - wma2).rolling(sqrt_len).apply(
            lambda x: np.average(x, weights=np.arange(1, len(x) + 1)), raw=True)
    else:
        src = close.copy()

    tr = _true_range(high, low, close)
    atr_ema = _ema(tr, period)

    n = len(df)
    up_band = np.full(n, np.nan)
    dn_band = np.full(n, np.nan)
    trend = np.ones(n, dtype=int)
    st_line = np.full(n, np.nan)

    src_vals = src.values
    close_vals = close.values
    atr_vals = atr_ema.values

    for i in range(1, n):
        if np.isnan(src_vals[i]) or np.isnan(atr_vals[i]):
            up_band[i] = up_band[i - 1] if not np.isnan(up_band[i - 1]) else 0
            dn_band[i] = dn_band[i - 1] if not np.isnan(dn_band[i - 1]) else 0
            trend[i] = trend[i - 1]
            continue

        up = src_vals[i] - multiplier * atr_vals[i]
        dn = src_vals[i] + multiplier * atr_vals[i]

        up1 = up_band[i - 1] if not np.isnan(up_band[i - 1]) else up
        dn1 = dn_band[i - 1] if not np.isnan(dn_band[i - 1]) else dn

        up_band[i] = max(up, up1) if close_vals[i - 1] > up1 else up
        dn_band[i] = min(dn, dn1) if close_vals[i - 1] < dn1 else dn

        prev_trend = trend[i - 1]
        if prev_trend == -1 and close_vals[i] > dn1:
            trend[i] = 1
        elif prev_trend == 1 and close_vals[i] < up1:
            trend[i] = -1
        else:
            trend[i] = prev_trend

        st_line[i] = up_band[i] if trend[i] == 1 else dn_band[i]

    df = df.copy()
    df['st_trend'] = trend
    df['st_line'] = st_line
    df['st_up'] = up_band
    df['st_dn'] = dn_band

    buy = df['st_trend'] == 1
    sell = df['st_trend'] == -1
    df['st_buy_signal'] = buy & ~buy.shift(1, fill_value=False)
    df['st_sell_signal'] = sell & ~sell.shift(1, fill_value=False)

    return df


def swing_oscillator(df: pd.DataFrame, lookback: int = 3, smooth1: int = 20,
                     smooth2: int = 10, signal_length: int = 3,
                     ob_level: int = 40, os_level: int = -25) -> pd.DataFrame:
    close = df['Close']
    high = df['High']
    low = df['Low']

    hih = _highest(high, lookback)
    lil = _lowest(low, lookback)

    midpoint = 0.5 * (hih + lil)
    range_k = hih - lil

    numb = _rma(_rma(close - midpoint, smooth1), smooth2)
    denb = 0.5 * _rma(_rma(range_k, smooth1), smooth2)

    swing = 100 * numb / denb.replace(0, np.nan)
    signal = _rma(swing, signal_length)

    df = df.copy()
    df['swing'] = swing
    df['swing_signal'] = signal
    df['swing_ob'] = swing > ob_level
    df['swing_os'] = swing < os_level
    df['swing_cross_up'] = (swing > signal) & (swing.shift(1) <= signal.shift(1))
    df['swing_cross_dn'] = (swing < signal) & (swing.shift(1) >= signal.shift(1))

    return df


def squeeze_momentum(df: pd.DataFrame, lookback: int = 10,
                     signal_smooth: int = 3,
                     double_smooth: bool = True) -> pd.DataFrame:
    close = df['Close']
    high = df['High']
    low = df['Low']

    v2x = (high + low + close * 2) / 4

    v3x = _ema(v2x, lookback)
    v4x = _stdev(v2x, lookback)
    v5x = (v2x - v3x) * 100 / v4x.replace(0, 1)

    v6x = _ema(v5x, signal_smooth)
    v7x = _ema(v6x, signal_smooth) if double_smooth else v6x

    ww = (_ema(v7x, lookback) + 100) / 2 - 4

    df = df.copy()
    df['squeeze'] = ww
    df['squeeze_ob'] = ww > 100
    df['squeeze_os'] = ww < 0
    df['squeeze_bullish'] = (ww > 50) & (ww > ww.shift(1))
    df['squeeze_bearish'] = (ww < 50) & (ww < ww.shift(1))

    conditions = [
        (ww > 50) & (ww > ww.shift(1)),
        (ww > 50) & (ww <= ww.shift(1)),
        (ww <= 50) & (ww < ww.shift(1)),
        (ww <= 50) & (ww >= ww.shift(1)),
    ]
    choices = ['strong_bull', 'weak_bull', 'strong_bear', 'weak_bear']
    df['squeeze_phase'] = np.select(conditions, choices, default='neutral')

    return df


def ema_cloud(df: pd.DataFrame) -> pd.DataFrame:
    """NOTE the column names. The scorer reads `ema_fast_bull`, not
    `ema_fast_bullish`, so nothing the scorer does with this frame fires."""
    close = df['Close']
    df = df.copy()
    df['ema_5'] = _ema(close, 5)
    df['ema_12'] = _ema(close, 12)
    df['ema_34'] = _ema(close, 34)
    df['ema_50'] = _ema(close, 50)
    df['ema_fast_bullish'] = df['ema_5'] > df['ema_12']
    df['ema_slow_bullish'] = df['ema_34'] > df['ema_50']
    return df


# ---------------------------------------------------------------------------
# alert_base.py — the technical helpers, verbatim


def calculate_rsi(closes, period=14):
    """Wilder's RSI, seeded from the FIRST `period` deltas of whatever array it
    is handed. That is what makes it window-dependent."""
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    if avg_loss == 0:
        return 100.0
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def calculate_bollinger(closes, period=20, num_std=2):
    if len(closes) < period:
        return None, None, None, None
    sma = np.mean(closes[-period:])
    std = np.std(closes[-period:])
    upper = sma + num_std * std
    lower = sma - num_std * std
    bb_pct = (closes[-1] - lower) / (upper - lower) if (upper - lower) > 0 else 0.5
    return upper, sma, lower, round(bb_pct, 3)


# ---------------------------------------------------------------------------
# pattern_engine.py — pivots and S/R, verbatim


@dataclass
class KeyLevel:
    price: float
    level_type: str
    strength: int
    last_tested: int


def detect_swing_points(highs: np.ndarray, lows: np.ndarray, n: int = 5):
    points = []
    length = len(highs)
    for i in range(n, length - n):
        if highs[i] == max(highs[i - n:i + n + 1]):
            points.append((i, float(highs[i]), 'high'))
        if lows[i] == min(lows[i - n:i + n + 1]):
            points.append((i, float(lows[i]), 'low'))
    return points


def find_support_resistance(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray,
                            volumes=None, window: int = 60):
    data_len = len(closes)
    start = max(0, data_len - window)
    h = highs[start:]
    l = lows[start:]

    pivots = detect_swing_points(h, l, n=3)
    if not pivots:
        return []

    raw = [(p[1], p[0] + start, p[2]) for p in pivots]
    raw.sort(key=lambda x: x[0])

    clusters = []
    used = [False] * len(raw)
    for i in range(len(raw)):
        if used[i]:
            continue
        cluster_prices = [raw[i][0]]
        cluster_indices = [raw[i][1]]
        cluster_types = [raw[i][2]]
        used[i] = True
        for j in range(i + 1, len(raw)):
            if used[j]:
                continue
            if abs(raw[j][0] - np.mean(cluster_prices)) / np.mean(cluster_prices) < 0.015:
                cluster_prices.append(raw[j][0])
                cluster_indices.append(raw[j][1])
                cluster_types.append(raw[j][2])
                used[j] = True
        clusters.append((cluster_prices, cluster_indices, cluster_types))

    levels = []
    current_price = float(closes[-1])
    for prices, indices, types in clusters:
        avg_price = np.mean(prices)
        touch_count = len(prices)
        if touch_count < 2:
            continue
        last_tested = data_len - 1 - max(indices)
        if avg_price < current_price * 0.99:
            ltype = "support"
        elif avg_price > current_price * 1.01:
            ltype = "resistance"
        else:
            ltype = "support" if 'low' in types else "resistance"
        strength = min(5, touch_count)
        levels.append(KeyLevel(price=round(float(avg_price), 2), level_type=ltype,
                               strength=strength, last_tested=int(last_tested)))

    levels.sort(key=lambda lv: (-lv.strength, lv.last_tested))
    return levels[:6]


def calculate_resistance_proximity(hist: pd.DataFrame) -> dict:
    """`AlertBase.calculate_resistance_proximity`, verbatim."""
    try:
        current_price = float(hist['Close'].iloc[-1])
        levels = find_support_resistance(
            hist['High'].values, hist['Low'].values, hist['Close'].values
        )
        resistance_levels = [
            lv for lv in levels
            if lv.level_type == 'resistance' and lv.price > current_price * 1.005
        ]
        if not resistance_levels:
            return {'next_resistance': None, 'distance_pct': None, 'resistance_score': 5}

        nearest = min(resistance_levels, key=lambda lv: lv.price)
        distance_pct = (nearest.price / current_price - 1) * 100

        if distance_pct < 2:
            score = -5
        elif distance_pct < 5:
            score = 0
        elif distance_pct < 10:
            score = 5
        else:
            score = 8

        return {'next_resistance': round(nearest.price, 2),
                'distance_pct': round(distance_pct, 1),
                'resistance_score': score}
    except Exception:  # noqa: BLE001
        return {'next_resistance': None, 'distance_pct': None, 'resistance_score': 0}


# ---------------------------------------------------------------------------
# cheatcode_scanner.py — the two stages, verbatim in arithmetic


def prefilter_reference(hist: pd.DataFrame) -> dict | None:
    """`CheatCodeScanner.scan_market.prefilter`, given the 90-day frame it would
    have fetched. Returns None where the live one returns None."""
    if hist is None or hist.empty or len(hist) < 50:
        return None
    price = float(hist['Close'].iloc[-1])
    if price < 5:
        return None
    avg_vol = float(hist['Volume'].tail(20).mean())
    if avg_vol < 500_000:
        return None

    df = supertrend(hist.copy())
    recent = df.tail(3)

    has_buy = recent['st_buy_signal'].any() if 'st_buy_signal' in recent.columns else False
    has_sell = recent['st_sell_signal'].any() if 'st_sell_signal' in recent.columns else False

    if not has_buy and not has_sell:
        return None

    vol_ratio = float(hist['Volume'].iloc[-1]) / avg_vol if avg_vol > 0 else 1
    return {'close_price': price, 'signal_type': 'BUY' if has_buy else 'SELL',
            'avg_volume': avg_vol, 'volume_ratio': round(vol_ratio, 2)}


def score_cheatcode_reference(hist: pd.DataFrame, signal_type: str) -> dict | None:
    """`CheatCodeScanner.score_cheatcode`, given the 180-day frame it would have
    fetched and the `signal_type` the prefilter handed it.

    Verbatim arithmetic. The only edits are (a) the data fetch is replaced by the
    frame argument, (b) `engine.<indicator>` becomes the module-level function,
    because `CheatCodeEngine` does not define those methods and the live call
    therefore raises, and (c) the trade-management block, which contributes
    nothing to `breakout_score`, is dropped.
    """
    if hist is None or hist.empty or len(hist) < 50:
        return None

    df = supertrend(hist.copy())
    df = swing_oscillator(df)
    df = squeeze_momentum(df)
    df = ema_cloud(df)
    # reversal_bands is computed by the live scanner and read by nothing in the
    # score, so it is omitted here; it cannot change `breakout_score`.

    last = df.iloc[-1]
    recent = df.tail(5)
    closes = hist['Close'].values

    is_bullish = signal_type == 'BUY'

    # 1. trend-cloud signal (0-20)
    st_score = 0
    if is_bullish:
        if recent.tail(2)['st_buy_signal'].any() if 'st_buy_signal' in recent.columns else False:
            st_score = 20
        elif recent['st_buy_signal'].any() if 'st_buy_signal' in recent.columns else False:
            st_score = 12
        elif 'st_trend' in last and int(last['st_trend']) == 1:
            st_score = 5
    else:
        if recent.tail(2)['st_sell_signal'].any() if 'st_sell_signal' in recent.columns else False:
            st_score = 20
        elif recent['st_sell_signal'].any() if 'st_sell_signal' in recent.columns else False:
            st_score = 12

    # 2. squeeze momentum phase (0-20)
    squeeze_score = 0
    if 'squeeze_phase' in last:
        phase = str(last['squeeze_phase'])
        prev_phases = [str(df.iloc[i]['squeeze_phase']) for i in range(-10, -5)
                       if abs(i) <= len(df)]
        if is_bullish:
            if phase in ('weak_bull', 'strong_bull') and any('bear' in p for p in prev_phases):
                squeeze_score = 20
            elif phase in ('weak_bull', 'strong_bull'):
                squeeze_score = 10
            elif phase == 'weak_bear':
                squeeze_score = 6
        else:
            if phase in ('weak_bear', 'strong_bear') and any('bull' in p for p in prev_phases):
                squeeze_score = 20
            elif phase in ('weak_bear', 'strong_bear'):
                squeeze_score = 10

    # 3. swing oscillator (0-15)
    swing_score = 0
    if 'swing' in last and 'swing_signal' in last:
        swing_val = float(last['swing'])
        swing_sig = float(last['swing_signal'])
        if is_bullish:
            if 'swing_cross_up' in last and bool(last['swing_cross_up']) and swing_val < -10:
                swing_score = 15
            elif 'swing_cross_up' in last and bool(last['swing_cross_up']):
                swing_score = 10
            elif swing_val > swing_sig:
                swing_score = 4
        else:
            if 'swing_cross_dn' in last and bool(last['swing_cross_dn']) and swing_val > 30:
                swing_score = 15
            elif 'swing_cross_dn' in last and bool(last['swing_cross_dn']):
                swing_score = 10

    # 4. EMA cloud alignment (0-10) — DEAD. `ema_fast_bull` is not a column.
    ema_score = 0
    fast_bull = 'ema_fast_bull' in last and bool(last['ema_fast_bull'])
    slow_bull = 'ema_slow_bull' in last and bool(last['ema_slow_bull'])
    if is_bullish:
        if fast_bull and slow_bull:
            ema_score = 10
        elif fast_bull:
            ema_score = 5

    # 5. multi-indicator confluence (0-10)
    bullish_count = sum([st_score > 10, squeeze_score > 10, swing_score > 8])
    if bullish_count >= 3:
        confluence_score = 10
    elif bullish_count >= 2:
        confluence_score = 5
    else:
        confluence_score = 0

    # 6. volume surge (0-12)
    avg_vol = float(hist['Volume'].tail(20).mean())
    last_vol = float(hist['Volume'].iloc[-1])
    vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1
    if vol_ratio >= 2.0:
        vol_score = 12
    elif vol_ratio >= 1.5:
        vol_score = 8
    elif vol_ratio >= 1.2:
        vol_score = 4
    else:
        vol_score = 0

    # 7. RSI confirmation (-3 to +10)
    rsi = calculate_rsi(closes)
    if is_bullish:
        if 50 <= rsi <= 70:
            rsi_score = 10
        elif 40 <= rsi < 50:
            rsi_score = 5
        elif rsi > 80:
            rsi_score = -3
        else:
            rsi_score = 0
    else:
        if 30 <= rsi <= 50:
            rsi_score = 10
        elif rsi < 20:
            rsi_score = -3
        else:
            rsi_score = 0

    # 8. 52W proximity (0-8) — over the fetched window, which is ~180 calendar days
    high_52w = float(hist['High'].max())
    low_52w = float(hist['Low'].min())
    price = float(closes[-1])
    if is_bullish:
        dist_from_high = (high_52w / price - 1) * 100 if price > 0 else 100
        if dist_from_high < 5:
            w52_score = 8
        elif dist_from_high < 10:
            w52_score = 5
        elif dist_from_high < 20:
            w52_score = 3
        else:
            w52_score = 0
    else:
        dist_from_low = (price / low_52w - 1) * 100 if low_52w > 0 else 100
        if dist_from_low < 5:
            w52_score = 8
        elif dist_from_low < 10:
            w52_score = 5
        else:
            w52_score = 0

    # 9. resistance room (-5 to +8)
    res_data = calculate_resistance_proximity(hist)
    resistance_score = res_data['resistance_score']

    # 10. Bollinger position (0-7)
    upper, mid, lower, bb_pct = calculate_bollinger(closes)
    bb_score = 0
    if bb_pct is not None:
        if is_bullish:
            if bb_pct > 1.0:
                bb_score = 7
            elif bb_pct > 0.5:
                bb_score = 4
        else:
            if bb_pct < 0:
                bb_score = 7
            elif bb_pct < 0.5:
                bb_score = 4

    total = (st_score + squeeze_score + swing_score + ema_score +
             confluence_score + vol_score + rsi_score + w52_score +
             resistance_score + bb_score)
    total = max(0, min(100, total))

    return {
        'breakout_score': total,
        'components': {
            'st': st_score, 'squeeze': squeeze_score, 'swing': swing_score,
            'ema': ema_score, 'confluence': confluence_score, 'vol': vol_score,
            'rsi': rsi_score, 'w52': w52_score, 'resistance': resistance_score,
            'bb': bb_score,
        },
        'rsi': rsi, 'vol_ratio': vol_ratio, 'bb_pct': bb_pct,
        'signal_type': signal_type,
    }
