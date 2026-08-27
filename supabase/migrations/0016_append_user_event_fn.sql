-- 0016_append_user_event_fn
-- Closes the outbox transaction gap from 01 §3: "every server-authoritative
-- mutation writes its domain row AND its user_events row in the same
-- transaction."
--
-- PostgREST has no multi-statement transaction, so the api-app was doing the
-- domain write and the outbox write as two round-trips (best-effort, logged,
-- never raised). A plpgsql function is one implicit transaction, so an RPC per
-- write path gives us the atomicity the data model requires.
--
-- This migration ships two:
--   append_user_event(...)   — the outbox insert alone, returning the assigned
--                              seq. Still two round-trips when the domain write
--                              lives in the API, but it is the building block
--                              every command RPC calls.
--   complete_onboarding(...) — the whole POST /onboarding/complete write path
--                              (profile + risk policy + journal + paper account
--                              + user_events) in one transaction.
--
-- Both are `security definer` with `search_path` pinned (the user_events
-- append-only revoke strips UPDATE/DELETE from service_role; the function owner
-- is unaffected, which is exactly the append-only shape we want).

----------------------------------------------------------------- outbox append
create or replace function append_user_event(
  p_user_id     uuid,
  p_event_type  text,
  p_entity_type text,
  p_entity_id   uuid,
  p_payload     jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_seq bigint;
begin
  -- seq is omitted on purpose: the user_events_assign_seq BEFORE-INSERT trigger
  -- (0013) takes the row lock on user_event_counters inside THIS transaction.
  insert into user_events (user_id, event_type, entity_type, entity_id, payload)
  values (p_user_id, p_event_type, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb))
  returning seq into v_seq;
  return v_seq;
end;
$$;

revoke all on function append_user_event(uuid, text, text, uuid, jsonb) from public;
grant execute on function append_user_event(uuid, text, text, uuid, jsonb) to service_role;

------------------------------------------------------- onboarding write path
-- p_patch carries everything the API derived (the risk maths stays in
-- packages/shared so the client and server agree on it):
--   goal_mode, experience, involvement, risk_answer, practice_choice,
--   starting_balance, daily_loss_cap_usd, max_position_pct,
--   max_open_positions, min_reward_risk, completed_at, version
--
-- Idempotency is decided inside the transaction under a row lock on profiles,
-- so two concurrent completes cannot both write. Returns
-- {idempotent_replay, seq, account_id} — the caller re-reads state to shape the
-- response.
create or replace function complete_onboarding(
  p_user_id uuid,
  p_patch   jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_onboarding   jsonb;
  v_completed_at text := coalesce(p_patch ->> 'completed_at', now()::text);
  v_starting     numeric := nullif(p_patch ->> 'starting_balance', '')::numeric;
  v_account_id   uuid;
  v_seq          bigint;
begin
  select coalesce(onboarding, '{}'::jsonb) into v_onboarding
  from profiles where user_id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  -- Already completed → change nothing (02: idempotent_replay).
  if coalesce(v_onboarding ->> 'completed_at', '') <> '' then
    return jsonb_build_object('idempotent_replay', true, 'seq', null, 'account_id', null);
  end if;

  update profiles set
    primary_mode      = (p_patch ->> 'goal_mode')::app_mode,
    experience        = (p_patch ->> 'experience')::experience_level,
    involvement       = (p_patch ->> 'involvement')::involvement,
    explanation_level = (p_patch ->> 'experience')::experience_level,
    onboarding        = v_onboarding || jsonb_build_object(
      'completed_at',     v_completed_at,
      'goal_mode',        p_patch ->> 'goal_mode',
      'risk_answer',      p_patch ->> 'risk_answer',
      'practice_choice',  p_patch ->> 'practice_choice',
      'starting_balance', p_patch -> 'starting_balance',
      'version',          coalesce(p_patch ->> 'version', 'v1-slice')
    )
  where user_id = p_user_id;

  insert into risk_policies (
    user_id, daily_loss_cap_usd, max_position_pct, max_open_positions,
    min_reward_risk, pdt_warnings, updated_by
  ) values (
    p_user_id,
    nullif(p_patch ->> 'daily_loss_cap_usd', '')::numeric,
    nullif(p_patch ->> 'max_position_pct', '')::numeric,
    nullif(p_patch ->> 'max_open_positions', '')::int,
    coalesce(nullif(p_patch ->> 'min_reward_risk', '')::numeric, 1.5),
    true,
    'api'
  )
  on conflict (user_id) do update set
    daily_loss_cap_usd = excluded.daily_loss_cap_usd,
    max_position_pct   = excluded.max_position_pct,
    max_open_positions = excluded.max_open_positions,
    min_reward_risk    = excluded.min_reward_risk,
    pdt_warnings       = excluded.pdt_warnings,
    updated_by         = excluded.updated_by;

  -- Append-only journal (01 §2).
  insert into risk_policy_events (user_id, change)
  values (
    p_user_id,
    jsonb_build_object(
      'source',             'onboarding',
      'risk_answer',        p_patch ->> 'risk_answer',
      'daily_loss_cap_usd', p_patch -> 'daily_loss_cap_usd',
      'max_position_pct',   p_patch -> 'max_position_pct',
      'starting_balance',   p_patch -> 'starting_balance',
      'at',                 v_completed_at
    )
  );

  -- The paper account provisioned by handle_new_user (0013). Onboarding may set
  -- the balance anywhere in $1k-$100k; the API has already validated the range.
  select id into v_account_id
  from accounts
  where user_id = p_user_id and kind = 'paper'
  order by created_at asc
  limit 1;

  if v_account_id is not null and v_starting is not null then
    update accounts set
      starting_balance = v_starting,
      cash             = v_starting,
      buying_power     = v_starting,
      equity           = v_starting
    where id = v_account_id and user_id = p_user_id;
  end if;

  v_seq := append_user_event(
    p_user_id, 'system', 'profile', p_user_id,
    jsonb_build_object(
      'event',              'onboarding_completed',
      'goal_mode',          p_patch ->> 'goal_mode',
      'daily_loss_cap_usd', p_patch -> 'daily_loss_cap_usd'
    )
  );

  return jsonb_build_object(
    'idempotent_replay', false,
    'seq', v_seq,
    'account_id', v_account_id
  );
end;
$$;

revoke all on function complete_onboarding(uuid, jsonb) from public;
grant execute on function complete_onboarding(uuid, jsonb) to service_role;
