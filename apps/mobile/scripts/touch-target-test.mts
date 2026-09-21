/**
 * EVERY TAP TARGET IS AT LEAST 44×44 — CHECKED IN THE SOURCE.
 *
 *   cd apps/mobile && npx tsx scripts/touch-target-test.mts
 *
 * The redesign spec (docs/design/redesign-2026-09-21) says "every interactive
 * control meets a 44px touch target". A control may be DRAWN smaller — a 32px
 * bookmark, a 28px chip — as long as the box a finger can hit is not; that is
 * what `hitSlop` is for, and `hitSlopFor(w, h)` in src/ui/touch.ts computes it.
 *
 * WHAT THIS CAN AND CANNOT SEE. It reads every `<Pressable …>` opening tag in
 * src/ and looks for a size written as a number literal in that tag — `width:`
 * / `height:` / `minWidth:` / `minHeight:` — plus any `hitSlop`. When both a
 * size and the slop are literal, the sum is checked. When the slop is
 * `hitSlopFor(...)`, the helper is trusted (it is the arithmetic). A Pressable
 * with no literal size — sized by its padding and content, or by a variable —
 * cannot be measured from the source; those are COUNTED and printed, not
 * failed, so the number is visible without pretending to a certainty the
 * source does not have. Rendered-size checking belongs in the browser proofs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tap } from '../src/ui/tokens.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..', 'src');
const verbose = process.argv.includes('--verbose');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The opening tag starting at `i`, stopping at the first `>` outside braces. */
function openingTag(src: string, i: number): string {
  let depth = 0;
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

function num(tag: string, key: string): number | null {
  // `key: 32` inside a style object; ignore `borderWidth`, `maxHeight` etc.
  const m = tag.match(new RegExp(`(?<![A-Za-z])${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\b`));
  return m ? Number(m[1]) : null;
}

type Slop = { kind: 'none' } | { kind: 'helper' } | { kind: 'dynamic' } | { kind: 'literal'; t: number; b: number; l: number; r: number };
function slopOf(tag: string): Slop {
  const i = tag.indexOf('hitSlop=');
  if (i === -1) return { kind: 'none' };
  const rest = tag.slice(i + 'hitSlop='.length);
  if (/^\{\s*hitSlopFor\(/.test(rest) || /^\{\{\s*\.\.\.hitSlopFor\(/.test(rest)) return { kind: 'helper' };
  const n = rest.match(/^\{\s*(\d+(?:\.\d+)?)\s*\}/);
  if (n) { const v = Number(n[1]); return { kind: 'literal', t: v, b: v, l: v, r: v }; }
  const obj = rest.match(/^\{\{([^}]*)\}\}/);
  if (obj) {
    const get = (k: string) => { const m = obj[1].match(new RegExp(`\\b${k}\\s*:\\s*(\\d+(?:\\.\\d+)?)`)); return m ? Number(m[1]) : 0; };
    return { kind: 'literal', t: get('top'), b: get('bottom'), l: get('left'), r: get('right') };
  }
  return { kind: 'dynamic' };
}

let checked = 0; let unmeasured = 0; let helper = 0;
const failures: string[] = [];
for (const file of files(SRC)) {
  const src = readFileSync(file, 'utf8');
  let at = src.indexOf('<Pressable');
  while (at !== -1) {
    const tag = openingTag(src, at);
    const line = src.slice(0, at).split('\n').length;
    const where = `${path.relative(path.resolve(SRC, '..'), file)}:${line}`;
    const h = Math.max(num(tag, 'height') ?? 0, num(tag, 'minHeight') ?? 0) || null;
    const w = Math.max(num(tag, 'width') ?? 0, num(tag, 'minWidth') ?? 0) || null;
    const slop = slopOf(tag);
    if (h == null && w == null) {
      unmeasured++;
    } else if (slop.kind === 'helper' || slop.kind === 'dynamic') {
      helper++;
    } else {
      checked++;
      const s = slop.kind === 'literal' ? slop : { t: 0, b: 0, l: 0, r: 0 };
      const effH = h == null ? null : h + s.t + s.b;
      const effW = w == null ? null : w + s.l + s.r;
      const short: string[] = [];
      if (effH != null && effH < tap.min) short.push(`height ${effH}`);
      if (effW != null && effW < tap.min) short.push(`width ${effW}`);
      if (short.length) failures.push(`${where}  touchable ${short.join(', ')} < ${tap.min}`);
    }
    at = src.indexOf('<Pressable', at + 1);
  }
}

console.log('\nTouch targets (44×44 minimum)');
console.log(`  measured from literal sizes: ${checked}`);
console.log(`  sized through hitSlopFor() or a computed slop: ${helper}`);
console.log(`  sized by content/padding (not measurable from source): ${unmeasured}`);
if (failures.length) {
  console.log(`\n  FAIL ${failures.length} undersized target(s):`);
  for (const f of verbose ? failures : failures.slice(0, 60)) console.log(`       ${f}`);
  if (!verbose && failures.length > 60) console.log(`       … and ${failures.length - 60} more (--verbose)`);
  process.exit(1);
}
console.log('  ok   every measurable Pressable is at least 44×44 touchable\n');
