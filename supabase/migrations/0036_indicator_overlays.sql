-- 0036 — the overlay kind: a curve, drawn as a curve.
--
-- THE COMPLAINT. "Kai marks out levels like ema etc as horizontal levels not
-- actual ema so the entire chart is nothing but multiple horizontal levels."
-- It was accurate. A moving average resolved to its value on the newest bar,
-- and a value is a price, and the only thing the chart knew to do with a price
-- was rule a dashed line across the whole plot. Four averages and a session
-- VWAP is five rules that all say "this price is fixed" about five things that
-- are not.
--
-- `indicator` is the kind that means the row NAMES A CURVE rather than asserts
-- a price. The client computes the series from the candles it is already
-- holding — an EMA is a recurrence over closes, a VWAP is a running division —
-- so the line is correct on every bar instead of on the last one.
--
-- WHAT IS AND IS NOT STORED. `text` carries the name ("EMA 21", "VWAP"), and
-- that is deliberately the only place it lives: `packages/shared/indicators.ts`
-- parses it back out, which is also how rows written BEFORE this migration —
-- `kind = 'support'`, `text = 'Ema21'`, and there are real ones — are read back
-- as overlays without a data migration. Nothing is rewritten in place, so there
-- is nothing to undo if the read-time repair turns out to be wrong about a row.
-- `price` stays the newest value of the curve, because that is the number a
-- person means by "the 21 is at 604" and it is what the price tag shows.
--
-- ADDITIVE AND REVERSIBLE, like 0022 and 0027 before it: the check constraint is
-- replaced by a superset. No row changes, no column changes, and nothing that
-- was legal before becomes illegal.
alter table chart_annotations drop constraint if exists chart_annotations_kind_check;

alter table chart_annotations
  add constraint chart_annotations_kind_check check (
    kind = any (array[
      'trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance',
      'note', 'trendline', 'box', 'vertical',
      'circle', 'arrow',
      'indicator'
    ])
  );
