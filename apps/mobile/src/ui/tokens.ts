/**
 * Design tokens — lifted verbatim from design/artboards/*.html inline styles
 * and docs/14_PALETTE_LOCK_VOLT_VIOLET.md. Artboard value wins on conflict.
 *
 * Grammar (non-negotiable):
 *   volt   = USER action      violet = KAI intelligence
 *   cyan   = MARKET data      green/red/gold = financial semantics only
 */

export const color = {
  bg: '#0B0B0E',
  surface: '#1C1C22',
  surface2: '#17171C',
  surface3: '#111117',

  text: '#FFF7E8',
  muted: '#B9B0A8',
  /**
   * THE QUIETEST INK, RAISED UNTIL IT IS ACTUALLY READABLE (audit F20).
   *
   * This was #6E675F. Measured against the ground it is drawn on — #0B0B0E —
   * that scores 3.53:1, and against a raised panel (#1C1C22) only 3.04:1. The
   * WCAG AA floor for normal-size text is 4.5:1, so every one of the ~350
   * places that reach for `dim` — alert mode notes, row metadata, stage tags,
   * lesson footers, input placeholders — were below the line, and they are
   * exactly the places that also use the SMALLEST type in the app. Small and
   * low-contrast is the same mistake made twice.
   *
   * #8E867C is the same warm grey — hue 33 vs 32, chroma unchanged — lifted
   * until it clears the floor on every opaque ground the app actually paints:
   *
   *   ground   #0B0B0E  5.48:1     surface3 #111117  5.24:1
   *   surface2 #17171C  4.98:1     surface  #1C1C22  4.72:1
   *
   * The ladder text -> muted -> dim still reads as three distinct weights
   * (18.5 / 9.2 / 5.5 on the ground), which is the point: dim has to stay
   * quiet, it just has to stop being unreadable. Translucent surfaces are
   * measured separately — see `scripts/contrast-test.mts`, which composites
   * each veil over the ground before it measures and fails the build if any
   * of this drifts back down.
   */
  dim: '#8E867C',

  volt: '#C8FF00',
  voltHover: '#D6FF3D',
  voltAlt: '#DEFF66',

  violet: '#8B4DFF',
  violetLight: '#CBB2FF',
  violetDeep: '#3B1685',

  cyan: '#32D6FF',
  cyanTint: '#0F2733',

  green: '#35D07F',
  greenTint: '#122A1E',

  red: '#FF5A5F',
  redTint: '#2E1517',

  gold: '#FFC857',
  /** A-family grade medallion gold — prototype board value (Alerts.html). */
  gradeGold: '#FFD75E',
  dangerDeep: '#B00020',
} as const;

/**
 * THE BELT LADDER — the one place the five rungs have a colour.
 * ===========================================================================
 *
 * The rule that keeps this from breaking the palette: SIGNAL IS LIT, BELT IS
 * DYED. Every colour in `color` above that carries meaning is at full chroma —
 * cyan, violet, gold, volt and red are all 100% saturation, green 62%. Every
 * belt below sits between 15% and 61%. That single gap is what lets a blue
 * belt share a screen with a cyan price without the two ever being read as the
 * same kind of statement, and it is why a room of five different belts still
 * looks like one product: they are five weights of dyed cloth, not five
 * signal lights. Hue says which rung; chroma says "this is a person, not data".
 *
 * A belt colour is allowed in exactly two places — a member's NAME and the
 * EDGE of something they authored. It is never a fill, never a chart series,
 * never a control. The word is always printed alongside it (`BeltChip`), so
 * the rung is never carried by colour alone.
 *
 * Contrast on the ground (#0B0B0E), measured, not guessed:
 *   white 18.5:1   blue 6.2:1   purple 8.1:1   brown 6.7:1   black 14.0:1
 * All well past 4.5:1, so a name is legible at every rung.
 *
 * ── WHY BLACK IS SILVER ────────────────────────────────────────────────────
 * A black belt drawn in black is invisible here — the ground already is black.
 * Every escape that keeps a hue makes it worse: gold collides with `caution`
 * and with the brown belt right below it, violet is Kai's, volt is the user's
 * own action colour and would make the top rank read as a button.
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
  /** Warm ivory — the same ink every other name in the app uses. */
  white: '#FFF7E8',
  /**
   * Steel blue — a fraction of `cyan`'s chroma and 22 degrees off its hue.
   *
   * Tuned down from a louder blue after seeing all five rungs in one list
   * (`proof/belts-04-leaderboard-five-rungs.png`): at 61% saturation it was
   * the most saturated colour in the ladder, which put the loudest hue on the
   * second-LOWEST rank. Rank is carried by the word and by the order of the
   * list, so a belt has no business competing for attention out of turn.
   */
  blue: '#7B9CC6',
  /** Orchid. A third of `violet`'s chroma so it never reads as Kai. */
  purple: '#BE9AC8',
  /** Leather tan. Darker and browner than `gold`, which stays financial. */
  brown: '#C08C5E',
  /** Polished platinum — a finish, not a hue. See the note above. */
  black: '#D6DAE1',
} as const;

/**
 * The belt as an EDGE — the hairline around something that member authored.
 * Half-strength, matching the 0.50 the volt card edge used before belts took
 * that slot, so the card's weight on the page is unchanged and only its hue
 * moved.
 */
export const beltAlpha = {
  white: 'rgba(255,247,232,0.50)',
  blue: 'rgba(123,156,198,0.50)',
  purple: 'rgba(190,154,200,0.50)',
  brown: 'rgba(192,140,94,0.50)',
  black: 'rgba(214,218,225,0.50)',
  /** The two ends of the black belt's metallic edge — graphite to platinum. */
  blackMetalDim: 'rgba(214,218,225,0.16)',
  blackMetalBright: 'rgba(214,218,225,0.72)',
} as const;

/** rgba() strings taken straight out of the artboard inline styles. */
export const alpha = {
  // ivory (text) veils
  ivory06: 'rgba(255,247,232,0.06)',
  ivory07: 'rgba(255,247,232,0.07)',
  ivory08: 'rgba(255,247,232,0.08)',
  ivory10: 'rgba(255,247,232,0.10)',
  ivory12: 'rgba(255,247,232,0.12)',
  ivory14: 'rgba(255,247,232,0.14)',
  ivory16: 'rgba(255,247,232,0.16)',
  ivory20: 'rgba(255,247,232,0.20)',
  ivory24: 'rgba(255,247,232,0.24)',
  ivory25: 'rgba(255,247,232,0.25)',

  // surface veils
  surface50: 'rgba(23,23,28,0.50)',
  surface55: 'rgba(23,23,28,0.55)',
  surface60: 'rgba(23,23,28,0.60)',
  surface65: 'rgba(23,23,28,0.65)',
  surface75: 'rgba(23,23,28,0.75)',
  chip70: 'rgba(34,34,42,0.70)',
  chip85: 'rgba(34,34,42,0.85)',

  // volt
  volt04: 'rgba(200,255,0,0.04)',
  volt05: 'rgba(200,255,0,0.05)',
  volt06: 'rgba(200,255,0,0.06)',
  volt07: 'rgba(200,255,0,0.07)',
  volt08: 'rgba(200,255,0,0.08)',
  volt10: 'rgba(200,255,0,0.10)',
  volt14: 'rgba(200,255,0,0.14)',
  volt18: 'rgba(200,255,0,0.18)',
  volt20: 'rgba(200,255,0,0.20)',
  volt40: 'rgba(200,255,0,0.40)',
  volt50: 'rgba(200,255,0,0.50)',
  volt55: 'rgba(200,255,0,0.55)',
  volt60: 'rgba(200,255,0,0.60)',
  voltAlt20: 'rgba(222,255,102,0.20)',
  voltAlt24: 'rgba(222,255,102,0.24)',
  voltAlt28: 'rgba(222,255,102,0.28)',

  // violet
  violet08: 'rgba(139,77,255,0.08)',
  violet14: 'rgba(139,77,255,0.14)',
  violet20: 'rgba(139,77,255,0.20)',
  violet22: 'rgba(139,77,255,0.22)',
  violet45: 'rgba(139,77,255,0.45)',
  violet50: 'rgba(139,77,255,0.50)',
  violet55: 'rgba(139,77,255,0.55)',
  violetLight18: 'rgba(203,178,255,0.18)',

  // cyan
  cyan07: 'rgba(50,214,255,0.07)',
  cyan10: 'rgba(50,214,255,0.10)',
  cyan14: 'rgba(50,214,255,0.14)',
  cyan40: 'rgba(50,214,255,0.40)',

  // semantic
  green12: 'rgba(53,208,127,0.12)',
  green40: 'rgba(53,208,127,0.40)',
  red10: 'rgba(255,90,95,0.10)',
  red12: 'rgba(255,90,95,0.12)',
  red14: 'rgba(255,90,95,0.14)',
  red40: 'rgba(255,90,95,0.40)',
  red45: 'rgba(255,90,95,0.45)',
  gold04: 'rgba(255,200,87,0.04)',
  gold14: 'rgba(255,200,87,0.14)',
  gold20: 'rgba(255,200,87,0.20)',
  gold40: 'rgba(255,200,87,0.40)',
  gold50: 'rgba(255,200,87,0.50)',
  gold60: 'rgba(255,200,87,0.60)',

  gradeGold03: 'rgba(255,215,94,0.03)',
  gradeGold07: 'rgba(255,215,94,0.07)',
  gradeGold12: 'rgba(255,215,94,0.12)',
  gradeGold14: 'rgba(255,215,94,0.14)',
  gradeGold16: 'rgba(255,215,94,0.16)',
  gradeGold20: 'rgba(255,215,94,0.20)',
  gradeGold22: 'rgba(255,215,94,0.22)',
  gradeGold55: 'rgba(255,215,94,0.55)',

  violet05: 'rgba(139,77,255,0.05)',
  violet06: 'rgba(139,77,255,0.06)',
  violet09: 'rgba(139,77,255,0.09)',
  violet10: 'rgba(139,77,255,0.10)',
  violet18: 'rgba(139,77,255,0.18)',
  violetLight14: 'rgba(203,178,255,0.14)',

  gold08: 'rgba(255,200,87,0.08)',
  gold12: 'rgba(255,200,87,0.12)',
  gold16: 'rgba(255,200,87,0.16)',

  ivory035: 'rgba(255,247,232,0.035)',
  ivory04: 'rgba(255,247,232,0.04)',
  ivory05: 'rgba(255,247,232,0.05)',
  surface70: 'rgba(23,23,28,0.70)',
  surface95: 'rgba(23,23,28,0.95)',
  red06: 'rgba(255,90,95,0.06)',
  red35: 'rgba(255,90,95,0.35)',
  green50: 'rgba(53,208,127,0.50)',
  violetLight50: 'rgba(203,178,255,0.50)',

  /**
   * The lower-third scrim (LIVE-8). The page ground at 82%: heavy enough that
   * a caption stays legible over candles and wicks, light enough that the chart
   * is still visibly running underneath it rather than behind a panel.
   */
  bg82: 'rgba(11,11,14,0.82)',
  black22: 'rgba(0,0,0,0.22)',
  black40: 'rgba(0,0,0,0.40)',
  black50: 'rgba(0,0,0,0.50)',
} as const;

/**
 * Panel gradients. RN has no CSS `160deg`; a 160deg CSS gradient runs
 * top-slightly-left -> bottom-slightly-right, so start {x:0.18,y:0} end {x:0.82,y:1}.
 */
export const gradientAngle = { start: { x: 0.18, y: 0 }, end: { x: 0.82, y: 1 } } as const;

export const gradient = {
  /** the standard bordered object panel */
  panel: [alpha.ivory06, alpha.surface55, alpha.surface75] as const,
  panelLocations: [0, 0.45, 1] as const,
  /** volt-selected choice card */
  voltPanel: [alpha.volt14, alpha.volt04, alpha.surface60] as const,
  voltPanelLocations: [0, 0.55, 1] as const,
  /** Kai speech bubble / Kai panel */
  kai: [alpha.violet22, alpha.violet08] as const,
  /** user speech bubble + mode chip */
  user: [alpha.volt20, alpha.volt07] as const,
  modeChip: [alpha.volt18, alpha.volt06] as const,
  /** composer pill / search pill */
  composer: [alpha.ivory07, alpha.surface60] as const,
  /** needs-attention (gold) card */
  gold: [alpha.gold14, alpha.gold04, alpha.surface60] as const,
  goldLocations: [0, 0.55, 1] as const,
  /** live (red) card */
  live: [alpha.red10, alpha.surface65] as const,
  /** kai opportunity (violet) card */
  kaiCard: [alpha.violet14, alpha.surface65] as const,
  /** continue (volt) card */
  voltCard: [alpha.volt10, alpha.surface65] as const,
  /** avatar / ticker tile */
  tile: [alpha.ivory10, alpha.chip70] as const,
  avatar: ['rgba(255,247,232,0.16)', alpha.chip85] as const,
} as const;

/** Background radial washes, per artboard `background:` declarations. */
export const wash = {
  /** V3-H1 / V3-A1 / V3-C0 / V4-TR1 / S01 / S02: violet top-left (+ cyan right on tab screens) */
  corner: {
    violet: { cx: '20%', cy: '-5%', rx: 420, ry: 320, color: 'rgba(139,77,255,0.14)', stop: 0.6 },
    cyan: { cx: '95%', cy: '30%', rx: 380, ry: 300, color: 'rgba(50,214,255,0.07)', stop: 0.65 },
  },
  /** V3-O0 / V2-O1 / S03 / V3-O1: single centred violet dome */
  dome: { cx: '50%', cy: '-8%', rx: 460, ry: 360, color: 'rgba(139,77,255,0.20)', stop: 0.62 },
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 18,
  xxxl: 20,
  pill: 999,
} as const;

export const space = {
  x2: 2, x4: 4, x5: 5, x6: 6, x7: 7, x8: 8, x9: 9, x10: 10, x11: 11,
  x12: 12, x13: 13, x14: 14, x15: 15, x16: 16, x18: 18, x20: 20,
  x22: 22, x24: 24, x26: 26, x30: 30, x40: 40,
} as const;

/**
 * THE LEGIBILITY FLOOR — nothing in this app renders below 11 logical px.
 * ===========================================================================
 *
 * Audit F20 counted important copy set at 8.5–12px: strike labels, tradability
 * tallies, contract captions, stage tags. The artboards were drawn that small
 * because a static PNG at 2x looks fine at any size; a phone in a hand does
 * not. Rather than retro-fit ~285 call sites across 85 screens — half of which
 * are being edited right now — the floor is enforced ONCE, inside `T`, which
 * every piece of text in the app already goes through.
 *
 * 11 is not an arbitrary number: it is the size `Eyebrow` has always been, so
 * the floor is "nothing is smaller than the section label", which is a rule
 * somebody can hold in their head. Anything genuinely secondary is allowed to
 * sit AT the floor; nothing is allowed below it.
 */
export const FLOOR = 11;

/**
 * Type ramp — the audit's scale (F20), not the artboard's.
 *
 * The artboards were pixel truth for round 1 and the sizes below started as
 * their inline styles. F20 measured the result on a device and asked for a
 * different ladder, so this is now the ladder and the artboard is the
 * reference for everything except size:
 *
 *   15–16   body — the default, what a sentence is set in
 *   13–14   metadata worth reading — rows, timestamps, sub-labels
 *   22–30   the numbers a decision turns on
 *   11–12   captions only, and only when they are genuinely secondary
 *
 * `micro` and `nano` are kept as names so the handful of call sites that use
 * them still compile, but they now both resolve to the floor. There is no
 * 9-pixel text in this product any more.
 */
export const type = {
  screenTitle: { size: 28, weight: 'bold' },      // "Alerts" / "Trade" / "Cheat Code Club"
  stepTitle: { size: 27, weight: 'bold', ls: -0.4, lh: 32 },  // S01/S02
  heroTitle: { size: 26, weight: 'bold', ls: -0.4, lh: 31 },  // V2-O1
  panelTitle: { size: 24, weight: 'bold', ls: -0.4, lh: 30 }, // S03 / V3-O1
  ticker: { size: 18, weight: 'bold' },
  tickerSm: { size: 17, weight: 'bold' },
  choiceTitle: { size: 17, weight: 'bold' },
  choiceTitleSm: { size: 16, weight: 'bold' },
  name: { size: 20, weight: 'bold' },
  bubble: { size: 15, lh: 22 },       // 15 * 1.45
  bubbleLg: { size: 16, lh: 23 },     // 16 * 1.45
  /** Body. The default `T` renders at, and the one number to argue about. */
  body: { size: 15, lh: 22 },
  row: { size: 15, weight: 'semibold' },
  /** Metadata worth reading — a timestamp, a sub-label, a row's second line. */
  sub: { size: 14 },
  subLh: { size: 14, lh: 21 },
  small: { size: 13 },
  /** Genuinely secondary caption. At the floor; nothing goes under it. */
  tiny: { size: FLOOR },
  /** @deprecated 10px. Resolves to the floor — kept so old call sites compile. */
  micro: { size: FLOOR },
  /** @deprecated 9px. Resolves to the floor — kept so old call sites compile. */
  nano: { size: FLOOR },
  eyebrow: { size: 11, weight: 'bold', ls: 0.88 },   // 0.08em
  eyebrowHero: { size: 11, weight: 'bold', ls: 1.1 },// 0.1em
  kicker: { size: 11, weight: 'bold', ls: 0.8 },
} as const;

/**
 * TOUCH TARGETS — a product convention, not a compliance claim.
 *
 * WCAG 2.2 AA asks for 24 CSS px with exceptions; 44 is the ENHANCED guidance
 * and the number both platforms' own HIGs use. F20 asks for 44 here, so 44 is
 * what the product promises. A control smaller than this on screen is fine as
 * long as its TOUCHABLE box is not: `minHeight`/`minWidth` where the layout can
 * take it, `hitSlop` where it cannot, and never a 26-pixel chip with nothing
 * around it.
 *
 * `gap` is the breathing room between two adjacent targets — without it, two
 * 44s that touch are one 88-wide place to make the wrong choice.
 */
export const tap = {
  /** The minimum touchable box in logical pixels. */
  min: 44,
  /** Minimum space between two adjacent targets. */
  gap: 8,
} as const;

/** Artboard chrome offsets. The 9:41 status bar is presentation only — we use
 *  safe-area insets, floored at the artboard's own content offsets. */
export const chrome = {
  tabScreenTop: 62,     // padding-top:62px on all tabbed artboards
  stackScreenTop: 74,   // padding:74px 20px 40px on onboarding artboards
  stackScreenBottom: 40,
  tabBarBottom: 30,     // padding:8px 8px 30px
} as const;
