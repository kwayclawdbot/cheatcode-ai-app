\set ON_ERROR_STOP on
\timing off
begin;

-- ------------------------------------------------------------------ user
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'smoke@example.com', 'x', now(), now(), now(),
        '{"provider":"email"}', '{"display_name":"Smoke"}');

\set uid '''11111111-1111-1111-1111-111111111111'''

select 'account provisioned' as step, id, cash, buying_power, equity
  from accounts where user_id = :uid \gset acct_

-- ================================================================== LONG
select '--- LONG PATH ---' as banner;

select id as plan_id from create_plan(:uid, jsonb_build_object(
  'mode','day_trade','symbol','meta','intent','buy_to_open',
  'entry',100,'stop',95,'targets', jsonb_build_array(110),
  'size', jsonb_build_object('qty',10),
  'exit_style','auto')) \gset

select 'plan created' as step, status, symbol, intent, stop, targets
  from trade_plans where id = :'plan_id';

select 'plan activated' as step, status
  from plan_action(:uid, :'plan_id', 'activate', '{}'::jsonb);

-- the API creates the previewed order row
insert into orders (user_id, account_id, plan_id, symbol, side, type, qty,
                    status, idempotency_key, driver, preview)
values (:uid, :'acct_id', :'plan_id', 'META', 'buy_to_open', 'market', 10,
        'previewed', 'smoke-long-1', 'paper',
        '{"est_fill":100.05,"fees":0,"expires_at":"2026-01-01T00:00:00Z"}')
returning id as order_id \gset

select jsonb_pretty(jsonb_build_object(
  'deduplicated', r -> 'deduplicated',
  'order_status', r -> 'order' ->> 'status',
  'filled_qty',   r -> 'order' ->> 'filled_qty',
  'avg_fill',     r -> 'order' ->> 'avg_fill_price',
  'position_qty', r -> 'position' ->> 'qty',
  'position_avg', r -> 'position' ->> 'avg_cost',
  'legs',         jsonb_array_length(r -> 'legs'))) as submit_result
from submit_paper_order(:uid, :'order_id', 'smoke-long-1', jsonb_build_object(
  'fill_price', 100.05, 'fill_qty', 10, 'partial', false, 'resting', false,
  'quote', jsonb_build_object('price',100.04,'freshness','delayed'),
  'bracket', jsonb_build_object('stop',95,'target',110,'exit_style','auto'))) r;

select 'order events' as step, from_status, to_status, payload ->> 'event' as event
  from order_events where order_id = :'order_id' order by id;

select 'legs' as step, leg, side, type, qty, stop_price, limit_price, status,
       exec_meta ->> 'exit_style' as exit_style, exec_meta ->> 'resting' as resting
  from orders where parent_order_id = :'order_id' order by leg;

select 'position after entry' as step, direction, qty, avg_cost, stop, target, status
  from positions where user_id = :uid;

select 'account after entry' as step, cash, buying_power, equity
  from accounts where id = :'acct_id';

-- idempotent resubmit
select 'resubmit dedup' as step, r ->> 'deduplicated' as deduplicated,
       r -> 'order' ->> 'status' as order_status
from submit_paper_order(:uid, :'order_id', 'smoke-long-1',
     jsonb_build_object('fill_price',100.05,'fill_qty',10)) r;

select 'fills count (must stay 1)' as step, count(*) from fills where order_id = :'order_id';

-- tick that hits the target
select jsonb_pretty(r) as tick_result
from apply_paper_tick(:uid, 'META', jsonb_build_object(
  'price', 110.50, 'source_ts', now(), 'received_ts', now(), 'freshness','delayed')) r;

select 'position after target' as step, direction, qty, avg_cost, realized_pnl,
       unrealized_pnl, status, closed_at is not null as closed
  from positions where user_id = :uid;

select 'legs after target' as step, leg, status, exec_meta ->> 'cancel_reason' as cancel_reason
  from orders where parent_order_id = :'order_id' order by leg;

select 'plan after target' as step, status from trade_plans where id = :'plan_id';

select 'account after target' as step, cash, buying_power, equity
  from accounts where id = :'acct_id';

select 'expected realized pnl' as step, round((110.50 - 100.05) * 10, 2) as expected;

-- ================================================================= SHORT
select '--- SHORT PATH ---' as banner;

select id as splan_id from create_plan(:uid, jsonb_build_object(
  'mode','day_trade','symbol','TSLA','intent','sell_short',
  'entry',200,'stop',210,'targets', jsonb_build_array(180),
  'exit_style','auto')) \gset

insert into orders (user_id, account_id, plan_id, symbol, side, type, qty,
                    status, idempotency_key, driver)
values (:uid, :'acct_id', :'splan_id', 'TSLA', 'sell_short', 'market', 5,
        'previewed', 'smoke-short-1', 'paper')
returning id as sorder_id \gset

select 'short submit' as step, r -> 'position' ->> 'direction' as direction,
       r -> 'position' ->> 'qty' as qty, r -> 'position' ->> 'avg_cost' as avg_cost,
       jsonb_array_length(r -> 'legs') as legs
from submit_paper_order(:uid, :'sorder_id', 'smoke-short-1', jsonb_build_object(
  'fill_price', 200.00, 'fill_qty', 5, 'resting', false,
  'quote', jsonb_build_object('price',200.00,'freshness','delayed'),
  'bracket', jsonb_build_object('stop',210,'target',180,'exit_style','auto'))) r;

select 'account after short entry (proceeds credited)' as step, cash, equity
  from accounts where id = :'acct_id';

select 'short mark tick' as step, r -> 'marked' as marked
from apply_paper_tick(:uid, 'TSLA', jsonb_build_object('price',195,'freshness','delayed')) r;

select 'short position marked' as step, qty, mark_price, unrealized_pnl
  from positions where user_id = :uid and symbol = 'TSLA';

select 'daily_risk_v mid-trade' as step, day, realized_loss, open_risk, used, cap
  from daily_risk_v where user_id = :uid;

select jsonb_pretty(r) as short_target_tick
from apply_paper_tick(:uid, 'TSLA', jsonb_build_object('price',179,'freshness','delayed')) r;

select 'short position after target' as step, qty, realized_pnl, status
  from positions where user_id = :uid and symbol = 'TSLA';
select 'expected short realized pnl' as step, round((200 - 179) * 5, 2) as expected;

select 'short legs' as step, leg, status, exec_meta ->> 'cancel_reason' as cancel_reason
  from orders where parent_order_id = :'sorder_id' order by leg;

-- =============================================== RESTING LIMIT + ALERT_ASSISTED
select '--- RESTING LIMIT + alert_assisted ---' as banner;

select id as rplan_id from create_plan(:uid, jsonb_build_object(
  'mode','swing','symbol','NVDA','intent','buy_to_open',
  'entry',50,'stop',45,'targets', jsonb_build_array(60),
  'exit_style','alert_assisted')) \gset

insert into orders (user_id, account_id, plan_id, symbol, side, type, qty,
                    limit_price, status, idempotency_key, driver)
values (:uid, :'acct_id', :'rplan_id', 'NVDA', 'buy_to_open', 'limit', 4, 50,
        'previewed', 'smoke-rest-1', 'paper')
returning id as rorder_id \gset

select 'resting submit' as step, r -> 'order' ->> 'status' as status,
       r -> 'order' ->> 'filled_qty' as filled_qty,
       r -> 'order' -> 'exec_meta' ->> 'resting' as resting,
       r -> 'position' as position
from submit_paper_order(:uid, :'rorder_id', 'smoke-rest-1', jsonb_build_object(
  'resting', true,
  'quote', jsonb_build_object('price',52,'freshness','delayed'),
  'bracket', jsonb_build_object('stop',45,'target',60,'exit_style','alert_assisted'))) r;

select 'no position yet (accepted != filled)' as step, count(*)
  from positions where user_id = :uid and symbol = 'NVDA';

select 'tick above limit -> no fill' as step, r -> 'filled' as filled
from apply_paper_tick(:uid, 'NVDA', jsonb_build_object('price',52,'freshness','delayed')) r;

select 'tick crosses limit -> fills' as step, r -> 'filled' as filled
from apply_paper_tick(:uid, 'NVDA', jsonb_build_object('price',49.5,'freshness','delayed')) r;

select 'nvda position' as step, qty, avg_cost, stop, target, status
  from positions where user_id = :uid and symbol = 'NVDA';
select 'nvda legs' as step, leg, status, exec_meta ->> 'exit_style' as exit_style
  from orders where parent_order_id = :'rorder_id' order by leg;

select jsonb_pretty(r) as alert_assisted_stop_tick
from apply_paper_tick(:uid, 'NVDA', jsonb_build_object('price',44,'freshness','delayed')) r;

select 'nvda position still open (alert_assisted does NOT auto-exit)' as step,
       qty, status from positions where user_id = :uid and symbol = 'NVDA';
select 'nvda stop leg' as step, status, exec_meta ->> 'triggered' as triggered,
       exec_meta ->> 'trigger_price' as trigger_price
  from orders where parent_order_id = :'rorder_id' and leg = 'stop';

-- ============================================================ CLOSE FLOW
select '--- close_position_prepare + close ---' as banner;

select id as nvda_pos from positions where user_id = :uid and symbol = 'NVDA' and closed_at is null \gset

select jsonb_pretty(close_position_prepare(:uid, :'nvda_pos')) as close_prepare;

insert into orders (user_id, account_id, symbol, side, type, qty, status,
                    idempotency_key, driver)
values (:uid, :'acct_id', 'NVDA', 'sell_to_close', 'market', 4, 'previewed',
        'smoke-close-1', 'paper')
returning id as corder_id \gset

select 'close submit' as step, r -> 'position' ->> 'status' as position_status,
       r -> 'position' ->> 'realized_pnl' as realized_pnl,
       r -> 'cancelled_legs' as cancelled_legs
from submit_paper_order(:uid, :'corder_id', 'smoke-close-1', jsonb_build_object(
  'fill_price', 44.20, 'fill_qty', 4, 'resting', false,
  'close_of_position_id', :'nvda_pos',
  'quote', jsonb_build_object('price',44.20,'freshness','delayed'))) r;

select 'nvda legs after close' as step, leg, status,
       exec_meta ->> 'cancel_reason' as cancel_reason
  from orders where parent_order_id = :'rorder_id' order by leg;

-- =============================================== plan_action adjust + risk view
select '--- plan_action adjust_* ---' as banner;

select id as aplan_id from create_plan(:uid, jsonb_build_object(
  'mode','day_trade','symbol','AAPL','intent','buy_to_open',
  'entry',10,'stop',9,'targets', jsonb_build_array(12))) \gset

insert into orders (user_id, account_id, plan_id, symbol, side, type, qty,
                    status, idempotency_key, driver)
values (:uid, :'acct_id', :'aplan_id', 'AAPL', 'buy_to_open', 'market', 100,
        'previewed', 'smoke-aapl-1', 'paper')
returning id as aorder_id \gset

select 'aapl entry' as step, r -> 'position' ->> 'qty' as qty
from submit_paper_order(:uid, :'aorder_id', 'smoke-aapl-1', jsonb_build_object(
  'fill_price', 10, 'fill_qty', 100, 'resting', false,
  'bracket', jsonb_build_object('stop',9,'target',12,'exit_style','auto'))) r;

select 'adjust_stop' as step, stop from plan_action(:uid, :'aplan_id', 'adjust_stop',
  jsonb_build_object('stop', 9.5));
select 'stop leg reprice' as step, stop_price from orders
  where parent_order_id = :'aorder_id' and leg = 'stop';
select 'position stop' as step, stop from positions where user_id = :uid and symbol = 'AAPL';

select 'adjust_target' as step, targets from plan_action(:uid, :'aplan_id', 'adjust_target',
  jsonb_build_object('targets', jsonb_build_array(13)));
select 'target leg reprice' as step, limit_price from orders
  where parent_order_id = :'aorder_id' and leg = 'target';

select 'bad orientation is refused' as step;
do $$
begin
  perform plan_action('11111111-1111-1111-1111-111111111111'::uuid,
    (select id from trade_plans where symbol = 'AAPL' limit 1),
    'adjust_stop', jsonb_build_object('stop', 99));
  raise exception 'SMOKE FAIL: bad stop orientation was accepted';
exception when sqlstate '22023' then
  raise notice 'OK  adjust_stop above entry refused (plan_orientation_invalid)';
end $$;

do $$
begin
  perform create_plan('11111111-1111-1111-1111-111111111111'::uuid, jsonb_build_object(
    'mode','day_trade','symbol','X','intent','buy_to_open','entry',10,'stop',11,
    'targets', jsonb_build_array(12)));
  raise exception 'SMOKE FAIL: inverted long plan was accepted';
exception when sqlstate '22023' then
  raise notice 'OK  long plan with stop above entry refused';
end $$;

do $$
begin
  perform create_plan('11111111-1111-1111-1111-111111111111'::uuid, jsonb_build_object(
    'mode','day_trade','symbol','X','intent','sell_short','entry',10,'stop',9,
    'targets', jsonb_build_array(8)));
  raise exception 'SMOKE FAIL: inverted short plan was accepted';
exception when sqlstate '22023' then
  raise notice 'OK  short plan with stop below entry refused';
end $$;


-- ========================================================= PARTIAL FILL
select '--- PARTIAL FILL ---' as banner;

select id as pplan_id from create_plan(:uid, jsonb_build_object(
  'mode','day_trade','symbol','AMD','intent','buy_to_open',
  'entry',20,'stop',18,'targets', jsonb_build_array(25))) \gset

insert into orders (user_id, account_id, plan_id, symbol, side, type, qty,
                    status, idempotency_key, driver)
values (:uid, :'acct_id', :'pplan_id', 'AMD', 'buy_to_open', 'market', 50,
        'previewed', 'smoke-amd-1', 'paper')
returning id as porder_id \gset

select 'partial submit' as step, r -> 'order' ->> 'status' as status,
       r -> 'order' ->> 'filled_qty' as filled_qty,
       r -> 'position' ->> 'qty' as position_qty
from submit_paper_order(:uid, :'porder_id', 'smoke-amd-1', jsonb_build_object(
  'fill_price', 20.02, 'fill_qty', 20, 'partial', true, 'resting', false)) r;

select 'partial order' as step, status, qty, filled_qty, avg_fill_price
  from orders where id = :'porder_id';

select '--- daily_risk_v ---' as banner;
select user_id, day, realized_loss, open_risk, used, cap from daily_risk_v where user_id = :uid;

select '--- user_events outbox ---' as banner;
select seq, event_type, entity_type, payload ->> 'event' as event,
       payload ->> 'status' as status
  from user_events where user_id = :uid order by seq;

rollback;
