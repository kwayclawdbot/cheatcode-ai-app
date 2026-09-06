/**
 * THE BELT LADDER, AND WHY IT IS NOT A BOX OF COLOURS.
 *
 * The obvious drawing of a belt system is the literal one: a white chip, a
 * blue chip, a purple chip, a brown chip, a black chip. That is exactly what
 * this app cannot do. The palette is locked (docs/14): violet is Kai's and
 * nothing else's, cyan is market data, green and red are financial outcomes.
 * A purple belt chip beside a member's name would read as Kai having said
 * something about them, and a blue one would read as a price.
 *
 * So the ladder is rendered in ONE hue — volt, because a belt is something the
 * member earned and volt is the member's own colour — and the RUNG is carried
 * by intensity. White is the faintest mark on the card; black is full volt.
 * The word is still printed, so the belt is never colour alone, and somebody
 * who cannot separate the five weights reads the label instead.
 *
 * Small type, hairline border, no fill. It has to sit in an author line next
 * to a name and a time without becoming the loudest thing there — this is an
 * adults' room, and a badge that shouts is a badge nobody wants to wear.
 */
import { alpha, color } from '../../ui/tokens';
import type { Belt } from '../../lib/types';

export const BELT_ORDER: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];

export const beltRank = (b: Belt): number => Math.max(0, BELT_ORDER.indexOf(b));

/** The word, when the server did not send one. */
export const BELT_LABEL: Record<Belt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

/** The mark's ink — the ladder, in volt only. */
export const BELT_INK: Record<Belt, string> = {
  white: alpha.volt20,
  blue: alpha.volt40,
  purple: alpha.volt60,
  brown: color.voltAlt,
  black: color.volt,
};

/**
 * The label's ink. The top two rungs are the only ones that get the live
 * colour: a chip where every belt is bright is a chip where the ladder means
 * nothing, and most members are on the bottom rung most of the time.
 */
export const beltTextInk = (b: Belt): string => (beltRank(b) >= 3 ? color.volt : color.muted);

export const beltBorder = (b: Belt): string => (beltRank(b) >= 3 ? alpha.volt40 : alpha.ivory20);
