/**
 * THE BELT LADDER — WHAT EACH RUNG LOOKS LIKE.
 *
 * ── WHAT CHANGED, AND WHY ──────────────────────────────────────────────────
 * This file used to draw the whole ladder in volt at five intensities, and the
 * reasoning was sound: the palette is locked (docs/14), violet is Kai's, cyan
 * is market data, so a purple chip beside a name risked reading as "Kai said
 * something about this member" and a blue one as a price.
 *
 * The owner has asked for the literal thing — a member's name in their belt's
 * colour, and their cards edged in it — and that ask is right, because the
 * volt-only ladder solved the collision by removing the information. Five
 * weights of the same yellow-green is not a thing anybody reads as a rank;
 * it is a thing people read as a rendering bug.
 *
 * The collision is real, so it is solved properly instead of avoided:
 * SIGNAL IS LIT, BELT IS DYED. Every house colour that carries meaning is at
 * full chroma; every belt sits at 15–61% saturation. A blue belt is not the
 * market's cyan because it is half as saturated and 20 degrees round the
 * wheel; an orchid purple is not Kai's violet because it has a third of the
 * chroma. The values, the measured contrasts and the full argument live over
 * `belt` in `src/ui/tokens.ts` — the palette has exactly one source and this
 * file is not it.
 *
 * ── WHERE A BELT COLOUR IS ALLOWED ─────────────────────────────────────────
 * Two places, and no others:
 *   1. a member's NAME            — `beltInk`
 *   2. the EDGE of what they wrote — `beltEdge` / `beltEdgeGradient`
 * Never a fill, never a control, never a chart series. Volt still means the
 * user acting: the buttons, the COMMUNITY TRADE eyebrow and the authorship
 * wash on a call card are all still volt, and only the hairline moved.
 *
 * The word is always printed next to the colour (`BeltChip`), so nobody has to
 * separate five hues to know what rank they are looking at.
 */
import { alpha, belt as beltColor, beltAlpha, color } from '../../ui/tokens';
import type { Belt } from '../../lib/types';

export const BELT_ORDER: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];

export const beltRank = (b: Belt): number => Math.max(0, BELT_ORDER.indexOf(b));

/** Guards a value off the wire before it is used to index the maps below. */
export const isBelt = (v: unknown): v is Belt =>
  typeof v === 'string' && (BELT_ORDER as string[]).includes(v);

/** The word, when the server did not send one. */
export const BELT_LABEL: Record<Belt, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

/** The belt's own colour. The mark on the chip, and the rungs of the ladder. */
export const BELT_INK: Record<Belt, string> = {
  white: beltColor.white,
  blue: beltColor.blue,
  purple: beltColor.purple,
  brown: beltColor.brown,
  black: beltColor.black,
};

/**
 * A MEMBER'S NAME, IN THEIR BELT.
 *
 * White is the house ivory — the colour every name in this app already was —
 * so the common case is not a change at all. That matters more than it looks:
 * most members are on the bottom rung most of the time, and a room where every
 * name is tinted is a room where the tint has stopped meaning anything. The
 * ladder reads because four names in ivory make the fifth one legible as
 * *earned*.
 */
export const beltInk = (b: Belt): string => BELT_INK[b] ?? beltColor.white;

/**
 * THE EDGE OF SOMETHING THEY AUTHORED.
 *
 * Half strength, which is exactly where the volt card edge sat before belts
 * took that slot — so a community call card weighs the same on the page as it
 * always did and only its hue moved.
 */
export const beltEdge = (b: Belt): string => beltAlpha[b] ?? beltAlpha.white;

/**
 * The edge as a gradient, because the black belt's is metal.
 *
 * Every rung returns a three-stop array so there is ONE code path and one
 * geometry: the four dyed belts return their own colour three times, which
 * renders as a flat hairline indistinguishable from a solid border. Black
 * returns graphite → platinum → graphite, which catches the light across the
 * corner the way a polished edge does. A `LinearGradient` border that only
 * some cards had would be a second layout to keep in step with the first.
 */
export const beltEdgeGradient = (b: Belt): readonly [string, string, string] =>
  b === 'black'
    ? [beltAlpha.blackMetalDim, beltAlpha.blackMetalBright, beltAlpha.blackMetalDim]
    : [beltEdge(b), beltEdge(b), beltEdge(b)];

/** True where the edge actually varies — the one case worth a gradient node. */
export const beltEdgeIsMetal = (b: Belt): boolean => b === 'black';

/**
 * The chip's own hairline. Quieter than the card edge: the chip sits ON a card
 * that is already wearing the belt, and two statements of the same colour an
 * inch apart is one too many.
 */
export const beltBorder = (b: Belt): string => (b === 'white' ? alpha.ivory20 : beltEdge(b));

/**
 * The chip's WORD stays quiet ink at every rung.
 *
 * The name beside it is already in the belt's colour. Printing the word in the
 * same colour would say it twice in two type sizes on one line, and the chip's
 * job is to be the thing you read when you cannot separate the hues — a
 * caption, not a second badge.
 */
export const beltTextInk = (_b: Belt): string => color.muted;
