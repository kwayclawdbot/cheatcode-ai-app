/**
 * THREE CHATS, AND ONE MAP WRITTEN IN THREE PLACES.
 *
 *   cd apps/mobile && npx tsx scripts/three-chats-test.mts
 *
 * Owner decision, 8 Sept 2026: "Just make it traders chat, investors chat and
 * beginners chat." Which desk posts into which chat is now a NAMED MAP rather
 * than a `rooms.mode` column, and that map necessarily exists three times:
 *
 *   1. `supabase/migrations/0045_three_chats.sql` §4(b) — so the database can
 *      refuse to be in a state where a published call reaches no conversation.
 *   2. `apps/api/src/lib/social/rooms-bridge.ts` `MODE_TO_ROOM` — the server,
 *      which uses it to decide where a call lands. A write.
 *   3. `apps/mobile/src/features/community/rooms.ts` `ROOM_FOR_MODE` — the
 *      phone, which uses it to pick the first room somebody sees. A default.
 *
 * Three copies is the price of the database being able to check itself and the
 * phone not having to ask the API a three-line question. Three copies drift.
 * So this reads all three out of their files and fails if they stop agreeing —
 * the same job `stage-rules-test` does for the training gates, and the reason
 * `rules.ts` says duplication is a cost rather than an accident.
 *
 * IT ALSO HOLDS THE F13 FIX IN PLACE. `apps/mobile/src/app/(tabs)/community.tsx`
 * must not import `ModeSegmented`. That control writes `profiles.primary_mode`
 * through `PUT /mode`, and putting it back in that header is exactly the bug
 * the audit found: reading a room changing what somebody trades. A static check
 * catches it because the Playwright proofs run in fixtures mode, where the
 * profile write is skipped and the bug is invisible.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '..');
const REPO = path.resolve(MOBILE, '../..');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');

const MIGRATION = 'supabase/migrations/0045_three_chats.sql';
const BRIDGE = 'apps/api/src/lib/social/rooms-bridge.ts';
const PHONE = 'apps/mobile/src/features/community/rooms.ts';
const COMMUNITY = 'apps/mobile/src/app/(tabs)/community.tsx';

/** `day_trade: 'traders',` → [mode, slug]. Comments are stripped first. */
function pairsFromTs(src: string, constName: string): [string, string][] {
  const at = src.indexOf(`${constName}: Record<`);
  if (at === -1) return [];
  const open = src.indexOf('{', at);
  const close = src.indexOf('};', open);
  const body = src.slice(open, close).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/(\w+)\s*:\s*'([a-z-]+)'/g)].map((m) => [m[1], m[2]] as [string, string]);
}

/** `('day_trade', 'traders'),` out of the migration's VALUES list. */
function pairsFromSql(src: string): [string, string][] {
  const at = src.indexOf('from (values (');
  if (at === -1) return [];
  const close = src.indexOf(') as mr(mode, slug)', at);
  const body = src.slice(at, close);
  return [...body.matchAll(/\('(\w+)',\s*'([a-z-]+)'\)/g)].map((m) => [m[1], m[2]] as [string, string]);
}

const norm = (pairs: [string, string][]) =>
  pairs.map(([a, b]) => `${a}->${b}`).sort().join(', ');

console.log('\nThe mode -> chat map, in the three places it is written');
{
  const sql = pairsFromSql(read(MIGRATION));
  const server = pairsFromTs(read(BRIDGE), 'MODE_TO_ROOM');
  const phone = pairsFromTs(read(PHONE), 'ROOM_FOR_MODE');

  ok('the migration names a map at all', sql.length === 3, sql);
  ok('the server names one', server.length === 3, server);
  ok('the phone names one', phone.length === 3, phone);

  ok(
    'the server and the migration agree',
    norm(server) === norm(sql),
    { server: norm(server), sql: norm(sql) },
  );
  ok(
    'the phone and the server agree',
    norm(phone) === norm(server),
    { phone: norm(phone), server: norm(server) },
  );
  ok(
    'and the map is the owner\'s decision: both trading desks share one room',
    norm(sql) === 'day_trade->traders, invest->investors, swing->traders',
    norm(sql),
  );
}

console.log('\nThe three chats, and nothing routing to Beginners');
{
  const sql = read(MIGRATION);
  ok(
    'the migration asserts exactly beginners, investors, traders',
    sql.includes("'beginners, investors, traders'"),
  );
  ok(
    'and asserts that no core room carries a mode any more',
    /core room.*carry a mode/i.test(sql),
  );
  ok(
    'nothing maps a desk to the beginners room',
    !pairsFromSql(sql).some(([, slug]) => slug === 'beginners'),
  );
}

console.log('\nF13: reading a room does not change what you trade');
{
  const community = read(COMMUNITY);
  ok(
    'Community does not import ModeSegmented',
    !/import\s*\{[^}]*\bModeSegmented\b[^}]*\}/.test(community),
  );
  ok(
    'and does not render one',
    !/<ModeSegmented\b/.test(community),
  );
  ok(
    'the room it opens is remembered by the device, not by the profile',
    community.includes('useLastRoom'),
  );
  ok(
    'and the trading goal is still reachable, through the explicit chooser',
    /<ModeSheet\b/.test(community),
  );
  ok(
    'nothing on this screen patches primary_mode',
    !community.includes('primary_mode:'),
  );
}

console.log(failures === 0 ? '\nall passed\n' : `\n${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
