/**
 * THE SAME PROOF, AGAINST THE HOSTED PROJECT AND ITS REAL BUCKET.
 *
 * `social-proof.mts` drives the HTTP routes and is the fuller test; it needs an
 * API deployment it can reach, and a Vercel preview sits behind deployment
 * protection. This one skips the routes and calls the media module itself
 * against the hosted database and the hosted storage bucket, which is where the
 * things that can only be checked in production live:
 *
 *   · does a real object land in the real bucket, and is the location gone?
 *   · is that bucket genuinely closed to a signed-in member's own key?
 *   · does the removal trigger fire on the hosted database?
 *   · does the purge actually delete the object from hosted storage?
 *
 * WHAT IT DOES NOT COVER, and so is not claimed: the route wrappers — auth,
 * membership, rate limits, multipart parsing. Those are proved by
 * `social-proof.mts` against a running API, and the code they wrap is the same
 * code this file calls.
 *
 * RUN:
 *   npx tsx --env-file=.env.prod scripts/media-hosted-proof.mts
 *
 * It creates a throwaway account and a throwaway message and removes both.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { acceptUpload, attachToMessage, purgePending } from '../src/lib/media/store.ts';

const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL_ || !SERVICE || !ANON) {
  console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY.');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
};

const BARE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

const SECRET = 'HOSTED-PROOF-5.6489N-0.1218W';

function photoWithLocation(): Buffer {
  const xmp = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/', 'ascii'),
    Buffer.from([0x00]),
    Buffer.from(`<x:xmpmeta><rdf:Description exif:GPSLatitude="${SECRET}"/></x:xmpmeta>`, 'ascii'),
  ]);
  const len = xmp.length + 2;
  return Buffer.concat([
    BARE_JPEG.subarray(0, 2),
    Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]),
    xmp,
    BARE_JPEG.subarray(2),
  ]);
}

const cleanup: (() => Promise<void>)[] = [];

async function main() {
  console.log(`\nMEDIA ON HOSTED — ${URL_}\n`);

  /* --- an account and a message to hang it on --- */
  const email = `hosted-media-${Date.now()}@cheatcode.test`;
  const password = 'Test-Passw0rd-hosted!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const userId = created.data.user.id;
  cleanup.push(async () => { await admin.auth.admin.deleteUser(userId); });

  const anonClient = createClient(URL_!, ANON!, { auth: { persistSession: false } });
  const signed = await anonClient.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(signed.error?.message);
  const token = signed.data.session.access_token;

  const rooms = await admin.from('rooms').select('id').eq('type', 'core').limit(1);
  const roomId = (rooms.data ?? [])[0]?.id as string | undefined;
  if (!roomId) throw new Error('No core room on the hosted database.');

  const top = await admin.from('messages').select('seq').eq('room_id', roomId).order('seq', { ascending: false }).limit(1).maybeSingle();
  const seq = Number((top.data as any)?.seq ?? 0) + 1;
  const msg = await admin
    .from('messages')
    .insert({ room_id: roomId, user_id: userId, seq, kind: 'text', body: 'hosted media proof' } as never)
    .select('id')
    .single();
  if (msg.error || !msg.data) throw new Error(`message: ${msg.error?.message}`);
  const messageId = (msg.data as any).id as string;
  cleanup.push(async () => { await admin.from('messages').delete().eq('id', messageId); });

  /* --------------------------------------------------------------- */
  console.log('1. A REAL OBJECT IN THE REAL BUCKET');

  const dirty = photoWithLocation();
  check('the fixture carries a location before upload', dirty.includes(Buffer.from(SECRET, 'ascii')));

  const { asset, removed } = await acceptUpload({
    ownerId: userId,
    purpose: 'message',
    bytes: new Uint8Array(dirty),
    declaredMime: 'image/jpeg',
    requestId: 'hosted-proof',
  });
  cleanup.push(async () => { await admin.from('media_assets').delete().eq('id', asset.id); });
  check('it is accepted and stored', !!asset.id, asset.id);
  check('the metadata block is named as removed', removed.some((r) => /XMP|EXIF/.test(r)), removed);
  check('it went into the private community bucket', asset.bucket_id === 'community-media', asset.bucket_id);

  const dl = await admin.storage.from(asset.bucket_id).download(asset.object_path);
  check('the object is there', !dl.error, dl.error?.message);
  if (dl.data) {
    const bytes = Buffer.from(await (dl.data as Blob).arrayBuffer());
    check('AND IT HAS NO LOCATION IN IT', !bytes.includes(Buffer.from(SECRET, 'ascii')));
    check('the row records what the server measured', asset.bytes === bytes.length, { row: asset.bytes, actual: bytes.length });
  }

  /* --------------------------------------------------------------- */
  console.log('\n2. THE LOCKS ON HOSTED, ASKED WITH A REAL SIGNED-IN KEY');

  const asMember = createClient(URL_!, ANON!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  for (const table of ['media_assets', 'message_reactions', 'media_deletions']) {
    const r = await asMember.from(table).select('*').limit(1);
    check(`a signed-in member cannot read ${table}`, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? r.data);
  }
  for (const table of ['media_assets', 'message_reactions']) {
    const w = await asMember.from(table).insert({} as never);
    check(`a signed-in member cannot write ${table}`, !!w.error, w.error?.message);
  }

  const browse = await asMember.storage.from('community-media').list('message');
  check('a signed-in member cannot browse the bucket', !!browse.error || (browse.data ?? []).length === 0, browse.error?.message ?? browse.data);

  const grab = await asMember.storage.from('community-media').download(asset.object_path);
  check('a signed-in member cannot download the object', !!grab.error, grab.error?.message);

  const publicGuess = `${URL_}/storage/v1/object/public/community-media/${asset.object_path}`;
  const anonHit = await fetch(publicGuess);
  check('the object has no public URL', !anonHit.ok, anonHit.status);

  const avatarBrowse = await asMember.storage.from('avatars').list('');
  check('and the avatars bucket is closed the same way', !!avatarBrowse.error || (avatarBrowse.data ?? []).length === 0, avatarBrowse.error?.message ?? avatarBrowse.data);

  /* --------------------------------------------------------------- */
  console.log('\n3. A SIGNED LINK WORKS, AND STOPS WORKING WHEN THE FILE GOES');

  await attachToMessage({ assetIds: [asset.id], ownerId: userId, messageId, requestId: 'hosted-proof' });
  const attached = await admin.from('media_assets').select('message_id').eq('id', asset.id).maybeSingle();
  check('the picture is attached to the post', (attached.data as any)?.message_id === messageId);

  const counted = await admin.from('messages').select('attachment_count').eq('id', messageId).maybeSingle();
  check('the post carries the attachment count', (counted.data as any)?.attachment_count === 1, counted.data);

  const signedUrl = await admin.storage.from(asset.bucket_id).createSignedUrl(asset.object_path, 300);
  const before = await fetch(signedUrl.data?.signedUrl ?? '');
  check('a signed link fetches the file', before.ok, before.status);

  /* --------------------------------------------------------------- */
  console.log('\n4. REMOVAL ON HOSTED IS REAL');

  await admin.from('messages').update({ deleted_at: new Date().toISOString() } as never).eq('id', messageId);

  const rowGone = await admin.from('media_assets').select('id').eq('id', asset.id);
  check('the trigger deleted the media row', (rowGone.data ?? []).length === 0);

  const queued = await admin
    .from('media_deletions')
    .select('id,reason,purged_at')
    .eq('object_path', asset.object_path)
    .maybeSingle();
  check('and queued the object for deletion', !!queued.data, queued.data);
  check('  ...with the reason recorded', (queued.data as any)?.reason === 'message_removed', (queued.data as any)?.reason);

  const purge = await purgePending({ limit: 50, requestId: 'hosted-proof' });
  check('the purge runs', purge.attempted > 0, purge);

  // The ORIGIN is authoritative and is checked first: the object must not be
  // listed any more, immediately.
  const listed = await admin.storage
    .from(asset.bucket_id)
    .list(asset.object_path.split('/').slice(0, -1).join('/'), { limit: 200 });
  const name = asset.object_path.split('/').pop();
  check(
    'THE OBJECT IS GONE FROM HOSTED STORAGE',
    !(listed.data ?? []).some((o) => o.name === name),
    (listed.data ?? []).map((o) => o.name)
  );

  /**
   * THE EDGE CACHE IS A SEPARATE FACT AND IS MEASURED, NOT ASSUMED.
   *
   * Deleting an object at the origin does not instantly stop a CDN node
   * serving the copy it already has. Measured on 2026-09-06 the stale window
   * was under a minute. This waits for it and REPORTS THE TIME rather than
   * pretending removal is instantaneous everywhere — a reviewer asking how
   * fast a reported picture disappears deserves the real number.
   */
  const startedAt = Date.now();
  let clearedAfterMs: number | null = null;
  for (let i = 0; i < 30; i++) {
    const hit = await fetch(signedUrl.data?.signedUrl ?? '');
    if (!hit.ok) { clearedAfterMs = Date.now() - startedAt; break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  check(
    `the link that worked a moment ago stops resolving (took ${clearedAfterMs === null ? '>150' : Math.round(clearedAfterMs / 1000)}s)`,
    clearedAfterMs !== null,
    'still served from the edge after 150 seconds'
  );

  const receipt = await admin.from('media_deletions').select('purged_at').eq('object_path', asset.object_path).maybeSingle();
  check('there is a receipt', !!(receipt.data as any)?.purged_at, receipt.data);

  console.log(`\n${pass} passed, ${fail} failed\n`);
}

main()
  .catch((e) => { console.error('\nRUN FAILED:', e); fail += 1; })
  .finally(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
    process.exit(fail === 0 ? 0 : 1);
  });
