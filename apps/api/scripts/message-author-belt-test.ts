/**
 * WHOSE NAME GETS COLOURED, AND WHOSE MUST NOT.
 *
 *   cd apps/api && npm test
 *
 * A member's belt now rides on the author of every room message, because the
 * room colours a name by rank. The failure mode this guards is not a crash —
 * it is a QUIET MISATTRIBUTION, which is the same species of bug migration 0032
 * created and `author_deleted` was added to close:
 *
 *  1. KAI IS NOT A MEMBER AND HAS NO RANK. Kai's posts carry a null `user_id`,
 *     so they have no author object and therefore no belt. A White belt on a
 *     Kai post would be a rank asserted about something that cannot hold one.
 *  2. AN ACCOUNT THAT LEFT HAS NO RANK EITHER. Deleting an account nulls the
 *     same column, so the row looks exactly like Kai's until `author_deleted`
 *     is read. Neither one may end up wearing a belt.
 *  3. A MEMBER WE CAN READ IS ON A RUNG, AND WHITE IS A RUNG. `user_points`
 *     only gains a row when something resolves, so an absent row means "has
 *     never resolved anything" — which is what White is, not a missing value.
 *  4. A MEMBER WE CANNOT NAME HAS NO CLAIMED RANK. No profile row means we know
 *     nothing about them, and inventing White there is a claim about a person
 *     we could not even put a name to.
 *
 * `toMessageRow` is pure once its lookups are handed to it — that is the whole
 * reason the batched loaders return maps — so all of this runs with no
 * database, no network and no clock.
 */
import { toMessageRow } from '../src/lib/rooms.ts';
import type { MessageAuthor } from '@shared/api';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** The shape `authorsFor` hands back, so the test asserts the real contract. */
function author(userId: string, belt: MessageAuthor['belt']): MessageAuthor {
  return {
    user_id: userId,
    handle: 'someone',
    display_name: 'Someone',
    avatar_url: null,
    role_labels: [],
    route: `/contributor/${userId}`,
    belt,
  };
}

/** A row as `messages_public` returns it, with only the columns that matter. */
function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'm1',
    room_id: 'r1',
    user_id: null,
    seq: 1,
    kind: 'text',
    body: 'hello',
    parent_id: null,
    refs: null,
    structured_idea: null,
    position_disclosure: null,
    deleted: false,
    created_at: '2026-09-06T12:00:00.000Z',
    reaction_counts: {},
    reply_count: 0,
    author_deleted: false,
    quoted_message_id: null,
    ...over,
  };
}

const NO_OBJECTS = new Map();

/* ------------------------------------------------------------------ */

section('A member wears the rung the points table says they are on');

{
  const m = toMessageRow(
    row({ user_id: 'u1' }),
    new Map([['u1', author('u1', 'purple')]]),
    NO_OBJECTS
  );
  ok('the belt reaches the wire', m.author?.belt === 'purple', m.author);
}

{
  // Nothing resolved yet. `authorsFor` fills this in as White before the row
  // mapper ever sees it; this asserts the mapper does not then throw it away.
  const m = toMessageRow(
    row({ user_id: 'u2' }),
    new Map([['u2', author('u2', 'white')]]),
    NO_OBJECTS
  );
  ok('a member with no points row is White, not blank', m.author?.belt === 'white', m.author);
}

section('Nobody who is not a member gets a rank');

{
  // Kai: null user_id, and NOT deleted. This is the case that has always meant
  // "the assistant wrote this".
  const m = toMessageRow(row({ user_id: null }), new Map(), NO_OBJECTS);
  ok('Kai has no author at all', m.author === null, m.author);
  ok('Kai therefore has no belt', m.author?.belt == null, m.author);
}

{
  // A deleted account: the same null user_id, distinguished only by the flag.
  const m = toMessageRow(row({ user_id: null, author_deleted: true }), new Map(), NO_OBJECTS);
  ok('a departed member has no author', m.author === null, m.author);
  ok('a departed member has no belt', m.author?.belt == null, m.author);
  ok('the severed flag still reaches the client', m.author_deleted === true);
}

{
  // Belt and braces: a half-applied delete that left the user_id behind must
  // still not paint that person's old rank over "a member who left".
  const m = toMessageRow(
    row({ user_id: 'u3', author_deleted: true }),
    new Map([['u3', author('u3', 'black')]]),
    NO_OBJECTS
  );
  ok('a severed row keeps no belt even with a user_id', m.author?.belt === null, m.author);
}

{
  // No profile row: `authorsFor` fills the gap with a nameless member, and a
  // nameless member has no claimed rank.
  const m = toMessageRow(
    row({ user_id: 'u4' }),
    new Map([['u4', author('u4', null)]]),
    NO_OBJECTS
  );
  ok('a member we cannot name has no belt', m.author?.belt === null, m.author);
}

section('An older API build is not a broken one');

{
  // A payload shaped before the field existed. `belt` is optional on purpose,
  // and its absence must read as "nothing was said", never as White.
  const legacy = {
    user_id: 'u5',
    handle: null,
    display_name: 'Old',
    avatar_url: null,
    role_labels: [],
    route: '/contributor/u5',
  } as MessageAuthor;
  const m = toMessageRow(row({ user_id: 'u5' }), new Map([['u5', legacy]]), NO_OBJECTS);
  ok('an author with no belt key stays without one', m.author?.belt === undefined, m.author);
}

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
