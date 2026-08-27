-- 0017_watchlists
-- Source: docs/BUILD-BRIEF-round-2.md "SCHEMA-2" + docs/01_DATA_MODEL.md §13 row 1
-- ("watchlist tables ... owner select, owner write (RLS), writer = client direct").
--
-- 01 §4 never defined a watchlist table (see SCHEMA-NOTES 1.8). Round 2's Trade
-- tab needs a real one. Shape is exactly what the brief lists, plus the
-- conventions every other table follows (created_at/updated_at, owner RLS,
-- explicit grants, FK indexes).
--
-- Client-direct writes are ALLOWED here (row 1 of the matrix): the mobile app may
-- insert/delete watchlist_items with the user's own JWT, and the API's
-- /watchlist endpoints are a convenience wrapper over the same rows.

------------------------------------------------------------------ tables
create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text not null default 'Watchlist',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index watchlists_user_idx on watchlists (user_id, position);
-- one name per user: makes the default-watchlist provisioning idempotent and
-- stops the UI from producing two lists a user cannot tell apart.
create unique index watchlists_user_name_idx on watchlists (user_id, name);

create table watchlist_items (
  watchlist_id uuid not null references watchlists on delete cascade,
  symbol text not null references instruments(symbol),
  added_at timestamptz not null default now(),
  note text,
  primary key (watchlist_id, symbol)
);
create index watchlist_items_symbol_idx on watchlist_items (symbol);

------------------------------------------------------------------ triggers
-- updated_at: the 0013 DO-loop already ran, so new tables attach their own.
create trigger set_updated_at before update on public.watchlists
  for each row execute function public.set_updated_at();

-- Symbols are uppercase everywhere in this schema (instruments PK). A
-- client-direct insert of 'meta' would otherwise fail the FK with a confusing
-- error; normalise instead.
create or replace function watchlist_items_normalize_symbol() returns trigger
language plpgsql as $$
begin
  new.symbol := upper(btrim(new.symbol));
  return new;
end;
$$;
create trigger watchlist_items_normalize_symbol
  before insert or update on watchlist_items
  for each row execute function watchlist_items_normalize_symbol();

-- Default watchlist on profile insert. handle_new_user() (0013) inserts the
-- profile, so every new auth user ends up with exactly one 'Watchlist'.
-- Hung off profiles (not auth.users) so any path that creates a profile —
-- including seeds and back-office — gets the same guarantee.
create or replace function create_default_watchlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into watchlists (user_id, name, position)
  values (new.user_id, 'Watchlist', 0)
  on conflict (user_id, name) do nothing;
  return new;
end;
$$;
create trigger create_default_watchlist
  after insert on profiles
  for each row execute function create_default_watchlist();

-- backfill for profiles that already exist (local dev DBs, seeds)
insert into watchlists (user_id, name, position)
select p.user_id, 'Watchlist', 0 from profiles p
on conflict (user_id, name) do nothing;

--------------------------------------------------------------- RLS + grants
-- Supabase's default privileges grant new public tables to anon/authenticated,
-- so revoke first and grant back exactly what §13 allows (0014's blanket revoke
-- ran before these tables existed).
revoke all on watchlists, watchlist_items from anon, authenticated;

alter table watchlists enable row level security;
alter table watchlist_items enable row level security;

grant select, insert, update, delete on watchlists, watchlist_items to authenticated;

create policy watchlists_owner_all on watchlists
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- watchlist_items has no user_id; ownership is the parent list. The subquery
-- runs under the caller's own RLS on watchlists (owner-only), which is not
-- recursive and needs no security-definer helper.
create policy watchlist_items_owner_all on watchlist_items
  for all to authenticated
  using (exists (
    select 1 from watchlists w
    where w.id = watchlist_items.watchlist_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from watchlists w
    where w.id = watchlist_items.watchlist_id and w.user_id = auth.uid()));
