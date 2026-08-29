/**
 * POST /api/v1/live/internal/annotations
 *
 * Persist a batch of Kai's show marks and hand back the stored rows.
 * Worker-only (`x-internal-secret`).
 *
 * THIS IS THE ANTI-INVENTION CHOKE POINT. The worker's resolver turns each
 * `[MARK:trigger]` in Kai's narration into a row here FIRST and only then into a
 * `ChartFrame`. A marker whose level cannot be traced to a setup, alert or plan
 * never reaches this endpoint, and a row this endpoint refuses to create never
 * becomes a frame — so the chart cannot show a line the database has never seen.
 *
 * `upsertAnnotation` (not `createAnnotation`) because the same trigger gets
 * marked on the daily and again on the fifteen: idempotent by
 * (symbol, timeframe, kind, price), so a re-run of a segment leaves one line,
 * not four.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AnnotationKind } from '@shared/api';
import { ok } from '@/lib/http';
import { validationError } from '@/lib/errors';
import { internalRoute } from '../../_lib/internal';
import { stageUserId } from '../../_lib/stage-user';
import { upsertAnnotation } from '@/lib/round4/annotations';
import { hasAnnotationsTable, ANNOTATIONS_ABSENT_PLAIN } from '@/lib/round4/schema-probe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  annotations: z
    .array(
      z.object({
        symbol: z.string().min(1).max(12),
        timeframe: z.string().max(8).default('1d'),
        kind: AnnotationKind,
        price: z.number().nullable().optional(),
        price2: z.number().nullable().optional(),
        ts_from: z.string().nullable().optional(),
        ts_to: z.string().nullable().optional(),
        text: z.string().max(400).nullable().optional(),
        reason: z.string().max(400).nullable().optional(),
        source_setup_id: z.string().nullable().optional(),
        source_alert_id: z.string().nullable().optional(),
      })
    )
    .min(1)
    .max(24),
});

export const POST = internalRoute(async (req: NextRequest) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues);

  if (!(await hasAnnotationsTable())) {
    // Degraded, not fatal. The show still runs; it just says its levels instead
    // of drawing them, and every marker is dropped by the resolver because no
    // row came back. Silence about a level is survivable; a drawn level with no
    // row behind it is not.
    return ok({ annotations: [], degraded: true, degraded_reason: ANNOTATIONS_ABSENT_PLAIN });
  }

  const userId = await stageUserId();
  const out = [];
  for (const a of parsed.data.annotations) {
    const row = await upsertAnnotation(userId, {
      symbol: a.symbol,
      timeframe: a.timeframe,
      kind: a.kind,
      price: a.price ?? null,
      price2: a.price2 ?? null,
      ts_from: a.ts_from ?? null,
      ts_to: a.ts_to ?? null,
      text: a.text ?? null,
      reason: a.reason ?? null,
      provenance: 'kai',
      source_setup_id: a.source_setup_id ?? null,
      source_alert_id: a.source_alert_id ?? null,
    });
    if (row) out.push(row);
  }

  return ok({ annotations: out, degraded: false, degraded_reason: null });
});
