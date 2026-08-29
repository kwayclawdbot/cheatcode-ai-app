"""One shared Polygon client for ENGINE-6's three fetch stages.

The key is shared with ~/breakout-alert-system's Railway crons. Concurrency is
capped, 429 backs off hard and exponentially, and every stage is resumable at
the granularity of a single file, so a killed download loses at most one chunk.

`paginate` passes `limit` through to `next_url`. Polygon's next_url does NOT
carry the caller's limit, so a paginator that only appends the key silently
drops to ~1,600 rows a page: a year of AAPL 5-minute bars is 4 pages with the
limit and 29 without.
"""

from __future__ import annotations

import asyncio
import random

import httpx

BASE = "https://api.polygon.io"
LIMIT = 50_000


async def get_json(client: httpx.AsyncClient, url: str, params: dict | None,
                   attempts: int = 8) -> dict:
    delay = 1.0
    for attempt in range(attempts):
        try:
            r = await client.get(url, params=params, timeout=120.0)
        except httpx.HTTPError:
            if attempt == attempts - 1:
                raise
            await asyncio.sleep(delay + random.random())
            delay = min(delay * 2, 60)
            continue
        if r.status_code == 429:
            await asyncio.sleep(delay + random.random())
            delay = min(delay * 2, 120)
            continue
        if r.status_code >= 500:
            await asyncio.sleep(delay + random.random())
            delay = min(delay * 2, 60)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"exhausted retries: {url}")


async def paginate(client: httpx.AsyncClient, key: str, url: str,
                   params: dict) -> list[dict]:
    out: list[dict] = []
    p = dict(params)
    p["apiKey"] = key
    p.setdefault("limit", LIMIT)
    while True:
        data = await get_json(client, url, p)
        out.extend(data.get("results") or [])
        nxt = data.get("next_url")
        if not nxt:
            return out
        url, p = nxt, {"apiKey": key, "limit": LIMIT}
