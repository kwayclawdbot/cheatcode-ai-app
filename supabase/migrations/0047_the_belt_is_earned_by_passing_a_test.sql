-- 0047 — XP buys you the right to SIT the exam. The exam gives you the belt.
--
-- =====================================================================
-- THE OWNER'S DECISION, 8 SEPTEMBER 2026, IN HIS WORDS
-- =====================================================================
--   "merge belt system so that user gains belt xp via lessons and/or trade
--    calls but has to take and pass a test to earn the belt itself"
--
-- docs/audit-2026-09-08/BELT-MERGE-spec.md is that decision written out against
-- this schema. This file is §5, §6, §7 and §9 of it. 0046 was §3 and §4.
--
-- This reverses nothing 0039 argued for. It moves the belt one step further
-- down the chain and lets the points keep doing the job they were good at:
--
--     lessons ─┐
--              ├─► one XP ledger ─► eligibility for the next rung ─► EXAM ─► belt
--     calls   ─┘        (points)        (both halves required)       (pass)
--
-- =====================================================================
-- WHY NOT THE OBVIOUS MERGE
-- =====================================================================
-- The obvious merge is "add lesson XP to the total and keep belt_for(points)".
-- It has one failure mode and it is fatal: LESSONS BECOME A POINTS FARM. Thirty
-- lessons at 30 XP each is a Blue Belt without a single resolved call, and the
-- belt on a member's name in a room is supposed to say something about what they
-- can do in a market. The reverse is just as bad: 0039 already refused to let
-- the biggest account buy a position on the board, and it should equally refuse
-- to let a sprayer of calls skip the learning.
--
-- So: TWO HALF-BALANCES, BOTH REQUIRED, NEITHER SUBSTITUTING FOR THE OTHER —
-- and an exam on top, because the audit's warning under F12 is this file's
-- requirement statement: "If discipline is meant to earn progression, it must be
-- measured by the scoring system before the UI claims it." A test measures it.
-- A total never did.
--
-- =====================================================================
-- WHAT THIS FILE REFUSES TO DO
-- =====================================================================
--   - IT WILL NOT LET A PHONE GRADE ITSELF. `grade_belt_exam` is revoked from
--     anon and authenticated, exactly as 0039 does for `award_points`. A belt a
--     phone can grant itself is not a belt.
--   - IT WILL NOT DEMOTE ANYBODY. Every belt already held is kept and stamped
--     `belt_source = 'legacy_points'`. Losing calls lower eligibility for the
--     NEXT rung; they never take back the rung you hold (spec §7).
--   - IT WILL NOT DELETE A FAILED ATTEMPT. DELETE and TRUNCATE are revoked from
--     every role including service_role. A ladder whose failures are deleted
--     cannot be audited, and 0039 made exactly this argument about the ledger.
--   - IT WILL NOT SEED AN EXAM IT CANNOT GRADE. Blue is the only rung with a
--     blueprint. Spec §11: one rung done properly before the other three are
--     seeded. Spec §12: "If the first version of the exam has to ship without
--     [applied tasks], ship the eligibility screen and no exam at all rather
--     than an exam that grades nothing." Blue's blueprint carries four applied
--     tasks against a chart and draws two per attempt, so it ships.
--   - IT WILL NOT PUT LESSON XP ON THE LEADERBOARD. §5 below re-points the board
--     at the call half only.
--
-- =====================================================================
-- RLS POSTURE
-- =====================================================================
--   belt_exams          RLS on, ZERO policies, service role only. The blueprint
--                       column holds the ANSWER KEY. A client-readable exam
--                       table is an open-book exam.
--   belt_exam_attempts  RLS on, ZERO policies, service role only. INSERT and
--                       UPDATE for service_role because an attempt has two
--                       moments — started and submitted — and they are one row.
--                       DELETE and TRUNCATE are revoked from everybody.

-- =====================================================================
-- 1. THE CONSTANTS THE EXAM ADDS
-- =====================================================================
-- Same immutable function as 0039 §1 and 0046 §5, so every number the app
-- prints still comes from one place and changing one is a migration with a diff.
--
-- The eligibility table is spec §6. The call-points column is the EXISTING 0039
-- threshold for each rung, unchanged, so nobody's trading record is devalued by
-- this merge. Blue's row is Board 09's own copy — "Read a chart ✓ · Explain your
-- risk ✓ · Complete a clean paper plan ○" — because the product already said it
-- better than anything invented here.
--
-- `proposed: true` on Purple, Brown and Black is not decoration. Spec §6: "The
-- rungs above Blue are proposals and should be argued before they are seeded.
-- What is NOT negotiable is the shape: two halves, both required, exam on top."
-- The flag is what lets the app say that out loud instead of presenting four
-- equally-settled rungs.
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
    'training_xp', jsonb_build_object(
      'interactive', 10,
      'video',       10,
      'practice',    20,
      'assessment',  30
    ),
    -- 0047. Both tunable without a migration to the tables, per spec §5.4.
    'exam', jsonb_build_object(
      -- After a failure. Long enough that the honest response is to go and
      -- learn the thing, short enough that it is not a punishment.
      'cooldown_hours', 48,
      -- Three sittings a month, per rung. A cap, not a wall: it exists so that
      -- an applied task pool cannot be brute-forced by repetition.
      'attempts_per_30d', 3
    ),
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
    ),
    'belt_requirements', jsonb_build_array(
      jsonb_build_object(
        'key', 'blue', 'label', 'Blue', 'title', 'Foundations', 'proposed', false,
        'competencies', jsonb_build_array(
          jsonb_build_object('key', 'read_a_chart',    'label', 'Read a chart',
                             'taught_by', 'd2challenge'),
          jsonb_build_object('key', 'explain_your_risk', 'label', 'Explain your risk',
                             'taught_by', 'd4l2')
        ),
        'applied', jsonb_build_object('kind', 'clean_paper_plan', 'count', 1,
                                      'label', 'Complete a clean paper plan'),
        'calls_resolved', 3,
        'xp_calls', 250
      ),
      jsonb_build_object(
        'key', 'purple', 'label', 'Purple', 'title', 'Reading the market', 'proposed', true,
        'competencies', jsonb_build_array(
          jsonb_build_object('key', 'entries_and_exits', 'label', 'Entries and exits',
                             'taught_by', 'd4l1'),
          jsonb_build_object('key', 'position_sizing',   'label', 'Position sizing',
                             'taught_by', 'd4l4')
        ),
        'applied', jsonb_build_object('kind', 'clean_paper_plan', 'count', 5,
                                      'label', 'Five paper trades with a written plan'),
        'calls_resolved', 10,
        'xp_calls', 750
      ),
      jsonb_build_object(
        'key', 'brown', 'label', 'Brown', 'title', 'Discipline', 'proposed', true,
        'competencies', jsonb_build_array(
          jsonb_build_object('key', 'risk_discipline', 'label', 'Risk discipline',
                             'taught_by', 'd5l3'),
          jsonb_build_object('key', 'debrief_honestly', 'label', 'Debrief honestly',
                             'taught_by', 'd6journal')
        ),
        'applied', jsonb_build_object('kind', 'debrief', 'count', 3,
                                      'label', 'Three debriefs where the plan was followed'),
        'calls_resolved', 30,
        'xp_calls', 1750
      ),
      jsonb_build_object(
        'key', 'black', 'label', 'Black', 'title', 'Proven', 'proposed', true,
        'competencies', jsonb_build_array(
          jsonb_build_object('key', 'full_mastery', 'label', 'All nine mastery skills',
                             'taught_by', 'd7exam2')
        ),
        'applied', jsonb_build_object('kind', 'adherence', 'count', 20,
                                      'label', 'Sustained adherence over twenty trades'),
        'calls_resolved', 60,
        'xp_calls', 3500
      )
    )
  );
$$;

-- =====================================================================
-- 2. belt_for() STOPS BEING THE AUTHORITY ON THE BELT
-- =====================================================================
-- Spec §5: "`belt_for(points)` is not deleted. It stops being the authority on
-- the belt and becomes what it should have been all along: a helper that answers
-- 'what does this points total make you eligible for?' — renamed
-- `belt_eligible_by_points()` so no future reader mistakes it for the award."
--
-- The rename is the entire point of this section. A function called `belt_for`
-- sitting in the schema after this migration is an invitation for the next
-- person to write `update user_points set belt = belt_for(points)` and quietly
-- undo the owner's decision.
create or replace function belt_eligible_by_points(p_points numeric) returns text
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

comment on function belt_eligible_by_points(numeric) is
  'What this many CALL points makes you eligible to sit for. Not what belt you '
  'hold - that is user_points.belt, and from 0047 it moves only on a passed '
  'exam.';

-- Position on the ladder, ascending: white 0 … black 4. Every high-water
-- comparison in this file goes through it, so there is one definition of
-- "higher belt" rather than four order-bys that could disagree.
create or replace function belt_rank(p_belt text) returns int
language sql immutable
as $$
  select coalesce((
    select count(*)::int
      from jsonb_array_elements(points_config()->'belts') b
     where (b->>'min_points')::numeric <
           (select (x->>'min_points')::numeric
              from jsonb_array_elements(points_config()->'belts') x
             where x->>'key' = p_belt)
  ), 0);
$$;

-- =====================================================================
-- 3. THE EXAM TABLES
-- =====================================================================
create table if not exists belt_exams (
  belt    text not null,
  version int  not null,
  -- The mark. Stored per exam rather than in the config because a harder rung
  -- may legitimately want a different bar, and the attempt row records which
  -- version it was graded against.
  pass_pct numeric not null default 80,
  /* THE PAPER, AND THE ANSWER KEY WITH IT.
   *
   * {
   *   "series":   [ {t,o,h,l,c}, … ]   the schematic chart the applied tasks use
   *   "series_label": "…"              printed on the chart, verbatim
   *   "knowledge": [ {id, prompt, options:[{id,label}], correct_id, because} ]
   *   "applied":   [ {id, kind, …, because} ]
   *   "applied_draw": 2
   * }
   *
   * It never leaves the database whole. The route serves a PAPER with every
   * `correct_id`, `expected` and `because` stripped, and grading happens here.
   */
  blueprint jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (belt, version)
);

comment on table belt_exams is
  'One row per rung per version. blueprint holds the answer key, which is why '
  'this table has zero policies and is never read by a client.';

create table if not exists belt_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  belt text not null,
  exam_version int not null,

  started_at   timestamptz not null default now(),
  submitted_at timestamptz,

  /* THE ITEMS THIS ATTEMPT WAS ACTUALLY SHOWN, drawn when it started.
   *
   * Spec §5.3: applied tasks are drawn from a pool per attempt, so a failed
   * attempt cannot be memorised into a passed one. Storing the draw is what
   * makes grading honest — an attempt is graded against the paper the member
   * saw, never against whatever the blueprint says today.
   */
  paper jsonb not null,
  answers jsonb,

  score_pct numeric,
  passed boolean,
  -- Kept separately from the score because it is the condition that cannot be
  -- traded away: an attempt that answers every knowledge question correctly and
  -- fluffs the chart has not demonstrated the thing the belt claims.
  applied_correct int,
  applied_total   int,

  created_at timestamptz not null default now()
);

create index if not exists belt_exam_attempts_user_idx
  on belt_exam_attempts (user_id, belt, started_at desc);

comment on table belt_exam_attempts is
  'Every sitting, passed or failed, kept forever. DELETE and TRUNCATE are '
  'revoked from every role including service_role: a ladder whose failures can '
  'be tidied away cannot be audited.';

-- =====================================================================
-- 4. ELIGIBILITY — BOTH HALVES, NEITHER SUBSTITUTING FOR THE OTHER
-- =====================================================================
-- Everything the Belt Profile screen draws comes out of this one function, so
-- the ring on the screen and the gate on the exam cannot disagree.
--
-- WHAT COUNTS AS A "CLEAN PAPER PLAN". A `trade_plans` row with an entry
-- condition, a stop AND at least one target. That is the same definition 0038
-- uses for a call being `scoreable`, and it is the right one: a plan with no
-- stop could not have been wrong in any defined way, so it cannot be right in
-- one either.
create or replace function belt_eligibility(p_user_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg       jsonb := points_config();
  v_belt      text;
  v_source    text;
  v_xp_calls  numeric := 0;
  v_xp_train  numeric := 0;
  v_resolved  int := 0;
  v_plans     int := 0;
  v_req       jsonb;
  v_next      jsonb := null;
  v_checks    jsonb := '[]'::jsonb;
  v_comp      jsonb;
  v_met_all   boolean := true;
  v_have      text;
  v_ok        boolean;
  v_exam      record;
  v_last_fail timestamptz;
  v_attempts  int := 0;
  v_cooldown  int := (v_cfg->'exam'->>'cooldown_hours')::int;
  v_cap       int := (v_cfg->'exam'->>'attempts_per_30d')::int;
  v_passed_here boolean := false;
begin
  select belt, belt_source, xp_calls, xp_training
    into v_belt, v_source, v_xp_calls, v_xp_train
    from user_points where user_id = p_user_id;
  v_belt   := coalesce(v_belt, 'white');
  v_source := coalesce(v_source, 'legacy_points');
  v_xp_calls := coalesce(v_xp_calls, 0);
  v_xp_train := coalesce(v_xp_train, 0);

  select count(*)::int into v_resolved
    from point_events
   where user_id = p_user_id and won is not null;

  select count(*)::int into v_plans
    from trade_plans
   where user_id = p_user_id
     and stop is not null
     and entry_condition is not null
     and targets is not null
     and jsonb_typeof(targets) = 'array'
     and jsonb_array_length(targets) > 0;

  -- The next rung up from the one they hold. At Black there is none, and the
  -- honest answer to "what is next" is nothing rather than a fifth invented rung.
  select r into v_req
    from jsonb_array_elements(v_cfg->'belt_requirements') r
   where belt_rank(r->>'key') > belt_rank(v_belt)
   order by belt_rank(r->>'key')
   limit 1;

  if v_req is not null then
    -- (1) the competencies, each one a passed assessment somewhere in training
    for v_comp in select c from jsonb_array_elements(v_req->'competencies') c loop
      select signal into v_have
        from training_competencies
       where user_id = p_user_id and key = v_comp->>'key';
      -- `passed` is the floor: it is the signal a free-response answer earns,
      -- and everything above it (strong, mastered) is a better version of the
      -- same demonstration. `developing` is not — that is "got there after being
      -- told", which is progress and is not proof.
      v_ok := training_signal_rank(coalesce(v_have, 'unproven')) >= training_signal_rank('passed');
      v_met_all := v_met_all and v_ok;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'kind', 'competency',
        'key', v_comp->>'key',
        'label', v_comp->>'label',
        'taught_by', v_comp->>'taught_by',
        'have', coalesce(v_have, 'unproven'),
        'met', v_ok
      ));
    end loop;

    -- (2) the applied half of the learning: something built, not something read
    v_ok := v_plans >= (v_req->'applied'->>'count')::int;
    v_met_all := v_met_all and v_ok;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'kind', 'applied',
      'label', v_req->'applied'->>'label',
      'have', v_plans,
      'need', (v_req->'applied'->>'count')::int,
      'met', v_ok
    ));

    -- (3) calls that RESOLVED. Not calls posted: 0039's first sentence.
    v_ok := v_resolved >= (v_req->>'calls_resolved')::int;
    v_met_all := v_met_all and v_ok;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'kind', 'calls_resolved',
      'label', 'Calls resolved',
      'have', v_resolved,
      'need', (v_req->>'calls_resolved')::int,
      'met', v_ok
    ));

    -- (4) the call half of the XP, at the SAME threshold 0039 already used
    v_ok := v_xp_calls >= (v_req->>'xp_calls')::numeric;
    v_met_all := v_met_all and v_ok;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'kind', 'xp_calls',
      'label', 'XP from calls',
      'have', round(v_xp_calls, 2),
      'need', (v_req->>'xp_calls')::numeric,
      'met', v_ok
    ));

    select * into v_exam from belt_exams
     where belt = v_req->>'key' and active order by version desc limit 1;

    select max(submitted_at) into v_last_fail
      from belt_exam_attempts
     where user_id = p_user_id and belt = v_req->>'key'
       and submitted_at is not null and passed is not true;

    select count(*)::int into v_attempts
      from belt_exam_attempts
     where user_id = p_user_id and belt = v_req->>'key'
       and started_at > now() - interval '30 days';

    v_next := jsonb_build_object(
      'key',      v_req->>'key',
      'label',    v_req->>'label',
      'title',    v_req->>'title',
      'proposed', (v_req->>'proposed')::boolean,
      'checks',   v_checks,
      'eligible', v_met_all,
      'exam', case when v_exam.belt is null then null else jsonb_build_object(
        'version',  v_exam.version,
        'pass_pct', v_exam.pass_pct,
        'questions', jsonb_array_length(v_exam.blueprint->'knowledge'),
        'applied',   coalesce((v_exam.blueprint->>'applied_draw')::int, 0)
      ) end,
      'exam_written',  v_exam.belt is not null,
      'attempts_30d',  v_attempts,
      'attempts_cap',  v_cap,
      'cooldown_until',
        case when v_last_fail is null then null
             else to_char(v_last_fail + make_interval(hours => v_cooldown),
                          'YYYY-MM-DD"T"HH24:MI:SSOF') end,
      'may_sit',
        v_met_all
        and v_exam.belt is not null
        and v_attempts < v_cap
        and (v_last_fail is null or now() >= v_last_fail + make_interval(hours => v_cooldown))
    );
  end if;

  -- May a legacy holder convert their own rung by sitting its exam? Spec §7:
  -- "worth offering, and worth showing: it is the moment the ladder becomes
  -- something people trust."
  select true into v_passed_here
    from belt_exams where belt = v_belt and active limit 1;

  return jsonb_build_object(
    'belt', v_belt,
    'belt_source', v_source,
    'xp_calls', round(v_xp_calls, 2),
    'xp_training', round(v_xp_train, 2),
    'calls_resolved', v_resolved,
    'clean_paper_plans', v_plans,
    'next', v_next,
    'may_convert_legacy',
      v_source = 'legacy_points' and v_belt <> 'white' and coalesce(v_passed_here, false)
  );
end $$;

-- =====================================================================
-- 5. THE BOARD SORTS ON THE CALL HALF, NOT ON THE TOTAL
-- =====================================================================
-- Spec §4, and it is the single most load-bearing line in this section: "the
-- board is a CALLS board and should keep ranking on the trading record, so the
-- board sorts on `xp_calls`, not on `points`. Otherwise a diligent student
-- outranks a good caller on a leaderboard that claims to measure calling."
--
-- The two functions are otherwise byte-for-byte 0039 §6 — same periods, same
-- tie-break on accuracy, same all-time belt on every tab. The only change is one
-- WHERE clause in each, filtering the ledger to the two call sources. It has to
-- be in BOTH or the pinned row lies about where somebody stands.
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
       and e.source in ('community_call', 'kai_trade')
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
         coalesce(up.belt, 'white') as belt
    from scoped s
    left join user_points up on up.user_id = s.user_id
   order by rank
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

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
       and e.source in ('community_call', 'kai_trade')
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
-- 6. THE ROLLUP: THE BELT STOPS MOVING ON POINTS
-- =====================================================================
-- Same function as 0046 §6 with one paragraph changed, and it is the paragraph
-- the owner's decision is about. `recompute_points` no longer decides the belt
-- from a total. It keeps whatever is already recorded — which is a high-water
-- mark, so nobody is demoted — and the ONLY thing that raises it is
-- `grade_belt_exam` recording a pass.
create or replace function recompute_points(p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      jsonb := points_config();
  v_window   int   := (v_cfg->>'accuracy_window')::int;
  v_points   numeric;
  v_calls    numeric;
  v_training numeric;
  v_wins     int;
  v_losses   int;
  v_resolved int;
  v_accuracy numeric;
  v_belt     text;
begin
  select coalesce(sum(points), 0),
         coalesce(sum(points) filter (where source in ('community_call', 'kai_trade')), 0),
         coalesce(sum(points) filter (where source not in ('community_call', 'kai_trade')), 0),
         count(*) filter (where won),
         count(*) filter (where won is false),
         count(*) filter (where won is not null)
    into v_points, v_calls, v_training, v_wins, v_losses, v_resolved
    from point_events where user_id = p_user_id;

  select case when count(*) > 0
              then round(count(*) filter (where won)::numeric / count(*)::numeric, 4)
         end
    into v_accuracy
    from (
      select won from point_events
       where user_id = p_user_id and won is not null
       order by id desc limit v_window
    ) recent;

  -- THE BELT IS NOT COMPUTED HERE ANY MORE. Whatever is on the row stands; a
  -- brand-new row starts at White. Points fall, points rise, the belt does not
  -- move — only a passed exam moves it.
  select belt into v_belt from user_points where user_id = p_user_id;
  v_belt := coalesce(v_belt, 'white');

  insert into user_points (
    user_id, points, xp_calls, xp_training, wins, losses, resolved, accuracy,
    belt, belt_reached_at, updated_at
  )
  values (
    p_user_id, v_points, v_calls, v_training, v_wins, v_losses, v_resolved, v_accuracy,
    v_belt, case when v_belt <> 'white' then now() end, now()
  )
  on conflict (user_id) do update set
    points      = excluded.points,
    xp_calls    = excluded.xp_calls,
    xp_training = excluded.xp_training,
    wins        = excluded.wins,
    losses      = excluded.losses,
    resolved    = excluded.resolved,
    accuracy    = excluded.accuracy,
    updated_at  = now();
end $$;

-- `belt_for` is gone, deliberately and by name. Everything that used to call it
-- now calls `belt_eligible_by_points`, which cannot be mistaken for the award.
drop function if exists belt_for(numeric);

-- =====================================================================
-- 7. STAGE IS DERIVED FROM THE BELT (spec §9)
-- =====================================================================
-- "Stage and belt must not become the same ladder twice." After this merge the
-- belt measures roughly what `profiles.stage` measures, so one of them has to
-- be derived. Belt is the one with an exam behind it, so stage derives from it:
--
--   white           -> beginner
--   blue, purple    -> developing
--   brown, black    -> trade_ready
--
-- `profiles.stage` STAYS. 0042's trigger protection and `homeOrderFor()` in
-- app/(tabs)/home.tsx keep working untouched; the only change is what writes it.
--
-- THE RATCHET IS 0042'S AND IT IS UNCHANGED: automatic evolution promotes only.
-- Somebody who told onboarding "I actively trade" starts at `trade_ready` with
-- no belt, and recomputing them down to `beginner` would publicly demote them
-- next to their name in a room. Self-reported placement stays, and stays
-- labelled as self-reported: it sets the first screen somebody sees, never the
-- belt.
--
-- IT WRITES A COLUMN 0042 PROTECTS WITH A TRIGGER, and that works because this
-- is `security definer`: the guard admits `current_user in ('postgres',
-- 'supabase_admin', 'service_role')`, and a definer function runs as its owner.
-- If that guard is ever tightened, this function is the first thing that breaks
-- and this paragraph is why.
create or replace function stage_for_belt(p_belt text) returns text
language sql immutable
as $$
  select case coalesce(p_belt, 'white')
           when 'white'  then 'beginner'
           when 'blue'   then 'developing'
           when 'purple' then 'developing'
           when 'brown'  then 'trade_ready'
           when 'black'  then 'trade_ready'
           else 'beginner'
         end;
$$;

create or replace function sync_stage_from_belt(p_user_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belt    text;
  v_want    text;
  v_current text;
  v_locked  boolean;
  v_order   text[] := array['beginner', 'developing', 'trade_ready'];
begin
  select coalesce(belt, 'white') into v_belt from user_points where user_id = p_user_id;
  v_want := stage_for_belt(coalesce(v_belt, 'white'));

  select stage, stage_locked into v_current, v_locked
    from profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('stage', null, 'changed', false, 'reason', 'no_profile');
  end if;
  v_current := coalesce(v_current, 'beginner');

  if coalesce(v_locked, false) then
    return jsonb_build_object('stage', v_current, 'changed', false, 'reason', 'locked');
  end if;

  if array_position(v_order, v_want) <= array_position(v_order, v_current) then
    return jsonb_build_object('stage', v_current, 'changed', false,
      'reason', case when v_want = v_current then 'unchanged' else 'no_downgrade' end);
  end if;

  update profiles
     set stage = v_want, stage_changed_at = now()
   where user_id = p_user_id;

  return jsonb_build_object('stage', v_want, 'changed', true, 'reason', 'promoted');
end $$;

-- =====================================================================
-- 8. SITTING THE EXAM
-- =====================================================================
-- Two functions and one rule between them: the client is told what to render
-- and is never told what the answers are.
create or replace function start_belt_exam(p_user_id uuid, p_belt text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elig   jsonb := belt_eligibility(p_user_id);
  v_next   jsonb := v_elig->'next';
  v_exam   record;
  v_open   record;
  v_draw   int;
  v_paper  jsonb;
  v_id     uuid;
begin
  if v_next is null or v_next->>'key' <> p_belt then
    return jsonb_build_object('ok', false, 'reason', 'not_your_next_rung');
  end if;
  if not (v_next->>'eligible')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible', 'eligibility', v_elig);
  end if;
  if not (v_next->>'may_sit')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'may_not_sit_yet', 'eligibility', v_elig);
  end if;

  select * into v_exam from belt_exams where belt = p_belt and active
   order by version desc limit 1;
  if v_exam.belt is null then
    return jsonb_build_object('ok', false, 'reason', 'no_exam_written');
  end if;

  -- AN OPEN ATTEMPT IS RESUMED, NOT REPLACED. Losing signal half way through an
  -- exam must not cost a member one of three monthly sittings, and re-drawing
  -- the applied tasks on a reopen would be a free re-roll of the pool.
  select * into v_open from belt_exam_attempts
   where user_id = p_user_id and belt = p_belt and submitted_at is null
   order by started_at desc limit 1;
  if v_open.id is not null then
    return jsonb_build_object('ok', true, 'attempt_id', v_open.id, 'resumed', true,
                              'paper', v_open.paper, 'pass_pct', v_exam.pass_pct);
  end if;

  v_draw := coalesce((v_exam.blueprint->>'applied_draw')::int, 2);

  -- DRAWN PER ATTEMPT (spec §5.3), so a failed attempt cannot be memorised into
  -- a passed one.
  select jsonb_build_object(
    'belt', p_belt,
    'version', v_exam.version,
    'pass_pct', v_exam.pass_pct,
    'series', v_exam.blueprint->'series',
    'series_label', v_exam.blueprint->>'series_label',
    'knowledge', v_exam.blueprint->'knowledge',
    'applied', coalesce((
      select jsonb_agg(a) from (
        select a from jsonb_array_elements(v_exam.blueprint->'applied') a
         order by random() limit v_draw
      ) picked
    ), '[]'::jsonb)
  ) into v_paper;

  insert into belt_exam_attempts (user_id, belt, exam_version, paper)
  values (p_user_id, p_belt, v_exam.version, v_paper)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'attempt_id', v_id, 'resumed', false,
                            'paper', v_paper, 'pass_pct', v_exam.pass_pct);
end $$;

/* THE GRADING, AND THE RULE THAT MAKES THE BELT MEAN ANYTHING.
 *
 * Spec §12 states the risk in one sentence: "An easy exam is worse than no
 * exam." If Blue is ten multiple-choice questions somebody can tap through, the
 * belt means strictly LESS than the points total it replaced, because the app
 * will now be asserting that a test was passed.
 *
 * So a pass needs both of:
 *   - the overall mark, at the exam's own pass_pct; and
 *   - EVERY DRAWN APPLIED TASK CORRECT.
 *
 * The second is the mitigation and it is not negotiable. Two applied tasks and
 * both must be right is a hard bar for a two-item sample, which is exactly why
 * the cooldown exists: the answer to failing on the chart is to go and learn the
 * chart and come back on Thursday, not to re-roll until the pool repeats.
 */
create or replace function grade_belt_exam(
  p_user_id uuid,
  p_attempt_id uuid,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att      record;
  v_exam     record;
  v_item     jsonb;
  v_given    text;
  v_marks    int := 0;
  v_earned   int := 0;
  v_app_tot  int := 0;
  v_app_ok   int := 0;
  v_score    numeric;
  v_passed   boolean;
  v_belt     text;
  v_prev     text;
  v_stage    jsonb;
  v_review   jsonb := '[]'::jsonb;
  v_correct  boolean;
begin
  select * into v_att from belt_exam_attempts
   where id = p_attempt_id and user_id = p_user_id;
  if v_att.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_attempt');
  end if;
  if v_att.submitted_at is not null then
    -- Already graded. Idempotent by design: a retried submit reads back the
    -- verdict rather than grading a second time against a fresh draw.
    return jsonb_build_object('ok', true, 'already_submitted', true,
      'score_pct', v_att.score_pct, 'passed', v_att.passed,
      'applied_correct', v_att.applied_correct, 'applied_total', v_att.applied_total);
  end if;

  select * into v_exam from belt_exams
   where belt = v_att.belt and version = v_att.exam_version;
  if v_exam.belt is null then
    return jsonb_build_object('ok', false, 'reason', 'exam_version_gone');
  end if;

  -- Knowledge: one mark each.
  for v_item in select k from jsonb_array_elements(v_att.paper->'knowledge') k loop
    v_marks := v_marks + 1;
    v_given := p_answers->>(v_item->>'id');
    v_correct := v_given is not null and v_given = v_item->>'correct_id';
    if v_correct then v_earned := v_earned + 1; end if;
    v_review := v_review || jsonb_build_array(jsonb_build_object(
      'id', v_item->>'id', 'kind', 'knowledge', 'correct', v_correct,
      'because', v_item->>'because'
    ));
  end loop;

  -- Applied: two marks each, because it is worth twice a recalled fact, and
  -- counted separately because it is also a condition of its own.
  for v_item in select a from jsonb_array_elements(v_att.paper->'applied') a loop
    v_marks := v_marks + 2;
    v_app_tot := v_app_tot + 1;
    v_given := p_answers->>(v_item->>'id');
    -- A sizing answer is a NUMBER typed into a box, so it is compared as one:
    -- "027" and "27" are the same answer, and failing somebody's belt on a
    -- leading zero would be the exam grading typing rather than trading.
    v_correct := v_given is not null and (
      v_given = (v_item->>'expected')
      or (v_item->>'kind' = 'position_size'
          and v_given ~ '^[0-9]+$'
          and (v_item->>'expected') ~ '^[0-9]+$'
          and v_given::numeric = (v_item->>'expected')::numeric)
    );
    if v_correct then
      v_earned := v_earned + 2;
      v_app_ok := v_app_ok + 1;
    end if;
    v_review := v_review || jsonb_build_array(jsonb_build_object(
      'id', v_item->>'id', 'kind', 'applied', 'correct', v_correct,
      'because', v_item->>'because'
    ));
  end loop;

  v_score := case when v_marks > 0 then round(v_earned::numeric * 100 / v_marks, 2) else 0 end;
  v_passed := v_score >= v_exam.pass_pct and v_app_tot > 0 and v_app_ok = v_app_tot;

  update belt_exam_attempts
     set submitted_at = now(), answers = p_answers, score_pct = v_score,
         passed = v_passed, applied_correct = v_app_ok, applied_total = v_app_tot
   where id = p_attempt_id;

  if v_passed then
    -- THE BELT IS STILL A HIGH-WATER MARK. A legacy holder converting their own
    -- rung keeps the rung and gains the provenance; nobody is ever moved down.
    select coalesce(belt, 'white') into v_prev from user_points where user_id = p_user_id;
    v_prev := coalesce(v_prev, 'white');
    v_belt := case when belt_rank(v_att.belt) > belt_rank(v_prev) then v_att.belt else v_prev end;

    insert into user_points (user_id, belt, belt_source, belt_reached_at, updated_at)
    values (p_user_id, v_belt, 'exam', now(), now())
    on conflict (user_id) do update set
      belt = excluded.belt,
      belt_source = 'exam',
      belt_reached_at = case
        when user_points.belt is distinct from excluded.belt then now()
        else coalesce(user_points.belt_reached_at, now())
      end,
      updated_at = now();

    v_stage := sync_stage_from_belt(p_user_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_submitted', false,
    'score_pct', v_score,
    'pass_pct', v_exam.pass_pct,
    'passed', v_passed,
    'applied_correct', v_app_ok,
    'applied_total', v_app_tot,
    'belt', coalesce(v_belt, (select belt from user_points where user_id = p_user_id), 'white'),
    'stage', v_stage,
    'review', v_review
  );
end $$;

-- =====================================================================
-- 9. THE BLUE BELT EXAM
-- =====================================================================
-- Ten knowledge questions plus two applied tasks drawn from four, on a chart.
--
-- THE CHART CARRIES NO TICKER, and that is the same decision the canonical
-- lesson's order-book screen made: "No symbol on purpose: this is a teaching
-- book on round numbers, and an invented ticker rendered as a market object
-- would be a small lie." The series below is schematic, it says so on its face,
-- and it is the only kind of chart this file is allowed to author — a real
-- instrument would need a real date and a real feed, and an exam blueprint in a
-- migration has neither.
--
-- The questions are Foundations-level and they are answerable from the
-- curriculum this product actually ships. That matters: an exam that tests
-- material nobody was taught is a gate, not a measurement.
insert into belt_exams (belt, version, pass_pct, blueprint, active)
values ('blue', 1, 80, jsonb_build_object(
  'series_label', 'EXAMPLE SERIES · NOT A LIVE MARKET · NO REAL COMPANY',
  'series', jsonb_build_array(
    jsonb_build_object('t',1,'o',96.10,'h',97.40,'l',95.80,'c',97.10),
    jsonb_build_object('t',2,'o',97.10,'h',98.60,'l',96.90,'c',98.30),
    jsonb_build_object('t',3,'o',98.30,'h',99.10,'l',97.60,'c',97.90),
    jsonb_build_object('t',4,'o',97.90,'h',99.80,'l',97.70,'c',99.50),
    jsonb_build_object('t',5,'o',99.50,'h',101.20,'l',99.30,'c',100.90),
    jsonb_build_object('t',6,'o',100.90,'h',102.40,'l',100.60,'c',102.10),
    jsonb_build_object('t',7,'o',102.10,'h',103.30,'l',101.50,'c',101.80),
    jsonb_build_object('t',8,'o',101.80,'h',102.60,'l',101.60,'c',102.40),
    jsonb_build_object('t',9,'o',102.40,'h',104.10,'l',102.20,'c',103.80),
    jsonb_build_object('t',10,'o',103.80,'h',105.20,'l',103.50,'c',104.90),
    jsonb_build_object('t',11,'o',104.90,'h',105.60,'l',103.90,'c',104.10),
    jsonb_build_object('t',12,'o',104.10,'h',104.80,'l',103.20,'c',103.40),
    jsonb_build_object('t',13,'o',103.40,'h',104.00,'l',102.60,'c',103.90),
    jsonb_build_object('t',14,'o',103.90,'h',104.60,'l',103.60,'c',104.20)
  ),
  'applied_draw', 2,
  'knowledge', jsonb_build_array(
    jsonb_build_object('id','k1',
      'prompt','What does owning one share of a company actually give you?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','A loan to the company that it pays back with interest'),
        jsonb_build_object('id','b','label','A small part of the ownership of that business'),
        jsonb_build_object('id','c','label','A promise from the exchange that the price will rise'),
        jsonb_build_object('id','d','label','A guaranteed share of this year''s profit')),
      'correct_id','b',
      'because','A share is a part of a business. Everything else on a chart follows from that.'),
    jsonb_build_object('id','k2',
      'prompt','Price moved from 104.10 to 104.90. What actually caused that?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','The company set a new price'),
        jsonb_build_object('id','b','label','The exchange adjusted it overnight'),
        jsonb_build_object('id','c','label','Buyers were willing to pay more than sellers were asking'),
        jsonb_build_object('id','d','label','The company became more profitable that minute')),
      'correct_id','c',
      'because','Price is the running result of an auction. Nothing moves until somebody crosses the gap.'),
    jsonb_build_object('id','k3',
      'prompt','On a candle, what is the body?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','The distance between the open and the close'),
        jsonb_build_object('id','b','label','The distance between the high and the low'),
        jsonb_build_object('id','c','label','The average price over the period'),
        jsonb_build_object('id','d','label','The volume traded in the period')),
      'correct_id','a',
      'because','Body is open to close. Wick is the rest of the range - where price went and did not stay.'),
    jsonb_build_object('id','k4',
      'prompt','A chart makes a higher high and then a higher low. What is that?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','A downtrend'),
        jsonb_build_object('id','b','label','An uptrend'),
        jsonb_build_object('id','c','label','A range with no direction'),
        jsonb_build_object('id','d','label','Not enough information to say anything')),
      'correct_id','b',
      'because','Higher highs and higher lows is the definition of an uptrend. That is all it is.'),
    jsonb_build_object('id','k5',
      'prompt','What makes an area on a chart a support level?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','It is a round number'),
        jsonb_build_object('id','b','label','An indicator drew a line there'),
        jsonb_build_object('id','c','label','Price has repeatedly reacted there before'),
        jsonb_build_object('id','d','label','It is the lowest price of the year')),
      'correct_id','c',
      'because','Support is where price has repeatedly reacted. Anything else is a line you drew.'),
    jsonb_build_object('id','k6',
      'prompt','Where does a stop belong?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','A fixed 5% below the entry, every time'),
        jsonb_build_object('id','b','label','Wherever the loss would still be comfortable'),
        jsonb_build_object('id','c','label','Just past the level that would prove the idea wrong'),
        jsonb_build_object('id','d','label','Wherever the broker suggests it')),
      'correct_id','c',
      'because','A stop is not a comfort level. It goes past the point where your reason for the trade has failed.'),
    jsonb_build_object('id','k7',
      'prompt','Your account is 5,000 and you risk 1% per trade. Entry 104.20, stop 102.20. How many shares?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','25 shares'),
        jsonb_build_object('id','b','label','48 shares'),
        jsonb_build_object('id','c','label','240 shares'),
        jsonb_build_object('id','d','label','5 shares')),
      'correct_id','a',
      'because','1% of 5,000 is 50. Risk per share is 104.20 - 102.20 = 2.00. 50 / 2.00 = 25 shares.'),
    jsonb_build_object('id','k8',
      'prompt','Entry 104.20, stop 102.20, target 108.20. What is the risk-to-reward?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','1 to 1'),
        jsonb_build_object('id','b','label','1 to 2'),
        jsonb_build_object('id','c','label','2 to 1 against you'),
        jsonb_build_object('id','d','label','1 to 4')),
      'correct_id','b',
      'because','Risk is 2.00, reward is 4.00. Two units of reward for one of risk.'),
    jsonb_build_object('id','k9',
      'prompt','A setup looks interesting but price has not reached your level. What is the trade?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','Enter now before it runs away'),
        jsonb_build_object('id','b','label','Enter half now and half later'),
        jsonb_build_object('id','c','label','Wait. Interesting is not an entry'),
        jsonb_build_object('id','d','label','Move the entry to where price is')),
      'correct_id','c',
      'because','A setup is not an entry. Moving the entry to meet the price is how a plan becomes a hope.'),
    jsonb_build_object('id','k10',
      'prompt','You are in a trade and it moves against you toward your stop. What does the plan say?',
      'options', jsonb_build_array(
        jsonb_build_object('id','a','label','Widen the stop to give it room'),
        jsonb_build_object('id','b','label','Add more shares to lower the average'),
        jsonb_build_object('id','c','label','Let the stop do the job you gave it'),
        jsonb_build_object('id','d','label','Close it immediately at any price')),
      'correct_id','c',
      'because','Before entry, plan the trade. After entry, trade the plan. A stop you move is not a stop.')
  ),
  'applied', jsonb_build_array(
    jsonb_build_object('id','a1','kind','level_choice','level','stop',
      'prompt','This is a pullback in an uptrend and you are buying the continuation at 104.20. Put the stop where the idea is wrong.',
      'direction','long','entry',104.20,'target',108.00,
      'options', jsonb_build_array(
        jsonb_build_object('id','o1','value',104.05,'label','104.05'),
        jsonb_build_object('id','o2','value',102.35,'label','102.35'),
        jsonb_build_object('id','o3','value',99.00,'label','99.00'),
        jsonb_build_object('id','o4','value',105.00,'label','105.00')),
      'expected','o2',
      'because','The pullback low is 102.60. Below it, the higher-low structure that is your whole reason for the trade has broken. 104.05 sits inside the last two bars'' noise and would be hit by nothing; 99.00 is far past the point where you were already wrong; 105.00 is above your entry, which is a target, not a stop.'),
    jsonb_build_object('id','a2','kind','level_choice','level','entry',
      'prompt','You want to buy this only if it breaks out. The high of the move is 105.60. Where does the entry belong?',
      'direction','long','stop',103.10,'target',109.00,
      'options', jsonb_build_array(
        jsonb_build_object('id','o1','value',104.20,'label','104.20'),
        jsonb_build_object('id','o2','value',105.75,'label','105.75'),
        jsonb_build_object('id','o3','value',109.00,'label','109.00'),
        jsonb_build_object('id','o4','value',102.60,'label','102.60')),
      'expected','o2',
      'because','A breakout entry sits above the level being broken - 105.75, just through 105.60. 104.20 is buying before anything has happened; 109.00 is chasing something that already ran; 102.60 is support, which is a different trade with a different reason.'),
    jsonb_build_object('id','a3','kind','position_size',
      'prompt','Your paper account is 5,000. You risk 1% per trade. Entry 104.20, stop 102.35. How many shares?',
      'balance',5000,'risk_pct',1,'entry',104.20,'stop',102.35,
      'expected','27',
      'because','1% of 5,000 is 50. Risk per share is 104.20 - 102.35 = 1.85. 50 / 1.85 = 27.02, and you round DOWN - 28 shares risks more than you said you would.'),
    jsonb_build_object('id','a4','kind','plan_choice',
      'prompt','Two plans on this chart. Which one is sound?',
      'options', jsonb_build_array(
        jsonb_build_object('id','o1','label','Entry 104.20 · Stop 99.00 · Target 106.00',
          'detail','Risk 5.20 to make 1.80'),
        jsonb_build_object('id','o2','label','Entry 104.20 · Stop 102.35 · Target 108.00',
          'detail','Risk 1.85 to make 3.80')),
      'expected','o2',
      'because','The second risks 1.85 to make 3.80 - about two to one - and its stop sits just under the structure that would prove it wrong. The first risks nearly three times what it stands to make, and its stop is so far away that being right about the level would not save it.')
  )
), true)
on conflict (belt, version) do update set
  pass_pct  = excluded.pass_pct,
  blueprint = excluded.blueprint,
  active    = excluded.active;

-- =====================================================================
-- 10. GRANDFATHERING (spec §7)
-- =====================================================================
-- Nobody is demoted. That would be the fastest way to make the belt worthless.
-- Every belt already held is kept and stamped as what it is.
update user_points set belt_source = 'legacy_points'
 where belt <> 'white' and belt_source is distinct from 'exam';

-- And everybody's stage is brought into line with the belt they hold, ONCE,
-- through the ratchet — so this backfill can only ever promote.
do $$
declare r record;
begin
  for r in select user_id from user_points loop
    perform sync_stage_from_belt(r.user_id);
  end loop;
end $$;

-- =====================================================================
-- 11. RLS AND GRANTS
-- =====================================================================
alter table belt_exams         enable row level security;
alter table belt_exam_attempts enable row level security;

revoke all on belt_exams         from anon, authenticated;
revoke all on belt_exam_attempts from anon, authenticated;

grant select on belt_exams to service_role;
grant select, insert, update on belt_exam_attempts to service_role;

-- EVERY ATTEMPT IS KEPT (spec §5.5). UPDATE is granted because an attempt has
-- two moments and they are one row; removal is granted to nobody.
revoke delete, truncate on belt_exam_attempts from anon, authenticated, service_role;
revoke insert, update, delete, truncate on belt_exams from anon, authenticated, service_role;

revoke all on function belt_eligible_by_points(numeric) from public, anon, authenticated;
revoke all on function belt_rank(text)                  from public, anon, authenticated;
revoke all on function belt_eligibility(uuid)           from public, anon, authenticated;
revoke all on function stage_for_belt(text)             from public, anon, authenticated;
revoke all on function sync_stage_from_belt(uuid)       from public, anon, authenticated;
revoke all on function start_belt_exam(uuid, text)      from public, anon, authenticated;
-- THE ONE THAT MATTERS. A belt a phone can grant itself is not a belt, and this
-- is the same posture 0039 takes for `award_points`.
revoke all on function grade_belt_exam(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function belt_eligible_by_points(numeric) to service_role;
grant execute on function belt_rank(text)                  to service_role;
grant execute on function belt_eligibility(uuid)           to service_role;
grant execute on function stage_for_belt(text)             to service_role;
grant execute on function sync_stage_from_belt(uuid)       to service_role;
grant execute on function start_belt_exam(uuid, text)      to service_role;
grant execute on function grade_belt_exam(uuid, uuid, jsonb) to service_role;

-- =====================================================================
-- 12. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) THE THRESHOLDS DID NOT MOVE. Spec §6: the call-points column is the
--     EXISTING 0039 threshold for each rung, "so nobody's trading record is
--     devalued by this merge". If a future edit raises one of them, somebody
--     who was two calls from Blue is silently further away than they were.
do $$
declare v_bad text;
begin
  select string_agg(format('%s wants %s but the ladder says %s',
                           r->>'key', r->>'xp_calls', b->>'min_points'), '; ')
    into v_bad
    from jsonb_array_elements(points_config()->'belt_requirements') r
    join jsonb_array_elements(points_config()->'belts') b
      on b->>'key' = r->>'key'
   where (r->>'xp_calls')::numeric <> (b->>'min_points')::numeric;
  if v_bad is not null then
    raise exception '0047: an eligibility threshold no longer matches 0039''s ladder: %', v_bad;
  end if;
end $$;

-- (b) BOTH HALVES ARE REQUIRED AND NEITHER SUBSTITUTES FOR THE OTHER. Every
--     rung must name at least one competency AND a call requirement; a rung
--     that named only one of the two would be the failure mode this whole
--     design exists to prevent.
do $$
declare v_bad text;
begin
  select string_agg(r->>'key', ', ') into v_bad
    from jsonb_array_elements(points_config()->'belt_requirements') r
   where jsonb_array_length(r->'competencies') = 0
      or (r->>'calls_resolved')::int = 0
      or (r->>'xp_calls')::numeric = 0;
  if v_bad is not null then
    raise exception '0047: % can be reached on one half alone. Both halves are required.', v_bad;
  end if;
end $$;

-- (c) THE BELT IS NO LONGER COMPUTED FROM A TOTAL. The single most important
--     assertion here: if `recompute_points` ever starts writing a belt from
--     points again, the owner's decision has been quietly reversed.
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'recompute_points';
  if v_src like '%belt_for(%' or v_src like '%belt_eligible_by_points(%' then
    raise exception '0047: recompute_points is deriving a belt from points again. The exam is the authority.';
  end if;
  if exists (select 1 from pg_proc where proname = 'belt_for') then
    raise exception '0047: belt_for() still exists. It was renamed so nobody mistakes it for the award.';
  end if;
end $$;

-- (d) THE EXAM CANNOT BE GRADED BY A PHONE, and cannot be read by one either.
do $$
declare v_bad text;
begin
  select string_agg(distinct g.grantee, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = 'belt_exams'
     and g.grantee in ('anon', 'authenticated');
  if v_bad is not null then
    raise exception '0047: % can read belt_exams. The blueprint is the answer key.', v_bad;
  end if;

  if has_function_privilege('authenticated', 'grade_belt_exam(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'grade_belt_exam(uuid, uuid, jsonb)', 'execute') then
    raise exception '0047: a client can execute grade_belt_exam. A belt a phone can grant itself is not a belt.';
  end if;
end $$;

-- (e) NO ATTEMPT CAN EVER BE DELETED, service_role included.
do $$
declare v_bad text;
begin
  select string_agg(distinct format('%s(%s)', g.grantee, g.privilege_type), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = 'belt_exam_attempts'
     and g.privilege_type in ('DELETE', 'TRUNCATE')
     and g.grantee in ('anon', 'authenticated', 'service_role');
  if v_bad is not null then
    raise exception '0047: belt_exam_attempts can be deleted by %. Failures are part of the record.', v_bad;
  end if;
end $$;

-- (f) THE APPLIED HALF IS NOT OPTIONAL. An exam whose blueprint carries fewer
--     than two applied tasks, or draws none, is the exam spec §12 says not to
--     ship. Checked on every seeded rung, so a future Purple cannot slip in as
--     ten multiple-choice questions.
do $$
declare v_bad text;
begin
  select string_agg(format('%s v%s', belt, version), ', ') into v_bad
    from belt_exams
   where jsonb_array_length(blueprint->'applied') < 2
      or coalesce((blueprint->>'applied_draw')::int, 0) < 2;
  if v_bad is not null then
    raise exception
      '0047: % has no real applied half. Ship the eligibility screen and no exam rather than an exam that grades nothing.',
      v_bad;
  end if;
end $$;

-- (g) EVERY ITEM IN EVERY BLUEPRINT HAS AN ANSWER THAT EXISTS. A question whose
--     `correct_id` names no option can never be answered correctly, and the only
--     symptom is a pass rate that quietly drops.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from belt_exams e, jsonb_array_elements(e.blueprint->'knowledge') k
   where not exists (
     select 1 from jsonb_array_elements(k->'options') o where o->>'id' = k->>'correct_id'
   );
  if v_bad > 0 then
    raise exception '0047: % knowledge question(s) name a correct option that does not exist.', v_bad;
  end if;

  select count(*) into v_bad
    from belt_exams e, jsonb_array_elements(e.blueprint->'applied') a
   where a->>'kind' in ('level_choice', 'plan_choice')
     and not exists (
       select 1 from jsonb_array_elements(a->'options') o where o->>'id' = a->>'expected'
     );
  if v_bad > 0 then
    raise exception '0047: % applied task(s) expect an option that does not exist.', v_bad;
  end if;

  -- And every item explains itself. A failed exam that cannot say why is a
  -- gate, not a measurement.
  select count(*) into v_bad
    from belt_exams e, jsonb_array_elements(e.blueprint->'knowledge') k
   where coalesce(k->>'because', '') = '';
  if v_bad > 0 then
    raise exception '0047: % question(s) do not explain their answer.', v_bad;
  end if;
end $$;

-- (h) THE SCHEMATIC CHART SAYS SO ON ITS FACE. Every blueprint that carries a
--     series must carry the label that admits what it is. An unlabelled chart in
--     an exam is an invented instrument presented as a market.
do $$
declare v_bad text;
begin
  select string_agg(belt, ', ') into v_bad from belt_exams
   where blueprint ? 'series'
     and coalesce(blueprint->>'series_label', '') not like '%NOT A LIVE MARKET%';
  if v_bad is not null then
    raise exception '0047: %''s exam chart does not say it is an example.', v_bad;
  end if;
end $$;

-- (i) STAGE DERIVES FROM BELT AND THE LADDER STILL CLIMBS.
do $$
begin
  if stage_for_belt('white') <> 'beginner' then
    raise exception '0047: White is not a beginner stage.';
  end if;
  if stage_for_belt('blue') <> 'developing' or stage_for_belt('purple') <> 'developing' then
    raise exception '0047: Blue/Purple do not map to developing.';
  end if;
  if stage_for_belt('brown') <> 'trade_ready' or stage_for_belt('black') <> 'trade_ready' then
    raise exception '0047: Brown/Black do not map to trade_ready.';
  end if;
  if belt_rank('white') <> 0 or belt_rank('black') <> 4 then
    raise exception '0047: the belt ladder does not run white(0) to black(4).';
  end if;
  if belt_rank('blue') >= belt_rank('purple') then
    raise exception '0047: the belt ladder does not climb.';
  end if;
end $$;

-- (j) THE ELIGIBILITY FUNCTION ANSWERS FOR SOMEBODY WHO HAS DONE NOTHING, and
--     the answer is White with a Blue checklist, not an error and not a belt.
do $$
declare v jsonb;
begin
  v := belt_eligibility('00000000-0000-0000-0000-000000000000'::uuid);
  if v->>'belt' <> 'white' then
    raise exception '0047: a member with no record does not start at White.';
  end if;
  if v->'next'->>'key' <> 'blue' then
    raise exception '0047: the rung after White is not Blue.';
  end if;
  if (v->'next'->>'eligible')::boolean then
    raise exception '0047: somebody who has done nothing is eligible to sit for Blue.';
  end if;
  -- FIVE LINES, NOT THE BOARD'S FOUR, AND THAT IS DELIBERATE. Board 09's mock
  -- prints "Read a chart · Explain your risk · Complete a clean paper plan · 3
  -- resolved calls" and stops. Spec §6's table asks for BOTH halves of the
  -- trading side — calls RESOLVED and the call XP those calls were worth — and
  -- they are different requirements: three resolved calls that all lost is not
  -- 250 XP. Hiding the second one would mean a member ticking every line on the
  -- screen and still finding the door shut, which is the exact failure the
  -- checklist exists to prevent.
  if jsonb_array_length(v->'next'->'checks') <> 5 then
    raise exception '0047: the Blue checklist is not the five requirements spec §6 names (got %).',
      jsonb_array_length(v->'next'->'checks');
  end if;
  if not (v->'next'->'checks' @> '[{"kind":"competency"}]'::jsonb
      and v->'next'->'checks' @> '[{"kind":"applied"}]'::jsonb
      and v->'next'->'checks' @> '[{"kind":"calls_resolved"}]'::jsonb
      and v->'next'->'checks' @> '[{"kind":"xp_calls"}]'::jsonb) then
    raise exception '0047: the Blue checklist is missing one of the four kinds of requirement.';
  end if;
end $$;

-- =====================================================================
-- 13. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The rules the app prints, straight from the database:
--
--   select jsonb_pretty(points_config()->'belt_requirements');
--
-- (ii) What a real member is short of:
--
--   select jsonb_pretty(belt_eligibility('<user>'));
--   -> expected: four `checks` rows for Blue, each with have/need/met.
--
-- (iii) The exam refuses somebody who is not eligible:
--
--   select start_belt_exam('<fresh user>', 'blue');
--   -> {"ok": false, "reason": "not_eligible", ...}
--
-- (iv) The paper never carries the answers. Look at what the route would send:
--
--   select jsonb_pretty(paper) from belt_exam_attempts order by started_at desc limit 1;
--   -> the ROW holds `correct_id` and `expected`; apps/api strips both before
--      the response. Confirm with: curl the start route and grep for correct_id.
--
-- (v) A failed exam does not move the belt, and a passed one does:
--
--   select belt, belt_source from user_points where user_id = '<user>';
--   select score_pct, passed, applied_correct, applied_total
--     from belt_exam_attempts where user_id = '<user>' order by started_at desc;
--
-- (vi) And the belt still does not fall. Award a loss big enough to drop
--      `xp_calls` under the rung's threshold and read the belt back:
--
--   select belt, xp_calls from user_points where user_id = '<user>';
--   -> expected: the belt already earned, whatever the points now say.
