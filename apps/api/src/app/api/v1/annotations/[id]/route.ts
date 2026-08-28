/**
 * PATCH /api/v1/annotations/:id
 *
 * Hide, delete or retitle one mark (spec §7 "Control": the user can inspect,
 * edit, hide and delete EVERY Kai annotation).
 *
 * Deleting is a status change, not a row removal. The chart stops showing it;
 * the record that Kai drew it, when, and why survives — which is what makes an
 * annotation auditable rather than decorative.
 */
import type { NextRequest } from 'next/server';
import { AnnotationResponse, PatchAnnotationRequest } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { patchAnnotation } from '@/lib/round4/annotations';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export const PATCH = authedParams<{ id: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const body = await parseBody(req, PatchAnnotationRequest);
    const row = await patchAnnotation(ctx.user.id, ctx.params.id, {
      status: body.status,
      text: body.text,
      price: body.price,
    });

    await emitUserEvent(
      ctx.user.id,
      'system',
      'annotation',
      row.id,
      { event: 'annotation_updated', status: row.status, symbol: row.symbol },
      ctx.requestId
    );

    return ok(
      AnnotationResponse.parse({
        annotation: row,
        plain:
          row.status === 'deleted'
            ? 'Removed from the chart. The record of why it was there is kept.'
            : row.status === 'hidden'
              ? 'Hidden. It is still there if you want it back.'
              : 'Updated.',
      })
    );
  }
);
