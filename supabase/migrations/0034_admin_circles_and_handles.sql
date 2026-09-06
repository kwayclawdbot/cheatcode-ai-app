-- 0034 — Circles are opened by the team, and members have usernames.
--
-- Two owner instructions, 2026-09-05/06:
--   "circles should be setup admin only not based on alerts"
--   "make sure the community content is registered in db properly so user
--    comments are associated with user profiles and saved in supabase
--    accordingly"
--
-- =====================================================================
-- PART ONE — NOTHING OPENS A ROOM BECAUSE A SETUP PUBLISHED
-- =====================================================================
-- Until today a `rooms` row appeared on its own whenever a setup reached
-- `ready` at grade A or B. That happened inside the paper tick, which runs
-- every minute, through `open_setup_circle()`. Eight rooms had been created
-- that way on the hosted database and nobody had ever posted in one of them.
--
-- The owner's rule is that a Circle is something the team opens deliberately.
-- So the automatic door is closed at THREE points, and the third one is the
-- only one that was actually sufficient:
--   * the code that called it is deleted (lib/round4/circles.ts — the whole
--     `openSetupCircle` / `reviveLiveCircles` / `closeDeadSetupCircles` group
--     and the "open" pass of the sweep);
--   * `open_setup_circle()` is DROPPED here, so a regression cannot call it;
--   * and `rooms.setup_id` is CONSTRAINED to null (§2), because neither of the
--     above binds a deployment that is already running. The eight rooms were
--     deleted and were back within a minute, created by the cron on the live
--     API through `openSetupCircle`'s direct-insert fallback. A rule that the
--     currently deployed code can walk around is not a rule.
--
-- What is KEPT, unchanged: the three core rooms; `create_circle()` (the
-- staff-only path, gated in the route against `staff_role()` at `admin` and
-- above — 0031); and `close_expired_circles()`, because a staff-opened circle
-- still runs out of time and still has to go read-only on its own.
--
-- =====================================================================
-- WHAT HAPPENED TO THE EIGHT ROOMS THAT ALREADY EXISTED
-- =====================================================================
-- They are DELETED, and the reason is not tidiness:
--
--   1. NOTHING IS LOST. Every one of them has zero messages — not "no
--      messages left after a clean-up", zero rows in `messages` for that room,
--      ever. The guard below proves it rather than trusting it: a room with so
--      much as one message is NOT deleted, it is closed and left in place, and
--      the counts are raised at the end of this file.
--   2. THEY WOULD NOT HAVE EXPIRED. It looked as though they would die on
--      their own between 7 and 11 September. They would not have: the tick's
--      revive pass re-derived a fresh expiry for every circle whose setup was
--      still live and put it back, so a room about a live setup was effectively
--      immortal. Left alone, the Community board would keep showing eight
--      rooms the team never opened.
--   3. THEY MISREPRESENT THE PRODUCT. A member opening Community today would
--      see eight circles and reasonably conclude the app opens rooms about
--      alerts. That is the exact thing the owner said it should not do.
--
-- The eight, recorded here because the rows will not exist after this runs:
--   558ad358-5a05-4c4e-8245-e5f1e935c697  slb-e51958d0   SLB Continuation
--   032dc43f-c073-4a5b-90d6-256c52659b08  mpc-eff1e195   MPC Continuation
--   fdf37dca-cb28-49e6-90b8-e6218b4bf579  vrns-b030efeb  VRNS Continuation
--   a13ce5fa-068e-4593-adb8-44007108d329  gtlb-68a92624  GTLB Continuation
--   a6359485-161f-42f5-b1c1-f22f6c2656f6  cnh-dbcdc2c3   CNH Breakout
--   a3a1e1bd-b41c-4358-b0ce-f4bb454fb3c3  snow-b2235257  SNOW Breakout
--   ea5a50e2-afca-4cad-84c6-2e7b95ded6ea  nvda-7f88918f  NVDA Continuation
--   3ea98e41-495c-467a-9a3d-3438674cd46e  dell-028cac27  DELL Breakout
--
-- The setups themselves are NOT touched. Only `discussion_room_id` is cleared,
-- because the room it pointed at is gone. Every surface that reads that column
-- already handles null — the workspace draws "Discussion opens when the team
-- opens a room for this symbol" instead of a Join button, and the alert card
-- carries `room_id: null` with its existing sentence.
--
-- =====================================================================
-- PART TWO — USERNAMES
-- =====================================================================
-- `profiles.handle` has existed since 0002 and was never asked for: 8 profiles,
-- 3 handles, 0 avatars. A separate lane is building `@mentions`, which cannot
-- work until people have names, and `@everyone` / `@kai` cannot work at all if
-- a member is allowed to register `everyone` or `kai`.
--
-- So this file makes the database the last word on what a handle may be:
--   * `reserved_handles` — the words a member may not take, as data;
--   * `profiles_handle_lower_idx` — uniqueness is CASE-INSENSITIVE;
--   * `profiles_identity_guard` — a trigger that normalises and validates on
--     every write, whoever makes it;
--   * `handle_available()` — the availability question, asked with the same
--     comparison the index makes.
--
-- THE TRIGGER IS NOT BELT AND BRACES, IT IS THE ONLY LOCK THAT HOLDS.
-- `authenticated` holds INSERT/UPDATE on `profiles` with an owner policy
-- (`user_id = auth.uid()`, 0014), so the phone can write its own profile row
-- straight through PostgREST without passing this API at all. Every rule
-- written only in TypeScript is therefore advisory. In the database it is not.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   reserved_handles   NEW. RLS enabled, ZERO policies, no grant to anon or
--                      authenticated. Service role reads/writes; the trigger
--                      reads it as a security-definer function, which is why
--                      no grant is needed for enforcement to work.
--   profiles           unchanged posture (RLS on, owner-only policy). This
--                      file adds a trigger and an index, no policy and no
--                      grant. It does not widen anything.
--   rooms              unchanged posture. Rows deleted with the service role
--                      by this migration; no policy, no grant change.
--   messages_public    NOT TOUCHED. `author_deleted` reaches it through the
--                      media/reactions lane's own migration — see §6 for why
--                      appending the column here would break theirs.
--   setups             one column set to null on eight rows. No posture change.
--
-- No policy in this file uses `using (true)`. No table gains a client write
-- grant. The verification queries are at the bottom and they are meant to be
-- run, not read.

begin;

-- =====================================================================
-- 1. The eight auto-created circles
-- =====================================================================
-- A room is only removed when it is BOTH machine-opened (it points at a setup)
-- and empty (no message row has ever existed for it, deleted or not). Anything
-- else is closed rather than deleted, because a conversation somebody had is
-- not this migration's to throw away.
create temporary table _auto_circles on commit drop as
  select r.id,
         r.slug,
         r.name,
         r.setup_id,
         (select count(*) from messages m where m.room_id = r.id) as message_count
    from rooms r
   where r.type = 'setup'
     and r.setup_id is not null;

-- 1a. Any that DO carry messages: closed, kept, and flagged in the config so
--     the next person can see why they are still here.
update rooms r
   set config = coalesce(r.config, '{}'::jsonb)
                || jsonb_build_object(
                     'posting_restricted', true,
                     'posting_locked',     true,
                     'closed_at',          to_jsonb(now()),
                     'closed_reason',      'Circles are opened by the team now. This one is kept because it has posts in it.',
                     'kept_by',            '0034')
     , updated_at = now()
  from _auto_circles a
 where a.id = r.id
   and a.message_count > 0;

-- 1b. The empty ones go. Children first — `setups.discussion_room_id` has a FK
--     to `rooms`, and `room_members` / `room_seq_counters` / `reports` all key
--     onto it.
update setups s
   set discussion_room_id = null
  from _auto_circles a
 where a.message_count = 0
   and s.discussion_room_id = a.id;

delete from room_members m using _auto_circles a where a.message_count = 0 and m.room_id = a.id;
delete from room_seq_counters c using _auto_circles a where a.message_count = 0 and c.room_id = a.id;
delete from reports rp using _auto_circles a where a.message_count = 0 and rp.room_id = a.id;
delete from rooms r using _auto_circles a where a.message_count = 0 and r.id = a.id;

-- =====================================================================
-- 2. The automatic door itself
-- =====================================================================
-- Dropped, not left in place unused. A function that still exists is a
-- function a future tick can call by accident; the app-side caller has been
-- deleted in the same commit, so nothing references this.
drop function if exists open_setup_circle(uuid, interval);

-- AND THE DROP ON ITS OWN IS NOT ENOUGH. `openSetupCircle` did not only call
-- that function: when the call failed it FELL THROUGH to a direct insert, and
-- that is what actually created the eight rooms on the hosted database (they
-- carry no slug, which the RPC would have set). Dropping the function while the
-- deployed API still holds the fallback simply moves the same behaviour one
-- line down — proved the hard way: the eight came back inside a minute of being
-- deleted, stamped by the cron that runs the paper tick.
--
-- So the rule is written where no deployment can be behind it. A room may not
-- be tied to a setup at all:
--
-- `set constraints all immediate` first, and it is not decoration: the FK from
-- `setups.discussion_room_id` is DEFERRABLE INITIALLY DEFERRED (0010), so the
-- deletes above are still pending inside this transaction and Postgres refuses
-- to ALTER a table with pending trigger events on it. This settles them.
set constraints all immediate;

alter table rooms drop constraint if exists rooms_no_setup_link;
alter table rooms add constraint rooms_no_setup_link check (setup_id is null);

comment on constraint rooms_no_setup_link on rooms is
  'Circles are opened by the team, never by a setup publishing (owner '
  'instruction 2026-09-05). The column and its foreign key are kept because '
  '`setups.discussion_room_id` still references `rooms`; the constraint is '
  'what stops anything writing the link. Drop it deliberately if the team ever '
  'wants to open a circle ABOUT a named setup — that is a decision, not an '
  'accident.';

comment on column rooms.setup_id is
  'Legacy. Rooms are no longer created from setups (0034, owner instruction '
  '2026-09-05). Kept because `setups.discussion_room_id` still references '
  '`rooms` and a future STAFF-opened circle may want to name a setup; nothing '
  'writes it today.';

-- =====================================================================
-- 3. Reserved usernames
-- =====================================================================
-- Data, not a constant in a file, so a name can be reserved without a deploy.
-- `name` is stored FOLDED: lowercase with underscores removed. That single
-- decision is what makes `Admin`, `admin`, `ad_min` and `a_d_m_i_n` one entry
-- instead of four, and it is why the trigger folds before it looks.
create table if not exists reserved_handles (
  name       text primary key,
  reason     text not null,
  created_at timestamptz not null default now()
);

comment on table reserved_handles is
  'Usernames a member may not register. Compared on the FOLDED handle '
  '(lowercase, underscores removed), so one row covers every spelling. '
  'Mirrored in packages/shared/handles.ts for the phone; '
  'apps/api/scripts/handles-proof.ts fails if the two disagree.';

alter table reserved_handles enable row level security;
revoke all on reserved_handles from public, anon, authenticated;
grant select, insert, update, delete on reserved_handles to service_role;

insert into reserved_handles (name, reason) values
  -- mention scope. The reason this table exists at all.
  ('everyone','mention scope'), ('here','mention scope'), ('all','mention scope'),
  ('channel','mention scope'), ('room','mention scope'), ('rooms','mention scope'),
  ('circle','mention scope'), ('circles','mention scope'), ('group','mention scope'),
  ('thread','mention scope'), ('online','mention scope'), ('members','mention scope'),
  -- the team, and every word that stands in for it
  ('admin','staff'), ('admins','staff'), ('administrator','staff'), ('administrators','staff'),
  ('mod','staff'), ('mods','staff'), ('moderator','staff'), ('moderators','staff'),
  ('staff','staff'), ('team','staff'), ('owner','staff'), ('owners','staff'),
  ('founder','staff'), ('founders','staff'), ('ceo','staff'), ('official','staff'),
  ('verified','staff'), ('root','staff'), ('superuser','staff'), ('sudo','staff'),
  ('system','staff'), ('sys','staff'), ('operator','staff'), ('op','staff'),
  -- the product and the assistant
  ('kai','product'), ('kaiai','product'), ('askkai','product'), ('cheatcode','product'),
  ('cheatcodeai','product'), ('cheatcodeclub','product'), ('cheat','product'),
  ('code','product'), ('club','product'), ('thecheatcode','product'), ('ai','product'),
  ('bot','product'), ('bots','product'), ('assistant','product'), ('kaibot','product'),
  -- functions a member could be mistaken for
  ('support','function'), ('help','function'), ('helpdesk','function'), ('contact','function'),
  ('billing','function'), ('payments','function'), ('payment','function'), ('sales','function'),
  ('security','function'), ('abuse','function'), ('legal','function'), ('privacy','function'),
  ('terms','function'), ('compliance','function'), ('info','function'), ('noreply','function'),
  ('donotreply','function'), ('postmaster','function'), ('webmaster','function'),
  ('hostmaster','function'), ('notifications','function'), ('notification','function'),
  ('alerts','function'), ('alert','function'), ('announcement','function'),
  ('announcements','function'), ('moderation','function'), ('report','function'),
  ('reports','function'),
  -- names that are also routes in this app
  ('api','route'), ('app','route'), ('www','route'), ('mail','route'), ('ftp','route'),
  ('cdn','route'), ('static','route'), ('assets','route'), ('dev','route'), ('test','route'),
  ('staging','route'), ('prod','route'), ('production','route'), ('home','route'),
  ('feed','route'), ('community','route'), ('messages','route'), ('message','route'),
  ('chat','route'), ('trade','route'), ('trades','route'), ('watchlist','route'),
  ('positions','route'), ('position','route'), ('orders','route'), ('order','route'),
  ('portfolio','route'), ('market','route'), ('markets','route'), ('desk','route'),
  ('live','route'), ('show','route'), ('setup','route'), ('setups','route'),
  ('settings','route'), ('account','route'), ('accounts','route'), ('profile','route'),
  ('profiles','route'), ('contributor','route'), ('contributors','route'),
  ('invite','route'), ('invites','route'), ('credits','route'), ('plans','route'),
  -- words that would read as a state rather than a person
  ('null','state'), ('undefined','state'), ('none','state'), ('nobody','state'),
  ('anonymous','state'), ('anon','state'), ('deleted','state'), ('removed','state'),
  ('guest','state'), ('user','state'), ('users','state'), ('me','state'), ('my','state'),
  ('self','state'), ('you','state'), ('new','state'),
  -- authentication. A handle must never read as a prompt.
  ('login','auth'), ('logout','auth'), ('signin','auth'), ('signup','auth'),
  ('signout','auth'), ('register','auth'), ('auth','auth'), ('oauth','auth'),
  ('token','auth'), ('password','auth'), ('passwords','auth'), ('reset','auth'),
  ('verify','auth'), ('confirm','auth'), ('session','auth')
on conflict (name) do nothing;

-- =====================================================================
-- 4. Case-insensitive uniqueness
-- =====================================================================
-- `handle text unique` (0002) let `Kway` and `kway` both exist, which for a
-- name people type after an `@` is two people with the same name. The index
-- below is the real rule; the original constraint is left in place because it
-- is a strict subset of it and dropping it buys nothing.
--
-- Built WITHOUT `concurrently` on purpose: this runs inside the migration's
-- transaction, and `profiles` is small. If it ever fails here it is because
-- two rows already collide case-insensitively, and that is a thing to be told
-- about rather than to work around.
create unique index if not exists profiles_handle_lower_idx
  on profiles (lower(handle))
  where handle is not null;

-- =====================================================================
-- 5. The guard
-- =====================================================================
-- Runs on every insert and update of `profiles`, from any role, through any
-- door. It trims, it validates, it refuses a reserved word, and it checks the
-- avatar is a URL rather than an arbitrary string.
--
-- IT DOES NOT LOWERCASE THE HANDLE. The case somebody chose is theirs to keep
-- — `MarcusT` is displayed as `MarcusT`. Only the COMPARISON is folded, and
-- that is the index's job, not this function's.
--
-- The messages it raises are the sentences a person reads. They are written
-- once, here, because the phone, the API and a psql session all end up in this
-- function and all three should say the same thing.
--
-- EACH REFUSAL CARRIES TWO THINGS: `message` is the sentence for the person
-- and `hint` is a short machine name (`handle_rejected`, `avatar_not_a_url`),
-- so the API can tell the cases apart without matching on English. They cannot
-- be written the other way round — `raise exception 'name' using message = ...`
-- is a runtime error in plpgsql ("RAISE option already specified: MESSAGE"),
-- which is why every raise below is the bare `using` form.
-- FIRST, THE RULE ON ITS OWN. `handle_problem()` answers "what is wrong with
-- this username", returning null when nothing is. It exists as a separate
-- function for one reason: the trigger can only be tested by writing, and a
-- proof script that has to rename a real member in order to check that
-- `everyone` is refused is a proof script that can leave somebody renamed when
-- it crashes. This can be asked without writing anything.
--
-- The trigger below CALLS it. There is one copy of the rule, and the thing the
-- proof asks is the thing the write enforces.
create or replace function handle_problem(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v text := btrim(coalesce(p_handle, ''));
begin
  if v = '' then
    return null;                -- "not set" is not a problem; see the trigger.
  end if;
  if length(v) < 3  then return 'A username is at least 3 characters.'; end if;
  if length(v) > 20 then return 'A username is at most 20 characters.'; end if;
  if v !~ '^[A-Za-z0-9_]+$' then
    return 'Letters, numbers and underscores only — no spaces, dots or dashes.';
  end if;
  if v !~ '^[A-Za-z]' then return 'A username starts with a letter.'; end if;
  if v ~ '_$'  then return 'A username cannot end with an underscore.'; end if;
  if v ~ '__'  then return 'Use one underscore at a time, not two together.'; end if;
  if exists (select 1 from reserved_handles where name = lower(replace(v, '_', ''))) then
    return format(
      '"%s" is kept for the Cheat Code team and for the app itself, so it cannot be a member''s name. Pick another one.',
      v);
  end if;
  return null;
end;
$$;

revoke all on function handle_problem(text) from public, anon, authenticated;
grant execute on function handle_problem(text) to service_role;

comment on function handle_problem(text) is
  'What is wrong with this username, in the words a member should read, or '
  'null when nothing is. The trigger enforces exactly this; asking it directly '
  'is how the rules are proved without renaming anybody.';

create or replace function profiles_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle  text;
  v_problem text;
begin
  -- ---- handle -------------------------------------------------------
  if new.handle is not null then
    v_handle := btrim(new.handle);
    if v_handle = '' then
      -- An empty box means "I did not set one", not "my name is nothing".
      new.handle := null;
    else
      v_problem := handle_problem(v_handle);
      if v_problem is not null then
        raise exception using errcode = '23514', hint = 'handle_rejected', message = v_problem;
      end if;
      new.handle := v_handle;
    end if;
  end if;

  -- ---- avatar -------------------------------------------------------
  -- The column has never been filled and another lane owns the upload that
  -- will fill it. All this does is refuse anything that is not a web address,
  -- so the day an upload writes here it cannot write a data: blob or a script
  -- into a field every member's screen renders.
  if new.avatar_url is not null then
    if btrim(new.avatar_url) = '' then
      new.avatar_url := null;
    elsif btrim(new.avatar_url) !~* '^https?://' then
      raise exception using
        errcode = '23514', hint = 'avatar_not_a_url',
        message = 'An avatar has to be a web address we can load.';
    elsif length(new.avatar_url) > 2048 then
      raise exception using
        errcode = '23514', hint = 'avatar_too_long',
        message = 'That image address is too long.';
    else
      new.avatar_url := btrim(new.avatar_url);
    end if;
  end if;

  -- ---- display name -------------------------------------------------
  if new.display_name is not null then
    new.display_name := btrim(new.display_name);
    if new.display_name = '' then
      new.display_name := null;
    elsif length(new.display_name) > 40 then
      raise exception using
        errcode = '23514', hint = 'display_name_too_long',
        message = 'A display name is at most 40 characters.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function profiles_identity_guard() from public, anon, authenticated;

drop trigger if exists profiles_identity_guard_trg on profiles;
create trigger profiles_identity_guard_trg
  before insert or update of handle, avatar_url, display_name on profiles
  for each row execute function profiles_identity_guard();

comment on function profiles_identity_guard() is
  'The last word on what a username, avatar and display name may be. Runs for '
  'every role, because `authenticated` can write `profiles` directly through '
  'PostgREST and a rule that only exists in the API is advisory.';

-- =====================================================================
-- 5b. "Is this username free?" — asked in SQL, for one reason
-- =====================================================================
-- The API needs this answer before it writes, so it can say "somebody already
-- has that one" instead of letting the unique index raise a message no member
-- should ever read. The obvious way to ask through PostgREST is
-- `.ilike('handle', wanted)` — and it is WRONG, because in SQL `LIKE` treats
-- `_` as "any single character". A member asking for `kway_x` would be told it
-- was taken by an existing `kwayXx`, and a member asking for `k_______x` would
-- collide with almost everybody.
--
-- So the comparison is done here, with `lower(...) = lower(...)`, which is
-- exactly the comparison `profiles_handle_lower_idx` makes. The two can never
-- disagree about whether `Kway` and `kway` are the same name.
--
-- `p_except` is the person asking: re-saving your own handle, or changing only
-- its capitalisation, is not a collision with yourself.
create or replace function handle_available(p_handle text, p_except uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from profiles
     where handle is not null
       and lower(handle) = lower(btrim(p_handle))
       and (p_except is null or user_id <> p_except)
  );
$$;

revoke all on function handle_available(text, uuid) from public, anon, authenticated;
grant execute on function handle_available(text, uuid) to service_role;

comment on function handle_available(text, uuid) is
  'Case-insensitive username availability. Uses the same comparison as '
  'profiles_handle_lower_idx. Exists because ILIKE would treat an underscore '
  'in a handle as a wildcard.';

-- =====================================================================
-- 6. `author_deleted` — WHY THIS FILE DOES NOT TOUCH `messages_public`
-- =====================================================================
-- 0032 added `messages.author_deleted` and nothing has ever read it. That
-- matters: the phone's rule for "who wrote this" is literally
-- `user_id == null ? Kai : member`, so without the flag a member who deletes
-- their account has every post they ever made re-attributed to Kai.
--
-- The obvious fix is to append the column to `messages_public`. This file
-- deliberately does not, because ANOTHER LANE IS DOING IT IN THE SAME WEEK.
-- `0033_media_reactions_threads.sql` re-creates the view with four appended
-- columns and `author_deleted` is the last of them. `create or replace view`
-- only allows columns appended AT THE END, so if this migration appended
-- `author_deleted` first, their migration would then be trying to change the
-- column at position 16 and would fail on any database where this one had
-- already run.
--
-- So the flag is read from the BASE TABLE instead — `lib/rooms.ts`
-- `authorDeletedFor()`, one batched query per page, and only when the page
-- actually contains a row with no author. That is correct on every database
-- whether or not the other lane has landed, and it costs one round trip on
-- pages that contain a Kai post or a severed one.
--
-- When the two lanes have both landed everywhere, folding that read back into
-- the view is a two-line change and this comment is the note that says so.

commit;

-- =====================================================================
-- VERIFICATION — run these, do not just read them
-- =====================================================================
-- (a) No room is tied to a setup any more, and the three core rooms are intact.
--     expect: core 3, setup 0 (or setup N with every row carrying closed_at,
--     if any of the eight had turned out to have posts).
--
--   select type, count(*), count(setup_id) as with_setup from rooms group by 1;
--   select count(*) from setups where discussion_room_id is not null;   -- expect 0
--
-- (b) The automatic door is gone and the staff door is not.
--
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('open_setup_circle','create_circle','close_expired_circles');
--   -- expect: create_circle, close_expired_circles. NOT open_setup_circle.
--
-- (c) The guard actually refuses. Each of these must raise:
--
--   update profiles set handle = 'everyone'  where user_id = (select user_id from profiles limit 1);
--   update profiles set handle = 'Ad_Min'    where user_id = (select user_id from profiles limit 1);
--   update profiles set handle = '9lives'    where user_id = (select user_id from profiles limit 1);
--   update profiles set handle = 'ab'        where user_id = (select user_id from profiles limit 1);
--   update profiles set handle = 'has space' where user_id = (select user_id from profiles limit 1);
--   update profiles set avatar_url = 'javascript:alert(1)' where user_id = (select user_id from profiles limit 1);
--
-- (d) Case-insensitive uniqueness. The second of these must fail:
--
--   -- with 'marcust' already taken, `MarcusT` is refused by
--   -- profiles_handle_lower_idx, not by the API.
--
-- (e) reserved_handles is not readable by a member.
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'reserved_handles';
--   -- expect service_role only. anon and authenticated must not appear.
--   select relrowsecurity, (select count(*) from pg_policy where polrelid = c.oid)
--     from pg_class c where c.relname = 'reserved_handles';
--   -- expect t | 0   (RLS on, zero policies: service role only)
--
-- (f) Nothing was widened on profiles.
--
--   select polname, polcmd, pg_get_expr(polqual, polrelid) from pg_policy
--    where polrelid = 'profiles'::regclass;
--   -- expect exactly one policy, profiles_owner_all, (user_id = auth.uid())
