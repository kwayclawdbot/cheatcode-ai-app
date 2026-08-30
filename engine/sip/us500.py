"""A point-in-time large-cap universe — the closest honest thing to "S&P 500".

**This is NOT the S&P 500 and the reports must never call it that.**

True index membership is not available here, and using *today's* constituent
list for a 2021 session would be the worst kind of lookahead: companies are
added to the index AFTER they perform well, so back-projecting membership hands
the strategy a list of winners chosen with hindsight. That single mistake would
manufacture an edge out of nothing.

What is available, and what this builds instead:

    US500 = the 500 most liquid US common stocks by 20-day average DOLLAR
            volume as of the PRIOR CLOSE, drawn from the same grouped-daily
            universe ENGINE-6 built — which contains every ticker that actually
            traded on the day, delisted names included, so it carries no
            survivorship bias.

Two filters separate it from ENGINE-6's raw pool:

* **foreign depositary receipts are dropped** (ADRC/ADRP). ENGINE-6 kept them
  deliberately, because the published paper's universe would contain them. The
  S&P 500 excludes foreign-domiciled companies, so a large-cap-US proxy drops
  them. On 2021-08-30 this is what removes BABA and BNTX from the top of the
  list.
* **funds, notes, warrants, units, preferreds and test tickers are dropped**,
  exactly as `fetch_types.is_stock` already does.

`UNKNOWN` types are KEPT, for ENGINE-6's reason: a ticker the reference API no
longer knows is usually a delisted company, and dropping it would reintroduce
the survivorship the grouped-bar universe exists to avoid. The cost is that a
handful of non-stocks survive; the report prints the type mix so the size of
that is visible rather than assumed.

**Where it differs from the real index, stated so it is never forgotten:** the
S&P 500 is chosen by a committee on market capitalisation, profitability and
float, not on trading volume. This list is chosen on liquidity alone. It will
include a heavily-traded non-index name having a moment (AMC in 2021) and will
miss a genuine index member that trades quietly. For a DAY-TRADE study liquidity
is arguably the more relevant screen — you cannot trade what does not trade —
but it is a different universe and every report that uses it says so.
"""

from __future__ import annotations

from engine.sip.fetch_types import NOT_STOCK, is_test_ticker

# The S&P 500 excludes foreign-domiciled companies; ENGINE-6 kept them.
EXCLUDE_TYPES = set(NOT_STOCK) | {"ADRC", "ADRP"}
UNIVERSE_N = 500


def us500_universe(tickers_by_dollar_volume: list[str], types: dict[str, str],
                   n: int = UNIVERSE_N) -> list[str]:
    """The day's large-cap proxy, in dollar-volume order.

    `tickers_by_dollar_volume` is one row of `universe.eligible_table()`, which
    is already sorted by 20-day average dollar volume as of the prior close and
    already screened on price, volume and ATR. Everything here is knowable at
    09:30 and nothing reaches forward.
    """
    out = []
    for t in tickers_by_dollar_volume:
        t = str(t)
        if is_test_ticker(t):
            continue
        if types.get(t, "UNKNOWN") in EXCLUDE_TYPES:
            continue
        out.append(t)
        if len(out) >= n:
            break
    return out
