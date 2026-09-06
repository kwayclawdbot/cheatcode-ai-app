/**
 * THE SESSION GATE MUST KNOW ABOUT EVERY ROUTE THE APP CAN PUSH TO.
 *
 * `src/app/_layout.tsx` holds `STACK_GROUPS` — the set of top-level route
 * groups a signed-in, onboarded person is allowed to sit on outside the tabs.
 * Anything not in that set is bounced to Home:
 *
 *     if (inAuth || inOnboarding || (!inTabs && !inStack)) router.replace('/home');
 *
 * On 6 Sept the reply-with-quote flow shipped as `/thread/<id>?quote=<id>` and
 * nobody added `thread` to the set. Every Reply tap on a real account replaced
 * the screen with Home, so the composer never opened — the exact bug the owner
 * reported as "the community reply just goes to home page".
 *
 * It survived every proof script because the gate's first line is
 * `if (loading || env.FIXTURES) return;` — fixtures mode, which is what the
 * Playwright proofs run in, skips the gate entirely. A browser test could not
 * have caught this. A test that reads the two files can, so here it is.
 *
 *     node scripts/route-gate-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../src/app');
const LAYOUT = path.join(APP, '_layout.tsx');

let failed = 0;
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) {
    failed += 1;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
};

const src = fs.readFileSync(LAYOUT, 'utf8');

/** The literal set, read out of the source rather than imported (this is TSX). */
const block = src.match(/const STACK_GROUPS = new Set\(\[([\s\S]*?)\]\);/);
if (!block) {
  console.log('FAIL — STACK_GROUPS is not in src/app/_layout.tsx in the shape this test reads.');
  process.exit(1);
}
// Comments first. The set is heavily annotated and the prose contains
// apostrophes ("the group's own layout"), which a bare quote-matcher reads as
// route names.
const declared = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const allowed = new Set([...declared.matchAll(/'([^']+)'/g)].map((m) => m[1]));

/**
 * Every top-level thing under src/app that is a real destination. Route GROUPS
 * in parentheses are what `useSegments()[0]` reports for the screens inside
 * them, so they count too — `(tabs)`, `(auth)` and `(onboarding)` are handled
 * by their own branches of the gate and are the only exemptions.
 */
const GATE_HANDLES_ITSELF = new Set(['(tabs)', '(auth)', '(onboarding)']);

const entries = fs.readdirSync(APP, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((n) => !GATE_HANDLES_ITSELF.has(n));

console.log('\nThe session gate knows every route group');
console.log('---------------------------------------');
console.log(`  · src/app has ${entries.length} pushable groups; the gate allows ${allowed.size}`);

const missing = entries.filter((n) => !allowed.has(n));
ok(
  'every route group under src/app is allowed by the gate',
  missing.length === 0,
  { missing, hint: 'add it to STACK_GROUPS in src/app/_layout.tsx or it bounces to /home' },
);

// The one that actually broke, named so the regression cannot come back quietly.
ok("the reply-with-quote screen's group is allowed", allowed.has('thread'));

const stale = [...allowed].filter((n) => !entries.includes(n));
ok(
  'the gate allows nothing that is not a route any more',
  stale.length === 0,
  { stale, hint: 'a group in STACK_GROUPS with no directory is dead configuration' },
);

/**
 * And the seam itself: the Reply button pushes into `/thread/...`, so if that
 * push is ever re-pointed the test above has to follow it. This asserts the
 * route the reply flow actually navigates to is one the gate allows.
 */
const REPLY_SITES = [
  path.join(APP, 'room/[id]/index.tsx'),
  path.join(APP, '(tabs)/community.tsx'),
];
for (const file of REPLY_SITES) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/onReply=\{\(\)\s*=>\s*router\.push\(`\/([a-zA-Z0-9_()[\]-]+)\//);
  const rel = path.relative(path.resolve(HERE, '..'), file);
  if (!m) {
    ok(`${rel} still has a Reply that navigates`, false, 'no router.push found on onReply');
    continue;
  }
  ok(`${rel} replies into a route the gate allows (/${m[1]})`, allowed.has(m[1]), { group: m[1] });
}

console.log(failed ? `\nFAIL — ${failed} failed\n` : '\nPASS — the gate covers every route\n');
process.exit(failed ? 1 : 0);
