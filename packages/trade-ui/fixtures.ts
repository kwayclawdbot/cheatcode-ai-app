/** Gallery-only illustrative fixture. Never import into production data adapters. */
import type { TradeIdea, ConversationMessage } from "./model";
const closes = [
  166, 167, 166.4, 169, 170.4, 169.9, 172, 174, 173.2, 176, 177.6, 176.8, 178.5,
  180, 182, 183, 181.4, 180.5, 179.2, 178.8, 178.5, 179.6, 180.3, 179.8, 181.1,
  181.6, 180.9, 182.2, 181.8, 183.1, 182.6, 184, 183.2, 182.1, 181.2, 180.1,
  179.3, 178.7, 178.6, 179.1,
];
export const DEMO_TRADE: TradeIdea = {
  id: "demo-nvda",
  symbol: "NVDA",
  company: "Nvidia",
  title: "The breakout. The retest.",
  summary: "Watching the retest above former resistance.",
  direction: "long",
  grade: "A",
  entry: 178.4,
  stop: 171.9,
  target: 195,
  status: "watching",
  currency: "USD",
  dataLabel: "Illustrative setup · Not live market data",
  candles: closes.map((close, i) => {
    const open = i ? closes[i - 1] : 165.2;
    return {
      time: Date.UTC(2026, 3, i + 1),
      open,
      close,
      high: Math.max(open, close) + 0.65,
      low: Math.min(open, close) - 0.55,
      volume: 100 + i * 7,
    };
  }),
};
export const DEMO_MESSAGES: ConversationMessage[] = [
  {
    id: "r1",
    name: "Renata",
    belt: "black",
    text: "Holding above 178. Watching the retest.",
    timeLabel: "10:14",
  },
  {
    id: "t1",
    name: "Toby",
    belt: "blue",
    text: "Why not put the stop right under 178?",
    timeLabel: "10:16",
  },
  {
    id: "r2",
    name: "Renata",
    belt: "black",
    replyToName: "Toby",
    text: "I want the stop where the idea is actually wrong.",
    timeLabel: "10:18",
  },
  {
    id: "k1",
    name: "Kai",
    isKai: true,
    text: "Want me to show the invalidation level?",
    timeLabel: "10:19",
  },
];
