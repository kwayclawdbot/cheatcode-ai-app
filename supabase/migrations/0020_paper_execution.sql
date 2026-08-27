-- 0020_paper_execution
-- Source: docs/BUILD-BRIEF-round-3.md "Paper execution", docs/03_SERVICE_SPECS.md
-- Unit 4, docs/01_DATA_MODEL.md §7.
--
-- PAPER ONLY. No broker, no SnapTrade. The API computes the fill model (price,
-- qty, partial/resting, freshness); this migration owns ATOMICITY: every order
-- transition, fill, position mutation, account mutation and outbox row lands in
-- one transaction, because PostgREST has no multi-statement transaction.
--
-- =====================================================================
-- FUNCTION SIGNATURES (this block is the contract for the API lane)
-- =====================================================================
--
--   create_plan(p_user_id uuid, p_patch jsonb) returns trade_plans
--     GRANT: service_role only
--     p_patch = {
--       setup_id?          uuid,
--       mode               'day_trade'|'swing'|'invest'   (required; immutable after create)
--       symbol             text        (required, upper-cased)
--       occ_symbol?        text,  instrument_kind? 'equity'|'etf'|'option' (default 'equity')
--       intent             'buy_to_open'|'sell_short'     (required; the ENTRY side)
--       entry              numeric     (required; or entry_condition.level)
--       stop               numeric     (required)
--       targets            [110, 120] | [{label,level}, …]  (optional; validated when present)
--       entry_condition?   jsonb,  invalidation? jsonb
--       size?              jsonb   (the API computes size; this fn computes NOTHING about it)
--       scenarios?         jsonb
--       exit_style?        'auto'|'alert_assisted'  (default 'auto')
--       status?            'draft'|'planned'        (default 'draft')
--       origin?            jsonb   (default {"source":"api"})
--     }
--     Validates orientation: long (buy_to_open)  → stop < entry < every target
--                            short (sell_short)  → target < entry < stop
--     Writes trade_plans + plan_events(seq 1, type 'created') + user_events in one txn.
--     Errors: 'plan_mode_required' | 'plan_symbol_required' | 'plan_intent_invalid'
--           | 'plan_entry_required' | 'plan_stop_required'
--           | 'plan_orientation_invalid' | 'plan_target_orientation_invalid'
--           | 'exit_style_invalid'                                     (all 22023)
--
--   plan_action(p_user_id uuid, p_plan_id uuid, p_action text, p_payload jsonb)
--     returns trade_plans
--     GRANT: service_role only
--     p_action ∈ activate | cancel | adjust_stop | adjust_target | set_exit_style
--       activate        draft → planned                (idempotent when already planned)
--       cancel          draft|planned → cancelled      (cancels any resting order of the plan)
--       adjust_stop     p_payload = {stop: numeric}    draft|planned|active|exiting
--       adjust_target   p_payload = {targets:[…]} or {target: numeric}
--       set_exit_style  p_payload = {exit_style:'auto'|'alert_assisted'}
--     adjust_* re-validate orientation, update the plan's OPEN position
--     (positions.stop / positions.target) and re-price any resting stop/target
--     bracket leg of that plan. Every action writes plan_events(next seq) +
--     user_events.
--     Terminal states (closed, cancelled, invalidated) refuse every action.
--     Errors: 'plan_not_found' (42501) | 'plan_action_unknown' (22023)
--           | 'plan_state_invalid' (22023) | 'plan_orientation_invalid' (22023)
--           | 'plan_target_orientation_invalid' (22023) | 'exit_style_invalid' (22023)
--           | 'plan_stop_required' (22023)
--
--   submit_paper_order(p_user_id uuid, p_order_id uuid, p_idempotency_key text,
--                      p_fill jsonb)
--     returns jsonb
--     GRANT: service_role only
--     p_fill = {
--       fill_price numeric, fill_qty numeric,
--       partial    boolean,      -- fill_qty < order qty, remainder keeps working
--       resting    boolean,      -- accepted and NOT filled (limit away from the market)
--       quote      {price, source_ts, received_ts, freshness},
--       bracket    {stop, target, exit_style} | null,
--       close_of_position_id uuid | null   -- close flow: cancel that position's resting legs
--     }
--     Transitions (each one writes order_events + a user_events 'order_status'):
--       draft|previewed → submitted → accepted → (partially_filled | filled)
--     accepted ≠ filled: when p_fill.resting is true the order stops at accepted,
--     `exec_meta.resting = true`, and the bracket envelope is parked in
--     `exec_meta.bracket` so apply_paper_tick can raise the legs when it fills.
--     On a fill: fills row → position upsert by (account_id, symbol, direction)
--     matching position_effect EXACTLY (buy_to_open opens/adds long; sell_to_close
--     reduces/closes long with realized_pnl; sell_short opens short; buy_to_cover
--     closes short) → account cash/buying_power/equity (paper: cash −= cost on
--     buys, += proceeds on sells; buying_power = cash for v1; equity = cash +
--     Σ signed qty × mark) → bracket legs as child orders
--     (leg, parent_order_id, bracket_group, status accepted, exec_meta.resting)
--     → user_events order_status + fill + position_update.
--     Idempotency: if p_idempotency_key already belongs to another order, or the
--     target order has already progressed past previewed, returns
--     {deduplicated:true, order} and writes nothing.
--     Returns {deduplicated:false, order, position, legs:[…]}
--     Errors: 'order_not_found' (42501) | 'order_not_paper' (22023)
--           | 'fill_price_required' (22023) | 'fill_qty_invalid' (22023)
--           | 'position_not_found' (22023) | 'position_insufficient_qty' (22023)
--
--   apply_paper_tick(p_user_id uuid, p_symbol text, p_quote jsonb) returns jsonb
--     GRANT: service_role only
--     p_quote = {price, source_ts, received_ts, freshness}
--     For ONE user + ONE symbol, in this order:
--       1. fill resting entry limits whose price is crossed
--          (buy limit ≥ price / sell limit ≤ price) — full fill at the limit
--       2. fire stop/target legs that are crossed:
--            exec_meta.exit_style = 'auto'          → fill the leg at the level
--                                                     (or the tick price when it
--                                                     gapped through), reduce/close
--                                                     the position with realized_pnl,
--                                                     cancel the sibling leg,
--                                                     update the account
--            exec_meta.exit_style = 'alert_assisted' → mark exec_meta.triggered =
--                                                     true (+ triggered_at,
--                                                     trigger_price), leave it
--                                                     accepted, and report it in
--                                                     needs_attention so the API
--                                                     raises the alert/notification
--       3. mark every open position: unrealized_pnl, mark_price, mark_ts
--     Returns {marked:[position_id…], filled:[order_id…],
--              fired:[{order_id, leg, price, position_id}…],
--              needs_attention:[{order_id, leg, level, price, symbol,
--                                position_id, exit_style}…],
--              price, symbol, freshness}
--     Errors: 'quote_price_required' (22023)
--
--   close_position_prepare(p_user_id uuid, p_position_id uuid) returns jsonb
--     GRANT: service_role only
--     The opposite-side order draft params for POST /positions/:id/close. Read-only.
--     Returns {position_id, account_id, plan_id, mode, symbol, occ_symbol,
--              instrument_kind, direction, side, qty, avg_cost, mark_price,
--              mark_ts, unrealized_pnl, stop, target,
--              resting_legs:[{order_id, leg, type, status, limit_price, stop_price}…],
--              close_of_position_id}
--     `side` is sell_to_close for a long, buy_to_cover for a short.
--     The resting legs are NOT cancelled here — cancellation happens inside
--     submit_paper_order when the API passes
--     p_fill.close_of_position_id = <the returned close_of_position_id>. The
--     cancel lands in the SAME transaction as the closing fill, and runs BEFORE
--     it, so an auto stop/target leg can never act on shares the manual exit is
--     already closing.
--     Errors: 'position_not_found' (42501) | 'position_already_closed' (22023)
--
--   VIEW daily_risk_v(user_id, day, realized_loss, open_risk, used, cap)
--     security_invoker → a client JWT sees exactly its own row (positions and
--     risk_policies are owner-select); service_role sees every row.
--     day           = today in America/New_York
--     realized_loss = Σ greatest(0, −realized_pnl) over positions closed today
--     open_risk     = Σ qty × |avg_cost − stop| over positions still open that
--                     were OPENED today and carry a stop
--     used          = realized_loss + open_risk
--     cap           = risk_policies.daily_loss_cap_usd
--     GRANT: select to authenticated + service_role.
--
--   Internal (SECURITY DEFINER, EXECUTE granted to NOBODY — reachable only from
--   the functions above, which run as the owner):
--     paper_side_direction(position_effect) → 'long'|'short'
--     paper_side_is_open(position_effect)   → boolean
--     paper_close_side(text)                → position_effect
--     paper_normalize_targets(jsonb)        → jsonb  [{label,level}…]
--     paper_target_levels(jsonb)            → numeric[]
--     paper_recompute_account(uuid, numeric)→ accounts
--     paper_cancel_resting_legs(uuid, uuid, text, uuid) → uuid[]
--     paper_apply_fill(uuid, numeric, numeric, text, jsonb, jsonb) → jsonb
--
-- SCHEMA-NOTES gap 2.7: this migration re-applies the function grant floor at
-- the bottom (revoke from public/anon/authenticated across `public`, then grant
-- back only the three genuinely client-callable functions from 0018). Every new
-- function above ALSO carries its own explicit revoke.
-- =====================================================================

-- =====================================================================
-- 1. COLUMNS
-- =====================================================================

-- orders: bracket legs, fill accounting, lifecycle stamps, execution envelope.
alter table orders add column if not exists parent_order_id uuid references orders;
alter table orders add column if not exists leg text
  check (leg in ('entry','stop','target'));
alter table orders add column if not exists filled_qty numeric not null default 0;
alter table orders add column if not exists avg_fill_price numeric;
alter table orders add column if not exists submitted_at timestamptz;
alter table orders add column if not exists accepted_at timestamptz;
alter table orders add column if not exists filled_at timestamptz;
-- exec_meta is the paper driver's own envelope: {resting, exit_style, bracket,
-- triggered, triggered_at, trigger_price, last_quote, cancel_reason,
-- close_of_position_id}. `preview` stays the preview contract, `origin` stays
-- provenance — neither is overloaded. See SCHEMA-NOTES 1.33.
alter table orders add column if not exists exec_meta jsonb not null default '{}'::jsonb;

create index if not exists orders_bracket_idx on orders (bracket_group)
  where bracket_group is not null;
create index if not exists orders_parent_idx on orders (parent_order_id)
  where parent_order_id is not null;
create index if not exists orders_working_idx on orders (user_id, symbol, status);

-- positions: mark-to-market, the bracket levels the position is protected by,
-- and a derived open/closed status the client can filter on.
alter table positions add column if not exists unrealized_pnl numeric not null default 0;
alter table positions add column if not exists mark_price numeric;
alter table positions add column if not exists mark_ts timestamptz;
alter table positions add column if not exists stop numeric;
alter table positions add column if not exists target numeric;

-- Generated, not stored-and-maintained: closed_at is the single source of truth
-- for "is this position open", so status can never drift from it. The check
-- constraint is written out anyway so the shape matches the brief.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'positions' and column_name = 'status'
  ) then
    alter table positions add column status text
      generated always as (case when closed_at is null then 'open' else 'closed' end) stored;
    alter table positions add constraint positions_status_check
      check (status in ('open','closed'));
  end if;
end;
$$;

create index if not exists positions_status_idx on positions (user_id, status, symbol);

-- One OPEN position per (account, instrument, direction) — the upsert key the
-- paper matcher uses. Options carry occ_symbol so a covered call and its
-- underlying never collide.
create unique index if not exists positions_open_uniq
  on positions (account_id, symbol, coalesce(occ_symbol, ''), direction)
  where closed_at is null;

-- ---------------------------------------------------------------------
-- Child-row delete rules. 0007 left every execution-history FK at NO ACTION,
-- so deleting a user (admin action, and the teardown path in
-- scripts/rls-test.mjs) cascaded profiles → orders / trade_plans and then
-- failed on the `fills`, `order_events`, `plan_events` and `orders.plan_id`
-- rows pointing at them. A history row whose parent order/plan no longer exists
-- is unreachable garbage, so it goes with the parent; the `plan_id` pointers
-- are nulled rather than cascaded because an order can legitimately outlive its
-- plan. RI actions run as the table owner, so the append-only
-- `revoke update, delete … from service_role` (0014) does not block them.
-- See SCHEMA-NOTES 1.37. (positions.user_id / debriefs.user_id still carry no
-- FK at all — that is gap 2.9 and still the owner's call.)
alter table fills        drop constraint if exists fills_order_id_fkey;
alter table fills        add  constraint fills_order_id_fkey
  foreign key (order_id) references orders on delete cascade;

alter table order_events drop constraint if exists order_events_order_id_fkey;
alter table order_events add  constraint order_events_order_id_fkey
  foreign key (order_id) references orders on delete cascade;

alter table plan_events  drop constraint if exists plan_events_plan_id_fkey;
alter table plan_events  add  constraint plan_events_plan_id_fkey
  foreign key (plan_id) references trade_plans on delete cascade;

alter table orders       drop constraint if exists orders_parent_order_id_fkey;
alter table orders       add  constraint orders_parent_order_id_fkey
  foreign key (parent_order_id) references orders on delete cascade;

alter table orders       drop constraint if exists orders_plan_id_fkey;
alter table orders       add  constraint orders_plan_id_fkey
  foreign key (plan_id) references trade_plans on delete set null;

alter table positions    drop constraint if exists positions_origin_plan_id_fkey;
alter table positions    add  constraint positions_origin_plan_id_fkey
  foreign key (origin_plan_id) references trade_plans on delete set null;

alter table debriefs     drop constraint if exists debriefs_plan_id_fkey;
alter table debriefs     add  constraint debriefs_plan_id_fkey
  foreign key (plan_id) references trade_plans on delete set null;

alter table debriefs     drop constraint if exists debriefs_position_id_fkey;
alter table debriefs     add  constraint debriefs_position_id_fkey
  foreign key (position_id) references positions on delete cascade;

-- =====================================================================
-- 2. INTERNAL HELPERS
-- =====================================================================

create or replace function paper_side_direction(p_side position_effect) returns text
language sql immutable as $$
  select case p_side
    when 'buy_to_open'   then 'long'
    when 'sell_to_close' then 'long'
    when 'sell_short'    then 'short'
    when 'buy_to_cover'  then 'short'
  end;
$$;

create or replace function paper_side_is_open(p_side position_effect) returns boolean
language sql immutable as $$
  select p_side in ('buy_to_open','sell_short');
$$;

create or replace function paper_close_side(p_direction text) returns position_effect
language sql immutable as $$
  select case p_direction when 'long' then 'sell_to_close'::position_effect
                          else 'buy_to_cover'::position_effect end;
$$;

-- 'buy' legs debit cash, 'sell' legs credit it.
create or replace function paper_side_is_debit(p_side position_effect) returns boolean
language sql immutable as $$
  select p_side in ('buy_to_open','buy_to_cover');
$$;

-- Accepts [110, 120] or [{"label":"T1","level":110}] and always returns
-- [{"label":…,"level":…}].
create or replace function paper_normalize_targets(p_targets jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_el  jsonb;
  v_i   int := 0;
  v_lvl numeric;
begin
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_el in select value from jsonb_array_elements(p_targets) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_el) = 'number' then
      v_lvl := v_el::text::numeric;
      v_out := v_out || jsonb_build_array(
        jsonb_build_object('label', 'T' || v_i, 'level', v_lvl));
    elsif jsonb_typeof(v_el) = 'object' then
      v_lvl := nullif(v_el ->> 'level', '')::numeric;
      v_out := v_out || jsonb_build_array(
        v_el || jsonb_build_object('label', coalesce(v_el ->> 'label', 'T' || v_i),
                                   'level', v_lvl));
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function paper_target_levels(p_targets jsonb) returns numeric[]
language sql immutable as $$
  select coalesce(
    array_agg((t ->> 'level')::numeric order by ord)
      filter (where nullif(t ->> 'level', '') is not null),
    '{}'::numeric[])
  from jsonb_array_elements(coalesce(paper_normalize_targets(p_targets), '[]'::jsonb))
       with ordinality as x(t, ord);
$$;

-- Paper cash model (v1): cash moves by the notional, buying_power = cash, and
-- equity = cash + Σ signed qty × mark (a short's proceeds are already in cash,
-- its liability is subtracted here).
create or replace function paper_recompute_account(
  p_account_id uuid, p_cash_delta numeric default 0
) returns accounts
language plpgsql security definer set search_path = public as $$
declare
  v_account accounts;
  v_market  numeric;
begin
  update accounts
     set cash = coalesce(cash, 0) + coalesce(p_cash_delta, 0)
   where id = p_account_id
  returning * into v_account;

  if not found then
    raise exception 'account_not_found' using errcode = '42501';
  end if;

  select coalesce(sum(
           (case p.direction when 'long' then 1 else -1 end)
           * p.qty * coalesce(p.mark_price, p.avg_cost)), 0)
    into v_market
    from positions p
   where p.account_id = p_account_id and p.closed_at is null;

  update accounts
     set buying_power = coalesce(cash, 0),          -- v1: no margin
         equity       = coalesce(cash, 0) + v_market
   where id = p_account_id
  returning * into v_account;

  return v_account;
end;
$$;

-- Cancels the resting stop/target legs protecting one position. Paper positions
-- are keyed by (account, symbol, direction), so a leg is "this position's" when
-- it is the closing side for that direction on that account+symbol.
create or replace function paper_cancel_resting_legs(
  p_position_id uuid,
  p_except_order_id uuid default null,
  p_reason text default 'position_closed',
  p_bracket_group uuid default null
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_position positions;
  v_order    orders;
  v_ids      uuid[] := '{}';
begin
  select * into v_position from positions where id = p_position_id;
  if not found then
    return v_ids;
  end if;

  for v_order in
    select o.* from orders o
     where o.account_id = v_position.account_id
       and o.symbol     = v_position.symbol
       and coalesce(o.occ_symbol, '') = coalesce(v_position.occ_symbol, '')
       and o.leg in ('stop','target')
       and o.side = paper_close_side(v_position.direction)
       and o.status in ('submitted','accepted','partially_filled')
       and (p_except_order_id is null or o.id <> p_except_order_id)
       and (p_bracket_group is null or o.bracket_group = p_bracket_group)
     for update
  loop
    update orders
       set status    = 'cancelled',
           exec_meta = exec_meta
                       || jsonb_build_object('resting', false,
                                             'cancel_reason', p_reason,
                                             'cancelled_at', now())
     where id = v_order.id;

    insert into order_events (order_id, from_status, to_status, payload)
    values (v_order.id, v_order.status, 'cancelled',
            jsonb_build_object('event', 'leg_cancelled',
                               'reason', p_reason,
                               'leg', v_order.leg,
                               'position_id', p_position_id));

    perform append_user_event(
      v_order.user_id, 'order_status', 'order', v_order.id,
      jsonb_build_object('status', 'cancelled', 'leg', v_order.leg,
                         'symbol', v_order.symbol, 'reason', p_reason,
                         'position_id', p_position_id));

    v_ids := v_ids || v_order.id;
  end loop;

  return v_ids;
end;
$$;

-- =====================================================================
-- 3. THE FILL ENGINE (shared by submit_paper_order and apply_paper_tick)
-- =====================================================================
-- One fill against one order: fills row → order transition → position upsert →
-- account → bracket legs → plan status → outbox. Returns
-- {order, position, legs, closed_position, realized_pnl}.
create or replace function paper_apply_fill(
  p_order_id uuid,
  p_price    numeric,
  p_qty      numeric,
  p_reason   text,
  p_bracket  jsonb default null,
  p_quote    jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order      orders;
  v_from       order_status;
  v_to         order_status;
  v_remaining  numeric;
  v_fill_qty   numeric;
  v_new_filled numeric;
  v_new_avg    numeric;
  v_direction  text;
  v_position   positions;
  v_open_qty   numeric;
  v_realized   numeric := 0;
  v_closed     boolean := false;
  v_cash_delta numeric;
  v_mode       app_mode;
  v_bracket    jsonb;
  v_legs       jsonb := '[]'::jsonb;
  v_leg_id     uuid;
  v_group      uuid;
  v_plan       trade_plans;
  v_seq        int;
  v_new_status plan_status;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = '42501';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'fill_price_required' using errcode = '22023';
  end if;

  v_remaining := v_order.qty - coalesce(v_order.filled_qty, 0);
  v_fill_qty  := least(coalesce(p_qty, v_remaining), v_remaining);
  if v_fill_qty is null or v_fill_qty <= 0 then
    raise exception 'fill_qty_invalid' using errcode = '22023';
  end if;

  --------------------------------------------------------------- fills row
  insert into fills (order_id, qty, price, ts, liquidity)
  values (p_order_id, v_fill_qty, p_price, now(), 'paper');

  v_new_filled := coalesce(v_order.filled_qty, 0) + v_fill_qty;
  select round(sum(f.qty * f.price) / nullif(sum(f.qty), 0), 6)
    into v_new_avg from fills f where f.order_id = p_order_id;

  v_from := v_order.status;
  v_to   := case when v_new_filled >= v_order.qty then 'filled'::order_status
                 else 'partially_filled'::order_status end;

  update orders
     set status         = v_to,
         filled_qty     = v_new_filled,
         avg_fill_price = v_new_avg,
         filled_at      = case when v_to = 'filled' then now() else filled_at end,
         exec_meta      = exec_meta
                          || jsonb_build_object('resting', v_to <> 'filled')
                          || case when p_quote is null then '{}'::jsonb
                                  else jsonb_build_object('last_quote', p_quote) end
   where id = p_order_id
  returning * into v_order;

  insert into order_events (order_id, from_status, to_status, payload)
  values (p_order_id, v_from, v_to,
          jsonb_build_object('event', 'fill', 'reason', p_reason,
                             'price', p_price, 'qty', v_fill_qty,
                             'filled_qty', v_new_filled,
                             'avg_fill_price', v_new_avg,
                             'quote', p_quote));

  perform append_user_event(
    v_order.user_id, 'order_status', 'order', p_order_id,
    jsonb_build_object('status', v_to, 'symbol', v_order.symbol,
                       'side', v_order.side, 'leg', v_order.leg,
                       'reason', p_reason, 'paper', true));
  perform append_user_event(
    v_order.user_id, 'fill', 'order', p_order_id,
    jsonb_build_object('price', p_price, 'qty', v_fill_qty,
                       'symbol', v_order.symbol, 'side', v_order.side,
                       'leg', v_order.leg, 'paper', true));

  ------------------------------------------------------------- position
  v_direction := paper_side_direction(v_order.side);

  select * into v_position
    from positions
   where account_id = v_order.account_id
     and symbol = v_order.symbol
     and coalesce(occ_symbol, '') = coalesce(v_order.occ_symbol, '')
     and direction = v_direction
     and closed_at is null
   for update;

  if paper_side_is_open(v_order.side) then
    select coalesce(t.mode, p.primary_mode) into v_mode
      from profiles p
      left join trade_plans t on t.id = v_order.plan_id
     where p.user_id = v_order.user_id;

    if v_position.id is not null then
      update positions
         set qty      = v_position.qty + v_fill_qty,
             avg_cost = round(((v_position.avg_cost * v_position.qty)
                               + (p_price * v_fill_qty))
                              / (v_position.qty + v_fill_qty), 6)
       where id = v_position.id
      returning * into v_position;
    else
      insert into positions (
        user_id, account_id, symbol, occ_symbol, instrument_kind, direction,
        qty, avg_cost, opened_at, mark_price, mark_ts, origin_plan_id, mode,
        source, origin)
      values (
        v_order.user_id, v_order.account_id, v_order.symbol, v_order.occ_symbol,
        v_order.instrument_kind, v_direction, v_fill_qty, p_price, now(),
        p_price, now(), v_order.plan_id, coalesce(v_mode, 'day_trade'),
        'app', coalesce(v_order.origin, '{}'::jsonb) || jsonb_build_object('driver', 'paper'))
      returning * into v_position;
    end if;
  else
    if v_position.id is null then
      raise exception 'position_not_found' using errcode = '22023';
    end if;
    if v_fill_qty > v_position.qty then
      raise exception 'position_insufficient_qty' using errcode = '22023';
    end if;

    v_realized := round(
      case v_position.direction
        when 'long' then (p_price - v_position.avg_cost) * v_fill_qty
        else             (v_position.avg_cost - p_price) * v_fill_qty
      end, 6);

    v_open_qty := v_position.qty - v_fill_qty;
    v_closed   := v_open_qty <= 0;

    update positions
       set qty            = greatest(v_open_qty, 0),
           realized_pnl   = coalesce(realized_pnl, 0) + v_realized,
           unrealized_pnl = case when v_closed then 0 else unrealized_pnl end,
           closed_at      = case when v_closed then now() else closed_at end
     where id = v_position.id
    returning * into v_position;
  end if;

  perform append_user_event(
    v_order.user_id, 'position_update', 'position', v_position.id,
    jsonb_build_object(
      'event', case when v_closed then 'position_closed'
                    when paper_side_is_open(v_order.side) then 'position_opened'
                    else 'position_reduced' end,
      'symbol', v_position.symbol, 'direction', v_position.direction,
      'qty', v_position.qty, 'avg_cost', v_position.avg_cost,
      'realized_pnl', v_position.realized_pnl, 'fill_price', p_price,
      'fill_qty', v_fill_qty, 'order_id', p_order_id, 'paper', true));

  --------------------------------------------------------------- account
  v_cash_delta := case when paper_side_is_debit(v_order.side)
                       then -(p_price * v_fill_qty)
                       else  (p_price * v_fill_qty) end;
  perform paper_recompute_account(v_order.account_id, v_cash_delta);

  ---------------------------------------------------------- bracket legs
  v_bracket := coalesce(p_bracket, v_order.exec_meta -> 'bracket');
  if paper_side_is_open(v_order.side)
     and v_bracket is not null and jsonb_typeof(v_bracket) = 'object'
     and not exists (select 1 from orders o
                      where o.parent_order_id = p_order_id and o.leg in ('stop','target')
                        and o.status not in ('cancelled','rejected'))
  then
    v_group := coalesce(v_order.bracket_group, gen_random_uuid());

    update orders
       set bracket_group = v_group,
           leg           = coalesce(leg, 'entry'),
           exec_meta     = exec_meta || jsonb_build_object('bracket', v_bracket)
     where id = p_order_id
    returning * into v_order;

    update positions
       set stop   = coalesce(nullif(v_bracket ->> 'stop', '')::numeric, stop),
           target = coalesce(nullif(v_bracket ->> 'target', '')::numeric, target)
     where id = v_position.id
    returning * into v_position;

    -- stop leg
    if nullif(v_bracket ->> 'stop', '') is not null then
      insert into orders (
        user_id, account_id, plan_id, symbol, occ_symbol, instrument_kind,
        side, type, qty, stop_price, duration, status, idempotency_key,
        driver, bracket_group, parent_order_id, leg,
        submitted_at, accepted_at, exec_meta, origin)
      values (
        v_order.user_id, v_order.account_id, v_order.plan_id, v_order.symbol,
        v_order.occ_symbol, v_order.instrument_kind,
        paper_close_side(v_direction), 'stop', v_position.qty,
        (v_bracket ->> 'stop')::numeric, 'gtc', 'accepted',
        'leg-stop-' || gen_random_uuid()::text, 'paper', v_group, p_order_id, 'stop',
        now(), now(),
        jsonb_build_object('resting', true,
                           'exit_style', coalesce(v_bracket ->> 'exit_style', 'auto'),
                           'level', (v_bracket ->> 'stop')::numeric),
        coalesce(v_order.origin, '{}'::jsonb) || jsonb_build_object('driver', 'paper', 'leg_of', p_order_id))
      returning id into v_leg_id;

      insert into order_events (order_id, from_status, to_status, payload)
      values (v_leg_id, 'draft', 'accepted',
              jsonb_build_object('event', 'leg_created', 'leg', 'stop',
                                 'level', (v_bracket ->> 'stop')::numeric,
                                 'bracket_group', v_group));
      perform append_user_event(
        v_order.user_id, 'order_status', 'order', v_leg_id,
        jsonb_build_object('status', 'accepted', 'leg', 'stop',
                           'symbol', v_order.symbol, 'resting', true, 'paper', true));
      v_legs := v_legs || jsonb_build_array(
        (select to_jsonb(o) from orders o where o.id = v_leg_id));
    end if;

    -- target leg
    if nullif(v_bracket ->> 'target', '') is not null then
      insert into orders (
        user_id, account_id, plan_id, symbol, occ_symbol, instrument_kind,
        side, type, qty, limit_price, duration, status, idempotency_key,
        driver, bracket_group, parent_order_id, leg,
        submitted_at, accepted_at, exec_meta, origin)
      values (
        v_order.user_id, v_order.account_id, v_order.plan_id, v_order.symbol,
        v_order.occ_symbol, v_order.instrument_kind,
        paper_close_side(v_direction), 'limit', v_position.qty,
        (v_bracket ->> 'target')::numeric, 'gtc', 'accepted',
        'leg-target-' || gen_random_uuid()::text, 'paper', v_group, p_order_id, 'target',
        now(), now(),
        jsonb_build_object('resting', true,
                           'exit_style', coalesce(v_bracket ->> 'exit_style', 'auto'),
                           'level', (v_bracket ->> 'target')::numeric),
        coalesce(v_order.origin, '{}'::jsonb) || jsonb_build_object('driver', 'paper', 'leg_of', p_order_id))
      returning id into v_leg_id;

      insert into order_events (order_id, from_status, to_status, payload)
      values (v_leg_id, 'draft', 'accepted',
              jsonb_build_object('event', 'leg_created', 'leg', 'target',
                                 'level', (v_bracket ->> 'target')::numeric,
                                 'bracket_group', v_group));
      perform append_user_event(
        v_order.user_id, 'order_status', 'order', v_leg_id,
        jsonb_build_object('status', 'accepted', 'leg', 'target',
                           'symbol', v_order.symbol, 'resting', true, 'paper', true));
      v_legs := v_legs || jsonb_build_array(
        (select to_jsonb(o) from orders o where o.id = v_leg_id));
    end if;
  end if;

  -- A closed position keeps no protection: every remaining resting leg goes.
  if v_closed then
    perform paper_cancel_resting_legs(v_position.id, p_order_id, 'position_closed', null);
  end if;

  --------------------------------------------------------------- plan state
  if v_order.plan_id is not null then
    select * into v_plan from trade_plans where id = v_order.plan_id for update;
    if found and v_plan.status not in ('closed','cancelled','invalidated') then
      v_new_status := case
        when v_closed then 'closed'::plan_status
        when not paper_side_is_open(v_order.side) then 'exiting'::plan_status
        else 'active'::plan_status end;

      if v_new_status is distinct from v_plan.status then
        update trade_plans set status = v_new_status where id = v_plan.id;
        select coalesce(max(seq), 0) + 1 into v_seq from plan_events where plan_id = v_plan.id;
        insert into plan_events (plan_id, user_id, seq, type, payload)
        values (v_plan.id, v_plan.user_id, v_seq,
                case when v_closed then 'exited'
                     when paper_side_is_open(v_order.side) then 'entered'
                     else 'exiting' end,
                jsonb_build_object('status', v_new_status, 'order_id', p_order_id,
                                   'price', p_price, 'qty', v_fill_qty));
        perform append_user_event(
          v_plan.user_id, 'plan_event', 'trade_plan', v_plan.id,
          jsonb_build_object('event', 'plan_status_changed', 'status', v_new_status,
                             'symbol', v_plan.symbol, 'order_id', p_order_id));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'order',            (select to_jsonb(o) from orders o where o.id = p_order_id),
    'position',         to_jsonb(v_position),
    'legs',             v_legs,
    'closed_position',  v_closed,
    'realized_pnl',     v_realized,
    'fill_price',       p_price,
    'fill_qty',         v_fill_qty);
end;
$$;

-- =====================================================================
-- 4. create_plan
-- =====================================================================
create or replace function create_plan(p_user_id uuid, p_patch jsonb)
returns trade_plans
language plpgsql security definer set search_path = public as $$
declare
  v_plan     trade_plans;
  v_symbol   text := upper(btrim(coalesce(p_patch ->> 'symbol', '')));
  v_intent   position_effect;
  v_mode     app_mode;
  v_entry    numeric;
  v_stop     numeric;
  v_targets  jsonb;
  v_levels   numeric[];
  v_lvl      numeric;
  v_status   plan_status;
  v_style    text := coalesce(p_patch ->> 'exit_style', 'auto');
  v_cond     jsonb;
begin
  if v_symbol = '' then
    raise exception 'plan_symbol_required' using errcode = '22023';
  end if;
  if nullif(p_patch ->> 'mode', '') is null then
    raise exception 'plan_mode_required' using errcode = '22023';
  end if;
  v_mode := (p_patch ->> 'mode')::app_mode;

  if coalesce(p_patch ->> 'intent', '') not in ('buy_to_open','sell_short') then
    -- a plan describes how a position is OPENED; closes are orders, not plans
    raise exception 'plan_intent_invalid' using errcode = '22023';
  end if;
  v_intent := (p_patch ->> 'intent')::position_effect;

  if v_style not in ('auto','alert_assisted') then
    raise exception 'exit_style_invalid' using errcode = '22023';
  end if;

  v_cond  := p_patch -> 'entry_condition';
  v_entry := coalesce(
    nullif(p_patch ->> 'entry', '')::numeric,
    nullif(v_cond ->> 'level', '')::numeric);
  if v_entry is null then
    raise exception 'plan_entry_required' using errcode = '22023';
  end if;

  v_stop := nullif(p_patch ->> 'stop', '')::numeric;
  if v_stop is null then
    raise exception 'plan_stop_required' using errcode = '22023';
  end if;

  v_targets := paper_normalize_targets(p_patch -> 'targets');
  v_levels  := paper_target_levels(v_targets);

  ------------------------------------------------------------- orientation
  if v_intent = 'buy_to_open' then
    if not (v_stop < v_entry) then
      raise exception 'plan_orientation_invalid' using errcode = '22023';
    end if;
    foreach v_lvl in array v_levels loop
      if not (v_lvl > v_entry) then
        raise exception 'plan_target_orientation_invalid' using errcode = '22023';
      end if;
    end loop;
  else
    if not (v_stop > v_entry) then
      raise exception 'plan_orientation_invalid' using errcode = '22023';
    end if;
    foreach v_lvl in array v_levels loop
      if not (v_lvl < v_entry) then
        raise exception 'plan_target_orientation_invalid' using errcode = '22023';
      end if;
    end loop;
  end if;

  v_status := coalesce(nullif(p_patch ->> 'status', ''), 'draft')::plan_status;
  if v_status not in ('draft','planned') then
    raise exception 'plan_state_invalid' using errcode = '22023';
  end if;

  if v_cond is null then
    v_cond := jsonb_build_object(
      'type', 'price_cross', 'level', v_entry,
      'direction', case when v_intent = 'buy_to_open' then 'above' else 'below' end);
  end if;

  insert into trade_plans (
    user_id, setup_id, mode, status, symbol, occ_symbol, instrument_kind,
    intent, entry_condition, invalidation, stop, targets, size, scenarios,
    exit_style, origin)
  values (
    p_user_id,
    nullif(p_patch ->> 'setup_id', '')::uuid,
    v_mode, v_status, v_symbol,
    nullif(p_patch ->> 'occ_symbol', ''),
    coalesce(nullif(p_patch ->> 'instrument_kind', ''), 'equity')::instrument_kind,
    v_intent, v_cond,
    coalesce(p_patch -> 'invalidation',
             jsonb_build_object('type', 'stop_breach', 'level', v_stop)),
    v_stop, v_targets,
    p_patch -> 'size', p_patch -> 'scenarios', v_style,
    coalesce(p_patch -> 'origin', jsonb_build_object('source', 'api')))
  returning * into v_plan;

  insert into plan_events (plan_id, user_id, seq, type, payload)
  values (v_plan.id, p_user_id, 1, 'created',
          jsonb_build_object('symbol', v_symbol, 'intent', v_intent,
                             'entry', v_entry, 'stop', v_stop,
                             'targets', v_targets, 'mode', v_mode,
                             'exit_style', v_style, 'status', v_status));

  perform append_user_event(
    p_user_id, 'plan_event', 'trade_plan', v_plan.id,
    jsonb_build_object('event', 'plan_created', 'symbol', v_symbol,
                       'intent', v_intent, 'entry', v_entry, 'stop', v_stop,
                       'targets', v_targets, 'mode', v_mode, 'status', v_status));

  return v_plan;
end;
$$;

revoke all on function create_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function create_plan(uuid, jsonb) to service_role;

-- =====================================================================
-- 5. plan_action
-- =====================================================================
create or replace function plan_action(
  p_user_id uuid, p_plan_id uuid, p_action text, p_payload jsonb default '{}'::jsonb
) returns trade_plans
language plpgsql security definer set search_path = public as $$
declare
  v_plan     trade_plans;
  v_entry    numeric;
  v_stop     numeric;
  v_targets  jsonb;
  v_levels   numeric[];
  v_lvl      numeric;
  v_style    text;
  v_seq      int;
  v_type     text;
  v_position positions;
  v_order    orders;
  v_payload  jsonb := coalesce(p_payload, '{}'::jsonb);
  v_touched  uuid[] := '{}';
begin
  select * into v_plan from trade_plans
   where id = p_plan_id and user_id = p_user_id for update;
  if not found then
    raise exception 'plan_not_found' using errcode = '42501';
  end if;

  if p_action not in ('activate','cancel','adjust_stop','adjust_target','set_exit_style') then
    raise exception 'plan_action_unknown' using errcode = '22023';
  end if;

  -- closed / cancelled / invalidated are terminal for every action
  if v_plan.status in ('closed','cancelled','invalidated') then
    raise exception 'plan_state_invalid' using errcode = '22023';
  end if;

  v_entry := coalesce(
    nullif(v_plan.entry_condition ->> 'level', '')::numeric,
    (select avg_cost from positions
      where origin_plan_id = v_plan.id and closed_at is null limit 1));

  select * into v_position from positions
   where origin_plan_id = v_plan.id and closed_at is null
   order by opened_at desc limit 1;

  -------------------------------------------------------------- activate
  if p_action = 'activate' then
    if v_plan.status = 'planned' then
      return v_plan;                                  -- idempotent
    end if;
    if v_plan.status <> 'draft' then
      raise exception 'plan_state_invalid' using errcode = '22023';
    end if;
    update trade_plans set status = 'planned' where id = v_plan.id returning * into v_plan;
    v_type := 'activated';

  ---------------------------------------------------------------- cancel
  elsif p_action = 'cancel' then
    if v_plan.status not in ('draft','planned') then
      raise exception 'plan_state_invalid' using errcode = '22023';
    end if;
    update trade_plans set status = 'cancelled' where id = v_plan.id returning * into v_plan;

    -- any order still working for this plan goes with it
    for v_order in
      select * from orders
       where plan_id = v_plan.id
         and status in ('draft','previewed','submitted','accepted')
       for update
    loop
      update orders
         set status = 'cancelled',
             exec_meta = exec_meta || jsonb_build_object('resting', false,
                                                         'cancel_reason', 'plan_cancelled')
       where id = v_order.id;
      insert into order_events (order_id, from_status, to_status, payload)
      values (v_order.id, v_order.status, 'cancelled',
              jsonb_build_object('event', 'order_cancelled', 'reason', 'plan_cancelled',
                                 'plan_id', v_plan.id));
      perform append_user_event(
        p_user_id, 'order_status', 'order', v_order.id,
        jsonb_build_object('status', 'cancelled', 'reason', 'plan_cancelled',
                           'symbol', v_order.symbol, 'leg', v_order.leg));
      v_touched := v_touched || v_order.id;
    end loop;
    v_type := 'cancelled';

  ----------------------------------------------------------- adjust_stop
  elsif p_action = 'adjust_stop' then
    v_stop := nullif(v_payload ->> 'stop', '')::numeric;
    if v_stop is null then
      raise exception 'plan_stop_required' using errcode = '22023';
    end if;
    if v_entry is not null then
      if v_plan.intent = 'buy_to_open' and not (v_stop < v_entry) then
        raise exception 'plan_orientation_invalid' using errcode = '22023';
      end if;
      if v_plan.intent = 'sell_short' and not (v_stop > v_entry) then
        raise exception 'plan_orientation_invalid' using errcode = '22023';
      end if;
    end if;

    update trade_plans
       set stop = v_stop,
           invalidation = coalesce(invalidation, '{}'::jsonb)
                          || jsonb_build_object('level', v_stop)
     where id = v_plan.id
    returning * into v_plan;

    if v_position.id is not null then
      update positions set stop = v_stop where id = v_position.id;
    end if;

    for v_order in
      select * from orders
       where plan_id = v_plan.id and leg = 'stop'
         and status in ('submitted','accepted','partially_filled')
       for update
    loop
      update orders
         set stop_price = v_stop,
             exec_meta  = exec_meta || jsonb_build_object('level', v_stop)
       where id = v_order.id;
      insert into order_events (order_id, from_status, to_status, payload)
      values (v_order.id, v_order.status, v_order.status,
              jsonb_build_object('event', 'leg_adjusted', 'leg', 'stop', 'level', v_stop));
      perform append_user_event(
        p_user_id, 'order_status', 'order', v_order.id,
        jsonb_build_object('status', v_order.status, 'event', 'leg_adjusted',
                           'leg', 'stop', 'level', v_stop, 'symbol', v_order.symbol));
      v_touched := v_touched || v_order.id;
    end loop;
    v_type := 'stop_adjusted';

  --------------------------------------------------------- adjust_target
  elsif p_action = 'adjust_target' then
    if v_payload ? 'targets' then
      v_targets := paper_normalize_targets(v_payload -> 'targets');
    elsif nullif(v_payload ->> 'target', '') is not null then
      v_targets := paper_normalize_targets(
        jsonb_build_array((v_payload ->> 'target')::numeric));
    else
      raise exception 'plan_target_orientation_invalid' using errcode = '22023';
    end if;

    v_levels := paper_target_levels(v_targets);
    if array_length(v_levels, 1) is null then
      raise exception 'plan_target_orientation_invalid' using errcode = '22023';
    end if;
    if v_entry is not null then
      foreach v_lvl in array v_levels loop
        if v_plan.intent = 'buy_to_open' and not (v_lvl > v_entry) then
          raise exception 'plan_target_orientation_invalid' using errcode = '22023';
        end if;
        if v_plan.intent = 'sell_short' and not (v_lvl < v_entry) then
          raise exception 'plan_target_orientation_invalid' using errcode = '22023';
        end if;
      end loop;
    end if;

    update trade_plans set targets = v_targets where id = v_plan.id returning * into v_plan;

    if v_position.id is not null then
      update positions set target = v_levels[1] where id = v_position.id;
    end if;

    for v_order in
      select * from orders
       where plan_id = v_plan.id and leg = 'target'
         and status in ('submitted','accepted','partially_filled')
       for update
    loop
      update orders
         set limit_price = v_levels[1],
             exec_meta   = exec_meta || jsonb_build_object('level', v_levels[1])
       where id = v_order.id;
      insert into order_events (order_id, from_status, to_status, payload)
      values (v_order.id, v_order.status, v_order.status,
              jsonb_build_object('event', 'leg_adjusted', 'leg', 'target', 'level', v_levels[1]));
      perform append_user_event(
        p_user_id, 'order_status', 'order', v_order.id,
        jsonb_build_object('status', v_order.status, 'event', 'leg_adjusted',
                           'leg', 'target', 'level', v_levels[1], 'symbol', v_order.symbol));
      v_touched := v_touched || v_order.id;
    end loop;
    v_type := 'target_adjusted';

  -------------------------------------------------------- set_exit_style
  else
    v_style := nullif(v_payload ->> 'exit_style', '');
    if v_style is null or v_style not in ('auto','alert_assisted') then
      raise exception 'exit_style_invalid' using errcode = '22023';
    end if;
    update trade_plans set exit_style = v_style where id = v_plan.id returning * into v_plan;

    for v_order in
      select * from orders
       where plan_id = v_plan.id and leg in ('stop','target')
         and status in ('submitted','accepted','partially_filled')
       for update
    loop
      update orders set exec_meta = exec_meta || jsonb_build_object('exit_style', v_style)
       where id = v_order.id;
      v_touched := v_touched || v_order.id;
    end loop;
    v_type := 'exit_style_set';
  end if;

  ------------------------------------------------------------------ events
  select coalesce(max(seq), 0) + 1 into v_seq from plan_events where plan_id = v_plan.id;
  insert into plan_events (plan_id, user_id, seq, type, payload)
  values (v_plan.id, p_user_id, v_seq, v_type,
          v_payload || jsonb_build_object('status', v_plan.status,
                                          'orders_touched', to_jsonb(v_touched)));

  perform append_user_event(
    p_user_id, 'plan_event', 'trade_plan', v_plan.id,
    jsonb_build_object('event', v_type, 'status', v_plan.status,
                       'symbol', v_plan.symbol,
                       'orders_touched', to_jsonb(v_touched)) || v_payload);

  return v_plan;
end;
$$;

revoke all on function plan_action(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function plan_action(uuid, uuid, text, jsonb) to service_role;

-- =====================================================================
-- 6. submit_paper_order
-- =====================================================================
create or replace function submit_paper_order(
  p_user_id uuid, p_order_id uuid, p_idempotency_key text, p_fill jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order    orders;
  v_other    orders;
  v_from     order_status;
  v_fill     jsonb := coalesce(p_fill, '{}'::jsonb);
  v_resting  boolean := coalesce((v_fill ->> 'resting')::boolean, false);
  v_partial  boolean := coalesce((v_fill ->> 'partial')::boolean, false);
  v_price    numeric := nullif(v_fill ->> 'fill_price', '')::numeric;
  v_qty      numeric := nullif(v_fill ->> 'fill_qty', '')::numeric;
  v_quote    jsonb := v_fill -> 'quote';
  v_bracket  jsonb := case when jsonb_typeof(v_fill -> 'bracket') = 'object'
                           then v_fill -> 'bracket' else null end;
  v_close_of uuid := nullif(v_fill ->> 'close_of_position_id', '')::uuid;
  v_result   jsonb;
  v_position jsonb;
  v_legs     jsonb := '[]'::jsonb;
  v_cancelled uuid[] := '{}';
begin
  ------------------------------------------------------------ idempotency
  if p_idempotency_key is not null then
    select * into v_other from orders
     where idempotency_key = p_idempotency_key and id <> p_order_id;
    if found then
      if v_other.user_id <> p_user_id then
        raise exception 'order_not_found' using errcode = '42501';
      end if;
      return jsonb_build_object('deduplicated', true,
                                'order', to_jsonb(v_other));
    end if;
  end if;

  select * into v_order from orders
   where id = p_order_id and user_id = p_user_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = '42501';
  end if;
  if v_order.driver <> 'paper' then
    raise exception 'order_not_paper' using errcode = '22023';
  end if;

  -- Already past the submit gate: the caller is replaying. Nothing is written.
  if v_order.status not in ('draft','previewed') then
    return jsonb_build_object('deduplicated', true, 'order', to_jsonb(v_order));
  end if;

  if p_idempotency_key is not null
     and v_order.idempotency_key is distinct from p_idempotency_key then
    update orders set idempotency_key = p_idempotency_key
     where id = v_order.id returning * into v_order;
  end if;

  ------------------------------------------------- previewed → submitted
  v_from := v_order.status;
  update orders
     set status       = 'submitted',
         submitted_at = now(),
         exec_meta    = exec_meta
                        || jsonb_build_object('driver', 'paper')
                        || case when v_quote is null then '{}'::jsonb
                                else jsonb_build_object('last_quote', v_quote) end
                        || case when v_close_of is null then '{}'::jsonb
                                else jsonb_build_object('close_of_position_id', v_close_of) end
   where id = v_order.id
  returning * into v_order;

  insert into order_events (order_id, from_status, to_status, payload)
  values (v_order.id, v_from, 'submitted',
          jsonb_build_object('event', 'submitted', 'quote', v_quote,
                             'idempotency_key', p_idempotency_key));
  perform append_user_event(
    p_user_id, 'order_status', 'order', v_order.id,
    jsonb_build_object('status', 'submitted', 'symbol', v_order.symbol,
                       'side', v_order.side, 'paper', true));

  -------------------------------------------------- submitted → accepted
  update orders
     set status      = 'accepted',
         accepted_at = now(),
         bracket_group = case when v_bracket is not null and bracket_group is null
                              then gen_random_uuid() else bracket_group end,
         leg         = case when v_bracket is not null then coalesce(leg, 'entry') else leg end,
         exec_meta   = exec_meta
                       || jsonb_build_object('resting', v_resting)
                       || case when v_bracket is null then '{}'::jsonb
                               else jsonb_build_object('bracket', v_bracket) end
   where id = v_order.id
  returning * into v_order;

  insert into order_events (order_id, from_status, to_status, payload)
  values (v_order.id, 'submitted', 'accepted',
          jsonb_build_object('event', 'accepted', 'resting', v_resting,
                             'bracket', v_bracket, 'quote', v_quote));
  perform append_user_event(
    p_user_id, 'order_status', 'order', v_order.id,
    jsonb_build_object('status', 'accepted', 'symbol', v_order.symbol,
                       'side', v_order.side, 'resting', v_resting, 'paper', true));

  ------------------------------------------ close flow: drop resting legs
  -- Documented contract: the API passes p_fill.close_of_position_id from
  -- close_position_prepare and the cancel lands in THIS transaction, BEFORE the
  -- closing fill — a manual exit removes the automatic protection first, so the
  -- two can never both act on the same shares.
  if v_close_of is not null then
    v_cancelled := paper_cancel_resting_legs(v_close_of, v_order.id, 'position_closed_by_user', null);
  end if;

  ---------------------------------------------------------------- fill
  if not v_resting then
    if v_price is null then
      raise exception 'fill_price_required' using errcode = '22023';
    end if;
    v_result := paper_apply_fill(
      v_order.id, v_price,
      case when v_partial then coalesce(v_qty, v_order.qty) else v_order.qty end,
      'submit', v_bracket, v_quote);

    select * into v_order from orders where id = p_order_id;
    v_position := v_result -> 'position';
    v_legs     := coalesce(v_result -> 'legs', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'deduplicated', false,
    'order',        (select to_jsonb(o) from orders o where o.id = p_order_id),
    'position',     v_position,
    'legs',         v_legs,
    'cancelled_legs', to_jsonb(v_cancelled),
    'closed_position', coalesce(v_result -> 'closed_position', 'false'::jsonb),
    'realized_pnl', coalesce(v_result -> 'realized_pnl', '0'::jsonb));
end;
$$;

revoke all on function submit_paper_order(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function submit_paper_order(uuid, uuid, text, jsonb) to service_role;

-- =====================================================================
-- 7. apply_paper_tick
-- =====================================================================
create or replace function apply_paper_tick(
  p_user_id uuid, p_symbol text, p_quote jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_symbol   text := upper(btrim(coalesce(p_symbol, '')));
  v_price    numeric := nullif(p_quote ->> 'price', '')::numeric;
  v_ts       timestamptz := coalesce(nullif(p_quote ->> 'source_ts', '')::timestamptz, now());
  v_order    orders;
  v_leg_ids  uuid[] := '{}';
  v_id       uuid;
  v_marked   jsonb := '[]'::jsonb;
  v_filled   jsonb := '[]'::jsonb;
  v_fired    jsonb := '[]'::jsonb;
  v_attn     jsonb := '[]'::jsonb;
  v_result   jsonb;
  v_level    numeric;
  v_crossed  boolean;
  v_fill_px  numeric;
  v_is_sell  boolean;
  v_style    text;
  v_position positions;
  v_pos      positions;
begin
  if v_price is null or v_price <= 0 then
    raise exception 'quote_price_required' using errcode = '22023';
  end if;

  -- Snapshot the legs that existed BEFORE this tick, so a bracket raised by an
  -- entry fill in step 1 cannot also fire in step 2 of the same tick.
  select coalesce(array_agg(o.id), '{}') into v_leg_ids
    from orders o
   where o.user_id = p_user_id and o.symbol = v_symbol
     and o.leg in ('stop','target')
     and o.status in ('submitted','accepted','partially_filled')
     and coalesce((o.exec_meta ->> 'resting')::boolean, true);

  ------------------------------------------- 1. resting entry limit orders
  for v_order in
    select * from orders o
     where o.user_id = p_user_id and o.symbol = v_symbol
       and o.type = 'limit'
       and coalesce(o.leg, 'entry') = 'entry'
       and o.status in ('accepted','partially_filled')
       and coalesce((o.exec_meta ->> 'resting')::boolean, true)
       and o.limit_price is not null
     for update
  loop
    v_crossed := case
      when paper_side_is_debit(v_order.side) then v_order.limit_price >= v_price
      else v_order.limit_price <= v_price end;

    if v_crossed then
      -- delayed-data paper model: the resting limit fills AT ITS LIMIT, never
      -- better; price improvement is not simulated (SCHEMA-NOTES 1.36).
      v_result := paper_apply_fill(
        v_order.id, v_order.limit_price,
        v_order.qty - coalesce(v_order.filled_qty, 0),
        'tick_limit_crossed', null, p_quote);
      v_filled := v_filled || jsonb_build_array(to_jsonb(v_order.id));
    end if;
  end loop;

  ------------------------------------------------- 2. stop / target legs
  foreach v_id in array v_leg_ids loop
    select * into v_order from orders where id = v_id for update;
    continue when v_order.status not in ('submitted','accepted','partially_filled');

    v_is_sell := not paper_side_is_debit(v_order.side);
    v_level   := case when v_order.leg = 'stop' then v_order.stop_price
                      else v_order.limit_price end;
    continue when v_level is null;

    if v_order.leg = 'stop' then
      -- long stop = a sell below the market; short stop = a buy above it
      v_crossed := case when v_is_sell then v_price <= v_level else v_price >= v_level end;
      -- protective: a gap through the level fills at the worse tick price
      v_fill_px := case when v_is_sell then least(v_level, v_price)
                                       else greatest(v_level, v_price) end;
    else
      v_crossed := case when v_is_sell then v_price >= v_level else v_price <= v_level end;
      -- target: a gap through the level fills at the better tick price
      v_fill_px := case when v_is_sell then greatest(v_level, v_price)
                                       else least(v_level, v_price) end;
    end if;

    continue when not v_crossed;

    v_style := coalesce(v_order.exec_meta ->> 'exit_style', 'auto');

    select * into v_position from positions
     where account_id = v_order.account_id and symbol = v_order.symbol
       and coalesce(occ_symbol, '') = coalesce(v_order.occ_symbol, '')
       and direction = paper_side_direction(v_order.side)
       and closed_at is null;

    if v_style = 'alert_assisted' then
      -- hands-on: the exit is a NOTIFICATION, not automatic protection.
      if coalesce((v_order.exec_meta ->> 'triggered')::boolean, false) then
        continue;                                     -- already flagged
      end if;
      update orders
         set exec_meta = exec_meta || jsonb_build_object(
               'triggered', true, 'triggered_at', now(),
               'trigger_price', v_price, 'level', v_level, 'last_quote', p_quote)
       where id = v_order.id;

      insert into order_events (order_id, from_status, to_status, payload)
      values (v_order.id, v_order.status, v_order.status,
              jsonb_build_object('event', 'leg_triggered', 'leg', v_order.leg,
                                 'level', v_level, 'price', v_price,
                                 'exit_style', v_style, 'quote', p_quote));
      perform append_user_event(
        p_user_id, 'order_status', 'order', v_order.id,
        jsonb_build_object('status', v_order.status, 'event', 'leg_triggered',
                           'leg', v_order.leg, 'level', v_level, 'price', v_price,
                           'symbol', v_order.symbol, 'exit_style', v_style,
                           'needs_attention', true, 'paper', true));

      v_attn := v_attn || jsonb_build_array(jsonb_build_object(
        'order_id', v_order.id, 'leg', v_order.leg, 'level', v_level,
        'price', v_price, 'symbol', v_order.symbol,
        'position_id', v_position.id, 'exit_style', v_style));
    else
      -- guided: auto-execute the leg
      if v_position.id is null then
        -- nothing left to protect (position closed elsewhere) → cancel the leg
        update orders
           set status = 'cancelled',
               exec_meta = exec_meta || jsonb_build_object('resting', false,
                                                           'cancel_reason', 'no_open_position')
         where id = v_order.id;
        insert into order_events (order_id, from_status, to_status, payload)
        values (v_order.id, v_order.status, 'cancelled',
                jsonb_build_object('event', 'leg_cancelled', 'reason', 'no_open_position',
                                   'leg', v_order.leg));
        continue;
      end if;

      -- the leg can never close more than the position still holds
      if v_order.qty <> v_position.qty then
        update orders set qty = v_position.qty where id = v_order.id;
      end if;

      v_result := paper_apply_fill(
        v_order.id, v_fill_px, v_position.qty, 'tick_' || v_order.leg, null, p_quote);

      -- OCO: the sibling leg dies with the fired one
      perform paper_cancel_resting_legs(
        v_position.id, v_order.id, 'oco_sibling_' || v_order.leg, v_order.bracket_group);

      v_fired := v_fired || jsonb_build_array(jsonb_build_object(
        'order_id', v_order.id, 'leg', v_order.leg, 'price', v_fill_px,
        'level', v_level, 'position_id', v_position.id,
        'realized_pnl', v_result -> 'realized_pnl',
        'closed_position', v_result -> 'closed_position'));
    end if;
  end loop;

  --------------------------------------------------------- 3. mark to market
  for v_pos in
    select * from positions
     where user_id = p_user_id and symbol = v_symbol and closed_at is null
     for update
  loop
    update positions
       set mark_price     = v_price,
           mark_ts        = v_ts,
           unrealized_pnl = round(
             case v_pos.direction
               when 'long' then (v_price - v_pos.avg_cost) * v_pos.qty
               else             (v_pos.avg_cost - v_price) * v_pos.qty
             end, 6)
     where id = v_pos.id;
    v_marked := v_marked || jsonb_build_array(to_jsonb(v_pos.id));

    perform paper_recompute_account(v_pos.account_id, 0);
  end loop;

  return jsonb_build_object(
    'symbol',          v_symbol,
    'price',           v_price,
    'freshness',       p_quote ->> 'freshness',
    'marked',          v_marked,
    'filled',          v_filled,
    'fired',           v_fired,
    'needs_attention', v_attn);
end;
$$;

revoke all on function apply_paper_tick(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function apply_paper_tick(uuid, text, jsonb) to service_role;

-- =====================================================================
-- 8. close_position_prepare
-- =====================================================================
create or replace function close_position_prepare(p_user_id uuid, p_position_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_position positions;
  v_legs     jsonb;
begin
  select * into v_position from positions
   where id = p_position_id and user_id = p_user_id;
  if not found then
    raise exception 'position_not_found' using errcode = '42501';
  end if;
  if v_position.closed_at is not null then
    raise exception 'position_already_closed' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', o.id, 'leg', o.leg, 'type', o.type, 'status', o.status,
           'limit_price', o.limit_price, 'stop_price', o.stop_price)), '[]'::jsonb)
    into v_legs
    from orders o
   where o.account_id = v_position.account_id
     and o.symbol = v_position.symbol
     and coalesce(o.occ_symbol, '') = coalesce(v_position.occ_symbol, '')
     and o.leg in ('stop','target')
     and o.side = paper_close_side(v_position.direction)
     and o.status in ('submitted','accepted','partially_filled');

  return jsonb_build_object(
    'position_id',          v_position.id,
    'account_id',           v_position.account_id,
    'plan_id',              v_position.origin_plan_id,
    'mode',                 v_position.mode,
    'symbol',               v_position.symbol,
    'occ_symbol',           v_position.occ_symbol,
    'instrument_kind',      v_position.instrument_kind,
    'direction',            v_position.direction,
    'side',                 paper_close_side(v_position.direction),
    'qty',                  v_position.qty,
    'avg_cost',             v_position.avg_cost,
    'mark_price',           v_position.mark_price,
    'mark_ts',              v_position.mark_ts,
    'unrealized_pnl',       v_position.unrealized_pnl,
    'stop',                 v_position.stop,
    'target',               v_position.target,
    'resting_legs',         v_legs,
    'close_of_position_id', v_position.id);
end;
$$;

revoke all on function close_position_prepare(uuid, uuid) from public, anon, authenticated;
grant execute on function close_position_prepare(uuid, uuid) to service_role;

-- =====================================================================
-- 9. daily_risk_v
-- =====================================================================
-- security_invoker: `positions` and `risk_policies` are owner-select under RLS,
-- so a client JWT gets exactly its own row without the view needing its own
-- auth.uid() predicate. service_role (BYPASSRLS) sees every user.
drop view if exists daily_risk_v;
create view daily_risk_v with (security_invoker = true) as
select
  rp.user_id,
  (now() at time zone 'America/New_York')::date            as day,
  coalesce(rl.realized_loss, 0)::numeric                   as realized_loss,
  coalesce(orisk.open_risk, 0)::numeric                    as open_risk,
  (coalesce(rl.realized_loss, 0) + coalesce(orisk.open_risk, 0))::numeric as used,
  rp.daily_loss_cap_usd                                    as cap
from risk_policies rp
left join lateral (
  select sum(greatest(0, -coalesce(p.realized_pnl, 0))) as realized_loss
    from positions p
   where p.user_id = rp.user_id
     and p.closed_at is not null
     and (p.closed_at at time zone 'America/New_York')::date
         = (now() at time zone 'America/New_York')::date
) rl on true
left join lateral (
  select sum(p.qty * abs(p.avg_cost - p.stop)) as open_risk
    from positions p
   where p.user_id = rp.user_id
     and p.closed_at is null
     and p.stop is not null
     and (p.opened_at at time zone 'America/New_York')::date
         = (now() at time zone 'America/New_York')::date
) orisk on true;

revoke all on daily_risk_v from anon;
grant select on daily_risk_v to authenticated, service_role;

-- =====================================================================
-- 10. FUNCTION GRANT FLOOR (SCHEMA-NOTES gap 2.7)
-- =====================================================================
-- Postgres + Supabase default privileges hand EXECUTE on every function created
-- above to PUBLIC/anon/authenticated. Re-apply 0018's floor across the whole
-- schema, then grant back only the three genuinely client-callable functions.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

grant execute on function is_room_member(uuid) to authenticated;
grant execute on function join_core_room(uuid, uuid) to authenticated;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated;
