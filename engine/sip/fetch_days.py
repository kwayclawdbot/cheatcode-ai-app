"""Stage B — one-minute bars, but only for the symbol-days actually selected.

The selection is already fixed by the time this runs: it is a function of
grouped daily bars through the prior close and of the 09:30-09:35 volume, both
of which are on disk before a single 1-minute bar is requested. Downloading the
sessions the selector picked is therefore a CONSEQUENCE of the selection and
cannot feed back into it. Downloading a whole rolling pool's minute bars and
then choosing among them would have been the same result at forty times the
disk.

One parquet per symbol-day, which makes the job resumable at the granularity of
a single session and lets `cache/load.py` read the tree unchanged.
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
from engine import calendar_us, config as ecfg  # noqa: E402
from engine.sip import config as scfg  # noqa: E402
from engine.sip.poly import BASE, paginate  # noqa: E402

CONCURRENCY = 16
ET = "America/New_York"
RTH_OPEN = 9 * 60 + 30

SCHEMA = pa.schema([
    ("ts_ms", pa.int64()), ("open", pa.float64()), ("high", pa.float64()),
    ("low", pa.float64()), ("close", pa.float64()), ("volume", pa.float64()),
])


def day_str(day: int) -> str:
    s = str(int(day))
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def path_for(symbol: str, day: int) -> Path:
    return scfg.MIN1_DIR / symbol / f"{day_str(day)}.parquet"


def _write(path: Path, results: list[dict], day: int) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    close_min = calendar_us.rth_close_minute(day_str(day))
    if results:
        ts = np.array([r["t"] for r in results], dtype="int64")
        idx = pd.to_datetime(ts, unit="ms", utc=True).tz_convert(ET)
        minute = (idx.hour * 60 + idx.minute).to_numpy().astype("int32")
        keep = (minute >= RTH_OPEN) & (minute < close_min)
        cols = {
            "ts_ms": ts[keep],
            "open": np.array([float(r.get("o") or 0.0) for r in results])[keep],
            "high": np.array([float(r.get("h") or 0.0) for r in results])[keep],
            "low": np.array([float(r.get("l") or 0.0) for r in results])[keep],
            "close": np.array([float(r.get("c") or 0.0) for r in results])[keep],
            "volume": np.array([float(r.get("v") or 0.0) for r in results])[keep],
        }
    else:
        cols = {f.name: np.array([], dtype="float64") for f in SCHEMA}
        cols["ts_ms"] = np.array([], dtype="int64")
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
        symbol, day = job
        d = day_str(day)
        try:
            url = f"{BASE}/v2/aggs/ticker/{symbol}/range/1/minute/{d}/{d}"
            res = await paginate(client, key, url, {"adjusted": "false", "sort": "asc"})
            n = _write(path_for(symbol, day), res, day)
            done["ok"] += 1
            done["rows"] += n
            if done["ok"] % 1000 == 0:
                pct = 100.0 * done["ok"] / max(done["total"], 1)
                print(f"  [{done['ok']}/{done['total']} {pct:.1f}%] {done['rows']:,} bars",
                      flush=True)
        except Exception as exc:  # noqa: BLE001
            done["fail"] += 1
            done["errors"].append(f"{symbol} {d}: {exc!r}")
            print(f"  FAIL {symbol} {d}: {exc!r}", flush=True)
        finally:
            queue.task_done()


async def main_async(pairs: list[tuple[str, int]]) -> int:
    key = ecfg.polygon_api_key()
    todo = [(s, d) for s, d in pairs if not path_for(s, d).exists()]
    print(f"1m: {len(todo)} of {len(pairs)} symbol-days to fetch", flush=True)
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
    print(f"done: ok={done['ok']} fail={done['fail']} bars={done['rows']:,}", flush=True)
    (scfg.DATA_ROOT / "min1_errors.json").write_text(json.dumps(done["errors"][:500], indent=2))
    return 1 if done["fail"] else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", required=True,
                    help="JSON file: [[symbol, yyyymmdd], ...]")
    a = ap.parse_args()
    pairs = [(str(s), int(d)) for s, d in json.loads(Path(a.pairs).read_text())]
    return asyncio.run(main_async(pairs))


if __name__ == "__main__":
    raise SystemExit(main())
