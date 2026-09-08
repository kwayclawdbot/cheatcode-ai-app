import assert from "node:assert/strict";
import { riskReward, tradeGeometry, validCandles, price } from "./model";
import { DEMO_TRADE } from "./fixtures";
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const long = riskReward(DEMO_TRADE)!;
close(long.risk, 6.5);
close(long.reward, 16.6);
close(long.ratio, 16.6 / 6.5);
close(long.riskFraction, 6.5 / 23.1);
const short = {
  ...DEMO_TRADE,
  direction: "short" as const,
  entry: 100,
  stop: 110,
  target: 75,
};
close(riskReward(short)!.ratio, 2.5);
for (const broken of [
  { stop: null },
  { target: NaN },
  { entry: Infinity },
  { stop: 178.4 },
  { target: 170 },
  { stop: 200 },
])
  assert.equal(riskReward({ ...DEMO_TRADE, ...broken }), null);
assert.equal(riskReward({ ...short, stop: 90 }), null);
const full = tradeGeometry(DEMO_TRADE)!;
assert.equal(full.candles.length, DEMO_TRADE.candles.length);
const level = (kind: string) => full.levels.find((l) => l.kind === kind)!.y;
assert.ok(level("target") < level("entry") && level("entry") < level("stop"));
const sg = tradeGeometry(short)!;
assert.ok(
  sg.levels.find((l) => l.kind === "stop")!.y <
    sg.levels.find((l) => l.kind === "target")!.y,
);
assert.ok(
  full.candles.every((c) =>
    [c.x, c.yOpen, c.yClose, c.yHigh, c.yLow].every(Number.isFinite),
  ),
);
assert.equal(
  tradeGeometry({
    ...DEMO_TRADE,
    candles: [],
    entry: null,
    stop: null,
    target: null,
  }),
  null,
);
assert.equal(tradeGeometry({ ...DEMO_TRADE, candles: [] })!.candles.length, 0);
const flat = tradeGeometry({
  ...DEMO_TRADE,
  candles: [{ time: 1, open: 5, high: 5, low: 5, close: 5 }],
  entry: 5,
  stop: 5,
  target: 5,
})!;
assert.ok(flat.candles.every((c) => Number.isFinite(c.yClose)));
const bars = [
  { time: 2, open: 3, high: 4, low: 2, close: 3 },
  { time: 1, open: 3, high: 4, low: 2, close: 3 },
  { time: 2, open: 3, high: 5, low: 2, close: 4 },
  { time: 3, open: 3, high: 2, low: 1, close: 3 },
];
assert.deepEqual(
  validCandles(bars).map((b) => [b.time, b.close]),
  [
    [1, 3],
    [2, 4],
  ],
);
assert.equal(price(null), "—");
assert.equal(price(NaN), "—");
assert.equal(price(178.4), "178.40");
console.log(
  "Trade model passed: long/short risk, invalid and missing levels, chronology, duplicate and malformed bars, empty/flat chart geometry, numeric formatting.",
);
