/**
 * Debrief fixtures — the V3-T2 / S25 artboard trade, plus one open item so the
 * list shows both states. `simulated:true` on the second row proves the tag.
 */
import type { ClosedPosition, Debrief } from './types';

export const fixtureDebrief: Debrief = {
  id: 'db-1',
  position_id: 'pos-1',
  outcome: {
    symbol: 'META',
    pnl: 86.4,
    pnl_label: '+$86.40',
    exit_reason: 'exited in target zone',
    held: '2h 14m',
    direction: 'long',
    closed_at: '2026-08-25T18:12:00Z',
  },
  process_receipt: [
    { label: 'Entry in zone', detail: 'Entered inside the planned zone (504.10)', status: 'ok' },
    { label: 'Stop respected', detail: 'Stop respected · never moved lower', status: 'ok' },
    { label: 'Sized in policy', detail: 'Sized within your daily risk policy', status: 'ok' },
    { label: 'Exited early', detail: 'Exited slightly early — 540 printed 20 minutes later', status: 'warn' },
  ],
  lesson_plain:
    'Waiting for confirmation is what kept your risk at $58. The early exit is a process win, not a mistake.',
  lesson_detail:
    'You waited for the hold above 504 instead of anticipating it. That single habit is why the loss, if it had gone the other way, was capped at $58 rather than open-ended. Taking profit inside the target zone is a decision you can repeat; catching the exact high is not.',
  what_worked: [
    'Entered only after the level held, not on the first touch',
    'Position size came from the stop, not from a feeling',
  ],
  what_failed: [
    'Exited 20 minutes before the target printed — the plan said hold to 540',
  ],
  timeline: [
    { at: '2026-08-25T15:31:00Z', time_label: '11:31', label: 'Plan built', detail: 'Entry 504 · stop 460 · target 540', kind: 'plan' },
    { at: '2026-08-25T15:58:00Z', time_label: '11:58', label: 'Alert triggered', detail: '504 held for 5 minutes', kind: 'alert' },
    { at: '2026-08-25T16:00:00Z', time_label: '12:00', label: 'Order accepted', detail: 'Accepted is not filled', kind: 'order' },
    { at: '2026-08-25T16:01:00Z', time_label: '12:01', label: 'Filled', detail: '18 shares at 504.10', kind: 'fill' },
    { at: '2026-08-25T18:12:00Z', time_label: '14:12', label: 'Closed', detail: '18 shares at 508.90', kind: 'exit' },
  ],
  simulated: false,
  lesson_saved: false,
  created_at: '2026-08-25T18:20:00Z',
};

export const fixtureDebriefs: Debrief[] = [fixtureDebrief];

export const fixtureClosedPositions: ClosedPosition[] = [
  {
    id: 'pos-1', symbol: 'META', pnl: 86.4, pnl_label: '+$86.40',
    closed_label: 'Closed yesterday', held: '2h 14m', simulated: false, debrief_id: 'db-1',
  },
  {
    id: 'pos-2', symbol: 'NVDA', pnl: -21.3, pnl_label: '-$21.30',
    closed_label: 'Closed Friday', held: '3h 06m', simulated: true, debrief_id: null,
  },
];
