/**
 * Design tokens — THE REDESIGN PALETTE (owner pack, 2026-09-21).
 * ===========================================================================
 *
 * Source: docs/design/redesign-2026-09-21/CheatCode_UI_Redesign_Spec.md.
 * This file is the only place a colour, a type size or a corner radius is
 * written down. Both UI layers read it (see apps/mobile/AGENTS.md).
 *
 * Grammar (the spec's four rules, non-negotiable):
 *   ORANGE  = the CheatCode brand and the primary action. Active nav, buttons.
 *   VIOLET  = Kai, and only Kai: speaking, thinking, taking an AI action.
 *   GREEN / RED = market meaning only. Targets and gains / stops and losses.
 *   GOLD    = an A or A+ setup grade. Nothing else.
 *   Everything else is neutral: canvas, surface, raised, two inks, one border.
 *
 * Screens never pick a raw hex. They pick a SEMANTIC name from `color` —
 * `color.action`, `color.kai`, `color.marketUp`, `color.grade` — and the
 * value lives here once.
 *
 * ── THE LEGACY NAMES ───────────────────────────────────────────────────────
 * The app was built on a volt / violet / cyan palette and ~2,500 call sites
 * name those colours directly (`color.volt`, `alpha.cyan40`, ...). They are
 * kept below as ALIASES of the new semantic colours so the whole app switched
 * in one commit instead of one screen at a time:
 *
 *   volt  (the user acting)  -> action orange
 *   cyan  (market data ink)  -> neutral text  (the spec removes cyan prices:
 *                               an entry price is off-white, not blue)
 *   gold  (needs attention)  -> grade gold    (screen lanes should move any
 *                               "caution" use that is not a grade to `muted`
 *                               or `marketDown` — the spec gives gold to A/A+)
 *   dim   (the third ink)    -> secondary ink (the spec has TWO inks)
 *
 * New code uses the semantic names. The aliases exist so nothing broke on
 * the day of the switch; delete one when its last caller has moved.
 */

/** The spec's table, verbatim. Private-ish: screens read `color`, not this. */
export const palette = {
  canvas: '#0C0C0F',
  surface: '#151518',
  raised: '#1C1C20',
  border: 'rgba(242,242,240,0.12)',
  textPrimary: '#F2F2F0',
  textSecondary: '#9A9892',
  orange: '#FF5A1F',
  /** Gradient highlight only — never a flat fill or an ink on its own. */
  orangeLight: '#FF8A3D',
  violet: '#7B45F5',
  positive: '#12A150',
  negative: '#E5484D',
  gold: '#D7A93A',
} as const;

/** `rgba()` of a `#RRGGBB` at an alpha. Used to build the veil ladders below. */
function rgba(hex: string, a: number): string {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Kai's INK. `palette.violet` is a surface colour — as text on the canvas it
 * scores 3.7:1, under the 4.5:1 floor for small text (contrast-test asserts
 * this out loud). When Kai speaks in words, the words are this lighter violet.
 */
const KAI_INK = '#B9A2FA';

export const color = {
  // ── grounds ─────────────────────────────────────────────────────────────
  /** The app background. */
  canvas: palette.canvas,
  /** Cards and navigation. (Named `card` below too, for readability.) */
  surface: palette.surface,
  card: palette.surface,
  /** Selected and modal surfaces — sheets, a selected segment, a pressed row. */
  raised: palette.raised,

  // ── inks ────────────────────────────────────────────────────────────────
  /** Headlines and key values. */
  textPrimary: palette.textPrimary,
  /** Supporting information. */
  textSecondary: palette.textSecondary,
  /** Dark ink for text sitting ON an orange fill (white on orange fails AA). */
  onAction: palette.canvas,

  // ── brand / action ──────────────────────────────────────────────────────
  brand: palette.orange,
  action: palette.orange,
  /** Gradient highlight partner for `action`. Never used flat. */
  actionLight: palette.orangeLight,

  // ── Kai ─────────────────────────────────────────────────────────────────
  /** Kai as a surface / edge / glow. */
  kai: palette.violet,
  /** Kai as words. */
  kaiInk: KAI_INK,
  kaiDeep: '#2A1760',

  // ── market meaning ──────────────────────────────────────────────────────
  marketUp: palette.positive,
  marketDown: palette.negative,
  /** The positive colour at 14% over the canvas — a quiet "gain" well. */
  marketUpTint: '#0D2118',
  /** The negative colour at 14% over the canvas. */
  marketDownTint: '#2A1418',
  /** An entry price. Neutral off-white — entry is a plan, not a result. */
  priceEntry: palette.textPrimary,
  priceStop: palette.negative,
  priceTarget: palette.positive,

  // ── grade ───────────────────────────────────────────────────────────────
  /** A / A+ setup accent only. */
  grade: palette.gold,

  // ── LEGACY ALIASES (see header) ─────────────────────────────────────────
  bg: palette.canvas,
  surface2: palette.raised,
  /** The recessed well inside a card: the canvas showing through. */
  surface3: palette.canvas,
  text: palette.textPrimary,
  muted: palette.textSecondary,
  /**
   * THE THIRD INK IS GONE — `dim` is the secondary ink now.
   *
   * The old palette had text -> muted -> dim. The spec defines exactly two
   * inks, and a third step quiet enough to read as a step (≥1.4:1 below
   * secondary) cannot also clear 4.5:1 on a raised surface — the arithmetic is
   * in scripts/contrast-test.mts. So the ~470 `dim` call sites render in the
   * secondary ink, which is what the spec draws on every board.
   */
  dim: palette.textSecondary,
  volt: palette.orange,
  voltHover: palette.orangeLight,
  voltAlt: palette.orangeLight,
  violet: palette.violet,
  violetLight: KAI_INK,
  violetDeep: '#2A1760',
  cyan: palette.textPrimary,
  cyanTint: palette.raised,
  green: palette.positive,
  greenTint: '#0D2118',
  red: palette.negative,
  redTint: '#2A1418',
  gold: palette.gold,
  gradeGold: palette.gold,
  dangerDeep: '#9E2A2E',
} as const;

/**
 * THE BELT LADDER — the one place the five rungs have a colour.
 * ===========================================================================
 *
 * The rule that keeps this from breaking the palette: SIGNAL IS LIT, BELT IS
 * DYED. The colours that carry meaning — action orange, Kai violet, the two
 * market colours and grade gold — sit at 66–100% HSL saturation. Every belt
 * below sits between 15% and 44%. That gap is what lets a purple belt share a
 * screen with Kai without the two ever being read as the same kind of
 * statement, and it is why a room of five different belts still looks like one
 * product: they are five weights of dyed cloth, not five signal lights. Hue
 * says which rung; chroma says "this is a person, not data". The thresholds
 * are enforced in scripts/belt-palette-test.mts.
 *
 * A belt colour is allowed in exactly two places — a member's NAME and the
 * EDGE of something they authored. It is never a fill, never a chart series,
 * never a control. The word is always printed alongside it (`BeltChip`), so
 * the rung is never carried by colour alone.
 *
 * ── WHY BLACK IS SILVER ────────────────────────────────────────────────────
 * A black belt drawn in black is invisible here — the ground already is black.
 * Every escape that keeps a hue makes it worse: gold is the grade's, violet is
 * Kai's, orange is the action colour and would make the top rank read as a
 * button.
 *
 * So black is not given a hue at all, which is the honest reading of it: black
 * is the absence of dye. It is rendered as a FINISH instead — polished
 * platinum, the only near-achromatic entry in the ladder (15% saturation), and
 * the brightest, so the top of the ladder is also the most present. On a card
 * it is the only edge drawn as a metallic gradient rather than a flat hairline
 * (see `beltEdgeGradient` in features/social/belts.ts). Cloth for the four
 * dyed rungs; metal for the one that has stopped being cloth.
 */
export const belt = {
  /** The house primary ink — the same ink every other name in the app uses. */
  white: palette.textPrimary,
  /** Steel blue. Tuned down so the second-lowest rank is not the loudest hue. */
  blue: '#7B9CC6',
  /** Orchid. A third of Kai violet's chroma so it never reads as Kai. */
  purple: '#BE9AC8',
  /** Leather tan. Darker and less saturated than grade gold. */
  brown: '#C08C5E',
  /** Polished platinum — a finish, not a hue. See the note above. */
  black: '#D6DAE1',
} as const;

/**
 * The belt as an EDGE — the hairline around something that member authored.
 * Half-strength, so the card's weight on the page is set by the belt's hue and
 * not by a louder line.
 */
export const beltAlpha = {
  white: rgba(palette.textPrimary, 0.5),
  blue: 'rgba(123,156,198,0.50)',
  purple: 'rgba(190,154,200,0.50)',
  brown: 'rgba(192,140,94,0.50)',
  black: 'rgba(214,218,225,0.50)',
  /** The two ends of the black belt's metallic edge — graphite to platinum. */
  blackMetalDim: 'rgba(214,218,225,0.16)',
  blackMetalBright: 'rgba(214,218,225,0.72)',
};

/**
 * Veils — a colour at an alpha. The key names are the historical ones
 * (`ivory12`, `volt50`, `cyan40`) so every call site kept compiling; each
 * family now points at its new semantic colour:
 *
 *   ivory*        -> primary ink        (hairlines, quiet fills)
 *   volt, voltAlt  -> action orange / orange light
 *   violet*       -> Kai violet;  violetLight* -> Kai ink
 *   cyan*         -> primary ink        (cyan prices are gone; neutral wells)
 *   green* / red* -> market up / down
 *   gold* / gradeGold* -> grade gold
 *   surface* / chip* / bg* -> surface / raised / canvas
 *
 * New semantic names are at the bottom (`border`, `action10`, `kai14`, ...).
 */
const T = palette.textPrimary;
const O = palette.orange;
const OL = palette.orangeLight;
const V = palette.violet;
const G = palette.positive;
const R = palette.negative;
const AU = palette.gold;
export const alpha = {
  // ink veils
  ivory035: rgba(T, 0.035), ivory04: rgba(T, 0.04), ivory05: rgba(T, 0.05),
  ivory06: rgba(T, 0.06), ivory07: rgba(T, 0.07), ivory08: rgba(T, 0.08),
  ivory10: rgba(T, 0.1), ivory12: palette.border, ivory14: rgba(T, 0.14),
  ivory16: rgba(T, 0.16), ivory20: rgba(T, 0.2), ivory24: rgba(T, 0.24),
  ivory25: rgba(T, 0.25),

  // surface veils
  surface50: rgba(palette.surface, 0.5), surface55: rgba(palette.surface, 0.55),
  surface60: rgba(palette.surface, 0.6), surface65: rgba(palette.surface, 0.65),
  surface70: rgba(palette.surface, 0.7), surface75: rgba(palette.surface, 0.75),
  surface95: rgba(palette.surface, 0.95),
  chip70: rgba(palette.raised, 0.7), chip85: rgba(palette.raised, 0.85),

  // volt -> action orange
  volt04: rgba(O, 0.04), volt05: rgba(O, 0.05), volt06: rgba(O, 0.06),
  volt07: rgba(O, 0.07), volt08: rgba(O, 0.08), volt10: rgba(O, 0.1),
  volt14: rgba(O, 0.14), volt18: rgba(O, 0.18), volt20: rgba(O, 0.2),
  volt40: rgba(O, 0.4), volt50: rgba(O, 0.5), volt55: rgba(O, 0.55),
  volt60: rgba(O, 0.6),
  voltAlt20: rgba(OL, 0.2), voltAlt24: rgba(OL, 0.24), voltAlt28: rgba(OL, 0.28),

  // violet -> Kai
  violet05: rgba(V, 0.05), violet06: rgba(V, 0.06), violet08: rgba(V, 0.08),
  violet09: rgba(V, 0.09), violet10: rgba(V, 0.1), violet14: rgba(V, 0.14),
  violet18: rgba(V, 0.18), violet20: rgba(V, 0.2), violet22: rgba(V, 0.22),
  violet45: rgba(V, 0.45), violet50: rgba(V, 0.5), violet55: rgba(V, 0.55),
  violetLight14: rgba(KAI_INK, 0.14), violetLight18: rgba(KAI_INK, 0.18),
  violetLight50: rgba(KAI_INK, 0.5),

  // cyan -> neutral
  cyan07: rgba(T, 0.07), cyan10: rgba(T, 0.1), cyan14: rgba(T, 0.14), cyan40: rgba(T, 0.4),

  // market
  green12: rgba(G, 0.12), green40: rgba(G, 0.4), green50: rgba(G, 0.5),
  red06: rgba(R, 0.06), red10: rgba(R, 0.1), red12: rgba(R, 0.12), red14: rgba(R, 0.14),
  red35: rgba(R, 0.35), red40: rgba(R, 0.4), red45: rgba(R, 0.45),

  // gold -> grade
  gold04: rgba(AU, 0.04), gold08: rgba(AU, 0.08), gold12: rgba(AU, 0.12),
  gold14: rgba(AU, 0.14), gold16: rgba(AU, 0.16), gold20: rgba(AU, 0.2),
  gold40: rgba(AU, 0.4), gold50: rgba(AU, 0.5), gold60: rgba(AU, 0.6),
  gradeGold03: rgba(AU, 0.03), gradeGold07: rgba(AU, 0.07), gradeGold12: rgba(AU, 0.12),
  gradeGold14: rgba(AU, 0.14), gradeGold16: rgba(AU, 0.16), gradeGold20: rgba(AU, 0.2),
  gradeGold22: rgba(AU, 0.22), gradeGold55: rgba(AU, 0.55),

  /**
   * The lower-third scrim (LIVE-8). The canvas at 82%: heavy enough that a
   * caption stays legible over candles, light enough that the chart is still
   * visibly running underneath it.
   */
  bg82: rgba(palette.canvas, 0.82),
  bg40: rgba(palette.canvas, 0.4),
  black22: 'rgba(0,0,0,0.22)',
  black28: 'rgba(0,0,0,0.28)',
  black40: 'rgba(0,0,0,0.40)',
  black50: 'rgba(0,0,0,0.50)',
  black72: 'rgba(0,0,0,0.72)',

  // ── semantic veil names (use these in new code) ─────────────────────────
  /** The one default border: primary ink at 12%. */
  border: palette.border,
  /** A quieter divider inside a card. */
  divider: rgba(T, 0.08),
  /** Translucent dock / composer fill — used under a blur, never as a card. */
  dock: rgba(palette.surface, 0.78),
  action10: rgba(O, 0.1),
  action14: rgba(O, 0.14),
  action40: rgba(O, 0.4),
  kai08: rgba(V, 0.08),
  kai14: rgba(V, 0.14),
  kai40: rgba(V, 0.4),
  marketUp12: rgba(G, 0.12),
  marketUp40: rgba(G, 0.4),
  marketDown12: rgba(R, 0.12),
  marketDown40: rgba(R, 0.4),
  grade14: rgba(AU, 0.14),
  grade40: rgba(AU, 0.4),
};

/**
 * Gradient geometry. RN has no CSS `160deg`; a 160deg CSS gradient runs
 * top-slightly-left -> bottom-slightly-right.
 */
export const gradientAngle = { start: { x: 0.18, y: 0 }, end: { x: 0.82, y: 1 } } as const;

/**
 * GRADIENTS, FLATTENED.
 *
 * The spec's cards are flat: one surface colour, a 1px border, a soft shadow.
 * No full-card tints, no grade gradients, no glow washes. The names are kept
 * because ~30 LinearGradient call sites hand these arrays straight to it; every
 * neutral one is now two or three stops of the SAME colour, so it paints flat.
 *
 * The only tinted ones left are the ones the spec actually draws:
 *   - `kai` / `kaiCard`: Kai speaking gets a faint violet — Kai's thesis card
 *     has a violet outline and glow on the V1 Trade Detail board.
 *   - `user`: the member's own chat bubble is a warm orange-brown on V2.
 *   - `brandButton`: the orange primary button with its light highlight.
 */
const S = palette.surface;
const RS = palette.raised;
export const gradient = {
  panel: [S, S, S] as const,
  panelLocations: [0, 0.45, 1] as const,
  /** a SELECTED choice card: the raised surface, flat. The orange edge says "chosen". */
  voltPanel: [RS, RS, RS] as const,
  voltPanelLocations: [0, 0.55, 1] as const,
  kai: [rgba(V, 0.16), rgba(V, 0.07)] as const,
  user: [rgba(O, 0.18), rgba(O, 0.1)] as const,
  modeChip: [rgba(O, 0.14), rgba(O, 0.14)] as const,
  composer: [RS, RS] as const,
  gold: [S, S, S] as const,
  goldLocations: [0, 0.55, 1] as const,
  live: [S, S] as const,
  kaiCard: [rgba(V, 0.1), S] as const,
  voltCard: [S, S] as const,
  tile: [RS, RS] as const,
  avatar: [RS, RS] as const,
  /** The primary action fill: orange with its gradient-only light partner. */
  brandButton: [OL, O] as const,
};

/**
 * Background washes — RETIRED. The spec's canvas is flat. `Wash` still exists
 * (7 screens mount it) and paints the plain canvas; these values are kept only
 * so its types compile, at zero opacity.
 */
export const wash = {
  corner: {
    violet: { cx: '20%', cy: '-5%', rx: 420, ry: 320, color: rgba(V, 0), stop: 0.6 },
    cyan: { cx: '95%', cy: '30%', rx: 380, ry: 300, color: rgba(T, 0), stop: 0.65 },
  },
  dome: { cx: '50%', cy: '-8%', rx: 460, ry: 360, color: rgba(V, 0), stop: 0.62 },
} as const;

/**
 * Corner radii. The spec names three: card 18, control 14, pill 999.
 * The t-shirt sizes are the historical ones and still resolve; new code uses
 * `card` / `control` / `pill`.
 */
export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 18,
  xxxl: 20,
  pill: 999,
  /** Cards, panels, sheets' inner cards. */
  card: 18,
  /** Buttons, inputs, segmented controls, icon buttons. */
  control: 14,
} as const;

/**
 * THE 8-POINT GRID. `grid.x1` is one unit (8). Half a unit (4) is allowed for
 * the gap between an icon and its label; nothing else is off the grid.
 */
export const grid = {
  half: 4,
  x1: 8,
  x2: 16,
  x3: 24,
  x4: 32,
  x5: 40,
  x6: 48,
} as const;

/** The spec's layout numbers. */
export const layout = {
  /** Left / right screen padding. */
  gutter: 20,
  /** Vertical space between two cards. */
  cardGap: 12,
  /** Inside a card. Two grid units. */
  cardPad: 16,
  /** Default border width. */
  border: 1,
  /** The dock's icon: one optical size, one stroke. */
  navIcon: 22,
  navStroke: 1.75,
} as const;

/**
 * The card shadow: `0 10px 30px rgba(0,0,0,.24)`. React Native 0.76+ reads
 * `boxShadow` on iOS, Android (new architecture) and web alike, so the spec's
 * CSS value is used as-is instead of four platform-specific shadow props.
 */
export const shadow = {
  card: '0 10px 30px rgba(0,0,0,0.24)',
  none: 'none',
} as const;

/** The historical spacing names. New code uses `grid` and `layout`. */
export const space = {
  x2: 2, x4: 4, x5: 5, x6: 6, x7: 7, x8: 8, x9: 9, x10: 10, x11: 11,
  x12: 12, x13: 13, x14: 14, x15: 15, x16: 16, x18: 18, x20: 20,
  x22: 22, x24: 24, x26: 26, x30: 30, x40: 40,
} as const;

/**
 * THE LEGIBILITY FLOOR — nothing in this app renders below 11 logical px.
 * Enforced once, inside `T` (ui/Text.tsx), which every piece of text goes
 * through. The spec's smallest size is `meta` at 12, so the floor only ever
 * catches a stray literal.
 */
export const FLOOR = 11;

/**
 * THE TYPE SCALE — exactly the spec's six named styles.
 * ===========================================================================
 *
 *   screenTitle   32/38  700   sans   "Alerts", "Kai", "CheatCode Community"
 *   sectionTitle  20/26  650   sans   "Today's Brief", "Live rooms"
 *   cardTitle     17/22  650   sans   the ticker line on a card, a row title
 *   body          15/22  400   sans   sentences
 *   meta          12/16  500   sans   timestamps, labels, captions
 *   keyPrice      26/30  650   mono   the one price a card is about
 *
 * `<T variant="meta">` picks one. Geist ships 600 and 700 as static faces, not
 * 650, so the spec's 650 renders as SemiBold (600) — the nearest real weight.
 *
 * Every size is multiplied by the member's text-size setting inside `T`
 * (the owner reads at ~130%), and line height grows with it.
 */
export type TextVariant = 'screenTitle' | 'sectionTitle' | 'cardTitle' | 'body' | 'meta' | 'keyPrice';
export const typeScale: Record<TextVariant, {
  size: number; lh: number; weight: 'regular' | 'medium' | 'semibold' | 'bold'; mono: boolean; ls: number;
}> = {
  screenTitle: { size: 32, lh: 38, weight: 'bold', mono: false, ls: -0.5 },
  sectionTitle: { size: 20, lh: 26, weight: 'semibold', mono: false, ls: -0.2 },
  cardTitle: { size: 17, lh: 22, weight: 'semibold', mono: false, ls: 0 },
  body: { size: 15, lh: 22, weight: 'regular', mono: false, ls: 0 },
  meta: { size: 12, lh: 16, weight: 'medium', mono: false, ls: 0 },
  keyPrice: { size: 26, lh: 30, weight: 'semibold', mono: true, ls: -0.3 },
};

/**
 * The historical ramp, re-pointed at the scale so old call sites land on a
 * spec size. New code uses `typeScale` through `<T variant>`.
 */
export const type = {
  screenTitle: { size: 32, weight: 'bold', lh: 38 },
  sectionTitle: { size: 20, weight: 'semibold', lh: 26 },
  cardTitle: { size: 17, weight: 'semibold', lh: 22 },
  keyPrice: { size: 26, weight: 'semibold', lh: 30 },
  stepTitle: { size: 32, weight: 'bold', ls: -0.5, lh: 38 },
  heroTitle: { size: 32, weight: 'bold', ls: -0.5, lh: 38 },
  panelTitle: { size: 20, weight: 'semibold', lh: 26 },
  ticker: { size: 17, weight: 'semibold' },
  tickerSm: { size: 17, weight: 'semibold' },
  choiceTitle: { size: 17, weight: 'semibold' },
  choiceTitleSm: { size: 17, weight: 'semibold' },
  name: { size: 20, weight: 'semibold' },
  bubble: { size: 15, lh: 22 },
  bubbleLg: { size: 15, lh: 22 },
  body: { size: 15, lh: 22 },
  row: { size: 15, weight: 'semibold' },
  sub: { size: 12, lh: 16 },
  subLh: { size: 12, lh: 16 },
  small: { size: 12 },
  meta: { size: 12, lh: 16 },
  tiny: { size: 12 },
  /** @deprecated resolves to meta. */
  micro: { size: 12 },
  /** @deprecated resolves to meta. */
  nano: { size: 12 },
  /** @deprecated uppercase tracked labels are gone — this is meta now. */
  eyebrow: { size: 12, weight: 'medium', ls: 0 },
  eyebrowHero: { size: 12, weight: 'medium', ls: 0 },
  kicker: { size: 12, weight: 'medium', ls: 0 },
} as const;

/**
 * TOUCH TARGETS — 44×44 logical pixels, the spec's minimum and both
 * platforms' HIG number. A control drawn smaller than this keeps its looks
 * and gets the rest of its box from `hitSlop` — see `hitSlopFor()` in
 * ui/touch.ts, which computes exactly the slop a given visual size needs.
 * `scripts/touch-target-test.mts` scans every Pressable for it.
 */
export const tap = {
  /** The minimum touchable box in logical pixels. */
  min: 44,
  /** Minimum space between two adjacent targets. */
  gap: 8,
} as const;

/** Screen chrome offsets. Safe-area insets win; these are floors. */
export const chrome = {
  tabScreenTop: 62,
  stackScreenTop: 74,
  stackScreenBottom: 40,
  tabBarBottom: 30,
} as const;
