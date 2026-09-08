/**
 * THE THEME BRIDGE — tokens.ts is the palette, this file is the only translator.
 * ============================================================================
 *
 * Policy: "gluestack for chrome, hand-rolled for identity". The chrome layer
 * (sheets, popovers, menus, forms, toasts, inputs, admin surfaces) is built
 * from gluestack-ui v5 components styled with Tailwind semantic tokens. Those
 * semantic tokens have to be THE HOUSE COLOURS, or chrome reads as a foreign
 * library bolted onto the app.
 *
 * The obvious way to do that is to write the hex values into `global.css`.
 * That is forbidden here, and the reason is drift: a second copy of the palette
 * has no way of knowing when the first one changes. Someone retunes `volt` in
 * `src/ui/tokens.ts`, every hand-rolled screen moves, and every gluestack
 * surface silently keeps the old colour. The two halves of the app would come
 * apart one token at a time, and nothing would fail while it happened.
 *
 * So the CSS is GENERATED. This script imports `src/ui/tokens.ts` as a module —
 * the same file the hand-rolled layer imports — and writes
 * `src/ui/theme.generated.css`. That file is committed (Metro needs it on disk,
 * and a build should not depend on a codegen step having been run), but it is
 * an artifact: never hand-edit it.
 *
 * Drift is caught, not merely discouraged: `scripts/theme-bridge-test.mts`
 * regenerates the CSS in memory and diffs it against the committed file. It
 * runs in `npm test`. If anyone edits tokens.ts without regenerating, or edits
 * the generated CSS by hand, the suite goes red with instructions.
 *
 *     regenerate:  npx tsx scripts/gen-theme.mts
 *     verify:      npx tsx scripts/theme-bridge-test.mts
 *
 * ---------------------------------------------------------------------------
 * THE MAPPING — house grammar onto gluestack's semantic names
 * ---------------------------------------------------------------------------
 * The palette grammar is non-negotiable (tokens.ts says so at the top):
 *     volt = USER action     violet = KAI intelligence
 *     cyan = MARKET data     green/red/gold = financial semantics only
 *
 * gluestack's semantic set is mapped to keep that grammar intact:
 *
 *   primary      <- volt        the user's action colour. Every affirmative
 *                               button, every focus ring. NOT "brand blue".
 *   accent       <- violet      Kai. Reserved for the intelligence layer, so
 *                               an accent-coloured control reads as "Kai did
 *                               this", exactly as it does on hand-rolled cards.
 *   background   <- bg          the page ground (#0B0B0E).
 *   card         <- surface     the raised object panel.
 *   popover      <- surface2    sheets and menus sit one step darker than a
 *                               card, matching Sheet.tsx.
 *   secondary    <- surface3    the recessed well.
 *   muted        <- surface2 / muted   background + the dimmed ivory for text.
 *   foreground   <- text        ivory #FFF7E8, never pure white.
 *   border/input <- ivory12/ivory10   the hairline ladder. These are genuinely
 *                               ALPHA colours in this app — a border is ivory
 *                               at 12%, not a flat grey — see the note below.
 *   destructive  <- red         loss / danger, the same red the P&L uses.
 *
 * Plus the house semantics gluestack has no name for. These are still semantic
 * (they say what the colour MEANS, never what it looks like), so they satisfy
 * the skill's "semantic tokens only" rule:
 *
 *   kai / market / gain / loss / caution  <- violet / cyan / green / red / gold
 *
 * DELIBERATE DEVIATION from the skill's `global.css` example: that example
 * stores each token as a bare `R G B` triplet consumed as `rgb(var(--token))`.
 * A triplet cannot carry alpha, and this app's border, veil and tint ladder is
 * built out of alpha (`rgba(255,247,232,0.12)` and friends in `tokens.alpha`).
 * Storing triplets would mean flattening every hairline against an assumed
 * background — the one thing that would make chrome visibly not match. So each
 * token is emitted as a COMPLETE css colour: hex where the source is opaque,
 * rgba() where the source is a veil. The two-layer structure the skill asks for
 * is unchanged (`@layer theme` holds the raw values, `@theme inline` maps them
 * onto `--color-*` so `bg-card` / `border-border` resolve), and Tailwind v4's
 * alpha modifiers (`bg-primary/90`) still work, because v4 implements them with
 * color-mix() rather than by splicing a triplet.
 *
 * DARK-FIRST, and dark-only for now: the app is dark-only (app.json pins
 * `userInterfaceStyle: "dark"`, there is no theme provider and no colour-scheme
 * hook anywhere in src/). tokens.ts holds exactly one palette. So the values
 * are emitted on `:root` — they apply whatever uniwind's active theme is — and
 * mirrored into uniwind's `.dark` selector so `dark:` prefixed classes resolve
 * to the same colours rather than to nothing. When a light palette is ever
 * added it belongs in tokens.ts as a second export, and this generator grows a
 * second block. It does not belong in CSS.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { color, alpha, radius, belt } from '../src/ui/tokens.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const OUT = path.join(appRoot, 'src', 'ui', 'theme.generated.css');
const FONTS = path.join(appRoot, 'src', 'ui', 'fonts.ts');

/**
 * The font families, read out of `src/ui/fonts.ts`.
 *
 * fonts.ts cannot simply be imported the way tokens.ts is: it pulls in
 * `react-native` and the `@expo-google-fonts/*` packages, whose entry points
 * resolve to .ttf assets that node has no loader for. So the `family` object
 * literal is sliced out of the source text instead. This is still reading from
 * the single source — no transcription — and it throws loudly rather than
 * guessing if the shape of that file ever changes.
 */
function readFontFamilies(): Record<string, string> {
  const src = readFileSync(FONTS, 'utf8');
  const open = src.indexOf('export const family = {');
  if (open === -1) {
    throw new Error(
      `gen-theme: could not find "export const family = {" in ${FONTS}. ` +
        `The font map moved or was renamed — update this reader rather than ` +
        `hardcoding family names here.`,
    );
  }
  const close = src.indexOf('} as const;', open);
  if (close === -1) throw new Error(`gen-theme: unterminated family object in ${FONTS}`);
  const body = src.slice(open + 'export const family = {'.length, close);

  const out: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*'([^']+)'\s*,?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.regular || !out.mono) {
    throw new Error(
      `gen-theme: parsed ${Object.keys(out).length} font families from ${FONTS} ` +
        `but "regular" and/or "mono" are missing. Expected a flat map of ` +
        `name -> 'FontFamilyString'.`,
    );
  }
  return out;
}

/**
 * THE WEB FALLBACK STACK, READ OUT OF THE SAME FILE (audit F19/F20).
 *
 * WHY THIS IS HERE AT ALL. The audit inspected the public `/welcome` and
 * `/sign-up` on web and found them set in a SERIF face while the computed
 * `font-family` said `SpaceGrotesk_400Regular`. The cause is that these are
 * BARE, SINGLE-NAME FAMILIES with nothing behind them: the web build
 * deliberately does not block on the font gate (blocking kills clicks after
 * hydration), so between first paint and the woff2 arriving — and permanently
 * if it 404s — the browser is handed a family it has never heard of and falls
 * back to its default, which is Times.
 *
 * `fontStack()` in `src/ui/fonts.ts` fixed that for `T`, and therefore for the
 * hand-rolled layer. It did NOT fix the gluestack chrome, which reads these
 * variables and never touches `fontStack` — so every sheet, popover, form and
 * table on web was still one slow network away from Times while the screen
 * around it was correct. THAT is the bug this reader closes.
 *
 * The stacks are sliced out of `fonts.ts` rather than retyped here for the same
 * reason the families are: two copies of a fallback list is two things to keep
 * in step, and this file already exists to make sure there is one source.
 */
function readFallback(kind: 'SANS' | 'MONO'): string {
  const src = readFileSync(FONTS, 'utf8');
  const m = src.match(new RegExp(`const ${kind}_FALLBACK\\s*=\\s*\n?\\s*'([^']+)';`));
  if (!m) {
    throw new Error(
      `gen-theme: could not find "const ${kind}_FALLBACK = '...'" in ${FONTS}. ` +
        `The web fallback stack moved or was renamed — update this reader rather ` +
        `than hardcoding a second copy of the stack here.`,
    );
  }
  return m[1];
}

const family = readFontFamilies();

/** name -> css colour. Order here is the order in the emitted file. */
const semantic: Array<[string, string, string]> = [
  // [token, value, why]
  ['background', color.bg, 'the page ground'],
  ['foreground', color.text, 'ivory, never pure white'],

  ['card', color.surface, 'raised object panel'],
  ['card-foreground', color.text, ''],

  ['popover', color.surface2, 'sheets and menus sit a step below a card'],
  ['popover-foreground', color.text, ''],

  ['primary', color.volt, 'VOLT = the user acting'],
  ['primary-foreground', color.bg, 'dark ink on volt — volt is a light colour'],

  ['secondary', color.surface3, 'recessed well'],
  ['secondary-foreground', color.text, ''],

  ['muted', color.surface2, ''],
  ['muted-foreground', color.muted, 'dimmed ivory for supporting text'],

  ['accent', color.violet, 'VIOLET = Kai. An accent control reads as Kai.'],
  ['accent-foreground', color.text, ''],

  ['destructive', color.red, 'the same red the P&L uses'],
  ['destructive-foreground', color.text, ''],

  ['border', alpha.ivory12, 'the hairline — ivory at 12%, NOT a flat grey'],
  ['input', alpha.ivory10, 'input hairline, one step quieter than a border'],
  ['ring', alpha.volt50, 'focus ring is volt: focus is the user acting'],

  // ---- house semantics gluestack has no name for -------------------------
  ['kai', color.violet, 'the intelligence layer'],
  ['kai-soft', color.violetLight, ''],
  ['kai-deep', color.violetDeep, ''],
  ['market', color.cyan, 'market data, never decoration'],
  ['market-tint', color.cyanTint, ''],
  ['gain', color.green, 'financial semantics only'],
  ['gain-tint', color.greenTint, ''],
  ['loss', color.red, 'financial semantics only'],
  ['loss-tint', color.redTint, ''],
  ['caution', color.gold, 'needs-attention'],
  ['grade-gold', color.gradeGold, 'A-family grade medallion'],
  ['dim', color.dim, 'the quietest legible ivory'],
  ['surface-veil', alpha.surface60, 'panel wash over the ground'],
  ['volt-veil', alpha.volt10, 'volt tint for a selected surface'],
  ['kai-veil', alpha.violet14, 'violet tint for a Kai surface'],

  /*
   * The belt ladder. A member's rank, and the only colours in this file that
   * describe a PERSON rather than a piece of data — see the long note over
   * `belt` in tokens.ts for why they are all low-chroma (signal is lit, belt
   * is dyed) and why black is a silver finish rather than a hue.
   *
   * These exist here so a chrome surface that names a member — a moderation
   * sheet, a member picker — can colour the name the same way the hand-rolled
   * layer does. They are never a fill, a control or a chart series.
   */
  ['belt-white', belt.white, 'white belt = the house ivory'],
  ['belt-blue', belt.blue, 'steel blue, half the chroma of market cyan'],
  ['belt-purple', belt.purple, 'orchid — a third of Kai violet\'s chroma'],
  ['belt-brown', belt.brown, 'leather tan, browner than financial gold'],
  ['belt-black', belt.black, 'polished platinum — black is a finish, not a hue'],
];

const radii: Array<[string, number]> = [
  ['xs', radius.xs],
  ['sm', radius.sm],
  ['md', radius.md],
  ['lg', radius.lg],
  ['xl', radius.xl],
  ['2xl', radius.xxl],
  ['3xl', radius.xxxl],
];

const SANS_FALLBACK = readFallback('SANS');
const MONO_FALLBACK = readFallback('MONO');

/** `[utility name, loaded face, the stack behind it on web]`. */
const fonts: Array<[string, string, string]> = [
  ['ui', family.regular, SANS_FALLBACK],
  ['ui-medium', family.medium, SANS_FALLBACK],
  ['ui-semibold', family.semibold, SANS_FALLBACK],
  ['ui-bold', family.bold, SANS_FALLBACK],
  ['num', family.mono, MONO_FALLBACK],
  ['num-medium', family.monoMedium, MONO_FALLBACK],
  ['num-semibold', family.monoSemibold, MONO_FALLBACK],
  ['num-bold', family.monoBold, MONO_FALLBACK],
];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function varBlock(indent: string): string {
  const width = Math.max(...semantic.map(([n]) => n.length)) + 4;
  return semantic
    .map(([name, value, why]) => {
      const decl = `${indent}--${pad(`${name}:`, width)} ${value};`;
      return why ? `${decl}${' '.repeat(Math.max(1, 46 - decl.length + indent.length))} /* ${why} */` : decl;
    })
    .join('\n');
}

const banner = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`scripts/gen-theme.mts\` from \`src/ui/tokens.ts\` + \`src/ui/fonts.ts\`.
 * tokens.ts is the ONLY source of the palette. Editing the values below by hand
 * puts the gluestack chrome out of step with every hand-rolled screen, and
 * \`scripts/theme-bridge-test.mts\` (part of \`npm test\`) will fail.
 *
 * To change a colour: edit src/ui/tokens.ts, then run
 *     npx tsx scripts/gen-theme.mts
 *
 * Read the header of scripts/gen-theme.mts for the full mapping and the
 * reasoning behind it (why primary is volt, why accent is violet, and why these
 * are complete css colours rather than the rgb-triplet form).
 */`;

const out = `${banner}

@layer theme {
  /*
   * Dark-first, and dark-only: the app pins userInterfaceStyle "dark" and
   * tokens.ts holds exactly one palette. Values live on :root so they apply
   * under any active uniwind theme, and are mirrored into .dark so that
   * \`dark:\` prefixed utilities resolve to the same colours instead of to
   * nothing. A light palette belongs in tokens.ts, not here.
   */
  :root {
${varBlock('    ')}
  }

  :where(.dark, .dark *) {
${varBlock('    ')}
  }
}

@theme inline {
  /* semantic colours -> tailwind utilities (bg-card, text-muted-foreground, border-border, ...) */
${semantic.map(([name]) => `  --color-${pad(`${name}:`, 24)} var(--${name});`).join('\n')}

  /*
   * Corner radii, straight off tokens.radius. gluestack's rounded-* utilities
   * therefore round exactly the way the hand-rolled panels do.
   */
${radii.map(([name, px]) => `  --radius-${pad(`${name}:`, 8)} ${px}px;`).join('\n')}

  /*
   * Fonts resolve to FAMILY NAMES, not weights. React Native has no synthetic
   * bolding for a custom face: "semibold" is a different loaded family, not a
   * font-weight on the same one. So the app never uses font-weight — it swaps
   * family — and these utilities do the same. Use \`font-ui-semibold\`, never
   * \`font-semibold\`; use \`font-num\` for anything numeric, matching the rule
   * that prices and levels always go through Num.
   *
   * EVERY ONE OF THEM CARRIES A FALLBACK STACK. These variables are only ever
   * read on the web, where a bare single-name family that has not loaded yet
   * resolves to the browser default — Times. The stack is the same one
   * \`fontStack()\` applies in \`src/ui/fonts.ts\`, read out of that file, so the
   * chrome degrades to the platform sans exactly as the hand-rolled layer does
   * instead of to a serif.
   */
${fonts.map(([name, f, fb]) => `  --font-${pad(`${name}:`, 14)} '${f}', ${fb};`).join('\n')}
}
`;

const prev = (() => {
  try {
    return readFileSync(OUT, 'utf8');
  } catch {
    return null;
  }
})();

if (process.argv.includes('--check')) {
  if (prev !== out) {
    console.error('theme bridge is STALE — run: npx tsx scripts/gen-theme.mts');
    process.exit(1);
  }
  console.log('theme bridge is current');
} else {
  writeFileSync(OUT, out, 'utf8');
  console.log(
    `${prev === out ? 'unchanged' : 'wrote'} ${path.relative(appRoot, OUT)} — ` +
      `${semantic.length} colours, ${radii.length} radii, ${fonts.length} font families`,
  );
}

export { out as generatedCss, OUT as generatedCssPath };
