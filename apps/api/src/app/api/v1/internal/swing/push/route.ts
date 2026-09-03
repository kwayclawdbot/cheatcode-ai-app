/**
 * POST /api/v1/internal/swing/push
 *
 * SWING-5 PART 2 — Railway delivers straight into the app.
 *
 *   Railway `cron-morning-alerts`
 *     → Kai Supabase `sent_alerts`   (the insert, unchanged, still the record)
 *     → THIS ROUTE, the moment the insert lands
 *       → this app's `setups` → the Alerts tab
 *       → `notifications`     → the inbox, and a push where the user allows one
 *
 * WHY THIS EXISTS. The ten-minute pull works and is staying, but "works within
 * ten minutes" is not the same product as "is there when the alert fires". The
 * push closes that window to seconds without changing where the truth lives.
 *
 * IT CARRIES A MANIFEST, NOT THE DATA, AND THAT IS THE WHOLE DESIGN.
 * The body says WHICH picks were just written — ticker, alert_type, sent_at —
 * and this route then runs `ingestSwingSetups`, the very same function the cron
 * and the CLI run. So a pick is byte-identical whichever way it arrived: the
 * same v5 UUID from (ticker, ET date, alert_type), the same 180-day percentile,
 * the same band, the same `publishable()` fan-out rules, the same fingerprint
 * skip. A push that carried its own copy of the pick would be a SECOND mapping
 * and therefore a second answer to "what is this pick's score", which is the
 * bug this route is shaped to make impossible.
 *
 * ARRIVING TWICE IS A NO-OP, and it is a property of the pipe rather than of
 * this handler: the fingerprint comparison makes the second write zero rows,
 * and `publishSetups` is handed only the ids the write INSERTED and re-reads
 * `notifications` before it sends. Push, then the cron ten minutes later, then
 * the push again on a Railway restart — one setup, one notification.
 *
 * THE RECEIPT IS THE POINT OF THE MANIFEST. A 200 that means "the ingest ran"
 * tells the producer nothing; the failure this lane exists to end is a delivery
 * that silently delivers nothing. So every pick named in the body is answered
 * individually: `landed` (the row is in `setups`), `created` (this call wrote
 * it), plus its state, stop, targets and whether the card has a description —
 * and `not_in_source` when the app cannot see in `sent_alerts` the row the
 * producer says it wrote, which is the one failure a pull can never report.
 *
 * IT CANNOT BREAK THE SMS SEND, because it is not in it. The producer calls
 * this after its own insert, inside a bare `except`, with a short timeout —
 * see `_push_picks_to_app` in `kai_morning_alerts.py`.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { etDateFor, isReadableType, pickKey, setupIdFor } from '@/lib/swing/ingest';
import { ingestSwingSetups } from '@/lib/swing/run';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

/**
 * How far back the ingest reads when the manifest names picks. The earliest ET
 * date in the manifest, less this many days of slack, so a push that arrives
 * after midnight UTC or names yesterday's late alert still covers itself.
 */
const SLACK_DAYS = 2;

/** A pick the producer says it just wrote. Everything else on the wire is ignored. */
type ManifestPick = {
  ticker?: unknown;
  alert_type?: unknown;
  sent_at?: unknown;
};

type Receipt = {
  ticker: string;
  alert_type: string;
  et_date: string;
  key: string;
  setup_id: string;
  /** The app can see the row in `sent_alerts`. False means the producer and the app disagree. */
  in_source: boolean;
  /** The row exists in `setups` after this call. */
  landed: boolean;
  created: boolean;
  state: string | null;
  stop: number | null;
  targets: number;
  has_description: boolean;
  note?: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    const body = (await req.json().catch(() => null)) as
      | { source?: unknown; run_id?: unknown; picks?: unknown; alerts?: unknown }
      | null;
    if (!body) throw new ApiError('VALIDATION_FAILED', 'The push needs a JSON body.');

    const source = typeof body.source === 'string' ? body.source : 'unknown';
    const runId = typeof body.run_id === 'string' ? body.run_id : '';
    // `alerts` is the key `_mirror_alerts_to_app` has always used; `picks` reads
    // better. Both are accepted so the producer's shape is not a deploy away.
    const raw = Array.isArray(body.picks) ? body.picks : Array.isArray(body.alerts) ? body.alerts : [];
    if (!raw.length) throw new ApiError('VALIDATION_FAILED', 'The push named no picks.');
    if (raw.length > 50) throw new ApiError('VALIDATION_FAILED', 'A morning does not have 50 picks in it.');

    const manifest: { ticker: string; alert_type: string; sent_at: string }[] = [];
    const rejected: { entry: unknown; why: string }[] = [];
    for (const p of raw as ManifestPick[]) {
      const ticker = typeof p?.ticker === 'string' ? p.ticker.trim().toUpperCase() : '';
      // A ticker is interpolated into a PostgREST `in.(...)` list further down,
      // so its shape is checked here rather than trusted. The route is
      // authenticated, which is a reason to be careful with it and not a reason
      // to skip the check.
      if (ticker && !/^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(ticker)) {
        rejected.push({ entry: p, why: 'that is not a ticker' });
        continue;
      }
      const alertType = typeof p?.alert_type === 'string' ? p.alert_type.trim().toLowerCase() : '';
      const sentAt = typeof p?.sent_at === 'string' ? p.sent_at : '';
      if (!ticker || !alertType || !sentAt) { rejected.push({ entry: p, why: 'ticker, alert_type and sent_at are all required' }); continue; }
      if (Number.isNaN(new Date(sentAt).getTime())) { rejected.push({ entry: p, why: 'sent_at is not a timestamp' }); continue; }
      // A family this app does not import is not an error on the producer's
      // side — it is a decision on this one, and it is said out loud rather
      // than swallowed. `kai_short_shadow` lands here, by design.
      if (!isReadableType(alertType)) { rejected.push({ entry: p, why: `this app does not import ${alertType}` }); continue; }
      manifest.push({ ticker, alert_type: alertType, sent_at: sentAt });
    }

    if (!manifest.length) {
      log('warn', requestId, 'swing.push_nothing_ingestible', { source, run_id: runId, rejected });
      return Response.json(
        { ok: true, source, run_id: runId, received: raw.length, landed: 0, receipts: [], rejected,
          plain: 'Nothing in that push is a family this app imports.' },
        { status: 200, headers: { 'x-request-id': requestId } },
      );
    }

    const keys = new Map<string, { ticker: string; alert_type: string; et_date: string }>();
    for (const m of manifest) {
      keys.set(pickKey(m), { ticker: m.ticker, alert_type: m.alert_type, et_date: etDateFor(m.sent_at) });
    }

    const earliest = [...keys.values()].map((v) => v.et_date).sort()[0];
    const since = isoDaysBefore(earliest, SLACK_DAYS);

    // What was already here BEFORE the ingest, so `created` is a fact rather
    // than an inference from an aggregate count.
    const ids = [...keys.keys()].map(setupIdFor);
    const before = new Set((await readSetups(ids)).map((r) => r.id));

    const started = Date.now();
    const summary = await ingestSwingSetups({ since, notify: true });
    const elapsedMs = Date.now() - started;

    const after = new Map((await readSetups(ids)).map((r) => [r.id, r]));
    // Which of these picks the app can actually see in the source. A producer
    // that inserted a row the app cannot read is pointed at a different
    // database, and that is worth a loud answer rather than a quiet zero.
    const seen = await sourceHas([...keys.keys()], since);

    const receipts: Receipt[] = [...keys.entries()].map(([key, v]) => {
      const id = setupIdFor(key);
      const row = after.get(id);
      const inSource = seen.has(key);
      return {
        ticker: v.ticker,
        alert_type: v.alert_type,
        et_date: v.et_date,
        key,
        setup_id: id,
        in_source: inSource,
        landed: Boolean(row),
        created: Boolean(row) && !before.has(id),
        state: (row?.state as string) ?? null,
        stop: row?.stop == null ? null : Number(row.stop),
        targets: Array.isArray(row?.targets) ? row.targets.length : 0,
        has_description: Boolean((row?.thesis_plain as string | null)?.trim()),
        ...(row
          ? {}
          : {
            note: inSource
              ? 'in the source but not written — a record family enters the app only once it has a result'
              : 'the app cannot see this row in sent_alerts',
          }),
      };
    });

    const landed = receipts.filter((r) => r.landed).length;
    const created = receipts.filter((r) => r.created).length;
    const missingInSource = receipts.filter((r) => !r.in_source);

    log(missingInSource.length ? 'warn' : 'info', requestId, 'swing.push_run', {
      source, run_id: runId, since,
      received: raw.length, ingestible: manifest.length, landed, created,
      inserted: summary.inserted, updated: summary.updated, unchanged: summary.unchanged,
      published: summary.published?.published ?? 0,
      notified: summary.published?.notified ?? 0,
      not_in_source: missingInSource.map((r) => r.key),
      elapsed_ms: elapsedMs,
    });

    return Response.json(
      {
        ok: true,
        source,
        run_id: runId,
        since,
        received: raw.length,
        landed,
        created,
        notified: summary.published?.notified ?? 0,
        refusals: summary.published?.refusals ?? {},
        inserted: summary.inserted,
        updated: summary.updated,
        unchanged: summary.unchanged,
        receipts,
        rejected,
        elapsed_ms: elapsedMs,
        plain: created === 0
          ? `${landed} of ${manifest.length} pick(s) were already here — nothing new was written.`
          : `${created} pick(s) written, ${summary.published?.notified ?? 0} recipient(s) told.`,
      },
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The push did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'swing.push_error', {
      code: err.code, message: err.message,
      detail: e instanceof Error ? e.message : String(e),
    });
    return errorResponse(err, requestId);
  }
}

/**
 * A GET here is almost certainly a Vercel cron or a person poking the URL. The
 * push has no schedule — say so instead of running an ingest nobody asked for.
 */
export function GET(): Response {
  return Response.json(
    { ok: false, plain: 'The push is a POST with a manifest of picks. The scheduled path is /api/v1/internal/swing/ingest.' },
    { status: 405 },
  );
}

/* ------------------------------------------------------------------ */

async function readSetups(ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const { data, error } = await serviceClient()
    .from('setups')
    .select('id,state,stop,targets,thesis_plain')
    .in('id', ids);
  if (error) throw new ApiError('INTERNAL', `could not read setups back: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Which of these pick keys the app can see in the SOURCE. Read only, through
 * the same env-driven credentials the ingest uses — this route never writes to
 * the SMS product's database.
 */
async function sourceHas(keys: string[], since: string): Promise<Set<string>> {
  const { kaiSource, readAll } = await import('@/lib/swing/source');
  const tickers = [...new Set(keys.map((k) => k.split('|')[0]))];
  const rows = await readAll<{ ticker: string; alert_type: string; sent_at: string }>(
    kaiSource(),
    'sent_alerts',
    `select=ticker,alert_type,sent_at&sent_at=gte.${since}&ticker=in.(${tickers.join(',')})&order=id.asc`,
  );
  return new Set(rows.map((r) => pickKey(r as never)));
}

function isoDaysBefore(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}
