/**
 * SMALL TEXT HAS TO BE READABLE — ENFORCED AS ARITHMETIC.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. The UX audit (F20) measured `color.dim` — the ink on
 * alert mode notes, row metadata, stage tags, lesson footers and every input
 * placeholder — at 3.53:1 against the ground it is drawn on. The WCAG AA floor
 * for normal-size text is 4.5:1. It was also, at the same time, the ink most
 * likely to be set at 9 or 10 pixels. Small and low-contrast is the same
 * mistake made twice, and roughly 350 call sites made it.
 *
 * The token has been raised. This file is what stops it drifting back down,
 * because the failure is completely silent: somebody decides `dim` "pops too
 * much", drops it four points to calm a screenshot, and nothing breaks. Every
 * screen still renders. Every test still passes. A slice of the product's text
 * quietly becomes unreadable to anybody whose eyes are not twenty-five years
 * old and whose phone is not indoors. There is no screenshot that fails on
 * that, so it is checked as arithmetic — the same argument, and the same shape,
 * as `belt-palette-test.mts` next door.
 *
 * ---------------------------------------------------------------------------
 * TRANSLUCENT SURFACES ARE COMPOSITED, NOT ASSUMED
 * ---------------------------------------------------------------------------
 * Most of this app's surfaces are not colours, they are VEILS: ivory at 6%,
 * the page ground at 82%, a three-stop panel gradient. A contrast number
 * measured against `color.surface` is therefore a number about a surface the
 * app rarely paints. So every veil below is composited over what is actually
 * behind it first, stop by stop in paint order, and the ratio is taken against
 * the result. The audit asked for exactly this ("actual translucent surfaces
 * need separate measurement") and it changes the answer by up to half a point.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THE NUMBERS ENCODE
 * ---------------------------------------------------------------------------
 *   NEUTRAL GROUNDS CARRY `dim`. TINTED IDENTITY SURFACES CARRY `muted`.
 *
 * A Kai bubble, a volt choice card and a ticker tile are already saying
 * something with their colour; the quiet ink on them is `muted`, one rung up,
 * and `dim` is not for them. That is not a stylistic preference — it is what
 * the arithmetic below shows to be the only pair of choices that clears the
 * floor on both kinds of surface without collapsing the three-step ink ladder
 * (text -> muted -> dim) into two steps that look the same.
 *
 * It also checks the three things F19 and F20 asked for that are not colours:
 * the legibility floor exists inside `T`, the OS text-size setting is never
 * disabled, and the touch-target convention has a number.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { alpha, color, FLOOR, gradient, palette, tap, type, typeScale } from '../src/ui/tokens.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const SRC = path.join(appRoot, 'src');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/* ── colour arithmetic ───────────────────────────────────────────────────── */

type RGBA = [number, number, number, number];

/** Accepts both shapes the palette uses: `#RRGGBB` and `rgba(r,g,b,a)`. */
function parse(c: string): RGBA {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`contrast-test: cannot parse colour ${c}`);
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
}

/** Source-over composite: what you SEE when `fg` is painted on `bg`. */
function over(fg: string, bg: string): string {
  const [r, g, b, a] = parse(fg);
  const [R, G, B] = parse(bg);
  const mix = (x: number, X: number) => Math.round(x * a + X * (1 - a));
  return `#${[mix(r, R), mix(g, G), mix(b, B)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** A gradient is a stack: every stop painted over the one before it. */
function stack(stops: readonly string[], base: string): string {
  return stops.reduce((g, s) => over(s, g), base);
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG AA, normal-size text. Small text is normal text; that is the point. */
const AA = 4.5;

/* ── the grounds small text is actually painted on ───────────────────────── */

/**
 * NEUTRAL grounds. Everything here is the page, a panel, a chip or a field —
 * surfaces whose colour says nothing, which is why the quietest ink is allowed
 * on them.
 */
const neutralGrounds: Array<[string, string]> = [
  ['the page ground', color.bg],
  ['a card surface', color.surface],
  ['a raised surface (sheet, selected)', color.raised],
  ['a recessed well (the canvas)', color.surface3],
  ['the object panel gradient', stack(gradient.panel, color.bg)],
  ['a chip at 70%', over(alpha.chip70, color.bg)],
  ['a chip at 85%', over(alpha.chip85, color.bg)],
  ['the composer pill', stack(gradient.composer, color.bg)],
  ['a needs-attention card', stack(gradient.gold, color.bg)],
  ['a live card', stack(gradient.live, color.bg)],
  ['the lower-third scrim', over(alpha.bg82, color.surface)],
];

/**
 * TINTED IDENTITY surfaces. A Kai bubble, a volt choice card, a ticker tile —
 * each is already making a statement with its colour. `muted` is the quiet ink
 * here; `dim` is not permitted, and the numbers below are why.
 */
const tintedGrounds: Array<[string, string]> = [
  ['a Kai bubble', stack(gradient.kai, color.bg)],
  ['a volt choice card', stack(gradient.voltPanel, color.bg)],
  ['a Kai opportunity card', stack(gradient.kaiCard, color.bg)],
  ['a continue card', stack(gradient.voltCard, color.bg)],
  ['a ticker tile', stack(gradient.tile, color.bg)],
  ['an avatar', stack(gradient.avatar, color.bg)],
];

console.log('\nThe quiet inks clear AA on every neutral ground');
for (const [name, ground] of neutralGrounds) {
  for (const [ink, hex] of [['dim', color.dim], ['muted', color.muted], ['text', color.text]] as const) {
    const r = contrast(hex, ground);
    ok(`${ink} on ${name} (${ground}) — ${r.toFixed(2)}:1`, r >= AA, { ink: hex, ground, ratio: r });
  }
}

console.log('\nThe semantic inks clear AA on the grounds prices actually sit on');
{
  /*
   * REDESIGN 2026-09-21. Prices, levels and Kai's words sit on the canvas and
   * on the card surface — that is where every board in the pack draws them.
   * Both are checked for every semantic ink at the 4.5:1 small-text floor.
   *
   * The RAISED surface (#1C1C20 — sheets, a selected segment) is checked too,
   * and one ink misses there: the spec's market red #E5484D scores ~4.4:1 on
   * raised. It is kept at the spec value (the owner's palette) and the miss is
   * written down rather than hidden: on a raised surface a red value must be
   * at least cardTitle size (17px) — large enough that the 3:1 large-text
   * floor applies — or sit on the card surface instead.
   */
  const cardGrounds: Array<[string, string]> = [
    ['the canvas', color.canvas],
    ['a card surface', color.surface],
  ];
  const inks = [
    ['grade gold', color.grade],
    ['market up', color.marketUp],
    ['market down', color.marketDown],
    ['action orange', color.action],
    ['Kai ink', color.kaiInk],
    ['entry (neutral)', color.priceEntry],
  ] as const;
  for (const [ink, hex] of inks) {
    for (const [gname, g] of cardGrounds) {
      const r = contrast(hex, g);
      ok(`${ink} on ${gname} — ${r.toFixed(2)}:1`, r >= AA, { ink: hex, ground: g, ratio: r });
    }
    const rr = contrast(hex, color.raised);
    const floor = hex === color.marketDown ? 3 : AA;
    ok(`${ink} on a raised surface — ${rr.toFixed(2)}:1 (needs ${floor}:1${floor === 3 ? ', large text only — see note' : ''})`,
      rr >= floor, { ink: hex, ratio: rr });
  }
  const redRaised = contrast(color.marketDown, color.raised);
  ok(`the red-on-raised exception is real, not stale (${redRaised.toFixed(2)}:1 < 4.5)`, redRaised < AA, redRaised);
}

console.log('\nThe orange action carries dark ink, because white on orange fails');
{
  const dark = contrast(color.onAction, color.action);
  const white = contrast(color.textPrimary, color.action);
  ok(`dark ink on orange — ${dark.toFixed(2)}:1`, dark >= AA, dark);
  ok(`white on orange would fail AA (${white.toFixed(2)}:1), so it is never used`, white < AA, white);
}

console.log('\nViolet is a surface, not an ink — which is why Kai SPEAKS in violetLight');
{
  // The same shape as the belt test's "pure black would be invisible here".
  // `color.violet` scores below AA on its own ground; asserting that out loud
  // is what stops somebody reaching for it as a text colour and shipping a
  // Kai caption nobody can read.
  const r = contrast(color.violet, color.bg);
  ok(`violet as text would fail AA (${r.toFixed(2)}:1), so it is never text`, r < AA, r);
  ok('violetLight is the Kai ink and clears AA', contrast(color.violetLight, color.bg) >= AA);
}

console.log('\nNeutral grounds carry dim; tinted identity surfaces carry muted');
for (const [name, ground] of tintedGrounds) {
  const m = contrast(color.muted, ground);
  ok(`muted on ${name} (${ground}) — ${m.toFixed(2)}:1`, m >= AA, { ground, ratio: m });
}

console.log('\nThe spec has two inks, and they are clearly two');
{
  // The old palette had a third, quieter ink (`dim`). The spec defines two:
  // primary and secondary. `dim` is kept as a name so ~470 call sites compile,
  // and it resolves to the secondary ink. A third step quiet enough to SEE as
  // a step (≥1.4:1 under secondary) would land near 3.9:1 on a raised surface
  // — under the floor — which is why the spec's two-ink answer is the right one.
  ok(`primary is clearly above secondary (${contrast(color.textPrimary, color.textSecondary).toFixed(2)}:1)`,
    contrast(color.textPrimary, color.textSecondary) >= 1.7);
  ok('dim is the secondary ink (the spec has two inks)', color.dim === color.textSecondary && color.muted === color.textSecondary);
  ok('the inks are the spec values', color.textPrimary === '#F2F2F0' && color.textSecondary === '#9A9892');
}

console.log('\nThe palette is the spec, value for value');
{
  const spec: Record<string, string> = {
    canvas: '#0C0C0F', surface: '#151518', raised: '#1C1C20', border: 'rgba(242,242,240,0.12)',
    textPrimary: '#F2F2F0', textSecondary: '#9A9892', orange: '#FF5A1F', orangeLight: '#FF8A3D',
    violet: '#7B45F5', positive: '#12A150', negative: '#E5484D', gold: '#D7A93A',
  };
  for (const [k, v] of Object.entries(spec)) {
    ok(`palette.${k} is ${v}`, (palette as Record<string, string>)[k] === v, (palette as Record<string, string>)[k]);
  }
  ok('the lime and cyan are gone from every colour token',
    !Object.values(color).some((v) => /^#(C8FF00|32D6FF|D6FF3D|DEFF66)$/i.test(v)));
}

/* ── size, scaling and targets ───────────────────────────────────────────── */

console.log('\nThe legibility floor exists, and it is inside the primitive');
{
  const text = readFileSync(path.join(SRC, 'ui', 'Text.tsx'), 'utf8');
  ok('the floor is 11 logical pixels', FLOOR === 11, FLOOR);
  ok('T applies it — `Math.max(size, FLOOR)`', text.includes('Math.max(size, FLOOR)'));
  ok('T defaults to the body style when given no variant or size', text.includes("variant ?? 'body'") && typeScale.body.size === 15);
  const specScale: Record<string, [number, number, boolean]> = {
    screenTitle: [32, 38, false], sectionTitle: [20, 26, false], cardTitle: [17, 22, false],
    body: [15, 22, false], meta: [12, 16, false], keyPrice: [26, 30, true],
  };
  for (const [name, [sz, lh, mono]] of Object.entries(specScale)) {
    const v = (typeScale as Record<string, { size: number; lh: number; mono: boolean }>)[name];
    ok(`typeScale.${name} is ${sz}/${lh}${mono ? ' mono' : ''}`, v && v.size === sz && v.lh === lh && v.mono === mono, v);
  }

  // Nothing in the ramp may name a size the floor would silently override —
  // a token that says 9 and renders 11 is a lie in the source.
  for (const [name, entry] of Object.entries(type)) {
    const size = (entry as { size: number }).size;
    ok(`type.${name} is at or above the floor (${size})`, size >= FLOOR, { name, size });
  }
}

console.log('\nThe OS text-size setting is never taken away');
{
  // `allowFontScaling={false}` is the one line that would make an enlarged-text
  // phone render at the design's own sizes anyway. The audit says do not
  // disable system text scaling; this is that instruction, enforced.
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry)) continue;
      // Comments are stripped first: this very rule is explained in prose in
      // `features/a11y/index.tsx` and in `ui/Text.tsx`, and a check that its own
      // documentation trips is a check nobody keeps.
      const src = readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (/allowFontScaling\s*=\s*\{?\s*false/.test(src)) offenders.push(path.relative(appRoot, full));
    }
  };
  walk(SRC);
  ok('no file disables system font scaling', offenders.length === 0, offenders);
}

console.log('\nTouch targets have a number, and reduced motion has a direction');
{
  ok('the product convention is 44 logical pixels', tap.min === 44, tap.min);
  ok('adjacent targets are kept apart', tap.gap >= 8, tap.gap);

  const a11y = readFileSync(path.join(SRC, 'features', 'a11y', 'index.tsx'), 'utf8')
    + readFileSync(path.join(SRC, 'features', 'a11y', 'context.tsx'), 'utf8');
  // The OR runs one way ONLY: a phone set to reduce motion can silence the
  // app, and no in-app setting can turn movement back on. Flipping this to an
  // AND, or to the member's value alone, would compile and pass every other
  // test in the suite.
  ok('reduced motion is system OR member, in that order',
    a11y.includes('systemReducedMotion || prefs.reducedMotion'));
  ok('the effective value is what components ask for',
    a11y.includes('export function useReducedMotion'));
}

console.log(failures === 0 ? '\ncontrast + type OK\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
