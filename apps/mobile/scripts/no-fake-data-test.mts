/**
 * EXAMPLE CONTENT IS REACHABLE ONLY BEHIND THE FLAG.
 *
 * The owner opened the app while the service was down and saw a club full of
 * posts with names on them. They were fixtures: `community-api.ts` fell back to
 * example content whenever a live call failed, flag or no flag, and a small
 * "Example rooms" caption was the only tell. A feed of invented posts reads as
 * a feed.
 *
 * WHY THIS IS A STATIC CHECK AND NOT A BROWSER PROOF. Reproducing the state in
 * a browser means making every backend unreachable — and the moment Supabase
 * goes with it, the profile read fails, `onboardingDone` is false and the
 * session gate diverts to onboarding before the club ever renders. The proof
 * then photographs the onboarding screen and asserts nothing about the club.
 * (Blocking ONLY the API is not the scenario either: the community layer falls
 * back to a direct Supabase read, which is real data and correctly keeps
 * working.) The rule itself is what has to hold, so the rule is what is
 * checked — every fixture return in that file must be guarded by `env.FIXTURES`
 * on a line above it.
 *
 * `proof-no-fake-data.mjs` covers the half a browser can: with the API down and
 * Supabase up, no fixture author appears on screen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src/lib/community-api.ts');
const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

let failures = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
};

console.log('no fake data');

/**
 * Every line that hands back `source: 'fixtures'` must have `env.FIXTURES`
 * within the few lines above it — the guard that says somebody asked for
 * examples on purpose.
 */
const LOOKBACK = 6;
const unguarded: string[] = [];
lines.forEach((line, i) => {
  if (!/source:\s*'fixtures'/.test(line)) return;
  const before = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
  if (!/env\.FIXTURES/.test(before)) unguarded.push(`line ${i + 1}: ${line.trim()}`);
});
ok(
  'every fixture answer is behind `env.FIXTURES`',
  unguarded.length === 0,
  unguarded.join('\n       '),
);

/** The honest state has to exist, or the guard above just produces blanks. */
ok("there is an 'unreachable' source to fall to", /'unreachable'/.test(src));

/**
 * `offlineMode` is `FIXTURES || !hasSupabase`, so it is TRUE for a build that
 * simply has no Supabase configured — which is not "somebody asked for
 * examples". Using it to gate fixture content is how this bug worked in the
 * first place, so the fixture returns must not be keyed on it.
 */
const offlineGated: string[] = [];
lines.forEach((line, i) => {
  if (!/source:\s*'fixtures'/.test(line)) return;
  const before = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
  if (/offlineMode/.test(before) && !/env\.FIXTURES/.test(before)) offlineGated.push(`line ${i + 1}`);
});
ok('and none of them is gated on `offlineMode` instead', offlineGated.length === 0, offlineGated.join(', '));

/** The two surfaces the owner actually hit must say so and offer a way back. */
const community = readFileSync(path.join(ROOT, 'src/app/(tabs)/community.tsx'), 'utf8');
const room = readFileSync(path.join(ROOT, 'src/app/room/[id]/index.tsx'), 'utf8');
ok('the club has an unreachable state with a retry', /community-unreachable/.test(community) && /community-retry/.test(community));
ok('the room has one too', /room-unreachable/.test(room) && /room-retry/.test(room));

console.log(failures ? `\nno fake data FAILED (${failures})` : '\nno fake data OK');
process.exit(failures ? 1 : 0);
