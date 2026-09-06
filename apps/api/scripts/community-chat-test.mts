/**
 * COMMUNITY CHAT, PROVED END TO END.
 *
 * Not a unit test. It signs three real accounts in against a running API and a
 * real database and asks the questions the owner asked:
 *
 *   1. can a member open a Circle?                    -> no, and it says why
 *   2. can support open a Circle?                     -> no, and it says why
 *   3. can an admin open a Circle?                    -> yes
 *   4. do two members see each other's messages?      -> yes, in order
 *   5. does a post that reads as advice get flagged?  -> yes, and the writer is told
 *   6. can support remove a post?                     -> yes, and its words are gone
 *   7. can a member read the removed words anyway?    -> no (the RLS check)
 *   8. can support mute somebody?                     -> yes, and posting is refused
 *   9. does the moderation queue show all of it?      -> yes
 *
 * RUN:
 *   API=http://localhost:3000 npx tsx scripts/community-chat-test.mts
 *
 * It needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (from .env.local) to
 * create its own throwaway accounts and to grant them staff roles, because
 * granting staff is an `owner` action and this script does not have an owner's
 * password. Everything else goes through the HTTP API exactly as the phone does.
 *
 * It cleans up after itself: the accounts, the room membership and the Circle
 * it opened are all removed at the end, pass or fail.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API = process.env.API ?? 'http://localhost:3000';
const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL_ || !SERVICE || !ANON) {
  console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY. Run from apps/api.');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
};

type Account = { id: string; email: string; token: string; label: string };

async function makeAccount(label: string, role: 'member' | 'support' | 'admin'): Promise<Account> {
  const email = `commtest-${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@cheatcode.test`;
  const password = 'Test-Passw0rd-community!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`create ${label}: ${created.error?.message}`);
  const id = created.data.user.id;

  if (role !== 'member') {
    // Staff is granted in SQL, because granting it through the app is an owner
    // action and this script deliberately holds no owner password.
    const { error } = await admin.from('staff_members').upsert(
      { user_id: id, role, granted_at: new Date().toISOString(), revoked_at: null } as never,
      { onConflict: 'user_id' }
    );
    if (error) throw new Error(`grant ${role}: ${error.message}`);
  }

  const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(`sign in ${label}: ${signed.error?.message}`);

  return { id, email, token: signed.data.session.access_token, label };
}

async function call(
  who: Account,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${who.token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const cleanup: (() => Promise<void>)[] = [];

async function main() {
  console.log(`\nCOMMUNITY CHAT — end to end against ${API}\n`);

  const member = await makeAccount('member', 'member');
  const other = await makeAccount('other', 'member');
  const support = await makeAccount('support', 'support');
  const adminUser = await makeAccount('admin', 'admin');
  for (const a of [member, other, support, adminUser]) {
    cleanup.push(async () => {
      await admin.from('staff_members').delete().eq('user_id', a.id);
      await admin.auth.admin.deleteUser(a.id);
    });
  }

  /* --------------------------------------------------------------- */
  console.log('1-3. WHO MAY OPEN A CIRCLE');

  const memberList = await call(member, '/circles');
  check('a member is told they cannot create', memberList.json?.can_create === false, memberList.json?.can_create);
  check(
    'and the reason names who can',
    typeof memberList.json?.create_hint === 'string' && /team/i.test(memberList.json.create_hint),
    memberList.json?.create_hint
  );

  const memberCreate = await call(member, '/circles', { method: 'POST', body: { symbol: 'AAPL', ttl: '24h' } });
  check('a member POSTing anyway is refused', memberCreate.status === 403, memberCreate.status);
  check('with FORBIDDEN, not a 404', memberCreate.json?.error?.code === 'FORBIDDEN', memberCreate.json?.error);
  check(
    'and a sentence that names the reason',
    /team|members/i.test(String(memberCreate.json?.error?.message_plain ?? '')),
    memberCreate.json?.error?.message_plain
  );

  const supportList = await call(support, '/circles');
  check('support cannot create either', supportList.json?.can_create === false, supportList.json?.can_create);
  const supportCreate = await call(support, '/circles', { method: 'POST', body: { symbol: 'AAPL', ttl: '24h' } });
  check('support POSTing is refused', supportCreate.status === 403, supportCreate.status);
  check(
    'and support is told it is an admin action, not that it does not exist',
    /admin action/i.test(String(supportCreate.json?.error?.message_plain ?? '')),
    supportCreate.json?.error?.message_plain
  );

  const adminList = await call(adminUser, '/circles');
  check('an admin is offered the button', adminList.json?.can_create === true, adminList.json?.can_create);

  const adminCreate = await call(adminUser, '/circles', { method: 'POST', body: { symbol: 'AAPL', ttl: '24h' } });
  check('an admin opens the circle', adminCreate.status === 201, { status: adminCreate.status, body: adminCreate.json });
  const circleId: string | undefined = adminCreate.json?.circle?.id;
  if (circleId) {
    cleanup.push(async () => {
      await admin.from('messages').delete().eq('room_id', circleId);
      await admin.from('room_members').delete().eq('room_id', circleId);
      await admin.from('rooms').delete().eq('id', circleId);
    });
  }
  check('the circle is real and has an id', typeof circleId === 'string', circleId);

  /* --------------------------------------------------------------- */
  console.log('\n4. TWO MEMBERS, ONE CONVERSATION');

  if (!circleId) throw new Error('no circle to talk in');

  for (const a of [member, other, support]) {
    const j = await call(a, `/circles/${circleId}/join`, { method: 'POST' });
    check(`${a.label} joins the circle`, j.status === 200 || j.status === 201, j.status);
  }

  const p1 = await call(member, `/rooms/${circleId}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'Watching $AAPL into the print. Flat, no position.' },
  });
  check('the member posts', p1.status === 201, { status: p1.status, body: p1.json });
  const firstId: string | undefined = p1.json?.message?.id;

  const p2 = await call(other, `/rooms/${circleId}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'Same. I want to see it hold the prior day high first.' },
  });
  check('the second member posts', p2.status === 201, p2.status);

  const read = await call(member, `/rooms/${circleId}/messages?after_seq=0&limit=50`);
  const bodies: string[] = (read.json?.messages ?? []).map((m: any) => String(m.body ?? ''));
  check('the first member sees both posts', bodies.length === 2, bodies);
  check('in the order they were written', bodies[0]?.startsWith('Watching'), bodies);

  const seqs: number[] = (read.json?.messages ?? []).map((m: any) => Number(m.seq));
  check('with sequence numbers that increase', seqs[0] < seqs[1], seqs);

  const cursor = await call(other, `/rooms/${circleId}/messages?after_seq=${seqs[1]}&limit=50`);
  check('and the after_seq cursor returns nothing when the room is quiet', (cursor.json?.messages ?? []).length === 0);

  /* --------------------------------------------------------------- */
  console.log('\n5. A POST THAT READS AS ADVICE');

  const advice = await call(other, `/rooms/${circleId}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'just buy AAPL here, guaranteed money' },
  });
  check('it still goes up — nothing is blocked', advice.status === 201, advice.status);
  check(
    'and the writer is told what the room is for',
    /advice/i.test(String(advice.json?.plain ?? '')),
    advice.json?.plain
  );
  const adviceId: string | undefined = advice.json?.message?.id;

  const queuedForAdvice = await admin
    .from('reports')
    .select('id,reason,reporter_id')
    .eq('message_id', adviceId ?? '')
    .eq('status', 'open');
  check('a report is filed with no reporter, so a human sees it', (queuedForAdvice.data ?? []).length === 1, queuedForAdvice.data);

  /* --------------------------------------------------------------- */
  console.log('\n6-7. SUPPORT REMOVES A POST');

  const memberRemove = await call(member, `/messages/${adviceId}/remove`, {
    method: 'POST',
    body: { reason: 'I do not like it' },
  });
  check('a member cannot remove anything', memberRemove.status === 404, memberRemove.status);

  const removed = await call(support, `/messages/${adviceId}/remove`, {
    method: 'POST',
    body: { reason: 'Tells somebody what to do with their money and promises an outcome.' },
  });
  check('support removes it', removed.status === 200, { status: removed.status, body: removed.json });
  check('and the open report is closed with it', removed.json?.reports_closed >= 1, removed.json?.reports_closed);

  const afterRemoval = await call(member, `/rooms/${circleId}/messages?after_seq=0&limit=50`);
  const removedRow = (afterRemoval.json?.messages ?? []).find((m: any) => m.id === adviceId);
  check('the row keeps its place in the thread', !!removedRow, afterRemoval.json?.messages?.length);
  check('and its words are gone', removedRow?.body === null && removedRow?.deleted === true, removedRow);

  // THE RLS CHECK. A member holding their own JWT asks PostgREST for the base
  // table directly. Before 0031 this returned the removed body.
  const asMember = createClient(URL_!, ANON!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${member.token}` } },
  });
  const direct = await asMember.from('messages').select('id,body').eq('id', adviceId ?? '');
  check(
    'a member cannot read the removed words off the table',
    direct.error !== null || (direct.data ?? []).length === 0,
    direct.error?.message ?? direct.data
  );

  const viaView = await asMember.from('messages_public').select('id,body,deleted').eq('id', adviceId ?? '');
  check(
    'but the view still shows the gap',
    (viaView.data ?? []).length === 1 && (viaView.data as any)[0].body === null,
    viaView.error?.message ?? viaView.data
  );

  const foreignRoom = await asMember.from('messages_public').select('id').neq('room_id', circleId).limit(1);
  check(
    'and shows nothing from a room they are not in',
    (foreignRoom.data ?? []).length === 0,
    foreignRoom.error?.message ?? foreignRoom.data
  );

  // THE ONE THAT WAS ACTUALLY OPEN. Until 0031 §8, a member could DELETE any
  // message in a room they belonged to, straight through the view — measured,
  // not theorised. A view has no RLS and an auto-updatable one writes with its
  // OWNER's rights, so a stray write grant on a view is not like a stray write
  // grant on a table. This is the regression test for that.
  const canary = await admin
    .from('messages')
    .insert({ room_id: circleId, user_id: null, seq: 999_990, kind: 'text', body: 'CANARY' } as never)
    .select('id')
    .single();
  const canaryId = (canary.data as any)?.id as string | undefined;
  if (canaryId) {
    const visible = await asMember.from('messages_public').select('id').eq('id', canaryId);
    check('the member can see a post in their own room', (visible.data ?? []).length === 1);
    const attempt = await asMember.from('messages_public').delete().eq('id', canaryId);
    const survived = await admin.from('messages').select('id').eq('id', canaryId);
    check('and cannot delete it through the view', attempt.error !== null, attempt.error?.message ?? 'DELETE WAS ACCEPTED');
    check('the post is still there', (survived.data ?? []).length === 1);
    await admin.from('messages').delete().eq('id', canaryId);
  }

  /* --------------------------------------------------------------- */
  console.log('\n8. SUPPORT MUTES A MEMBER');

  const muted = await call(support, `/rooms/${circleId}/moderate`, {
    method: 'POST',
    body: { user_id: other.id, action: 'mute', minutes: 60, reason: 'Second warning about advice.' },
  });
  check('support mutes them', muted.status === 200, { status: muted.status, body: muted.json });
  check('for a stated length, not forever', /hour/i.test(String(muted.json?.plain ?? '')), muted.json?.plain);

  const blocked = await call(other, `/rooms/${circleId}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'trying again' },
  });
  check('and they cannot post', blocked.status === 403 || blocked.status === 423, blocked.status);
  check(
    'and are told a moderator did it',
    /moderator/i.test(String(blocked.json?.error?.message_plain ?? '')),
    blocked.json?.error?.message_plain
  );

  const stillReads = await call(other, `/rooms/${circleId}/messages?after_seq=0&limit=50`);
  check('but they can still read the room', stillReads.status === 200, stillReads.status);

  const unmuted = await call(support, `/rooms/${circleId}/moderate`, {
    method: 'POST',
    body: { user_id: other.id, action: 'unmute', reason: 'Talked it through.' },
  });
  check('and support can lift it', unmuted.status === 200, unmuted.status);
  const speaksAgain = await call(other, `/rooms/${circleId}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'Fair enough. Flat, watching the prior day high.' },
  });
  check('after which they can post again', speaksAgain.status === 201, speaksAgain.status);

  /* --------------------------------------------------------------- */
  console.log('\n9. THE QUEUE');

  const reported = await call(other, `/messages/${firstId}/report`, {
    method: 'POST',
    body: { reason: 'Testing the queue.' },
  });
  check('a member can report a post', reported.status === 201 || reported.status === 200, reported.status);

  const memberQueue = await call(member, '/moderation/queue');
  check('a member cannot open the queue', memberQueue.status === 404, memberQueue.status);

  const queue = await call(support, '/moderation/queue');
  check('support can', queue.status === 200, queue.status);
  const mine = (queue.json?.items ?? []).find((i: any) => i.message_id === firstId);
  check('and the report is in it', !!mine, (queue.json?.items ?? []).length);
  check('with the words that were actually posted', typeof mine?.body === 'string' && mine.body.length > 0, mine?.body);

  const kept = await call(support, `/messages/${firstId}/keep`, {
    method: 'POST',
    body: { reason: 'Nothing wrong with it.' },
  });
  check('support can decide it stays', kept.status === 200, kept.status);
  check('and that closes the report', kept.json?.reports_closed >= 1, kept.json?.reports_closed);

  const after = await call(support, '/moderation/queue');
  check(
    'so the queue does not keep showing it',
    !(after.json?.items ?? []).some((i: any) => i.message_id === firstId),
    (after.json?.items ?? []).length
  );

  /* --------------------------------------------------------------- */
  console.log('\n10. THE RECORD');

  const modLog = await admin
    .from('moderation_log')
    .select('action,actor_id')
    .in('actor_id', [support.id])
    .order('id', { ascending: false })
    .limit(10);
  const actions = (modLog.data ?? []).map((r: any) => String(r.action));
  check('every moderation act wrote a row', actions.length >= 4, actions);
  check('including the removal', actions.includes('remove'), actions);
  check('the mute', actions.includes('mute'), actions);
  check('lifting it', actions.includes('restore'), actions);
  check('and the decision to leave a post up', actions.includes('label'), actions);
}

main()
  .catch((e) => {
    fail += 1;
    console.error('\nTHREW:', e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    for (const c of cleanup.reverse()) await c().catch(() => {});
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  });
