-- 0028 — the alert floor defaults to C, not B.
--
-- 0008 set `setup_alert_prefs.min_grade default 'B'`, and 0013 creates the row
-- at signup with nothing but the user id, so every account this product has
-- ever had inherited that floor. SWING-1 measured band C at 46% of every pick
-- the scanner ships. Nearly half of the product was therefore invisible to
-- everybody, behind a preference that no person had ever chosen — on 2026-08-31
-- and 2026-09-01 it was 2 of the 3 morning picks.
--
-- The floor was defensible only if the letter predicted the outcome. It does
-- not: the medallion is a trailing-180-day PERCENTILE of `breakout_score`, and
-- ENGINE-9 measured that score as no better than a coin toss at ranking what a
-- pick went on to do. So the band says how CLEAN a setup looked to the scanner,
-- which is worth showing, and not how likely it is to work, which is what a
-- default floor implies it means. Hiding half the feed behind a number that
-- does not forecast makes the app look emptier than the product is.
--
-- `min_grade` stays in the schema and stays a real floor. A person who wants
-- only A and B picks can still say so. What changes is the answer the product
-- gives when nobody has said anything.
alter table setup_alert_prefs alter column min_grade set default 'C';

-- Existing rows. The rule is that a preference somebody ACTUALLY CHOSE is never
-- silently rewritten, so this updates only rows still holding 0008's defaults in
-- EVERY column — which is what "untouched" means as a property of the row
-- rather than of its timestamps.
--
-- `updated_at` is deliberately NOT the test. One production row has a non-null
-- `updated_at` because `swing-publish-proof.ts` borrows a prefs row, exercises
-- the gate and writes the original values back; that is a proof restoring what
-- it found, not a person expressing a preference, and excluding it on the
-- timestamp would leave a real account behind for no reason.
--
-- The stronger fact behind both: THERE IS NO SURFACE IN THIS APP FOR SETTING
-- THIS. No screen and no route writes `setup_alert_prefs` — grep it — so as of
-- this migration no row can be a human choice. The shape test below is the belt
-- for the day that stops being true, and it is written so that a row differing
-- in even one unrelated column (a symbol exclusion, a narrowed mode list) is
-- left completely alone.
update setup_alert_prefs
   set min_grade = 'C',
       updated_at = now()
 where min_grade = 'B'
   and enabled is true
   and modes = '{day_trade,swing}'::app_mode[]
   and intents = '{buy_to_open,sell_short}'::position_effect[]
   and symbols_include is null
   and symbols_exclude is null
   and max_per_day = 5
   and quiet_hours is null;
