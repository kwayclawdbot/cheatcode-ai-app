-- 0018_rpcs
-- Source: docs/BUILD-BRIEF-round-2.md "SCHEMA-2".
--
-- Command RPCs for round 2. Same reasoning as 0016: PostgREST has no
-- multi-statement transaction, so any write path that must be atomic (domain
-- row + user_events outbox row + counters) lives in one plpgsql function.
--
-- =====================================================================
-- FUNCTION SIGNATURES (this block is the contract for the API lane)
-- =====================================================================
--
--   join_core_room(p_user_id uuid, p_room_id uuid)
--     returns room_members
--     GRANT: authenticated, service_role   (security definer; authenticated may
--            only pass its own auth.uid() as p_user_id)
--     Refuses rooms whose type <> 'core' (SQLSTATE 42501, message
--     'room_not_core'). Idempotent: joining twice returns the same row.
--     Refuses if the member row exists with banned = true ('room_banned').
--
--   set_room_mute(p_user_id uuid, p_room_id uuid, p_until timestamptz)
--     returns room_members
--     GRANT: authenticated, service_role   (security definer; self only)
--     Sets room_members.muted_until = p_until (null = unmute). This is the
--     MEMBER'S OWN notification mute and never blocks posting. Moderator mutes
--     live in room_members.moderation_muted_until (added below) — see
--     SCHEMA-NOTES 1.22. Requires membership ('not_a_member').
--
--   (Every other function in `public` — including 0016's complete_onboarding and
--    append_user_event — is revoked from anon + authenticated by the grant floor
--    at the bottom of this file. See the note there; it is a security fix, not
--    bookkeeping.)
--
--   post_room_message(p_user_id uuid, p_room_id uuid, p_kind message_kind,
--                     p_body text, p_refs jsonb, p_structured_idea jsonb,
--                     p_position_disclosure jsonb, p_parent_id uuid)
--     returns messages
--     GRANT: service_role only (rate limit + spam precheck live in the API)
--     Enforces: membership, not banned, not moderation-muted, room not
--     posting_restricted unless role in (moderator, educator, expert),
--     slow_mode_s from rooms.config, kind in (text, chart, voice_note,
--     position_update), position_disclosure required when structured_idea is
--     present, parent message in the same room. Assigns messages.seq under a
--     row lock on room_seq_counters and advances the author's last_read_seq.
--     Errors: 'not_a_member' | 'room_banned' | 'room_muted' |
--             'room_posting_restricted' | 'slow_mode' | 'kind_not_postable' |
--             'disclosure_required' | 'parent_not_in_room'  (all SQLSTATE 42501
--             except slow_mode/kind/disclosure/parent = 22023 invalid parameter)
--
--   post_kai_message(p_room_id uuid, p_kai_object_id uuid, p_body text)
--     returns messages
--     GRANT: service_role only
--     Inserts a kind='kai_object', user_id = null message carrying
--     refs = {"kai_object_id": ...}. Same seq assignment. Ignores slow mode,
--     restriction and membership (Kai is not a member).
--
--   record_debrief(p_user_id uuid, p_position_id uuid, p_outcome jsonb,
--                  p_process_review jsonb, p_kai_summary text,
--                  p_kai_object_id uuid)
--     returns debriefs
--     GRANT: service_role only
--     Position must belong to p_user_id and be closed ('position_not_closed').
--     One debrief per position (unique index): a second call REGENERATES the
--     existing row in place. Writes the debrief and its user_events row in one
--     transaction; plan_id is inherited from positions.origin_plan_id.
--
--   reset_paper_account(p_user_id uuid)
--     returns jsonb
--       {ok:boolean, reason:text|null, account_id:uuid|null,
--        starting_balance:numeric|null, reset_count:int|null,
--        last_reset_at:timestamptz|null, next_allowed_at:timestamptz|null}
--     GRANT: service_role only
--     Once per CALENDAR month. Refusal is a value, not an exception
--     (reason = 'already_reset_this_month'), so the API can render copy without
--     parsing error strings. reason = 'no_paper_account' if none exists.
--     Sets cash/buying_power/equity = starting_balance, reset_count + 1,
--     last_reset_at = now(). Closes/deletes nothing.
--
--   simulate_closed_trade(p_user_id uuid, p_symbol text default 'META',
--                         p_entry numeric default null,
--                         p_exit numeric default null,
--                         p_qty numeric default 10)
--     returns jsonb
--       {position_id, plan_id, entry_order_id, exit_order_id, symbol, qty,
--        entry, exit, realized_pnl, opened_at, closed_at, simulated:true}
--     GRANT: service_role only. DEV TOOL — the API gates it behind DEV_TOOLS=1.
--     Creates trade_plan(closed) → 2 orders(filled) + order_events + fills →
--     position(closed) → user_events. Everything carries origin.simulated=true
--     (trade_plans.origin, orders.origin, positions.origin — the latter two
--     columns are added by this migration), fills.liquidity='simulated'.
--     Entry defaults to the latest 1d candle close, else the newest setup's
--     quote_snapshot.price, else 100; exit defaults to entry * 1.032.
--
--   notify(p_user_id uuid, p_kind text, p_payload jsonb)
--     returns notifications
--     GRANT: service_role only
--     Inserts one channel='in_app' notification. Deep link belongs in
--     p_payload->>'route'. Push fan-out is a later round.
--
-- =====================================================================

------------------------------------------------------- supporting schema
-- Per-room monotonic message seq. 01 §10 says "assigned by api-app in txn";
-- the api-app now does it through post_room_message, which takes the row lock
-- here for the remainder of the transaction (same shape as user_event_counters).
create table room_seq_counters (
  room_id uuid primary key references rooms on delete cascade,
  last_seq bigint not null default 0
);
alter table room_seq_counters enable row level security;
revoke all on room_seq_counters from anon, authenticated;   -- worker/back-office only

-- backfill for rooms that already have messages
insert into room_seq_counters (room_id, last_seq)
select r.id, coalesce(max(m.seq), 0)
from rooms r left join messages m on m.room_id = r.id
group by r.id
on conflict (room_id) do nothing;

-- Moderator mute, kept separate from the member's own notification mute so a
-- self-unmute can never lift a moderation action. See SCHEMA-NOTES 1.22.
alter table room_members add column moderation_muted_until timestamptz;

-- origin envelopes: 01 §7 gives trade_plans.origin but not orders/positions.
-- The debrief UI has to be able to say "SIMULATED" honestly, and a simulated
-- fill must never be mistaken for a real one.
alter table orders    add column origin jsonb not null default '{}'::jsonb;
alter table positions add column origin jsonb not null default '{}'::jsonb;

-- kai_objects link for a debrief (01 §7 debriefs has lesson_refs + kai_summary
-- only). POST /positions/:id/debrief persists the kai_object and needs a way
-- back to it.
alter table debriefs add column kai_object_id uuid references kai_objects;

-- One debrief per position — makes "Get Kai's debrief" idempotent/regenerative
-- rather than duplicating.
create unique index debriefs_position_uniq on debriefs (position_id)
  where position_id is not null;

------------------------------------------------------------- join_core_room
create or replace function join_core_room(p_user_id uuid, p_room_id uuid)
returns room_members
language plpgsql security definer set search_path = public as $$
declare
  v_type   room_type;
  v_member room_members;
  v_new    boolean := false;
begin
  -- security definer + client-callable: a JWT holder may only act as itself.
  -- service_role calls have no auth.uid() and may act for any user.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select type into v_type from rooms where id = p_room_id;
  if not found then
    raise exception 'room_not_found' using errcode = '42501';
  end if;
  if v_type <> 'core' then
    -- setup / announcement rooms are joined by the api-app (setup rooms follow
    -- the setup, announcement rooms are provisioned), never self-served.
    raise exception 'room_not_core' using errcode = '42501';
  end if;

  select * into v_member from room_members
   where room_id = p_room_id and user_id = p_user_id;

  if found then
    if coalesce(v_member.banned, false) then
      raise exception 'room_banned' using errcode = '42501';
    end if;
    return v_member;                                  -- idempotent
  end if;

  insert into room_members (room_id, user_id, role)
  values (p_room_id, p_user_id, 'member')
  on conflict (room_id, user_id) do nothing;

  select * into v_member from room_members
   where room_id = p_room_id and user_id = p_user_id;
  v_new := true;

  if v_new then
    perform append_user_event(
      p_user_id, 'system', 'room', p_room_id,
      jsonb_build_object('event', 'room_joined', 'room_id', p_room_id));
  end if;

  return v_member;
end;
$$;

revoke all on function join_core_room(uuid, uuid) from public;
grant execute on function join_core_room(uuid, uuid) to authenticated, service_role;

-------------------------------------------------------------- set_room_mute
create or replace function set_room_mute(
  p_user_id uuid, p_room_id uuid, p_until timestamptz
) returns room_members
language plpgsql security definer set search_path = public as $$
declare v_member room_members;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update room_members set muted_until = p_until
   where room_id = p_room_id and user_id = p_user_id
  returning * into v_member;

  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

revoke all on function set_room_mute(uuid, uuid, timestamptz) from public;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated, service_role;

----------------------------------------------------------- seq assignment
create or replace function next_room_message_seq(p_room uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_seq bigint;
begin
  insert into room_seq_counters (room_id) values (p_room)
    on conflict (room_id) do nothing;
  update room_seq_counters
     set last_seq = last_seq + 1
   where room_id = p_room
  returning last_seq into v_seq;
  return v_seq;
end;
$$;
revoke all on function next_room_message_seq(uuid) from public;
grant execute on function next_room_message_seq(uuid) to service_role;

--------------------------------------------------------- post_room_message
create or replace function post_room_message(
  p_user_id             uuid,
  p_room_id             uuid,
  p_kind                message_kind,
  p_body                text,
  p_refs                jsonb   default null,
  p_structured_idea     jsonb   default null,
  p_position_disclosure jsonb   default null,
  p_parent_id           uuid    default null
) returns messages
language plpgsql security definer set search_path = public as $$
declare
  v_member   room_members;
  v_config   jsonb;
  v_slow     int;
  v_last     timestamptz;
  v_seq      bigint;
  v_message  messages;
begin
  if p_kind not in ('text','chart','voice_note','position_update') then
    -- 'kai_object' goes through post_kai_message; 'system' is back-office only.
    raise exception 'kind_not_postable' using errcode = '22023';
  end if;

  if p_structured_idea is not null and p_position_disclosure is null then
    -- community spec: a structured idea always carries its disclosure.
    raise exception 'disclosure_required' using errcode = '22023';
  end if;

  select * into v_member from room_members
   where room_id = p_room_id and user_id = p_user_id;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if coalesce(v_member.banned, false) then
    raise exception 'room_banned' using errcode = '42501';
  end if;
  if v_member.moderation_muted_until is not null
     and v_member.moderation_muted_until > now() then
    raise exception 'room_muted' using errcode = '42501';
  end if;

  select config into v_config from rooms where id = p_room_id;
  if v_config is null then
    raise exception 'room_not_found' using errcode = '42501';
  end if;

  if coalesce((v_config ->> 'posting_restricted')::boolean, false)
     and v_member.role not in ('moderator','educator','expert') then
    raise exception 'room_posting_restricted' using errcode = '42501';
  end if;

  v_slow := coalesce((v_config ->> 'slow_mode_s')::int, 0);
  if v_slow > 0 then
    select max(created_at) into v_last from messages
     where room_id = p_room_id and user_id = p_user_id and deleted_at is null;
    if v_last is not null and v_last > now() - make_interval(secs => v_slow) then
      raise exception 'slow_mode' using errcode = '22023';
    end if;
  end if;

  if p_parent_id is not null
     and not exists (select 1 from messages
                      where id = p_parent_id and room_id = p_room_id) then
    raise exception 'parent_not_in_room' using errcode = '22023';
  end if;

  v_seq := next_room_message_seq(p_room_id);

  insert into messages (
    room_id, user_id, seq, kind, body, parent_id,
    refs, structured_idea, position_disclosure)
  values (
    p_room_id, p_user_id, v_seq, p_kind, p_body, p_parent_id,
    p_refs, p_structured_idea, p_position_disclosure)
  returning * into v_message;

  -- your own message is never "new since you left"
  update room_members set last_read_seq = greatest(coalesce(last_read_seq, 0), v_seq)
   where room_id = p_room_id and user_id = p_user_id;

  return v_message;
end;
$$;

revoke all on function post_room_message(uuid, uuid, message_kind, text, jsonb, jsonb, jsonb, uuid) from public;
grant execute on function post_room_message(uuid, uuid, message_kind, text, jsonb, jsonb, jsonb, uuid) to service_role;

---------------------------------------------------------- post_kai_message
create or replace function post_kai_message(
  p_room_id       uuid,
  p_kai_object_id uuid,
  p_body          text default null
) returns messages
language plpgsql security definer set search_path = public as $$
declare
  v_seq     bigint;
  v_message messages;
begin
  if not exists (select 1 from rooms where id = p_room_id) then
    raise exception 'room_not_found' using errcode = '42501';
  end if;

  v_seq := next_room_message_seq(p_room_id);

  insert into messages (room_id, user_id, seq, kind, body, refs)
  values (
    p_room_id, null, v_seq, 'kai_object', p_body,
    jsonb_build_object('kai_object_id', p_kai_object_id))
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function post_kai_message(uuid, uuid, text) from public;
grant execute on function post_kai_message(uuid, uuid, text) to service_role;

------------------------------------------------------------ record_debrief
create or replace function record_debrief(
  p_user_id       uuid,
  p_position_id   uuid,
  p_outcome       jsonb,
  p_process_review jsonb default null,
  p_kai_summary   text  default null,
  p_kai_object_id uuid  default null
) returns debriefs
language plpgsql security definer set search_path = public as $$
declare
  v_position positions;
  v_debrief  debriefs;
  v_existing uuid;
begin
  select * into v_position from positions
   where id = p_position_id and user_id = p_user_id;
  if not found then
    raise exception 'position_not_found' using errcode = '42501';
  end if;
  if v_position.closed_at is null then
    raise exception 'position_not_closed' using errcode = '22023';
  end if;

  select id into v_existing from debriefs where position_id = p_position_id;

  if v_existing is null then
    insert into debriefs (
      user_id, plan_id, position_id, outcome, process_review,
      kai_summary, kai_object_id)
    values (
      p_user_id, v_position.origin_plan_id, p_position_id,
      coalesce(p_outcome, '{}'::jsonb), p_process_review,
      p_kai_summary, p_kai_object_id)
    returning * into v_debrief;
  else
    update debriefs set
      outcome        = coalesce(p_outcome, outcome),
      process_review = coalesce(p_process_review, process_review),
      kai_summary    = coalesce(p_kai_summary, kai_summary),
      kai_object_id  = coalesce(p_kai_object_id, kai_object_id)
     where id = v_existing
    returning * into v_debrief;
  end if;

  perform append_user_event(
    p_user_id, 'kai_result', 'debrief', v_debrief.id,
    jsonb_build_object(
      'event',       case when v_existing is null then 'debrief_recorded'
                          else 'debrief_regenerated' end,
      'position_id', p_position_id,
      'symbol',      v_position.symbol,
      'outcome',     coalesce(p_outcome, '{}'::jsonb),
      'simulated',   coalesce((v_position.origin ->> 'simulated')::boolean, false)));

  return v_debrief;
end;
$$;

revoke all on function record_debrief(uuid, uuid, jsonb, jsonb, text, uuid) from public;
grant execute on function record_debrief(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;

------------------------------------------------------- reset_paper_account
create or replace function reset_paper_account(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_account accounts;
  v_start   numeric;
begin
  select * into v_account from accounts
   where user_id = p_user_id and kind = 'paper'
   order by created_at asc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_paper_account');
  end if;

  if v_account.last_reset_at is not null
     and date_trunc('month', v_account.last_reset_at) = date_trunc('month', now()) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_reset_this_month',
      'account_id', v_account.id,
      'reset_count', v_account.reset_count,
      'last_reset_at', v_account.last_reset_at,
      'next_allowed_at', date_trunc('month', now()) + interval '1 month');
  end if;

  v_start := coalesce(v_account.starting_balance, 10000);

  update accounts set
    cash          = v_start,
    buying_power  = v_start,
    equity        = v_start,
    reset_count   = coalesce(reset_count, 0) + 1,
    last_reset_at = now()
   where id = v_account.id
  returning * into v_account;

  perform append_user_event(
    p_user_id, 'system', 'account', v_account.id,
    jsonb_build_object(
      'event', 'paper_account_reset',
      'starting_balance', v_start,
      'reset_count', v_account.reset_count));

  return jsonb_build_object(
    'ok', true,
    'reason', null,
    'account_id', v_account.id,
    'starting_balance', v_start,
    'reset_count', v_account.reset_count,
    'last_reset_at', v_account.last_reset_at,
    'next_allowed_at', date_trunc('month', now()) + interval '1 month');
end;
$$;

revoke all on function reset_paper_account(uuid) from public;
grant execute on function reset_paper_account(uuid) to service_role;

----------------------------------------------------- simulate_closed_trade
create or replace function simulate_closed_trade(
  p_user_id uuid,
  p_symbol  text    default 'META',
  p_entry   numeric default null,
  p_exit    numeric default null,
  p_qty     numeric default 10
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_symbol     text := upper(btrim(coalesce(p_symbol, 'META')));
  v_qty        numeric := coalesce(p_qty, 10);
  v_entry      numeric;
  v_exit       numeric;
  v_mode       app_mode;
  v_account_id uuid;
  v_plan_id    uuid;
  v_entry_ord  uuid;
  v_exit_ord   uuid;
  v_position_id uuid;
  v_opened_at  timestamptz := now() - interval '2 hours 14 minutes';
  v_closed_at  timestamptz := now();
  v_pnl        numeric;
  v_origin     jsonb;
begin
  if not exists (select 1 from instruments where symbol = v_symbol) then
    raise exception 'unknown_symbol' using errcode = '22023';
  end if;

  select coalesce(primary_mode, 'day_trade') into v_mode from profiles where user_id = p_user_id;
  if v_mode is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  select id into v_account_id from accounts
   where user_id = p_user_id and kind = 'paper'
   order by created_at asc limit 1;
  if v_account_id is null then
    raise exception 'no_paper_account' using errcode = '42501';
  end if;

  v_entry := coalesce(
    p_entry,
    (select c from candles where symbol = v_symbol and timeframe = '1d' order by ts desc limit 1),
    (select (quote_snapshot ->> 'price')::numeric from setups
      where symbol = v_symbol and quote_snapshot ? 'price'
      order by created_at desc limit 1),
    100);
  v_entry := round(v_entry::numeric, 2);
  v_exit  := round(coalesce(p_exit, v_entry * 1.032)::numeric, 2);
  v_pnl   := round(((v_exit - v_entry) * v_qty)::numeric, 2);

  v_origin := jsonb_build_object(
    'source', 'dev_simulation',
    'simulated', true,
    'generated_at', v_closed_at);

  ------------------------------------------------------------------ plan
  insert into trade_plans (
    user_id, mode, status, symbol, instrument_kind, intent,
    entry_condition, invalidation, stop, targets, size, origin)
  values (
    p_user_id, v_mode, 'closed', v_symbol, 'equity', 'buy_to_open',
    jsonb_build_object('type', 'price_cross', 'level', v_entry, 'direction', 'above'),
    jsonb_build_object('type', 'daily_close_below', 'level', round(v_entry * 0.985, 2)),
    round(v_entry * 0.985, 2),
    jsonb_build_array(jsonb_build_object('label', 'T1', 'level', v_exit)),
    jsonb_build_object('qty', v_qty, 'basis', 'simulation'),
    v_origin)
  returning id into v_plan_id;

  insert into plan_events (plan_id, user_id, seq, type, payload) values
    (v_plan_id, p_user_id, 1, 'created',  v_origin),
    (v_plan_id, p_user_id, 2, 'entered',  v_origin || jsonb_build_object('price', v_entry, 'qty', v_qty)),
    (v_plan_id, p_user_id, 3, 'exited',   v_origin || jsonb_build_object('price', v_exit, 'qty', v_qty));

  ----------------------------------------------------------------- orders
  insert into orders (
    user_id, account_id, plan_id, symbol, instrument_kind, side, type, qty,
    limit_price, status, idempotency_key, driver, origin)
  values (
    p_user_id, v_account_id, v_plan_id, v_symbol, 'equity', 'buy_to_open',
    'limit', v_qty, v_entry, 'filled',
    'sim-' || gen_random_uuid()::text, 'paper', v_origin)
  returning id into v_entry_ord;

  insert into orders (
    user_id, account_id, plan_id, symbol, instrument_kind, side, type, qty,
    limit_price, status, idempotency_key, driver, origin)
  values (
    p_user_id, v_account_id, v_plan_id, v_symbol, 'equity', 'sell_to_close',
    'limit', v_qty, v_exit, 'filled',
    'sim-' || gen_random_uuid()::text, 'paper', v_origin)
  returning id into v_exit_ord;

  insert into order_events (order_id, from_status, to_status, payload) values
    (v_entry_ord, 'draft',     'submitted', v_origin),
    (v_entry_ord, 'submitted', 'filled',    v_origin || jsonb_build_object('price', v_entry)),
    (v_exit_ord,  'draft',     'submitted', v_origin),
    (v_exit_ord,  'submitted', 'filled',    v_origin || jsonb_build_object('price', v_exit));

  insert into fills (order_id, qty, price, ts, liquidity) values
    (v_entry_ord, v_qty, v_entry, v_opened_at, 'simulated'),
    (v_exit_ord,  v_qty, v_exit,  v_closed_at, 'simulated');

  --------------------------------------------------------------- position
  insert into positions (
    user_id, account_id, symbol, instrument_kind, direction, qty, avg_cost,
    opened_at, closed_at, realized_pnl, origin_plan_id, mode, source, origin)
  values (
    p_user_id, v_account_id, v_symbol, 'equity', 'long', v_qty, v_entry,
    v_opened_at, v_closed_at, v_pnl, v_plan_id, v_mode, 'app', v_origin)
  returning id into v_position_id;

  ------------------------------------------------------------ user_events
  perform append_user_event(p_user_id, 'plan_event', 'trade_plan', v_plan_id,
    v_origin || jsonb_build_object('event', 'plan_closed', 'symbol', v_symbol));
  perform append_user_event(p_user_id, 'order_status', 'order', v_entry_ord,
    v_origin || jsonb_build_object('status', 'filled', 'side', 'buy_to_open', 'price', v_entry, 'qty', v_qty));
  perform append_user_event(p_user_id, 'fill', 'order', v_entry_ord,
    v_origin || jsonb_build_object('price', v_entry, 'qty', v_qty));
  perform append_user_event(p_user_id, 'order_status', 'order', v_exit_ord,
    v_origin || jsonb_build_object('status', 'filled', 'side', 'sell_to_close', 'price', v_exit, 'qty', v_qty));
  perform append_user_event(p_user_id, 'fill', 'order', v_exit_ord,
    v_origin || jsonb_build_object('price', v_exit, 'qty', v_qty));
  perform append_user_event(p_user_id, 'position_update', 'position', v_position_id,
    v_origin || jsonb_build_object(
      'event', 'position_closed', 'symbol', v_symbol,
      'realized_pnl', v_pnl, 'qty', v_qty,
      'opened_at', v_opened_at, 'closed_at', v_closed_at));

  return jsonb_build_object(
    'position_id',    v_position_id,
    'plan_id',        v_plan_id,
    'entry_order_id', v_entry_ord,
    'exit_order_id',  v_exit_ord,
    'symbol',         v_symbol,
    'qty',            v_qty,
    'entry',          v_entry,
    'exit',           v_exit,
    'realized_pnl',   v_pnl,
    'opened_at',      v_opened_at,
    'closed_at',      v_closed_at,
    'simulated',      true);
end;
$$;

revoke all on function simulate_closed_trade(uuid, text, numeric, numeric, numeric) from public;
grant execute on function simulate_closed_trade(uuid, text, numeric, numeric, numeric) to service_role;

--------------------------------------------------------------------- notify
create or replace function notify(
  p_user_id uuid,
  p_kind    text,
  p_payload jsonb default '{}'::jsonb
) returns notifications
language plpgsql security definer set search_path = public as $$
declare v_row notifications;
begin
  insert into notifications (user_id, channel, kind, payload)
  values (p_user_id, 'in_app', p_kind, coalesce(p_payload, '{}'::jsonb))
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function notify(uuid, text, jsonb) from public;
grant execute on function notify(uuid, text, jsonb) to service_role;

-- =====================================================================
-- FUNCTION GRANT FLOOR  (security fix, applies to 0013/0016 as well)
-- =====================================================================
-- Supabase configures default privileges that grant EXECUTE on every new
-- function in `public` to anon + authenticated. `revoke all on function ...
-- from public` (the pattern 0016 used) removes only the PUBLIC grant, not those
-- explicit role grants — so before this block, ANY signed-in user could call
--   complete_onboarding(<someone else's uuid>, ...)   [security definer, no auth check]
--   append_user_event(<someone else's uuid>, ...)     [writes another user's outbox]
--   post_room_message(...)                            [bypasses the API's rate limit + spam precheck]
-- straight through PostgREST /rpc/. Verified against the local stack.
--
-- Same model as 0014's table baseline: revoke from the client roles across the
-- whole schema, then grant back exactly the client-callable set. A function
-- added later without an explicit grant is closed by default.
--
-- Trigger functions are unaffected: PostgreSQL checks EXECUTE on a trigger
-- function when the trigger is CREATED, not each time it fires.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    -- PUBLIC too: PostgreSQL grants EXECUTE on every new function to PUBLIC,
    -- which is how 0013's next_user_event_seq() (security definer, takes a
    -- p_user uuid) stayed reachable by any client.
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

-- Client-callable surface (all three are security definer and self-scoped, or
-- read-only):
--   is_room_member  — referenced by the messages/rooms RLS policies, which are
--                     evaluated as the querying role, so it needs EXECUTE
grant execute on function is_room_member(uuid) to authenticated;
grant execute on function join_core_room(uuid, uuid) to authenticated;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated;
