-- 0027 — two more annotation shapes: a circle and an arrow.
--
-- The show could draw a price as a rule across the chart and a band as a box,
-- and that is the whole vocabulary a presenter had. It could not ring the
-- candle it was talking about, and it could not show the distance price still
-- has to travel to a level — the two things a person at a whiteboard does most.
--
-- Both remain anchored, not freehand:
--   circle — centre is (ts_from, price): a stored bar and a stored level.
--   arrow  — (ts_from, price) to (ts_to, price2): both ends are real numbers,
--            normally the last close and the level it is short of.
--
-- The check constraint is replaced rather than dropped: `kind` staying closed is
-- what stops a client inventing a shape the renderer has never heard of and
-- getting a silent no-op on someone's chart.
alter table chart_annotations drop constraint if exists chart_annotations_kind_check;

alter table chart_annotations
  add constraint chart_annotations_kind_check check (
    kind = any (array[
      'trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance',
      'note', 'trendline', 'box', 'vertical',
      'circle', 'arrow'
    ])
  );
