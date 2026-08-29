/**
 * GET|POST /api/v1/admin/sync — the sources, and the "Sync now" button.
 *
 * GET reports every registered connector, whether it is configured, the exact
 * reason when it is not, and its last run. The two deferred sources answer
 * `configured: false` with a real sentence — "no read-only Stripe key", "foreign
 * database import not yet authorised" — because a source that is switched off
 * is a different thing from a feature that is missing, and only one of those
 * gets rebuilt from scratch by somebody next quarter (brief §5).
 *
 * POST runs one. `dry_run` resolves and counts everything and writes nothing
 * except its own `sync_runs` row, so "what would this do right now" is a
 * question with a recorded answer.
 *
 * `admin` and above for the run: an ingest writes to every person in the CRM.
 */
import { AdminSyncResponse, AdminSyncRunRequest, AdminSyncRunResponse } from '@shared/api';
import { ok, parseBody, staffed, type StaffCtx } from '@/lib/http';
import { writeAudit } from '@/lib/admin/audit';
import { shapeRun, sourceStates } from '@/lib/admin/sources';
import { runSync } from '@/lib/crm/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = staffed(async (_req, ctx: StaffCtx) => {
  const sources = await sourceStates();
  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'crm.sync.read',
    targetKind: 'sync',
    targetId: null,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
  const off = sources.filter((s) => !s.configured).map((s) => s.source);
  return ok(
    AdminSyncResponse.parse({
      sources,
      plain: off.length
        ? `${off.join(' and ')} are registered and switched off. The reason is on each one.`
        : 'Every source is configured.',
    })
  );
});

export const POST = staffed(
  async (req, ctx: StaffCtx) => {
    const body = await parseBody(req, AdminSyncRunRequest);
    const result = await runSync({ source: body.source, dryRun: body.dry_run, requestId: ctx.requestId });

    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'crm.sync.run',
      // A sync target is a SOURCE NAME, not a uuid, which is why `target_id` is
      // text in 0025 §7. The log does not round anything off.
      targetKind: 'sync_source',
      targetId: body.source,
      after: { dry_run: body.dry_run, state: result.state, counts: result.counts, error: result.error },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    const states = await sourceStates();
    const state = states.find((s) => s.source === body.source)!;
    const c = result.counts;

    return ok(
      AdminSyncRunResponse.parse({
        run: result.id
          ? shapeRun({
              id: result.id,
              source: result.source,
              state: result.state,
              dry_run: result.dry_run,
              started_at: result.started_at,
              finished_at: result.finished_at,
              counts: result.counts,
              error: result.error,
            })
          : null,
        source: state,
        plain:
          result.state === 'failed'
            ? `That run did not complete: ${result.error ?? 'no reason was given'}.`
            : body.dry_run
              ? `Dry run — nothing was written. It would have looked at ${c.scanned} and created ${c.created}.`
              : `Looked at ${c.scanned}, created ${c.created}, matched ${c.resolved} to people already here, left ${c.skipped} unchanged, and refused ${c.conflicted} as needing a human.`,
      })
    );
  },
  { min: 'admin' }
);
