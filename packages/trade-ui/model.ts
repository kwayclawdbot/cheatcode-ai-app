/** Framework-free contract: both renderers consume the same trade and geometry. */
export type LevelKind = "entry" | "stop" | "target";
export type TradeStatus =
  | "watching"
  | "entry_reached"
  | "active"
  | "closed"
  | "invalidated"
  | "expired";
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
export type TradeIdea = {
  id: string;
  symbol: string;
  company: string;
  title: string;
  summary: string;
  direction: "long" | "short";
  grade?: string | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  status: TradeStatus;
  /** Real OHLC bars supplied by the caller. No production fallback data. */
  candles: readonly Candle[];
  currency?: string;
  pricePrecision?: number;
  logoUrl?: string;
  /** Visible source/as-of information supplied by the data adapter. */
  dataLabel: string;
};
export type KaiNote = { level: LevelKind; text: string };
export type ConversationBelt = "white" | "blue" | "purple" | "brown" | "black";
/**
 * A QUOTED POST, AS THE WIRE SNAPSHOTS IT.
 *
 * `authorName` is a snapshot rather than a live join, which is why there is no
 * user id and no belt on it: the quote records what was said and by whom at the
 * time, and it must keep saying that even if the account is renamed. `deleted`
 * is not a styling hint — a removed post must be reported as removed and must
 * never repeat the words that were removed.
 */
export type ConversationQuote = {
  messageId: string;
  authorName: string;
  text: string;
  deleted: boolean;
};
/**
 * A MESSAGE, AND THE PARTS OF ONE THE KIT CAN HONESTLY OWN.
 *
 * The fields here are the ones every conversation surface has and means the
 * same thing by: who said it, when, what it says, what it was replying to, and
 * whether it still stands. They are data, so both twins can draw them and the
 * shared model can be tested.
 *
 * Everything a particular room happens to ALSO carry — its reactions, its
 * media, Kai's verification of a claim, a community call, a structured idea —
 * arrives as a SLOT on `ConversationRow` instead. That line is drawn on
 * purpose and it is the same one `PinnedTradePreview` draws: the kit owns what
 * a message IS on every surface, and it does not grow a `reactions` prop it
 * would then have to explain to a website that has no reactions.
 *
 * It is also the answer to the objection recorded in the migration doc, that
 * `RoomMessage` has twenty-odd fields and this had eight. It still has eight
 * that it renders and it will never have twenty; the other twelve are passed
 * through as the room's own components, so nothing is reimplemented and
 * nothing is lost.
 */
export type ConversationMessage = {
  id: string;
  name: string;
  text: string;
  timeLabel: string;
  /** Absent means the server did not say, which is not the same as white. */
  belt?: ConversationBelt | null;
  avatarUrl?: string;
  replyToName?: string;
  isKai?: boolean;
  /** "@handle", drawn beside the name. Null means not picked. */
  handle?: string | null;
  /** Removed. The body is replaced, never merely faded. */
  deleted?: boolean;
  /**
   * What to say in place of a removed body. Surfaces differ on purpose — a room
   * says "This message was removed.", a moderated feed says who removed it —
   * so the sentence is the caller's and only the refusal to print the body is
   * the kit's.
   */
  deletedText?: string | null;
  /** The author's account is gone; the name must not read as Kai's. */
  authorDeleted?: boolean;
  quote?: ConversationQuote | null;
  /** Replies beneath this message. Zero draws nothing, never "0 replies". */
  replyCount?: number;
};
export const LEVEL_LABEL: Record<LevelKind, string> = {
  entry: "Entry",
  stop: "Stop",
  target: "Target",
};
export const STATUS_LABEL: Record<TradeStatus, string> = {
  watching: "Watching",
  entry_reached: "Entry reached",
  active: "Active",
  closed: "Closed",
  invalidated: "Invalidated",
  expired: "Expired",
};
export const STATUS_STEPS: TradeStatus[] = [
  "watching",
  "entry_reached",
  "active",
  "closed",
];
export function price(value: number | null | undefined, precision = 2): string {
  precision = Number.isFinite(precision)
    ? Math.max(0, Math.min(8, Math.floor(precision)))
    : 2;
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      })
    : "—";
}
export function riskReward(
  idea: Pick<TradeIdea, "entry" | "stop" | "target" | "direction">,
) {
  const { entry, stop, target, direction } = idea;
  if (
    ![entry, stop, target].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    )
  )
    return null;
  const sign = direction === "long" ? 1 : -1;
  const risk = (entry! - stop!) * sign,
    reward = (target! - entry!) * sign;
  if (risk <= 0 || reward <= 0) return null;
  return {
    risk,
    reward,
    ratio: reward / risk,
    riskFraction: risk / (risk + reward),
  };
}
export function validCandles(candles: readonly Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const bar of candles) {
    if (
      ![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
    )
      continue;
    if (
      bar.high < Math.max(bar.open, bar.close) ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.high < bar.low
    )
      continue;
    byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
/** SVG coordinates are shared by native and web. Labels use separate controls,
 * so near-identical levels never become overlapping, inaccessible text. */
export function tradeGeometry(idea: TradeIdea, compact = false) {
  const width = 360,
    height = compact ? 172 : 292,
    left = 8,
    right = 82,
    top = 16,
    bottom = compact ? 16 : 38;
  const bars = validCandles(idea.candles).slice(-72);
  const levels = (["entry", "stop", "target"] as const).flatMap((kind) => {
    const value = idea[kind];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ kind, value }]
      : [];
  });
  const values = [
    ...bars.flatMap((b) => [b.high, b.low]),
    ...levels.map((l) => l.value),
  ];
  if (values.length === 0) return null;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = Math.max(high - low, Math.abs(high) * 0.015, 0.01);
  const min = low - span * 0.12,
    max = high + span * 0.12,
    plotBottom = height - bottom;
  const y = (v: number) => top + ((max - v) / (max - min)) * (plotBottom - top);
  const step = (width - left - right) / Math.max(bars.length, 1);
  const candles = bars.map((b, i) => ({
    ...b,
    x: left + step * (i + 0.5),
    yHigh: y(b.high),
    yLow: y(b.low),
    yOpen: y(b.open),
    yClose: y(b.close),
    bodyWidth: Math.max(1, Math.min(7, step * 0.65)),
  }));
  return {
    width,
    height,
    plotBottom,
    candles,
    levels: levels.map((l) => ({ ...l, y: y(l.value) })),
    grid: [0.2, 0.4, 0.6, 0.8].map((f) => top + (plotBottom - top) * f),
    line: candles
      .map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(2)},${c.yClose.toFixed(2)}`)
      .join(" "),
  };
}

/** What a removed message says when its surface does not say otherwise. */
export const REMOVED_MESSAGE = "This message was removed.";
/** What a removed QUOTE says. Never the words that were removed. */
export const REMOVED_QUOTE = "This post was removed";
/**
 * THE DELETED REFUSAL, AS A FUNCTION RATHER THAN A HABIT.
 *
 * A removed message must print the sentence about it and NONE of the body, and
 * that used to be four separate `!m.deleted &&` guards in one component and
 * three more in another — a rule that only holds while everybody remembers it.
 * Here it is one decision that both twins call and a test can hold to account,
 * which is the only reason a shared model is worth having.
 *
 * The SENTENCE is the caller's, because surfaces differ honestly: a room says
 * the message was removed, a moderated board says who removed it. The refusal
 * to print the body is not the caller's.
 */
export function conversationBody(m: ConversationMessage): {
  removed: boolean;
  text: string;
} {
  return m.deleted
    ? { removed: true, text: m.deletedText || REMOVED_MESSAGE }
    : { removed: false, text: m.text };
}
/** The same refusal, for a quotation of a post that has since been removed. */
export function quotedText(q: ConversationQuote): string {
  return q.deleted ? REMOVED_QUOTE : q.text;
}
/**
 * The ink a name is drawn in is decided in one place.
 *
 * Kai is not on the ladder and never will be, so he is not given a rung to
 * fall back to; the caller supplies the two colours because the palette has
 * exactly one source and this file is not it.
 */
export function nameInk(
  m: ConversationMessage,
  belts: Record<ConversationBelt, string>,
  kaiInk: string,
): string {
  return m.isKai ? kaiInk : belts[m.belt ?? "white"];
}
