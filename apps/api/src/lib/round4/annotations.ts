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
import { indicatorLabel, indicatorRefusal, looksLikeIndicator, parseIndicator, withDefaults } from '@shared/indicators';
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
  // The three shape kinds LIVE-1 added. They carry no financial meaning of
  // their own — a trendline is a trendline whether it is drawn under support or
  // over resistance — so they map to the neutral `level` semantic and the
  // client colours them as market information, not as risk or as a target.
  trendline: 'level',
  box: 'level',
  vertical: 'level',
  // Shapes assert no financial meaning of their own; the level they were built
  // from already carries it.
  circle: 'level',
  arrow: 'level',
  // An overlay is market information about the whole window, never a risk and
  // never a target. The client gives it its own muted colour off this.
  indicator: 'level',
  // A zone takes its meaning from which side of price it lands on, exactly as a
  // level does, so it is neutral here and coloured on the client.
  zone: 'level',
};

/**
 * THE REPAIR, AND IT RUNS ON EVERY READ.
 *
 * Rows written before overlays existed say `kind: 'support'` (or `resistance`,
 * whichever side of price the average happened to be on) and `text: 'Ema21'`.
 * They are on real conversations, on real charts, right now — the wall of
 * horizontal lines the owner reported IS those rows. Rewriting them in place
 * would mean a data migration whose blast radius is every chart in the product
 * and whose only signal that it was wrong would arrive after the fact, so
 * nothing is rewritten: the label is re-read on the way out.
 *
 * IT IS ALSO DEFENCE IN DEPTH GOING FORWARD. Any caller that writes an
 * indicator-shaped label through the level path — a stale client, a worker that
 * has not been redeployed, `markPlanLevels` if someone ever gives a plan leg an
 * average for a name — comes back out as an overlay. There is no route through
 * this module by which a moving average reaches a chart as a horizontal rule.
 *
 * A LABEL THAT MATCHES BUT WILL NOT PARSE STILL STOPS BEING A LINE. If the
 * pattern says "indicator" and the parser cannot say which one, the row is left
 * as a `note` — Kai's own commentary, drawn as an anchored dot rather than a
 * rule across the plot. Refusing to draw the wrong thing beats drawing it.
 */
function repairIndicator(kind: AnnotationKind, text: string | null): {
  kind: AnnotationKind;
  text: string | null;
  indicator: AnnotationRow['indicator'];
  period: AnnotationRow['period'];
  mult: AnnotationRow['mult'];
} {
  // Shapes and notes are left exactly as they are: a trendline through two real
  // bars is already a curve, and a box named after an average is a band, not a line.
  const isLevelLike =
    kind === 'support' || kind === 'resistance' || kind === 'trigger' ||
    kind === 'entry' || kind === 'stop' || kind === 'invalidation' || kind === 'target';

  if (kind !== 'indicator' && !(isLevelLike && looksLikeIndicator(text))) {
    return { kind, text, indicator: null, period: null, mult: null };
  }
  const spec = parseIndicator(text);
  // Nothing computable behind the label, so it becomes a note: an anchored dot,
  // never a rule across the plot. Refusing to draw the wrong thing beats
  // drawing it.
  if (!spec) return { kind: 'note', text, indicator: null, period: null, mult: null };
  // A PANEL INDICATOR STORED AS A DRAWING IS ALSO A NOTE. Somebody may have
  // saved a row labelled "RSI 14" before the registry knew RSI cannot share the
  // price axis; drawing it now would put a 0-to-100 number on a dollar scale.
  const full = withDefaults(spec);
  if (indicatorRefusal(full)) return { kind: 'note', text, indicator: null, period: null, mult: null };
  return {
    kind: 'indicator',
    // Re-labelled from the parse, so `Ema21` and `21 ema` both come back as the
    // one string the chip, the rail and the price tag all show.
    text: indicatorLabel(full),
    indicator: full.indicator,
    period: full.period,
    mult: full.mult ?? null,
  };
}

export function toAnnotationRow(row: Record<string, unknown>): AnnotationRow {
  const stored = String(row.kind) as AnnotationKind;
  const fixed = repairIndicator(stored, (row.text as string) ?? null);
  const kind = fixed.kind;
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    timeframe: String(row.timeframe ?? '1d'),
    kind,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    price2: row.price2 === null || row.price2 === undefined ? null : Number(row.price2),
    ts_from: (row.ts_from as string) ?? null,
    ts_to: (row.ts_to as string) ?? null,
    text: fixed.text,
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
    indicator: fixed.indicator,
    mult: fixed.mult,
    period: fixed.period,
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
 *
 * AN OVERLAY IS IDENTIFIED BY ITS NAME, NOT BY ITS VALUE. The 21-day average has
 * a different price on every bar, so matching an indicator on `price` would
 * create a fresh row every time Kai mentioned it and the chart would accumulate
 * one curve per session — the clutter bug all over again in a new shape. So for
 * `indicator` the match is on `text` ("EMA 21") and the newest value is written
 * over the old one, which is the correct behaviour for a number that is a
 * snapshot of something moving rather than a claim about a fixed shelf.
 */
export async function upsertAnnotation(userId: string, a: NewAnnotation): Promise<AnnotationRow | null> {
  if (!(await hasAnnotationsTable())) return null;
  const db = serviceClient();
  const byName = a.kind === 'indicator';
  let q = db
    .from('chart_annotations')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('symbol', a.symbol.toUpperCase())
    .eq('timeframe', a.timeframe ?? '1d')
    .eq('kind', a.kind)
    .neq('status', 'deleted')
    .limit(1);
  if (byName) q = q.eq('text', a.text ?? '');
  else if (a.price === null || a.price === undefined) q = q.is('price', null);
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
        // Only an overlay moves. A trigger whose price changed is a different
        // trigger and gets its own row, exactly as it always has.
        ...(byName
          ? { price: a.price ?? null, price2: a.price2 ?? null, ts_from: a.ts_from ?? (found.ts_from as string) ?? null }
          : {}),
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

/**
 * An overlay that was never written down.
 *
 * THE STORE IS NOT ALLOWED TO BE THE REASON A CURVE DOES NOT APPEAR. Every other
 * annotation asserts a number that came from somewhere — a graded setup, a saved
 * plan — so if it cannot be persisted, dropping it is the honest outcome. An
 * indicator asserts nothing of the kind: it is arithmetic over the candles the
 * client already has on screen, and the client would draw exactly the same curve
 * whether a row exists for it or not. So when the table is absent, or the kind
 * constraint has not been widened on this database yet (migration 0036), the
 * frame still carries a row and the chart still draws the average. It simply
 * does not survive a reload, which is the correct amount of degradation.
 *
 * The id is DERIVED, not random, so a second mention of the same average
 * replaces the first on the client instead of stacking a second curve on it.
 */
export function ephemeralAnnotation(a: NewAnnotation & { id?: string }): AnnotationRow {
  return toAnnotationRow({
    id: a.id ?? `local:${a.symbol.toUpperCase()}:${a.timeframe ?? '1d'}:${a.kind}:${a.text ?? ''}`,
    symbol: a.symbol.toUpperCase(),
    timeframe: a.timeframe ?? '1d',
    kind: a.kind,
    price: a.price ?? null,
    price2: a.price2 ?? null,
    ts_from: a.ts_from ?? null,
    ts_to: a.ts_to ?? null,
    text: a.text ?? null,
    reason: a.reason ?? null,
    provenance: a.provenance ?? 'kai',
    status: 'valid',
    source_alert_id: a.source_alert_id ?? null,
    source_setup_id: a.source_setup_id ?? null,
    source_plan_id: a.source_plan_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: null,
  });
}

export async function patchAnnotation(
  userId: string,
  id: string,
  patch: {
    status?: AnnotationStatus;
    text?: string | null;
    price?: number | null;
    price2?: number | null;
    ts_from?: string | null;
    ts_to?: string | null;
  }
): Promise<AnnotationRow> {
  if (!(await hasAnnotationsTable())) throw new ApiError('NOT_FOUND', ANNOTATIONS_ABSENT_PLAIN);
  const db = serviceClient();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.text !== undefined) body.text = patch.text;
  if (patch.price !== undefined) body.price = patch.price;
  // Reshaping, not just moving: a trendline's far end and a zone's other edge.
  if (patch.price2 !== undefined) body.price2 = patch.price2;
  if (patch.ts_from !== undefined) body.ts_from = patch.ts_from;
  if (patch.ts_to !== undefined) body.ts_to = patch.ts_to;

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
