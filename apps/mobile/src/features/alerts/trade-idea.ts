/**
 * AN ALERT CARD → `TradeIdea`. THE SEAM, AND ONLY THE SEAM (audit F06).
 *
 * `features/orders/trade-idea.ts` is the same file for the paper-execution
 * lane, and this is deliberately its twin rather than a second invention: one
 * mapping per wire shape, the kit's own type on the other side, no rendering
 * and no I/O. When `/alerts` changes, this is the file to read.
 *
 * THE HARD PART IS NOT THE MAPPING, IT IS THE REFUSALS.
 *
 * An order preview carries NUMBERS. An alert card carries the STRINGS a
 * scanner published — "506.12", but also "242–245", "> 934" and "Above
 * $124.8." — because an entry zone is a real thing and the server prints it as
 * one. The kit needs a single number per level to draw a line or measure an R.
 * Manufacturing one out of a range is exactly what the audit forbids ("do not
 * manufacture absent grades, stops, targets or reward ratios to fill a
 * beautiful template"), and it would put "242.00" under a dashed line on a card
 * whose own strip says "242–245".
 *
 * So `levelPrice` admits ONE form — a plain price, with or without a dollar
 * sign — and answers null for everything else. A range keeps its verbatim
 * string on the card, the map draws the levels it actually has, and the ruler
 * either measures three real numbers or says it cannot. Nothing here ever
 * invents the fourth.
 *
 * EVERY IMPORT IS A TYPE EXCEPT `riskReward`, which is arithmetic in a
 * framework-free file. That is what keeps this module importable from plain
 * node, and it is why `scripts/setup-preview-test.mts` can assert the refusals
 * without a React Native entry point being dragged in.
 */
import { riskReward, type TradeIdea, type TradeStatus } from '../../../../../packages/trade-ui/model';
import { kitCandles } from '../orders/trade-idea';
import type { AlertCard, AlertCardState, Candle } from '../../lib/types';

/**
 * A PRICE, AND NOTHING THAT MERELY CONTAINS ONE.
 *
 * "$504.10" · "504.10" · "1,234.50" are prices. "242–245" is a zone, "> 934" is
 * a condition and "Above $124.8." is a sentence — all three are perfectly good
 * things for the card to PRINT and none of them is a number the kit may draw a
 * line at. The regex is anchored at both ends for that reason: a loose
 * `match(/\d+/)` would turn every one of them into a level.
 */
const PRICE = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;

export function levelPrice(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s || !PRICE.test(s)) return null;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The string the card prints. Verbatim, trimmed, or nothing at all. */
export const levelText = (raw: string | null | undefined): string | null => {
  const s = (raw ?? '').trim();
  return s.length ? s : null;
};

/**
 * WHICH WAY ROUND, READ RATHER THAN ASSUMED.
 *
 * Defaulting to long flips the sign of every short's risk and reward, which is
 * how a good trade renders as a red bar. The words come first because the
 * server wrote them; where it wrote none, the LEVELS say it — a stop under the
 * entry is a long whatever anybody called it. The final `long` is reached only
 * when there is neither a word nor two levels to compare, and on that card
 * nothing that depends on direction is drawn at all.
 */
export function ideaDirection(alert: AlertCard): 'long' | 'short' {
  const words = `${alert.direction_label ?? ''} ${alert.trade.direction ?? ''}`.toLowerCase();
  if (/\b(short|shorts|put|puts|sell|bearish)\b/.test(words)) return 'short';
  if (/\b(long|longs|call|calls|buy|bullish|accumulate)\b/.test(words)) return 'long';

  const entry = levelPrice(alert.trade.entry);
  const stop = levelPrice(alert.trade.stop);
  const target = levelPrice(alert.trade.target);
  if (entry != null && stop != null && entry !== stop) return stop < entry ? 'long' : 'short';
  if (entry != null && target != null && entry !== target) return target > entry ? 'long' : 'short';
  if (stop != null && target != null && stop !== target) return target > stop ? 'long' : 'short';
  return 'long';
}

/**
 * The alert lifecycle, in the kit's four steps.
 *
 * `planned` is the one worth naming: the member has written a plan and NOTHING
 * IS OPEN, so it sits on "Entry reached" rather than "Active". The card does
 * not leave that to the strip — `availability()` below says it in a sentence,
 * because a dot on a rail is not an answer to "have I bought this".
 */
const STATUS: Record<AlertCardState, TradeStatus> = {
  forming: 'watching',
  watching: 'watching',
  ready: 'entry_reached',
  entry_reached: 'entry_reached',
  planned: 'entry_reached',
  order_pending: 'active',
  position_active: 'active',
  invalidated: 'invalidated',
  closed: 'closed',
};

export const alertStatus = (state: AlertCardState): TradeStatus => STATUS[state] ?? 'watching';

/**
 * WHICH PRODUCT THIS CARD IS.
 *
 * "A complete swing setup, unusual options activity, and a long-term company
 * thesis are different products" (audit, F06). The first two arrive on this
 * board and they are told apart by the DATA, never by the mode: the
 * options-flow engine publishes a contract and no levels, because a contract is
 * the whole of what it found. A swing card that happens to name contracts as a
 * way of expressing a stock idea still has an entry, and is still a setup.
 */
export type SetupKind = 'stock_setup' | 'options_activity' | 'signal_only';

export function setupKind(alert: AlertCard): SetupKind {
  const t = alert.trade;
  const hasLevels = !!(levelText(t.entry) || levelText(t.stop) || levelText(t.target));
  if (hasLevels) return 'stock_setup';
  if ((alert.recommended_options ?? []).length > 0) return 'options_activity';
  return 'signal_only';
}

/** What to call it, in the words the card prints above the headline. */
export function setupTypeLabel(alert: AlertCard): string {
  const mode = (alert.mode_label ?? '').trim();
  switch (setupKind(alert)) {
    case 'options_activity':
      return 'Unusual options activity';
    case 'stock_setup':
      return mode ? `${mode} setup` : 'Setup';
    default:
      return mode ? `${mode} signal` : 'Signal';
  }
}

/**
 * THE EXIT PLAN, OR THE STATED ABSENCE OF ONE.
 *
 * The audit asks for a visible "No exit plan supplied" state and it is right to:
 * the options-flow engine computes no stop and no target, and a card that
 * simply omits those two boxes reads as a card whose stop is somewhere else on
 * the screen. `note` is the server's own sentence about why, and it is printed
 * next to this rather than instead of it.
 */
export type ExitPlan =
  | { kind: 'complete' }
  | { kind: 'partial'; missing: 'stop' | 'target'; line: string }
  | { kind: 'none'; line: string };

export function exitPlan(alert: AlertCard): ExitPlan {
  const stop = levelText(alert.trade.stop);
  const target = levelText(alert.trade.target);
  if (stop && target) return { kind: 'complete' };
  if (!stop && !target) return { kind: 'none', line: 'No exit plan supplied' };
  return stop
    ? { kind: 'partial', missing: 'target', line: 'No target supplied' }
    : { kind: 'partial', missing: 'stop', line: 'No stop supplied' };
}

/**
 * HOW THE REWARD IS ALLOWED TO BE DRAWN.
 *
 * The kit's ruler measures three numbers. Where the card has three numbers it
 * gets the ruler, and the meter and the strip above it are then the same
 * arithmetic and can never disagree. Where it does not — an entry zone, most
 * often — the server's own `rr` string is STATED as the string it is, and where
 * there is neither, the card says so. Three honest states, no fourth that
 * guesses.
 */
export type RewardPlan =
  | { kind: 'measured' }
  | { kind: 'stated'; text: string }
  | { kind: 'absent'; line: string };

export function rewardPlan(alert: AlertCard, idea: TradeIdea): RewardPlan {
  if (riskReward(idea)) return { kind: 'measured' };
  const rr = levelText(alert.trade.rr);
  if (rr) return { kind: 'stated', text: rr };
  return { kind: 'absent', line: 'No reward ratio supplied' };
}

/**
 * IS THIS ONLY AN IDEA, OR IS SOMETHING RUNNING?
 *
 * The audit's acceptance test names this in as many words, so the card answers
 * it in a sentence rather than leaving it to be inferred from a lifecycle dot.
 * `order_pending` and `position_active` are the only two states in which
 * anything of the member's is committed.
 */
export type Availability = {
  kind: 'idea' | 'order' | 'position' | 'over';
  line: string;
};

export function availability(alert: AlertCard): Availability {
  switch (alert.state) {
    case 'order_pending':
      return { kind: 'order', line: 'A paper order is working on this.' };
    case 'position_active':
      return { kind: 'position', line: 'You are in this trade on the paper account.' };
    case 'closed':
    case 'invalidated':
      return { kind: 'over', line: 'This one is finished. Nothing is running.' };
    default:
      return { kind: 'idea', line: 'An idea. No order has been placed.' };
  }
}

/**
 * The alert, as the kit sees it.
 *
 * `summary` is the server's own one-sentence account of what changed, and
 * `title` its headline — the two things `SetupPreview` prints as the idea's own
 * words. `candles` are the caller's, exactly as in the orders seam: this file
 * does no I/O, and an empty array is a legitimate answer that `TradeMap` draws
 * honest levels over.
 */
export function ideaFromAlert(alert: AlertCard, candles: readonly Candle[] = []): TradeIdea {
  return {
    id: alert.alert_id ?? alert.id,
    symbol: alert.symbol,
    company: alert.company ?? '',
    title: alert.headline,
    summary: alert.what_changed ?? '',
    direction: ideaDirection(alert),
    // The day-trade family issues no letter and must not be given one here;
    // the server sends "—" for it, which is a dash and not a grade.
    grade: alert.grade && alert.grade.trim() && !/^[—–-]$/.test(alert.grade.trim()) ? alert.grade : null,
    entry: levelPrice(alert.trade.entry),
    stop: levelPrice(alert.trade.stop),
    target: levelPrice(alert.trade.target),
    status: alertStatus(alert.state),
    candles: kitCandles(candles),
    dataLabel: alert.freshness_line ?? '',
  };
}

/** True when the map has at least one line to draw. Nothing else fetches bars. */
export const hasMappableLevel = (alert: AlertCard): boolean =>
  levelPrice(alert.trade.entry) != null ||
  levelPrice(alert.trade.stop) != null ||
  levelPrice(alert.trade.target) != null;
