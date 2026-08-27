/**
 * Position fixtures (EXPO_PUBLIC_FIXTURES=1) — V3-P1's own two cards:
 * META healthy (+$54.10, +1.8%, stop 460 · now 508 · target 540, "Thesis
 * intact — nothing to do") and NVDA at risk (−$21.30, 1% from stop, Review /
 * Exit now), with the daily-risk bar at $58 of $200.
 */
import type { PositionDetail, PositionRow, PositionsPayload } from './types';

const delayed = (price: number) => ({
  price,
  freshness: 'delayed' as const,
  delay_reason: 'entitlement' as const,
  source_ts: new Date(Date.now() - 15 * 60_000).toISOString(),
});

export const fixtureMeta: PositionRow = {
  id: 'pos-meta',
  symbol: 'META',
  name: 'Meta Platforms, Inc.',
  side: 'long',
  qty: 1.29,
  avg_entry: 504,
  notional: 650,
  mark_price: 508,
  mark_ts: new Date(Date.now() - 15 * 60_000).toISOString(),
  quote: { symbol: 'META', ...delayed(508), change_pct: 1.8 },
  unrealized_pnl: 54.1,
  unrealized_pnl_pct: 1.8,
  realized_pnl: null,
  day_pnl: 54.1,
  pnl_detail: 'in 2h',
  stop: 460,
  target: 540,
  health: 'healthy',
  health_label: 'Healthy',
  kai_line: 'Thesis intact — nothing to do.',
  nothing_to_do: true,
  status: 'open',
  opened_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  closed_at: null,
  origin_plan_id: 'plan-fixture-1',
  origin_setup_id: 'setup-meta-1',
  exit_style: 'auto',
  debrief_id: null,
  has_debrief: false,
  simulated: false,
  paper: true,
};

export const fixtureNvda: PositionRow = {
  id: 'pos-nvda',
  symbol: 'NVDA',
  name: 'NVIDIA Corporation',
  side: 'long',
  qty: 0.52,
  avg_entry: 963,
  notional: 480,
  mark_price: 921,
  mark_ts: new Date(Date.now() - 15 * 60_000).toISOString(),
  quote: { symbol: 'NVDA', ...delayed(921), change_pct: -4.4 },
  unrealized_pnl: -21.3,
  unrealized_pnl_pct: -4.4,
  realized_pnl: null,
  day_pnl: -21.3,
  pnl_detail: '1% from stop',
  stop: 912,
  target: 980,
  health: 'at_risk',
  health_label: 'At risk',
  kai_line: 'Price is 1% above your stop. Decide now, not while it is moving.',
  nothing_to_do: false,
  status: 'open',
  opened_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
  closed_at: null,
  origin_plan_id: null,
  origin_setup_id: null,
  exit_style: 'alert_assisted',
  debrief_id: null,
  has_debrief: false,
  simulated: false,
  paper: true,
};

export const fixtureClosed: PositionRow = {
  ...fixtureMeta,
  id: 'pos-crm-closed',
  symbol: 'CRM',
  name: 'Salesforce, Inc.',
  qty: 2,
  avg_entry: 262,
  notional: 524,
  mark_price: 271.4,
  quote: { symbol: 'CRM', ...delayed(271.4), change_pct: 3.6 },
  unrealized_pnl: null,
  unrealized_pnl_pct: null,
  realized_pnl: 18.8,
  day_pnl: 18.8,
  pnl_detail: 'held 3 days',
  health: 'closed',
  health_label: 'Closed',
  kai_line: 'Target hit. Your stop never came close.',
  nothing_to_do: true,
  status: 'closed',
  closed_at: new Date(Date.now() - 3600_000).toISOString(),
  origin_plan_id: null,
  origin_setup_id: null,
  debrief_id: 'debrief-1',
  has_debrief: true,
};

export const fixturePositions = (): PositionsPayload => ({
  positions: [fixtureMeta, fixtureNvda],
  today_pnl: 32.8,
  open_count: 2,
  daily_risk: { cap: 200, used: 58 },
  empty_copy: 'No open positions. When you place a paper order that fills, it shows up here.',
});

export const fixtureClosedPositions = (): PositionsPayload => ({
  positions: [fixtureClosed],
  today_pnl: 18.8,
  open_count: 0,
  daily_risk: { cap: 200, used: 58 },
  empty_copy: 'Nothing closed yet.',
});

export function fixturePositionDetail(id: string): PositionDetail {
  const base =
    id === 'pos-nvda' ? fixtureNvda : id === 'pos-crm-closed' ? fixtureClosed : fixtureMeta;
  return {
    ...base,
    plan_entry: base.avg_entry,
    plan_stop: base.stop,
    plan_target: base.target,
    plan_id: base.origin_plan_id,
    plan_vs_now: [],
    history: [
      { label: 'Plan built', detail: `Entry ${base.avg_entry} · stop ${base.stop} · target ${base.target}`, at: base.opened_at },
      { label: 'Order filled', detail: `${base.qty} shares at ${base.avg_entry}`, at: base.opened_at },
      ...(base.status === 'closed'
        ? [{ label: 'Closed', detail: 'Target hit', at: base.closed_at }]
        : []),
    ],
  };
}
