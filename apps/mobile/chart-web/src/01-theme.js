/**
 * Redesign palette (2026-09-21), copied from apps/mobile/src/ui/tokens.ts.
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
  bg: '#0C0C0F',
  surface: '#1C1C20',
  surface2: '#1C1C20',
  surface3: '#0C0C0F',

  text: '#F2F2F0',
  muted: '#9A9892',
  dim: '#9A9892',

  // volt -> action orange; cyan -> neutral ink (the spec draws entry and
  // market levels off-white, and keeps green/red for target/stop).
  volt: '#FF5A1F',
  violet: '#7B45F5',
  violetLight: '#B9A2FA',
  cyan: '#F2F2F0',
  green: '#12A150',
  red: '#E5484D',
  gold: '#D7A93A',

  grid: 'rgba(242,242,240,0.045)',
  hairline: 'rgba(242,242,240,0.12)',
  /** Bars outside 09:30–16:00 New York. Market data that is real, but not regular. */
  session: 'rgba(242,242,240,0.024)',
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
    // AN OVERLAY IS CONTEXT, NOT A DECISION. Averages are the most-drawn thing
    // on a chart and the least decisive — no average is where you enter, where
    // you get out, or where you were wrong. In cyan, four of them carry the same
    // visual weight as the trigger and bury it. `muted` is already the app's
    // secondary-text grey, so this borrows no meaning and adds nothing to the
    // fourteen. Curves are told apart by their labels and their weight, never by
    // hue: one family, one meaning. Mirrors src/features/chart/semantics.ts.
    case 'indicator':
      return TOKENS.muted;
    case 'trigger':
    case 'entry':
    case 'support':
    case 'resistance':
    default:
      return TOKENS.cyan;
  }
}

/**
 * The colour a mark is drawn in: meaning first, then who placed it.
 *
 *   the member's own drawing ... action orange (theirs, not the app's analysis)
 *   Kai's marks ................ Kai violet — "violet appears only when Kai is
 *                                speaking, thinking, or taking an AI action", and
 *                                a mark Kai drew is Kai acting
 *   the trade's levels ......... always their meaning, whoever placed them:
 *                                entry off-white, stop red, target green
 *
 * Mirrors `annotationColor` in src/features/chart/semantics.ts.
 */
var TRADE_KINDS = { entry: true, stop: true, invalidation: true, target: true };
function annotationColor(a) {
  if (a.provenance === 'user') return TOKENS.volt;
  if (a.provenance === 'kai' && !TRADE_KINDS[a.kind] && a.kind !== 'indicator') return TOKENS.violetLight;
  return kindColor(a.kind);
}

/** rgba() from a #rrggbb token plus an alpha. Tokens stay hex; fills need alpha. */
function withAlpha(hex, a) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
