-- =====================================================================
-- 0053 — A deleted profile does not strand its posts
-- =====================================================================
-- Written, NOT applied — the owner applies it. Safe to run more than once.
--
-- THE BUG. `messages.user_id references profiles` was written in 0010 with no
-- ON DELETE clause, so it defaults to NO ACTION. Deleting a profile that has
-- ever posted fails with 23503 (foreign_key_violation). delete_account (0032)
-- dodges it by nulling user_id first, but every other path does not: a test
-- teardown, an auth.users delete from the dashboard, and the community delete
-- flow that answered 500. Six proof accounts in production are undeletable
-- today for exactly this reason. Checked in production 2026-09-21: messages is
-- one of three NO ACTION foreign keys onto profiles (the other two,
-- allocation_models.approved_by and legacy_imports.claimed_by, are staff
-- columns outside community and are left for their own migration).
--
-- THE FIX. ON DELETE SET NULL, and a trigger that makes a cascaded null mean
-- the same thing delete_account's null means: the post keeps its place in the
-- thread and loses its words, and author_deleted = true so the null is never
-- read as "posted by Kai" (0032). NOT cascade-delete: a hard delete would pull
-- the post out from under every reply in its thread.
--
-- WHY A TRIGGER AND NOT TRUST. The referential action runs as a plain UPDATE of
-- user_id and nothing else. Without the trigger, a deleted person's words would
-- stay readable with no name on them — the opposite of what deletion promises.
-- Row triggers DO fire for referential-action updates, which is what makes this
-- work.
-- =====================================================================

-- Before: turn "author went away" into the anonymised shape.
create or replace function messages_author_gone_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null and new.user_id is null and not coalesce(new.author_deleted, false) then
    new.body                := null;
    new.structured_idea     := null;
    new.position_disclosure := null;
    new.refs                := null;
    new.deleted_at          := coalesce(new.deleted_at, now());
    new.author_deleted      := true;
  end if;
  return new;
end;
$$;
revoke all on function messages_author_gone_before() from public, anon, authenticated;

drop trigger if exists messages_author_gone_before_t on messages;
create trigger messages_author_gone_before_t
  before update of user_id on messages
  for each row execute function messages_author_gone_before();

-- After: the side effects the deleted_at triggers (0033) would have run, which
-- do not fire here because the statement only named user_id. Pictures are
-- deleted (their purge is queued by media_assets_enqueue_purge), the parent's
-- reply_count is recounted, and reposts/bookmarks of a post that no longer
-- has words are dropped.
create or replace function messages_author_gone_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null and new.user_id is null and old.deleted_at is null and new.deleted_at is not null then
    perform set_config('app.media_purge_reason', 'account_deleted', true);
    delete from media_assets where message_id = new.id;
    if to_regclass('public.post_reposts') is not null then
      execute 'delete from post_reposts where message_id = $1' using new.id;
    end if;
    if to_regclass('public.post_bookmarks') is not null then
      execute 'delete from post_bookmarks where message_id = $1' using new.id;
    end if;
    if new.parent_id is not null then
      update messages m
         set reply_count = (select count(*) from messages r
                             where r.parent_id = new.parent_id and r.deleted_at is null)
       where m.id = new.parent_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function messages_author_gone_after() from public, anon, authenticated;

drop trigger if exists messages_author_gone_after_t on messages;
create trigger messages_author_gone_after_t
  after update of user_id on messages
  for each row execute function messages_author_gone_after();

-- The constraint itself. Dropped by looking it up rather than by assuming its
-- name, then re-added with the action.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.messages'::regclass
       and con.contype = 'f'
       and con.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table messages
  add constraint messages_user_id_fkey
  foreign key (user_id) references profiles (user_id) on delete set null;

-- Assertions.
do $$
declare v_action "char"; v_n int;
begin
  select confdeltype into v_action from pg_constraint
   where conrelid = 'public.messages'::regclass and conname = 'messages_user_id_fkey';
  if v_action is distinct from 'n' then
    raise exception '0053: messages_user_id_fkey is not ON DELETE SET NULL (confdeltype = %).', coalesce(v_action::text, 'missing');
  end if;
  select count(*) into v_n from pg_trigger
   where tgrelid = 'public.messages'::regclass and not tgisinternal
     and tgname in ('messages_author_gone_before_t', 'messages_author_gone_after_t');
  if v_n <> 2 then
    raise exception '0053: the author-gone triggers are not both installed.';
  end if;
end $$;
