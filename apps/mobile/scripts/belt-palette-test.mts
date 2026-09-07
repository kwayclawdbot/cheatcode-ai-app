/**
 * SIGNAL IS LIT, BELT IS DYED — ENFORCED.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. The belt ladder used to be drawn in volt at five
 * intensities, specifically to avoid a collision: the palette is locked
 * (docs/14), violet is Kai's and cyan is market data, so a purple chip beside
 * a member's name risked reading as Kai having said something about them and a
 * blue one as a price. That solved the collision by deleting the information —
 * five weights of one yellow-green is not a rank anybody reads — so the belts
 * now have their real colours, and the collision has to be solved for real
 * instead.
 *
 * The rule that does it is a measurable one, which is the only reason it can
 * be defended in a test rather than in an opinion:
 *
 *   EVERY HOUSE COLOUR THAT CARRIES MEANING IS AT FULL CHROMA.
 *   EVERY BELT SITS WELL BELOW IT.
 *
 * cyan, violet, gold, volt and red are all 100% saturation. The belts run
 * 15–61%. That gap is the whole argument: a blue belt is not a price because
 * it is half as saturated and twenty degrees round the wheel, and an orchid
 * purple is not Kai because it has a third of violet's chroma. Hue says which
 * rung; chroma says "this is a person, not data".
 *
 * THE FAILURE THIS CATCHES IS SILENT. Somebody retunes the blue belt a little
 * brighter to make it "pop", it drifts into the market's cyan, and nothing
 * breaks — every screen still renders perfectly, and a member slowly learns
 * that a name and a price are the same kind of thing. There is no screenshot
 * that fails on that, and no typecheck either. So it is checked as arithmetic.
 *
 * The second half is plain legibility: a name is body text on the darkest
 * ground in the app, so every rung is held to WCAG AA (4.5:1) against it. That
 * is the check that stops "black belt is black" from ever being reintroduced
 * as an idea — it scores 1.05:1 and says so.
 */
import { belt, beltAlpha, color } from '../src/ui/tokens.ts';
import { BELT_ORDER, beltEdge, beltEdgeGradient, beltInk, isBelt } from '../src/features/social/belts.ts';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/* ── colour arithmetic, so the thresholds are measured and not asserted ──── */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Saturation in HSL, as a percentage. The "is it lit or dyed" axis. */
function saturation(hex: string): number {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  const l = (mx + mn) / 2;
  return (d / (1 - Math.abs(2 * l - 1))) * 100;
}
function hue(hex: string): number {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}
function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return d > 180 ? 360 - d : d;
}

console.log('\nA name is legible at every rung (WCAG AA on the ground)');
for (const b of BELT_ORDER) {
  const ratio = contrast(belt[b], color.bg);
  ok(`${b} belt reads on #0B0B0E (${ratio.toFixed(2)}:1)`, ratio >= 4.5, ratio);
}

console.log('\nSignal is lit, belt is dyed');
{
  // The colours that MEAN something. If any of these ever stops being fully
  // saturated the rule below gets easier to pass by accident, so they are
  // asserted too rather than merely used as a yardstick.
  const signal = { cyan: color.cyan, violet: color.violet, gold: color.gold, volt: color.volt, red: color.red };
  for (const [name, hex] of Object.entries(signal)) {
    ok(`${name} is a full-chroma signal colour (${saturation(hex).toFixed(0)}%)`, saturation(hex) >= 95, saturation(hex));
  }

  // White is the house ivory — a near-white, where HSL saturation stops being
  // a meaningful number — so the dyed rule is asserted over the four rungs
  // that actually carry a hue.
  for (const b of ['blue', 'purple', 'brown', 'black'] as const) {
    const s = saturation(belt[b]);
    ok(`${b} belt is dyed, not lit (${s.toFixed(0)}% < 70%)`, s < 70, s);
  }
}

console.log('\nNo belt is mistakable for a colour that already means something');
{
  // The three genuinely near pairs. Each must be separated on BOTH axes: a
  // different hue AND a large drop in chroma. Either one alone is a colour
  // somebody squints at.
  const pairs: Array<[string, string, string, string]> = [
    ['blue belt', belt.blue, 'market cyan', color.cyan],
    ['purple belt', belt.purple, 'Kai violet', color.violet],
    ['brown belt', belt.brown, 'financial gold', color.gold],
  ];
  for (const [aName, a, bName, b] of pairs) {
    ok(`${aName} is off ${bName}'s hue (${hueGap(a, b).toFixed(0)} deg)`, hueGap(a, b) >= 10, hueGap(a, b));
    const drop = saturation(b) - saturation(a);
    ok(`${aName} is far quieter than ${bName} (${drop.toFixed(0)}pp less chroma)`, drop >= 30, drop);
  }
}

console.log('\nBlack is a finish, not a hue');
{
  // The whole reason black is silver. A black belt drawn black scores about
  // 1:1 on this ground, and this is the arithmetic that says so out loud.
  ok('pure black would be invisible here, which is why it is not used', contrast('#000000', color.bg) < 1.2, contrast('#000000', color.bg));
  ok(`black belt is near-achromatic (${saturation(belt.black).toFixed(0)}%)`, saturation(belt.black) < 25, saturation(belt.black));
  ok('black belt is the brightest rung — the top of the ladder is the most present',
    BELT_ORDER.filter((b) => b !== 'white').every((b) => luminance(belt.black) >= luminance(belt[b])));
  ok('black belt is the only edge that is actually a gradient',
    beltEdgeIsMetalCheck(), 'only black should have varying edge stops');
}
function beltEdgeIsMetalCheck(): boolean {
  return BELT_ORDER.every((b) => {
    const [a, mid, c] = beltEdgeGradient(b);
    const varies = !(a === mid && mid === c);
    return b === 'black' ? varies && a === beltAlpha.blackMetalDim : !varies;
  });
}

console.log('\nEvery rung is tellable from every other rung');
for (let i = 0; i < BELT_ORDER.length; i += 1) {
  for (let j = i + 1; j < BELT_ORDER.length; j += 1) {
    const [a, b] = [BELT_ORDER[i], BELT_ORDER[j]];
    // Two colours are distinct enough if they differ clearly in hue OR in
    // brightness. Requiring both would fail honest pairs — blue and platinum
    // share a hue family and are separated by being a mid blue and a near
    // white, which is a difference nobody misses.
    const apart = hueGap(belt[a], belt[b]) >= 60 || contrast(belt[a], belt[b]) >= 1.6;
    ok(`${a} vs ${b}`, apart, { hueGap: hueGap(belt[a], belt[b]), contrast: contrast(belt[a], belt[b]) });
  }
}

console.log('\nThe helpers agree with the palette');
{
  ok('beltInk returns the belt colour', BELT_ORDER.every((b) => beltInk(b) === belt[b]));
  ok('an unknown rung falls back to white rather than throwing',
    beltInk('gold' as never) === belt.white, beltInk('gold' as never));
  ok('beltEdge is the half-strength edge', BELT_ORDER.every((b) => beltEdge(b) === beltAlpha[b]));
  ok('every edge is a half-strength alpha, never an opaque hex',
    BELT_ORDER.every((b) => beltEdge(b).startsWith('rgba(')));
  ok('isBelt accepts the five rungs', BELT_ORDER.every(isBelt));
  ok('isBelt rejects anything else', !isBelt('gold') && !isBelt(null) && !isBelt(3) && !isBelt('WHITE'));
  ok('white belt is the house ivory, so most names did not change colour', belt.white === color.text);
}

console.log(failures === 0 ? '\nbelt palette OK\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
