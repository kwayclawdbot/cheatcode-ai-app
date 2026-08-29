/**
 * Trade Portal view-model (lane MOBILE-B, round 4).
 *
 * Spec 10 §6 (routing context) and §7 (chart-first portal) are the contract.
 * `packages/shared/api.ts` has no portal schema while API-4 is in flight, so
 * these types are the reconciliation point: `lib/trade-api.ts` maps whatever
 * `GET /trade/portal/:symbol` returns onto them and nothing else in the feature
 * knows the wire shape.
 *
 * PAPER ONLY. Nothing here may ever render the words "submit to broker".
 */
import type { Quote } from '../../lib/types';
import type { OrderRow } from '../orders/types';
import type { PositionRow } from '../positions/types';
import type { TradeAccount } from '../trade/types';

/** The portal's own rail — 10 §7 "1m/5m/15m/1h/4h/D". */
export type PortalTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | 'D';
export const PORTAL_TIMEFRAMES: PortalTimeframe[] = ['1m', '5m', '15m', '1h', '4h', 'D'];

/* ------------------------------------------------------------------ */
/* Annotations — 10 §7 "Annotation requirements"                        */
/* ------------------------------------------------------------------ */

/**
 * Meaning, never colour. The client maps kind → token (14 palette lock).
 *
 * The first eight say what a level MEANS. `trendline`, `box` and `vertical`
 * (LIVE-1, append-only) say what SHAPE to draw for something a horizontal price
 * line cannot express — a slope between two real bars, a time x price region
 * (an FVG, an order block), a moment. The chart derives the shape from `kind`
 * plus which coordinates are present, so nothing sends a shape name twice.
 */
export type AnnotationKind =
  | 'trigger' | 'entry' | 'stop' | 'invalidation' | 'target'
  | 'support' | 'resistance' | 'note'
  | 'trendline' | 'box' | 'vertical';

export type AnnotationProvenance = 'kai' | 'user' | 'community' | 'plan';
export type AnnotationStatus = 'valid' | 'invalidated' | 'hidden' | 'deleted';

export type Annotation = {
  id: string;
  symbol: string;
  /** null = draw on every timeframe */
  timeframe: PortalTimeframe | null;
  kind: AnnotationKind;
  price: number | null;
  /** the far edge of a zone (entry 504–507) */
  price2: number | null;
  ts_from: string | null;
  ts_to: string | null;
  /** the chip's own label; falls back to the kind label */
  text: string | null;
  /** plain-language WHY Kai placed it — required before it can be inspected */
  reason: string | null;
  provenance: AnnotationProvenance;
  status: AnnotationStatus;
  source_alert_id: string | null;
  source_setup_id: string | null;
  source_plan_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/* ------------------------------------------------------------------ */
/* Kai chart-control commands — 10 §7                                   */
/* ------------------------------------------------------------------ */

export type ChartCommandName =
  | 'mark_level' | 'set_timeframe' | 'show_invalidation' | 'mark_plan'
  | 'zoom_trigger' | 'compare_prior' | 'highlight_community'
  | 'annotation_remove' | 'annotation_explain' | 'alert_from_level' | 'prepare_trade'
  // v2 (LIVE-1): the camera is a first-class command, so Kai can say "look
  // over here" instead of narrating a level that is 400 bars off screen.
  | 'zoom_range' | 'scroll_bars' | 'scroll_to_now' | 'flash_annotation' | 'pointer_hint';

/** Every command name, for the runtime guards that read frames off the wire. */
export const CHART_COMMAND_NAMES: ChartCommandName[] = [
  'mark_level', 'set_timeframe', 'show_invalidation', 'mark_plan', 'zoom_trigger',
  'compare_prior', 'highlight_community', 'annotation_remove', 'annotation_explain',
  'alert_from_level', 'prepare_trade',
  'zoom_range', 'scroll_bars', 'scroll_to_now', 'flash_annotation', 'pointer_hint',
];

export type ChartCommand = {
  command: ChartCommandName;
  payload: Record<string, unknown>;
  /** the sentence Kai says while the chart changes under it */
  narration: string | null;
};

/* ------------------------------------------------------------------ */
/* Context panels                                                       */
/* ------------------------------------------------------------------ */

export type PortalContext = 'kai' | 'alert' | 'plan' | 'community';

/** One qualitative scorecard component (spec §4 — never a /20 fraction). */
export type ScoreComponent = {
  key: string;
  label: string;
  status: string;
  /** 0–5 segments lit */
  strength: number;
  explanation: string | null;
};

export type AlertEvent = { label: string; at: string | null; tone: 'neutral' | 'good' | 'warn' };

export type PortalAlert = {
  id: string;
  symbol: string;
  company: string | null;
  mode: string | null;
  direction: string | null;
  instrument: string | null;
  grade_display: string | null;
  score: number | null;
  state: string;
  state_label: string;
  headline: string;
  what_changed: string | null;
  triggered_at: string | null;
  company_summary: string | null;
  condition: string | null;
  condition_met: boolean;
  entry: number | null;
  entry_high: number | null;
  stop: number | null;
  target: number | null;
  rr: string | null;
  hold: string | null;
  expires_plain: string | null;
  score_components: ScoreComponent[];
  kai_interpretation: string | null;
  fit_plain: string | null;
  community_plain: string | null;
  events: AlertEvent[];
  primary_action: { label: string; route: string | null } | null;
};

export type PortalPlan = {
  id: string | null;
  entry: number | null;
  stop: number | null;
  targets: number[];
  rr: string | null;
  size_plain: string | null;
  risk_dollars: number | null;
  daily_cap: { used: number | null; cap: number | null } | null;
  stop_attaches_plain: string | null;
  /** what the CTA under the plan does next */
  action: { label: string; route: string } | null;
  empty_plain: string | null;
};

export type PortalCommunityMessage = {
  id: string;
  author: string;
  initial: string;
  role: string | null;
  at: string | null;
  body: string;
  is_kai: boolean;
  verified_plain: string | null;
};

export type PortalCommunity = {
  room_id: string | null;
  circle_id: string | null;
  circle_name: string | null;
  summary: string | null;
  message_count: number | null;
  bullish_pct: number | null;
  /** The level members mention most — labelled, never folded into the grade. */
  common_level: number | null;
  /** "Community observation — members, not Kai." */
  label_plain: string | null;
  claims: { claim: string; verdict: string; plain: string }[];
  messages: PortalCommunityMessage[];
};

/* ------------------------------------------------------------------ */
/* Execution + drawers                                                  */
/* ------------------------------------------------------------------ */

/** Spec §9 lifecycle, as the portal sees it. */
export type ExecutionState =
  | 'watching' | 'forming' | 'ready' | 'entry_reached' | 'planned'
  | 'order_pending' | 'position_active' | 'invalidated' | 'closed' | 'none';

export type PortalExecution = {
  state: ExecutionState;
  label: string;
  /** null when there is nothing to do — the portal then shows no CTA at all */
  action: { label: string; route: string } | null;
  detail_plain: string | null;
  /** the pending order / open position the state refers to */
  order: OrderRow | null;
  position: PositionRow | null;
};

export type PortalDrawers = {
  account: TradeAccount | null;
  positions: PositionRow[];
  open_orders: OrderRow[];
  watchlist: { symbol: string; name: string | null; quote: Quote | null }[];
  recent: { symbol: string; name: string | null; quote: Quote | null }[];
};

export type TradePortal = {
  symbol: string;
  name: string | null;
  instrument: string | null;
  mode: string | null;
  quote: Quote | null;
  market_state: string | null;
  paper: boolean;
  starred: boolean;
  chart: {
    timeframe: PortalTimeframe;
    timeframes: PortalTimeframe[];
    /** the trigger candle the portal opens focused on (§6) */
    focus_ts: string | null;
  };
  annotations: Annotation[];
  kai: { conversation_id: string | null; opening_message: string | null };
  alert: PortalAlert | null;
  plan: PortalPlan | null;
  community: PortalCommunity | null;
  execution: PortalExecution;
  drawers: PortalDrawers;
  /** true when nothing on screen came from the live stack */
  is_fixture: boolean;
  /** honest note when a piece of this could not be fetched */
  notice: string | null;
};

export const KIND_LABEL: Record<AnnotationKind, string> = {
  trigger: 'Trigger',
  entry: 'Entry',
  stop: 'Stop',
  invalidation: 'Invalid',
  target: 'Target',
  support: 'Support',
  resistance: 'Resistance',
  note: 'Note',
  trendline: 'Trend',
  box: 'Zone',
  vertical: 'Mark',
};

export const PROVENANCE_LABEL: Record<AnnotationProvenance, string> = {
  kai: 'Placed by Kai',
  user: 'You drew this',
  community: 'Named by members',
  plan: 'From your plan',
};
