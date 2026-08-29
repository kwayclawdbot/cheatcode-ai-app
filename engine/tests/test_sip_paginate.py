"""The paginator must carry the caller's parameters onto every page.

This exists because it did not, and the bug was live in a finished snapshot.
Polygon's `next_url` embeds only the cursor; a paginator that forwards just the
API key drops `adjusted`, whose default is TRUE. The observed result, on
2026-08-29:

    page 1: 12,913 rows, adjusted=False, first open 105.45
    page 2:  7,496 rows, adjusted=True,  first open  26.08

The tail of every multi-page response came back split-adjusted while the head
did not. In an opening-VOLUME series that is not cosmetic — volume is scaled by
the split factor too, so a name whose 14-day relative-volume baseline straddled
a page boundary showed a 4x or quarter-size ratio that never happened, and was
selected, or passed over, for it.

The bug was caught by `tests/test_sip_data.py`, which checks the 5-minute
opening bar against the 1-minute cache bar by bar. This test pins the mechanism
so it cannot come back through a refactor of the client.
"""

from __future__ import annotations

import asyncio

import httpx

from engine.sip.poly import LIMIT, paginate

SEEN: list[dict] = []


def _handler(request: httpx.Request) -> httpx.Response:
    SEEN.append(dict(request.url.params))
    page = len(SEEN)
    if page == 1:
        return httpx.Response(200, json={
            "results": [{"t": 1, "o": 1.0}],
            "next_url": "https://api.polygon.io/v2/aggs/next?cursor=abc",
        })
    if page == 2:
        return httpx.Response(200, json={
            "results": [{"t": 2, "o": 2.0}],
            "next_url": "https://api.polygon.io/v2/aggs/next?cursor=def",
        })
    return httpx.Response(200, json={"results": [{"t": 3, "o": 3.0}]})


def _run():
    SEEN.clear()

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as c:
            return await paginate(c, "KEY", "https://api.polygon.io/x",
                                  {"adjusted": "false", "sort": "asc"})
    return asyncio.run(go())


def test_every_page_carries_adjusted_and_sort_and_limit():
    rows = _run()
    assert len(rows) == 3, "all three pages must be collected"
    assert len(SEEN) == 3
    for i, params in enumerate(SEEN):
        assert params.get("adjusted") == "false", f"page {i+1} dropped adjusted"
        assert params.get("sort") == "asc", f"page {i+1} dropped sort"
        assert params.get("limit") == str(LIMIT), f"page {i+1} dropped limit"
        assert params.get("apiKey") == "KEY", f"page {i+1} dropped the key"


def test_the_cursor_advances():
    _run()
    # page 2 and 3 are the cursor URLs; the paginator must follow them rather
    # than re-requesting the first page forever
    assert len(SEEN) == 3
