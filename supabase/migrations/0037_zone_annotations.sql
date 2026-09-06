-- 0037 — zones: a price RANGE over time, as its own kind.
--
-- The chart could rule a line at a price and it could draw a `box` — the band
-- between two named plan levels, stretched across the whole stored window, which
-- is what the live show uses for its risk and reward bands. What it could not
-- say is "this AREA is where sellers keep showing up": a supply or demand zone,
-- a consolidation box, the gap an opening print left behind. Those have an
-- identity, they start at a particular bar, they run forward from there, and
-- they mean something different above price than below it.
--
-- WHY NOT REUSE `box`. A box has no anchor semantics and no side: it is a
-- rectangle between two levels that already exist. A zone is drawn from its
-- anchor bar to the right edge unless an end is given, and it is coloured by
-- which side of price it is on, exactly as a level is. Collapsing the two would
-- have meant changing what the live show's worker already writes
-- (workers/kai-live/src/resolve.ts), which is a different lane's code and a
-- different lane's risk.
--
-- NO NEW COLUMNS. `price` and `price2` are the two edges, `ts_from` is the
-- anchor and `ts_to` the optional end — all four already exist and all four
-- already mean exactly that for `box`. Which side of price a zone is on is
-- DERIVED on the client from the last traded price, the same rule
-- `computedLevels` uses to decide whether a level is acting as support or as
-- resistance, so there is nothing to store and nothing to go stale.
--
-- ADDITIVE AND REVERSIBLE, like 0022, 0027 and 0036: the check constraint is
-- replaced by a superset. No row changes, no column changes, and nothing that
-- was legal before becomes illegal.
alter table chart_annotations drop constraint if exists chart_annotations_kind_check;

alter table chart_annotations
  add constraint chart_annotations_kind_check check (
    kind = any (array[
      'trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance',
      'note', 'trendline', 'box', 'vertical',
      'circle', 'arrow',
      'indicator',
      'zone'
    ])
  );
