-- 0022 — LIVE-1: the three shape kinds the chart can draw.
--
-- `AnnotationKind` in packages/shared/api.ts gained `trendline`, `box` and
-- `vertical` so Kai can mark things a horizontal price line cannot say: a
-- sloping trendline between two real bars, a time x price region (a fair-value
-- gap, an order block), and a moment on the time axis.
--
-- WHY THIS MIGRATION EXISTS AT ALL: 0021's check constraint enumerates the
-- eight round-4 kinds. Widening the TypeScript enum without widening the
-- constraint would ship a contract the database refuses at insert time — the
-- API would type-check, the chart would render, and the write would 400 in
-- production. A type the store rejects is not a type.
--
-- ADDITIVE AND REVERSIBLE. The constraint is replaced by a superset; no row
-- changes, no column changes, nothing that was legal before becomes illegal.
-- The three new kinds carry no financial semantics of their own, so
-- apps/api/src/lib/round4/annotations.ts maps all three to the neutral `level`
-- semantic and the client draws them as market information — never as risk and
-- never as a target.
--
-- NOT VALIDATED SEPARATELY: `price`, `price2`, `ts_from` and `ts_to` are still
-- unconstrained (gap 2.29 in SCHEMA-NOTES). A `box` with no time range or a
-- `trendline` with one anchor is still storable and the client still has to
-- render whatever it is handed. This migration widens the vocabulary; it does
-- not close that gap.

alter table chart_annotations
  drop constraint if exists chart_annotations_kind_check;

alter table chart_annotations
  add constraint chart_annotations_kind_check
  check (kind in (
    'trigger', 'entry', 'stop', 'invalidation', 'target', 'support', 'resistance', 'note',
    'trendline', 'box', 'vertical'
  ));
