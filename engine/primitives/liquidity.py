"""Liquidity: the levels other people's stops sit under, and what happens when
they get taken.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

import numpy as np

from engine import config
from engine.primitives.session import rth_close_minute
from engine.primitives.structure import Swing, swing_points
from engine.series import BarView

BUYSIDE = "buyside"    # resting above price — highs
SELLSIDE = "sellside"  # resting below price — lows


class Level(NamedTuple):
    price: float
    side: Literal["buyside", "sellside"]
    label: str
    idx: int  # bar the level was established on, -1 if aggregate


def _prior_days(view: BarView, count: int) -> list[int]:
    """The `count` ET days before the current one, most recent last."""
    today = int(view.day[-1])
    days = np.unique(view.day[view.day != today])
    return [int(d) for d in days[-count:]] if len(days) else []


def prior_day_levels(view: BarView, rth_only: bool = True) -> list[Level]:
    """PDH / PDL from the previous session present in the cache."""
    prior = _prior_days(view, 1)
    if not prior:
        return []
    d = prior[0]
    sl = view.day_slice(d)
    if sl is None:
        return []
    m = view.minute[sl]
    if rth_only:
        keep = (m >= config.RTH_OPEN_MIN) & (m < rth_close_minute(d))
    else:
        keep = np.ones(len(m), dtype=bool)
    h, l = view.high[sl][keep], view.low[sl][keep]
    if len(h) == 0:
        return []
    return [
        Level(float(h.max()), BUYSIDE, "PDH", -1),
        Level(float(l.min()), SELLSIDE, "PDL", -1),
    ]


def prior_week_levels(view: BarView, days: int = 5) -> list[Level]:
    """PWH / PWL over the previous `days` completed sessions."""
    prior = _prior_days(view, days)
    if not prior:
        return []
    mask = np.isin(view.day, np.array(prior, dtype=view.day.dtype))
    h, l = view.high[mask], view.low[mask]
    if len(h) == 0:
        return []
    return [
        Level(float(h.max()), BUYSIDE, "PWH", -1),
        Level(float(l.min()), SELLSIDE, "PWL", -1),
    ]


def equal_levels(view: BarView, tolerance_bps: float = 5.0, lookback: int = 240,
                 left: int = 2, right: int = 2, min_count: int = 2) -> list[Level]:
    """Clusters of confirmed swing highs (or lows) within `tolerance_bps`.

    Equal highs are where stops pool. The level returned is the extreme of the
    cluster, which is the price that actually has to trade for them to fill.
    """
    swings = swing_points(view, left, right, lookback)
    out: list[Level] = []
    for kind, side, label in (("high", BUYSIDE, "EQH"), ("low", SELLSIDE, "EQL")):
        pts = [s for s in swings if s.kind == kind]
        used = [False] * len(pts)
        for a in range(len(pts)):
            if used[a]:
                continue
            group: list[Swing] = [pts[a]]
            for b in range(a + 1, len(pts)):
                if used[b]:
                    continue
                base = pts[a].price
                if base <= 0:
                    continue
                if abs(pts[b].price - base) / base * 10_000.0 <= tolerance_bps:
                    group.append(pts[b])
                    used[b] = True
            if len(group) >= min_count:
                used[a] = True
                price = max(g.price for g in group) if kind == "high" else min(g.price for g in group)
                out.append(Level(float(price), side, label, max(g.idx for g in group)))
    return out


class Sweep(NamedTuple):
    swept: bool
    side: str
    level: float
    extreme: float
    extreme_idx: int
    reclaimed: bool
    reclaim_idx: int
    bars_since_sweep: int


NO_SWEEP = Sweep(False, "", float("nan"), float("nan"), -1, False, -1, -1)


def sweep_state(view: BarView, level: float, side: str, lookback: int = 60,
                since_idx: int | None = None) -> Sweep:
    """Did price take `level`, and has it come back?

    A buyside sweep is a bar whose HIGH traded above `level`. It is *reclaimed*
    when a later bar CLOSES back below `level` — the stop-run failed. The
    reclaim is the tradeable event; the sweep alone is not.
    """
    n = view.n
    start = max(0, n - lookback) if since_idx is None else max(0, since_idx)
    if start >= n or not np.isfinite(level):
        return NO_SWEEP
    h, l, c = view.high[start:n], view.low[start:n], view.close[start:n]
    if side == BUYSIDE:
        beyond = np.flatnonzero(h > level)
    else:
        beyond = np.flatnonzero(l < level)
    if len(beyond) == 0:
        return NO_SWEEP
    first = int(beyond[0])
    seg_h, seg_l = h[first:], l[first:]
    if side == BUYSIDE:
        e = int(np.argmax(seg_h))
        extreme, extreme_idx = float(seg_h[e]), start + first + e
        back = np.flatnonzero(c[first:] < level)
    else:
        e = int(np.argmin(seg_l))
        extreme, extreme_idx = float(seg_l[e]), start + first + e
        back = np.flatnonzero(c[first:] > level)
    reclaimed = len(back) > 0
    reclaim_idx = start + first + int(back[0]) if reclaimed else -1
    return Sweep(True, side, float(level), extreme, extreme_idx,
                 reclaimed, reclaim_idx, n - 1 - (start + first))
