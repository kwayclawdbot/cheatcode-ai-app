"""Stage 0 — grouped daily bars for the whole US stock market, one call a day.

`/v2/aggs/grouped/locale/us/market/stocks/{date}` returns every ticker that
traded that session (~10,500 rows). It is the only cheap way to build a
universe that is free of survivorship bias: the set of names present on
2016-03-14 is the set that actually traded on 2016-03-14, delisted ones
included, and nothing about the future is used to assemble it.

`adjusted=false` — see the note in sip/config.py. Resumable: one parquet per
date, skipped if it exists.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import httpx
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import calendar_us, config as ecfg  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip.poly import BASE, get_json  # noqa: E402

CONCURRENCY = 6
SCHEMA = pa.schema([
    ("ticker", pa.string()), ("open", pa.float64()), ("high", pa.float64()),
    ("low", pa.float64()), ("close", pa.float64()), ("volume", pa.float64()),
    ("vwap", pa.float64()), ("trades", pa.int64()),
])


def path_for(date: str) -> Path:
    return scfg.GROUPED_DIR / f"{date}.parquet"


def sessions(start: str, end: str) -> list[str]:
    return calendar_us.trading_days(start, end)


def _write(path: Path, rows: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = {
        "ticker": [str(r["T"]) for r in rows],
        "open": [float(r.get("o") or 0.0) for r in rows],
        "high": [float(r.get("h") or 0.0) for r in rows],
        "low": [float(r.get("l") or 0.0) for r in rows],
        "close": [float(r.get("c") or 0.0) for r in rows],
        "volume": [float(r.get("v") or 0.0) for r in rows],
        "vwap": [float(r["vw"]) if r.get("vw") is not None else float("nan") for r in rows],
        "trades": [int(r.get("n") or 0) for r in rows],
    }
    table = pa.table({f.name: pa.array(cols[f.name], type=f.type) for f in SCHEMA},
                     schema=SCHEMA)
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp, compression="zstd")
    tmp.replace(path)
    return len(rows)


async def worker(queue: asyncio.Queue, client: httpx.AsyncClient, key: str,
                 done: dict) -> None:
    while True:
        date = await queue.get()
        if date is None:
            queue.task_done()
            return
        try:
            url = f"{BASE}/v2/aggs/grouped/locale/us/market/stocks/{date}"
            data = await get_json(client, url, {"adjusted": "false", "apiKey": key})
            n = _write(path_for(date), data.get("results") or [])
            done["ok"] += 1
            done["rows"] += n
            if done["ok"] % 50 == 0:
                print(f"  [{done['ok']}/{done['total']}] {done['rows']:,} rows",
                      flush=True)
        except Exception as exc:  # noqa: BLE001
            done["fail"] += 1
            print(f"  FAIL {date}: {exc!r}", flush=True)
        finally:
            queue.task_done()


async def main_async(start: str, end: str) -> int:
    key = ecfg.polygon_api_key()
    todo = [d for d in sessions(start, end) if not path_for(d).exists()]
    print(f"grouped daily: {len(todo)} sessions to fetch ({start}..{end})", flush=True)
    if not todo:
        return 0
    queue: asyncio.Queue = asyncio.Queue()
    for d in todo:
        queue.put_nowait(d)
    for _ in range(CONCURRENCY):
        queue.put_nowait(None)
    done = {"ok": 0, "fail": 0, "rows": 0, "total": len(todo)}
    async with httpx.AsyncClient(headers={"User-Agent": "cheatcode-engine6/1"}) as c:
        await asyncio.gather(*[worker(queue, c, key, done) for _ in range(CONCURRENCY)])
    print(f"done: ok={done['ok']} fail={done['fail']} rows={done['rows']:,}", flush=True)
    return 1 if done["fail"] else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=scfg.WARMUP_START)
    ap.add_argument("--end", default=scfg.END)
    a = ap.parse_args()
    return asyncio.run(main_async(a.start, a.end))


if __name__ == "__main__":
    raise SystemExit(main())
