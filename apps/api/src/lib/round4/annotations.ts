/**
 * Chart annotations — the marks Kai and the user put on the chart (spec §7).
 *
 * Every annotation carries the six things the spec demands and none of them are
 * optional in practice: identity, geometry, meaning, REASON, provenance and
 * lifecycle. A mark with no reason is a line on a chart that the user cannot
 * argue with, which is exactly the thing this product is supposed not to be —
 * so `reason` is filled in from the object the mark came from, never left null
 * on a Kai annotation.
 *
 * OWNERSHIP AND CONTROL. Kai's annotations belong to the user's context and the
 * user can hide or delete every one of them (spec §7 "Control"). `deleted` is a
 * status, not a row removal: the audit trail of what Kai drew and when survives.
 *
 * The table is SCHEMA-4's. Until it lands, every read answers with an empty set
 * and `degraded` — see schema-probe.ts for why there is no jsonb fallback here.
 */
import type { AnnotationKind, AnnotationRow, AnnotationProvenance, AnnotationStatus } from '@shared/api';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import { ANNOTATIONS_ABSENT_PLAIN, hasAnnotationsTable } from './schema-probe';

const COLUMNS =
  'id,user_id,symbol,timeframe,kind,price,price2,ts_from,ts_to,text,reason,provenance,status,source_alert_id,source_setup_id,source_plan_id,created_at,updated_at';

/** The semantic the client maps to the palette. The API never sends colours. */
const SEMANTIC: Record<AnnotationKind, AnnotationRow['semantic']> = {
  trigger: 'entry',
  entry: 'entry',
  stop: 'stop',
  invalidation: 'invalidation',
  target: 'target',
  support: 'level',
  resistance: 'level',
  note: 'note',
};

export function toAnnotationRow(row: Record<string, unknown>): AnnotationRow {
  const kind = String(row.kind) as AnnotationKind;
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe ?? '1d'),
    kind,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    price2: row.price2 === null || row.price2 === undefined ? null : Number(row.price2),
    ts_from: (row.ts_from as string) ?? null,
    ts_to: (row.ts_to as string) ?? null,
    text: (row.text as string) ?? null,
    reason: (row.reason as string) ?? null,
    provenance: (row.provenance as AnnotationProvenance) ?? 'kai',
    status: (row.status as AnnotationStatus) ?? 'valid',
    source_alert_id: (row.source_alert_id as string) ?? null,
    source_setup_id: (row.source_setup_id as string) ?? null,
    source_plan_id: (row.source_plan_id as string) ?? null,
    semantic: SEMANTIC[kind] ?? 'note',
    // The user controls every mark, including Kai's (spec §7).
    editable: true,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string) ?? null,
  };
}

export type ListResult = { annotations: AnnotationRow[]; degraded: boolean; degraded_reason: string | null };

export async function listAnnotations(opts: {
  userId: string;
  symbol: string;
  timeframe?: string;
  includeHidden?: boolean;
}): Promise<ListResult> {
  if (!(await hasAnnotationsTable())) {
    return { annotations: [], degraded: true, degraded_reason: ANNOTATIONS_ABSENT_PLAIN };
  }
  const db = serviceClient();
  let q = db
    .from('chart_annotations')
    .select(COLUMNS)
    .eq('user_id', opts.userId)
    .eq('symbol', opts.symbol.toUpperCase())
    .neq('status', 'deleted')
    .order('created_at', { ascending: true });
  if (opts.timeframe) q = q.eq('timeframe', opts.timeframe);
  if (!opts.includeHidden) q = q.neq('status', 'hidden');

  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'annotations.list_failed', { message: error.message });
    return { annotations: [], degraded: true, degraded_reason: ANNOTATIONS_ABSENT_PLAIN };
  }
  return {
    annotations: ((data ?? []) as Record<string, unknown>[]).map(toAnnotationRow),
    degraded: false,
    degraded_reason: null,
  };
}

export type NewAnnotation = {
  symbol: string;
  timeframe?: string;
  kind: AnnotationKind;
  price?: number | null;
  price2?: number | null;
  ts_from?: string | null;
  ts_to?: string | null;
  text?: string | null;
  reason?: string | null;
  provenance?: AnnotationProvenance;
  source_alert_id?: string | null;
  source_setup_id?: string | null;
  source_plan_id?: string | null;
};

export async function createAnnotation(userId: string, a: NewAnnotation): Promise<AnnotationRow> {
  if (!(await hasAnnotationsTable())) {
    throw new ApiError('NOT_FOUND', ANNOTATIONS_ABSENT_PLAIN);
  }
  const db = serviceClient();
  const { data, error } = await db
    .from('chart_annotations')
    .insert({
      user_id: userId,
      symbol: a.symbol.toUpperCase(),
      timeframe: a.timeframe ?? '1d',
      kind: a.kind,
      price: a.price ?? null,
      price2: a.price2 ?? null,
      ts_from: a.ts_from ?? null,
      ts_to: a.ts_to ?? null,
      text: a.text ?? null,
      reason: a.reason ?? null,
      provenance: a.provenance ?? 'user',
      status: 'valid',
      source_alert_id: a.source_alert_id ?? null,
      source_setup_id: a.source_setup_id ?? null,
      source_plan_id: a.source_plan_id ?? null,
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    throw new ApiError('INTERNAL', 'I could not put that mark on the chart. Please try again.', {
      detail: error?.message,
    });
  }
  return toAnnotationRow(data as Record<string, unknown>);
}

/**
 * Idempotent by (symbol, timeframe, kind, price, source). Kai marking the same
 * trigger twice must not leave two lines on the chart — the second call updates
 * the reason and returns the same row.
 */
export async function upsertAnnotation(userId: string, a: NewAnnotation): Promise<AnnotationRow | null> {
  if (!(await hasAnnotationsTable())) return null;
  const db = serviceClient();
  let q = db
    .from('chart_annotations')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('symbol', a.symbol.toUpperCase())
    .eq('timeframe', a.timeframe ?? '1d')
    .eq('kind', a.kind)
    .neq('status', 'deleted')
    .limit(1);
  if (a.price === null || a.price === undefined) q = q.is('price', null);
  else q = q.eq('price', a.price);

  const existing = await q;
  const found = ((existing.data ?? []) as Record<string, unknown>[])[0] ?? null;
  if (found) {
    const { data } = await db
      .from('chart_annotations')
      .update({
        reason: a.reason ?? (found.reason as string) ?? null,
        text: a.text ?? (found.text as string) ?? null,
        status: 'valid',
        source_alert_id: a.source_alert_id ?? (found.source_alert_id as string) ?? null,
        source_setup_id: a.source_setup_id ?? (found.source_setup_id as string) ?? null,
        source_plan_id: a.source_plan_id ?? (found.source_plan_id as string) ?? null,
      })
      .eq('id', String(found.id))
      .eq('user_id', userId)
      .select(COLUMNS)
      .single();
    return data ? toAnnotationRow(data as Record<string, unknown>) : toAnnotationRow(found);
  }
  try {
    return await createAnnotation(userId, a);
  } catch {
    return null;
  }
}

export async function patchAnnotation(
  userId: string,
  id: string,
  patch: { status?: AnnotationStatus; text?: string | null; price?: number | null }
): Promise<AnnotationRow> {
  if (!(await hasAnnotationsTable())) throw new ApiError('NOT_FOUND', ANNOTATIONS_ABSENT_PLAIN);
  const db = serviceClient();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.text !== undefined) body.text = patch.text;
  if (patch.price !== undefined) body.price = patch.price;

  const { data, error } = await db
    .from('chart_annotations')
    .update(body)
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    throw new ApiError('INTERNAL', 'I could not change that mark. Please try again.', { detail: error.message });
  }
  if (!data) throw new ApiError('NOT_FOUND', 'I could not find that mark on the chart.');
  return toAnnotationRow(data as Record<string, unknown>);
}

/**
 * Draw the whole plan: trigger, entry, stop, invalidation and targets, each with
 * the reason it is there. This is what "I marked the trigger, entry area, stop
 * and first target on the chart" (spec §6) actually does.
 *
 * Every price comes from the setup or plan row. Nothing here can invent a level.
 */
export async function markPlanLevels(opts: {
  userId: string;
  symbol: string;
  timeframe: string;
  entry: number | null;
  stop: number | null;
  invalidation: number | null;
  targets: { price: number; label?: string }[];
  long: boolean;
  sourceAlertId?: string | null;
  sourceSetupId?: string | null;
  sourcePlanId?: string | null;
  triggerTs?: string | null;
}): Promise<AnnotationRow[]> {
  if (!(await hasAnnotationsTable())) return [];
  const out: AnnotationRow[] = [];
  const src = {
    source_alert_id: opts.sourceAlertId ?? null,
    source_setup_id: opts.sourceSetupId ?? null,
    source_plan_id: opts.sourcePlanId ?? null,
  };
  const base = { symbol: opts.symbol, timeframe: opts.timeframe, provenance: 'kai' as const, ...src };

  if (opts.entry !== null) {
    const trigger = await upsertAnnotation(opts.userId, {
      ...base,
      kind: 'trigger',
      price: opts.entry,
      ts_from: opts.triggerTs ?? null,
      text: 'Trigger',
      reason: `This is the level that makes the idea actionable. ${opts.long ? 'Above' : 'Below'} $${opts.entry} the setup is confirmed; on the other side of it there is nothing to do.`,
    });
    if (trigger) out.push(trigger);

    const entry = await upsertAnnotation(opts.userId, {
      ...base,
      kind: 'entry',
      price: opts.entry,
      text: 'Entry',
      reason: `The entry area for this plan, taken from the setup's own trigger of $${opts.entry}.`,
    });
    if (entry) out.push(entry);
  }

  if (opts.stop !== null) {
    const stop = await upsertAnnotation(opts.userId, {
      ...base,
      kind: 'stop',
      price: opts.stop,
      text: 'Stop',
      reason: `Where you get out if you are wrong. The plan risks the distance between $${opts.entry ?? '—'} and $${opts.stop} per share.`,
    });
    if (stop) out.push(stop);
  }

  const inval = opts.invalidation ?? opts.stop;
  if (inval !== null) {
    const iv = await upsertAnnotation(opts.userId, {
      ...base,
      kind: 'invalidation',
      price: inval,
      text: 'Invalidation',
      reason: `${opts.long ? 'A close below' : 'A close above'} $${inval} means the reason for the idea is gone, not just that the trade is losing.`,
    });
    if (iv) out.push(iv);
  }

  for (let i = 0; i < opts.targets.length; i++) {
    const t = opts.targets[i];
    const tgt = await upsertAnnotation(opts.userId, {
      ...base,
      kind: 'target',
      price: t.price,
      text: t.label ?? (i === 0 ? 'First target' : `Target ${i + 1}`),
      reason:
        i === 0
          ? `The first place the plan takes something off, at $${t.price}.`
          : `A later target at $${t.price}. Reaching the first one does not mean reaching this one.`,
    });
    if (tgt) out.push(tgt);
  }

  return out;
}
