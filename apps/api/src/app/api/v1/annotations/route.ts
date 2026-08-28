/**
 * GET  /api/v1/annotations?symbol=&timeframe=&include_hidden=
 * POST /api/v1/annotations
 *
 * The user's chart marks for one symbol (spec §7). Kai's marks and the user's
 * own live in the same list and are returned together — a chart where Kai's
 * lines are a separate, uneditable layer is exactly what the spec's "Control"
 * row forbids.
 *
 * Hidden marks are excluded by default and available with `include_hidden=1`,
 * because "hidden" is a user preference about the chart, not a deletion.
 */
import type { NextRequest } from 'next/server';
import {
  AnnotationsQuery,
  AnnotationsResponse,
  AnnotationResponse,
  CreateAnnotationRequest,
} from '@shared/api';
import { authed, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { createAnnotation, listAnnotations } from '@/lib/round4/annotations';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, AnnotationsQuery);
  const symbol = q.symbol.toUpperCase();
  const result = await listAnnotations({
    userId: ctx.user.id,
    symbol,
    timeframe: q.timeframe,
    includeHidden: q.include_hidden === '1',
  });

  return ok(
    AnnotationsResponse.parse({
      symbol,
      annotations: result.annotations,
      plain: result.degraded
        ? (result.degraded_reason ?? 'No chart marks available.')
        : result.annotations.length
          ? `${result.annotations.length} mark${result.annotations.length === 1 ? '' : 's'} on the ${symbol} chart. Tap one to see why it is there — you can hide or remove any of them, including mine.`
          : `Nothing marked on the ${symbol} chart yet.`,
      degraded: result.degraded,
      degraded_reason: result.degraded_reason,
    })
  );
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateAnnotationRequest);
  const row = await createAnnotation(ctx.user.id, {
    symbol: body.symbol,
    timeframe: body.timeframe,
    kind: body.kind,
    price: body.price ?? null,
    price2: body.price2 ?? null,
    ts_from: body.ts_from ?? null,
    ts_to: body.ts_to ?? null,
    text: body.text ?? null,
    // A mark the user drew is its own reason. Kai's marks always carry one.
    reason: body.reason ?? (body.provenance === 'user' ? 'You drew this one.' : null),
    provenance: body.provenance,
    source_alert_id: body.source_alert_id ?? null,
    source_setup_id: body.source_setup_id ?? null,
    source_plan_id: body.source_plan_id ?? null,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'annotation',
    row.id,
    { event: 'annotation_created', symbol: row.symbol, kind: row.kind, provenance: row.provenance },
    ctx.requestId
  );

  return ok(
    AnnotationResponse.parse({
      annotation: row,
      plain:
        row.price === null
          ? `Marked on the ${row.symbol} chart.`
          : `Marked ${row.kind} at $${row.price} on the ${row.symbol} chart.`,
    }),
    { status: 201 }
  );
});
