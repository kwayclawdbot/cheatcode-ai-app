/**
 * THE RUNNER — `plan()` → `pull(cursor)` → resolve → write, with the books kept.
 *
 * DEVIATION FROM THE BRIEF'S LITERAL WORDING, and the reason for it. Brief §5
 * describes the interface as `plan() -> pull(cursor) -> resolve()`, three
 * methods on a Source. `resolve()` is implemented ONCE, here, instead of once
 * per connector — because per-connector resolution is precisely how connectors
 * drift, and the identity rules are the part that must be identical in all
 * three. A source's job is to answer "what does my system know"; deciding who
 * that is, and whether two of them are the same person, is not a per-source
 * opinion. Every guarantee §5 asks for is therefore proven once by the `app`
 * source and inherited by the other two by construction.
 *
 * IDEMPOTENCE IS THE WHOLE CLAIM (brief §10): a second run of any source must
 * create ZERO rows. That is structural rather than careful:
 *   * `crm_identities unique (kind, value)` + `on conflict do nothing`
 *   * `crm_events unique (source, external_id)` + `on conflict do nothing`
 *   * a person is only INSERTED when resolution found nobody
 *   * an UPDATE is only issued when a field actually changes, so a settled
 *     database takes zero writes of any kind on a re-run, not merely zero rows.
 *
 * A DRY RUN IS A RUN. It resolves everything, counts everything, and writes
 * nothing except its own `sync_runs` row with `dry_run = true` — because "what
 * would the Stripe sync do right now" is a question whose last answer is worth
 * keeping, and a mode that leaves no trace is a mode nobody can audit.
 *
 * ONE REAL RUN PER SOURCE. `sync_runs_one_running_per_source_idx` enforces it in
 * the store; this file handles the case that index creates — a run that died
 * without finishing leaves a `running` row that would block the source forever.
 * A stale claim is reaped, not worked around.
 */
import type { CrmStatus, SyncSourceName } from '@shared/api';
import { serviceClient } from './../db';
import { log } from './../log';
import { resolvePerson } from './identity';
import {
  ZERO_COUNTS,
  getSource,
  type EventUpsert,
  type PersonUpsert,
  type Source,
  type SyncCounts,
} from './source';

/** A `running` row older than this is assumed dead and is reaped. */
const STALE_RUN_MS = 15 * 60_000;
/** Rows per insert. Large enough to be one round trip, small enough to retry. */
const WRITE_BATCH = 500;
/** Pages per run. A ceiling, not a target: 200 × 200 is 40,000 people. */
const MAX_PAGES = 200;

/**
 * Statuses the ingest never overwrites. Neither is a funnel stage: `blocked` is
 * an operator's decision about a person and `churned` is a fact about money
 * that only the `stripe` connector will ever be entitled to assert. A
 * derivation that quietly un-blocked somebody would be the worst kind of bug —
 * silent, and in the direction of more access.
 */
const TERMINAL: ReadonlySet<CrmStatus> = new Set<CrmStatus>(['blocked', 'churned']);

export type RunResult = {
  id: string | null;
  source: SyncSourceName;
  state: 'ok' | 'failed';
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  counts: SyncCounts;
  cursor: Record<string, unknown> | null;
  error: string | null;
};

export async function runSync(opts: {
  source: SyncSourceName;
  dryRun: boolean;
  requestId: string;
}): Promise<RunResult> {
  const src = getSource(opts.source);
  if (!src) {
    return failedWithoutRow(opts.source, opts.dryRun, `unknown source ${opts.source}`);
  }

  const plan = await src.plan();
  if (!plan.configured) {
    // A source that cannot run does not get a `running` row it would have to be
    // rescued from. It gets a finished, failed run carrying the exact reason,
    // which is what the Sources screen renders under "last run".
    return recordUnconfigured(src, opts.dryRun, plan.reason);
  }

  if (!opts.dryRun) await reapStaleRuns(opts.source, opts.requestId);

  const startCursor = opts.dryRun ? null : await resumeCursor(opts.source);
  const run = await claimRun(opts.source, opts.dryRun, startCursor);
  const counts: SyncCounts = { ...ZERO_COUNTS };
  let cursor = startCursor;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const pulled = await src.pull(cursor);
      counts.scanned += pulled.scanned;
      for (const item of pulled.people) {
        await ingestOne(src, item.person, item.events, opts.dryRun, counts, opts.requestId);
      }
      cursor = pulled.cursor;
      // The cursor is persisted PER PAGE, not at the end. A run that dies on
      // page nine resumes at page nine; one that only saved at the end would
      // redo all nine, which is harmless but slow, and would be indistinguishable
      // from a cursor that never worked.
      if (run) await saveCursor(run.id, cursor, counts);
      if (!cursor) break;
    }

    const finished = await finishRun(run?.id ?? null, 'ok', counts, cursor, null);
    log('info', opts.requestId, 'crm.sync.ok', {
      source: opts.source,
      dry_run: opts.dryRun,
      ...counts,
    });
    return {
      id: run?.id ?? null,
      source: opts.source,
      state: 'ok',
      dry_run: opts.dryRun,
      started_at: run?.started_at ?? new Date().toISOString(),
      finished_at: finished,
      counts,
      cursor,
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const finished = await finishRun(run?.id ?? null, 'failed', counts, cursor, message);
    log('error', opts.requestId, 'crm.sync.failed', {
      source: opts.source,
      dry_run: opts.dryRun,
      message,
      ...counts,
    });
    return {
      id: run?.id ?? null,
      source: opts.source,
      state: 'failed',
      dry_run: opts.dryRun,
      started_at: run?.started_at ?? new Date().toISOString(),
      finished_at: finished,
      counts,
      cursor,
      error: message,
    };
  }
}

/* ------------------------------------------------------------------ */
/* one person                                                          */
/* ------------------------------------------------------------------ */

type PersonRow = Record<string, unknown> & { id: string; status: CrmStatus };

async function ingestOne(
  src: Source,
  person: PersonUpsert,
  events: EventUpsert[],
  dryRun: boolean,
  counts: SyncCounts,
  requestId: string
): Promise<void> {
  const db = serviceClient();
  const outcome = await resolvePerson(person.identities);

  if (outcome.kind === 'conflict') {
    // REFUSE, RECORD, AND MOVE ON (brief §5). Two people who each already carry
    // a different strong identity are not automatically one person, and the
    // decision is a human's. The event key is deterministic, so the same
    // conflict reported on every run is one row, not one per run.
    counts.conflicted += 1;
    if (!dryRun) {
      await insertEvents(src, outcome.otherPersonId, [
        {
          external_id: `merge_conflict:${outcome.otherPersonId}:${outcome.personId}:${outcome.on}`,
          type: 'merge_conflict',
          category: 'identity',
          occurred_at: new Date().toISOString(),
          payload: {
            reason:
              'two people already carry different strong identities; a human decides whether these are one person',
            kept_person_id: outcome.otherPersonId,
            other_person_id: outcome.personId,
            matched_on: outcome.strongOn,
            disagreed_on: outcome.on,
          },
        },
      ]);
    }
    log('warn', requestId, 'crm.sync.merge_conflict', {
      source: src.name,
      kept: outcome.otherPersonId,
      other: outcome.personId,
      on: outcome.on,
    });
    return;
  }

  let personId: string;

  if (outcome.kind === 'none') {
    counts.created += 1;
    if (dryRun) {
      // Nothing exists to hang identities or events on, and inventing an id to
      // count against would be counting a row that will not have that id when
      // it is really written. The person and their events are counted as
      // creations and the loop stops here.
      counts.created += events.length + person.identities.length;
      return;
    }
    const { data, error } = await db
      .from('crm_people')
      .insert(insertShape(person))
      .select('id,status')
      .single();
    if (error) throw error;
    personId = (data as PersonRow).id;
  } else {
    counts.resolved += 1;
    personId = outcome.personId;
    const { data, error } = await db
      .from('crm_people')
      .select(
        'id,status,display_name,primary_email,primary_phone_e164,primary_tier,source,source_detail,first_seen_at,last_active_at,last_inbound_at,last_outbound_at,inbound_count,outbound_count,total_paid_cents,current_mrr_cents,ltv_cents,app_user_id,merged_into'
      )
      .eq('id', personId)
      .single();
    if (error) throw error;
    const existing = data as PersonRow;

    // A merged loser still resolves (that is what merges are for); the writes
    // belong to the survivor. One hop only — merges move identities onto the
    // winner, so a chain should be impossible and looping here would hang a run.
    if (typeof existing.merged_into === 'string') personId = existing.merged_into;

    const patch = changedFields(existing, person);
    if (Object.keys(patch).length === 0) {
      counts.skipped += 1;
    } else if (!dryRun) {
      const { error: upErr } = await db.from('crm_people').update(patch).eq('id', personId);
      if (upErr) throw upErr;
    }
  }

  if (dryRun) {
    // A DRY RUN THAT GUESSES IS WORSE THAN NO DRY RUN. Reporting "would create
    // 3,320 events" when the honest answer is zero is exactly the number an
    // operator would act on. So it asks, with two reads and no writes, which of
    // these keys the database does not already hold.
    counts.created += await countMissingIdentities(person);
    counts.created += await countMissingEvents(src, events);
    return;
  }

  counts.created += await insertIdentities(personId, person);
  counts.created += await insertEvents(src, personId, events);
}

/** How many of these (kind, value) pairs are not already in the table. */
async function countMissingIdentities(p: PersonUpsert): Promise<number> {
  if (p.identities.length === 0) return 0;
  const db = serviceClient();
  const clauses = p.identities.map((i) => `and(kind.eq.${i.kind},value.eq."${i.value}")`);
  const { data, error } = await db.from('crm_identities').select('kind,value').or(clauses.join(','));
  if (error) throw error;
  const held = new Set((data ?? []).map((r) => `${(r as { kind: string }).kind}|${(r as { value: string }).value}`));
  return p.identities.filter((i) => !held.has(`${i.kind}|${i.value}`)).length;
}

/** How many of these external ids this source has not already recorded. */
async function countMissingEvents(src: Source, events: EventUpsert[]): Promise<number> {
  if (events.length === 0) return 0;
  const db = serviceClient();
  let missing = 0;
  for (let i = 0; i < events.length; i += WRITE_BATCH) {
    const batch = events.slice(i, i + WRITE_BATCH);
    const { data, error } = await db
      .from('crm_events')
      .select('external_id')
      .eq('source', src.eventSource)
      .in('external_id', batch.map((e) => e.external_id));
    if (error) throw error;
    const held = new Set((data ?? []).map((r) => (r as { external_id: string }).external_id));
    missing += batch.filter((e) => !held.has(e.external_id)).length;
  }
  return missing;
}

/**
 * What actually changed. This is what makes a re-run take ZERO writes rather
 * than merely create zero rows — and it is the difference between an idempotent
 * ingest and one that churns `updated_at` on 2,507 rows every five minutes.
 *
 * A NULL FROM A SOURCE NEVER ERASES A VALUE. A connector that does not know a
 * phone number is not asserting that there isn't one; only a non-null is an
 * assertion. The two exceptions are monotonic on purpose: `first_seen_at` only
 * moves earlier and `last_active_at` only moves later, so two sources reporting
 * different windows of the same person's life converge instead of fighting.
 */
function changedFields(existing: PersonRow, next: PersonUpsert): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const setIfChanged = (col: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (existing[col] !== value) patch[col] = value;
  };

  setIfChanged('display_name', next.display_name);
  setIfChanged('primary_email', next.primary_email);
  setIfChanged('primary_phone_e164', next.primary_phone_e164);
  setIfChanged('primary_tier', next.primary_tier);
  setIfChanged('source', next.source);
  setIfChanged('app_user_id', next.app_user_id);
  setIfChanged('total_paid_cents', next.total_paid_cents);
  setIfChanged('current_mrr_cents', next.current_mrr_cents);
  setIfChanged('ltv_cents', next.ltv_cents);

  if (next.status && !TERMINAL.has(existing.status) && existing.status !== next.status) {
    patch.status = next.status;
  }

  if (next.first_seen_at) {
    const cur = existing.first_seen_at as string | null;
    if (!cur || next.first_seen_at < cur) patch.first_seen_at = next.first_seen_at;
  }
  for (const col of ['last_active_at', 'last_inbound_at', 'last_outbound_at'] as const) {
    const v = next[col];
    if (!v) continue;
    const cur = existing[col] as string | null;
    if (!cur || v > cur) patch[col] = v;
  }
  for (const col of ['inbound_count', 'outbound_count'] as const) {
    const v = next[col];
    if (typeof v !== 'number') continue;
    if (existing[col] !== v) patch[col] = v;
  }

  if (next.source_detail) {
    const cur = (existing.source_detail ?? {}) as Record<string, unknown>;
    const merged = { ...cur, ...next.source_detail };
    if (JSON.stringify(merged) !== JSON.stringify(cur)) patch.source_detail = merged;
  }

  return patch;
}

function insertShape(p: PersonUpsert): Record<string, unknown> {
  return {
    display_name: p.display_name ?? null,
    primary_email: p.primary_email ?? null,
    primary_phone_e164: p.primary_phone_e164 ?? null,
    status: p.status ?? 'lead',
    primary_tier: p.primary_tier ?? null,
    source: p.source ?? null,
    source_detail: p.source_detail ?? {},
    first_seen_at: p.first_seen_at ?? null,
    last_active_at: p.last_active_at ?? null,
    last_inbound_at: p.last_inbound_at ?? null,
    last_outbound_at: p.last_outbound_at ?? null,
    inbound_count: p.inbound_count ?? 0,
    outbound_count: p.outbound_count ?? 0,
    total_paid_cents: p.total_paid_cents ?? null,
    current_mrr_cents: p.current_mrr_cents ?? null,
    ltv_cents: p.ltv_cents ?? null,
    app_user_id: p.app_user_id ?? null,
  };
}

/**
 * `on conflict (kind, value) do nothing`, and the returned rows are exactly the
 * ones that were really inserted — which is where `counts.created` comes from.
 * An identity that already belongs to ANOTHER person is silently not stolen:
 * resolution above already had its chance to find them, and quietly repointing
 * a unique identity is the double-resolution the constraint exists to prevent.
 */
async function insertIdentities(personId: string, p: PersonUpsert): Promise<number> {
  const db = serviceClient();
  const rows = p.identities
    .map((i) => ({
      person_id: personId,
      kind: i.kind,
      value: i.value,
      source: p.source ?? null,
      verified: i.verified ?? false,
    }))
    .filter((r) => r.value);
  if (rows.length === 0) return 0;
  const { data, error } = await db
    .from('crm_identities')
    .upsert(rows, { onConflict: 'kind,value', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

async function insertEvents(src: Source, personId: string, events: EventUpsert[]): Promise<number> {
  if (events.length === 0) return 0;
  const db = serviceClient();
  let written = 0;
  for (let i = 0; i < events.length; i += WRITE_BATCH) {
    const rows = events.slice(i, i + WRITE_BATCH).map((e) => ({
      person_id: personId,
      type: e.type,
      category: e.category ?? null,
      source: src.eventSource,
      payload: e.payload ?? {},
      value_cents: e.value_cents ?? null,
      occurred_at: e.occurred_at,
      external_id: e.external_id,
    }));
    const { data, error } = await db
      .from('crm_events')
      .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    written += (data ?? []).length;
  }
  return written;
}

/* ------------------------------------------------------------------ */
/* sync_runs bookkeeping                                               */
/* ------------------------------------------------------------------ */

/**
 * A process that died mid-run leaves a `running` row, and the one-per-source
 * unique index then refuses every future run of that source — forever, with no
 * error a human would recognise. So a claim older than the lease is marked
 * failed with a sentence that says exactly that, and the source is usable
 * again. Fifteen minutes is longer than any page loop and shorter than anybody's
 * patience.
 */
async function reapStaleRuns(source: SyncSourceName, requestId: string): Promise<void> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data, error } = await db
    .from('sync_runs')
    .update({
      state: 'failed',
      finished_at: new Date().toISOString(),
      error: 'abandoned — the process that claimed this run did not finish it',
    })
    .eq('source', source)
    .eq('state', 'running')
    .eq('dry_run', false)
    .lt('started_at', cutoff)
    .select('id');
  if (error) {
    log('warn', requestId, 'crm.sync.reap_failed', { source, message: error.message });
    return;
  }
  if ((data ?? []).length > 0) {
    log('warn', requestId, 'crm.sync.reaped', { source, runs: (data ?? []).length });
  }
}

/** Where to start: a failed run's saved cursor, or the top. */
async function resumeCursor(source: SyncSourceName): Promise<Record<string, unknown> | null> {
  const db = serviceClient();
  const { data } = await db
    .from('sync_runs')
    .select('state,cursor')
    .eq('source', source)
    .eq('dry_run', false)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as { state?: string; cursor?: Record<string, unknown> | null } | null;
  if (row?.state === 'failed' && row.cursor) return row.cursor;
  return null;
}

type RunRow = { id: string; started_at: string };

async function claimRun(
  source: SyncSourceName,
  dryRun: boolean,
  cursor: Record<string, unknown> | null
): Promise<RunRow | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from('sync_runs')
    .insert({ source, state: 'running', dry_run: dryRun, cursor, counts: {} })
    .select('id,started_at')
    .single();
  if (error) {
    // 23505 here is the one-running-per-source index doing its job: another run
    // of this source is genuinely in flight. Say so in those words rather than
    // as a unique-violation, and do not start a second one.
    if (error.code === '23505') {
      throw new Error(`a ${source} sync is already running`);
    }
    throw error;
  }
  return data as RunRow;
}

async function saveCursor(
  runId: string,
  cursor: Record<string, unknown> | null,
  counts: SyncCounts
): Promise<void> {
  const db = serviceClient();
  await db.from('sync_runs').update({ cursor, counts }).eq('id', runId);
}

async function finishRun(
  runId: string | null,
  state: 'ok' | 'failed',
  counts: SyncCounts,
  cursor: Record<string, unknown> | null,
  error: string | null
): Promise<string | null> {
  if (!runId) return null;
  const finishedAt = new Date().toISOString();
  const db = serviceClient();
  await db
    .from('sync_runs')
    .update({ state, finished_at: finishedAt, counts, cursor, error })
    .eq('id', runId);
  return finishedAt;
}

/** A source that cannot run still leaves a record of having been asked. */
async function recordUnconfigured(
  src: Source,
  dryRun: boolean,
  reason: string
): Promise<RunResult> {
  const db = serviceClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from('sync_runs')
    .insert({
      source: src.name,
      state: 'failed',
      dry_run: dryRun,
      started_at: now,
      finished_at: now,
      counts: ZERO_COUNTS,
      error: reason,
    })
    .select('id,started_at')
    .single();
  const row = (data ?? null) as RunRow | null;
  return {
    id: row?.id ?? null,
    source: src.name,
    state: 'failed',
    dry_run: dryRun,
    started_at: row?.started_at ?? now,
    finished_at: now,
    counts: { ...ZERO_COUNTS },
    cursor: null,
    error: reason,
  };
}

function failedWithoutRow(source: SyncSourceName, dryRun: boolean, error: string): RunResult {
  const now = new Date().toISOString();
  return {
    id: null,
    source,
    state: 'failed',
    dry_run: dryRun,
    started_at: now,
    finished_at: now,
    counts: { ...ZERO_COUNTS },
    cursor: null,
    error,
  };
}
