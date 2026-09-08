import assert from "node:assert/strict";
import {
  conversationBody,
  quotedText,
  nameInk,
  REMOVED_MESSAGE,
  REMOVED_QUOTE, riskReward, tradeGeometry, validCandles, price } from "./model";
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

/* ── the conversation, and the one rule a shared shell exists to hold ──── */
{
  const base = { id: "m1", name: "Ada", text: "the words", timeLabel: "9:41" };

  const plain = conversationBody(base);
  assert.equal(plain.removed, false);
  assert.equal(plain.text, "the words");

  /* A removed message prints the sentence and NONE of the body. This is the
     assertion the whole extension rests on: a component that forgets the rule
     is caught here rather than by a member reading words a moderator took. */
  const gone = conversationBody({ ...base, deleted: true });
  assert.equal(gone.removed, true);
  assert.equal(gone.text, REMOVED_MESSAGE);
  assert.ok(!gone.text.includes("the words"));

  /* The sentence is the caller's; the refusal is not. */
  const moderated = conversationBody({ ...base, deleted: true, deletedText: "Removed by a moderator." });
  assert.equal(moderated.text, "Removed by a moderator.");
  assert.ok(!moderated.text.includes("the words"));

  /* An empty override falls back rather than printing nothing at all — a blank
     where a removal notice belongs reads as a rendering bug. */
  assert.equal(conversationBody({ ...base, deleted: true, deletedText: "" }).text, REMOVED_MESSAGE);

  /* A quoted post that has since been removed does not carry its words out. */
  assert.equal(quotedText({ messageId: "q", authorName: "Ada", text: "quoted words", deleted: false }), "quoted words");
  assert.equal(quotedText({ messageId: "q", authorName: "Ada", text: "quoted words", deleted: true }), REMOVED_QUOTE);

  /* SIGNAL IS LIT, BELT IS DYED: the name takes the belt, Kai takes violet,
     and an unstated belt is the house ivory rather than an invented rung. */
  const belts = { white: "#FFF7E8", blue: "#7B9CC6", purple: "#BE9AC8", brown: "#C08C5E", black: "#D6DAE1" };
  assert.equal(nameInk(base, belts, "#CBB2FF"), "#FFF7E8");
  assert.equal(nameInk({ ...base, belt: "black" }, belts, "#CBB2FF"), "#D6DAE1");
  assert.equal(nameInk({ ...base, belt: null }, belts, "#CBB2FF"), "#FFF7E8");
  assert.equal(nameInk({ ...base, belt: "black", isKai: true }, belts, "#CBB2FF"), "#CBB2FF");
}

console.log(
  "Trade model passed: conversation body/quote refusals, belt ink, long/short risk, invalid and missing levels, chronology, duplicate and malformed bars, empty/flat chart geometry, numeric formatting.",
);
