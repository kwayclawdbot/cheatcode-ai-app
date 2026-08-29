/**
 * The Sources block: each connector, whether it can run, and its last run.
 *
 * Shared by `GET /admin/sync` and by `GET /admin/overview`, because the
 * Overview screen has to be able to say "these numbers cover the app only" and
 * that sentence is only true if it read the same source states.
 */
import type { AdminSourceState, AdminSyncRun, SyncSourceName } from '@shared/api';
import { serviceClient } from './../db';
import { sources } from './../crm/registry';
import { ZERO_COUNTS, type SyncCounts } from './../crm/source';

type SyncRunRow = {
  id: string;
  source: SyncSourceName;
  state: 'running' | 'ok' | 'failed';
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  counts: Partial<SyncCounts> | null;
  error: string | null;
};

export function shapeRun(row: SyncRunRow): AdminSyncRun {
  return {
    id: row.id,
    source: row.source,
    state: row.state,
    dry_run: row.dry_run,
    started_at: row.started_at,
    finished_at: row.finished_at,
    counts: { ...ZERO_COUNTS, ...(row.counts ?? {}) },
    error: row.error,
  };
}

/** The last run of every source, real or dry — an operator wants both. */
export async function lastRuns(): Promise<Map<SyncSourceName, AdminSyncRun>> {
  const db = serviceClient();
  const { data, error } = await db
    .from('sync_runs')
    .select('id,source,state,dry_run,started_at,finished_at,counts,error')
    .order('started_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  const out = new Map<SyncSourceName, AdminSyncRun>();
  for (const row of (data ?? []) as SyncRunRow[]) {
    if (!out.has(row.source)) out.set(row.source, shapeRun(row));
  }
  return out;
}

export async function sourceStates(): Promise<AdminSourceState[]> {
  const runs = await lastRuns();
  const out: AdminSourceState[] = [];
  for (const s of sources()) {
    const plan = await s.plan();
    const last = runs.get(s.name) ?? null;
    out.push({
      source: s.name,
      configured: plan.configured,
      reason: plan.configured ? null : plan.reason,
      last_run: last,
      plain: plan.plain,
    });
  }
  return out;
}

/** True when at least one run of that source has ever completed successfully. */
export async function hasSucceeded(source: SyncSourceName): Promise<boolean> {
  const db = serviceClient();
  const { count, error } = await db
    .from('sync_runs')
    .select('id', { count: 'exact', head: true })
    .eq('source', source)
    .eq('state', 'ok')
    .eq('dry_run', false);
  if (error) throw error;
  return (count ?? 0) > 0;
}
