-- 0051 — a mid-day downgrade applies the lower cost ceiling; it never wipes it.
--
-- THE DEFECT. 0030's `kai_credit_state` copied the new plan's monthly dollar
-- ceiling onto today's period whenever the plan changed. Going down to free
-- (ceiling NULL) therefore erased the ceiling for the rest of the day while the
-- paid plan's credits stayed, and — because the API only asked for the month's
-- spend when the plan had a ceiling — the spend already recorded read as $0.
--
-- THE FIX. Same function, same signature, same grants; two changes:
--   1. On a downgrade, the period keeps the LOWER of the two ceilings, and a
--      plan with no ceiling never removes one. Upgrades are unchanged.
--   2. Spend is added up whenever the period has a ceiling, so it carries over.
-- Today's credits are still never taken back mid-day.

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
  v_ceiling     numeric;
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
   * AN UPGRADE TAKES EFFECT NOW. A DOWNGRADE KEEPS TODAY'S CREDITS AND TAKES
   * THE LOWER CEILING NOW.
   *
   * Upgrade (the new plan grants more): unchanged from 0030. The extra credits
   * are added, the new ceiling is written on, and the difference goes in the
   * ledger as an `adjust`.
   *
   * Downgrade (the new plan grants less): the person keeps what they were told
   * they had for the rest of today, as before. What 0030 got wrong is the
   * ceiling: it copied the new plan's ceiling straight on, and the free plan's
   * ceiling is NULL, so cancelling mid-day REMOVED the dollar backstop while
   * leaving the paid plan's credits in place, and the month's spend stopped
   * being added up at all. Now the lower of the two ceilings applies at once
   * — a plan with no ceiling never erases one that was there — and the spend
   * already recorded this month still counts against it.
   */
  if v_period.plan_key is distinct from p_plan_key then
    if greatest(p_granted_credits, 0) >= v_period.granted_credits then
      v_ceiling := p_cost_ceiling_usd;
    elsif p_cost_ceiling_usd is null then
      v_ceiling := v_period.cost_ceiling_usd;
    elsif v_period.cost_ceiling_usd is null then
      v_ceiling := p_cost_ceiling_usd;
    else
      v_ceiling := least(p_cost_ceiling_usd, v_period.cost_ceiling_usd);
    end if;

    update kai_credit_periods
       set plan_key             = p_plan_key,
           cost_ceiling_usd     = v_ceiling,
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
  -- Added up whenever this period carries a ceiling — including one kept
  -- through a mid-day downgrade to a plan that has none — so recorded spend
  -- always carries over. The window falls back to the month the period opened
  -- in if the caller did not send one.
  if p_ceiling_since is null and v_period.cost_ceiling_usd is null then
    v_spent_usd := 0;
  else
    select coalesce(sum(cost_usd), 0) into v_spent_usd
    from kai_model_usage
    where user_id = p_user_id
      and created_at >= coalesce(p_ceiling_since, date_trunc('month', v_period.period_start));
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
    'ceiling_since',        coalesce(p_ceiling_since, date_trunc('month', v_period.period_start)),
    'spent_usd',            v_spent_usd
  );
end;
$$;

revoke all on function kai_credit_state(uuid, text, text, timestamptz, timestamptz, text, integer, numeric, numeric, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function kai_credit_state(uuid, text, text, timestamptz, timestamptz, text, integer, numeric, numeric, text, timestamptz, timestamptz)
  to service_role;
