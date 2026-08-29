/**
 * Reading a show, and the gate in front of it.
 *
 * THE GATE IS ASKED TWICE AND THAT IS ON PURPOSE (see 0023's header). RLS makes
 * a market-mode show invisible to a free user's own JWT; this module makes the
 * API answer ENTITLEMENT_REQUIRED with the tier, the price and the upgrade link
 * (02 §11) instead of an empty timeline. A paywall that renders as "the show
 * appears to be broken" sells nothing and reads as a bug report.
 *
 * The service role bypasses RLS, so every function here checks the entitlement
 * EXPLICITLY before it reads. There is no path in this file that returns a
 * market-mode frame without `loadEntitlements()` having said premium first.
 */
import { serviceClient, isMissingObject } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { entitlementRequired, loadEntitlements } from '@/lib/entitlements';
import { log } from '@/lib/log';
import {
  LiveFrame,
  LiveSegment,
  LiveShow,
  type LiveMode,
} from '@shared/live';

const SHOW_COLUMNS = 'id,mode,status,title,started_at,ended_at,meta';
const SEGMENT_COLUMNS =
  'id,show_id,seq,symbol,source,state,prepared_at,started_at,ended_at,cost_usd,meta';
const FRAME_COLUMNS = 'show_id,segment_id,seq,kind,payload,t_offset_ms';

export const SHOWS_ABSENT_PLAIN =
  'Kai Live is not switched on for this environment yet.';

export type ShowRow = ReturnType<typeof toShow>;

function toShow(row: Record<string, unknown>) {
  return LiveShow.parse({
    id: String(row.id),
    mode: String(row.mode),
    status: String(row.status),
    title: (row.title as string) ?? null,
    started_at: (row.started_at as string) ?? null,
    ended_at: (row.ended_at as string) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? null,
  });
}

export function toSegment(row: Record<string, unknown>) {
  return LiveSegment.parse({
    id: String(row.id),
    show_id: String(row.show_id),
    seq: Number(row.seq),
    symbol: String(row.symbol),
    source: String(row.source),
    state: String(row.state),
    prepared_at: (row.prepared_at as string) ?? null,
    started_at: (row.started_at as string) ?? null,
    ended_at: (row.ended_at as string) ?? null,
    cost_usd: row.cost_usd === null || row.cost_usd === undefined ? null : Number(row.cost_usd),
    meta: (row.meta as Record<string, unknown>) ?? null,
  });
}

/**
 * A stored frame back into a `LiveFrame`.
 *
 * The payload IS the frame — it was written by the worker from the same schema
 * this parses with. Parsing rather than casting is what makes a contract change
 * that forgot to migrate the writer show up here as a loud failure on one frame
 * rather than as a client that quietly renders nothing.
 */
export function toFrame(row: Record<string, unknown>): unknown {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const parsed = LiveFrame.safeParse(payload);
  if (parsed.success) return parsed.data;
  log('warn', '-', 'live.frame_unparseable', { seq: row.seq, kind: row.kind });
  return null;
}

/** The entitlement question, asked once per request. */
export async function assertMayWatch(userId: string, mode: LiveMode): Promise<void> {
  if (mode === 'review') return;
  const ent = await loadEntitlements(userId);
  if (ent.tier !== 'premium') {
    throw entitlementRequired(
      'The live show during market hours is part of Premium. The after-hours review is free — it goes up on YouTube every evening.'
    );
  }
}

function absent(err: { code?: string; message?: string } | null): boolean {
  return isMissingObject(err);
}

/** The show currently on air, or the most recent one that ended. */
export async function currentShow(mode?: LiveMode): Promise<ShowRow | null> {
  const db = serviceClient();
  // A show that is on air always outranks one that ended; ask for that first
  // and fall back, rather than sorting on a status string.
  let q = db
    .from('live_shows')
    .select(SHOW_COLUMNS)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1);
  if (mode) q = q.eq('mode', mode);

  const live = await q;
  if (live.error) {
    if (absent(live.error)) throw new ApiError('NOT_FOUND', SHOWS_ABSENT_PLAIN);
    throw new ApiError('INTERNAL', 'The show could not be loaded right now.');
  }
  if (live.data?.length) return toShow(live.data[0] as Record<string, unknown>);

  let q2 = db
    .from('live_shows')
    .select(SHOW_COLUMNS)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (mode) q2 = q2.eq('mode', mode);
  const any = await q2;
  if (any.error) throw new ApiError('INTERNAL', 'The show could not be loaded right now.');
  return any.data?.length ? toShow(any.data[0] as Record<string, unknown>) : null;
}

export async function showById(id: string): Promise<ShowRow | null> {
  const { data, error } = await serviceClient()
    .from('live_shows')
    .select(SHOW_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (absent(error)) throw new ApiError('NOT_FOUND', SHOWS_ABSENT_PLAIN);
    throw new ApiError('INTERNAL', 'The show could not be loaded right now.');
  }
  return data ? toShow(data as Record<string, unknown>) : null;
}

export async function segmentsOf(showId: string) {
  const { data, error } = await serviceClient()
    .from('live_segments')
    .select(SEGMENT_COLUMNS)
    .eq('show_id', showId)
    .order('seq', { ascending: true });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toSegment);
}

/**
 * Frames after `since`, in order.
 *
 * `since = -1` means "from the beginning", which is what a late joiner asks for
 * and what a replay asks for; they are the same request, which is the point of
 * the design. `limit` exists because a two-hour show is a few thousand frames
 * and a phone on a train should be able to catch up in pages.
 */
export async function framesOf(opts: {
  showId: string;
  since?: number;
  limit?: number;
  segmentId?: string;
}): Promise<{ frames: unknown[]; cursor: number; more: boolean }> {
  const since = opts.since ?? -1;
  const limit = Math.min(opts.limit ?? 2000, 2000);
  let q = serviceClient()
    .from('live_frames')
    .select(FRAME_COLUMNS)
    .eq('show_id', opts.showId)
    .gt('seq', since)
    .order('seq', { ascending: true })
    .limit(limit + 1);
  if (opts.segmentId) q = q.eq('segment_id', opts.segmentId);

  const { data, error } = await q;
  if (error) {
    if (absent(error)) throw new ApiError('NOT_FOUND', SHOWS_ABSENT_PLAIN);
    throw new ApiError('INTERNAL', 'The show could not be loaded right now.');
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const frames = page.map(toFrame).filter((f): f is NonNullable<typeof f> => f !== null);
  const cursor = page.length ? Number(page[page.length - 1].seq) : since;
  return { frames, cursor, more };
}
