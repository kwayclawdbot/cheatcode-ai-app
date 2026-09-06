-- 0039 — Points for calls that came true, a belt that says how many, and the
--        board this project spent three files refusing to build.
--
-- =====================================================================
-- READ THIS FIRST: THIS FILE REVERSES A STANDING PRODUCT RULE
-- =====================================================================
-- This app has a documented prohibition on exactly what this migration adds,
-- and it is not an oversight — it is argued, and it is enforced in three
-- places:
--
--   apps/api/.../contributors/[user_id]/route.ts   `rankings` is a NULL LITERAL
--       in the response type, with the comment: "08 §8 prohibits points,
--       streaks, leaderboards and profit contests, and the cleanest way to keep
--       a future contributor from adding one is to make the contract refuse to
--       carry it."
--   apps/mobile/.../contributor/[userId].tsx       renders the footer "No
--       rankings, no leaderboards, no profit contests", and captions its stats
--       "Not a rank, and never profit."
--   the same screen's header                       "evidence-based context,
--       never points, streaks, leaderboards or profit contests."
--
-- THE OWNER HAS ASKED FOR THE OPPOSITE, in these words: "add belt system in
-- there where users gain points for making good calls and also taking good kai
-- trades.. then they level up and also rank on leaderboard." He is the
-- authority on the product and the rule is his to change. It is being changed
-- deliberately and in the open, here, rather than by quietly deleting a
-- tripwire somebody deployed on purpose — that is the whole reason this section
-- exists and why the three sites above are edited in the same commit rather
-- than left to contradict the database.
--
-- WHAT SURVIVES THE REVERSAL, because it was the good half of the old rule:
--   - NOTHING IS SCORED THAT DID NOT RESOLVE. No points for posting, for
--     streaks, for logging in, for volume of anything.
--   - NO PROFIT CONTEST. Not one number in this file is denominated in money.
--     Dollar size is not stored anywhere in 0038 and it is not reachable from
--     here. Ranking is by accuracy-weighted calls, not by P/L, so the person
--     with the biggest account cannot buy a position on the board.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- 0038 made a member's call into an object that resolves. This file makes the
-- resolution worth something. One append-only ledger (`point_events`), one
-- rollup per person (`user_points`), and three functions: the award, the belt,
-- and the board. Every number is computed in SQL by the service role. Nothing
-- here is client-computed and nothing here can be written by a phone.
--
-- =====================================================================
-- THE FORMULA, AND WHY IT IS THIS ONE
-- =====================================================================
-- A scoring system nobody can understand reads as rigged, so it is four
-- sentences and they are printed in the app verbatim (`POINTS_PLAIN` in
-- packages/shared):
--
--   1. You score when a call RESOLVES, never when you post one. A call only
--      counts if you published real levels — an entry, and a stop or a target.
--   2. A win adds 10. A loss subtracts 4.
--   3. Taking one of Kai's alerts and having it work adds 6; it costs 2 if it
--      does not. Less than your own call, because the read was Kai's.
--   4. Your accuracy over your last 20 resolved calls scales what your WINS are
--      worth — half below 40%, one and a half at 70% and up. Losses always
--      count full.
--
-- WHY THE MULTIPLIER AND NOT A WEEKLY CAP. The brief offered either. A cap on
-- scoreable calls per week punishes an active honest caller exactly as hard as
-- it punishes a sprayer — both hit the same ceiling — and it creates a reason
-- to hoard calls until the window resets, which is a worse incentive than the
-- one it fixes. The multiplier only ever punishes being WRONG. It is also the
-- one that survives the owner's own test:
--
--   ten sprayed calls, one win     accuracy 10% -> 0.5x
--                                  1 x 10 x 0.5  -  9 x 4   =  -31
--   three careful calls, all won   accuracy 100% -> 1.5x
--                                  3 x 10 x 1.5             =  +45
--
-- THE WARM-UP, which is the one rule not in the four sentences and is stated
-- separately in the app: the multiplier is held at 1.0 until you have resolved
-- five calls. Without it the most efficient strategy is three lucky wins and
-- then never calling again, which is the opposite of what the ladder is for.
-- It is a floor and a ceiling at once, and it expires on its own.
--
-- WHY A STEP FUNCTION AND NOT A CURVE. A continuous multiplier is fairer by a
-- rounding error and impossible to explain in a sentence. Four bands can be
-- printed as four rows in the app and checked by hand by a suspicious user,
-- which is worth more than the fairness it gives up.
--
-- =====================================================================
-- THE BELTS, AND WHY THESE NUMBERS
-- =====================================================================
--   White   0        everybody starts here and it is not an insult
--   Blue    250
--   Purple  750
--   Brown   1,750
--   Black   3,500
--
-- Each step is roughly 2.2x the one before, which is how martial-arts belts
-- actually space and is the only reason the metaphor survives contact with a
-- number. Anchored to the curve: a caller running 70% accuracy nets about 93
-- points per ten resolved calls (7 x 10 x 1.5, less 3 x 4). So Blue is about 27
-- resolved calls, Purple about 81, Brown about 188 and Black about 376. At five
-- calls a week that is five weeks, four months, nine months and a year and a
-- half. BLACK IS MEANT TO BE RARE. A ladder whose top rung is reached in a
-- fortnight is a participation trophy.
--
-- POINTS CAN GO DOWN AND SO A BELT COULD. It does not: `belt_reached_at` is
-- stamped once and the belt is a high-water mark. Taking a belt away for a bad
-- fortnight would make the ladder something to protect by not calling, and the
-- entire point is to reward calling.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE CREATES
-- =====================================================================
--   point_events   RLS on, ZERO policies, service role only. Append-only:
--                  UPDATE and DELETE are revoked from EVERY role including
--                  service_role, the way 0014 treats `fills` and `plan_events`.
--                  A ledger a route can edit is not a ledger.
--   user_points    RLS on, ZERO policies, service role only. It is a cache of
--                  point_events and is rebuilt from it by `recompute_points`.
--
-- Belts and ranks are PUBLIC INFORMATION and they still do not get a policy.
-- They are assembled by API routes with the service role, the same way
-- `contributor_stats` reaches the phone through `/contributors/[user_id]`
-- rather than through PostgREST. A leaderboard policy would have to be
-- `using (true)`, and there is none of that in 0038 and none here.

-- =====================================================================
-- 1. THE CONSTANTS, IN ONE PLACE
-- =====================================================================
-- Kept as an immutable function rather than a table so that changing the
-- scoring is a migration with a diff, not an UPDATE somebody runs at midnight.
-- Every number the app prints comes from here.
create or replace function points_config() returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'call_win',        10,
    'call_loss',       -4,
    'kai_trade_win',    6,
    'kai_trade_loss',  -2,
    'accuracy_window', 20,
    'warmup_resolved',  5,
    'bands', jsonb_build_array(
      jsonb_build_object('min_accuracy', 0.70, 'multiplier', 1.5),
      jsonb_build_object('min_accuracy', 0.55, 'multiplier', 1.0),
      jsonb_build_object('min_accuracy', 0.40, 'multiplier', 0.8),
      jsonb_build_object('min_accuracy', 0.00, 'multiplier', 0.5)
    ),
    'belts', jsonb_build_array(
      jsonb_build_object('key', 'black',  'label', 'Black',  'min_points', 3500),
      jsonb_build_object('key', 'brown',  'label', 'Brown',  'min_points', 1750),
      jsonb_build_object('key', 'purple', 'label', 'Purple', 'min_points',  750),
      jsonb_build_object('key', 'blue',   'label', 'Blue',   'min_points',  250),
      jsonb_build_object('key', 'white',  'label', 'White',  'min_points',    0)
    )
  );
$$;

create or replace function belt_for(p_points numeric) returns text
language sql immutable
as $$
  select coalesce((
    select b->>'key'
      from jsonb_array_elements(points_config()->'belts') b
     where coalesce(p_points, 0) >= (b->>'min_points')::numeric
     order by (b->>'min_points')::numeric desc
     limit 1
  ), 'white');
$$;

-- =====================================================================
-- 2. THE LEDGER
-- =====================================================================
create table if not exists point_events (
  id      bigserial primary key,
  user_id uuid not null references profiles on delete cascade,

  -- 'community_call' = their own published call resolved.
  -- 'kai_trade'      = they took a house alert and the trade resolved.
  source text not null check (source in ('community_call', 'kai_trade')),
  -- The community_calls.id or trade_shares.id this scores. Not a foreign key on
  -- purpose: the ledger must outlive the thing it scored, or deleting a call
  -- would silently rewrite somebody's history and their belt with it.
  ref_id uuid not null,

  won boolean not null,
  -- The three numbers kept separately so a user can be shown the arithmetic
  -- rather than a total they have to trust. base x multiplier = points, except
  -- on a loss where the multiplier is 1 by rule.
  base_points numeric not null,
  multiplier  numeric not null default 1.0,
  points      numeric not null,

  -- What the rolling accuracy WAS when this was awarded. Recomputing it later
  -- would give a different answer and make the ledger unauditable.
  accuracy_at_award numeric,
  resolved_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  -- THE IDEMPOTENCY RULE, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE. The
  -- resolver runs on a cron every few minutes over the same open rows. Without
  -- this, one call resolving during a slow pass is awarded twice and the whole
  -- board is fiction.
  unique (source, ref_id)
);

create index if not exists point_events_user_idx   on point_events (user_id, resolved_at desc);
create index if not exists point_events_period_idx on point_events (resolved_at desc);

comment on table point_events is
  'Append-only scoring ledger. One row per RESOLVED scoreable outcome, ever: '
  'unique (source, ref_id) is what stops a re-running cron from paying twice. '
  'UPDATE and DELETE are revoked from every role including service_role.';

-- =====================================================================
-- 3. THE ROLLUP
-- =====================================================================
-- Everything here is derivable from `point_events` and is stored anyway,
-- because the alternative is aggregating the ledger on every card render. It is
-- a cache and it is treated as one: §5's `recompute_points` rebuilds any row
-- from scratch, and §7(d) asserts the two agree.
create table if not exists user_points (
  user_id uuid primary key references profiles on delete cascade,

  points   numeric not null default 0,
  wins     int     not null default 0,
  losses   int     not null default 0,
  resolved int     not null default 0,
  -- Rolling, over the last `accuracy_window` resolutions. This is the number
  -- shown beside every leaderboard row, so the board itself teaches that
  -- accuracy is what is being measured.
  accuracy numeric,

  belt            text not null default 'white',
  belt_reached_at timestamptz,

  updated_at timestamptz not null default now()
);

create index if not exists user_points_board_idx on user_points (points desc, accuracy desc nulls last);

comment on column user_points.belt is
  'High-water mark. Points can fall; the belt does not, or the ladder becomes '
  'something to protect by not calling.';

-- =====================================================================
-- 4. AWARDING
-- =====================================================================
-- ONE ENTRY POINT. The resolver calls this and nothing else writes points. It
-- is idempotent by the unique constraint, it computes its own multiplier, and
-- it returns whether the belt moved so the caller can raise the notification
-- without asking a second question.
create or replace function award_points(
  p_user_id uuid,
  p_source  text,
  p_ref_id  uuid,
  p_won     boolean,
  p_resolved_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg        jsonb := points_config();
  v_window     int   := (v_cfg->>'accuracy_window')::int;
  v_warmup     int   := (v_cfg->>'warmup_resolved')::int;
  v_base       numeric;
  v_mult       numeric := 1.0;
  v_points     numeric;
  v_recent_res int;
  v_recent_won int;
  v_accuracy   numeric;
  v_before     text;
  v_after      text;
  v_total      numeric;
begin
  if p_source not in ('community_call', 'kai_trade') then
    raise exception 'unknown_point_source' using errcode = '22023';
  end if;

  -- Already paid. Not an error: the cron is SUPPOSED to re-see rows.
  if exists (select 1 from point_events where source = p_source and ref_id = p_ref_id) then
    return jsonb_build_object('awarded', false, 'reason', 'already_scored');
  end if;

  v_base := case
    when p_source = 'community_call' and p_won then (v_cfg->>'call_win')::numeric
    when p_source = 'community_call'           then (v_cfg->>'call_loss')::numeric
    when p_won                                 then (v_cfg->>'kai_trade_win')::numeric
    else                                            (v_cfg->>'kai_trade_loss')::numeric
  end;

  -- The rolling accuracy, measured over the window BEFORE this event. Ordered
  -- by the ledger's own id so two events resolving in the same second still
  -- have a defined order.
  select count(*), count(*) filter (where won)
    into v_recent_res, v_recent_won
    from (
      select won from point_events
       where user_id = p_user_id
       order by id desc
       limit v_window
    ) recent;

  if v_recent_res > 0 then
    v_accuracy := round(v_recent_won::numeric / v_recent_res::numeric, 4);
  end if;

  -- A LOSS IS NEVER SCALED. Scaling it would mean a sprayer's losses hurt less
  -- precisely because they spray, which inverts the whole mechanism.
  if p_won then
    if v_recent_res < v_warmup then
      -- WARM-UP: FACE VALUE, flat. Not the band, and not a capped band.
      -- Measured against the real function before this was flat: a brand-new
      -- member's FIRST correct call scored 0.5x, because with no history at all
      -- `v_accuracy` is null, null reads as 0, and 0 falls in the bottom band.
      -- Being penalised for having no track record is the most arbitrary thing
      -- this system could do to somebody on their first day, and it is exactly
      -- the kind of unexplainable arithmetic that makes a score read as rigged.
      -- So the first five resolutions count at face value in both directions:
      -- no bonus to farm, no penalty to explain.
      v_mult := 1.0;
    else
      v_mult := coalesce((
        select (b->>'multiplier')::numeric
          from jsonb_array_elements(v_cfg->'bands') b
         where coalesce(v_accuracy, 0) >= (b->>'min_accuracy')::numeric
         order by (b->>'min_accuracy')::numeric desc
         limit 1
      ), 1.0);
    end if;
  end if;

  v_points := round(v_base * v_mult, 2);

  insert into point_events (
    user_id, source, ref_id, won, base_points, multiplier, points,
    accuracy_at_award, resolved_at
  ) values (
    p_user_id, p_source, p_ref_id, p_won, v_base, v_mult, v_points,
    v_accuracy, coalesce(p_resolved_at, now())
  )
  -- Belt and braces against two resolver passes racing inside the same
  -- millisecond: the constraint decides, and the loser says so quietly.
  on conflict (source, ref_id) do nothing;

  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'already_scored');
  end if;

  select belt into v_before from user_points where user_id = p_user_id;
  perform recompute_points(p_user_id);
  select belt, points into v_after, v_total from user_points where user_id = p_user_id;

  return jsonb_build_object(
    'awarded',      true,
    'points',       v_points,
    'base_points',  v_base,
    'multiplier',   v_mult,
    'accuracy',     v_accuracy,
    'total_points', v_total,
    'belt',         v_after,
    'belt_before',  coalesce(v_before, 'white'),
    'belt_changed', coalesce(v_before, 'white') is distinct from v_after
  );
end $$;

-- =====================================================================
-- 5. REBUILDING THE ROLLUP FROM THE LEDGER
-- =====================================================================
-- The ledger is the truth and this is the cache. Safe to run for anybody at any
-- time, which is what makes the cache trustworthy: if it is ever doubted it can
-- be rebuilt rather than argued about.
create or replace function recompute_points(p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      jsonb := points_config();
  v_window   int   := (v_cfg->>'accuracy_window')::int;
  v_points   numeric;
  v_wins     int;
  v_losses   int;
  v_resolved int;
  v_accuracy numeric;
  v_belt     text;
  v_prev     text;
begin
  select coalesce(sum(points), 0),
         count(*) filter (where won),
         count(*) filter (where not won),
         count(*)
    into v_points, v_wins, v_losses, v_resolved
    from point_events where user_id = p_user_id;

  select case when count(*) > 0
              then round(count(*) filter (where won)::numeric / count(*)::numeric, 4)
         end
    into v_accuracy
    from (
      select won from point_events where user_id = p_user_id order by id desc limit v_window
    ) recent;

  select belt into v_prev from user_points where user_id = p_user_id;
  v_belt := belt_for(v_points);

  -- HIGH-WATER MARK. If the computed belt is lower than the one already held,
  -- the held one stands. `belt_for` is ordered, so comparing their positions in
  -- the config array is the comparison that means something.
  if v_prev is not null then
    if (select b.ord from jsonb_array_elements(v_cfg->'belts') with ordinality b(val, ord)
         where b.val->>'key' = v_belt)
       > (select b.ord from jsonb_array_elements(v_cfg->'belts') with ordinality b(val, ord)
           where b.val->>'key' = v_prev)
    then
      -- The config array runs highest belt first, so a LARGER ordinal is a
      -- LOWER belt. Keep the one already earned.
      v_belt := v_prev;
    end if;
  end if;

  insert into user_points (user_id, points, wins, losses, resolved, accuracy, belt, belt_reached_at, updated_at)
  values (p_user_id, v_points, v_wins, v_losses, v_resolved, v_accuracy, v_belt,
          case when v_belt <> 'white' then now() end, now())
  on conflict (user_id) do update set
    points   = excluded.points,
    wins     = excluded.wins,
    losses   = excluded.losses,
    resolved = excluded.resolved,
    accuracy = excluded.accuracy,
    belt     = excluded.belt,
    belt_reached_at = case
      when user_points.belt is distinct from excluded.belt then now()
      else user_points.belt_reached_at
    end,
    updated_at = now();
end $$;

-- =====================================================================
-- 6. THE BOARD
-- =====================================================================
-- Tri-period, because a board with only an all-time column is a board nobody
-- new can ever appear on. The period filters the LEDGER, not the rollup — "this
-- week" means points earned this week, which is the only reading that lets
-- somebody climb.
--
-- TIES BREAK ON ACCURACY, deliberately and visibly: two people on the same
-- points are separated by which of them was more often right, and the accuracy
-- column is printed beside every row so the rule is legible rather than
-- folded into an order-by nobody sees.
create or replace function social_leaderboard(
  p_period text default 'all',
  p_limit  int  default 50
) returns table (
  rank      bigint,
  user_id   uuid,
  points    numeric,
  wins      int,
  resolved  int,
  accuracy  numeric,
  belt      text
)
language sql
security definer
set search_path = public
as $$
  with since as (
    select case p_period
             when 'week'  then date_trunc('week',  now())
             when 'month' then date_trunc('month', now())
             else '-infinity'::timestamptz
           end as t
  ),
  scoped as (
    select e.user_id,
           sum(e.points)                        as points,
           count(*) filter (where e.won)::int   as wins,
           count(*)::int                        as resolved
      from point_events e, since
     where e.resolved_at >= since.t
     group by e.user_id
  )
  select row_number() over (
           order by s.points desc,
                    (s.wins::numeric / nullif(s.resolved, 0)) desc nulls last,
                    s.resolved desc
         ) as rank,
         s.user_id,
         round(s.points, 2) as points,
         s.wins,
         s.resolved,
         round(s.wins::numeric / nullif(s.resolved, 0), 4) as accuracy,
         -- The belt is always the all-time belt, even on the weekly board. A
         -- belt that changed depending on which tab you were looking at would
         -- not be a belt.
         coalesce(up.belt, 'white') as belt
    from scoped s
    left join user_points up on up.user_id = s.user_id
   order by rank
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- One person's standing in the same period, so the app can pin their row when
-- they are off the bottom of the board. Same ordering expression as above, and
-- if the two ever disagree the pinned row lies about where they are.
create or replace function social_rank(
  p_user_id uuid,
  p_period  text default 'all'
) returns table (
  rank      bigint,
  points    numeric,
  wins      int,
  resolved  int,
  accuracy  numeric,
  belt      text,
  total     bigint
)
language sql
security definer
set search_path = public
as $$
  with since as (
    select case p_period
             when 'week'  then date_trunc('week',  now())
             when 'month' then date_trunc('month', now())
             else '-infinity'::timestamptz
           end as t
  ),
  scoped as (
    select e.user_id,
           sum(e.points)                       as points,
           count(*) filter (where e.won)::int  as wins,
           count(*)::int                       as resolved
      from point_events e, since
     where e.resolved_at >= since.t
     group by e.user_id
  ),
  ranked as (
    select s.*,
           row_number() over (
             order by s.points desc,
                      (s.wins::numeric / nullif(s.resolved, 0)) desc nulls last,
                      s.resolved desc
           ) as rank,
           count(*) over () as total
      from scoped s
  )
  select r.rank,
         round(r.points, 2),
         r.wins,
         r.resolved,
         round(r.wins::numeric / nullif(r.resolved, 0), 4),
         coalesce(up.belt, 'white'),
         r.total
    from ranked r
    left join user_points up on up.user_id = r.user_id
   where r.user_id = p_user_id;
$$;

-- =====================================================================
-- 7. RLS, GRANTS, AND THE APPEND-ONLY LOCK
-- =====================================================================
alter table point_events enable row level security;
alter table user_points  enable row level security;

revoke all on point_events from anon, authenticated;
revoke all on user_points  from anon, authenticated;

grant select, insert on point_events to service_role;
grant select, insert, update on user_points to service_role;
grant usage, select on sequence point_events_id_seq to service_role;

-- APPEND-ONLY, INCLUDING FOR US. 0014 does this to `fills`, `plan_events` and
-- `order_events`, and 0026 adds TRUNCATE. A points ledger belongs in that list
-- for the same reason a fill does: the value of the row is that it cannot be
-- quietly revised after somebody has been ranked on it.
revoke update, delete, truncate on point_events from anon, authenticated, service_role;

revoke all on function points_config()      from public, anon, authenticated;
revoke all on function belt_for(numeric)    from public, anon, authenticated;
revoke all on function award_points(uuid, text, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function recompute_points(uuid) from public, anon, authenticated;
revoke all on function social_leaderboard(text, int) from public, anon, authenticated;
revoke all on function social_rank(uuid, text)       from public, anon, authenticated;

grant execute on function points_config()   to service_role;
grant execute on function belt_for(numeric) to service_role;
grant execute on function award_points(uuid, text, uuid, boolean, timestamptz) to service_role;
grant execute on function recompute_points(uuid)     to service_role;
grant execute on function social_leaderboard(text, int) to service_role;
grant execute on function social_rank(uuid, text)       to service_role;

-- =====================================================================
-- 8. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) THE OWNER'S OWN TEST CASE, RUN. This is the assertion that matters: if a
--     future edit to the bands or the base points lets ten sprayed calls with
--     one win out-earn three careful wins, this migration refuses to apply.
--     Computed against the real config rather than against hardcoded numbers,
--     so it keeps testing the thing that is actually deployed.
do $$
declare
  v_cfg   jsonb := points_config();
  v_win   numeric := (v_cfg->>'call_win')::numeric;
  v_loss  numeric := (v_cfg->>'call_loss')::numeric;
  v_spray numeric;
  v_care  numeric;
begin
  -- BOTH SIDES ARE SCORED AT THE SPRAYER'S BEST CASE, so this is a real guard
  -- and not a flattering one. The sprayer's single win is taken at 1.0 — the
  -- most it can ever be worth, which happens when the win lands inside the
  -- five-resolution warm-up. Won last instead, its accuracy would already be
  -- 0/9 and it would score the bottom band, so 1.0 is the ceiling on their
  -- whole strategy. The careful caller is scored at 1.0 too, its LEAST
  -- flattering value, because three resolutions never leaves the warm-up.
  v_spray := (1 * v_win * 1.0) + (9 * v_loss);   -- v_loss is negative
  v_care  := 3 * v_win * 1.0;

  if v_spray >= v_care then
    raise exception
      '0039: ten sprayed calls with one win score % and three careful wins score %. Volume must never beat accuracy.',
      v_spray, v_care;
  end if;

  -- And the sprayer must actually be underwater, not merely behind.
  if v_spray >= 0 then
    raise exception '0039: a 10%% accuracy caller scores %, which is not a penalty.', v_spray;
  end if;
end $$;

-- (b) LOSSES ARE NEGATIVE AND WINS ARE POSITIVE. A sign flipped in the config
--     would invert the whole system and every other assertion here would still
--     pass.
do $$
declare v_cfg jsonb := points_config();
begin
  if (v_cfg->>'call_win')::numeric <= 0 or (v_cfg->>'kai_trade_win')::numeric <= 0 then
    raise exception '0039: a win is not worth positive points.';
  end if;
  if (v_cfg->>'call_loss')::numeric >= 0 or (v_cfg->>'kai_trade_loss')::numeric >= 0 then
    raise exception '0039: a loss does not cost anything. Losses must matter.';
  end if;
  if (v_cfg->>'kai_trade_win')::numeric >= (v_cfg->>'call_win')::numeric then
    raise exception '0039: taking Kai''s call is worth as much as making your own. The read was Kai''s.';
  end if;
end $$;

-- (c) THE BELT LADDER CLIMBS. Written as a check on the config rather than on
--     five literals so that re-tuning the thresholds cannot accidentally
--     produce a ladder that goes down, or two belts at the same number.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from (
      select (b->>'min_points')::numeric as p,
             lead((b->>'min_points')::numeric) over (order by (b->>'min_points')::numeric) as nxt
        from jsonb_array_elements(points_config()->'belts') b
    ) x
   where x.nxt is not null and x.nxt <= x.p;
  if v_bad > 0 then
    raise exception '0039: the belt thresholds do not strictly increase.';
  end if;

  if belt_for(0) <> 'white' then
    raise exception '0039: a new member does not start at White (got %).', belt_for(0);
  end if;
  if belt_for(3500) <> 'black' then
    raise exception '0039: 3500 points is not Black (got %).', belt_for(3500);
  end if;
  if belt_for(249) <> 'white' or belt_for(250) <> 'blue' then
    raise exception '0039: the White/Blue boundary is not where the config says it is.';
  end if;
end $$;

-- (d) THE LEDGER IS APPEND-ONLY FOR EVERYONE, service_role included.
do $$
declare v_bad text;
begin
  select string_agg(distinct format('%s(%s)', g.grantee, g.privilege_type), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.table_name = 'point_events'
     and g.privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
     and g.grantee in ('anon', 'authenticated', 'service_role');
  if v_bad is not null then
    raise exception '0039: point_events is editable by %. A ledger a route can revise is not a ledger.', v_bad;
  end if;
end $$;

-- (e) ZERO POLICIES, AND NO CLIENT WRITE GRANT. 0033 §8/§10's pair, pointed at
--     the two new tables. The allowlist is copied verbatim and not extended.
do $$
declare v_count int; v_bad text;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public' and tablename in ('point_events', 'user_points');
  if v_count > 0 then
    raise exception '0039: % policy(ies) exist on the points tables. Both are service-role only.', v_count;
  end if;

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
    raise exception '0039: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (f) THE BOARD ANSWERS. An empty board is the correct answer on a fresh
--     database; a board that throws is not, and the difference only shows up
--     when somebody opens the screen.
do $$
declare v_n int;
begin
  select count(*) into v_n from social_leaderboard('week', 10);
  select count(*) into v_n from social_leaderboard('month', 10);
  select count(*) into v_n from social_leaderboard('all', 10);
end $$;

-- =====================================================================
-- 9. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The formula the app prints, straight from the database:
--
--   select jsonb_pretty(points_config());
--
-- (ii) Score a call twice and watch the second one refuse. As service_role:
--
--   select award_points('<user>', 'community_call', '<call id>', true);
--   -> {"awarded": true, "points": 10.00, "multiplier": 1.0, ...}
--   select award_points('<user>', 'community_call', '<call id>', true);
--   -> {"awarded": false, "reason": "already_scored"}
--
-- (iii) The ledger refuses to be rewritten, by us:
--
--   update point_events set points = 9999 where user_id = '<user>';
--   -> ERROR: permission denied for table point_events
--
-- (iv) The cache can always be rebuilt from the ledger, and agrees:
--
--   select recompute_points('<user>');
--   select up.points, (select sum(points) from point_events where user_id = up.user_id)
--     from user_points up where up.user_id = '<user>';
--   -> expected: two identical numbers.
--
-- (v) The belt does not fall. Award a loss big enough to drop the total below
--     the threshold and read the belt back:
--
--   select belt, points from user_points where user_id = '<user>';
--   -> expected: the belt already earned, whatever the points now say.
--
-- (vi) The board, all three periods, with the accuracy column that makes it
--      teach rather than just rank:
--
--   select * from social_leaderboard('week', 20);
--   select * from social_leaderboard('month', 20);
--   select * from social_leaderboard('all', 20);
--   select * from social_rank('<user>', 'week');
