-- 0041 — A called trade remembers the best it ever got, as a price, while it
--        is still running.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Until now the app never watched a call while it was alive. It called a trade,
-- forgot about it, and weeks later the engine wrote a percentage into
-- `score_components.outcome` — `mfe_5d_pct`, the best the trade got, as a
-- number with no price and no clock attached to it. The History card shipped in
-- ae5ff2f could therefore print "+22.9%" and could NOT print "peak $27.91",
-- because the price behind that percentage was never anywhere. This file gives
-- every tracked call somewhere to put the extremes, so the */5 resolver can
-- write them down AS THEY HAPPEN and the card can show a real number.
--
-- =====================================================================
-- WHAT "WHILE IT IS ACTIVE" MEANS, and it is not a day count
-- =====================================================================
-- The owner's rule, and the whole reason this file has a `resolution_kind`
-- column: a call is active until something ENDS it, and there are exactly three
-- ways that happens.
--
--   stop_met          the price reached the stop that was published with it
--   target_met        the price reached the target that was published with it
--   contract_expired  a day-trade option call ran to its contract's expiry,
--                     which is the only ending that family has — it publishes
--                     no stop and no target, by design, and 0033-era ingest
--                     writes `stop: null, targets: []` on purpose
--   expired           nothing was ever reached and the row's own `valid_until`
--                     ran out. Named separately BECAUSE IT IS NOT A RESULT.
--                     A call that ended this way was neither right nor wrong,
--                     and the History card's one muted line has to be able to
--                     say which of the four happened in a single word.
--
-- The five-session window in `score_components.outcome` IS NOT THIS. That is a
-- SCORING convention — the engine measures every family close-to-close at five
-- sessions so the families can be compared to each other — and it must not be
-- allowed to truncate the tracking window. A swing call that runs eleven days
-- to its target is tracked for eleven days; the scorer still says what it says
-- about session five. Two different questions, two different windows, and
-- conflating them is how a peak ends up measured over a period the trade was
-- not actually in.
--
-- =====================================================================
-- WHY THE FAVOURABLE PEAK IS A GENERATED COLUMN AND NOT A WRITTEN ONE
-- =====================================================================
-- The tracker sees prices, not opinions: it writes `high_price` and
-- `low_price`, the two raw extremes, and nothing else. WHICH of those two is
-- "the peak" is a question about DIRECTION, and the direction is already on the
-- row — `intent` here, `direction` on `community_calls`. So `peak_price`,
-- `peak_at` and `peak_gain_pct` are `generated always as … stored`: the
-- database answers it, once, from facts that cannot disagree with each other.
--
-- This is the specific bug the owner asked to design out. The History commit's
-- own header records it: a short row showing "+2.2%" as the result beside
-- "+7.4%" as the peak is two numbers in opposite frames and the reader has no
-- way to catch it. If the percentage were computed in the serialiser AND in the
-- tracker AND in a test fixture, those are three chances to negate it wrongly.
-- Computed in the schema, there is one, and it is readable in `\d setups`.
--
-- The same reasoning is already in this database: `community_calls.scoreable`
-- (0038) and `alerts.tab` (round 4) are both generated columns holding a
-- derived fact that must never drift from the columns under it.
--
-- =====================================================================
-- WHY A PRICE AND A PERCENTAGE ARE BOTH STORED
-- =====================================================================
-- They answer different questions and the owner asked for both. "$27.91" is
-- what a member would have seen on their screen; "+18.4%" is what it was worth.
-- The percentage is derived from the price and the call price, so it is stored
-- as a generated column rather than written — same argument as above, and it
-- means the History payload can never round it one way while a leaderboard
-- rounds it another.
--
-- =====================================================================
-- BASIS: A DAILY-BAR PEAK IS NOT A TICK-LEVEL FACT
-- =====================================================================
-- Rows that were already running when this landed have a past nobody watched.
-- That past can only be reconstructed from DAILY BARS, whose high is a real
-- high but is dated to a session rather than to a minute. A live pass, by
-- contrast, sees the running session high within five minutes of it happening.
-- Those are different qualities of evidence and the row says which one it
-- holds: `high_basis` / `low_basis` is 'daily_bar' or 'session', recording how
-- THE CURRENT VALUE was obtained. Because an extreme is only ever replaced when
-- it is beaten, the basis of the value is always the basis of the observation
-- that set it — it stays true without any extra bookkeeping.
--
-- `tracking_seeded_at` separately records that a backfill happened at all, so a
-- row that has only ever been watched live is distinguishable from one whose
-- history was reconstructed.
--
-- AND THE BARS MUST BE UNADJUSTED. A split once minted a fake 15x in this
-- house. Polygon's `adjusted=true` restates old prices in today's share terms,
-- which is right for a chart and catastrophic for "what was the best price this
-- call ever saw" — the call was made in the old share terms. The seeding code
-- passes `adjusted=false` and the resolver's docs say so out loud.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   setups           UNCHANGED. `setups_read` (SELECT, authenticated, true)
--                    from 0005 stays exactly as it is. The new columns become
--                    readable by signed-in clients, which is the POINT — the
--                    History card renders them — and no client gains any write
--                    it did not have. Nothing here grants INSERT/UPDATE/DELETE.
--   community_calls  UNCHANGED. RLS on, ZERO policies, service role only, as
--                    0038 §6 left it and 0040 §4c re-asserted. Columns added to
--                    a table nobody can read do not make it readable.
--
-- There is no `using (true)` added by this file and no new grant to anyone.
-- Both postures are asserted in §8 rather than believed.

-- =====================================================================
-- 1. THE PRICE THE CALL WAS MADE AT — the anchor every percentage needs
-- =====================================================================
-- `quote_snapshot->>'price'` already holds this on every setup the scanner has
-- ever written, but reading a percentage out of a jsonb blob on every request
-- is how the blob's shape becomes load-bearing. It is stamped into a column
-- once, here, and the generated percentage below depends on the column.
--
-- Nullable on purpose: a setup whose snapshot carried no price cannot have a
-- percentage, and a zero there would be a fabricated anchor that makes every
-- peak look infinite.
alter table setups
  add column if not exists call_price numeric;

update setups
   set call_price = nullif(quote_snapshot->>'price', '')::numeric
 where call_price is null
   and quote_snapshot ? 'price'
   and nullif(quote_snapshot->>'price', '') is not null;

comment on column setups.call_price is
  'The price this was called at, stamped from quote_snapshot->>price so the '
  'peak percentage does not depend on the shape of a jsonb blob. Null where no '
  'price was recorded — an absent anchor makes an absent percentage, not a zero.';

-- =====================================================================
-- 2. THE TWO RAW EXTREMES — the only thing the tracker actually writes
-- =====================================================================
-- No direction in here, no opinion, no frame. The highest print seen while the
-- call was active and the lowest one, each with the instant it was observed and
-- the quality of the evidence behind it.
alter table setups
  add column if not exists high_price     numeric,
  add column if not exists high_at        timestamptz,
  add column if not exists high_basis     text,
  add column if not exists low_price      numeric,
  add column if not exists low_at         timestamptz,
  add column if not exists low_basis      text,
  add column if not exists last_tracked_at    timestamptz,
  add column if not exists tracking_seeded_at timestamptz;

-- 'session'   — seen by a live pass off the running session aggregate; good to
--               about five minutes, which is the pass interval.
-- 'daily_bar' — reconstructed from an UNADJUSTED daily bar; a true high, dated
--               to a session rather than to a minute.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'setups_high_basis_check'
  ) then
    alter table setups add constraint setups_high_basis_check
      check (high_basis is null or high_basis in ('session', 'daily_bar'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'setups_low_basis_check'
  ) then
    alter table setups add constraint setups_low_basis_check
      check (low_basis is null or low_basis in ('session', 'daily_bar'));
  end if;
end $$;

comment on column setups.high_price is
  'Highest price seen while this call was active. Raw and direction-free: on a '
  'short this is the WORST it got, not the best. Never regressed.';
comment on column setups.low_price is
  'Lowest price seen while this call was active. Raw and direction-free.';
comment on column setups.high_basis is
  'How the current high was obtained: session (a live pass, good to ~5 minutes) '
  'or daily_bar (reconstructed from an unadjusted daily bar, dated to a session). '
  'Always describes the observation that SET the value, because a value is only '
  'replaced when it is beaten.';
comment on column setups.last_tracked_at is
  'When a pass last looked at this row. Written whether or not anything moved, '
  'so a row the tracker can never price shows up as stale rather than healthy — '
  'the same reasoning as community_calls.last_checked_at in 0038 §4.';
comment on column setups.tracking_seeded_at is
  'When this row had its pre-tracking history reconstructed from daily bars, or '
  'null if it has only ever been watched live.';

-- =====================================================================
-- 3. THE FAVOURABLE PEAK — asked once, by the database
-- =====================================================================
-- A short is `sell_short` / `buy_to_cover`; everything else is long. The peak
-- of a short is the LOW, and its gain is positive when the price fell. Written
-- here once so that no serialiser, tracker or fixture ever gets a chance to
-- negate it differently.
alter table setups
  add column if not exists peak_price numeric
    generated always as (
      case
        when intent in ('sell_short'::position_effect, 'buy_to_cover'::position_effect)
          then low_price
        else high_price
      end
    ) stored;

alter table setups
  add column if not exists peak_at timestamptz
    generated always as (
      case
        when intent in ('sell_short'::position_effect, 'buy_to_cover'::position_effect)
          then low_at
        else high_at
      end
    ) stored;

-- Signed so that a favourable move is POSITIVE in both directions. Null rather
-- than zero wherever the anchor is missing or nonsensical: a call with no
-- recorded call price has no percentage, and saying 0.00% would be inventing
-- one. Two decimals — the History card renders one, and rounding twice from a
-- stored two is stable, where rounding from a stored one is not.
alter table setups
  add column if not exists peak_gain_pct numeric
    generated always as (
      case
        when call_price is null or call_price <= 0 then null::numeric
        when intent in ('sell_short'::position_effect, 'buy_to_cover'::position_effect)
          then case when low_price is null then null::numeric
                    else round((call_price - low_price) / call_price * 100, 2) end
        else case when high_price is null then null::numeric
                  else round((high_price - call_price) / call_price * 100, 2) end
      end
    ) stored;

comment on column setups.peak_price is
  'The best price this call ever saw, in its own direction — the high on a long, '
  'the low on a short. Generated, never written, so the frame cannot drift from '
  'the raw extremes underneath it.';
comment on column setups.peak_gain_pct is
  'What the peak was worth against the call price, signed positive for a '
  'favourable move in either direction. Generated from call_price and the raw '
  'extreme so one rounding exists rather than three.';

-- =====================================================================
-- 4. HOW IT ENDED — the fact that closes the tracking window
-- =====================================================================
-- `state` is NOT this. `setup_state` is the scanner's lifecycle and the scanner
-- owns it; it says 'expired' both for a call that ran its course and for one
-- that was never worth showing. This says what ENDED the trade, which is the
-- thing the History line has to name in one word, and it is written only by the
-- tracker.
--
-- Deliberately NOT NULL-constrained and deliberately not defaulted: a row with
-- no resolution kind is a row that is still running, and that is the state most
-- rows are in most of the time.
alter table setups
  add column if not exists resolution_kind  text,
  add column if not exists resolution_price numeric,
  add column if not exists resolved_at      timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'setups_resolution_kind_check'
  ) then
    alter table setups add constraint setups_resolution_kind_check
      check (resolution_kind is null or resolution_kind in
        ('stop_met', 'target_met', 'contract_expired', 'expired'));
  end if;
end $$;

comment on column setups.resolution_kind is
  'What ended the active period: stop_met, target_met, contract_expired (the '
  'only ending a day-trade option call has) or expired (nothing was reached and '
  'the row ran out of time — an ending, not a result). Null while still running. '
  'Separate from `state`, which is the scanner lifecycle and not ours to move.';
comment on column setups.resolution_price is
  'The price that ended it. Null on an `expired` row, where no level was reached '
  'and there is no such price — absent rather than a last close pretending to be one.';

-- =====================================================================
-- 5. THE CONTRACT LANE — a day trade's own ending
-- =====================================================================
-- The UOA ingest names a contract: strike, expiry, side and what it cost, in
-- `score_components.recommended_options`. That blob is written by the engine
-- and the app does not edit it, so the app's own measurements about that
-- contract live in columns of its own.
--
-- `contract_ticker` is the Polygon option ticker — `O:MRNA260821C00120000` —
-- assembled by the app from the underlying, the expiry and the strike the
-- ingest already carries. It is stored rather than rebuilt on every pass so
-- that a contract we have priced once is never re-derived into a different
-- string by a change in the assembling code.
alter table setups
  add column if not exists contract_ticker       text,
  add column if not exists contract_cost         numeric,
  add column if not exists contract_expiry       date,
  add column if not exists contract_peak         numeric,
  add column if not exists contract_peak_at      timestamptz,
  add column if not exists contract_expiry_value numeric,
  add column if not exists contract_graded_at    timestamptz,
  add column if not exists contract_basis        text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'setups_contract_basis_check'
  ) then
    alter table setups add constraint setups_contract_basis_check
      check (contract_basis is null or contract_basis in ('session', 'daily_bar'));
  end if;
end $$;

-- What the peak was worth as a multiple of what the contract cost — the number
-- the owner reads first on a day trade, because an option that went from $5.60
-- to $58.00 is a 10.4x and no percentage says that as fast. Generated for the
-- same reason as everything else in §3.
alter table setups
  add column if not exists contract_peak_multiple numeric
    generated always as (
      case
        when contract_cost is null or contract_cost <= 0 then null::numeric
        when contract_peak is null then null::numeric
        else round(contract_peak / contract_cost, 2)
      end
    ) stored;

comment on column setups.contract_ticker is
  'Polygon option ticker for the contract this alert named, e.g. '
  'O:MRNA260821C00120000. Assembled once from the ingest''s strike/expiry/side '
  'and stored, so a priced contract is never re-derived into a different string.';
comment on column setups.contract_cost is
  'What the contract cost when the alert fired — the ask the ingest recorded. '
  'The denominator of contract_peak_multiple.';
comment on column setups.contract_peak is
  'Highest price the named contract itself reached while the call was active. '
  'An option''s own price, not the underlying''s.';
comment on column setups.contract_expiry_value is
  'What the contract was worth at expiry: its closing price on the expiry '
  'session, which for a held option is what it settled to. Null until the '
  'expiry has actually passed and been graded — absent, not zero.';
comment on column setups.contract_peak_multiple is
  'contract_peak / contract_cost. A 5.60 contract that reached 58.00 is 10.36.';

-- =====================================================================
-- 6. THE SAME MEMORY ON A MEMBER'S CALL
-- =====================================================================
-- `community_calls` already carries the ending — `status` is exactly the
-- resolution kind for this table (open → target | stop | expired | withdrawn),
-- with `resolved_at` and `resolved_price` beside it since 0038. So it needs no
-- §4 of its own; duplicating the ending here would create the second source of
-- truth that 0040's header spends a section warning about.
--
-- What it does not have is the peak, and a member's call deserves the same
-- record as the house's. Same column names, same meanings, same generated
-- derivation — so one tracker writes both tables through one code path.
alter table community_calls
  add column if not exists high_price  numeric,
  add column if not exists high_at     timestamptz,
  add column if not exists high_basis  text,
  add column if not exists low_price   numeric,
  add column if not exists low_at      timestamptz,
  add column if not exists low_basis   text,
  add column if not exists tracking_seeded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_calls_high_basis_check'
  ) then
    alter table community_calls add constraint community_calls_high_basis_check
      check (high_basis is null or high_basis in ('session', 'daily_bar'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'community_calls_low_basis_check'
  ) then
    alter table community_calls add constraint community_calls_low_basis_check
      check (low_basis is null or low_basis in ('session', 'daily_bar'));
  end if;
end $$;

-- `direction` here is plain text ('long' | 'short'), and `entry` is the call
-- price — the anchor `setups.call_price` had to be added for.
alter table community_calls
  add column if not exists peak_price numeric
    generated always as (
      case when direction = 'short' then low_price else high_price end
    ) stored;

alter table community_calls
  add column if not exists peak_at timestamptz
    generated always as (
      case when direction = 'short' then low_at else high_at end
    ) stored;

alter table community_calls
  add column if not exists peak_gain_pct numeric
    generated always as (
      case
        when entry is null or entry <= 0 then null::numeric
        when direction = 'short'
          then case when low_price is null then null::numeric
                    else round((entry - low_price) / entry * 100, 2) end
        else case when high_price is null then null::numeric
                  else round((high_price - entry) / entry * 100, 2) end
      end
    ) stored;

comment on column community_calls.peak_price is
  'The best price this member''s call ever saw, in its own direction. Generated '
  'from the raw extremes and `direction`, exactly as setups.peak_price is.';
comment on column community_calls.peak_gain_pct is
  'What that peak was worth against `entry`, signed positive for a favourable '
  'move in either direction.';

-- =====================================================================
-- 7. THE READS THIS EXISTS TO SERVE
-- =====================================================================

-- The tracker's own sweep: everything still running, oldest look first, so a
-- backlog drains rather than starving the same rows forever. Deliberately the
-- same shape as `community_calls_open_idx` from 0038, which serves the same
-- query for the other table.
create index if not exists setups_tracking_idx
  on setups (last_tracked_at nulls first)
  where state = 'ready' and resolution_kind is null;

-- Contracts waiting to be graded. A separate lane on purpose: a day trade's
-- stock side is finished at the closing bell, but its CONTRACT is not finished
-- until its expiry, which is days later and long after `state` left 'ready'.
-- Keyed on `contract_graded_at` rather than on `contract_expiry_value`,
-- because a thin contract that did not trade on its expiry day legitimately
-- ends with a NULL value. Keying the "still to do" list on the value would put
-- that row back in the queue on every pass, for ever.
create index if not exists setups_contract_grading_idx
  on setups (contract_expiry)
  where contract_ticker is not null and contract_graded_at is null;

-- =====================================================================
-- 8. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) THE GENERATED COLUMNS ARE ACTUALLY GENERATED. This is the whole design.
--     If somebody later drops and re-adds one of these as a plain writable
--     column "so the tracker can set it", the direction frame goes back to
--     being three people's opinion, and nothing else here would notice.
do $$
declare r record;
begin
  for r in
    select t.tbl, t.col
      from (values
        ('setups', 'peak_price'), ('setups', 'peak_at'), ('setups', 'peak_gain_pct'),
        ('setups', 'contract_peak_multiple'),
        ('community_calls', 'peak_price'), ('community_calls', 'peak_at'),
        ('community_calls', 'peak_gain_pct')
      ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      raise exception '0041: %.% is missing.', r.tbl, r.col;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tbl and column_name = r.col
         and is_generated = 'ALWAYS'
    ) then
      raise exception
        '0041: %.% exists but is not GENERATED. The direction frame must be the database''s answer, not a writer''s.',
        r.tbl, r.col;
    end if;
  end loop;
end $$;

-- (b) THE FRAME IS ACTUALLY RIGHT, checked with arithmetic rather than by
--     reading the CASE above. A short called at 100 that fell to 90 is a
--     +10% peak whose peak PRICE is the low; a long called at 100 that rose
--     to 110 is the mirror. This is the single most important behaviour in the
--     file and it is worth two throwaway rows to prove it.
do $$
declare
  v_long_peak numeric; v_long_pct numeric;
  v_short_peak numeric; v_short_pct numeric;
  v_sym text;
begin
  select symbol into v_sym from instruments limit 1;
  if v_sym is null then
    raise notice '0041: no instruments to test the frame against; skipping (b).';
    return;
  end if;

  insert into setups (id, symbol, mode, intent, state, quote_snapshot,
                      call_price, high_price, low_price)
  values ('00000000-0000-4000-8000-000000000041', v_sym, 'swing', 'buy_to_open',
          'discovered', '{}'::jsonb, 100, 110, 95),
         ('00000000-0000-4000-8000-000000000042', v_sym, 'swing', 'sell_short',
          'discovered', '{}'::jsonb, 100, 110, 90);

  select peak_price, peak_gain_pct into v_long_peak, v_long_pct
    from setups where id = '00000000-0000-4000-8000-000000000041';
  select peak_price, peak_gain_pct into v_short_peak, v_short_pct
    from setups where id = '00000000-0000-4000-8000-000000000042';

  delete from setups where id in ('00000000-0000-4000-8000-000000000041',
                                  '00000000-0000-4000-8000-000000000042');

  if v_long_peak <> 110 or v_long_pct <> 10.00 then
    raise exception
      '0041: a long called at 100 that reached 110 must read peak price 110 and gain 10.00; the row says price % and gain %.',
      v_long_peak, v_long_pct;
  end if;
  if v_short_peak <> 90 or v_short_pct <> 10.00 then
    raise exception
      '0041: a short called at 100 that fell to 90 must read peak price 90 and gain 10.00; the row says price % and gain %. The frame is inverted.',
      v_short_peak, v_short_pct;
  end if;
end $$;

-- (c) THE ENDINGS ARE CONSTRAINED TO THE FOUR THAT EXIST. A fifth spelling —
--     'stop', 'stopped', 'hit_stop' — written by a careless update is how the
--     History line starts saying nothing for some rows.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'setups_resolution_kind_check') then
    raise exception '0041: setups.resolution_kind has no check constraint.';
  end if;
  begin
    insert into setups (id, symbol, mode, intent, state, quote_snapshot, resolution_kind)
    select '00000000-0000-4000-8000-000000000043', symbol, 'swing', 'buy_to_open',
           'discovered', '{}'::jsonb, 'stopped'
      from instruments limit 1;
    delete from setups where id = '00000000-0000-4000-8000-000000000043';
    raise exception '0041: setups accepted resolution_kind = ''stopped''. The check constraint is not doing its job.';
  exception
    when check_violation then null;
  end;
end $$;

-- (d) NOBODY WIDENED A POSTURE WHILE ADDING COLUMNS. `setups` keeps its one
--     read policy and gains no write; `community_calls` keeps zero policies.
--     Adding columns is a common place for somebody to "just add a write policy
--     so the tracker can update from the client", and the tracker is service
--     role and does not need one.
do $$
declare v_setups_policies int; v_calls_policies int; v_bad text;
begin
  select count(*) into v_setups_policies
    from pg_policies where schemaname = 'public' and tablename = 'setups';
  if v_setups_policies <> 1 then
    raise exception '0041: setups has % policies, expected exactly 1 (setups_read).', v_setups_policies;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'setups' and policyname = 'setups_read' and cmd = 'SELECT'
  ) then
    raise exception '0041: setups_read is missing or is no longer a SELECT policy.';
  end if;

  select count(*) into v_calls_policies
    from pg_policies where schemaname = 'public' and tablename = 'community_calls';
  if v_calls_policies > 0 then
    raise exception '0041: % policy(ies) appeared on community_calls. It is service-role only (0038 §6).', v_calls_policies;
  end if;

  select string_agg(distinct format('%s(%s)', g.table_name, g.grantee), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and g.table_name in ('setups', 'community_calls');
  if v_bad is not null then
    raise exception '0041: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (e) THE ANCHOR ACTUALLY LANDED ON THE ROWS THAT HAVE ONE. Not "every row" —
--     a setup whose snapshot carried no price legitimately has none — but the
--     backfill must not have silently matched nothing, which is what a typo in
--     the jsonb key would look like.
do $$
declare v_with_price int; v_anchored int;
begin
  select count(*) into v_with_price
    from setups where nullif(quote_snapshot->>'price', '') is not null;
  select count(*) into v_anchored
    from setups where call_price is not null;
  if v_with_price > 0 and v_anchored < v_with_price then
    raise exception
      '0041: % setups carry quote_snapshot->>price but only % got a call_price. The backfill missed rows.',
      v_with_price, v_anchored;
  end if;
end $$;

-- =====================================================================
-- 9. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The anchor landed:
--
--   select count(*) filter (where call_price is not null) as anchored,
--          count(*) as total from setups;
--
-- (ii) Nothing is tracked yet, which is correct until the resolver has run:
--
--   select count(*) from setups where last_tracked_at is not null;
--   -> expected: 0 immediately after applying.
--
-- (iii) After one resolver pass, the live rows have extremes and a basis:
--
--   select symbol, call_price, high_price, low_price, peak_price, peak_gain_pct,
--          high_basis, tracking_seeded_at is not null as seeded, last_tracked_at
--     from setups where state = 'ready' order by symbol;
--   -> expected: a peak_price equal to high_price on every long, a basis of
--      'daily_bar' on rows seeded from history, 'session' on ones set live.
--
-- (iv) The contract lane, once a day trade has been graded:
--
--   select symbol, contract_ticker, contract_cost, contract_peak,
--          contract_peak_multiple, contract_expiry_value, contract_basis
--     from setups where contract_ticker is not null order by contract_expiry desc;
--
-- (v) A short's frame, if one is ever live — the number that must never invert:
--
--   select symbol, intent, call_price, low_price, peak_price, peak_gain_pct
--     from setups where intent in ('sell_short', 'buy_to_cover')
--      and peak_price is not null;
--   -> expected: peak_price = low_price, and peak_gain_pct POSITIVE when the
--      low is below the call price.
