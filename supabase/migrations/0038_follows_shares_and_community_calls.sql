-- 0038 — Following a person instead of a device, trades you chose to show, and
--        a call somebody in the room made themselves.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Three tables that turn a room full of strangers into a room full of people
-- you can actually track. FOLLOWING existed as a drawn button and nothing else:
-- `app/contributor/[userId].tsx` says so in its own header — "the artboard's
-- Follow is volt and implies a follows table — there isn't one" — and settles
-- for `AsyncStorage`, so a follow died with the app's cache and was never
-- visible to the person followed. SHARING A TRADE was impossible by
-- construction: every execution row is owner-select-only (0014 row 4) and there
-- is no widening of that policy which does not also hand out position size. And
-- A MEMBER'S OWN CALL had nowhere to live: `alerts` is a private watch
-- condition, `setups` is what the scanner produced, and a sentence in a room is
-- not a trade object — it cannot be resolved against a price later, so nobody
-- could ever be held to it.
--
-- =====================================================================
-- THE PRIVACY DECISION THIS FILE IS BUILT AROUND: SIZE IS NOT STORED
-- =====================================================================
-- The owner's rule is that direction and levels are shared and that DOLLAR SIZE
-- AND QUANTITY ARE NEVER SHOWN. There were two ways to honour that and only one
-- of them is honest.
--
-- The easy way is a view over `positions` that selects every column except
-- `qty` and `avg_cost`. It works on the day it is written and it is one careless
-- `select *` away from being wrong forever — and the person it would be wrong
-- about would never know.
--
-- So `trade_shares` is a SEPARATE TABLE and the size columns DO NOT EXIST IN
-- IT. There is no `qty`, no `notional`, no `risk_dollars`, no `realized_pnl`.
-- The API copies four numbers across at fill time — entry, stop, target and a
-- percent — and the quantity never leaves the execution tables. A future
-- contributor cannot leak position size from this table by accident, because
-- there is nothing here to leak. That is the difference between a rule that is
-- enforced and a rule that is merely obeyed.
--
-- `result_pct` IS A PERCENT AND NEVER A DOLLAR. A percentage move off an entry
-- price is a fact about the instrument; a P/L is a fact about the person's
-- account. The first is the point of sharing a trade and the second is the thing
-- being withheld. They are easy to confuse in a column name, so: `result_pct`.
--
-- =====================================================================
-- SHARING IS RETROACTIVE, WHICH IS THE ONLY HONEST READING OF A SWITCH
-- =====================================================================
-- `profiles.share_trades` defaults to FALSE. When a user turns it off, the
-- reasonable expectation is not "no NEW trades will be shared" — it is "stop
-- showing people my trades". Every read path in the API is therefore required
-- to join `profiles.share_trades` rather than trusting the mere existence of a
-- `trade_shares` row, and §6 below records the exact query. The rows are kept
-- rather than deleted so that turning the switch back on restores the record
-- instead of silently starting a new one with a suspiciously clean history.
--
-- A PER-TRADE OVERRIDE BEATS THE DEFAULT. `orders.share_trade` is a NULLABLE
-- boolean and the three states are meant: true = share this one, false = never
-- this one, null = whatever my setting says at fill time. A two-state column
-- would have forced every order ever previewed to carry a decision the user did
-- not make.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE CREATES
-- =====================================================================
--   follows           RLS on, ZERO policies, service role only.
--   trade_shares      RLS on, ZERO policies, service role only.
--   community_calls   RLS on, ZERO policies, service role only.
--
-- ALL THREE ARE SERVICE-ROLE-ONLY AND THAT IS A DELIBERATE READING OF 0033.
-- The obvious shape for `follows` is a client-writable table with an owner
-- policy — you manage your own follow rows — and it is wrong here for two
-- reasons. The first is mechanical: 0033 §8 installs a tripwire that raises if
-- any table outside an eight-name allowlist holds INSERT, UPDATE or DELETE for
-- `authenticated`, and that tripwire is re-run at the bottom of this file. The
-- second is the house's own precedent: `message_reactions`, `media_assets`,
-- `reserved_handles` and `reports` are every one of them a social object, and
-- every one of them is service-role-only, because a social write needs rate
-- limiting, block checks and a notification fan-out that a PostgREST insert
-- cannot do. A follow is the same species. The API is the only door.
--
-- Reads follow the same rule and go through routes, not policies. A follower
-- COUNT is public; a follower LIST is not, and a policy that can serve the
-- count can be paged into the list. `profiles_public` (0015) is the precedent
-- for identity that must be readable across owners, and it is a view with
-- `security_invoker = false` — not a relaxed policy on the base table.
--
-- There is no `using (true)` in this file, and no new grant to `anon` or to
-- `authenticated` on any table.
--
-- =====================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- =====================================================================
--   1. NO COLUMNS ON `messages`. A community call is not a post. It has a
--      lifecycle a post does not have (it resolves), it is read on surfaces
--      where no room exists, and `messages` is already carrying nine columns
--      bolted on by five migrations. Putting it there would also have meant
--      appending to `messages_public` and re-asserting it (0035 §5e).
--   2. NO ENUMS. 03 Unit 2 and 0035 §1 both say it: a check constraint is one
--      statement to amend, and an enum with retired values is a type nobody can
--      ever tidy up. Every closed set below is a check.
--   3. NO POINTS, BELTS OR LEADERBOARD. Those are 0039. This file stops at the
--      raw material — a call with real levels and a resolved outcome — because
--      a scoring system built before there is anything to score is a guess.

-- =====================================================================
-- 1. THE FOLLOW GRAPH
-- =====================================================================
-- The primary key IS the uniqueness rule: one row per ordered pair, so
-- following twice is not a thing that can happen and unfollowing is a delete
-- rather than a state machine. `created_at` is kept because "following since"
-- is the only interesting question a follow row can answer.
--
-- BOTH SIDES CASCADE. A deleted account must not leave its followers pointing
-- at a profile that no longer exists, and must not go on counting as a follower
-- of somebody still here. 0032 deletes the profile; these rows go with it.
create table if not exists follows (
  follower_id uuid not null references profiles on delete cascade,
  followee_id uuid not null references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  -- Following yourself is not a preference, it is a bug in whichever route
  -- forgot to check. The database is the place that cannot forget.
  constraint follows_not_self check (follower_id <> followee_id)
);

-- The fan-out query — "who follows this person" — is the hot one: it runs on
-- every publish, for every notification. The primary key already serves the
-- other direction ("who do I follow").
create index if not exists follows_followee_idx on follows (followee_id, created_at desc);

comment on table follows is
  'Who follows whom. Service-role only: writes go through the API so a follow '
  'can be rate limited and can raise a notification. Follower COUNTS are public '
  'via the API; follower LISTS are not exposed anywhere.';

-- =====================================================================
-- 2. THE SHARING SWITCH, AND ITS PER-TRADE OVERRIDE
-- =====================================================================
-- DEFAULT FALSE, and the default is the whole point. A trading app that ships
-- sharing switched on has published its users' positions before any of them
-- read a settings screen.
alter table profiles
  add column if not exists share_trades boolean not null default false;

comment on column profiles.share_trades is
  'Opt-in. When false, no execution of this user is visible to anyone else, and '
  'existing trade_shares rows stop being readable — the switch is retroactive.';

-- NULL means "ask my setting when the fill happens". It is not the same as
-- false, and a route that coalesces it to false has broken the default.
alter table orders
  add column if not exists share_trade boolean;

comment on column orders.share_trade is
  'Per-trade override of profiles.share_trades. true = share this one, '
  'false = never this one, null = use the account setting at fill time.';

-- =====================================================================
-- 3. THE SHARED TRADE — FOUR NUMBERS AND NOT ONE MORE
-- =====================================================================
-- Read the column list as a promise. Symbol, direction, three levels, two
-- timestamps, an outcome and a percent. Anything that would let a reader
-- reconstruct account size is absent on purpose and §7(c) asserts it stays
-- absent.
create table if not exists trade_shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  -- The execution this mirrors. `on delete cascade`: if the position is gone
  -- the share is a claim about nothing.
  position_id uuid not null references positions on delete cascade,

  symbol    text not null,
  direction text not null check (direction in ('long', 'short')),

  -- PRICES, NOT SIZES. `entry` is a price per share, which is a fact about the
  -- instrument. It is not `avg_cost * qty` and it never becomes that.
  entry  numeric not null,
  stop   numeric,
  target numeric,

  opened_at timestamptz not null,
  closed_at timestamptz,

  -- 'open' until the position closes. The rest are how it ended, in the
  -- vocabulary the paper tick already uses for its bracket legs.
  outcome text not null default 'open'
    check (outcome in ('open', 'target', 'stop', 'closed')),
  -- Percent move from entry, signed for the direction taken: positive means the
  -- trade went the way it was pointed. NEVER a dollar amount. See the header.
  result_pct numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- One share per position. Sharing the same execution twice would double it in
  -- every follower's feed and in every count.
  unique (position_id)
);

create index if not exists trade_shares_user_idx    on trade_shares (user_id, opened_at desc);
create index if not exists trade_shares_open_idx    on trade_shares (outcome) where outcome = 'open';
create index if not exists trade_shares_symbol_idx  on trade_shares (symbol, opened_at desc);

comment on table trade_shares is
  'The shareable projection of an executed paper trade. Quantity, notional and '
  'realized P/L are NOT COLUMNS HERE and must never be added: the privacy rule '
  'is enforced by their absence, not by a select list. Readable only while the '
  'author profiles.share_trades is true.';

-- =====================================================================
-- 4. A CALL SOMEBODY MADE THEMSELVES
-- =====================================================================
-- The thing that separates this from a post is `scoreable`. A member may say
-- anything they like in a room; a member who publishes a call WITH AN ENTRY AND
-- EITHER A STOP OR A TARGET has said something that can be checked against a
-- price later, and only that can ever earn a point (0039). The column is
-- GENERATED so the rule cannot be set wrongly by a route — the same technique
-- `positions.status` and `alerts.tab` already use.
create table if not exists community_calls (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,

  symbol    text not null,
  direction text not null check (direction in ('long', 'short')),

  entry  numeric,
  stop   numeric,
  target numeric,

  -- One line, and the cap is the design. `messages.body` is unbounded because a
  -- room post is a conversation; a call is a claim, and a claim that needs four
  -- paragraphs is not a claim.
  thesis text not null check (length(btrim(thesis)) between 1 and 280),

  -- WHY A GENERATED COLUMN. Two routes will eventually write calls (the
  -- composer and, one day, a promoted room post). 0033 §1: "there are two write
  -- paths and a rule that lives in one of them is not a rule."
  scoreable boolean generated always as (
    entry is not null and (stop is not null or target is not null)
  ) stored,

  status text not null default 'open'
    check (status in ('open', 'target', 'stop', 'expired', 'withdrawn')),

  published_at timestamptz not null default now(),
  -- FIVE SESSIONS, because that is already this project's outcome horizon: the
  -- scanner grader upstream measures `win_5d` / `gain_5d_pct` and a second
  -- horizon in the same app would produce two different answers to "was that
  -- call good". Calendar days, not sessions, because the resolver runs on a
  -- clock and the extra precision buys nothing at this resolution.
  expires_at timestamptz not null default (now() + interval '5 days'),

  resolved_at    timestamptz,
  resolved_price numeric,
  result_pct     numeric,
  -- Set by the resolver on every pass, fired or not. An unresolved call whose
  -- `last_checked_at` is hours stale means the resolver is broken, and that is
  -- a thing somebody should be able to see without reading logs.
  last_checked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- The resolver's query: open calls that have not expired, oldest check first.
create index if not exists community_calls_open_idx
  on community_calls (status, last_checked_at nulls first) where status = 'open';
create index if not exists community_calls_author_idx
  on community_calls (user_id, published_at desc);
create index if not exists community_calls_feed_idx
  on community_calls (published_at desc);
create index if not exists community_calls_symbol_idx
  on community_calls (symbol, published_at desc);

comment on table community_calls is
  'A trade call published by a member, as a resolvable object rather than a '
  'sentence. Only rows with scoreable = true can ever earn points (0039): an '
  'entry plus a stop or a target is what makes a claim checkable.';

comment on column community_calls.scoreable is
  'Generated, not set. True when the call carries an entry and at least one of '
  'stop or target — the minimum that can be resolved against a price.';

-- =====================================================================
-- 5. A DIRECTION AND ITS LEVELS MUST AGREE
-- =====================================================================
-- A long whose stop sits above its entry is not a trade, it is a typo, and it
-- would resolve as an instant win the moment the resolver looked at it. Both
-- tables get the same rule from one function because two copies of a rule
-- drift. Raised with a snake_case condition name so the route can translate it
-- into a sentence rather than showing a constraint name to a person.
create or replace function social_levels_coherent() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entry is null then
    return new;
  end if;

  if new.direction = 'long' then
    if new.stop is not null and new.stop >= new.entry then
      raise exception 'stop_not_below_entry'
        using errcode = '22023',
              hint = 'On a long the stop is below the entry.';
    end if;
    if new.target is not null and new.target <= new.entry then
      raise exception 'target_not_above_entry'
        using errcode = '22023',
              hint = 'On a long the target is above the entry.';
    end if;
  else
    if new.stop is not null and new.stop <= new.entry then
      raise exception 'stop_not_above_entry'
        using errcode = '22023',
              hint = 'On a short the stop is above the entry.';
    end if;
    if new.target is not null and new.target >= new.entry then
      raise exception 'target_not_below_entry'
        using errcode = '22023',
              hint = 'On a short the target is below the entry.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists community_calls_levels_t on community_calls;
create trigger community_calls_levels_t
  before insert or update of entry, stop, target, direction on community_calls
  for each row execute function social_levels_coherent();

drop trigger if exists trade_shares_levels_t on trade_shares;
create trigger trade_shares_levels_t
  before insert or update of entry, stop, target, direction on trade_shares
  for each row execute function social_levels_coherent();

-- `set_updated_at` has existed since 0013 and every table with an `updated_at`
-- is expected to carry it.
drop trigger if exists set_updated_at on trade_shares;
create trigger set_updated_at before update on trade_shares
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on community_calls;
create trigger set_updated_at before update on community_calls
  for each row execute function set_updated_at();

-- =====================================================================
-- 6. RLS AND GRANTS
-- =====================================================================
-- RLS ON + ZERO POLICIES = the API is the only door, exactly as 0033 §8 left
-- the media and reaction tables and for the same reason: there is no row in any
-- of these three that a client has a right to read directly. A follow row is
-- half of somebody else's follower list. A trade share is only readable while
-- its author's switch is on, and a policy cannot be trusted to re-check that on
-- every future column somebody adds. A community call is readable only in the
-- shapes the routes assemble.
alter table follows         enable row level security;
alter table trade_shares    enable row level security;
alter table community_calls enable row level security;

revoke all on follows         from anon, authenticated;
revoke all on trade_shares    from anon, authenticated;
revoke all on community_calls from anon, authenticated;

-- Each table gets only the verbs it actually needs. A follow is created or
-- destroyed and never edited, so it has no UPDATE. A share and a call are both
-- resolved in place, so they do.
grant select, insert,         delete on follows         to service_role;
grant select, insert, update, delete on trade_shares    to service_role;
grant select, insert, update, delete on community_calls to service_role;

revoke all on function social_levels_coherent() from public, anon, authenticated;

-- THE READ THE API MUST USE, written down because it is the whole privacy
-- model and it lives in TypeScript where a migration cannot enforce it:
--
--   select s.* from trade_shares s
--     join profiles p on p.user_id = s.user_id
--    where p.share_trades = true
--      and s.user_id = $1;
--
-- The join is not an optimisation. Dropping it publishes the trades of every
-- user who has ever switched sharing off.

-- =====================================================================
-- 7. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) ALL THREE TABLES EXIST AND ALL THREE HAVE RLS ON. A table created without
--     RLS in a schema where 0014 turned it on table-by-table is a table that
--     silently answers PostgREST.
do $$
declare v_bad text;
begin
  select string_agg(c.relname, ', ')
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('follows', 'trade_shares', 'community_calls')
     and c.relrowsecurity = false;
  if v_bad is not null then
    raise exception '0038: RLS is OFF on %. Every table this file creates is service-role only.', v_bad;
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('follows', 'trade_shares', 'community_calls')) <> 3 then
    raise exception '0038: one of follows / trade_shares / community_calls is missing.';
  end if;
end $$;

-- (b) ZERO POLICIES ON ALL THREE. This is 0033 §8's tripwire, pointed at the
--     new tables. The way service-role-only stops being true is somebody adding
--     a "harmless" read policy so the phone can count followers itself.
do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('follows', 'trade_shares', 'community_calls');
  if v_count > 0 then
    raise exception '0038: % policy(ies) exist on the new tables. All three are service-role only.', v_count;
  end if;
end $$;

-- (c) THE SIZE COLUMNS DO NOT EXIST ON `trade_shares`. This is the assertion
--     that makes the header's promise real rather than rhetorical. If somebody
--     adds `qty` to this table in three months, this migration fails on the
--     next fresh apply and they find out why in the message.
do $$
declare v_bad text;
begin
  select string_agg(column_name, ', ')
    into v_bad
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'trade_shares'
     and column_name in (
       'qty', 'quantity', 'shares', 'size', 'notional', 'avg_cost',
       'realized_pnl', 'unrealized_pnl', 'risk_dollars', 'max_loss_usd', 'pnl'
     );
  if v_bad is not null then
    raise exception
      '0038: trade_shares carries size column(s) %. Dollar size and quantity are never shared; the rule is enforced by these columns not existing.',
      v_bad;
  end if;
end $$;

-- (d) NO CLIENT WRITE GRANT ANYWHERE OUTSIDE THE ALLOWLIST. 0033 §10's guard,
--     re-run because this migration created tables. The allowlist is copied
--     verbatim and NOT extended: none of the three new tables belongs on it.
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
    raise exception '0038: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (e) `scoreable` IS REALLY GENERATED, not merely defaulted. A route that could
--     set it by hand is a route that can award itself points.
do $$
declare v_gen text;
begin
  select is_generated into v_gen
    from information_schema.columns
   where table_schema = 'public' and table_name = 'community_calls'
     and column_name = 'scoreable';
  if v_gen is distinct from 'ALWAYS' then
    raise exception '0038: community_calls.scoreable is not a generated column (is_generated = %). A route could set it by hand.', coalesce(v_gen, 'missing');
  end if;
end $$;

-- (f) THE COHERENCE GUARD IS ARMED ON BOTH TABLES. A trigger created and then
--     dropped by a later hand-edit leaves the levels with no rule at all.
do $$
declare v_missing text;
begin
  select string_agg(x.want, ', ')
    into v_missing
    from (values ('community_calls', 'community_calls_levels_t'),
                 ('trade_shares',    'trade_shares_levels_t')) as x(tbl, want)
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relname = x.tbl and t.tgname = x.want and not t.tgisinternal
   );
  if v_missing is not null then
    raise exception '0038: trigger(s) % are not installed. Nothing stops a long with a stop above its entry.', v_missing;
  end if;
end $$;

-- (g) SHARING IS OFF FOR EVERY EXISTING ACCOUNT. `default false` only governs
--     rows written after this runs; this is the check that nobody was opted in
--     by the `add column` itself.
do $$
declare v_on int;
begin
  select count(*) into v_on from profiles where share_trades is true;
  if v_on > 0 then
    raise exception '0038: % existing profile(s) already have share_trades on. Sharing must be opt-in.', v_on;
  end if;
end $$;

-- =====================================================================
-- 8. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The privacy promise, as the database sees it. This should return NOTHING:
--
--   select column_name from information_schema.columns
--    where table_name = 'trade_shares'
--      and column_name in ('qty','notional','realized_pnl','avg_cost');
--   -> expected: 0 rows.
--
-- (ii) The three tables are shut to the phone. As `authenticated`, with a real
--      user JWT against PostgREST:
--
--   select * from follows;         -> permission denied for table follows
--   select * from trade_shares;    -> permission denied for table trade_shares
--   select * from community_calls; -> permission denied for table community_calls
--
-- (iii) The level guard refuses a backwards trade. As service_role:
--
--   insert into community_calls (user_id, symbol, direction, entry, stop, thesis)
--   values ('<a user>', 'NVDA', 'long', 231.40, 240.00, 'stop above entry');
--   -> ERROR: stop_not_below_entry
--
--   insert into community_calls (user_id, symbol, direction, entry, target, thesis)
--   values ('<a user>', 'NVDA', 'short', 231.40, 240.00, 'target above entry');
--   -> ERROR: target_not_below_entry
--
-- (iv) `scoreable` computes itself and cannot be forced:
--
--   insert into community_calls (user_id, symbol, direction, thesis)
--   values ('<a user>', 'NVDA', 'long', 'no levels at all')
--   returning scoreable;
--   -> expected: false
--
--   insert into community_calls (user_id, symbol, direction, entry, target, thesis)
--   values ('<a user>', 'NVDA', 'long', 231.40, 240.00, 'a real call')
--   returning scoreable;
--   -> expected: true
--
--   update community_calls set scoreable = true where scoreable = false;
--   -> ERROR: column "scoreable" can only be updated to DEFAULT
--
-- (v) Following yourself is refused, and following twice is one row:
--
--   insert into follows (follower_id, followee_id) values ('<u>', '<u>');
--   -> ERROR: new row violates check constraint "follows_not_self"
--
--   insert into follows (follower_id, followee_id) values ('<a>', '<b>');
--   insert into follows (follower_id, followee_id) values ('<a>', '<b>');
--   -> ERROR: duplicate key value violates unique constraint "follows_pkey"
--
-- (vi) The switch is retroactive. With one shared trade in the table:
--
--   update profiles set share_trades = false where user_id = '<author>';
--   select count(*) from trade_shares s join profiles p on p.user_id = s.user_id
--    where p.share_trades = true and s.user_id = '<author>';
--   -> expected: 0. The rows are still there; nothing may read them.
