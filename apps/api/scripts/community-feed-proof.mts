/**
 * THE V2 COMMUNITY FEED, PROVED AGAINST A REAL DATABASE.
 *
 *   cd apps/api && npx tsx scripts/community-feed-proof.mts     # .env.local
 *
 * Part of `npm test`. It needs the database in .env.local to have migrations
 * 0050–0053 applied (a LOCAL or practice stack — never production; it refuses
 * a supabase.co URL). It calls the route handlers IN-PROCESS with real signed-in
 * users, so every check goes through auth, validation and the same service-role
 * code the phone reaches, with no server to start.
 *
 * What it proves, endpoint by endpoint:
 *   auth          no token → 401 on every route
 *   posts         handle required; text / chart / call / picture posts; a
 *                 backwards call is refused and leaves nothing behind
 *   media         another member's picture, a used picture, a duplicate → 400
 *   feed tabs     for_you / following / trade_calls / media hold what they say
 *   ranking       a followed author outranks a newer stranger for the follower
 *                 only; engagement and belt move posts within their caps
 *   pagination    cursor walk: no duplicates, no gaps, strictly ordered; a
 *                 forged cursor → 400
 *   likes         idempotent on and off, live count, `liked`
 *   reposts       idempotent, count, own post refused, shows in a follower's
 *                 Following tab with reposted_by, undo removes it
 *   bookmarks     private: only in the owner's list, `bookmarked` only for them;
 *                 the table is closed to a signed-in client (RLS)
 *   replies       reply_count, participants, one level only, paging
 *   bans          a banned member's feed excludes the room; post → 404; write → 403
 *   delete        not yours → 404; cascade to replies, reposts, bookmarks; open
 *                 call withdrawn; resolved call refuses; result cards
 *   presence      heartbeat → counts on the strip; live flag from real posts;
 *                 feed room not on the strip or in the directory
 *   FK fix        deleting a user who has posted succeeds (0053) and anonymises
 *
 * Cleans up its accounts at the end, pass or fail.
 */
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---- env BEFORE any route module is imported -------------------------------
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const URL_ = process.env.SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
if (!URL_ || !SERVICE || !ANON) {
  console.error('community-feed-proof: need SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in apps/api/.env.local');
  process.exit(1);
}
if (/supabase\.co/i.test(URL_)) {
  console.error('community-feed-proof: refusing to run against a hosted project. Point .env.local at a local stack.');
  process.exit(1);
}
process.env.PUSH_DRY_RUN = '1';

const admin: SupabaseClient = createClient(URL_, SERVICE, { auth: { persistSession: false } });

{
  const probe = await admin.from('post_bookmarks').select('user_id').limit(1);
  if (probe.error) {
    console.error(`community-feed-proof: migrations 0050–0053 are not applied to ${URL_} (${probe.error.message}).`);
    console.error('  Apply them locally: psql "$LOCAL_DB_URL" -1 -f supabase/migrations/0050_*.sql (…0053).');
    process.exit(1);
  }
}

const { resetRateLimits } = await import('../src/lib/ratelimit.ts');
const feedRoute = await import('../src/app/api/v1/community/feed/route.ts');
const postsRoute = await import('../src/app/api/v1/community/posts/route.ts');
const postRoute = await import('../src/app/api/v1/community/posts/[id]/route.ts');
const repliesRoute = await import('../src/app/api/v1/community/posts/[id]/replies/route.ts');
const likeRoute = await import('../src/app/api/v1/community/posts/[id]/like/route.ts');
const repostRoute = await import('../src/app/api/v1/community/posts/[id]/repost/route.ts');
const bookmarkRoute = await import('../src/app/api/v1/community/posts/[id]/bookmark/route.ts');
const bookmarksRoute = await import('../src/app/api/v1/community/bookmarks/route.ts');
const liveRoute = await import('../src/app/api/v1/community/live-rooms/route.ts');
const presenceRoute = await import('../src/app/api/v1/community/presence/route.ts');
const mediaRoute = await import('../src/app/api/v1/media/route.ts');
const followRoute = await import('../src/app/api/v1/follows/[user_id]/route.ts');
const roomsRoute = await import('../src/app/api/v1/rooms/route.ts');

// ---- tiny harness ------------------------------------------------------------
let pass = 0;
let fail = 0;
const check = (name: string, cond: unknown, detail?: unknown) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`);
  }
};
const section = (t: string) => console.log(`\n${t}`);

type Acct = { id: string; token: string; handle: string | null; label: string };
const created: string[] = [];
const RUN = Math.random().toString(36).slice(2, 8);

async function makeAccount(label: string, withHandle = true): Promise<Acct> {
  const email = `feedproof-${label}-${RUN}@cheatcode.test`;
  const password = 'Feed-Proof-Passw0rd!';
  const c = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (c.error || !c.data.user) throw new Error(`create ${label}: ${c.error?.message}`);
  const id = c.data.user.id;
  created.push(id);
  let handle: string | null = null;
  if (withHandle) {
    handle = `fp${label}${RUN}`.toLowerCase().slice(0, 20);
    const u = await admin.from('profiles').update({ handle, display_name: `Proof ${label.toUpperCase()}` }).eq('user_id', id);
    if (u.error) throw new Error(`handle ${label}: ${u.error.message}`);
  }
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await anon.auth.signInWithPassword({ email, password });
  if (s.error || !s.data.session) throw new Error(`sign in ${label}: ${s.error?.message}`);
  return { id, token: s.data.session.access_token, handle, label };
}

type Handler = (req: never, route?: never) => Promise<Response>;
async function call(
  h: unknown,
  opts: { method?: string; path?: string; who?: Acct | null; body?: unknown; params?: Record<string, string>; form?: FormData }
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.who) headers.authorization = `Bearer ${opts.who.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const req = new Request(`http://proof.local/api/v1${opts.path ?? '/'}`, { method: opts.method ?? 'GET', headers, body });
  const res = await (h as Handler)(req as never, { params: Promise.resolve(opts.params ?? {}) } as never);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}

const feed = (who: Acct, tab = 'for_you', extra = '') => call(feedRoute.GET, { path: `/community/feed?tab=${tab}${extra}`, who });
const post = (who: Acct, body: unknown) => call(postsRoute.POST, { method: 'POST', path: '/community/posts', who, body });
const onPost = (h: unknown, method: string, who: Acct, id: string, body?: unknown, path = '') =>
  call(h, { method, path: `/community/posts/${id}${path}`, who, params: { id }, body });

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
async function upload(who: Acct): Promise<string | null> {
  const form = new FormData();
  form.set('purpose', 'message');
  form.set('file', new Blob([PNG], { type: 'image/png' }), 'dot.png');
  const r = await call(mediaRoute.POST, { method: 'POST', path: '/media', who, form });
  return r.status === 201 ? String(r.json.asset.id) : (console.log('   upload said', r.status, JSON.stringify(r.json)), null);
}

async function allPages(who: Acct, tab: string, limit: number): Promise<{ ids: string[]; pages: number; bad: boolean }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let bad = false;
  do {
    const r = await feed(who, tab, `&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (r.status !== 200) {
      bad = true;
      break;
    }
    ids.push(...r.json.posts.map((p: any) => p.id));
    cursor = r.json.next_cursor;
    pages += 1;
  } while (cursor && pages < 50);
  return { ids, pages, bad };
}

const hasId = (r: { json: any }, id: string) => Boolean(r.json?.posts?.some((p: any) => p.id === id));

// =============================================================================
let A: Acct, B: Acct, C: Acct, D: Acct, E: Acct, NOHANDLE: Acct;
try {
  section('Setup');
  [A, B, C, D, E, NOHANDLE] = await Promise.all([
    makeAccount('a'), makeAccount('b'), makeAccount('c'), makeAccount('d'), makeAccount('e'), makeAccount('n', false),
  ]);
  check('six throwaway accounts signed in', Boolean(A && B && C && D && E && NOHANDLE));
  const feedRoomRow = await admin.from('rooms').select('id').eq('slug', 'feed').single();
  const FEED = String(feedRoomRow.data?.id);
  const TRADERS = String((await admin.from('rooms').select('id').eq('slug', 'traders').single()).data?.id);
  const WINS = String((await admin.from('rooms').select('id').eq('slug', 'wins').single()).data?.id);

  // ---------------------------------------------------------------------------
  section('Auth: no token is 401 on every route');
  {
    const anyId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const results = await Promise.all([
      call(feedRoute.GET, { path: '/community/feed' }),
      call(postsRoute.POST, { method: 'POST', body: { body: 'x' } }),
      call(postRoute.GET, { params: { id: anyId } }),
      call(postRoute.DELETE, { method: 'DELETE', params: { id: anyId } }),
      call(repliesRoute.POST, { method: 'POST', params: { id: anyId }, body: { body: 'x' } }),
      call(likeRoute.POST, { method: 'POST', params: { id: anyId } }),
      call(repostRoute.POST, { method: 'POST', params: { id: anyId } }),
      call(bookmarkRoute.POST, { method: 'POST', params: { id: anyId } }),
      call(bookmarksRoute.GET, {}),
      call(liveRoute.GET, {}),
      call(presenceRoute.POST, { method: 'POST', body: {} }),
    ]);
    check('all eleven answered 401', results.every((r) => r.status === 401), results.map((r) => r.status));
  }

  // ---------------------------------------------------------------------------
  section('Posting');
  const noHandle = await post(NOHANDLE, { body: 'hello' });
  check('no username → 400 handle_required', noHandle.status === 400 && noHandle.json.error.detail.reason === 'handle_required', noHandle.json);

  const p1 = await post(A, { body: 'NVDA reclaimed 180 with volume. Watching the retest.' });
  check('text post → 201', p1.status === 201, p1.json);
  const P1 = p1.json?.post?.id as string;
  check('author is a display name plus a handle, belt-dyed', p1.json?.post?.author?.display_name === 'Proof A' && p1.json.post.author.handle === A.handle && p1.json.post.author.belt === 'white');
  check('it is in the feed room, mine, with zero counts', p1.json?.post?.room?.is_feed === true && p1.json.post.mine === true && p1.json.post.like_count === 0 && p1.json.post.reply_count === 0);

  const backwards = await post(A, { body: 'bad call', trade_call: { symbol: 'NVDA', direction: 'long', entry: 180, stop: 190 } });
  check('a long with its stop above entry → 400 in plain words', backwards.status === 400 && /stop goes below/i.test(backwards.json?.error?.message_plain ?? ''), backwards.json);
  const strayCalls = await admin.from('community_calls').select('id').eq('user_id', A.id);
  check('…and no call row was left behind', (strayCalls.data ?? []).length === 0, strayCalls.data);

  const p2 = await post(A, {
    body: 'NVDA long into the retest',
    charts: [{ symbol: 'nvda', timeframe: '1D', levels: [{ price: 180, kind: 'entry' }, { price: 172, kind: 'stop' }] }],
    trade_call: { symbol: 'NVDA', direction: 'long', entry: 180, stop: 172, target: 205 },
  });
  check('chart + call post → 201', p2.status === 201, p2.json);
  const P2 = p2.json?.post?.id as string;
  check('the call is embedded, structured and scoreable', p2.json?.post?.trade_call?.symbol === 'NVDA' && p2.json.post.trade_call.scoreable === true && p2.json.post.trade_call.message_id === P2);
  check('the chart comes back as media, upper-cased', p2.json?.post?.media?.[0]?.type === 'chart' && p2.json.post.media[0].symbol === 'NVDA' && p2.json.post.media[0].levels.length === 2);
  check('an open call has no result card', p2.json?.post?.result === null);
  check('no size field anywhere in the post', !/"(qty|quantity|notional|shares|size|pnl|realized_pnl)"/.test(JSON.stringify(p2.json)));

  section('Media validation');
  const assetA = await upload(A);
  check('A uploaded a picture', Boolean(assetA));
  const stolen = await post(B, { body: 'mine now', attachment_ids: [assetA] });
  check("B cannot attach A's picture → 400", stolen.status === 400 && stolen.json.error.detail.reason === 'media_not_attachable', stolen.json);
  const dup = await post(A, { body: 'twice', attachment_ids: [assetA, assetA] });
  check('the same picture twice → 400', dup.status === 400 && dup.json.error.detail.reason === 'media_duplicate', dup.json);
  const p3 = await post(A, { body: 'desk shot', attachment_ids: [assetA] });
  check('A attaches their own picture → 201 with one image', p3.status === 201 && p3.json.post.media.length === 1 && p3.json.post.media[0].type === 'image', p3.json);
  const P3 = p3.json?.post?.id as string;
  const reused = await post(A, { body: 'again', attachment_ids: [assetA] });
  check('a picture already on a post cannot be reused → 400', reused.status === 400, reused.json);
  const notUuid = await post(A, { body: 'x', attachment_ids: ['../../etc/passwd'] });
  check('a non-id attachment → 400', notUuid.status === 400);

  // ---------------------------------------------------------------------------
  section('Tabs');
  resetRateLimits();
  const followed = await call(followRoute.POST, { method: 'POST', who: B, params: { user_id: A.id }, path: `/follows/${A.id}` });
  check('B follows A', followed.status === 200 || followed.status === 201, followed.json);
  const pC = await post(C, { body: 'a newer post from someone B does not follow' });
  const PC = pC.json?.post?.id as string;

  const fyB = await feed(B);
  check('for_you holds every post', [P1, P2, P3, PC].every((id) => hasId(fyB, id)), fyB.json);
  const tc = await feed(B, 'trade_calls');
  check('trade_calls holds ONLY the call post', hasId(tc, P2) && !hasId(tc, P1) && !hasId(tc, P3) && !hasId(tc, PC));
  const md = await feed(B, 'media');
  check('media holds the chart post and the picture post only', hasId(md, P2) && hasId(md, P3) && !hasId(md, P1) && !hasId(md, PC));
  const flB = await feed(B, 'following');
  check("following holds A's posts and not C's", hasId(flB, P1) && hasId(flB, P2) && !hasId(flB, PC));
  const flE = await feed(E, 'following');
  check('following for somebody who follows nobody is empty with the right sentence', flE.json.posts.length === 0 && /not following anyone/i.test(flE.json.empty_plain));
  const badTab = await feed(B, 'hot');
  check('an unknown tab → 400', badTab.status === 400);

  section('Ranking (For You)');
  {
    const idxB = fyB.json.posts.map((p: any) => p.id);
    check("for the follower, A's OLDER post outranks C's newer one (follow boost)", idxB.indexOf(P1) < idxB.indexOf(PC), idxB);
    const fyE = await feed(E);
    const idxE = fyE.json.posts.map((p: any) => p.id);
    check("for a stranger, C's newer post comes first (no boost)", idxE.indexOf(PC) < idxE.indexOf(P1), idxE);
    await admin.from('user_points').upsert({ user_id: C.id, points: 4000, belt: 'black' } as never, { onConflict: 'user_id' });
    const fyE2 = await feed(E);
    const idxE2 = fyE2.json.posts.map((p: any) => p.id);
    check('a black belt keeps its lead and wears the belt', idxE2.indexOf(PC) === 0 && fyE2.json.posts[0].author.belt === 'black', idxE2);
    await admin.from('user_points').delete().eq('user_id', C.id);
  }

  section('Pagination');
  resetRateLimits();
  for (let i = 0; i < 7; i += 1) {
    const r = await post(D, { body: `paging post number ${i} ${RUN}` });
    if (r.status !== 201) console.log('   paging post failed', r.json);
  }
  const full = await feed(E, 'for_you', '&limit=50');
  const walk = await allPages(E, 'for_you', 3);
  check('walking 3 at a time returns every post exactly once', !walk.bad && walk.ids.length === full.json.posts.length && new Set(walk.ids).size === walk.ids.length, { walk: walk.ids.length, full: full.json.posts.length });
  check('…in the same order as one big page', JSON.stringify(walk.ids) === JSON.stringify(full.json.posts.map((p: any) => p.id)));
  check('…over several pages', walk.pages >= 4, walk.pages);
  const walkTc = await allPages(E, 'media', 1);
  check('media tab pages one at a time without repeats', !walkTc.bad && new Set(walkTc.ids).size === walkTc.ids.length && walkTc.ids.length === 2);
  const forged = await feed(E, 'for_you', '&cursor=eyJzIjoiMSkiLCJpIjoieCJ9');
  check('a forged cursor → 400 bad_cursor', forged.status === 400 && forged.json.error.detail.reason === 'bad_cursor', forged.json);

  // ---------------------------------------------------------------------------
  section('Likes');
  resetRateLimits();
  const l1 = await onPost(likeRoute.POST, 'POST', B, P1);
  const l2 = await onPost(likeRoute.POST, 'POST', B, P1);
  check('like → count 1; liking again is still 1', l1.json.count === 1 && l2.json.count === 1 && l2.json.on === true, [l1.json, l2.json]);
  const lE = await onPost(likeRoute.POST, 'POST', E, P1);
  check('a second person → 2', lE.json.count === 2);
  const viewB = await onPost(postRoute.GET, 'GET', B, P1);
  const viewA = await onPost(postRoute.GET, 'GET', A, P1);
  check('liked is per person', viewB.json.post.liked === true && viewA.json.post.liked === false && viewA.json.post.like_count === 2);
  const u1 = await onPost(likeRoute.DELETE, 'DELETE', E, P1);
  const u2 = await onPost(likeRoute.DELETE, 'DELETE', E, P1);
  check('unlike → 1, and unliking again is still 1', u1.json.count === 1 && u2.json.count === 1 && u2.json.on === false);

  section('Reposts');
  const r1 = await onPost(repostRoute.POST, 'POST', B, P1);
  const r2 = await onPost(repostRoute.POST, 'POST', B, P1);
  check('repost → 1; reposting again is still 1 (idempotent)', r1.json.count === 1 && r2.json.count === 1, [r1.json, r2.json]);
  const own = await onPost(repostRoute.POST, 'POST', A, P1);
  check('reposting your own post → 400', own.status === 400 && own.json.error.detail.reason === 'repost_own');
  await call(followRoute.POST, { method: 'POST', who: E, params: { user_id: B.id } });
  const flE2 = await feed(E, 'following');
  const via = flE2.json.posts.find((p: any) => p.id === P1);
  check("E follows B, so B's repost of A's post is in E's Following with reposted_by = B", via?.reposted_by?.user_id === B.id, flE2.json);
  const rr = await onPost(repostRoute.DELETE, 'DELETE', B, P1);
  check('undo → 0', rr.json.count === 0 && rr.json.on === false);
  const flE3 = await feed(E, 'following');
  check("…and it left E's Following", !hasId(flE3, P1));
  await onPost(repostRoute.POST, 'POST', B, P1);
  {
    // E does not follow A. Before the like and the repost, C's newer post led
    // E's For You; one like + one repost is 2·log2(1+1+3) ≈ 4.6 hours of lift.
    const fyE = await feed(E);
    const idx = fyE.json.posts.map((p: any) => p.id);
    check("engagement lifts A's older post above C's newer one for a stranger", idx.indexOf(P1) < idx.indexOf(PC), idx);
    check('…and the post reports like_count 1 and repost_count 1', fyE.json.posts.find((p: any) => p.id === P1)?.like_count === 1 && fyE.json.posts.find((p: any) => p.id === P1)?.repost_count === 1);
  }

  section('Bookmarks are private');
  const b1 = await onPost(bookmarkRoute.POST, 'POST', B, P1);
  const b2 = await onPost(bookmarkRoute.POST, 'POST', B, P1);
  check('bookmark on, twice, is one bookmark', b1.json.bookmarked && b2.json.bookmarked);
  const listB = await call(bookmarksRoute.GET, { who: B });
  const listA = await call(bookmarksRoute.GET, { who: A });
  check("it is in B's list", listB.json.posts.length === 1 && listB.json.posts[0].id === P1 && listB.json.posts[0].bookmarked === true);
  check("it is NOT in A's list, although A wrote the post", listA.json.posts.length === 0 && /Nothing saved/.test(listA.json.empty_plain));
  const viewA2 = await onPost(postRoute.GET, 'GET', A, P1);
  check('A sees bookmarked=false and no bookmark count exists on the post', viewA2.json.post.bookmarked === false && !('bookmark_count' in viewA2.json.post));
  {
    const asB = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${B.token}` } } });
    const tables = ['post_bookmarks', 'post_reposts', 'community_presence'];
    const reads = await Promise.all(tables.map((t) => asB.from(t).select('*').limit(1)));
    check('RLS: a signed-in client cannot read bookmarks, reposts or presence', reads.every((r) => r.error !== null), reads.map((r) => r.error?.message));
    const write = await asB.from('post_bookmarks').insert({ user_id: B.id, message_id: P2 });
    check('RLS: …or write a bookmark directly', write.error !== null, write.error?.message);
    const rpc = await asB.rpc('community_feed_page', { p_viewer: A.id, p_tab: 'for_you', p_limit: 5 });
    check("RLS: …or call the feed function as somebody else", rpc.error !== null, rpc.error?.message);
  }
  for (let i = 0; i < 3; i += 1) await onPost(bookmarkRoute.POST, 'POST', B, [P2, P3, PC][i]);
  const bwalk: string[] = [];
  let bcur: string | null = null;
  do {
    const r = await call(bookmarksRoute.GET, { who: B, path: `/community/bookmarks?limit=2${bcur ? `&cursor=${encodeURIComponent(bcur)}` : ''}` });
    bwalk.push(...r.json.posts.map((p: any) => p.id));
    bcur = r.json.next_cursor;
  } while (bcur);
  check('bookmarks page 2 at a time: all four, no repeats, newest saved first', bwalk.length === 4 && new Set(bwalk).size === 4 && bwalk[0] === PC, bwalk);
  const unb = await onPost(bookmarkRoute.DELETE, 'DELETE', B, PC);
  check('unbookmark', unb.json.bookmarked === false);

  // ---------------------------------------------------------------------------
  section('Replies');
  resetRateLimits();
  const rep1 = await onPost(repliesRoute.POST, 'POST', B, P1, { body: 'Good read, watching 180 too.' }, '/replies');
  check('reply → 201', rep1.status === 201 && rep1.json.post.parent_id === P1, rep1.json);
  const REP1 = rep1.json?.post?.id as string;
  await onPost(repliesRoute.POST, 'POST', E, P1, { body: 'What is your stop?' }, '/replies');
  await onPost(repliesRoute.POST, 'POST', B, P1, { body: 'Under 172 for me.' }, '/replies');
  const thread = await onPost(postRoute.GET, 'GET', A, P1);
  check('reply_count is 3 and the replies come oldest first', thread.json.post.reply_count === 3 && thread.json.replies.length === 3 && thread.json.replies[0].id === REP1, thread.json.post);
  const parts = thread.json.post.participants.map((p: any) => p.user_id);
  check('participants: two distinct people, most recent first', parts.length === 2 && parts[0] === B.id && parts.includes(E.id), parts);
  const deep = await onPost(repliesRoute.POST, 'POST', E, REP1, { body: 'reply to a reply' }, '/replies');
  check('a reply to a reply → 400', deep.status === 400, deep.json);
  const paged = await onPost(repliesRoute.GET, 'GET', A, P1, undefined, '/replies?limit=2');
  const paged2 = await call(repliesRoute.GET, { who: A, params: { id: P1 }, path: `/community/posts/${P1}/replies?limit=2&cursor=${encodeURIComponent(paged.json.next_cursor)}` });
  check('replies page 2 + 1', paged.json.replies.length === 2 && paged2.json.replies.length === 1 && paged2.json.next_cursor === null);
  const likeReply = await onPost(likeRoute.POST, 'POST', A, REP1);
  check('a reply can be liked', likeReply.json.count === 1);

  // ---------------------------------------------------------------------------
  section('Bans');
  await admin.from('room_members').upsert({ room_id: FEED, user_id: C.id, role: 'member', banned: true } as never, { onConflict: 'room_id,user_id' });
  const fyC = await feed(C);
  check("a member banned from the feed room sees none of its posts", !hasId(fyC, P1) && !hasId(fyC, PC), fyC.json.posts.map((p: any) => p.id));
  check('…but still sees calls from chats they are not banned in (none here) and no error', fyC.status === 200);
  const cView = await onPost(postRoute.GET, 'GET', C, P1);
  check('…a feed post by id → 404', cView.status === 404);
  const cPost = await post(C, { body: 'let me in' });
  check('…and posting → 403 ROOM_RESTRICTED', cPost.status === 403 && cPost.json.error.code === 'ROOM_RESTRICTED', cPost.json);
  const cLike = await onPost(likeRoute.POST, 'POST', C, P1);
  check('…and liking → 404', cLike.status === 404);

  // ---------------------------------------------------------------------------
  section('Delete');
  resetRateLimits();
  const notMine = await onPost(postRoute.DELETE, 'DELETE', B, P1);
  check("B deleting A's post → 404", notMine.status === 404);
  const del = await onPost(postRoute.DELETE, 'DELETE', A, P1);
  check('A deletes it, and the three replies come down with it', del.status === 200 && del.json.replies_removed === 3, del.json);
  const after = await admin.from('messages').select('id,deleted_at,body,deleted_cascade_of').or(`id.eq.${P1},parent_id.eq.${P1}`);
  check('every row is soft-deleted; replies name their parent', (after.data ?? []).length === 4 && (after.data ?? []).every((r: any) => r.deleted_at) && (after.data ?? []).filter((r: any) => r.deleted_cascade_of === P1).length === 3);
  const pointers = await Promise.all([
    admin.from('post_reposts').select('user_id').eq('message_id', P1),
    admin.from('post_bookmarks').select('user_id').eq('message_id', P1),
  ]);
  check('its reposts and bookmarks are gone', pointers.every((p) => (p.data ?? []).length === 0));
  const gone = await onPost(postRoute.GET, 'GET', B, P1);
  const gonefeed = await feed(B);
  const goneMarks = await call(bookmarksRoute.GET, { who: B });
  check("it is 404, out of the feed, and out of B's bookmarks", gone.status === 404 && !hasId(gonefeed, P1) && !goneMarks.json.posts.some((p: any) => p.id === P1));
  const again = await onPost(postRoute.DELETE, 'DELETE', A, P1);
  check('deleting again is fine (idempotent)', again.status === 200 && again.json.deleted === true);

  const delPic = await onPost(postRoute.DELETE, 'DELETE', A, P3);
  const asset = await admin.from('media_assets').select('id').eq('id', assetA!);
  const queued = await admin.from('media_deletions').select('id').eq('asset_id', assetA!);
  check('deleting a picture post removes the asset row and queues the file purge', delPic.status === 200 && (asset.data ?? []).length === 0 && (queued.data ?? []).length === 1);

  const callRow = (await admin.from('community_calls').select('id').eq('message_id', P2).single()).data as { id: string };
  await admin.from('community_calls').update({ status: 'target', resolved_at: new Date().toISOString(), resolved_price: 205, result_pct: 13.89 }).eq('id', callRow.id);
  const refuse = await onPost(postRoute.DELETE, 'DELETE', A, P2);
  check('a post whose call has RESOLVED cannot be deleted → 409', refuse.status === 409 && refuse.json.error.code === 'STATE_CONFLICT', refuse.json);
  const resolvedView = await onPost(postRoute.GET, 'GET', B, P2);
  check('…and it now carries a result card from the resolver', resolvedView.json.post.result?.status === 'target' && resolvedView.json.post.result.result_pct === 13.89);

  resetRateLimits();
  const withResult = await post(A, { body: 'Closed at target. Discipline pays.', result_call_id: callRow.id });
  check('a new post can show your own resolved call as a result card', withResult.status === 201 && withResult.json.post.result?.call_id === callRow.id, withResult.json);
  const stealResult = await post(B, { body: 'my win', result_call_id: callRow.id });
  check("…but not somebody else's", stealResult.status === 400 && stealResult.json.error.detail.reason === 'result_not_yours');
  const openCall = await post(A, { body: 'AMD short', trade_call: { symbol: 'AMD', direction: 'short', entry: 178, stop: 184 } });
  const openResult = await post(A, { body: 'early win?', result_call_id: openCall.json.post.trade_call.id });
  check('…and not an open call', openResult.status === 400 && openResult.json.error.detail.reason === 'result_not_resolved');
  const delOpen = await onPost(postRoute.DELETE, 'DELETE', A, openCall.json.post.id);
  const openAfter = await admin.from('community_calls').select('status').eq('id', openCall.json.post.trade_call.id).single();
  check('deleting a post with an OPEN call withdraws the call (never scored)', delOpen.json.call_withdrawn === true && (openAfter.data as any)?.status === 'withdrawn');
  const pts = await admin.from('point_events').select('id').eq('ref_id', openCall.json.post.trade_call.id);
  check('…and no points exist for it', (pts.data ?? []).length === 0);

  // ---------------------------------------------------------------------------
  section('Presence and the Live Rooms strip');
  resetRateLimits();
  const hbA = await call(presenceRoute.POST, { method: 'POST', who: A, body: { room_id: TRADERS } });
  const hbB = await call(presenceRoute.POST, { method: 'POST', who: B, body: {} });
  check('heartbeats accepted', hbA.status === 200 && hbA.json.room_id === TRADERS && hbB.json.room_id === null && hbA.json.next_heartbeat_s === 60);
  const hbBad = await call(presenceRoute.POST, { method: 'POST', who: B, body: { room_id: '0f8fad5b-d9cb-469f-a165-70867728950e' } });
  check('a heartbeat for a room that does not exist → 404', hbBad.status === 404);
  await admin.rpc('join_core_room', { p_user_id: A.id, p_room_id: TRADERS });
  await admin.rpc('post_room_message', { p_user_id: A.id, p_room_id: TRADERS, p_kind: 'text', p_body: `strip proof ${RUN}` });
  const strip = await call(liveRoute.GET, { who: B });
  const byslug = new Map(strip.json.rooms.map((r: any) => [r.slug, r]));
  const traders: any = byslug.get('traders');
  check('the strip is War Room, Investors, Wins, Ask Kai, Beginners in that order',
    JSON.stringify(strip.json.rooms.map((r: any) => r.name)) === '["War Room","Investors","Wins","Ask Kai","Beginners"]', strip.json.rooms.map((r: any) => r.name));
  check('War Room: 1 online (A), live (A just posted), A in the avatars', traders?.listener_count === 1 && traders.live === true && traders.speaker_avatars[0]?.user_id === A.id, traders);
  check('Wins: nobody online, not live, no avatars', (byslug.get('wins') as any)?.listener_count === 0 && (byslug.get('wins') as any).live === false);
  check('online_total counts the feed viewer too', strip.json.online_total >= 2);
  check('the feed room is not on the strip', !byslug.has('feed'));
  await admin.from('community_presence').update({ last_seen_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq('user_id', A.id);
  const strip2 = await call(liveRoute.GET, { who: B });
  check('a heartbeat older than 5 minutes stops counting', (strip2.json.rooms.find((r: any) => r.slug === 'traders') as any).listener_count === 0);
  await admin.from('room_members').upsert({ room_id: WINS, user_id: C.id, role: 'member', banned: true } as never, { onConflict: 'room_id,user_id' });
  const stripC = await call(liveRoute.GET, { who: C });
  check('a room you are banned from is off your strip', !stripC.json.rooms.some((r: any) => r.slug === 'wins'));
  const dir = await call(roomsRoute.GET, { who: B, path: '/rooms' });
  const slugs = dir.json.core.map((r: any) => r.slug);
  check('the rooms directory lists wins and ask-kai and hides the feed room', slugs.includes('wins') && slugs.includes('ask-kai') && !slugs.includes('feed'), slugs);

  // ---------------------------------------------------------------------------
  section('0053: deleting a member who has posted no longer fails');
  const dPosts = await admin.from('messages').select('id').eq('user_id', D.id);
  const delUser = await admin.auth.admin.deleteUser(D.id);
  check('auth delete of a user with posts succeeds (was 23503)', !delUser.error, delUser.error?.message);
  const orphan = await admin.from('messages').select('user_id,author_deleted,body,deleted_at').in('id', (dPosts.data ?? []).map((r: any) => r.id));
  check('their posts are anonymised: no author, no words, marked author_deleted',
    (orphan.data ?? []).length === 7 && (orphan.data ?? []).every((r: any) => r.user_id === null && r.author_deleted && r.body === null && r.deleted_at), orphan.data?.slice(0, 2));
  created.splice(created.indexOf(D.id), 1);
} catch (e) {
  fail += 1;
  console.log('  FAIL  the proof threw:', e instanceof Error ? e.stack : e);
} finally {
  for (const id of created) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) console.log(`  (cleanup) could not delete ${id}: ${r.error.message}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
