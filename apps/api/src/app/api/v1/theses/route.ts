/**
 * GET /api/v1/theses?symbol=&mode=
 *
 * Active and superseded theses. A supersession carries the previous view, the
 * new evidence, why the prior read failed and whether the entry had passed
 * (02 §3, 06 §5 "thesis continuity") — the client shows the chain rather than
 * quietly replacing yesterday's opinion.
 */
import type { NextRequest } from 'next/server';
import { ThesesQuery, ThesesResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'id,symbol,mode,timeframe,setup_id,intent,summary_plain,evidence,status,superseded_by,supersession,created_at';

export const GET = authed(async (req: NextRequest, _ctx: Ctx) => {
  const q = parseQuery(req, ThesesQuery);
  const db = serviceClient();

  let query = db.from('theses').select(COLUMNS).order('created_at', { ascending: false }).limit(50);
  if (q.symbol) query = query.eq('symbol', q.symbol.toUpperCase());
  if (q.mode) query = query.eq('mode', q.mode);

  const { data, error } = await query;
  if (error) {
    throw new ApiError('INTERNAL', 'We could not load that read right now. Please try again.', {
      detail: error.message,
    });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const shape = (r: Record<string, unknown>) => ({
    id: String(r.id),
    symbol: String(r.symbol),
    mode: r.mode,
    timeframe: String(r.timeframe),
    setup_id: (r.setup_id as string) ?? null,
    intent: r.intent,
    summary_plain: String(r.summary_plain),
    evidence: (r.evidence as Record<string, unknown>) ?? null,
    status: r.status,
    superseded_by: (r.superseded_by as string) ?? null,
    supersession: (r.supersession as Record<string, unknown>) ?? null,
    created_at: String(r.created_at),
  });

  return ok(
    ThesesResponse.parse({
      active: rows.filter((r) => r.status === 'active').map(shape),
      superseded: rows.filter((r) => r.status !== 'active').map(shape),
      empty_copy: q.symbol
        ? `I do not have a working read on ${q.symbol.toUpperCase()} right now.`
        : 'I do not have a working read on anything right now.',
    })
  );
});
