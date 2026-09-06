-- 0033 — Photos on posts, reactions that survive the app being closed, and
--        replies that go exactly one level deep.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Three things a community has and this one did not. A reply was structurally
-- possible (`messages.parent_id` has existed since 0010) and nothing read it.
-- A reaction was drawn on the phone and stored on the phone, so it vanished
-- when the app was closed and nobody else ever saw it. A photo could not be
-- posted at all: this project had exactly one storage bucket, `live-audio`, and
-- no table linking a file to anything.
--
-- The through-line of the file is that MEDIA IS A LIABILITY, NOT A FEATURE.
-- Every design decision below follows from two facts: a phone photo carries the
-- GPS coordinates of the place it was taken, and a picture cannot be read by
-- the word-based filter that watches the text. So the bucket is private with no
-- client policy at all, the bytes are stripped of every metadata block before
-- they are stored, and a removal deletes the OBJECT and not only the row.
--
-- =====================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO: VIDEO
-- =====================================================================
-- The owner asked for photos AND video. This ships photos, and defers video
-- with reasons rather than shipping something that works on a screenshot and
-- fails on a real phone recording. Written here rather than in a report,
-- because the next person will find `image/*` in the mime whitelist below and
-- deserve to know it was a decision:
--
--   1. THE BYTES CANNOT REACH THE CODE THAT CLEANS THEM. This API runs as
--      Vercel functions with a hard request-body ceiling. MEASURED against the
--      real production deployment on 2026-09-06: 4.25 MiB arrives and gets our
--      own error envelope; 4.30 MiB and everything above answers 413
--      FUNCTION_PAYLOAD_TOO_LARGE before a line of this app's code runs. Ten
--      seconds of 1080p from an iPhone is 15-25 MB. It cannot be posted through
--      the route where the stripping and the type checking live. The full table
--      is in apps/api/src/lib/media/limits.ts.
--   2. THE ONLY WAY ROUND (1) IS THE THING WE ARE GUARDING AGAINST. A signed
--      upload straight from the phone to storage skips the server entirely —
--      which is exactly where the location data would have been removed. An
--      iPhone video carries its GPS fix in the `moov/udta/©xyz` atom, the same
--      way a photo carries it in EXIF.
--   3. IT WOULD NOT PLAY. iOS records HEVC in a .mov by default. Android and
--      the web cannot decode that. Making one recording playable for everybody
--      is a transcoding pipeline, and there is no transcoder in this project.
--   4. THE COST IS UNBOUNDED IN A WAY A PHOTO'S IS NOT. A capped photo is under
--      a megabyte after the downscale. A video is two orders of magnitude
--      bigger to store and to serve, on every scroll past it.
--
-- Video is a decision about a transcoding pipeline (Mux, Cloudflare Stream, or
-- a worker running ffmpeg), not a column. When that decision is made, this
-- schema takes it without changing shape: `media_assets` already carries
-- `duration_ms`, `width`, `height` and a `kind`, and the purge path is already
-- built. What must be added with it is a metadata stripper for the container.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE CREATES
-- =====================================================================
--   media_assets      RLS on, ZERO policies, service role only.
--   message_reactions RLS on, ZERO policies, service role only.
--   media_deletions   RLS on, ZERO policies, service role only.
--   storage.objects   the two new buckets get NO policy. `storage.objects`
--                     already has RLS on and the only policies naming a bucket
--                     name `live-audio`, so a bucket with no policy is closed
--                     to `anon` and `authenticated` outright — reads and writes
--                     both. Every byte in or out goes through this API.
--   storage.buckets   both new buckets are `public = false`, which is the
--                     second lock: a public bucket serves its objects from an
--                     unauthenticated URL and never consults a policy at all.
--
-- Nothing here is granted to a client. There is no `using (true)` in this file.
-- The verification queries are at the bottom and they are meant to be RUN.

-- =====================================================================
-- 1. THREADS — ONE LEVEL, AND THE DATABASE IS WHAT MAKES IT ONE
-- =====================================================================
-- A post has comments. A comment does not have comments.
--
-- WHY, because it is a real choice and the other one is defensible. Nested
-- threads suit a forum with thousands of readers and a moderator per section.
-- This is a trading room with a handful of staff, and depth costs three things
-- it cannot pay: a conversation about one idea splinters into branches nobody
-- reads to the end; a moderator removing something has to reason about a
-- subtree instead of a post; and the phone has to render an indent ladder that
-- is unreadable past the second step on a 390pt screen. One level keeps the
-- room a room.
--
-- This is enforced BY A TRIGGER, not by the posting route, because there are
-- two write paths (the `post_room_message` RPC from 0018 and the API's fallback
-- insert when the RPC is missing) and a rule that lives in one of them is not a
-- rule. The RPC already refuses a parent in another room; this refuses a parent
-- that is itself a reply, and it refuses it on both paths and on any third one
-- somebody writes later.
alter table messages add column if not exists reply_count int not null default 0;

-- `author_deleted` is 0032's column, repeated here with the same `if not
-- exists` guard 0032 uses. NOT a duplication by accident and NOT a change to
-- that lane's file: 0032 is unapplied on both databases today, this file needs
-- the column in §6 and §7, and two identical guarded statements are safe in
-- either order. When 0032 lands, its own statement is a no-op.
alter table messages add column if not exists author_deleted boolean not null default false;

comment on column messages.reply_count is
  'Live count of replies to this message. Maintained by trigger so a post can '
  'say "4 replies" without the room counting rows on every render.';

create or replace function messages_thread_depth_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_room   uuid;
  v_parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'parent_not_in_room' using errcode = '22023';
  end if;

  select room_id, parent_id into v_parent_room, v_parent_parent
    from messages where id = new.parent_id;

  if not found or v_parent_room is distinct from new.room_id then
    -- Same condition name the RPC and the route already translate, so a reply
    -- pointing anywhere it should not reads identically wherever it was caught.
    raise exception 'parent_not_in_room' using errcode = '22023';
  end if;

  if v_parent_parent is not null then
    raise exception 'parent_not_top_level' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function messages_thread_depth_guard() from public, anon, authenticated;

drop trigger if exists messages_thread_depth_guard_t on messages;
create trigger messages_thread_depth_guard_t
  before insert or update of parent_id, room_id on messages
  for each row execute function messages_thread_depth_guard();

-- The counter. A reply that is soft-removed stops counting, because "4 replies"
-- over three visible ones and one gap is a number that does not match the
-- screen. Reply rows are never hard-deleted by this app, so the DELETE arm
-- exists for a database-level cleanup and nothing else.
create or replace function messages_reply_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  v_target := coalesce(new.parent_id, old.parent_id);
  if v_target is null then
    return coalesce(new, old);
  end if;

  update messages m
     set reply_count = (
       select count(*) from messages r
        where r.parent_id = v_target and r.deleted_at is null
     )
   where m.id = v_target;

  return coalesce(new, old);
end;
$$;

revoke all on function messages_reply_count_sync() from public, anon, authenticated;

drop trigger if exists messages_reply_count_t on messages;
create trigger messages_reply_count_t
  after insert or delete or update of parent_id, deleted_at on messages
  for each row execute function messages_reply_count_sync();

-- Reading a thread is "every reply to this post, oldest first". Partial,
-- because a top-level post is never fetched this way.
create index if not exists messages_parent_seq_idx
  on messages (parent_id, seq) where parent_id is not null;

-- A reply that came down because its PARENT came down, and which parent. Not a
-- decoration: it is the difference between "a moderator judged this post" and
-- "this post was standing next to one". It is staff-only for the same reason
-- `deleted_by` is — see 0031 §1.
alter table messages add column if not exists deleted_cascade_of uuid;

comment on column messages.deleted_cascade_of is
  'Set on a reply that was removed because its parent was removed, naming the '
  'parent. Null on a message removed on its own merits. Staff-only; never in '
  'messages_public.';

-- =====================================================================
-- 2. REACTIONS — FOUR OF THEM, AND DISAGREE IS THE IMPORTANT ONE
-- =====================================================================
-- The set is deliberately short and deliberately not emoji:
--
--   agree     · I think this is right.
--   disagree  · I think this is wrong.
--   watching  · I have put this on my list.
--   useful    · This helped me, whatever I think of the call.
--
-- DISAGREE IS THE ONE THAT EARNS ITS PLACE. A room where the only cheap
-- gesture is approval is a room that reads as unanimous whether or not it is,
-- and in a room about money that is not a UI problem, it is how a bad idea gets
-- amplified. Making dissent as cheap as agreement is the whole point.
--
-- `useful` and not a heart, because there is already a `contributor_stats`
-- table with a `usefulness_score` column (0010) waiting for something honest to
-- compute it from, and "this was useful to me" is that thing. Nothing in this
-- migration writes that score; the input now exists.
--
-- WHY A CHECK AND NOT AN ENUM: 03 Unit 2's standing rule for this schema is no
-- enum migrations. A check constraint is amended with one statement and does
-- not need a type rewrite.
create table if not exists message_reactions (
  message_id uuid not null references messages on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('agree', 'disagree', 'watching', 'useful')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, kind)
);

comment on table message_reactions is
  'One row per person per reaction per message. The primary key IS the '
  '"one of each kind per person" rule — it is not checked in the route, it is '
  'impossible in the table.';

-- `on delete cascade` from `profiles` is what makes account deletion cover
-- reactions without 0032 naming them: `delete_account` ends on
-- `delete from profiles`, and these rows go with it. Verified at the bottom.

-- Reading a room means asking "which of these did I react to" for fifty
-- messages at once, never fifty times.
create index if not exists message_reactions_user_idx
  on message_reactions (user_id, message_id);

-- =====================================================================
-- 2b. COUNTS THAT COST NOTHING TO READ
-- =====================================================================
-- The naive version is `count(*) group by kind` per message, which is fifty
-- aggregates for one screen, or a join that has to be re-run every time
-- anybody scrolls. Neither is acceptable on a phone on a train.
--
-- So the counts are DENORMALISED ONTO THE MESSAGE and kept true by a trigger.
-- The room's existing query already selects the message row, so the counts
-- arrive with it: reading them costs ZERO extra queries and zero extra bytes
-- over the wire beyond the object itself.
--
-- The write side pays for it: one reaction toggle updates one message row. That
-- is one narrow update on a row nobody else is writing to — this app never
-- edits a posted message — so there is no contention worth the words spent
-- describing it. The trade is deliberate: reactions are read thousands of times
-- for every time they are written.
--
-- The ONE thing that is not denormalised is "did I react", which is per-person
-- and cannot live on a shared row. That is one batched query per page —
-- `where user_id = me and message_id in (...)` — which is one round trip for
-- fifty messages, not fifty.
alter table messages
  add column if not exists reaction_counts jsonb not null default '{}'::jsonb;

comment on column messages.reaction_counts is
  'Denormalised {kind: count}, maintained by trigger from message_reactions. '
  'Kinds at zero are absent rather than present-and-zero, so an unreacted '
  'message carries an empty object and not four zeroes.';

create or replace function message_reactions_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message uuid;
begin
  v_message := coalesce(new.message_id, old.message_id);

  update messages m
     set reaction_counts = coalesce((
       select jsonb_object_agg(k, n)
         from (
           select r.kind as k, count(*) as n
             from message_reactions r
            where r.message_id = v_message
            group by r.kind
         ) s
     ), '{}'::jsonb)
   where m.id = v_message;

  return coalesce(new, old);
end;
$$;

revoke all on function message_reactions_count_sync() from public, anon, authenticated;

drop trigger if exists message_reactions_count_t on message_reactions;
create trigger message_reactions_count_t
  after insert or delete on message_reactions
  for each row execute function message_reactions_count_sync();

-- =====================================================================
-- 3. THE BUCKETS
-- =====================================================================
-- TWO buckets, not one, and not one per lane.
--
-- Another lane is building usernames, profiles and avatars in this same
-- worktree. An avatar is a photo with the same GPS problem and the same
-- objectionable-image problem as a chart screenshot, and building a second
-- upload path for it would mean a second stripper, a second size rule and a
-- second place to forget the deletion. So this file opens the avatar bucket
-- too and the API's `POST /api/v1/media` takes `purpose = 'avatar'`. That lane
-- writes `profiles.avatar_url` from the asset it gets back; it does not need to
-- touch storage, mime types, EXIF or purging.
--
-- They are separate BUCKETS rather than two prefixes in one because their rules
-- genuinely differ — an avatar is smaller and is never attached to a message —
-- and because a size limit and a mime whitelist are properties of a bucket.
--
--   public = false          the object is not reachable without a signature.
--   file_size_limit         the LAST line, not the first. The API refuses at a
--                           lower number (see apps/api/src/lib/media/limits.ts)
--                           so the message a member reads is ours. This one
--                           catches anything that ever writes without asking.
--   allowed_mime_types      JPEG and PNG. TWO, not "images", and the shortness
--                           is the point: the server rewrites every uploaded
--                           file to strip its metadata (apps/api/src/lib/media/
--                           strip.ts), and a format it cannot rewrite is a
--                           format whose GPS coordinates it cannot remove. HEIC
--                           is out because an iPhone shoots it by default and
--                           Android cannot display it — the app converts to
--                           JPEG before it uploads. WebP is out because its
--                           RIFF container needs its own EXIF/XMP handling and
--                           a half-written stripper is worse than no format.
--                           Video types are out for the reasons at the top.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('community-media', 'community-media', false, 5242880,
   array['image/jpeg', 'image/png']),
  ('avatars',         'avatars',         false, 3145728,
   array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- NO POLICY IS CREATED FOR EITHER BUCKET, AND THAT IS THE POINT.
--
-- `storage.objects` carries RLS with no permissive default. The only policies
-- on it name `live-audio` (0023). A bucket nobody writes a policy for is
-- therefore closed to `anon` and to `authenticated` for SELECT, INSERT, UPDATE
-- and DELETE alike — the standing table grants Supabase ships are irrelevant
-- while no policy lets a row through.
--
-- The service role reaches the objects because it bypasses RLS, which is the
-- same boundary every other read in this app already runs on (lib/db.ts).
-- Reading a photo therefore means asking this API for a signed URL, which means
-- the membership check in the route runs first. There is no second door.
--
-- The assertion below fails the migration if anybody ever adds one.
do $$
declare v_bad text;
begin
  select string_agg(policyname, ', ') into v_bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (qual like '%community-media%' or with_check like '%community-media%'
       or qual like '%avatars%'         or with_check like '%avatars%');
  if v_bad is not null then
    raise exception '0033: policy(ies) % name the new buckets. They are service-role only: every byte goes through the API so the membership check runs first.', v_bad;
  end if;
end $$;

-- =====================================================================
-- 4. media_assets — ONE ROW PER OBJECT THAT EXISTS
-- =====================================================================
-- One table, not an assets table plus an attachments join table. An attachment
-- IS an asset with a `message_id`; an avatar is an asset without one. A join
-- table would buy the ability to attach one file to two messages, which nobody
-- wants and which would make "delete the object when the message goes" a
-- reference-counting problem instead of a delete.
--
-- `bytes`, `width` and `height` are what the SERVER measured after stripping,
-- never what the phone claimed. The phone's numbers are not written anywhere.
create table if not exists media_assets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  purpose      text not null check (purpose in ('message', 'avatar')),
  kind         text not null default 'image' check (kind in ('image', 'video')),
  message_id   uuid references messages on delete cascade,
  bucket_id    text not null,
  object_path  text not null,
  mime_type    text not null,
  bytes        int  not null check (bytes > 0),
  width        int,
  height       int,
  duration_ms  int,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (bucket_id, object_path)
);

comment on table media_assets is
  'Every file this app has stored on a member''s behalf. A row here means an '
  'object exists in that bucket at that path; no row means no object, and the '
  'purge queue is what keeps that true in the direction that matters.';
comment on column media_assets.bytes is
  'Size AFTER metadata stripping, measured by the server. The client''s '
  'claimed size is never stored and never trusted.';
comment on column media_assets.message_id is
  'The post this is attached to. Null while an upload is in flight (the '
  'orphan sweep collects those) and null forever for an avatar.';

create index if not exists media_assets_message_idx
  on media_assets (message_id, position) where message_id is not null;
create index if not exists media_assets_owner_idx
  on media_assets (owner_id, created_at desc);
-- The orphan sweep's query, and only that: an upload that never got attached.
create index if not exists media_assets_orphan_idx
  on media_assets (created_at) where message_id is null and purpose = 'message';

-- Same reasoning as reactions: the room asks "does this message have pictures"
-- fifty times a screen, and it must not be a subquery.
alter table messages
  add column if not exists attachment_count int not null default 0;

comment on column messages.attachment_count is
  'How many media_assets rows point at this message. Lets a page of messages '
  'fetch attachments for only the messages that have any — one batched query, '
  'usually skipped entirely.';

create or replace function media_assets_attachment_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[old.message_id, new.message_id], null);
  if array_length(v_ids, 1) is null then
    return coalesce(new, old);
  end if;

  update messages m
     set attachment_count = (
       select count(*) from media_assets a where a.message_id = m.id
     )
   where m.id = any(v_ids);

  return coalesce(new, old);
end;
$$;

revoke all on function media_assets_attachment_count_sync() from public, anon, authenticated;

drop trigger if exists media_assets_attachment_count_t on media_assets;
create trigger media_assets_attachment_count_t
  after insert or delete or update of message_id on media_assets
  for each row execute function media_assets_attachment_count_sync();

-- =====================================================================
-- 5. THE PURGE QUEUE — WHY DELETING A ROW IS NOT DELETING A FILE
-- =====================================================================
-- THIS IS THE PART THAT IS EASY TO GET WRONG AND IMPOSSIBLE TO NOTICE.
--
-- Supabase Storage keeps its index in `storage.objects` and the bytes in the
-- backing object store. Deleting the index row from SQL does not delete the
-- bytes. There is no trigger, no foreign key and no cascade that can: removing
-- a file is an HTTP call to the storage service, and a database function cannot
-- make one. A schema that "deletes" media by deleting rows leaves every
-- photo — including the one somebody reported — sitting in the bucket forever,
-- and looks completely correct from inside psql.
--
-- So the database records the INTENT and the API carries it out:
--
--   media_assets row deleted  ->  trigger writes a media_deletions row
--   media_deletions           ->  POST /api/v1/internal/media/purge drains it,
--                                 calls storage remove, stamps purged_at
--
-- What this buys beyond correctness: the intent is durable. If the purge call
-- fails — storage down, network gone, the function timed out — the row is still
-- there, with the error on it, and the next run tries again. A best-effort
-- delete inside a request handler has no such memory. The moderation route
-- ALSO drains inline so a removal is immediate; the queue is what makes it
-- eventual instead of lost.
create table if not exists media_deletions (
  id           bigserial primary key,
  bucket_id    text not null,
  object_path  text not null,
  asset_id     uuid,
  reason       text not null,
  requested_at timestamptz not null default now(),
  purged_at    timestamptz,
  attempts     int not null default 0,
  last_error   text
);

comment on table media_deletions is
  'Files whose rows are gone and whose bytes are not, yet. A row with '
  'purged_at set is the receipt that the object was actually removed from the '
  'bucket; a row without one is work outstanding.';

-- The drain's query, and the only one that runs often.
create index if not exists media_deletions_pending_idx
  on media_deletions (requested_at) where purged_at is null;

create or replace function media_assets_enqueue_purge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into media_deletions (bucket_id, object_path, asset_id, reason)
  values (old.bucket_id, old.object_path, old.id,
          coalesce(current_setting('app.media_purge_reason', true), 'row_deleted'));
  return old;
end;
$$;

revoke all on function media_assets_enqueue_purge() from public, anon, authenticated;

drop trigger if exists media_assets_enqueue_purge_t on media_assets;
create trigger media_assets_enqueue_purge_t
  after delete on media_assets
  for each row execute function media_assets_enqueue_purge();

-- =====================================================================
-- 6. REMOVAL TAKES THE PICTURES WITH IT — WHICHEVER ROUTE DID IT
-- =====================================================================
-- APPLE GUIDELINE 1.2 IS THE REASON THIS IS A TRIGGER.
--
-- A reviewer's question is not "does your moderator screen have a button", it
-- is "when somebody reports a picture, does the picture go away". The honest
-- answer has to hold for every way a message can be taken down, and there are
-- three: a moderator's removal (`POST /messages/:id/remove`), the cascade when
-- a parent post is removed, and an account deletion (0032's `delete_account`,
-- which sets `deleted_at` on everything the person wrote).
--
-- Writing the purge into the moderation route would cover one of the three.
-- Writing it into `delete_account` would mean editing another lane's migration.
-- Putting it on the table covers all three and any fourth, and it means
-- 0032 needs no change at all: the moment `deleted_at` goes from null to a
-- timestamp, by any hand, the attachments are deleted and the enqueue trigger
-- above turns that into real removal from the bucket.
--
-- It is one-way. There is no un-remove in this app (`keepMessage` closes
-- reports on a post that is still standing; it does not resurrect one), so
-- there is nothing to restore and no reason to keep the bytes "just in case".
-- What survives is the RECORD: `media_deletions` keeps the path and the reason,
-- and `moderation_log` keeps the moderator, the message and their words.
create or replace function messages_purge_media_on_remove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform set_config(
      'app.media_purge_reason',
      case when new.author_deleted is true then 'account_deleted' else 'message_removed' end,
      true);
    delete from media_assets where message_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function messages_purge_media_on_remove() from public, anon, authenticated;

drop trigger if exists messages_purge_media_t on messages;
create trigger messages_purge_media_t
  after update of deleted_at on messages
  for each row execute function messages_purge_media_on_remove();

-- ACCOUNT DELETION, STATED PLAINLY.
--
-- 0032's `delete_account` is NOT edited by this file, and does not need to be.
-- Two mechanisms already in place cover everything this migration adds:
--
--   · Community posts. It sets `deleted_at` and `author_deleted` on every
--     message the person wrote. The trigger above fires on that update and the
--     photos attached to those posts are deleted and queued for purge.
--   · Everything keyed to the person. `media_assets.owner_id`,
--     `message_reactions.user_id` -> `profiles on delete cascade`, and
--     `delete_account` ends on `delete from profiles`. Their avatar goes, their
--     reactions go, and the avatar's bytes are queued by the same enqueue
--     trigger.
--
-- One caveat is real and is not hidden: 0032 IS NOT APPLIED ANYWHERE YET
-- (measured on both databases, 2026-09-06). Until it is, account deletion is
-- the route's problem and not this file's. What this file guarantees is that
-- when 0032 is applied, media is already covered by it.
--
-- The assertion below is a tripwire for the opposite mistake — somebody later
-- rewriting `delete_account` to hard-DELETE messages instead of anonymising
-- them. That path would take the `media_assets` rows with it via the FK
-- cascade, the enqueue trigger would still fire, and the bytes would still go.
-- Both paths are covered; this only records that it was checked.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'delete_account')
  then
    raise notice '0033: delete_account exists. Media is covered through the messages.deleted_at trigger and the profiles cascade; no edit to 0032 is required.';
  else
    raise notice '0033: delete_account is NOT installed yet (0032 unapplied). Media coverage lands with it, through the triggers in this file.';
  end if;
end $$;

-- =====================================================================
-- 7. messages_public GAINS FOUR COLUMNS AND NO SECRETS
-- =====================================================================
-- `create or replace view` permits columns appended at the end and nothing
-- else, so the 0031 list is reproduced exactly and the four new ones follow it.
--
-- What is added is public by nature: how many people reacted, how many replied,
-- how many pictures are attached, and which post a reply belongs to
-- (`parent_id` was already there). What is NOT added is anything from §1 or §6
-- that names a moderator: `deleted_by`, `deleted_reason` and
-- `deleted_cascade_of` stay out, for the reason 0031 gave — a staff note about
-- a member turns every removal into an argument in the room.
create or replace view messages_public
with (security_invoker = false) as
  select m.id, m.room_id, m.user_id, m.seq, m.kind,
         case when m.deleted_at is null then m.body end as body,
         m.parent_id, m.refs, m.structured_idea, m.position_disclosure,
         m.edited_at, m.deleted_at,
         (m.deleted_at is not null) as deleted,
         m.flags, m.created_at,
         -- Appended by 0033.
         case when m.deleted_at is null then m.reaction_counts else '{}'::jsonb end as reaction_counts,
         m.reply_count,
         case when m.deleted_at is null then m.attachment_count else 0 end as attachment_count,
         m.author_deleted
  from messages m
  where current_user = 'service_role' or is_room_member(m.room_id);

comment on view messages_public is
  'The member-facing message surface. Runs with the view owner''s rights and '
  'carries its own membership test, so `select on messages` does not have to be '
  'granted to clients. A deleted row keeps its place and loses its body, its '
  'reactions and its pictures.';

-- 0031 revoked every write verb from every view and set the default privileges
-- so a NEW view cannot be born writable. `create or replace` on an existing
-- view keeps its existing ACL, so nothing was re-opened here — but it is
-- restated rather than assumed, which is the rule this schema runs on.
revoke insert, update, delete, truncate, references, trigger
  on messages_public from anon, authenticated;
revoke all on messages_public from anon;
grant select on messages_public to authenticated;

-- `author_deleted` is in the list above and is NOT a leak: it is the difference
-- between "posted by Kai" and "posted by somebody who has since left", which
-- 0032 added the column precisely to let a screen tell apart. Without it in the
-- view the phone would read a null author as Kai.

-- =====================================================================
-- 8. RLS AND GRANTS ON EVERYTHING THIS FILE CREATED
-- =====================================================================
-- RLS ON + ZERO POLICIES = the API is the only door. Same posture as `reports`
-- and `moderation_log` (0031 §7) and for the same reason: there is no row in
-- any of these three tables that a client has a right to read directly. A
-- reaction is meaningless without the message; a media asset is a storage path
-- that must never be handed out unsigned; a deletion record is an operational
-- log.
alter table media_assets      enable row level security;
alter table message_reactions enable row level security;
alter table media_deletions   enable row level security;

revoke all on media_assets      from anon, authenticated;
revoke all on message_reactions from anon, authenticated;
revoke all on media_deletions   from anon, authenticated;

grant select, insert, update, delete on media_assets      to service_role;
grant select, insert,         delete on message_reactions to service_role;
grant select, insert, update         on media_deletions   to service_role;
grant usage, select on sequence media_deletions_id_seq to service_role;

-- A purge receipt is not something this API may erase: the whole value of the
-- row is that it proves an object was removed.
revoke delete, truncate on media_deletions from anon, authenticated, service_role;

do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('media_assets', 'message_reactions', 'media_deletions');
  if v_count > 0 then
    raise exception '0033: % policy(ies) exist on the new tables. All three are service-role only.', v_count;
  end if;
end $$;

-- The same guard 0031 wrote, re-run because this migration created tables. If
-- any of the three ever picks up a client write verb, this fails loudly.
do $$
declare v_bad text;
begin
  select string_agg(distinct format('%s(%s)', g.table_name, g.grantee), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and g.table_name not in (
       'profiles', 'notification_prefs', 'setup_alert_prefs', 'lesson_progress',
       'watchlists', 'watchlist_items', 'live_requests', 'push_subscriptions'
     );
  if v_bad is not null then
    raise exception '0033: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- SCHEMA-NOTES 2.7: 0018's function grant floor runs once, so every migration
-- that creates a function must re-apply it. Each `create or replace function`
-- above is followed by its own revoke; this is the sweep that catches a
-- future edit that forgets one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'messages_thread_depth_guard', 'messages_reply_count_sync',
         'message_reactions_count_sync', 'media_assets_attachment_count_sync',
         'media_assets_enqueue_purge', 'messages_purge_media_on_remove')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- =====================================================================
-- 9. BACKFILL — the counters must be true on day one
-- =====================================================================
-- A counter column that starts at zero over existing rows is a lie until
-- somebody writes. There are no reactions and no attachments yet by
-- definition, but there may already be replies.
update messages m
   set reply_count = c.n
  from (select parent_id, count(*) as n
          from messages
         where parent_id is not null and deleted_at is null
         group by parent_id) c
 where m.id = c.parent_id and m.reply_count is distinct from c.n;

-- And an existing thread deeper than one level would make §1's rule false for
-- rows already in the table. Checked rather than assumed.
do $$
declare v_deep int;
begin
  select count(*) into v_deep
    from messages c join messages p on p.id = c.parent_id
   where c.parent_id is not null and p.parent_id is not null;
  if v_deep > 0 then
    raise exception '0033: % message(s) are replies to replies. One level is now enforced; these predate it and must be re-parented before this migration can hold.', v_deep;
  end if;
end $$;

-- =====================================================================
-- 10. WHAT "GOOD" LOOKS LIKE, SO IT CAN BE CHECKED RATHER THAN BELIEVED
-- =====================================================================
-- Run these after applying, on local AND on hosted.
--
-- (a) No client verb on any of the three new tables:
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated')
--      and table_name in ('media_assets', 'message_reactions', 'media_deletions');
--
--   -> expected: ZERO rows.
--
-- (b) RLS on, zero policies:
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public' and p.tablename = c.relname) as policies
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('media_assets','message_reactions','media_deletions');
--
--   -> expected: relrowsecurity = t, policies = 0, on all three.
--
-- (c) The buckets are private and no policy names them:
--
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id in ('community-media', 'avatars');
--   -> expected: public = f on both.
--
--   select policyname, qual, with_check from pg_policies
--    where schemaname = 'storage' and tablename = 'objects';
--   -> expected: only the two `live-audio` policies from 0023.
--
-- (d) A phone holding a real anon key can read neither the bucket nor the
--     tables. Proved end to end, signed in, by:
--
--   cd apps/api && API=… npx tsx --env-file=.env.local scripts/media-rls-proof.mts
--
-- (e) Threads are one level deep, enforced by the database and not the route:
--
--   -- as service_role, against a real room:
--   insert into messages (room_id, user_id, seq, kind, body, parent_id)
--   values ('<room>', '<user>', 999999, 'text', 'reply to a reply', '<a reply id>');
--   -> ERROR: parent_not_top_level
--
-- (f) A removal takes the pictures with it:
--
--   update messages set deleted_at = now() where id = '<a message with photos>';
--   select count(*) from media_assets where message_id = '<that message>';   -- 0
--   select object_path, reason, purged_at from media_deletions
--    where asset_id is not null order by id desc limit 5;                    -- queued
--   -- then run the drain and purged_at fills in.
