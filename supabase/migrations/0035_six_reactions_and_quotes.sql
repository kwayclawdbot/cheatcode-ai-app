-- 0035 — Six reactions instead of four, and a reply that carries the post it
--        answers.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Two things, both of them about the room reading like a conversation instead
-- of like a list. The reaction set doubles from four to six, because the four
-- 0033 shipped were the right IDEA and the wrong VOCABULARY for a trading room:
-- there was no way to say "this ran" or "this rolled over", which is most of
-- what people actually want to say about a call. And a comment gains a QUOTE —
-- the post or the sibling comment it is answering, carried on the row — so a
-- thread stops being a pile of sentences that only make sense if you scrolled
-- up first.
--
-- Neither is a new table. The reaction change is one check constraint. The
-- quote change is one nullable column, one index, and one trigger that makes
-- the rule about WHICH post may be quoted impossible to break rather than
-- merely enforced by whichever route happened to run.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   message_reactions   UNCHANGED. RLS on, ZERO policies, service role only,
--                       exactly as 0033 §8 left it. This file amends a CHECK
--                       CONSTRAINT and nothing else about that table. It adds
--                       no policy, and 0033's tripwire — which raises if any
--                       policy exists on media_assets, message_reactions or
--                       media_deletions — is re-run at the bottom of this file
--                       so that stays true rather than being assumed.
--   messages            UNCHANGED. It already has RLS on with one policy,
--                       `messages_member_select` (0014 row 5), which is a
--                       SELECT-only policy reading `is_room_member(room_id)`.
--                       `quoted_message_id` is a new column on that existing
--                       table, so it inherits that policy and nothing about the
--                       posture moves: a member who may read the row may read
--                       this column of it, a member who may not read the row
--                       still may not, and no client may write it — writes go
--                       through this API with the service role, as every other
--                       column of `messages` already does. Adding a column is
--                       not a place to weaken a policy and this file does not.
--   messages_public     Re-created with one appended column, keeping
--                       `security_invoker = false` and the same membership
--                       where-clause. The grants 0031 and 0033 put on it are
--                       re-applied explicitly below rather than assumed to have
--                       survived.
--
-- There is no `using (true)` in this file, and no new grant to `anon` or to
-- `authenticated` beyond the `select` on the view they already had.

-- =====================================================================
-- 1. SIX REACTIONS — AND TWO OF THEM ARE THE OLD ONES WEARING NEW FACES
-- =====================================================================
-- The owner picked exactly six:
--
--   👍  agree       · I think this is right.
--   👎  disagree    · I think this is wrong.
--   🔥  fire        · This is a strong call.
--   💯  hundred     · This was exactly right.
--   📈  chart_up    · It ran.
--   📉  chart_down  · It rolled over.
--
-- THE FIRST TWO ARE NOT NEW ROWS AND MUST NOT BE. 👍 IS `agree` and 👎 IS
-- `disagree` — the same kind under a picture instead of a word. Storing the
-- thumb as a seventh kind would have been the easy version and it would have
-- been wrong twice over: every reaction already given would stop counting
-- towards the thing it plainly meant, and the room would carry two separate
-- tallies of the same opinion for the rest of its life. So the two existing
-- kinds keep their names in the database and only their FACE changes on the
-- phone. Nothing needs backfilling, because nothing moved.
--
-- WHY THESE FOUR NEW ONES AND NOT ANY OTHER FOUR. `disagree` was the reaction
-- 0033 argued hardest for, and the argument holds: a room whose only cheap
-- gesture is approval reads as unanimous whether or not it is. What 0033 got
-- wrong is that agreement and dissent are the only two things it let anybody
-- say, and a call is not only right or wrong — it is strong or weak BEFORE the
-- fact, and it ran or it rolled over AFTER it. 🔥 and 💯 are the first pair;
-- 📈 and 📉 are the second, and they are the two that make the reaction row
-- worth reading a week later. A post covered in 📉 is a record of what
-- happened, which is exactly the raw material `contributor_stats` was built
-- for.
--
-- `watching` AND `useful` ARE LEGACY AND THEY STAY IN THE CHECK. The picker no
-- longer offers them. Rows already carrying them are real opinions that real
-- members gave, and dropping the kinds from the constraint would either destroy
-- those rows or make the table refuse to be read back into. They remain valid
-- for storage, they keep counting on the messages they are on, and no new one
-- can be created because no client offers the button. That is the whole
-- difference between "retired" and "deleted", and it is the reason the
-- constraint below lists eight kinds while the app shows six.
--
-- WHY A CHECK AND NOT AN ENUM, restated because this file is the proof: 0033
-- chose a check constraint precisely so that this change would be one
-- statement. An enum would have needed a type alteration, and an enum with two
-- retired values in it is a type nobody can ever tidy up. Here the amendment is
-- a drop and an add, in one transaction, over a table with no dependent views.

-- The constraint 0033 created is INLINE and therefore UNNAMED in the source, so
-- its real name is whatever Postgres generated — conventionally
-- `message_reactions_kind_check`, but conventions are not guarantees and a
-- migration that drops the wrong name silently leaves the old rule in place
-- while appearing to succeed. So it is looked up rather than guessed: any check
-- constraint on this table whose definition mentions the `kind` column is the
-- one being replaced, and it is dropped by its actual name.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     cl on cl.oid = con.conrelid
      join pg_namespace n  on n.oid  = cl.relnamespace
     where n.nspname   = 'public'
       and cl.relname  = 'message_reactions'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table message_reactions drop constraint %I', c.conname);
  end loop;
end $$;

-- Belt and braces: if the loop above found nothing because a future edit named
-- the constraint without mentioning `kind` in its definition, this still clears
-- the conventional name before the add below would collide with it.
alter table message_reactions drop constraint if exists message_reactions_kind_check;

alter table message_reactions
  add constraint message_reactions_kind_check
  check (kind in ('agree', 'disagree', 'fire', 'hundred', 'chart_up', 'chart_down', 'watching', 'useful'));

comment on constraint message_reactions_kind_check on message_reactions is
  'Six kinds the app offers (agree, disagree, fire, hundred, chart_up, '
  'chart_down) plus two the app has retired but the table still accepts '
  '(watching, useful, from 0033). The retired pair is here so existing rows '
  'stay valid and keep counting; nothing creates new ones.';

-- NO POLICY IS ADDED TO `message_reactions` BY THIS FILE. It stays RLS-on with
-- zero policies, reachable only by the service role, which is the posture 0033
-- §8 set and the posture its tripwire enforces. A reaction is meaningless
-- without the message it is on, so there is no row here a client has a right to
-- read directly; the room's own read path hands over the counts already
-- denormalised onto the message. Verified at the bottom of this file.

-- =====================================================================
-- 2. QUOTING — A REPLY CARRIES WHAT IT IS ANSWERING
-- =====================================================================
-- WHAT PROBLEM THIS SOLVES, plainly. Threads here are one level deep and that
-- is not changing (0033 §1 explains why at length, and the trigger that
-- enforces it is untouched by this file). One level buys a readable
-- conversation and costs one thing: when twenty people comment on a post, a
-- comment answering the fourth comment has no way to say so. It just sits
-- there, in order, reading like a reply to whatever happens to be above it.
--
-- A QUOTE IS HOW "REPLYING TO @NAME" EXISTS WITHOUT A SECOND LEVEL OF NESTING.
-- The comment stays exactly where it is in the flat list, and it carries a
-- pointer to the thing it is answering — which may be the post itself, or may
-- be a SIBLING comment. That is the whole feature: depth stays at one, and the
-- conversation reads correctly anyway.
--
-- The second thing it buys is that the quote SURVIVES SCROLLING. A room moves;
-- a post quoted at eight in the morning is a hundred messages up by lunch. The
-- reader of the reply gets the two lines they need to understand it without
-- leaving where they are.
--
-- WHAT WAS REJECTED. Copying the quoted text into the reply's own body was the
-- other option, and it is what a chat app that stores plain strings would do.
-- It is wrong here for one reason that outweighs its simplicity: this app can
-- REMOVE a post, and a moderator's removal has to actually remove the words. If
-- the words had been copied into ten replies, taking the post down would leave
-- ten verbatim copies of it standing in the thread, and the removal would be
-- theatre. A pointer can be followed at read time and refused; a copy cannot be
-- taken back. So the column stores an id, the API resolves it on the way out,
-- and a quote of a removed post renders as "this post was removed" rather than
-- as its text.
--
-- `on delete set null` AND NOT CASCADE, and this is the important word in the
-- statement. Cascade would mean that hard-deleting one post deletes every reply
-- that ever mentioned it — a member's own writing destroyed because somebody
-- else's post went away. That is not a data model, it is a trapdoor. Set null
-- leaves the reply standing with nothing to quote, which the API renders the
-- same way it renders a removal. (This app soft-deletes messages rather than
-- hard-deleting them, so this path is for a database-level cleanup and for
-- whatever a future migration does. It is spelled out because the default a
-- reference gets when nobody thinks about it is the one that hurts.)
alter table messages
  add column if not exists quoted_message_id uuid references messages on delete set null;

comment on column messages.quoted_message_id is
  'The post or sibling comment this message is answering, carried so the quote '
  'survives the original scrolling away. An id and never a copy of the text: a '
  'removed post has to actually disappear, and copied words cannot be taken '
  'back. Null on a message that quotes nothing.';

-- The read is "resolve the quotes for the page I am about to send", which is
-- one `in (...)` over the ids the page collected — so this index is not for
-- that direction. It is for the other one: finding what quotes a given message,
-- which is what a future "3 people answered this" count or a moderation sweep
-- over a removed post's mentions would ask. Partial, because the overwhelming
-- majority of messages quote nothing and there is no reason to carry them in
-- the index.
create index if not exists messages_quoted_idx
  on messages (quoted_message_id) where quoted_message_id is not null;

-- ---------------------------------------------------------------------
-- 2b. THE GUARD — WHICH POSTS MAY BE QUOTED, ENFORCED IN THE TABLE
-- ---------------------------------------------------------------------
-- Same shape and same reasoning as `messages_thread_depth_guard` (0033 §1), and
-- deliberately so: there are two write paths into `messages` — the
-- `post_room_message` RPC from 0018 and the API's fallback insert when that RPC
-- is missing — and a rule that lives in one of them is not a rule. It is also
-- not a rule if it lives in the route, because the route is one door and the
-- table is the floor under all of them.
--
-- THE THIRD CONDITION IS THE ONE THAT MATTERS. `quoted_not_in_room` is not
-- tidiness. Without it, a member could quote a post out of a room they are in
-- into a room the reader is not in — and the quote is RESOLVED AND RENDERED for
-- that reader, so the words of a private room would be republished into a
-- public one by anybody who could paste an id. Checking it in the posting route
-- would work right up until the day somebody writes a second way to post. This
-- makes it impossible in the table, which is the only place a rule about who
-- may see what should ever be final.
--
-- Note what is NOT checked here: whether the quoted post is deleted. That is
-- checked in the route, because it is a rule about what a member may DO right
-- now, not a rule about what the data may BE — a quote whose target is removed
-- later is a legitimate row that the API renders as "this post was removed",
-- and a trigger refusing it would make removing a post fail if anything quoted
-- it.
create or replace function messages_quote_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quoted_room uuid;
begin
  if new.quoted_message_id is null then
    return new;
  end if;

  -- A post quoting itself renders as an infinite mirror and means nothing.
  if new.quoted_message_id = new.id then
    raise exception 'quote_is_self' using errcode = '22023';
  end if;

  select room_id into v_quoted_room
    from messages where id = new.quoted_message_id;

  if not found then
    raise exception 'quoted_not_found' using errcode = '22023';
  end if;

  if v_quoted_room is distinct from new.room_id then
    raise exception 'quoted_not_in_room' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function messages_quote_guard() from public, anon, authenticated;

drop trigger if exists messages_quote_guard_t on messages;
create trigger messages_quote_guard_t
  before insert or update of quoted_message_id, room_id on messages
  for each row execute function messages_quote_guard();

-- =====================================================================
-- 3. messages_public GAINS ONE COLUMN AND NO SECRETS
-- =====================================================================
-- `create or replace view` permits columns appended at the end and nothing
-- else, so 0033 §7's list is reproduced EXACTLY — same order, same expressions,
-- same `case` wrappers — and the one new column follows it. Nothing in the
-- existing list is edited; if it were, this statement would fail rather than
-- silently change what the room reads.
--
-- `quoted_message_id` is public by nature. It is an id of a message in the SAME
-- ROOM (§2b makes that a fact and not a hope), and the view's own where-clause
-- already refuses every row in a room the reader is not in. So a member can
-- only ever resolve a quote to a post they were already entitled to read, which
-- is the property that lets the API hydrate quotes without a second membership
-- check per quote.
--
-- It is NOT wrapped in the `case when m.deleted_at is null` that guards `body`,
-- `reaction_counts` and `attachment_count`. Those are blanked on a removed
-- message because they are its CONTENT. A quote pointer is not content: it is
-- the structure of the conversation, the same way `parent_id` is, and
-- `parent_id` is not blanked either. Nothing readable leaks through it, because
-- what it points at is resolved separately and a removed target resolves to
-- "this post was removed".
--
-- What stays out is what stayed out before, for the reason 0031 gave:
-- `deleted_by`, `deleted_reason` and `deleted_cascade_of` name a moderator, and
-- a staff note about a member turns every removal into an argument in the room.
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
         m.author_deleted,
         -- Appended by 0035.
         m.quoted_message_id
  from messages m
  where current_user = 'service_role' or is_room_member(m.room_id);

comment on view messages_public is
  'The member-facing message surface. Runs with the view owner''s rights and '
  'carries its own membership test, so `select on messages` does not have to be '
  'granted to clients. A deleted row keeps its place and loses its body, its '
  'reactions and its pictures. It keeps its shape — its parent and the post it '
  'quoted — because that is the conversation and not the content.';

-- 0031 revoked every write verb from this view and set the default privileges
-- so a NEW view cannot be born writable; 0033 restated it after replacing the
-- view. `create or replace view` KEEPS an existing view's ACL — it does not
-- drop and re-create it — so nothing was re-opened by the statement above. It
-- is restated anyway, third time, because "it should still be there" is not the
-- standard this schema is held to and the cost of being explicit is four lines.
revoke insert, update, delete, truncate, references, trigger
  on messages_public from anon, authenticated;
revoke all on messages_public from anon;
grant select on messages_public to authenticated;

-- =====================================================================
-- 4. THE FUNCTION GRANT FLOOR
-- =====================================================================
-- SCHEMA-NOTES 2.7: 0018's function grant floor runs once, so every migration
-- that creates a function must re-apply it. The `create or replace function`
-- above is followed by its own revoke; this is the sweep that catches a future
-- edit which forgets one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('messages_quote_guard')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- =====================================================================
-- 5. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================
-- These run as part of the migration. A migration that says it did something
-- and a migration that proves it are different migrations, and 0033 §9/§10 set
-- the standard this follows.

-- (a) THE CONSTRAINT ACTUALLY ACCEPTS ALL EIGHT KINDS.
--
-- Not "the file contains the right words" — the real constraint expression is
-- read back out of the catalogue and EVALUATED against all eight strings. The
-- definition comes back as `CHECK (...)`, so the leading `CHECK ` is stripped
-- and what is left is run over a values list whose column is called `kind`,
-- which is exactly what the constraint refers to. If somebody later drops a
-- kind, or a hand-edit leaves the old four-value rule in place, this fails the
-- migration instead of failing a member's tap six months later.
do $$
declare
  v_def  text;
  v_pass boolean;
begin
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con
    join pg_class     cl on cl.oid = con.conrelid
    join pg_namespace n  on n.oid  = cl.relnamespace
   where n.nspname  = 'public'
     and cl.relname = 'message_reactions'
     and con.conname = 'message_reactions_kind_check';

  if v_def is null then
    raise exception '0035: message_reactions_kind_check is missing. The reaction set is unguarded — any string would be storable as a kind.';
  end if;

  execute format(
    'select bool_and(%s) from (values (%L),(%L),(%L),(%L),(%L),(%L),(%L),(%L)) as t(kind)',
    substring(v_def from 7),
    'agree', 'disagree', 'fire', 'hundred', 'chart_up', 'chart_down', 'watching', 'useful')
  into v_pass;

  if v_pass is not true then
    raise exception '0035: the kind check does not accept all eight kinds. It reads: %', v_def;
  end if;
end $$;

-- (b) AND IT STILL REFUSES SOMETHING. A constraint that accepts everything
--     would pass (a) and be worthless.
do $$
declare
  v_def  text;
  v_pass boolean;
begin
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class cl on cl.oid = con.conrelid
   where cl.relname = 'message_reactions' and con.conname = 'message_reactions_kind_check';

  execute format('select %s from (values (%L)) as t(kind)', substring(v_def from 7), 'not_a_reaction')
  into v_pass;

  if v_pass is not false then
    raise exception '0035: the kind check accepts an unknown kind. It is not constraining anything.';
  end if;
end $$;

-- (c) NO ROW ALREADY IN THE TABLE VIOLATES THE NEW RULE. `alter table ... add
--     constraint` validates existing rows and would have failed above, so this
--     is belt and braces — and it is the query somebody will want to run by
--     hand on hosted before believing the deploy.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from message_reactions
   where kind not in ('agree', 'disagree', 'fire', 'hundred', 'chart_up', 'chart_down', 'watching', 'useful');
  if v_bad > 0 then
    raise exception '0035: % reaction row(s) carry a kind the new constraint does not allow.', v_bad;
  end if;
end $$;

-- (d) `message_reactions` STILL HAS ZERO POLICIES. This is 0033 §8's tripwire,
--     re-run because this file altered the table. Service-role-only is the
--     posture, and the way it stops being true is somebody adding a "harmless"
--     read policy so a client can count reactions itself.
do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('media_assets', 'message_reactions', 'media_deletions');
  if v_count > 0 then
    raise exception '0035: % policy(ies) exist on the media/reactions tables. All three are service-role only (0033 §8).', v_count;
  end if;
end $$;

-- (e) `quoted_message_id` REACHED BOTH THE TABLE AND THE VIEW. The view is the
--     one that is easy to get wrong: `create or replace view` silently keeps
--     the old definition if the statement is skipped or reordered, and the API
--     reads the view and not the table, so a missing column there means the
--     quote is null for every message with no error anywhere.
do $$
declare
  v_on_table int;
  v_on_view  int;
begin
  select count(*) into v_on_table
    from information_schema.columns
   where table_schema = 'public' and table_name = 'messages'
     and column_name = 'quoted_message_id';

  select count(*) into v_on_view
    from information_schema.columns
   where table_schema = 'public' and table_name = 'messages_public'
     and column_name = 'quoted_message_id';

  if v_on_table <> 1 then
    raise exception '0035: messages.quoted_message_id is missing.';
  end if;
  if v_on_view <> 1 then
    raise exception '0035: messages_public.quoted_message_id is missing. The API reads the view, so quotes would silently be null everywhere.';
  end if;
end $$;

-- (f) THE GUARD IS ARMED. A trigger that was created and then dropped by a
--     later hand-edit leaves the column with no rule at all.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname = 'messages' and t.tgname = 'messages_quote_guard_t' and not t.tgisinternal
  ) then
    raise exception '0035: messages_quote_guard_t is not installed. Nothing stops a quote pointing into another room.';
  end if;
end $$;

-- =====================================================================
-- 6. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The reaction set, as the database sees it:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'message_reactions_kind_check';
--   -> expected: eight kinds, with `watching` and `useful` among them.
--
-- (ii) What people are actually using, which is how the retired pair gets
--      retired for real one day:
--
--   select kind, count(*) from message_reactions group by kind order by 2 desc;
--
-- (iii) The guard refuses a quote from another room. As service_role, against
--       two real rooms:
--
--   insert into messages (room_id, user_id, seq, kind, body, quoted_message_id)
--   values ('<room A>', '<user>', 999999, 'text', 'quoting elsewhere',
--           '<a message id in room B>');
--   -> ERROR: quoted_not_in_room
--
--   update messages set quoted_message_id = id where id = '<any message>';
--   -> ERROR: quote_is_self
--
--   insert into messages (room_id, user_id, seq, kind, body, quoted_message_id)
--   values ('<room A>', '<user>', 999998, 'text', 'quoting nothing',
--           gen_random_uuid());
--   -> ERROR: quoted_not_found   (the foreign key would also refuse it; the
--      trigger runs first and gives the route a name it can translate)
--
-- (iv) Removing a quoted post does not remove the replies that quoted it:
--
--   update messages set deleted_at = now() where id = '<a quoted post>';
--   select count(*) from messages where quoted_message_id = '<that post>';
--   -> expected: unchanged. The replies stand; the API renders the quote as
--      "this post was removed".
