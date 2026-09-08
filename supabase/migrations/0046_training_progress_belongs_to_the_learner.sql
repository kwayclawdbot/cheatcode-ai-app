-- 0046 — Training progress belongs to the LEARNER, not to the handset. And the
--        one points ledger learns to carry lesson XP.
--
-- =====================================================================
-- WHAT IS BROKEN, IN THE PLAINEST TERMS AVAILABLE
-- =====================================================================
-- Everything a member has learned lives in ONE AsyncStorage key on ONE phone:
--
--     apps/mobile/src/features/training/store.tsx
--       const KEY = 'ccai.training.profile.v2';
--
-- There is no account id in that key and nothing clears it on sign-out. Three
-- consequences, all of them confirmed against the code rather than suspected:
--
--   1. TWO ACCOUNTS ON ONE HANDSET INHERIT EACH OTHER'S LEARNING. Sign out,
--      sign in as somebody else, and their trader profile is yours.
--   2. A NEW DEVICE CANNOT RECOVER PROGRESS. Not "loses the streak" — loses the
--      lessons, the mastery, the competency signals, all of it.
--   3. THE CONTAMINATION REACHES THE FUNNEL. `features/stage/useStageEvolution`
--      feeds this same local profile to `POST /stage/evaluate` as readiness
--      EVIDENCE, so somebody else's lessons can promote your `profiles.stage`.
--
-- Meanwhile the concept boards print "Progress saved" and "Saved to your
-- account" under the lesson screens. Neither sentence is true today. This file
-- is what makes them true.
--
-- =====================================================================
-- AND WHY IT IS THE SAME MIGRATION AS THE LEDGER CHANGE
-- =====================================================================
-- The owner's decision of 8 September — "merge belt system so that user gains
-- belt xp via lessons and/or trade calls but has to take and pass a test to
-- earn the belt itself" — makes training progress LOAD-BEARING FOR A BELT.
-- docs/audit-2026-09-08/BELT-MERGE-spec.md §8 states the consequence: XP and
-- competencies cannot live in one AsyncStorage key on one handset if a belt
-- depends on them. So the persistence fix and the ledger widening are one
-- change, argued once, applied together. 0047 puts the exam on top of it.
--
-- =====================================================================
-- THE 0012 LMS TABLES ARE RETIRED HERE, AND THE ARGUMENT FOR THAT
-- =====================================================================
-- 0012 created `courses`, `course_modules`, `lessons` and `lesson_progress`
-- from docs/01_DATA_MODEL.md §12. Four years of intent, zero reads: a grep
-- across apps/ and workers/ finds no select, no insert, no RPC and no route
-- that touches any of the four. They describe a CMS-shaped curriculum — a
-- course containing modules containing lessons, each lesson a `content` blob
-- with a uuid primary key — and the curriculum this product actually ships is
-- `apps/mobile/src/features/training/curriculum.ts`: seven fixed days, thirty
-- one lesson nodes with STRING ids (`d1l1`), each one an ordered list of typed
-- screens in a TypeScript file that Metro bundles into the app.
--
-- Adopting them would mean giving every lesson a uuid the app does not have,
-- inventing a course and a module to hang them from, and keeping a `content`
-- jsonb column permanently empty because the content is in the bundle. That is
-- a mapping layer maintained for the sake of not deleting four empty tables.
--
-- The spec's instruction is the deciding one: "Decide explicitly whether to
-- adopt or retire them; do not leave a third unused progress store behind this
-- one." Retired. `lesson_progress` also carried a CLIENT WRITE GRANT (0014),
-- which is a live surface on a table nothing validates — the one thing worse
-- than an unused table.
--
-- NOTHING IS LOST. All four are empty of anything this product wrote: no route
-- ever inserted a row. `delete_account` (0032) names `lesson_progress` only in
-- a comment listing what cascades from `profiles`; dropping the table removes
-- the cascade along with the table and that function is unaffected.
-- `packages/shared/db.types.ts` is generated from the schema and will drop them
-- on its next regeneration; no TypeScript reads those entries today.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE CREATES
-- =====================================================================
-- The three new tables follow 0039 exactly: RLS ON, ZERO POLICIES, service role
-- only, reached through API routes that establish who is asking from a bearer
-- token. There is no `using (true)` here and no client write grant.
--
--   training_lesson_completions  one row per (learner, curriculum version,
--                                lesson). UPDATE is granted — this is a
--                                high-water record, not a ledger, and a better
--                                second run must be able to raise it. The
--                                LEDGER underneath it (`point_events`) stays
--                                append-only and is what pays.
--   training_competencies        one row per (learner, competency). Ratchets up.
--   training_checkpoints         where the member is inside a lesson they have
--                                not finished. Disposable by design.
--
-- =====================================================================
-- WHAT THIS FILE REFUSES TO DO
-- =====================================================================
--   - It does not let a phone write a point. Every award goes through a
--     definer function that is revoked from anon and authenticated, the same
--     posture 0039 takes for `award_points`.
--   - It does not pay for a lesson twice. See §5: the ledger `ref_id` for
--     training is the LESSON's id, so a replay collides with 0039's
--     `unique (source, ref_id)` and awards nothing. That is the audit's F12
--     ("repeating a lesson adds masteryGain again") fixed structurally rather
--     than remembered.
--   - It does not move anybody's belt. Points still decide the belt when this
--     file lands; 0047 is where the exam takes that over.
--   - It does not scale a lesson by trading accuracy. Training rows carry
--     multiplier 1.0 and a null `accuracy_at_award`: a losing month must not be
--     able to erase something a member learned.

-- =====================================================================
-- 1. RETIRING THE UNUSED CURRICULUM STORE
-- =====================================================================
-- Order matters: `lesson_progress` references `lessons` references
-- `course_modules` references `courses`.
drop table if exists lesson_progress;
drop table if exists lessons;
drop table if exists course_modules;
drop table if exists courses;

-- =====================================================================
-- 2. WHAT A LEARNER HAS DONE
-- =====================================================================

-- The curriculum the app is currently shipping. It is a NUMBER and not a hash
-- so that a human can read it in a row, and it is stamped on every completion
-- so that a future re-authoring of Day 3 does not silently claim the member
-- completed the NEW Day 3. Bumping it means editing this function in a
-- migration, which is the point: a curriculum version that can drift by accident
-- is not a version.
create or replace function training_curriculum_version() returns int
language sql immutable
as $$ select 1 $$;

create table if not exists training_lesson_completions (
  user_id uuid not null references profiles on delete cascade,
  -- The app's own lesson id (`d1l1`), not a uuid. The curriculum lives in the
  -- bundle and these strings ARE its primary keys; minting uuids for them here
  -- would mean maintaining a mapping table whose only job is translation.
  lesson_id text not null,
  curriculum_version int not null default training_curriculum_version(),

  day_id text not null,
  skill   text not null,

  /* The high-water record of every walk through this lesson. A replay updates
     this row; it never inserts a second one. That single fact is the audit's
     F12 fix: mastery is DERIVED from these rows (§6), so it cannot inflate on
     repeat however many times the lesson is re-run. */
  attempts        int     not null default 1,
  best_score_pct  numeric,
  mastery_gain    numeric not null default 0,

  -- The four XP kinds, kept apart exactly as `features/training/xp.ts` keeps
  -- them, because a single total cannot answer "how did you get this?" and that
  -- is precisely the question the anti-farming rule has to ask.
  xp_interactive numeric not null default 0,
  xp_video       numeric not null default 0,
  xp_practice    numeric not null default 0,
  xp_assessment  numeric not null default 0,

  -- Whether an assessment was reached AND cleared. Carried separately from the
  -- XP because "this lesson has no assessment" and "the assessment was failed"
  -- both produce zero assessment XP and are not the same thing to a tutor.
  assessment_passed boolean not null default false,

  first_completed_at timestamptz not null default now(),
  last_completed_at  timestamptz not null default now(),

  primary key (user_id, curriculum_version, lesson_id)
);

create index if not exists training_completions_user_idx
  on training_lesson_completions (user_id, last_completed_at desc);

comment on table training_lesson_completions is
  'One row per learner per lesson per curriculum version. A replay UPDATES it: '
  'best score rises, XP takes the better of each kind, mastery gain does not '
  'accumulate. Audit F12 is fixed by the primary key, not by remembering to '
  'check a list.';

-- The granular half of the trader profile: not "Market Basics 80%" but WHERE
-- inside it the member is weak. Kai needs this to teach rather than
-- congratulate, and 0047's belt eligibility reads it to answer "read a chart"
-- and "explain your risk".
create table if not exists training_competencies (
  user_id uuid not null references profiles on delete cascade,
  key     text not null,
  -- unproven | developing | passed | strong | mastered — the app's own ladder,
  -- from `CompetencySignal` in features/training/types.ts.
  signal  text not null,
  -- Which lesson last raised it, so a signal can always be traced to the work
  -- that produced it.
  source_lesson_id text,
  curriculum_version int not null default training_curriculum_version(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table training_competencies is
  'A stronger signal never gets overwritten by a weaker one - see '
  'training_signal_rank(). A bad retry cannot take back a demonstrated skill.';

-- WHERE THE MEMBER IS INSIDE AN UNFINISHED LESSON (audit F11).
--
-- The one authored lesson is a fourteen-screen sequence and leaving it today
-- restarts the run from screen one, answers included. That is the single most
-- expensive thing this product does to somebody's attention. A checkpoint is
-- written on every interaction and deleted on completion, so this table only
-- ever holds work in progress.
create table if not exists training_checkpoints (
  user_id   uuid not null references profiles on delete cascade,
  lesson_id text not null,
  curriculum_version int not null default training_curriculum_version(),
  -- Which screen to reopen on.
  screen_index int not null default 0,
  -- The answers already given, keyed by screen id. Opaque to SQL on purpose:
  -- the shape belongs to the lesson runner and this table is not the place to
  -- re-declare it.
  answers jsonb not null default '{}'::jsonb,
  -- The running score so far, so a resumed lesson does not restart its scoring.
  correct int not null default 0,
  answered int not null default 0,
  assessment_passed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

comment on table training_checkpoints is
  'Work in progress inside a lesson. Written on every interaction, deleted on '
  'completion. Losing one costs a member the tail of one lesson, never a record.';

-- =====================================================================
-- 3. THE LEDGER, WIDENED — NOT A SECOND LEDGER
-- =====================================================================
-- BELT-MERGE-spec.md §3: "Two ledgers would recreate the two-systems problem
-- this decision exists to end." So `point_events` grows four sources instead of
-- gaining a sibling table, and keeps every property that made it trustworthy:
-- append-only for every role including service_role, and `unique (source,
-- ref_id)` — which 0039 calls the most important line in that file and which
-- this change turns into the repeat-safety fix for training as well.
do $$
declare v_name text;
begin
  -- Found by definition rather than by name: 0039 wrote the check inline on the
  -- column, and a constraint renamed by a future edit must still be replaced
  -- rather than silently left beside the new one.
  select con.conname into v_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'point_events'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%community_call%'
   limit 1;
  if v_name is not null then
    execute format('alter table point_events drop constraint %I', v_name);
  end if;
end $$;

alter table point_events
  add constraint point_events_source_check check (source in (
    'community_call',      -- unchanged: their own published call resolved
    'kai_trade',           -- unchanged: they took a house alert, it resolved
    'lesson_interactive',  -- new: the teaching and quiz screens were walked
    'lesson_video',        -- new: the human layer was watched
    'lesson_practice',     -- new: a drill was done, something was produced
    'assessment_passed'    -- new: a measurement happened and was cleared
  ));

-- `won` is a question about a TRADE. A lesson is not won or lost, and forcing a
-- boolean onto it would make `wins`, `losses` and `accuracy` in the rollup
-- start counting lessons — which would put learning into the accuracy figure
-- printed beside every leaderboard row.
alter table point_events alter column won drop not null;

alter table point_events
  add constraint point_events_won_shape check (
    (source in ('community_call', 'kai_trade') and won is not null) or
    (source not in ('community_call', 'kai_trade') and won is null)
  );

-- TRAINING XP IS NEVER SCALED BY TRADING ACCURACY. A losing month must not be
-- able to erase something a member learned, and a hot streak must not make a
-- lesson worth more. Asserted in the table rather than trusted to the function
-- that writes it.
alter table point_events
  add constraint point_events_training_flat check (
    source in ('community_call', 'kai_trade')
    or (multiplier = 1.0 and accuracy_at_award is null)
  );

-- =====================================================================
-- 4. THE ROLLUP — TWO HALVES, BOTH VISIBLE
-- =====================================================================
-- BELT-MERGE-spec.md §4. `points` stays the sum and stays what it always was.
-- The two halves are stored beside it because 0047's eligibility needs BOTH and
-- lets NEITHER substitute for the other: thirty lessons must not be a Blue Belt
-- without a resolved call, and a sprayer of calls must not skip the learning.
alter table user_points
  add column if not exists xp_calls    numeric not null default 0,
  add column if not exists xp_training numeric not null default 0,
  add column if not exists belt_source text not null default 'legacy_points';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_points_belt_source_check'
  ) then
    alter table user_points
      add constraint user_points_belt_source_check
      check (belt_source in ('legacy_points', 'exam'));
  end if;
end $$;

comment on column user_points.xp_calls is
  'The trading half. Can go DOWN - a loss is -4. This is the leaderboard sort '
  'key from 0047 on: the board is a calls board and ranking it on the combined '
  'total would let a diligent student outrank a good caller on a board that '
  'claims to measure calling.';
comment on column user_points.xp_training is
  'The learning half. Can only go up, and only through a lesson that was '
  'completed once. Never scaled by accuracy.';
comment on column user_points.belt_source is
  'legacy_points = earned under 0039, before the exam existed. Nobody is '
  'demoted for holding one (spec §7); their NEXT rung needs the exam like '
  'everybody else''s.';

-- =====================================================================
-- 5. AWARDING TRAINING XP — AND THE REF_ID THAT MAKES REPLAY FREE
-- =====================================================================
-- The four award sizes are the curated-YouTube spec's, already deployed in
-- `features/training/xp.ts`, moved here so a belt never depends on a number a
-- phone chose. They go into `points_config()` beside the call awards so that
-- everything the app prints still comes from one place.
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
    -- 0046. The same order of magnitude as the call awards, so the two streams
    -- share a scale without renormalising. Video is deliberately the same size
    -- as interactive and smaller than practice: watching is the cheapest thing
    -- a member does, so it pays least per minute — and, by the rule in §5(b)
    -- below, buys no competency at all on its own.
    'training_xp', jsonb_build_object(
      'interactive', 10,
      'video',       10,
      'practice',    20,
      'assessment',  30
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
    )
  );
$$;

/* (a) THE REF_ID, AND IT IS THE WHOLE REPEAT-SAFETY FIX.
 *
 * `point_events.ref_id` is a uuid and the curriculum's ids are strings, so the
 * lesson id is hashed into the uuid space DETERMINISTICALLY. md5 is not used
 * here as a security primitive — it is used as a stable 128-bit name, which is
 * exactly what a v3 UUID is, and Postgres will cast its 32 hex characters
 * straight to uuid with no extension.
 *
 * THE VERSION IS DELIBERATELY NOT IN THE HASH. A completion row is versioned so
 * that re-authoring Day 3 does not claim the member finished the new Day 3; the
 * PAYMENT is not, because bumping the curriculum version must never re-open a
 * farm on lessons somebody has already been paid for.
 */
create or replace function training_ref_id(p_lesson_id text) returns uuid
language sql immutable
as $$ select md5('ccai.training.lesson:' || coalesce(p_lesson_id, ''))::uuid $$;

comment on function training_ref_id(text) is
  'The ledger ref for a lesson. Deterministic, so a SECOND completion of the '
  'same lesson collides with point_events unique(source, ref_id) and is paid '
  'nothing. Audit F12, fixed by a constraint instead of by a memory.';

/* (b) THE ANTI-FARMING RULE, MOVED SERVER-SIDE INTACT.
 *
 * `features/training/xp.ts` states it and `scripts/training-gates-test.mts`
 * walks every farming route through it: a competency is satisfied ONLY by a
 * PASSED assessment. Not by watching. Not by watching a lot. Not by a full
 * lesson of teaching screens with the assessment skipped.
 *
 * It is copied here rather than reworded because a belt now depends on it, and
 * a rule that exists in two different phrasings is a rule with two different
 * answers. This is the SQL half; the TypeScript half stays exactly as written.
 */
create or replace function training_competency_earned(p_assessment_xp numeric)
returns boolean
language sql immutable
as $$
  select coalesce(p_assessment_xp, 0)
         >= (points_config()->'training_xp'->>'assessment')::numeric
$$;

/* (c) A stronger signal never gets overwritten by a weaker one. */
create or replace function training_signal_rank(p_signal text) returns int
language sql immutable
as $$
  select case p_signal
           when 'mastered'   then 4
           when 'strong'     then 3
           when 'passed'     then 2
           when 'developing' then 1
           else 0
         end
$$;

/* (d) ONE AWARD, ONE KIND, ONE LESSON. Idempotent by the ledger's own unique
 *     constraint, exactly like `award_points`. It returns whether it paid so
 *     the caller never has to ask a second question. */
create or replace function award_training_xp(
  p_user_id   uuid,
  p_lesson_id text,
  p_kind      text,
  p_earned_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_base   numeric;
  v_ref    uuid := training_ref_id(p_lesson_id);
begin
  v_source := case p_kind
                when 'interactive' then 'lesson_interactive'
                when 'video'       then 'lesson_video'
                when 'practice'    then 'lesson_practice'
                when 'assessment'  then 'assessment_passed'
              end;
  if v_source is null then
    raise exception 'unknown_training_xp_kind' using errcode = '22023';
  end if;

  v_base := (points_config()->'training_xp'->>p_kind)::numeric;

  insert into point_events (
    user_id, source, ref_id, won, base_points, multiplier, points,
    accuracy_at_award, resolved_at
  ) values (
    p_user_id, v_source, v_ref, null, v_base, 1.0, v_base,
    null, coalesce(p_earned_at, now())
  )
  on conflict (source, ref_id) do nothing;

  if not found then
    -- Already paid for this lesson. Not an error: a member re-walking a lesson
    -- is the intended way to fix a weak score, and this is what stops it
    -- paying twice.
    return jsonb_build_object('awarded', false, 'reason', 'already_scored');
  end if;

  return jsonb_build_object('awarded', true, 'kind', p_kind, 'points', v_base);
end $$;

/* (e) ONE COMPLETED LESSON, WRITTEN WHOLE.
 *
 * The route hands over what the run produced and this decides what it is worth.
 * Everything in it is idempotent: run it ten times with the same arguments and
 * the member has one completion row, the same XP, and the same competencies.
 */
create or replace function record_lesson_completion(
  p_user_id uuid,
  p_lesson_id text,
  p_day_id text,
  p_skill text,
  p_score_pct numeric,
  p_mastery_gain numeric,
  p_xp jsonb,                 -- {interactive,video,practice,assessment}
  p_assessment_passed boolean,
  p_competencies jsonb        -- { "<key>": "<signal>", ... }
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int := training_curriculum_version();
  v_cfg     jsonb := points_config()->'training_xp';
  v_kind    text;
  v_paid    numeric := 0;
  v_awarded jsonb;
  v_key     text;
  v_signal  text;
  v_before  numeric;
  v_after   numeric;
begin
  insert into training_lesson_completions (
    user_id, lesson_id, curriculum_version, day_id, skill,
    attempts, best_score_pct, mastery_gain,
    xp_interactive, xp_video, xp_practice, xp_assessment,
    assessment_passed, first_completed_at, last_completed_at
  ) values (
    p_user_id, p_lesson_id, v_version, p_day_id, p_skill,
    1, p_score_pct, coalesce(p_mastery_gain, 0),
    coalesce((p_xp->>'interactive')::numeric, 0),
    coalesce((p_xp->>'video')::numeric, 0),
    coalesce((p_xp->>'practice')::numeric, 0),
    case when p_assessment_passed then coalesce((p_xp->>'assessment')::numeric, 0) else 0 end,
    coalesce(p_assessment_passed, false), now(), now()
  )
  on conflict (user_id, curriculum_version, lesson_id) do update set
    attempts = training_lesson_completions.attempts + 1,
    -- BEST of, never latest: a worse retry must not take back a good result,
    -- and re-walking a lesson to fix a weak score is behaviour to reward.
    best_score_pct = greatest(
      coalesce(training_lesson_completions.best_score_pct, -1),
      coalesce(excluded.best_score_pct, -1)
    ),
    -- MASTERY DOES NOT ACCUMULATE. This is the audit's F12: the mobile store
    -- added `result.masteryGain` unconditionally on every run while carefully
    -- de-duplicating the lesson id two lines above it, so the bar moved on
    -- every replay. One row per lesson, and the row holds the gain once.
    mastery_gain   = greatest(training_lesson_completions.mastery_gain, excluded.mastery_gain),
    xp_interactive = greatest(training_lesson_completions.xp_interactive, excluded.xp_interactive),
    xp_video       = greatest(training_lesson_completions.xp_video,       excluded.xp_video),
    xp_practice    = greatest(training_lesson_completions.xp_practice,    excluded.xp_practice),
    -- The exception that matters: somebody who failed the assessment first time
    -- banked nothing for it, and on the run where they pass it they should get
    -- it. Taking the better of each kind does that without ever paying twice.
    xp_assessment  = greatest(training_lesson_completions.xp_assessment,  excluded.xp_assessment),
    assessment_passed = training_lesson_completions.assessment_passed or excluded.assessment_passed,
    last_completed_at = now();

  -- Pay the ledger. Each kind at most once per lesson, EVER, enforced by
  -- unique (source, ref_id) rather than by this function remembering.
  foreach v_kind in array array['interactive', 'video', 'practice', 'assessment'] loop
    if v_kind = 'assessment' and not coalesce(p_assessment_passed, false) then
      continue;
    end if;
    if coalesce((p_xp->>v_kind)::numeric, 0) <= 0 then
      continue;
    end if;
    v_awarded := award_training_xp(p_user_id, p_lesson_id, v_kind);
    if (v_awarded->>'awarded')::boolean then
      v_paid := v_paid + (v_cfg->>v_kind)::numeric;
    end if;
  end loop;

  -- Competency signals ratchet up and never down.
  if p_competencies is not null and jsonb_typeof(p_competencies) = 'object' then
    for v_key, v_signal in select key, value #>> '{}' from jsonb_each(p_competencies) loop
      insert into training_competencies (user_id, key, signal, source_lesson_id, curriculum_version, updated_at)
      values (p_user_id, v_key, v_signal, p_lesson_id, v_version, now())
      on conflict (user_id, key) do update set
        signal = case
                   when training_signal_rank(excluded.signal) > training_signal_rank(training_competencies.signal)
                   then excluded.signal else training_competencies.signal
                 end,
        source_lesson_id = case
                   when training_signal_rank(excluded.signal) > training_signal_rank(training_competencies.signal)
                   then excluded.source_lesson_id else training_competencies.source_lesson_id
                 end,
        updated_at = now();
    end loop;
  end if;

  -- The lesson is finished, so there is no work in progress to resume.
  delete from training_checkpoints where user_id = p_user_id and lesson_id = p_lesson_id;

  select xp_training into v_before from user_points where user_id = p_user_id;
  perform recompute_points(p_user_id);
  select xp_training into v_after from user_points where user_id = p_user_id;

  return jsonb_build_object(
    'lesson_id',   p_lesson_id,
    'xp_awarded',  v_paid,
    'xp_training', coalesce(v_after, 0),
    'xp_training_before', coalesce(v_before, 0),
    'repeat',      v_paid = 0
  );
end $$;

-- =====================================================================
-- 6. THE ROLLUP KNOWS ABOUT TWO HALVES NOW
-- =====================================================================
-- Same function, same contract, same high-water belt. The additions: the two
-- halves are summed separately, and `wins` / `losses` / `accuracy` are computed
-- from CALL ROWS ONLY, because a lesson has no `won` and counting it would put
-- learning into the accuracy figure printed beside every board row.
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
  v_prev     text;
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

  select belt into v_prev from user_points where user_id = p_user_id;

  -- THE BELT IS STILL DECIDED BY THE CALL HALF ALONE while this file is the
  -- newest one applied — 0047 hands that job to the exam. Passing `v_calls`
  -- rather than `v_points` is what stops lesson XP from becoming a belt farm in
  -- the window between the two migrations: thirty lessons at 30 XP is a Blue
  -- Belt with no resolved call, and the belt on a member's name in a room is
  -- supposed to say something about what they can do in a market.
  v_belt := belt_for(v_calls);

  -- HIGH-WATER MARK, unchanged from 0039. If the computed belt is lower than
  -- the one already held, the held one stands.
  if v_prev is not null then
    if (select b.ord from jsonb_array_elements(v_cfg->'belts') with ordinality b(val, ord)
         where b.val->>'key' = v_belt)
       > (select b.ord from jsonb_array_elements(v_cfg->'belts') with ordinality b(val, ord)
           where b.val->>'key' = v_prev)
    then
      v_belt := v_prev;
    end if;
  end if;

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
    belt        = excluded.belt,
    belt_reached_at = case
      when user_points.belt is distinct from excluded.belt then now()
      else user_points.belt_reached_at
    end,
    updated_at = now();
end $$;

-- =====================================================================
-- 7. THE LEARNER PROFILE, ASSEMBLED IN ONE PLACE
-- =====================================================================
-- The shape the app already renders — completed lessons, per-day progress with
-- its XP ledger, mastery per skill, competency signals — read out of the rows
-- above rather than out of a phone. `mastery` is DERIVED (summed gains, capped
-- at 100) rather than stored, which is the second half of the F12 fix: there is
-- no accumulator anywhere for a replay to increment.
create or replace function training_profile(p_user_id uuid) returns jsonb
language sql
security definer
set search_path = public
as $$
  with rows as (
    select * from training_lesson_completions
     where user_id = p_user_id
       and curriculum_version = training_curriculum_version()
  )
  select jsonb_build_object(
    'curriculum_version', training_curriculum_version(),
    'completed_lesson_ids',
      coalesce((select jsonb_agg(lesson_id order by first_completed_at) from rows), '[]'::jsonb),
    'mastery',
      coalesce((
        select jsonb_object_agg(skill, least(100, total))
          from (select skill, sum(mastery_gain) as total from rows group by skill) m
      ), '{}'::jsonb),
    'day_progress',
      coalesce((
        select jsonb_object_agg(day_id, d) from (
          select day_id,
                 jsonb_build_object(
                   'completed_lesson_ids', jsonb_agg(lesson_id order by first_completed_at),
                   'best_score_pct', max(best_score_pct),
                   'lesson_xp', jsonb_object_agg(lesson_id, jsonb_build_object(
                     'interactive', xp_interactive,
                     'video',       xp_video,
                     'practice',    xp_practice,
                     'assessment',  xp_assessment
                   ))
                 ) as d
            from rows group by day_id
        ) days
      ), '{}'::jsonb),
    'competencies',
      coalesce((
        select jsonb_object_agg(key, signal) from training_competencies where user_id = p_user_id
      ), '{}'::jsonb),
    'checkpoints',
      coalesce((
        select jsonb_object_agg(lesson_id, jsonb_build_object(
                 'screen_index', screen_index,
                 'answers', answers,
                 'correct', correct,
                 'answered', answered,
                 'assessment_passed', assessment_passed,
                 'updated_at', updated_at
               ))
          from training_checkpoints
         where user_id = p_user_id
           and curriculum_version = training_curriculum_version()
      ), '{}'::jsonb),
    'xp', jsonb_build_object(
      'interactive', coalesce((select sum(xp_interactive) from rows), 0),
      'video',       coalesce((select sum(xp_video)       from rows), 0),
      'practice',    coalesce((select sum(xp_practice)    from rows), 0),
      'assessment',  coalesce((select sum(xp_assessment)  from rows), 0)
    ),
    'xp_training', coalesce((select xp_training from user_points where user_id = p_user_id), 0),
    'xp_calls',    coalesce((select xp_calls    from user_points where user_id = p_user_id), 0)
  );
$$;

-- Where the member is inside an unfinished lesson. Upsert, because it is
-- written on every interaction and the last write is the only one that matters.
create or replace function save_training_checkpoint(
  p_user_id uuid,
  p_lesson_id text,
  p_screen_index int,
  p_answers jsonb,
  p_correct int,
  p_answered int,
  p_assessment_passed boolean
) returns void
language sql
security definer
set search_path = public
as $$
  insert into training_checkpoints (
    user_id, lesson_id, curriculum_version, screen_index, answers,
    correct, answered, assessment_passed, updated_at
  ) values (
    p_user_id, p_lesson_id, training_curriculum_version(),
    greatest(0, coalesce(p_screen_index, 0)), coalesce(p_answers, '{}'::jsonb),
    greatest(0, coalesce(p_correct, 0)), greatest(0, coalesce(p_answered, 0)),
    coalesce(p_assessment_passed, false), now()
  )
  on conflict (user_id, lesson_id) do update set
    curriculum_version = excluded.curriculum_version,
    screen_index       = excluded.screen_index,
    answers            = excluded.answers,
    correct            = excluded.correct,
    answered           = excluded.answered,
    assessment_passed  = excluded.assessment_passed,
    updated_at         = now();
$$;

-- =====================================================================
-- 8. MIGRATING ONE DEVICE'S PROFILE UP, ONCE, FOR ITS OWNER
-- =====================================================================
-- Every member who has trained already has their progress in AsyncStorage and
-- nowhere else. Throwing it away to fix the architecture would punish exactly
-- the people who used the feature.
--
-- WHAT THIS REFUSES TO BELIEVE. The stored blob carries no account id — that is
-- the bug — so nothing about it can prove whose it is. So this function is not
-- a merge and not an import: it is a CLAIM, and it is only honoured when the
-- account has NO training rows of its own. A second account signing in on the
-- same handset finds either a claimed blob (the app deletes it after a
-- successful claim) or a server profile that already has rows, and in both
-- cases inherits nothing. The one case this cannot distinguish — two people
-- sharing a handset where the FIRST to sign in was not the learner — is
-- resolved in the app by asking, out loud, before this is ever called.
--
-- It writes through `record_lesson_completion`, so a claimed lesson is paid
-- exactly what a lesson completed today is paid, and no more.
create or replace function claim_local_training_profile(
  p_user_id uuid,
  p_profile jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
  v_lesson   jsonb;
  v_count    int := 0;
begin
  select count(*) into v_existing
    from training_lesson_completions where user_id = p_user_id;
  if v_existing > 0 then
    return jsonb_build_object('claimed', false, 'reason', 'already_has_progress', 'lessons', 0);
  end if;

  for v_lesson in select * from jsonb_array_elements(coalesce(p_profile->'lessons', '[]'::jsonb)) loop
    perform record_lesson_completion(
      p_user_id,
      v_lesson->>'lesson_id',
      v_lesson->>'day_id',
      v_lesson->>'skill',
      nullif(v_lesson->>'score_pct', '')::numeric,
      coalesce((v_lesson->>'mastery_gain')::numeric, 0),
      coalesce(v_lesson->'xp', '{}'::jsonb),
      coalesce((v_lesson->>'assessment_passed')::boolean, false),
      coalesce(v_lesson->'competencies', '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('claimed', true, 'lessons', v_count);
end $$;

-- =====================================================================
-- 9. RLS, GRANTS, AND WHO MAY WRITE WHAT
-- =====================================================================
alter table training_lesson_completions enable row level security;
alter table training_competencies       enable row level security;
alter table training_checkpoints        enable row level security;

revoke all on training_lesson_completions from anon, authenticated;
revoke all on training_competencies       from anon, authenticated;
revoke all on training_checkpoints        from anon, authenticated;

-- UPDATE is granted on the two progress tables and that is the difference
-- between them and `point_events`: these are high-water RECORDS, which have to
-- be able to rise. The ledger that actually pays stays append-only for
-- everybody, service_role included, and it is the one a belt is computed from.
grant select, insert, update on training_lesson_completions to service_role;
grant select, insert, update on training_competencies       to service_role;
grant select, insert, update, delete on training_checkpoints to service_role;

revoke all on function training_curriculum_version() from public, anon, authenticated;
revoke all on function training_ref_id(text)         from public, anon, authenticated;
revoke all on function training_signal_rank(text)    from public, anon, authenticated;
revoke all on function training_competency_earned(numeric) from public, anon, authenticated;
revoke all on function award_training_xp(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function record_lesson_completion(uuid, text, text, text, numeric, numeric, jsonb, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function training_profile(uuid) from public, anon, authenticated;
revoke all on function save_training_checkpoint(uuid, text, int, jsonb, int, int, boolean)
  from public, anon, authenticated;
revoke all on function claim_local_training_profile(uuid, jsonb) from public, anon, authenticated;

grant execute on function training_curriculum_version() to service_role;
grant execute on function training_ref_id(text)         to service_role;
grant execute on function training_signal_rank(text)    to service_role;
grant execute on function training_competency_earned(numeric) to service_role;
grant execute on function award_training_xp(uuid, text, text, timestamptz) to service_role;
grant execute on function record_lesson_completion(uuid, text, text, text, numeric, numeric, jsonb, boolean, jsonb)
  to service_role;
grant execute on function training_profile(uuid) to service_role;
grant execute on function save_training_checkpoint(uuid, text, int, jsonb, int, int, boolean) to service_role;
grant execute on function claim_local_training_profile(uuid, jsonb) to service_role;

-- =====================================================================
-- 10. BACKFILL: EVERY EXISTING ROLLUP GETS ITS TWO HALVES
-- =====================================================================
-- `xp_calls` and `xp_training` default to 0, which would be a lie about every
-- member who already has points. Recomputing from the ledger is the same move
-- 0039 §5 makes and it is why the rollup is treated as a cache.
do $$
declare r record;
begin
  for r in select user_id from user_points loop
    perform recompute_points(r.user_id);
  end loop;
end $$;

-- =====================================================================
-- 11. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) THE FOUR AWARD SIZES ARE THE ONES THE APP ALREADY SHIPS, and watching is
--     never worth more than doing. `training-gates-test.mts` asserts the same
--     four numbers against `xp.ts`; if these two ever disagree, one of the two
--     halves of the anti-farming rule is grading against the wrong scale.
do $$
declare v jsonb := points_config()->'training_xp';
begin
  if (v->>'interactive')::numeric <> 10 or (v->>'video')::numeric <> 10
     or (v->>'practice')::numeric <> 20 or (v->>'assessment')::numeric <> 30 then
    raise exception '0046: the training XP awards are not the spec''s 10/10/20/30.';
  end if;
  if (v->>'video')::numeric >= (v->>'practice')::numeric
     or (v->>'video')::numeric >= (v->>'assessment')::numeric then
    raise exception '0046: watching is worth as much as doing. Belts would be farmable by letting videos play.';
  end if;
end $$;

-- (b) ONLY A PASSED ASSESSMENT SATISFIES A COMPETENCY. The rule `xp.ts` states
--     and `training-gates-test.mts` walks every farming route through, asserted
--     on the server copy so the two cannot drift into different answers.
--
--     NOTE WHAT THE ARGUMENT IS. `training_competency_earned` is handed the
--     ASSESSMENT line and nothing else — the interactive, video and practice
--     balances are not passed to it at all, which is the enforcement rather
--     than a detail of it. A day of watching arrives here as 0.
do $$
begin
  if training_competency_earned(0) then
    raise exception '0046: a lesson that measured nothing satisfies a competency.';
  end if;
  if training_competency_earned(10) then
    raise exception '0046: ten XP satisfies a competency. The award is 30 and it is all-or-nothing.';
  end if;
  if training_competency_earned(29) then
    raise exception '0046: a part-marked assessment satisfies a competency. The runner only ever writes the full award, and only on a pass.';
  end if;
  if not training_competency_earned(30) then
    raise exception '0046: a passed assessment does NOT satisfy a competency. That is the only thing that should.';
  end if;
end $$;

-- (c) THE SAME LESSON IS NEVER PAID TWICE, and different lessons never collide.
do $$
begin
  if training_ref_id('d1l1') <> training_ref_id('d1l1') then
    raise exception '0046: the training ref id is not deterministic. Every replay would pay again.';
  end if;
  if training_ref_id('d1l1') = training_ref_id('d1l2') then
    raise exception '0046: two different lessons hash to the same ledger ref. One of them can never be paid.';
  end if;
end $$;

-- (d) THE LEDGER STILL REFUSES A MALFORMED ROW. A trade without a verdict and a
--     lesson WITH one are both nonsense, and the two constraints are what say
--     so. Asserted from the catalog rather than by attempting an insert: an
--     insert on a fresh database is refused by the foreign key first, which
--     would let this pass for entirely the wrong reason.
do $$
declare v_shape text; v_flat text;
begin
  select pg_get_constraintdef(con.oid) into v_shape
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'point_events' and con.conname = 'point_events_won_shape';
  -- `ilike`, because pg_get_constraintdef normalises the expression and prints
  -- `won IS NULL`. A case-sensitive match here passes on nothing and fails on
  -- everything, which is the most confusing kind of assertion there is.
  if v_shape is null or v_shape not ilike '%won is null%' then
    raise exception '0046: nothing stops a lesson row carrying a win/loss verdict.';
  end if;

  select pg_get_constraintdef(con.oid) into v_flat
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'point_events' and con.conname = 'point_events_training_flat';
  if v_flat is null or v_flat not ilike '%multiplier = 1.0%' then
    raise exception '0046: training XP can be scaled by trading accuracy. A losing month must not erase what somebody learned.';
  end if;
end $$;

-- (e) THE LEDGER IS STILL APPEND-ONLY FOR EVERYONE, service_role included.
--     0039 §8(d), re-run because this file altered the table.
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
    raise exception '0046: point_events is editable by %. A ledger a route can revise is not a ledger.', v_bad;
  end if;
end $$;

-- (f) ZERO POLICIES ON THE NEW TABLES, AND NO CLIENT WRITE GRANT ANYWHERE NEW.
--     0033 §8/§10's pair, pointed at what this file created. `lesson_progress`
--     is GONE from the allowlist because the table is gone — leaving it there
--     would let a future migration re-create a client-writable progress table
--     under a name this assertion already forgives.
do $$
declare v_count int; v_bad text;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename in ('training_lesson_completions', 'training_competencies', 'training_checkpoints');
  if v_count > 0 then
    raise exception '0046: % policy(ies) exist on the training tables. All three are service-role only.', v_count;
  end if;

  select string_agg(distinct format('%s(%s)', g.table_name, g.grantee), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and g.table_name not in (
       'profiles', 'notification_prefs', 'setup_alert_prefs',
       'watchlists', 'watchlist_items', 'live_requests', 'push_subscriptions'
     );
  if v_bad is not null then
    raise exception '0046: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (g) THE RETIRED TABLES ARE ACTUALLY GONE, all four of them. A half-retired
--     store is the third progress store the spec told this file not to leave.
do $$
declare v_left text;
begin
  select string_agg(table_name, ', ') into v_left
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('courses', 'course_modules', 'lessons', 'lesson_progress');
  if v_left is not null then
    raise exception '0046: the 0012 LMS tables are still here (%). Adopt them or retire them, not both.', v_left;
  end if;
end $$;

-- (h) THE PROFILE FUNCTION ANSWERS FOR SOMEBODY WITH NOTHING. An empty profile
--     is the correct answer for a member who has not started; a function that
--     throws is not, and the difference only shows up when they open the app.
do $$
declare v jsonb;
begin
  v := training_profile('00000000-0000-0000-0000-000000000000'::uuid);
  if v->>'completed_lesson_ids' <> '[]' then
    raise exception '0046: a learner who has done nothing is credited with lessons.';
  end if;
end $$;

-- =====================================================================
-- 12. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) A lesson completed twice pays once. As service_role:
--
--   select record_lesson_completion('<user>', 'd1l1', 'day-1', 'market_basics',
--     100, 20, '{"interactive":10,"video":10,"practice":20,"assessment":30}'::jsonb,
--     true, '{"stock_ownership":"mastered"}'::jsonb);
--   -> {"xp_awarded": 70, "repeat": false, ...}
--   ...the same statement again:
--   -> {"xp_awarded": 0,  "repeat": true,  ...}   <- F12, structurally
--
-- (ii) And the mastery bar did not move the second time:
--
--   select mastery_gain, attempts from training_lesson_completions
--    where user_id = '<user>' and lesson_id = 'd1l1';
--   -> expected: one row, attempts 2, mastery_gain unchanged.
--
-- (iii) The two halves are separate and the training half never scales:
--
--   select points, xp_calls, xp_training, accuracy from user_points where user_id = '<user>';
--   select source, points, multiplier, accuracy_at_award, won from point_events
--    where user_id = '<user>' order by id;
--   -> expected: every lesson row is multiplier 1.0, accuracy null, won null.
--
-- (iv) Accuracy still counts only calls. Award a lesson to somebody with a
--      trading record and read `accuracy` back: it must not move.
--
-- (v) A learner who has done nothing:
--
--   select jsonb_pretty(training_profile('<fresh user>'));
--   -> expected: empty arrays and empty objects, no nulls, no error.
