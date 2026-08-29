/**
 * Palette lock 14 (Volt + Violet), copied from apps/mobile/src/ui/tokens.ts.
 *
 * The page NEVER picks a colour of its own. Every value here is a token, and the
 * host may overwrite the whole object with `setTheme` so the app stays the one
 * source of truth. Lightweight Charts' own defaults (its blue #2196f3 line, its
 * white background, its #191919 grid) are all overridden explicitly — a library
 * default leaking through is the same bug as an invented colour.
 *
 * No `import`/`export`: build.mjs concatenates every src/*.js into ONE IIFE, so
 * these are plain top-level declarations sharing a single closure. That is what
 * keeps the page a single self-contained file with no bundler in the toolchain.
 */
var TOKENS = {
  bg: '#0B0B0E',
  surface: '#1C1C22',
  surface2: '#17171C',
  surface3: '#111117',

  text: '#FFF7E8',
  muted: '#B9B0A8',
  dim: '#6E675F',

  volt: '#C8FF00',
  violet: '#8B4DFF',
  violetLight: '#CBB2FF',
  cyan: '#32D6FF',
  green: '#35D07F',
  red: '#FF5A5F',
  gold: '#FFC857',

  grid: 'rgba(255,247,232,0.045)',
  hairline: 'rgba(255,247,232,0.10)',
  /** Bars outside 09:30–16:00 New York. Market data that is real, but not regular. */
  session: 'rgba(255,247,232,0.024)',
};

/**
 * Annotation semantics → token, mirroring src/features/chart/semantics.ts.
 * The host sends MEANING, never a colour, so a stop can never draw in the colour
 * that means "target" on another screen.
 */
function kindColor(kind) {
  switch (kind) {
    case 'stop':
    case 'invalidation':
      return TOKENS.red;
    case 'target':
      return TOKENS.green;
    case 'note':
      return TOKENS.violetLight;
    case 'trigger':
    case 'entry':
    case 'support':
    case 'resistance':
    default:
      return TOKENS.cyan;
  }
}

/** rgba() from a #rrggbb token plus an alpha. Tokens stay hex; fills need alpha. */
function withAlpha(hex, a) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
