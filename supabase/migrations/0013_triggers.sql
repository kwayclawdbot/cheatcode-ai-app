-- 0013_triggers
-- Source: docs/01_DATA_MODEL.md ⚙ notes + docs/BUILD-BRIEF-v1-slice.md ("Data + API subset").

------------------------------------------------------------------ updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t.table_name);
  end loop;
end;
$$;

--------------------------------------------- per-user monotonic user_events.seq
-- ⚙ "per-user monotonic via counter table + row lock in the writing txn"
create or replace function next_user_event_seq(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_seq bigint;
begin
  insert into user_event_counters (user_id) values (p_user)
    on conflict (user_id) do nothing;
  -- UPDATE ... RETURNING takes the row lock for the remainder of the txn
  update user_event_counters
     set last_seq = last_seq + 1
   where user_id = p_user
  returning last_seq into v_seq;
  return v_seq;
end;
$$;

create or replace function user_events_assign_seq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seq is null or new.seq = 0 then
    new.seq := next_user_event_seq(new.user_id);
  end if;
  return new;
end;
$$;

-- seq stays NOT NULL (it is part of the PK); BEFORE-INSERT triggers run before
-- constraint checks, so omitting seq on insert lets the counter assign it.
create trigger user_events_assign_seq
  before insert on user_events
  for each row execute function user_events_assign_seq();

------------------------------------------------- trade_plans.mode immutability
-- ⚙ "originating mode, immutable after create - trigger-enforced"
create or replace function trade_plans_mode_immutable() returns trigger
language plpgsql as $$
begin
  if new.mode is distinct from old.mode then
    raise exception 'trade_plans.mode is immutable after create (was %, attempted %)', old.mode, new.mode
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trade_plans_mode_immutable
  before update on trade_plans
  for each row execute function trade_plans_mode_immutable();

------------------------------------------------------ new user provisioning
-- ⚙ trigger on auth.users insert creates profile + paper account + default prefs
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_starting_balance numeric := 10000;   -- onboarding may change within $1k-$100k
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, kind, name, currency, cash, buying_power, equity, starting_balance)
  values (new.id, 'paper', 'Paper account', 'USD',
          v_starting_balance, v_starting_balance, v_starting_balance, v_starting_balance);

  insert into public.notification_prefs (user_id) values (new.id)
    on conflict (user_id) do nothing;

  insert into public.setup_alert_prefs (user_id) values (new.id)
    on conflict (user_id) do nothing;

  insert into public.risk_policies (
    user_id, daily_loss_cap_usd, max_position_pct, max_open_positions, min_reward_risk, updated_by)
  values (new.id, 60, 25, 5, 1.5, 'system')
    on conflict (user_id) do nothing;

  insert into public.user_event_counters (user_id) values (new.id)
    on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
