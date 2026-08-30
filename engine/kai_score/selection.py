"""Three selectors, one candidate pond, and nothing else different.

The candidate set for a session is the SAME for all three arms:

    the day's pool — the top 1,000 of the eligible universe by 20-day average
    dollar volume as of the prior close, exactly ENGINE-6's pool — narrowed to
    the names that have an opening five-minute bar today and a full 14-session
    baseline behind it, so a relative volume exists.

Everything after that is the ranking key, and the ranking key is the whole
experiment:

* **relvol** — top 20 by opening relative volume, floor 1.0. This is ENGINE-6's
  `select_day` reproduced, and on this window it returns the same names, which
  is asserted rather than assumed.
* **kai** — top 20 by Kai's breakout score among the candidates the live scanner
  would have scored at all: a fresh CheatCode Trend Clouds flip in the last three
  daily bars, price over $5, 20-day average volume over 500,000. A name with no
  fresh flip has no score, in production and here, so it cannot be picked. That
  is a property of the selector under test, not a handicap applied to it.
* **both** — among candidates that have a Kai score AND a relative volume of at
  least 1.0, rank by score and by relative volume separately and take the 20
  smallest rank sums. Parameter-free on purpose: any "top N by volume, then
  score" rule would need an N, and an N chosen by us is a third variable in a
  two-variable experiment.

Ties are broken by symbol everywhere, so the answer is a function of the data
and not of dictionary order.

**What the live scanner does that this does not**, both stated in the report:
it truncates the scored set to the 25 highest volume ratios before scoring (an
API budget, and applying it would smuggle relative volume into the `kai` arm),
and it drops anything under a score of 55 (a floor on how many alerts to send,
not a ranking rule).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from engine.kai_score import config as kcfg


@dataclass(frozen=True)
class Pick:
    day: int
    symbol: str
    arm: str
    rank: int
    rvol: float
    score: int
    bullish: bool


def _rank_desc(values: np.ndarray, symbols: list[str]) -> np.ndarray:
    """1 = highest. Ties broken by symbol so two runs agree."""
    order = sorted(range(len(values)), key=lambda i: (-values[i], symbols[i]))
    out = np.empty(len(values), dtype="int64")
    for r, i in enumerate(order):
        out[i] = r + 1
    return out


def select_day(day: int, symbols: list[str], rvol: np.ndarray,
               scored: np.ndarray, score: np.ndarray, bullish: np.ndarray,
               k: int = kcfg.TOP_K,
               min_rvol: float = kcfg.MIN_RVOL) -> dict[str, list[Pick]]:
    """All three arms for one session, off one candidate list.

    `symbols`/`rvol`/`scored`/`score`/`bullish` are parallel arrays over the
    candidates — pool names with a relative volume. `scored` says the live
    scanner would have produced a score for that name on that day.
    """
    out: dict[str, list[Pick]] = {a: [] for a in kcfg.ARMS}

    # --- relvol -------------------------------------------------------------
    idx = [i for i in range(len(symbols)) if rvol[i] >= min_rvol]
    idx.sort(key=lambda i: (-rvol[i], symbols[i]))
    for r, i in enumerate(idx[:k]):
        out[kcfg.ARM_RELVOL].append(
            Pick(day, symbols[i], kcfg.ARM_RELVOL, r + 1, float(rvol[i]),
                 int(score[i]), bool(bullish[i])))

    # --- kai ----------------------------------------------------------------
    idx = [i for i in range(len(symbols)) if scored[i]]
    idx.sort(key=lambda i: (-score[i], symbols[i]))
    for r, i in enumerate(idx[:k]):
        out[kcfg.ARM_KAI].append(
            Pick(day, symbols[i], kcfg.ARM_KAI, r + 1, float(rvol[i]),
                 int(score[i]), bool(bullish[i])))

    # --- both ---------------------------------------------------------------
    idx = [i for i in range(len(symbols)) if scored[i] and rvol[i] >= min_rvol]
    if idx:
        syms = [symbols[i] for i in idx]
        r_score = _rank_desc(np.array([score[i] for i in idx], dtype="float64"), syms)
        r_rvol = _rank_desc(np.array([rvol[i] for i in idx], dtype="float64"), syms)
        total = r_score + r_rvol
        order = sorted(range(len(idx)), key=lambda p: (total[p], syms[p]))
        for r, p in enumerate(order[:k]):
            i = idx[p]
            out[kcfg.ARM_BOTH].append(
                Pick(day, symbols[i], kcfg.ARM_BOTH, r + 1, float(rvol[i]),
                     int(score[i]), bool(bullish[i])))
    return out
