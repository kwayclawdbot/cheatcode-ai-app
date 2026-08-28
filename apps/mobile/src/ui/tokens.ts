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
  dim: '#6E675F',

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
 * Type ramp — sizes are the artboard's own px values.
 * NOTE the conversational bubbles are 14–15px in the artboards, below the
 * spec's "body >= 16" line; artboard is pixel truth per the build brief.
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
  bubble: { size: 14, lh: 20 },       // 14 * 1.45
  bubbleLg: { size: 15, lh: 22 },     // 15 * 1.45
  body: { size: 14 },
  row: { size: 14, weight: 'semibold' },
  sub: { size: 13 },
  subLh: { size: 13, lh: 20 },
  small: { size: 12 },
  tiny: { size: 11 },
  micro: { size: 10 },
  nano: { size: 9 },
  eyebrow: { size: 11, weight: 'bold', ls: 0.88 },   // 0.08em
  eyebrowHero: { size: 11, weight: 'bold', ls: 1.1 },// 0.1em
  kicker: { size: 10, weight: 'bold', ls: 0.8 },
} as const;

/** Artboard chrome offsets. The 9:41 status bar is presentation only — we use
 *  safe-area insets, floored at the artboard's own content offsets. */
export const chrome = {
  tabScreenTop: 62,     // padding-top:62px on all tabbed artboards
  stackScreenTop: 74,   // padding:74px 20px 40px on onboarding artboards
  stackScreenBottom: 40,
  tabBarBottom: 30,     // padding:8px 8px 30px
} as const;
