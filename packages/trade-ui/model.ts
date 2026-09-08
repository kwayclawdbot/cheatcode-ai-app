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
export type ConversationMessage = {
  id: string;
  name: string;
  text: string;
  timeLabel: string;
  belt?: "white" | "blue" | "purple" | "brown" | "black";
  avatarUrl?: string;
  replyToName?: string;
  isKai?: boolean;
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
