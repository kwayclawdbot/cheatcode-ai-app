-- =====================================================================
-- 0048 — A day-trade contract is graded on minute bars AFTER the alert
-- =====================================================================
-- The contract grader (apps/api/src/lib/tracking/peaks.ts) moved from
-- Polygon option DAILY bars to Unusual Whales one-minute bars, keeping only
-- the minutes that start at or after the alert's fire time. A daily high
-- cannot say whether it printed before or after the alert: NET on 2026-09-09
-- was graded 2.05x on an $8.80 print from 9:40 AM, eighteen minutes BEFORE
-- the alert fired at $4.30; its best price after the alert was $4.75.
--
-- `contract_basis` records which kind of evidence set the grade, so it gains
-- a third value, 'minute'. The old values stay legal: rows graded before this
-- keep saying 'daily_bar' until the regrade script rewrites them.
--
-- MUST BE APPLIED BEFORE the API that writes 'minute' is deployed, or every
-- grade write fails the check and the contract lane logs
-- peaks.contract_grade_failed each pass.

alter table setups drop constraint if exists setups_contract_basis_check;
alter table setups add constraint setups_contract_basis_check
  check (contract_basis is null or contract_basis in ('session', 'daily_bar', 'minute'));

comment on column setups.contract_basis is
  'What set contract_peak: ''minute'' = Unusual Whales one-minute bars from the '
  'alert''s fire time to expiry (current); ''daily_bar'' = Polygon daily bars '
  'from the alert''s date, which can include prices from before the alert (legacy).';
comment on column setups.contract_peak is
  'Highest price the named contract itself reached AFTER the alert fired and '
  'before it expired. An option''s own price, not the underlying''s.';
comment on column setups.contract_expiry_value is
  'What the contract was worth at expiry: its last trade on the expiry session, '
  'or, if it did not trade that day, its intrinsic value from the underlying''s '
  'close. Null until graded, and null when neither is known — absent, not zero.';
