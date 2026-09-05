-- 0030 — Kai credits: what a person is allowed to ask for, and the reason for
--        every number in that allowance.
--
-- THE GAP THIS CLOSES. 0029 wrote down what Kai COSTS. Nothing wrote down what
-- a person is ALLOWED, so there was no limit of any kind on the app: one script,
-- one shared login or one runaway loop could spend the whole month's model
-- budget and nobody would find out until the invoice.
--
-- WHAT A CREDIT IS. A credit is a fixed slice of the work one question causes,
-- measured in the provider's own units and priced AS IF THE CACHE WERE ALWAYS
-- WARM:
--
--     chargeable units = input_tokens
--                      + cache_read_input_tokens x 0.1
--                      + output_tokens x (output price / input price)
--
-- `cache_creation_input_tokens` — the cold-start premium for being the first
-- question of a session — is DELIBERATELY EXCLUDED. That number is a property
-- of our own cache state, not of anything the person typed. It is invisible to
-- them, they cannot avoid it, and it is not defensible at a support desk. We
-- absorb it. The tier's DOLLAR CEILING below is measured on true cost including
-- that premium, so the money is still accounted for; the difference is a real
-- cost we choose to eat, and the admin view shows exactly how big it is.
--
-- THE SIZE OF A CREDIT is written in ONE place — `apps/api/src/lib/kai/plans.ts`
-- — never here, and never in a route. Same rule as 0029 made for prices.
--
-- TWO LIMITS, NOT ONE, AND THEY RUN ON DIFFERENT CLOCKS.
--
--   the ALLOWANCE  a number of credits, granted DAILY on every tier, no
--                  rollover. Ten on free, forty on Pro, seventy-five on VIP.
--                  Daily on all three so a runaway loop or a shared login
--                  costs one day rather than a month.
--   the CEILING    a dollar cap on real model cost across the MONTH. None on
--                  free, $10 on Pro, $20 on VIP. Enforced on true dollars from
--                  0029 — cache writes included, because that is money that
--                  actually left — and it overrides the daily allowance.
--
-- Either can bind first and they mean different things when they do, so they
-- are stored and reported separately rather than collapsed into one number.
--
-- THREE TABLES, BECAUSE A BALANCE MUST BE EXPLAINABLE.
--
--   kai_credit_periods  one row per person per day: what they were granted,
--                       what they have used, frozen so it cannot move under
--                       them mid-period.
--   kai_credit_wallets  purchased credits, which do NOT expire at the reset.
--                       Kept apart from the grant precisely so "what did I pay
--                       for" and "what was I given" never blur together.
--   kai_credit_ledger   one row per grant, spend, top-up, reset and correction.
--                       A bare integer that goes down cannot answer a dispute;
--                       a row that says when, why, how many units and what it
--                       really cost can.
--
-- SECURITY. Same posture as 0029 and 0025: RLS ON, ZERO POLICIES, service role
-- only. `anon` and `authenticated` are granted nothing on any of the three
-- tables and cannot execute any of the functions. A person reads their own
-- balance through the API, which asks on their behalf — the client is never
-- given a door of its own to a table it could also learn to write to.

-- ---------------------------------------------------------------------------
-- 0. The plan vocabulary widens.
-- ---------------------------------------------------------------------------
-- `subscriptions.tier` was ('free','premium'). The owner's plans are Pro and
-- VIP, so both names are added and the old one is KEPT: rows already saying
-- 'premium' stay valid and the API maps 'premium' onto the VIP plan, which is
-- the one at the same price. Nothing has to be back-filled and no live row
-- becomes invalid the moment this runs.
alter table subscriptions drop constraint if exists subscriptions_tier_check;
alter table subscriptions add constraint subscriptions_tier_check
  check (tier in ('free', 'premium', 'pro', 'vip'));

-- ---------------------------------------------------------------------------
-- 1. kai_credit_periods — one day of allowance, and what became of it
-- ---------------------------------------------------------------------------
-- ONE TABLE FOR EVERY TIER, and that is the point: a free person runs through
-- exactly the same enforcement as a paying one. A second, cheaper path for free
-- accounts is a path that drifts out of step and stops being enforced at all.
--
-- `period_kind` is 'day' for every plan today. The column exists because the
-- shape of a period is a product decision that has already changed once this
-- week, and a schema that can only express one shape has to be migrated the
-- next time it changes.
create table if not exists kai_credit_periods (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid        not null,

  period_kind              text        not null check (period_kind in ('day', 'month')),
  -- THE IDEMPOTENCY KEY, and the reason this is a text column rather than a
  -- timestamp. '2026-09-05' for a day, '2026-09' for a month, computed in the
  -- person's own timezone. A unique index on it is what makes a second grant
  -- in the same day IMPOSSIBLE rather than merely unlikely: two requests
  -- racing, a replayed call, or an app restart all collide on the constraint.
  -- Application logic cannot make that promise; a constraint can.
  period_key               text        not null,
  -- The same boundary as an instant, for querying against `kai_model_usage`.
  period_start             timestamptz not null,
  period_end               timestamptz not null,

  plan_key                 text        not null,

  -- THE DAY'S ALLOWANCE, FROZEN. Copied from the plan when the day opens and
  -- STORED, not recomputed on every read: an allowance that moves while someone
  -- is spending it is not an allowance. It also means a plan change tomorrow
  -- cannot rewrite what somebody was told they had today.
  granted_credits          integer     not null,
  -- The MONTHLY dollar ceiling this plan carries, copied here for the record.
  -- NULL on free, which has no ceiling — the ten credits are the whole limit.
  -- Never 0, which would read as "no spending allowed".
  cost_ceiling_usd         numeric(10, 4),
  -- What a credit was measured to be costing when this day opened. Nothing is
  -- derived from it — the allowances are stated numbers — but it is the figure
  -- that says whether the ceiling is about to bite, so it is recorded at the
  -- moment it was true rather than reconstructed later.
  basis_usd_per_credit     numeric(12, 6),
  -- 'measured' when that figure came from this window's own ledger, 'fallback'
  -- when there was not enough traffic to measure it. Never a silent difference
  -- between the two.
  basis_source             text        not null default 'fallback',

  used_credits             integer     not null default 0,
  -- Chargeable units actually consumed, kept alongside the credits so the
  -- rounding-in-the-user's-favour can be quantified rather than assumed.
  used_units               bigint      not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  -- ONE GRANT PER PERSON PER PERIOD. Enforced here and nowhere else.
  unique (user_id, period_kind, period_key)
);

comment on table kai_credit_periods is
  'One row per person per day: the credit grant, what it has cost, and consumption. Service role only.';
comment on column kai_credit_periods.period_key is
  'Idempotency key for the grant: YYYY-MM-DD in the person''s own timezone. The unique index on it is what makes a second grant in one day impossible.';
comment on column kai_credit_periods.basis_usd_per_credit is
  'What one credit was measured to be costing when this period opened. Reporting only — no allowance is derived from it.';

create index if not exists kai_credit_periods_user_idx
  on kai_credit_periods (user_id, period_start desc);

-- ---------------------------------------------------------------------------
-- 2. kai_credit_wallets — bought, and therefore not taken away at reset
-- ---------------------------------------------------------------------------
create table if not exists kai_credit_wallets (
  user_id            uuid primary key,
  -- Purchased credits still unspent. Survives the daily reset by design: the
  -- day's grant is what expires, money is not.
  topup_credits      integer     not null default 0 check (topup_credits >= 0),
  lifetime_purchased integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

comment on table kai_credit_wallets is
  'Purchased credits, which do not expire at the monthly reset. Service role only.';

-- ---------------------------------------------------------------------------
-- 3. kai_credit_ledger — every change, with its reason
-- ---------------------------------------------------------------------------
create table if not exists kai_credit_ledger (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  user_id          uuid        not null,
  period_id        uuid        references kai_credit_periods (id) on delete set null,

  -- grant     the month opening
  -- spend     one answered question
  -- topup     a purchase
  -- expiry    a grant lapsing at the daily reset (recorded so a balance drop
  --           is never unexplained, even when nobody spent anything)
  -- adjust    a correction made by staff, always with a note
  kind             text        not null
                   check (kind in ('grant', 'spend', 'topup', 'expiry', 'adjust')),

  -- SIGNED. +granted, -spent. Summing this column per person must reproduce
  -- the balance; if it ever does not, the ledger is right and the counter is
  -- wrong.
  credits          integer     not null,

  -- Which pot moved. Kept explicit so "you took my purchased credits first"
  -- is answerable from the row rather than from the code.
  bucket           text        not null default 'grant'
                   check (bucket in ('grant', 'topup', 'none')),

  -- WHAT THE CHARGE WAS COMPUTED FROM. `units` is the cache-neutral chargeable
  -- total; `cost_usd` is what those model calls REALLY cost including the cache
  -- writes we absorbed. The two together are the whole audit: a support answer
  -- can say "that question was N units, which is C credits, and it cost us $X".
  units            bigint,
  cost_usd         numeric(14, 6),

  -- The question this row is about. Joins straight to kai_model_usage, which is
  -- why the dollars are NOT duplicated per model call here.
  request_id       text,
  conversation_id  uuid,

  -- Idempotency for anything that arrives from outside: a Stripe event id, a
  -- checkout session, a staff action id. A webhook delivered twice must not
  -- grant twice.
  source_ref       text,
  note             text
);

comment on table kai_credit_ledger is
  'Append-only explanation of every credit granted, spent, purchased, expired or corrected. Service role only.';
comment on column kai_credit_ledger.units is
  'Cache-neutral chargeable units: input + cache_read*0.1 + output*(out/in price ratio). Excludes cache_creation on purpose.';
comment on column kai_credit_ledger.cost_usd is
  'True dollars for the same question, cache writes included. The gap to `units` is the cold-start premium we absorb.';

create index if not exists kai_credit_ledger_user_idx    on kai_credit_ledger (user_id, created_at desc);
create index if not exists kai_credit_ledger_period_idx  on kai_credit_ledger (period_id);
create index if not exists kai_credit_ledger_request_idx on kai_credit_ledger (request_id);
-- One external event grants once, forever.
create unique index if not exists kai_credit_ledger_source_ref_idx
  on kai_credit_ledger (source_ref) where source_ref is not null;

-- ---------------------------------------------------------------------------
-- 4. Locks
-- ---------------------------------------------------------------------------
alter table kai_credit_periods enable row level security;
alter table kai_credit_wallets enable row level security;
alter table kai_credit_ledger  enable row level security;
-- Intentionally no policies on any of the three. See the SECURITY note above.

revoke all on kai_credit_periods from anon, authenticated;
revoke all on kai_credit_wallets from anon, authenticated;
revoke all on kai_credit_ledger  from anon, authenticated;
revoke all on sequence kai_credit_ledger_id_seq from anon, authenticated;

grant all on kai_credit_periods to service_role;
grant all on kai_credit_wallets to service_role;
grant all on kai_credit_ledger  to service_role;
grant usage, select on sequence kai_credit_ledger_id_seq to service_role;

-- `create trigger if not exists` does not exist in Postgres, and this file has
-- to be safe to run twice.
drop trigger if exists set_updated_at on public.kai_credit_periods;
create trigger set_updated_at before update on public.kai_credit_periods
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.kai_credit_wallets;
create trigger set_updated_at before update on public.kai_credit_wallets
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 5. kai_credit_state — open the month if needed, then say where they stand
-- ===========================================================================
--
-- ONE CALL, ONE TRANSACTION, because the alternative is four round trips that
-- can interleave with each other on a fast double-tap and grant the same period
-- twice. Opening a period writes its `grant` ledger row in the same statement,
-- so a granted balance with no explanation is not a state this table can reach.
--
-- THE FREE DAILY GRANT IS THE PLACE SOMEONE WOULD ATTACK. It is the only
-- allowance that arrives without money changing hands, so it is protected in
-- the database rather than in a route:
--
--   * the unique key on (user_id, period_kind, period_key) makes a second grant
--     for the same day a constraint violation, not a race the code has to win;
--   * a daily key must be STRICTLY LATER than the newest day this person has
--     already been granted. A clock or a timezone moved backwards therefore
--     buys nothing at all, and moved forwards buys at most one day once — the
--     whole timezone range is only 26 hours wide — after which they are simply
--     ahead of themselves and get nothing more.
--
-- The caller supplies the plan and the arithmetic. That is deliberate: prices,
-- ceilings and the size of a credit live in one TypeScript file and this
-- function never second-guesses them.
create or replace function kai_credit_state(
  p_user_id              uuid,
  p_period_kind          text,
  p_period_key           text,
  p_period_start         timestamptz,
  p_period_end           timestamptz,
  p_plan_key             text,
  p_granted_credits      integer,
  p_cost_ceiling_usd     numeric,
  p_basis_usd_per_credit numeric,
  p_basis_source         text,
  p_day_start            timestamptz,
  -- The start of the MONTHLY ceiling window, which is a different window from
  -- the daily credit period on every paid tier. NULL on free, which has no
  -- ceiling and therefore nothing to add up.
  p_ceiling_since        timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period      kai_credit_periods;
  v_key         text := p_period_key;
  v_newest      text;
  v_wallet      kai_credit_wallets;
  v_used_today  integer;
  v_spent_usd   numeric;
begin
  -- The monotonic guard, daily periods only. Moving a clock back must never
  -- reopen a day that has already been spent.
  if p_period_kind = 'day' then
    select max(period_key) into v_newest
    from kai_credit_periods
    where user_id = p_user_id and period_kind = 'day';
    if v_newest is not null and v_newest > v_key then
      v_key := v_newest;
    end if;
  end if;

  -- Opened once. `on conflict do nothing` then re-select is the shape that is
  -- safe under two simultaneous first-messages.
  insert into kai_credit_periods (
    user_id, period_kind, period_key, period_start, period_end, plan_key,
    granted_credits, cost_ceiling_usd, basis_usd_per_credit, basis_source
  ) values (
    p_user_id, p_period_kind, v_key, p_period_start, p_period_end, p_plan_key,
    greatest(p_granted_credits, 0), p_cost_ceiling_usd, p_basis_usd_per_credit,
    coalesce(p_basis_source, 'fixed')
  )
  on conflict (user_id, period_kind, period_key) do nothing;

  select * into v_period
  from kai_credit_periods
  where user_id = p_user_id and period_kind = p_period_kind and period_key = v_key;

  /*
   * AN UPGRADE TAKES EFFECT NOW. A DOWNGRADE TAKES EFFECT TOMORROW.
   *
   * The day's grant is frozen so it cannot move while somebody is spending it,
   * which is right — and it produced a real defect the first time this was
   * tested: a free account that opened its day, then paid for Pro an hour
   * later, was still on ten credits until midnight. They paid $59 and nothing
   * happened. Worse, the plan's dollar ceiling was still the free plan's NULL,
   * so the backstop was not being applied to them at all.
   *
   * So the row follows the plan UPWARDS the moment the plan changes: the extra
   * credits are added, the ceiling is written on, and the difference goes in
   * the ledger as an `adjust` so the balance still explains itself.
   *
   * It never follows the plan DOWNWARDS. Somebody who cancels keeps what they
   * were told they had for the rest of today; tomorrow opens on the new plan.
   * Taking credits back out of somebody's hands mid-day is not worth the few
   * pennies it saves.
   */
  if v_period.plan_key is distinct from p_plan_key then
    update kai_credit_periods
       set plan_key             = p_plan_key,
           cost_ceiling_usd     = p_cost_ceiling_usd,
           granted_credits      = greatest(granted_credits, greatest(p_granted_credits, 0)),
           basis_usd_per_credit = p_basis_usd_per_credit,
           basis_source         = coalesce(p_basis_source, basis_source)
     where id = v_period.id;

    if p_granted_credits > v_period.granted_credits then
      insert into kai_credit_ledger (user_id, period_id, kind, credits, bucket, note)
      values (
        p_user_id, v_period.id, 'adjust',
        p_granted_credits - v_period.granted_credits, 'grant',
        format('plan changed from %s to %s part way through %s',
               v_period.plan_key, p_plan_key, v_period.period_key)
      );
    end if;

    select * into v_period from kai_credit_periods where id = v_period.id;
  end if;

  -- The grant row is written only alongside a period that did not exist a
  -- moment ago, which is what makes the ledger sum and the counter agree.
  if not exists (
    select 1 from kai_credit_ledger
    where period_id = v_period.id and kind = 'grant'
  ) then
    insert into kai_credit_ledger (user_id, period_id, kind, credits, bucket, note)
    values (
      p_user_id, v_period.id, 'grant', v_period.granted_credits, 'grant',
      case
        when v_period.cost_ceiling_usd is null
          then format('%s plan: %s credits for %s', v_period.plan_key,
                      v_period.granted_credits, v_period.period_key)
        else format('%s plan: $%s of model cost at $%s a credit',
                    v_period.plan_key, v_period.cost_ceiling_usd,
                    v_period.basis_usd_per_credit)
      end
    );
  end if;

  insert into kai_credit_wallets (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select * into v_wallet from kai_credit_wallets where user_id = p_user_id;

  -- The daily safety cap counts spends since the start of the caller's day. On
  -- free that is the same window as the period itself, which is the point.
  select coalesce(-sum(credits), 0)::integer into v_used_today
  from kai_credit_ledger
  where user_id = p_user_id and kind = 'spend' and created_at >= p_day_start;

  -- THE HARD BACKSTOP, MEASURED ON REAL MONEY, OVER THE MONTH.
  --
  -- Not on credits, and not on a running counter that could drift: the sum of
  -- what the model actually charged this person since the ceiling window
  -- opened, straight off 0029's ledger. Cache writes ARE included here — they
  -- are real money out of the door, even though the person is not billed for
  -- them. That asymmetry is deliberate and this is the line where it shows.
  --
  -- Note the window is `p_ceiling_since`, not the credit period: the allowance
  -- resets every day and the ceiling does not.
  if p_ceiling_since is null then
    v_spent_usd := 0;
  else
    select coalesce(sum(cost_usd), 0) into v_spent_usd
    from kai_model_usage
    where user_id = p_user_id and created_at >= p_ceiling_since;
  end if;

  return jsonb_build_object(
    'period_id',            v_period.id,
    'period_kind',          v_period.period_kind,
    'period_key',           v_period.period_key,
    'period_start',         v_period.period_start,
    'period_end',           v_period.period_end,
    'plan_key',             v_period.plan_key,
    'granted_credits',      v_period.granted_credits,
    'used_credits',         v_period.used_credits,
    'used_units',           v_period.used_units,
    'cost_ceiling_usd',     v_period.cost_ceiling_usd,
    'basis_usd_per_credit', v_period.basis_usd_per_credit,
    'basis_source',         v_period.basis_source,
    'topup_credits',        v_wallet.topup_credits,
    'used_today',           v_used_today,
    'ceiling_since',        p_ceiling_since,
    'spent_usd',            v_spent_usd
  );
end;
$$;

revoke all on function kai_credit_state(uuid, text, text, timestamptz, timestamptz, text, integer, numeric, numeric, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function kai_credit_state(uuid, text, text, timestamptz, timestamptz, text, integer, numeric, numeric, text, timestamptz, timestamptz)
  to service_role;

-- ===========================================================================
-- 6. kai_credit_spend — charge for one answered question
-- ===========================================================================
--
-- THE DAY'S GRANT IS SPENT FIRST, purchased credits second. That order is the
-- honest one: the grant expires at midnight and the purchase does not, so
-- taking the purchase first would quietly destroy something the person paid
-- for. It is enforced here rather than in a route so no future caller can get
-- it the other way round.
--
-- Charging is allowed to overrun the balance by design. The check happens
-- BEFORE the model runs; by the time this is called the answer has already been
-- given, and clawing it back would mean an answer the person read and was then
-- told they did not have. The overrun shows in the ledger as a spend against a
-- balance of zero and is visible in the admin view.
create or replace function kai_credit_spend(
  p_user_id         uuid,
  p_period_kind     text,
  p_period_key      text,
  p_credits         integer,
  p_units           bigint,
  p_cost_usd        numeric,
  p_request_id      text,
  p_conversation_id uuid,
  p_note            text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period       kai_credit_periods;
  v_wallet       kai_credit_wallets;
  v_remaining    integer;
  v_from_monthly integer;
  v_from_topup   integer;
begin
  if p_credits is null or p_credits < 1 then
    -- A question always costs at least one credit. Zero would be a free ride
    -- created by arithmetic rather than by a decision.
    p_credits := 1;
  end if;

  select * into v_period
  from kai_credit_periods
  where user_id = p_user_id and period_kind = p_period_kind and period_key = p_period_key
  for update;
  if not found then
    return jsonb_build_object('charged', 0, 'reason', 'no_period');
  end if;

  -- One charge per question, ever. A retried request must not bill twice.
  if p_request_id is not null and exists (
    select 1 from kai_credit_ledger
    where kind = 'spend' and request_id = p_request_id
  ) then
    return jsonb_build_object('charged', 0, 'reason', 'already_charged');
  end if;

  select * into v_wallet from kai_credit_wallets where user_id = p_user_id for update;

  v_remaining    := greatest(v_period.granted_credits - v_period.used_credits, 0);
  v_from_monthly := least(p_credits, v_remaining);
  v_from_topup   := least(p_credits - v_from_monthly, coalesce(v_wallet.topup_credits, 0));

  update kai_credit_periods
     set used_credits = used_credits + p_credits,
         used_units   = used_units + coalesce(p_units, 0)
   where id = v_period.id;

  if v_from_topup > 0 then
    update kai_credit_wallets
       set topup_credits = topup_credits - v_from_topup
     where user_id = p_user_id;
  end if;

  -- One row per pot touched, so the two never have to be untangled later.
  if v_from_monthly > 0 or v_from_topup = 0 then
    insert into kai_credit_ledger
      (user_id, period_id, kind, credits, bucket, units, cost_usd, request_id, conversation_id, note)
    values
      (p_user_id, v_period.id, 'spend', -(p_credits - v_from_topup), 'grant',
       p_units, p_cost_usd, p_request_id, p_conversation_id, p_note);
  end if;
  if v_from_topup > 0 then
    insert into kai_credit_ledger
      (user_id, period_id, kind, credits, bucket, units, cost_usd, request_id, conversation_id, note)
    values
      (p_user_id, v_period.id, 'spend', -v_from_topup, 'topup',
       null, null, p_request_id, p_conversation_id, 'from purchased credits');
  end if;

  return jsonb_build_object(
    'charged',       p_credits,
    'from_monthly',  v_from_monthly,
    'from_topup',    v_from_topup,
    'used_credits',  v_period.used_credits + p_credits,
    'topup_credits', greatest(coalesce(v_wallet.topup_credits, 0) - v_from_topup, 0)
  );
end;
$$;

revoke all on function kai_credit_spend(uuid, text, text, integer, bigint, numeric, text, uuid, text)
  from public, anon, authenticated;
grant execute on function kai_credit_spend(uuid, text, text, integer, bigint, numeric, text, uuid, text)
  to service_role;

-- ===========================================================================
-- 7. kai_credit_topup — a purchase, granted exactly once
-- ===========================================================================
--
-- `source_ref` is the Stripe event or session id and it carries a unique index,
-- so a webhook Stripe retries five times grants five times zero. The function
-- reports whether it actually granted, rather than swallowing the difference.
create or replace function kai_credit_topup(
  p_user_id    uuid,
  p_credits    integer,
  p_source_ref text,
  p_price_usd  numeric,
  p_note       text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted boolean := false;
begin
  if p_credits is null or p_credits < 1 then
    return jsonb_build_object('granted', false, 'reason', 'nothing_to_grant');
  end if;

  insert into kai_credit_wallets (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  begin
    insert into kai_credit_ledger
      (user_id, kind, credits, bucket, cost_usd, source_ref, note)
    values
      (p_user_id, 'topup', p_credits, 'topup', p_price_usd, p_source_ref,
       coalesce(p_note, 'purchased credits'));
    v_granted := true;
  exception when unique_violation then
    -- Already granted for this Stripe event. Not an error, and not a second
    -- grant either.
    return jsonb_build_object('granted', false, 'reason', 'already_granted');
  end;

  update kai_credit_wallets
     set topup_credits      = topup_credits + p_credits,
         lifetime_purchased = lifetime_purchased + p_credits
   where user_id = p_user_id;

  return jsonb_build_object('granted', v_granted, 'credits', p_credits);
end;
$$;

revoke all on function kai_credit_topup(uuid, integer, text, numeric, text)
  from public, anon, authenticated;
grant execute on function kai_credit_topup(uuid, integer, text, numeric, text)
  to service_role;

-- ===========================================================================
-- 8. kai_credit_basis — what a credit has actually been costing
-- ===========================================================================
--
-- The divisor behind every grant, measured rather than assumed. It reads 0029's
-- ledger and reports RAW SUMS PER MODEL — token counts, and the dollars those
-- calls really cost.
--
-- IT DELIBERATELY DOES NO PRICING. Turning tokens into chargeable units needs
-- the output/input price ratio, and there is exactly one file in this codebase
-- allowed to know a price. So the arithmetic happens there, on these sums, and
-- this function stays a counter. A second copy of the rates living in the
-- database is precisely the drift 0029 was written to prevent.
--
-- The caller decides whether the sample is big enough to divide by. Below its
-- own threshold it falls back to the last figure that WAS measured, rather than
-- inventing a rate out of three data points.
create or replace function kai_credit_basis(p_since timestamptz)
returns table (
  model         text,
  questions     bigint,
  input_tokens  bigint,
  cache_read    bigint,
  cache_write   bigint,
  output_tokens bigint,
  cost_usd      numeric
)
language sql
security definer
set search_path = public
as $$
  select u.model,
         count(distinct u.request_id)                        as questions,
         coalesce(sum(u.input_tokens), 0)                    as input_tokens,
         coalesce(sum(u.cache_read_input_tokens), 0)         as cache_read,
         coalesce(sum(u.cache_creation_input_tokens), 0)     as cache_write,
         coalesce(sum(u.output_tokens), 0)                   as output_tokens,
         coalesce(sum(u.cost_usd), 0)                        as cost_usd
  from kai_model_usage u
  where u.created_at >= p_since
    and u.feature in ('chat', 'chat_object_retry', 'chat_command_recovery',
                      'chart_answer', 'conversation_title')
  group by u.model;
$$;

revoke all on function kai_credit_basis(timestamptz) from public, anon, authenticated;
grant execute on function kai_credit_basis(timestamptz) to service_role;

-- ===========================================================================
-- 8b. A REPAIR: four calls that were never priced
-- ===========================================================================
--
-- The ledger already contains rows for `claude-haiku-4-5-20251001` — the dated
-- snapshot of a model whose rate IS written down, under its plain name. The
-- lookup missed them, so those calls carry a NULL cost: invisible to every
-- total, and invisible to the credit arithmetic that divides by them.
--
-- `rateFor()` in pricing.ts now strips a trailing date and looks again, which
-- fixes it from here on. This fixes the rows already written. It is safe to run
-- twice — it only touches rows that are still NULL — and it prices them from
-- the SAME numbers pricing.ts holds, spelled out here rather than imported
-- because a migration cannot import TypeScript. If those two ever disagree the
-- TypeScript is the source of truth and this block is history.
update kai_model_usage u
   set cost_usd = round((
         coalesce(u.input_tokens, 0) * r.input_rate / 1000000
       + coalesce(u.output_tokens, 0) * r.output_rate / 1000000
       + coalesce(u.cache_read_input_tokens, 0) * r.input_rate * 0.1 / 1000000
       + coalesce(u.cache_creation_input_tokens, 0) * r.input_rate * 1.25 / 1000000
       )::numeric, 6)
  from (values
    ('claude-sonnet-5',   2.0, 10.0),
    ('claude-opus-5',     5.0, 25.0),
    ('claude-haiku-4-5',  1.0,  5.0),
    ('claude-sonnet-4-6', 3.0, 15.0)
  ) as r(name, input_rate, output_rate)
 where u.cost_usd is null
   and (u.input_tokens is not null or u.output_tokens is not null)
   -- the dated snapshot, matched back to its plain name
   and regexp_replace(u.model, '-[0-9]{8}$', '') = r.name;

-- ===========================================================================
-- 9. THE TRADE PANEL BECOMES AN ENTITLEMENT
-- ===========================================================================
--
-- The owner's ruling: a free account gets Kai and the community, and does NOT
-- get the Trade section. That is a plan question, not a credit question, so it
-- goes where every other plan question in this app already lives —
-- `entitlement_flags` — rather than into a second gating mechanism nobody would
-- think to look in.
--
-- `community_post_scope` is already seeded and already says free accounts may
-- post in the beginner rooms, so the "community: yes" half of his ruling needs
-- no change at all. Only the Trade half is new.
--
-- THE FLAG IS NOT THE GATE. It is what the gate reads. The routes under
-- /api/v1/trade and the two order-placing routes ask `loadEntitlements()` and
-- refuse in plain words with the price; hiding the tab in the app is a
-- courtesy on top of that, never instead of it.
insert into entitlement_flags (tier, flag, value) values
  ('free',    'trade_panel', 'false'::jsonb),
  ('premium', 'trade_panel', 'true'::jsonb)
on conflict (tier, flag) do update set value = excluded.value;

-- `kai_daily_budget` was seeded in the original build as a placeholder and
-- nothing ever read it. It is now actively misleading — it says 50 and 500,
-- which are neither the free daily credits (10) nor any paid allowance — so it
-- is removed rather than left to be believed by the next person.
delete from entitlement_flags where flag = 'kai_daily_budget';

-- ===========================================================================
-- HOW TO READ IT
-- ===========================================================================
--
-- 1. WHO IS NEAR THEIR LIMIT, this period, whichever shape it is.
--
--   select p.user_id, p.plan_key, p.period_kind, p.period_key,
--          p.granted_credits, p.used_credits, w.topup_credits,
--          round(100.0 * p.used_credits
--                / nullif(p.granted_credits + coalesce(w.topup_credits, 0), 0), 1) as pct_used
--   from kai_credit_periods p
--   left join kai_credit_wallets w on w.user_id = p.user_id
--   where now() < p.period_end
--   order by pct_used desc nulls last;
--
-- 2. MARGIN PER PERSON — credits taken against dollars actually spent. The
--    dollars come from 0029, never from a number copied into this schema.
--
--   select p.user_id, p.plan_key, p.used_credits,
--          round(sum(u.cost_usd), 4) as real_cost_usd,
--          round(p.cost_ceiling_usd - sum(u.cost_usd), 4) as ceiling_headroom_usd
--   from kai_credit_periods p
--   join kai_model_usage u
--     on u.user_id = p.user_id and u.created_at >= p.period_start
--   where now() < p.period_end
--   group by p.user_id, p.plan_key, p.used_credits, p.cost_ceiling_usd
--   order by real_cost_usd desc;
--
-- 2b. WHAT THE FREE TIER IS COSTING, and whether 10 a day is generous or
--     expensive. The second column is the one that decides it: people who
--     finish their ten are the cost, people who ask one question are not.
--
--   select p.period_key as day,
--          count(*)                                              as free_users,
--          count(*) filter (where p.used_credits >= p.granted_credits) as maxed_out,
--          count(*) filter (where p.used_credits <= 2)           as barely_used,
--          sum(p.used_credits)                                   as credits_used,
--          round(sum(u.cost), 4)                                 as real_cost_usd
--   from kai_credit_periods p
--   left join lateral (
--     select coalesce(sum(cost_usd), 0) as cost from kai_model_usage m
--     where m.user_id = p.user_id
--       and m.created_at >= p.period_start and m.created_at < p.period_end
--   ) u on true
--   where p.plan_key = 'free' and p.period_kind = 'day'
--   group by 1 order by 1 desc;
--
-- 3. WHAT THE CACHE-NEUTRAL RULE COSTS US. The gap between what people were
--    billed for and what was really spent. Expected to be small; if it is not,
--    something is warming the cache far more often than it should.
--
--   select date_trunc('day', created_at)::date as day,
--          sum(units)     as chargeable_units,
--          sum(cost_usd)  as true_cost_usd
--   from kai_credit_ledger where kind = 'spend'
--   group by 1 order by 1 desc;
--
-- 4. EXPLAIN ONE BALANCE. The whole point of a ledger.
--
--   select created_at, kind, bucket, credits, units, cost_usd, note
--   from kai_credit_ledger where user_id = '...'
--   order by created_at desc limit 100;
