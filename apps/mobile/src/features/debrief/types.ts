/**
 * Debrief view-model types (lane MOBILE-B).
 * Wire shape lands in packages/shared/api.ts from the API-2 lane; the mapping
 * lives in src/lib/community-api.ts so screens only ever see these.
 */

export type ProcessReceipt = {
  /** "Entry in zone" — the short label under the icon on V3-T2. */
  label: string;
  /** The full sentence on the S25 checklist. */
  detail: string;
  /** ok = kept the plan · warn = a deviation worth naming · miss = broke it. */
  status: 'ok' | 'warn' | 'miss';
};

export type DebriefOutcome = {
  symbol: string;
  /** Realized P/L in dollars. Green/red here is FINANCIAL semantics — allowed. */
  pnl: number;
  pnl_label: string;
  /** "exited in target zone" */
  exit_reason: string;
  /** "2h 14m" */
  held: string;
  direction: 'long' | 'short';
  closed_at: string | null;
};

export type TimelineEvent = {
  at: string;
  time_label: string;
  label: string;
  detail: string | null;
  kind: 'plan' | 'order' | 'fill' | 'alert' | 'exit';
};

export type Debrief = {
  id: string;
  position_id: string;
  outcome: DebriefOutcome;
  process_receipt: ProcessReceipt[];
  /** Kai's one-line lesson — the panel on V3-T2. */
  lesson_plain: string;
  /** The longer version behind "More". */
  lesson_detail: string | null;
  what_worked: string[];
  what_failed: string[];
  timeline: TimelineEvent[];
  /** origin.simulated — renders a SIMULATED tag, never hidden. */
  simulated: boolean;
  lesson_saved: boolean;
  created_at: string;
};

/** A closed position that has no debrief yet. */
export type ClosedPosition = {
  id: string;
  symbol: string;
  pnl: number;
  pnl_label: string;
  closed_label: string;
  held: string;
  simulated: boolean;
  debrief_id: string | null;
};
