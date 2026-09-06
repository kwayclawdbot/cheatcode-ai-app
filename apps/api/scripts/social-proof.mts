/**
 * THE SOCIAL LAYER, PROVED END TO END.
 *
 * Same shape as `community-chat-test.mts`: real accounts, a real database, a
 * running API, and the questions the owner actually asked —
 *
 *   1. can somebody post a photo, and does the location come off it?
 *   2. can somebody else in the room see it?
 *   3. can somebody NOT in the room see it — through the API, through
 *      PostgREST, or straight off the storage bucket?
 *   4. do comments go one level deep and stop?
 *   5. do reactions persist, toggle, and count once per person?
 *   6. does removing a post take its comments AND its pictures with it —
 *      and are the pictures gone from the BUCKET, not just from a row?
 *   7. is an unattached upload cleaned up?
 *
 * RUN:
 *   API=http://localhost:3000 npx tsx --env-file=.env.local scripts/social-proof.mts
 *   API=https://<preview>.vercel.app npx tsx --env-file=.env.prod scripts/social-proof.mts
 *
 * It creates its own accounts and deletes them, the room membership, the
 * messages and every file it uploaded, pass or fail.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API = process.env.API ?? 'http://localhost:3000';
const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const INTERNAL = process.env.INTERNAL_SECRET;

if (!URL_ || !SERVICE || !ANON) {
  console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY. Run from apps/api.');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
};

type Account = { id: string; email: string; token: string; label: string };

async function makeAccount(label: string, role: 'member' | 'support'): Promise<Account> {
  const email = `social-${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@cheatcode.test`;
  const password = 'Test-Passw0rd-social!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`create ${label}: ${created.error?.message}`);
  const id = created.data.user.id;

  if (role === 'support') {
    const { error } = await admin.from('staff_members').upsert(
      { user_id: id, role, granted_at: new Date().toISOString(), revoked_at: null } as never,
      { onConflict: 'user_id' }
    );
    if (error) throw new Error(`grant support: ${error.message}`);
  }

  // A username, because the identity lane's posting gate requires one and this
  // script is not testing that gate. Set in SQL for the same reason staff is:
  // the point here is media, threads and reactions, not the signup flow.
  const handle = `sp${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const named = await admin.from('profiles').update({ handle } as never).eq('user_id', id);
  if (named.error) throw new Error(`handle for ${label}: ${named.error.message}`);

  const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(`sign in ${label}: ${signed.error?.message}`);
  return { id, email, token: signed.data.session.access_token, label };
}

async function call(who: Account, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${who.token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as any };
}

/* ------------------------------------------------------------------ */
/* A photograph with a location in it                                   */
/* ------------------------------------------------------------------ */

const BARE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

/** The same JPEG with an XMP block carrying coordinates and a name. */
const SECRET = 'HOME-51.5074N-0.1278W-A-REAL-PERSON';
function photoWithLocation(): Buffer {
  const xmp = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/', 'ascii'),
    Buffer.from([0x00]),
    Buffer.from(
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description exif:GPSLatitude="${SECRET}"/></x:xmpmeta>`,
      'ascii'
    ),
  ]);
  const len = xmp.length + 2;
  return Buffer.concat([
    BARE_JPEG.subarray(0, 2),
    Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]),
    xmp,
    BARE_JPEG.subarray(2),
  ]);
}

async function upload(who: Account, bytes: Buffer, name = 'photo.jpg', purpose = 'message') {
  const form = new FormData();
  form.append('purpose', purpose);
  // `new Uint8Array(...)` and not the Buffer itself: a Node Buffer is not a
  // BlobPart under this lib.dom, and the build typechecks scripts.
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), name);
  const res = await fetch(`${API}/api/v1/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${who.token}` },
    body: form,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as any };
}

const cleanup: (() => Promise<void>)[] = [];

async function main() {
  console.log(`\nSOCIAL LAYER — end to end against ${API}\n`);

  const author = await makeAccount('author', 'member');
  const reader = await makeAccount('reader', 'member');
  const outsider = await makeAccount('outsider', 'member');
  const support = await makeAccount('support', 'support');
  for (const a of [author, reader, outsider, support]) {
    cleanup.push(async () => {
      await admin.from('staff_members').delete().eq('user_id', a.id);
      await admin.auth.admin.deleteUser(a.id);
    });
  }

  // A core room the two members join and the outsider does not.
  const rooms = await admin.from('rooms').select('id,name').eq('type', 'core').limit(1);
  const room = (rooms.data ?? [])[0] as { id: string; name: string } | undefined;
  if (!room) throw new Error('No core room on this database. Run the seed first.');
  for (const a of [author, reader]) {
    const j = await call(a, `/rooms/${room.id}/join`, { method: 'POST' });
    if (j.status >= 400) throw new Error(`${a.label} could not join ${room.name}: ${JSON.stringify(j.json)}`);
    cleanup.push(async () => { await admin.from('room_members').delete().eq('room_id', room.id).eq('user_id', a.id); });
  }

  /* --------------------------------------------------------------- */
  console.log('1. A PHOTO GOES UP, AND ITS LOCATION DOES NOT');

  const up = await upload(author, photoWithLocation());
  check('the upload is accepted', up.status === 201, { status: up.status, json: up.json });
  const assetId: string = up.json?.asset?.id;
  check('it comes back with an id', !!assetId);
  check(
    'the member is TOLD the location was removed',
    /location/i.test(String(up.json?.plain ?? '')),
    up.json?.plain
  );
  check('and what was removed is named', (up.json?.removed ?? []).some((r: string) => /XMP|EXIF/.test(r)), up.json?.removed);
  check('a permanent address comes back too', typeof up.json?.stable_url === 'string' && up.json.stable_url.includes(assetId));

  // Read the OBJECT back with the service role and look inside it.
  const assetRow = await admin.from('media_assets').select('bucket_id,object_path,bytes,width,height').eq('id', assetId).maybeSingle();
  const stored = assetRow.data as any;
  check('a row exists for it', !!stored);
  cleanup.push(async () => { await admin.from('media_assets').delete().eq('id', assetId); });

  if (stored) {
    const dl = await admin.storage.from(stored.bucket_id).download(stored.object_path);
    const storedBytes = Buffer.from(await (dl.data as Blob).arrayBuffer());
    check('the stored object contains NO location data', !storedBytes.includes(Buffer.from(SECRET, 'ascii')));
    check('the original DID contain it (so the check means something)', photoWithLocation().includes(Buffer.from(SECRET, 'ascii')));
    check('the stored size is what the server measured, not what the client sent', stored.bytes === storedBytes.length, {
      row: stored.bytes, actual: storedBytes.length,
    });
  }

  /* --------------------------------------------------------------- */
  console.log('\n2. LIMITS ARE ENFORCED HERE, NOT ON THE PHONE');

  const notAPhoto = await upload(author, Buffer.concat([Buffer.from('MZ', 'ascii'), Buffer.alloc(500)]), 'trojan.jpg');
  check('an executable renamed .jpg is refused', notAPhoto.status >= 400, notAPhoto.status);
  check('  ...and the reason is readable', /JPEG|PNG|picture/i.test(String(notAPhoto.json?.error?.message_plain ?? '')), notAPhoto.json?.error?.message_plain);

  const tooBig = await upload(author, Buffer.concat([BARE_JPEG, Buffer.alloc(5 * 1024 * 1024)]), 'huge.jpg');
  check('a file over the ceiling is refused', tooBig.status >= 400, tooBig.status);

  const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic', 'ascii'), Buffer.alloc(64)]);
  const heicRes = await upload(author, heic, 'IMG_0001.HEIC');
  check('a HEIC is refused, and named as one', heicRes.status >= 400 && /HEIC/i.test(String(heicRes.json?.error?.message_plain ?? '')), heicRes.json?.error?.message_plain);

  /* --------------------------------------------------------------- */
  console.log('\n3. THE POST, AND WHO CAN SEE THE PICTURE');

  const posted = await call(author, `/rooms/${room.id}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'Here is the chart I was talking about.', attachment_ids: [assetId] },
  });
  check('the post is accepted', posted.status === 201, posted.json);
  const postId: string = posted.json?.message?.id;
  check('the picture came back attached to it', (posted.json?.message?.media ?? []).length === 1, posted.json?.message?.media);
  if (postId) cleanup.push(async () => { await admin.from('messages').delete().eq('id', postId); });

  const captionless = await call(author, `/rooms/${room.id}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: '', attachment_ids: [] },
  });
  check('a post with neither words nor a picture is refused', captionless.status >= 400, captionless.status);

  const readerView = await call(reader, `/rooms/${room.id}/messages?limit=50`);
  const seen = (readerView.json?.messages ?? []).find((m: any) => m.id === postId);
  check('another member in the room sees the post', !!seen);
  check('  ...with a working link to the picture', typeof seen?.media?.[0]?.url === 'string');

  if (seen?.media?.[0]?.url) {
    const img = await fetch(seen.media[0].url);
    check('  ...and the link actually resolves to the file', img.ok, img.status);
    const body = Buffer.from(await img.arrayBuffer());
    check('  ...which still has no location in it', !body.includes(Buffer.from(SECRET, 'ascii')));
  }

  const outsiderView = await call(outsider, `/rooms/${room.id}/messages?limit=50`);
  check('somebody NOT in the room is refused the room', outsiderView.status >= 400, outsiderView.status);

  const outsiderDirect = await call(outsider, `/media/${assetId}`);
  check('and refused the picture by id', outsiderDirect.status >= 400, outsiderDirect.status);

  /* --------------------------------------------------------------- */
  console.log('\n4. THE LOCKS, ASKED WITH A REAL SIGNED-IN KEY');

  const asMember = createClient(URL_!, ANON!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${author.token}` } },
  });

  for (const table of ['media_assets', 'message_reactions', 'media_deletions']) {
    const r = await asMember.from(table).select('*').limit(1);
    check(`a signed-in member cannot read ${table}`, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? r.data);
  }

  const bucketList = await asMember.storage.from('community-media').list('message');
  check(
    'a signed-in member cannot browse the bucket',
    !!bucketList.error || (bucketList.data ?? []).length === 0,
    bucketList.error?.message ?? bucketList.data
  );

  if (stored) {
    const direct = await asMember.storage.from(stored.bucket_id).download(stored.object_path);
    check('a signed-in member cannot download the object without a signature', !!direct.error, direct.error?.message);

    const publicGuess = `${URL_}/storage/v1/object/public/${stored.bucket_id}/${stored.object_path}`;
    const anonHit = await fetch(publicGuess);
    check('and the public URL for it does not exist', !anonHit.ok, anonHit.status);
  }

  /* --------------------------------------------------------------- */
  console.log('\n5. COMMENTS GO ONE LEVEL DEEP AND STOP');

  const comment = await call(reader, `/rooms/${room.id}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'What is your invalidation on that?', parent_id: postId },
  });
  check('a comment on the post is accepted', comment.status === 201, comment.json);
  const commentId: string = comment.json?.message?.id;

  const nested = await call(author, `/rooms/${room.id}/messages`, {
    method: 'POST',
    body: { kind: 'text', body: 'replying to the reply', parent_id: commentId },
  });
  check('a comment on a COMMENT is refused', nested.status >= 400, nested.status);
  check(
    '  ...and the refusal says what to do instead',
    /comment on a post/i.test(String(nested.json?.error?.message_plain ?? '')),
    nested.json?.error?.message_plain
  );

  const thread = await call(reader, `/messages/${postId}/replies`);
  check('the thread reads back', thread.status === 200, thread.status);
  check('  ...with the post at the top', thread.json?.parent?.id === postId);
  check('  ...and the comment under it', (thread.json?.replies ?? []).length === 1, thread.json?.replies?.length);

  const roomAgain = await call(reader, `/rooms/${room.id}/messages?limit=50`);
  const inFeed = (roomAgain.json?.messages ?? []).map((m: any) => m.id);
  check('the comment does NOT also appear in the room feed', !inFeed.includes(commentId));
  const postRow = (roomAgain.json?.messages ?? []).find((m: any) => m.id === postId);
  check('the post carries the comment count', postRow?.reply_count === 1, postRow?.reply_count);

  /* --------------------------------------------------------------- */
  console.log('\n6. REACTIONS PERSIST, TOGGLE, AND COUNT ONCE PER PERSON');

  const r1 = await call(author, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'agree' } });
  check('a reaction registers', r1.status === 200 && r1.json?.reactions?.counts?.agree === 1, r1.json);
  check('  ...and comes back as mine', (r1.json?.reactions?.mine ?? []).includes('agree'));

  const r2 = await call(author, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'agree' } });
  check('the same tap again takes it back', r2.json?.reactions?.counts?.agree === undefined, r2.json?.reactions?.counts);
  check('  ...and it is no longer mine', !(r2.json?.reactions?.mine ?? []).includes('agree'));

  await call(author, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'agree' } });
  const r3 = await call(reader, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'agree' } });
  check('two people agreeing counts two', r3.json?.reactions?.counts?.agree === 2, r3.json?.reactions?.counts);

  const r4 = await call(reader, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'disagree' } });
  check('the same person can also disagree with something else', r4.json?.reactions?.counts?.disagree === 1, r4.json?.reactions?.counts);

  const bad = await call(reader, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'fire' } });
  check('a reaction outside the set is refused', bad.status >= 400, bad.status);

  const outsiderReact = await call(outsider, `/messages/${postId}/reactions`, { method: 'POST', body: { kind: 'agree' } });
  check('somebody not in the room cannot react', outsiderReact.status >= 400, outsiderReact.status);

  // Read it back through the room, which is the path that has to be cheap.
  const withCounts = await call(reader, `/rooms/${room.id}/messages?limit=50`);
  const counted = (withCounts.json?.messages ?? []).find((m: any) => m.id === postId);
  check('the room hands the counts back with the message', counted?.reactions?.counts?.agree === 2, counted?.reactions);
  check('  ...and says which are the reader’s own', (counted?.reactions?.mine ?? []).sort().join(',') === 'agree,disagree', counted?.reactions?.mine);

  /* --------------------------------------------------------------- */
  console.log('\n7. REMOVAL TAKES THE COMMENTS AND THE PICTURE');

  const objectPath = stored?.object_path as string | undefined;
  const bucketId = stored?.bucket_id as string | undefined;

  const removed = await call(support, `/messages/${postId}/remove`, {
    method: 'POST',
    body: { reason: 'Proof run — checking that removal is real.' },
  });
  check('a moderator can remove it', removed.status === 200, removed.json);
  check('  ...and is told the comment came down with it', removed.json?.replies_removed === 1, removed.json?.replies_removed);
  check('  ...and is told the picture was deleted from storage', removed.json?.media_purged >= 1, removed.json?.media_purged);
  check('  ...in words, not just a number', /picture/i.test(String(removed.json?.plain ?? '')), removed.json?.plain);

  const rowsLeft = await admin.from('media_assets').select('id').eq('id', assetId);
  check('the media row is gone', (rowsLeft.data ?? []).length === 0);

  if (bucketId && objectPath) {
    const gone = await admin.storage.from(bucketId).download(objectPath);
    check('THE OBJECT IS GONE FROM THE BUCKET, not just the row', !!gone.error, gone.error?.message);

    const receipt = await admin
      .from('media_deletions')
      .select('reason,purged_at')
      .eq('object_path', objectPath)
      .maybeSingle();
    const rec = receipt.data as any;
    check('there is a receipt saying it was purged', !!rec?.purged_at, rec);
    check('  ...and why', rec?.reason === 'message_removed', rec?.reason);
  }

  const afterRemoval = await call(reader, `/rooms/${room.id}/messages?limit=50`);
  const stub = (afterRemoval.json?.messages ?? []).find((m: any) => m.id === postId);
  check('the post keeps its place in the room', !!stub);
  check('  ...with no words', stub?.body === null, stub?.body);
  check('  ...no pictures', (stub?.media ?? []).length === 0);
  check('  ...and no reactions', Object.keys(stub?.reactions?.counts ?? {}).length === 0, stub?.reactions);

  const threadAfter = await call(reader, `/messages/${postId}/replies`);
  const removedComment = (threadAfter.json?.replies ?? [])[0];
  check('the comment is down too', removedComment?.deleted === true, removedComment);

  const cascade = await admin.from('messages').select('deleted_cascade_of').eq('id', commentId).maybeSingle();
  check(
    '  ...recorded as a cascade, not as a judgement on the commenter',
    (cascade.data as any)?.deleted_cascade_of === postId,
    cascade.data
  );

  /* --------------------------------------------------------------- */
  console.log('\n8. AN UPLOAD NOBODY POSTED');

  const orphan = await upload(author, photoWithLocation(), 'never-posted.jpg');
  const orphanId: string = orphan.json?.asset?.id;
  check('it uploads fine', orphan.status === 201);
  if (orphanId) {
    cleanup.push(async () => { await admin.from('media_assets').delete().eq('id', orphanId); });
    // Age it past the sweep's cutoff rather than waiting an hour.
    await admin
      .from('media_assets')
      .update({ created_at: new Date(Date.now() - 3 * 3600_000).toISOString() })
      .eq('id', orphanId);

    if (INTERNAL) {
      const sweep = await fetch(`${API}/api/v1/internal/media/purge`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL },
      });
      const sj = await sweep.json().catch(() => null);
      check('the sweep collects it', (sj as any)?.orphans_swept >= 1, sj);
      const left = await admin.from('media_assets').select('id').eq('id', orphanId);
      check('  ...and its row is gone', (left.data ?? []).length === 0);
    } else {
      console.log('  SKIP  the orphan sweep — no INTERNAL_SECRET in this environment');
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
}

main()
  .catch((e) => { console.error('\nRUN FAILED:', e); fail += 1; })
  .finally(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
    process.exit(fail === 0 ? 0 : 1);
  });
