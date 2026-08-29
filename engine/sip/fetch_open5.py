"""Stage A — the opening 5-minute bars of every pool member, every session.

Selecting "stocks in play" needs one number per name per day: the volume that
traded between 09:30 and 09:35. Getting it from 1-minute bars would cost one
request per symbol-day. Getting it from 5-minute bars costs one request per
symbol per half-year, because the 09:30-09:35 candle IS a 5-minute bar and
Polygon's multi-minute aggregates are aligned to midnight, so 09:30 (minute 570
of the day, 570/5 = 114) is a bar boundary exactly.

Only the first twelve 5-minute bars of each session (09:30-10:30) are kept. The
rest of the day is discarded at ingest and never reaches disk, which is the
strongest available guarantee that the selector cannot see the session it is
selecting for: the data does not exist.

Resumable per (symbol, chunk). Unadjusted, for the reason in sip/config.py.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import config as ecfg  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip.poly import BASE, paginate  # noqa: E402

CONCURRENCY = 48
KEEP_FROM_MINUTE = 9 * 60 + 30           # 09:30
KEEP_TO_MINUTE = 10 * 60 + 30            # 10:30, exclusive
ET = "America/New_York"

SCHEMA = pa.schema([
    ("ts_ms", pa.int64()), ("day", pa.int32()), ("minute", pa.int16()),
    ("open", pa.float64()), ("high", pa.float64()), ("low", pa.float64()),
    ("close", pa.float64()), ("volume", pa.float64()),
])


def chunk_id(day: int) -> str:
    y, m = divmod(int(day), 10000)
    mm = m // 100
    return f"{y}H{1 if mm <= 6 else 2}"


def prev_chunk(cid: str) -> str:
    y, h = cid.split("H")
    return f"{int(y) - 1}H2" if h == "1" else f"{y}H1"


def chunk_range(cid: str) -> tuple[str, str]:
    y, h = cid.split("H")
    return (f"{y}-01-01", f"{y}-06-30") if h == "1" else (f"{y}-07-01", f"{y}-12-31")


def path_for(symbol: str, cid: str) -> Path:
    return scfg.OPEN5_DIR / symbol / f"{cid}.parquet"


def _write(path: Path, results: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not results:
        table = pa.table({f.name: pa.array([], type=f.type) for f in SCHEMA}, schema=SCHEMA)
    else:
        ts = np.array([r["t"] for r in results], dtype="int64")
        idx = pd.to_datetime(ts, unit="ms", utc=True).tz_convert(ET)
        minute = (idx.hour * 60 + idx.minute).to_numpy().astype("int32")
        keep = (minute >= KEEP_FROM_MINUTE) & (minute < KEEP_TO_MINUTE)
        day = (idx.year * 10000 + idx.month * 100 + idx.day).to_numpy().astype("int32")
        cols = {
            "ts_ms": ts[keep],
            "day": day[keep],
            "minute": minute[keep].astype("int16"),
            "open": np.array([float(r.get("o") or 0.0) for r in results])[keep],
            "high": np.array([float(r.get("h") or 0.0) for r in results])[keep],
            "low": np.array([float(r.get("l") or 0.0) for r in results])[keep],
            "close": np.array([float(r.get("c") or 0.0) for r in results])[keep],
            "volume": np.array([float(r.get("v") or 0.0) for r in results])[keep],
        }
        table = pa.table({f.name: pa.array(cols[f.name], type=f.type) for f in SCHEMA},
                         schema=SCHEMA)
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp, compression="zstd")
    tmp.replace(path)
    return table.num_rows


async def worker(queue: asyncio.Queue, client: httpx.AsyncClient, key: str,
                 done: dict) -> None:
    while True:
        job = await queue.get()
        if job is None:
            queue.task_done()
            return
        symbol, cid = job
        first, last = chunk_range(cid)
        try:
            url = f"{BASE}/v2/aggs/ticker/{symbol}/range/5/minute/{first}/{last}"
            res = await paginate(client, key, url,
                                 {"adjusted": "false", "sort": "asc"})
            n = _write(path_for(symbol, cid), res)
            done["ok"] += 1
            done["rows"] += n
            if done["ok"] % 200 == 0:
                pct = 100.0 * done["ok"] / max(done["total"], 1)
                print(f"  [{done['ok']}/{done['total']} {pct:.1f}%] {done['rows']:,} kept",
                      flush=True)
        except Exception as exc:  # noqa: BLE001
            done["fail"] += 1
            done["errors"].append(f"{symbol} {cid}: {exc!r}")
            print(f"  FAIL {symbol} {cid}: {exc!r}", flush=True)
        finally:
            queue.task_done()


async def main_async(jobs: list[tuple[str, str]]) -> int:
    key = ecfg.polygon_api_key()
    todo = [(s, c) for s, c in jobs if not path_for(s, c).exists()]
    print(f"open5: {len(todo)} of {len(jobs)} symbol-chunks to fetch", flush=True)
    if not todo:
        return 0
    queue: asyncio.Queue = asyncio.Queue()
    for j in todo:
        queue.put_nowait(j)
    for _ in range(CONCURRENCY):
        queue.put_nowait(None)
    done = {"ok": 0, "fail": 0, "rows": 0, "total": len(todo), "errors": []}
    async with httpx.AsyncClient(headers={"User-Agent": "cheatcode-engine6/1"}) as c:
        await asyncio.gather(*[worker(queue, c, key, done) for _ in range(CONCURRENCY)])
    print(f"done: ok={done['ok']} fail={done['fail']} rows={done['rows']:,}", flush=True)
    (scfg.DATA_ROOT / "open5_errors.json").write_text(json.dumps(done["errors"][:500], indent=2))
    return 1 if done["fail"] else 0


def plan_jobs() -> list[tuple[str, str]]:
    """Which (symbol, half-year) chunks the pool needs.

    A symbol is fetched for every chunk in which it is in the pool on at least
    one day, AND for the chunk immediately before each of those — because the
    relative-volume baseline on the first day of a chunk is made of sessions
    that fall in the previous one.
    """
    from engine.sip.universe import eligible_table, pool_for_day
    tab = eligible_table()
    need: dict[str, set[str]] = {}
    for day in sorted(tab):
        if int(day) < int(scfg.START.replace("-", "")):
            continue
        cid = chunk_id(day)
        for sym in pool_for_day(day, table=tab):
            need.setdefault(sym, set()).add(cid)
    jobs: list[tuple[str, str]] = []
    for sym, cids in need.items():
        full = set(cids)
        for c in cids:
            full.add(prev_chunk(c))
        for c in sorted(full):
            jobs.append((sym, c))
    return sorted(jobs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    jobs = plan_jobs()
    syms = len({s for s, _ in jobs})
    print(f"plan: {len(jobs)} symbol-chunks across {syms} distinct symbols", flush=True)
    if a.dry_run:
        return 0
    return asyncio.run(main_async(jobs))


if __name__ == "__main__":
    raise SystemExit(main())
