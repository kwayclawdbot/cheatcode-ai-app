# Community feed and Live Rooms: server side (2026-09-21)

Lane: `lane/community-api`. This covers the server half of the V2 Community
redesign (redesign spec: "Community", "Community combines rooms and a social
feed", "Recommended data objects"). The phone screens are a separate lane and
build against the endpoints listed below.

## The decision: a post is a message

Feed posts are rows in `messages`. There is no new posts table.

A message already has almost everything a post needs:

- an author, which `profiles_public` resolves to a display name, a handle and a belt
- pictures (`media_assets`, private bucket, signed URLs, metadata stripped, 0033)
- one-level threads with a live `reply_count` (0033)
- reactions with counts stored on the row (0033/0035)
- quotes (0035)
- an embedded member call through `refs.community_call_id` (0040)
- moderation (0031) and account deletion (0032)

A separate posts table would have to rebuild all of that, along with every
rule attached to it. So 0050 adds only the pieces a message was missing:

| Need | How |
|---|---|
| Somewhere to post that is not a chat | One core room, slug `feed`, `config.surface = "feed"`, `config.directory = false` (hidden from `GET /rooms`). Because it is a core room, `post_room_message` applies the same membership, ban, mute, read-only and slow-mode checks as any other room. |
| Like | Reaction kind `like`. `like_count = reaction_counts.like`. |
| Repost | `post_reposts (message_id, user_id)`. The primary key makes a repost idempotent. `messages.repost_count` is kept up to date by a trigger. Replies cannot be reposted, and the database enforces that too. |
| Bookmark | `post_bookmarks (user_id, message_id)`. Private: no count is stored anywhere. |
| Chart attachment | `refs.charts = [{symbol, timeframe, levels[]}]`. The phone draws the chart from live candles. It is never a screenshot. |
| Result card | `refs.result_call_id` (the author's own resolved call), or the embedded call once the resolver has resolved it. The author never types a result in. |

**What the feed shows.** Top-level posts that are still up and have a member
author, from two places:

- the feed room
- any core room, when the post carries a member call. This means a call
  published from a desk (`POST /community/calls`) shows on the Trade Calls tab
  without being posted twice.

Rooms where the viewer is banned are left out.

**What never appears: position size.** 0050 checks that no size or P/L column
exists on `messages`, `community_calls`, `trade_shares` or the new tables. The
0038 check on `trade_shares` is kept. Size fields sent inside a call are dropped
by the schema, and a test covers this.

## Ranking (For You)

All four tabs are one SQL function, `community_feed_page` (0050). It runs as
the service role only. The For You score is measured in hours and does not
change with time, so a page marker (cursor) stays valid between requests:

```
score = created_at in epoch hours
      + min(2 × log2(1 + likes + 2×replies + 3×reposts), 12)   engagement, capped at 12h
      + 6 if the viewer follows the author                      follows
      + belt: white 0 · blue 1 · purple 2 · brown 3 · black 4   belts
```

Ties are broken by id, so the order is fully deterministic. A post can gain at
most 22 hours over a newer post. The other tabs:

- **Following:** posts by people the viewer follows, plus posts those people
  reposted (`reposted_by`), ordered by the time of that post or repost.
- **Trade Calls:** posts that carry a call.
- **Media:** posts with a picture or a chart.

The cursor is the pair (score, id) of the last row, base64url-encoded. The
score is carried as text because an epoch in seconds with 6 decimals has 16
digits, which is more than a JavaScript number can hold exactly. A cursor the
server did not write is rejected with 400 `bad_cursor`. Counts can change
between pages, so a post can move by a place or two while someone scrolls. The
client should de-duplicate by id.

## Presence (Live Rooms strip)

`community_presence` holds one row per member: the room they were last seen in
(null means the feed) and when. The phone sends `POST /community/presence` when
Community opens, whenever it switches between rooms and the feed, and every 60
seconds after that.

- **listener_count** is the number of heartbeats from that room in the last 5
  minutes.
- **live** means someone posted in that room in the last 15 minutes.
- **speaker_avatars** are the last 4 distinct people who posted there.

These counts come only from real heartbeats and real posts. Joins are never
counted and nothing is padded. There is no cron: a member who stops sending
heartbeats simply stops being counted. No endpoint says *who* is online. The
server only ever returns counts, plus the avatars of people who posted.

Live audio is out of scope. A live room is a text room, and its route opens
that room.

## Strip rooms (0052)

Checked in production (read-only) on 2026-09-21: the core rooms there are
traders, investors and beginners. The mapping:

| Spec name | Room |
|---|---|
| War Room | `traders`. The label on the strip is "War Room"; the room keeps its own name. |
| Swing Desk | **Not created.** 0045 merged swing into traders on the owner's decision of 2026-09-08. Bringing it back is the owner's call, and would be a single insert. |
| Investors | `investors` |
| Wins | `wins` (new) |
| Ask Kai | `ask-kai` (new; `POST /rooms/:id/kai` already works in any room) |
| Beginners | `beginners`. Stays on the strip because it is a permanent core room. |

Each room's strip label, topic and order live in `rooms.config.strip`. The API
has nothing hard-coded.

## Deleting a post

- The delete is soft (`deleted_at`), the same as a moderator removal.
- Replies are deleted with the post (`deleted_cascade_of`).
- Pictures are purged by the 0033 trigger.
- Reposts and bookmarks of the post are dropped.
- If the post carries an **open** call, the call is withdrawn.
- If the call has already **resolved**, the delete is refused with 409. You can
  withdraw a claim before it is proved wrong, but you cannot tidy one away after.

0053 fixes the related bug. `messages.user_id → profiles` had no ON DELETE
action, so deleting any member who had ever posted failed with 23503. The key
is now ON DELETE SET NULL, and a trigger anonymises the post the same way
`delete_account` does: `author_deleted` is set, the body is cleared, pictures
are purged, and reposts and bookmarks are dropped. Two other keys onto
`profiles` still have no action (`allocation_models.approved_by` and
`legacy_imports.claimed_by`). Both are staff columns and are left for a
separate change.

## Moderation and rate limits

These match the room routes:

- A username is required to post or reply.
- Posts and replies share the room bucket (`room-post:<user>`, 10 per minute).
- Slow mode applies when the room sets it.
- Spam is prechecked before posting.
- The advice tripwire flags a post into the moderation queue without blocking it.
- Posting a call has its own limit of 10 per hour.
- Likes, reposts and bookmarks: 60 per minute each. Heartbeats: 20 per minute.
- A moderator's mute blocks every kind of write.
- A ban hides the room's posts from that member (404) and blocks writing (403).

## Migrations (written, NOT applied)

| File | What it does |
|---|---|
| `0050_a_post_can_be_liked_reposted_and_saved.sql` | Feed room; `like` kind; `post_reposts` plus the `repost_count` trigger; `post_bookmarks`; `community_feed_page()`; RLS on with no policies and service role only; checks that size columns are absent |
| `0051_a_member_is_somewhere_right_now.sql` | `community_presence`; `community_online_counts()`; service role only |
| `0052_the_live_rooms_strip.sql` | Creates `wins` and `ask-kai`; writes `config.strip` on the five strip rooms |
| `0053_a_deleted_profile_does_not_strand_its_posts.sql` | `messages.user_id` ON DELETE SET NULL, plus the anonymising triggers |

Each file can be run twice safely. All four were applied to a separate local
stack, both in turn and by a fresh `supabase db reset`. None of them has
touched production.

Note on the fresh reset: 0041's own self-test fails on a database with no
`instruments` rows, so `supabase db reset` from zero stops at 0041. This
existed before this lane. The practice stack got past it with one scratch-only
instrument row, which is not in the repo.

## Endpoints

All require `Authorization: Bearer <supabase token>`. Types are in
`packages/shared/community.ts`.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/community/feed?tab=&cursor=&limit=` | One page of posts; tabs `for_you`, `following`, `trade_calls`, `media`; returns `next_cursor` |
| POST | `/api/v1/community/posts` | Create a post: body, `attachment_ids` (from `POST /media`), `charts`, `trade_call`, `result_call_id` |
| GET | `/api/v1/community/posts/:id` | The post plus the first 30 replies |
| DELETE | `/api/v1/community/posts/:id` | Delete your own post or reply (cascade rules above) |
| GET | `/api/v1/community/posts/:id/replies?cursor=&limit=` | Replies, oldest first, paged |
| POST | `/api/v1/community/posts/:id/replies` | Reply (one level only) |
| POST / DELETE | `/api/v1/community/posts/:id/like` | Like or unlike; returns `{on, count}` |
| POST / DELETE | `/api/v1/community/posts/:id/repost` | Repost or undo; returns `{on, count}`; your own post is refused |
| POST / DELETE | `/api/v1/community/posts/:id/bookmark` | Save or unsave (private) |
| GET | `/api/v1/community/bookmarks?cursor=&limit=` | Your saved posts, most recently saved first |
| GET | `/api/v1/community/live-rooms` | The strip, plus `online_total` for the header |
| POST | `/api/v1/community/presence` | Heartbeat: `{room_id?}` |

Tests: `scripts/community-feed-test.ts` (pure logic) and
`scripts/community-feed-proof.mts` (every endpoint against a real database,
called in-process). Both are part of `npm test`. The proof requires
`.env.local` to point at a local stack with 0050–0053 applied, and refuses to
run against a hosted `supabase.co` URL.
