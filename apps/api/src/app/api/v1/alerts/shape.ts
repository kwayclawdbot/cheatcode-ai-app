/** Shared row → AlertRow shaping for the alerts endpoints. */
import { AlertRow, MONITORING_PLAIN, type AlertStatus, type AlertMonitoring } from '@shared/api';

const NEXT_ACTION: Record<AlertStatus, { label: string; action: 'activate' | 'review' | 'ask_kai' | 'none' }> = {
  draft: { label: 'Activate', action: 'activate' },
  active: { label: 'Ask Kai', action: 'ask_kai' },
  triggered: { label: 'Review', action: 'review' },
  paused: { label: 'Activate', action: 'activate' },
  expired: { label: 'Review', action: 'review' },
  cancelled: { label: 'Review', action: 'review' },
};

const STATUS_PLAIN: Record<AlertStatus, string> = {
  draft: 'Draft — not watching yet. Activate it and Kai will keep an eye on this.',
  active: 'Kai is watching this for you.',
  triggered: 'This hit. Kai has the details.',
  paused: 'Paused — Kai is not watching this right now.',
  expired: 'The window closed before this happened.',
  cancelled: 'You called this one off.',
};

/**
 * Round 2: no alert-evaluation worker exists, so `active` means ARMED, not
 * "being checked right now". The app must render that difference honestly —
 * "armed · live evaluation starts when market data goes live".
 */
export const MONITORING_BY_STATUS: Record<AlertStatus, AlertMonitoring> = {
  draft: 'not_armed',
  active: 'armed_no_feed',
  paused: 'not_armed',
  triggered: 'resolved',
  expired: 'resolved',
  cancelled: 'resolved',
};

export function monitoringFor(status: AlertStatus): { monitoring: AlertMonitoring; plain: string } {
  const monitoring = MONITORING_BY_STATUS[status] ?? 'not_armed';
  return { monitoring, plain: MONITORING_PLAIN[monitoring] };
}

export function alertRow(row: Record<string, unknown>, summaryOverride?: string) {
  const status = String(row.status) as AlertStatus;
  const m = monitoringFor(status);
  return AlertRow.parse({
    id: String(row.id),
    status,
    natural_language: (row.natural_language as string) ?? null,
    condition: row.condition ?? {},
    data_dependency: (row.data_dependency as Record<string, unknown>) ?? {},
    frequency: (row.frequency as string) ?? null,
    expires_at: (row.expires_at as string) ?? null,
    refs: (row.refs as Record<string, unknown>) ?? null,
    created_at: String(row.created_at),
    summary_plain: summaryOverride ?? (row.natural_language as string) ?? STATUS_PLAIN[status],
    next_action: NEXT_ACTION[status] ?? { label: 'Review', action: 'review' },
    monitoring: m.monitoring,
    monitoring_plain: m.plain,
  });
}

export { STATUS_PLAIN };
