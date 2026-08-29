"""The unfiltered control — the paper's null case, on our data.

Zarattini, Barbon & Aziz report 29% at a 0.48 Sharpe for unfiltered ORB and
1,637% at 2.81 for the same rules on stocks in play. The claim under test is
therefore not "ORB works" but "the relative-volume filter is what works". A
control that changes only the filter is the only thing that can measure it.

So: the same days, the same eligible universe, the same pool, the same twenty
names a day, the same model, the same costs — and the twenty chosen by a
deterministic hash instead of by opening relative volume. Anything the
stocks-in-play arm earns over this, it earned from the filter.

The hash is seeded per (day, symbol) and is a pure function of the snapshot, so
the control is reproducible and cannot drift between runs.
"""

from __future__ import annotations

import hashlib

from engine.sip import config as scfg
from engine.sip.selection import OpenStore, Pick

SEED = "engine-6-unfiltered-control"


def _hash(*parts) -> int:
    h = hashlib.sha256((SEED + "|" + "|".join(str(p) for p in parts)).encode())
    return int.from_bytes(h.digest()[:8], "big")


def select_day_random(day: int, pool: list[str], store: OpenStore,
                      k: int = scfg.TOP_K,
                      n: int = scfg.RVOL_BASELINE_DAYS) -> list[Pick]:
    """Twenty names a day, drawn from exactly the candidates the stocks-in-play
    selector could have chosen from, by coin flip instead of by relative volume.

    The eligibility requirement is identical — the name must have an opening
    bar today and a full 14-session baseline — so the two arms differ in the
    ranking key and in nothing else.
    """
    cand: list[tuple[int, str, float]] = []
    for sym in pool:
        r = store.rvol(sym, day, n)
        if r is None:
            continue
        cand.append((_hash(day, sym), sym, r))
    cand.sort(key=lambda t: (t[0], t[1]))
    return [Pick(int(day), s, float(r), 0.0, 0.0, i + 1)
            for i, (_, s, r) in enumerate(cand[:k])]
