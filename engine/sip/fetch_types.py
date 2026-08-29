"""Security type for every ticker that ever entered the eligible universe.

The paper's subject is *stocks*. Our universe comes from grouped daily bars,
which do not carry a type, so an index or leveraged ETF that passes the price,
volume and ATR screens sits in the pool alongside the common stock. In practice
an ETF rarely triples its opening volume on news and rarely reaches a top-20
relative-volume cut, so the effect is small — but "small" is a measurement, not
an assumption, and the report gives the count.

`/v3/reference/tickers/{ticker}` answers for delisted tickers too, which matters:
resolving type from a listing of *today's* tickers would quietly reintroduce the
survivorship the grouped-bar universe was built to avoid. A ticker the reference
API does not know is kept, not dropped, for the same reason.

Security type does not change over a ticker's life, so this is a static
property and not a thing that could be known only in hindsight.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import duckdb
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import config as ecfg  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip.poly import BASE, get_json  # noqa: E402

CONCURRENCY = 24
OUT = scfg.DATA_ROOT / "ticker_types.json"

# Types that are not common stock. ADRC/ADRP are foreign common stock through a
# depositary receipt and the paper's universe would contain them, so they stay.
NOT_STOCK = {"ETF", "ETN", "ETV", "ETS", "FUND", "BASKET", "INDEX", "SP",
             "RIGHT", "WARRANT", "UNIT", "PFD", "AGEN", "EQLK"}

# Exchange test symbols. They print volume and have no tradable tape.
TEST_PREFIXES = ("ATEST", "ZTEST", "ZXYZ", "ZVZZT", "ZWZZT", "ZJZZT", "ZBZX")


def is_test_ticker(t: str) -> bool:
    return t.upper().startswith(TEST_PREFIXES)


def distinct_tickers() -> list[str]:
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT DISTINCT ticker FROM read_parquet"
        f"('{scfg.DATA_ROOT / 'eligible.parquet'}')").fetchall()
    con.close()
    return sorted(r[0] for r in rows)


async def worker(queue: asyncio.Queue, client: httpx.AsyncClient, key: str,
                 out: dict, done: dict) -> None:
    while True:
        t = await queue.get()
        if t is None:
            queue.task_done()
            return
        try:
            data = await get_json(client, f"{BASE}/v3/reference/tickers/{t}",
                                  {"apiKey": key}, attempts=4)
            r = data.get("results") or {}
            out[t] = r.get("type") or "UNKNOWN"
        except Exception:  # noqa: BLE001
            out[t] = "UNKNOWN"
        finally:
            done["n"] += 1
            if done["n"] % 500 == 0:
                print(f"  [{done['n']}/{done['total']}]", flush=True)
            queue.task_done()


async def main_async() -> int:
    key = ecfg.polygon_api_key()
    known = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [t for t in distinct_tickers() if t not in known]
    print(f"ticker types: {len(todo)} to resolve ({len(known)} cached)", flush=True)
    if todo:
        queue: asyncio.Queue = asyncio.Queue()
        for t in todo:
            queue.put_nowait(t)
        for _ in range(CONCURRENCY):
            queue.put_nowait(None)
        done = {"n": 0, "total": len(todo)}
        async with httpx.AsyncClient(headers={"User-Agent": "cheatcode-engine6/1"}) as c:
            await asyncio.gather(*[worker(queue, c, key, known, done)
                                   for _ in range(CONCURRENCY)])
        OUT.write_text(json.dumps(known, indent=0, sort_keys=True))
    from collections import Counter
    counts = Counter(known.values())
    excluded = sum(v for k, v in counts.items() if k in NOT_STOCK)
    print(f"resolved {len(known)}: {dict(counts.most_common(12))}")
    print(f"not stock: {excluded}, unknown (kept): {counts.get('UNKNOWN', 0)}")
    return 0


def load_types() -> dict[str, str]:
    return json.loads(OUT.read_text()) if OUT.exists() else {}


def is_stock(ticker: str, types: dict[str, str]) -> bool:
    if is_test_ticker(ticker):
        return False
    t = types.get(ticker)
    return not (t in NOT_STOCK)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async()))
