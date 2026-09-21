-- =====================================================================
-- 0049 — A Day Trade card lives until its option expires
-- =====================================================================
-- DATA ONLY. No schema change. Written, NOT applied — the owner applies it.
--
-- On 2026-09-21 the options-flow engine widened from 0-2 day expiries to 0-7.
-- The ingest (apps/api/src/lib/uoa/ingest.ts) used to set `valid_until` to the
-- close of the session the alert fired in; it now sets it to 16:00 New York on
-- the day the card's lead contract expires (`validUntilFor`). This brings the
-- rows already written into line with that rule, and repairs the one way the
-- old rule went wrong in production:
--
--   NET, fired 2026-09-09 on a contract expiring 2026-09-11. The tracker ended
--   it with a plain 'expired' at the first closing bell (because `valid_until`
--   had passed), which then stopped the contract lane from ever recording
--   'contract_expired'. And nothing flipped `state` out of 'ready', so the card
--   was still on the Day Trade Active board twelve days later.
--
-- The API change already hides such rows from the Active list by reading the
-- clock (`uoaDayTradeSetups`), so this migration is housekeeping for the
-- stored values — the board is right with or without it.
--
-- Safe to run more than once.

begin;

-- 1. Live day-trade rows that named a contract: live until that contract's
--    expiry-day close in New York (20:00Z in daylight time, 21:00Z in winter).
update setups
   set valid_until = ((contract_expiry::timestamp + time '16:00') at time zone 'America/New_York')
 where quote_snapshot->>'origin' = 'uw_uoa_daytrade'
   and state = 'ready'
   and contract_expiry is not null
   and coalesce((quote_snapshot->>'is_replay')::boolean, false) = false;

-- 2. Any of them whose option has now expired is a record, not a live card.
update setups
   set state = 'expired'
 where quote_snapshot->>'origin' = 'uw_uoa_daytrade'
   and state = 'ready'
   and valid_until <= now();

-- 3. A plain clock ending on a row whose contract WAS graded is really the
--    contract expiring — the only ending this family has.
update setups
   set resolution_kind = 'contract_expired'
 where quote_snapshot->>'origin' = 'uw_uoa_daytrade'
   and resolution_kind = 'expired'
   and contract_graded_at is not null;

commit;
