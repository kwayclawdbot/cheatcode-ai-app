"""Polygon -> parquet bar cache. Chunked by symbol-month, resumable, immutable.

Flat files (S3 bulk) were probed on 2026-08-29 and returned 403: the only
credential available to this repo is the REST API key, and files.polygon.io
needs separate S3 access keys that are not in the environment. So this uses
/v2/aggs with the uncapped call budget, one request per symbol-month.

The key is shared with ~/breakout-alert-system's Railway crons. Concurrency is
deliberately low and 429 backs off hard.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import random
import sys
from pathlib import Path

import httpx
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import config  # noqa: E402

BASE = "https://api.polygon.io"
MAX_CONCURRENCY = 4
SCHEMA = pa.schema([
    ("ts_ms", pa.int64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.float64()),
    ("vwap", pa.float64()),
    ("trades", pa.int64()),
])


SNAPSHOT = config.SNAPSHOT          # rebound by main() when --snapshot is given


def snapshot_dir() -> Path:
    return config.DATA_ROOT / SNAPSHOT


def bars_path(timespan: str, symbol: str, chunk: str) -> Path:
    return snapshot_dir() / timespan / symbol / f"{chunk}.parquet"


def month_chunks(start: str, end: str) -> list[tuple[str, str, str]]:
    """(chunk_id, first_day, last_day) inclusive, month by month."""
    s = dt.date.fromisoformat(start)
    e = dt.date.fromisoformat(end)
    out = []
    cur = dt.date(s.year, s.month, 1)
    while cur <= e:
        nxt = dt.date(cur.year + (cur.month == 12), (cur.month % 12) + 1, 1)
        first = max(cur, s)
        last = min(nxt - dt.timedelta(days=1), e)
        out.append((f"{cur.year:04d}-{cur.month:02d}", first.isoformat(), last.isoformat()))
        cur = nxt
    return out


async def _get(client: httpx.AsyncClient, url: str, params: dict | None) -> dict:
    delay = 1.0
    for attempt in range(8):
        try:
            r = await client.get(url, params=params, timeout=60.0)
        except httpx.HTTPError as exc:
            if attempt == 7:
                raise
            await asyncio.sleep(delay + random.random())
            delay = min(delay * 2, 60)
            _ = exc
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


async def fetch_range(client: httpx.AsyncClient, key: str, symbol: str,
                      multiplier: int, timespan: str, first: str, last: str) -> list[list]:
    url = f"{BASE}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{first}/{last}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": key}
    rows: list[list] = []
    while True:
        data = await _get(client, url, params)
        for b in data.get("results") or []:
            rows.append([
                int(b["t"]), float(b["o"]), float(b["h"]), float(b["l"]),
                float(b["c"]), float(b.get("v") or 0.0),
                float(b["vw"]) if b.get("vw") is not None else float("nan"),
                int(b.get("n") or 0),
            ])
        nxt = data.get("next_url")
        if not nxt:
            return rows
        url, params = nxt, {"apiKey": key}


def write_parquet(path: Path, rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = list(zip(*rows)) if rows else [[] for _ in SCHEMA]
    table = pa.table({f.name: pa.array(list(c), type=f.type)
                      for f, c in zip(SCHEMA, cols)}, schema=SCHEMA)
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp, compression="zstd")
    tmp.replace(path)


async def worker(name: str, queue: asyncio.Queue, client: httpx.AsyncClient,
                 key: str, done: dict) -> None:
    while True:
        job = await queue.get()
        if job is None:
            queue.task_done()
            return
        diskspan, polyspan, symbol, chunk, first, last = job
        path = bars_path(diskspan, symbol, chunk)
        try:
            rows = await fetch_range(client, key, symbol, 1, polyspan, first, last)
            write_parquet(path, rows)
            done["ok"] += 1
            done["bars"] += len(rows)
            if done["ok"] % 25 == 0:
                print(f"  [{done['ok']}/{done['total']}] {done['bars']:,} bars", flush=True)
        except Exception as exc:  # noqa: BLE001
            done["fail"] += 1
            done["errors"].append(f"{diskspan} {symbol} {chunk}: {exc!r}")
            print(f"  FAIL {diskspan} {symbol} {chunk}: {exc!r}", flush=True)
        finally:
            queue.task_done()


async def main_async(symbols: list[str], start: str, end: str, force: bool) -> int:
    key = config.polygon_api_key()
    jobs: list[tuple] = []
    for sym in symbols:
        for chunk, first, last in month_chunks(start, end):
            if force or not bars_path("1m", sym, chunk).exists():
                jobs.append(("1m", "minute", sym, chunk, first, last))
    for sym in symbols:
        if force or not bars_path("day", sym, "all").exists():
            jobs.append(("day", "day", sym, "all", start, end))

    print(f"cache {SNAPSHOT}: {len(jobs)} chunks to fetch "
          f"({len(symbols)} symbols, {start}..{end})", flush=True)
    if not jobs:
        return 0

    queue: asyncio.Queue = asyncio.Queue()
    for job in jobs:
        queue.put_nowait(job)
    for _ in range(MAX_CONCURRENCY):
        queue.put_nowait(None)

    done = {"ok": 0, "fail": 0, "bars": 0, "total": len(jobs), "errors": []}

    async with httpx.AsyncClient(headers={"User-Agent": "cheatcode-engine/1"}) as client:
        await asyncio.gather(*[
            worker(f"w{i}", queue, client, key, done)
            for i in range(MAX_CONCURRENCY)
        ])

    print(f"done: ok={done['ok']} fail={done['fail']} bars={done['bars']:,}", flush=True)
    meta = snapshot_dir() / "fetch_log.json"
    meta.parent.mkdir(parents=True, exist_ok=True)
    prev = json.loads(meta.read_text()) if meta.exists() else []
    prev.append({
        "at": dt.datetime.now(dt.UTC).isoformat(),
        "symbols": symbols, "start": start, "end": end,
        "ok": done["ok"], "fail": done["fail"], "bars": done["bars"],
        "errors": done["errors"][:50],
    })
    meta.write_text(json.dumps(prev, indent=2))
    return 1 if done["fail"] else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default=",".join(config.UNIVERSE))
    ap.add_argument("--start", default=config.CACHE_START)
    ap.add_argument("--end", default=config.CACHE_END)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--snapshot", default=None,
                    help="write into a different immutable snapshot directory")
    a = ap.parse_args()
    if a.snapshot:
        global SNAPSHOT
        SNAPSHOT = a.snapshot
    syms = [s.strip().upper() for s in a.symbols.split(",") if s.strip()]
    return asyncio.run(main_async(syms, a.start, a.end, a.force))


if __name__ == "__main__":
    raise SystemExit(main())
