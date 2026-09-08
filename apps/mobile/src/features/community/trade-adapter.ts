import type { TradeIdea, TradeStatus } from '../../ui/trade';
import type { RoomSetup } from './types';

/**
 * ROOM SETUP → TRADE IDEA. THE ONE PLACE THE TWO VOCABULARIES MEET.
 *
 * The wire and the kit describe the same object in different words, and they do
 * so for good reasons that are not going to be reconciled by renaming one of
 * them. `RoomSetup` comes off the API with prices as STRINGS, because a string
 * is what the server measured and parsing it at the edge is how the app avoids
 * arguing with floating point about whether the entry was 178.40. The kit takes
 * NUMBERS, because it does geometry with them — it cannot lay out a chart or
 * work out a risk/reward ratio from text.
 *
 * The third level is the one worth naming. The room calls it `invalid`: the
 * price at which the idea is wrong. The kit calls it `stop`: the price at which
 * you are out. Those are the same number and different sentences, and the kit's
 * word wins here only because the kit is the shared layer. Nothing about the
 * room's language changes.
 *
 * Everything this file does is mechanical, and that is the point — it is the
 * seam, so it is the only file that has to be read when the wire changes.
 * Every later migration step reuses it rather than re-deriving it.
 */

/** A wire string becomes a number, or nothing. Never NaN, never a silent zero. */
const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The room's lifecycle words, mapped onto the kit's.
 *
 * Anything unrecognised becomes `watching`, which is the honest default: it is
 * the state that claims the least. Guessing `active` off an unknown string
 * would put a member in a trade the server never said they were in.
 */
const STATE: Record<string, TradeStatus> = {
  watching: 'watching',
  pending: 'watching',
  armed: 'watching',
  triggered: 'entry_reached',
  entry_reached: 'entry_reached',
  active: 'active',
  open: 'active',
  running: 'active',
  closed: 'closed',
  filled: 'closed',
  invalidated: 'invalidated',
  invalid: 'invalidated',
  stopped: 'invalidated',
  expired: 'expired',
};

export const statusFromState = (state: string): TradeStatus =>
  STATE[String(state).toLowerCase()] ?? 'watching';

/**
 * `candles` is deliberately empty.
 *
 * This lane has no candles endpoint — that is MOBILE-A's `/market/candles` —
 * and the kit is explicit that missing bars draw an honest empty history with
 * the supplied levels rather than an invented shape. The room has never drawn a
 * price series and does not start now; it draws its own band from the levels,
 * which is a different and truthful thing.
 */
export function ideaFromRoomSetup(
  setup: RoomSetup,
  opts?: { title?: string | null; company?: string | null },
): TradeIdea {
  const entry = num(setup.entry);
  const target = num(setup.target);
  /*
   * DERIVED, not assumed. The wire carries no direction, and defaulting every
   * setup to `long` would be the app inventing a fact about somebody's trade.
   * Where both levels are known the answer is arithmetic rather than a guess:
   * a target above the entry is a long, below it is a short. Where either is
   * missing there is nothing to derive, so it falls to `long` — which for this
   * component is inert, because a compact preview prints the three levels and
   * computes no risk/reward from them.
   */
  const direction =
    entry != null && target != null && target < entry ? 'short' : 'long';
  return {
    id: setup.id,
    symbol: setup.symbol,
    company: opts?.company ?? '',
    title: opts?.title ?? setup.headline ?? '',
    summary: '',
    direction,
    grade: setup.grade_display,
    entry,
    stop: num(setup.invalid),
    target,
    status: statusFromState(setup.state),
    candles: [],
    dataLabel: "Levels from Kai's plan",
  };
}
