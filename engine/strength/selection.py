"""Two selections off one candidate pond, differing in one thing.

`baseline` is ENGINE-6's selector, reproduced: the top twenty of the day's
candidates by opening relative volume, floor 1.0. It is asserted against the
selection ENGINE-6 wrote to disk rather than assumed to match it.

`rank` is the owner's idea in its most faithful form. **The busy leg stays
hard**: the pond is the day's forty most abnormally active names — the top ~4%
of a ~985-name candidate list — and trend strength decides which twenty of those
are traded. Same count, same kind of name, different twenty. It is a
re-ordering of the busiest stocks, not a reduction of them, and not a licence to
reach down into quiet names because their daily chart looks nice.

Why forty and not twenty: a pond equal to the pick count makes re-ordering a
no-op — the same twenty names in a different order is the same twenty trades,
and the portfolio scales a day's positions together when the leverage cap binds,
so even that has no effect. Forty is the smallest pond in which the owner's
question can be answered at all. It is declared in `GATE.md` and not swept.

The ordering key is **directional strength**: the daily-chart strength signed by
the direction the opening range broke, so a name in a hard downtrend that breaks
DOWN ranks alongside a name in a hard uptrend that breaks UP. That is what "in
the direction of the orb" means.

Two kinds of name cannot be ranked on it, and both fall to the back of the pond
in relative-volume order rather than being dropped:

* **no direction** — the opening candle closed exactly where it opened. The
  model would skip it (`skip_doji_opening_candle`), so it is the last thing the
  ranking should reach for, but removing it outright would change the trade
  count and this arm is specified to hold the count.
* **no strength** — fewer than 30 closed daily bars, or no usable ATR. "Not
  measured" is not "neutral", so it does not get a zero and does not sort into
  the middle of the measured names.

Everything the selector reads is a 09:35 fact: relative volume over the previous
fourteen sessions' opening five minutes, the open and close of today's
09:30-09:35 bar, and daily bars through the prior close.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from engine.strength import config as tcfg


@dataclass(frozen=True)
class Pick:
    day: int
    symbol: str
    arm: str
    rank: int
    rvol: float
    strength: float          # NaN when the symbol has no measurable strength
    directional: float       # NaN when there is no strength or no direction
    side: str                # "long" | "short" | "none"


def select_day(day: int, symbols: list[str], rvol: np.ndarray,
               strength: np.ndarray, side: list[str],
               k: int = tcfg.TOP_K, pond_k: int = tcfg.POND_K,
               min_rvol: float = tcfg.MIN_RVOL) -> dict[str, list[Pick]]:
    """Both arms for one session, off one candidate list.

    `symbols`/`rvol`/`strength`/`side` are parallel over the day's candidates —
    pool names with an opening bar today and a full 14-session baseline, so a
    relative volume exists. `strength` is NaN where it could not be measured;
    `side` is "none" where the opening candle was a doji.
    """
    out: dict[str, list[Pick]] = {tcfg.ARM_BASELINE: [], tcfg.ARM_RANK: []}
    idx = [i for i in range(len(symbols)) if rvol[i] >= min_rvol]
    idx.sort(key=lambda i: (-rvol[i], symbols[i]))

    def _dir(i: int) -> float:
        if side[i] == "none" or not np.isfinite(strength[i]):
            return float("nan")
        return float(strength[i]) * (1.0 if side[i] == "long" else -1.0)

    def _pick(i: int, arm: str, r: int) -> Pick:
        return Pick(int(day), symbols[i], arm, r, float(rvol[i]),
                    float(strength[i]), _dir(i), side[i])

    for r, i in enumerate(idx[:k]):
        out[tcfg.ARM_BASELINE].append(_pick(i, tcfg.ARM_BASELINE, r + 1))

    # The pond, in relative-volume order, re-sorted by directional strength.
    # `rank_in_pond` is the tie-break of last resort, so an unrankable name
    # keeps the order the incumbent would have given it.
    pond = idx[:pond_k]
    keyed = []
    for pos, i in enumerate(pond):
        s = _dir(i)
        tier = 0 if np.isfinite(s) else 1
        keyed.append((tier, -s if tier == 0 else 0.0, pos, symbols[i], i))
    keyed.sort()
    for r, (_, _, _, _, i) in enumerate(keyed[:k]):
        out[tcfg.ARM_RANK].append(_pick(i, tcfg.ARM_RANK, r + 1))
    return out
