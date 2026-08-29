/**
 * The queue: enqueue at notify time, drain on a tick.
 *
 * WHY A QUEUE AT ALL. A push is a call to somebody else's server, and the two
 * things that call it — an order filling and an alert triggering — are things
 * that must not be able to fail, slow down, or half-happen because Apple is
 * having an afternoon. So `notify()` writes rows and returns; sending is a
 * separate pass that can retry, back off and give up without any of that
 * reaching a caller who was placing a trade.
 *
 * WHAT A ROW MEANS, exactly:
 *   queued     decided to send, not yet accepted by anyone.
 *   sent       the push service ACCEPTED it. For web push this is as far as
 *              the truth ever goes — there is no receipt.
 *   delivered  Expo's receipt came back ok. Only the expo transport reaches it.
 *   failed     permanently, or out of attempts.
 *   suppressed we decided not to send, and `reason` says why. Never a drop.
 *
 * `notifications.sent_at` is set on the FIRST successful send to ANY transport
 * and stays null when everything was suppressed or failed (brief §12.3). It
 * answers "did this ever reach them", not "did it reach all of their devices" —
 * the per-device truth is these rows and belongs nowhere else.
 *
 * KNOWN GAP, stated rather than hidden: the claim below is an UPDATE with a
 * lease, not `select … for update skip locked`. Two drains racing inside the
 * lease window could both claim a row and send it twice. Locally there is one
 * drainer (single-instance guard) and hosted there is one cron, so the window
 * is not currently open; closing it properly needs an RPC, which is the schema
 * lane's to write.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { loadEntitlements } from '../entitlements';
import type { NotifyKind } from '../notify';
import { buildPayload, type PushPayload } from './payload';
import {
  PROACTIVE_KINDS,
  isProactive,
  resolveDelivery,
  startOfLocalDay,
  type PushPrefs,
  type PushSubscriptionRecord,
  type Suppression,
} from './policy';
import { sendExpo, checkReceipts } from './expo';
import { sendWeb } from './web';

/** What a transport answers. `ticketId` is null when there is nothing to check later. */
export type SendOutcome =
  | { ok: true; ticketId: string | null }
  | {
      ok: false;
      /** Worth trying again — a rate limit, a 5xx, an unreachable host. */
      retry: boolean;
      /** This token is dead. Retire it. */
      revoke: boolean;
      reason: string;
      error: string;
      retryAfterMs?: number;
    };

/** 1m, 5m, 25m, then it is over. Three attempts is a real try; ten is a pile-up. */
const BACKOFF_MS = [60_000, 300_000, 1_500_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** How long a claimed row is off limits to another drain. */
const LEASE_MS = 60_000;

/** Expo publishes receipts some minutes after the send. Asking sooner wastes a call. */
const RECEIPT_MIN_AGE_MS = 15 * 60_000;
/** After a day a receipt is never coming. Stop asking and keep the honest `sent`. */
const RECEIPT_GIVE_UP_MS = 24 * 60 * 60_000;

/** A run of failures retires a device without anybody deciding to. */
const STALE_AFTER_FAILURES = 5;

const DELIVERY_COLUMNS = 'id,notification_id,subscription_id,transport,state,attempts,ticket_id,created_at';

type Holder = { lastDrainAt: string | null };
const KEY = '__cheatcode_push_drain__';
function holder(): Holder {
  const g = globalThis as unknown as Record<string, Holder | undefined>;
  if (!g[KEY]) g[KEY] = { lastDrainAt: null };
  return g[KEY] as Holder;
}
export function lastDrainAt(): string | null {
  return holder().lastDrainAt;
}

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

export type EnqueueResult = {
  queued: number;
  suppressed: { reason: string; plain: string; subscription_id: string | null }[];
};

const NOTHING: EnqueueResult = { queued: 0, suppressed: [] };

/**
 * Decide, then write the ledger. Everything impure — the reads, the clock, the
 * inserts — is here; the decision itself is `resolveDelivery`, which cannot
 * reach any of it.
 */
export async function enqueuePush(opts: {
  notificationId: string;
  userId: string;
  kind: NotifyKind;
  requestId: string;
  trigger?: 'event' | 'test';
  now?: Date;
}): Promise<EnqueueResult> {
  const db = serviceClient();
  const now = opts.now ?? new Date();
  const requestId = opts.requestId;

  const [profileRes, prefsRes, alertPrefsRes, subsRes, ent] = await Promise.all([
    db.from('profiles').select('timezone').eq('user_id', opts.userId).maybeSingle(),
    db
      .from('notification_prefs')
      .select('push_enabled,categories,quiet_hours')
      .eq('user_id', opts.userId)
      .maybeSingle(),
    db.from('setup_alert_prefs').select('max_per_day').eq('user_id', opts.userId).maybeSingle(),
    db
      .from('push_subscriptions')
      .select('id,transport,handle,keys,state')
      .eq('user_id', opts.userId)
      .neq('state', 'revoked'),
    loadEntitlements(opts.userId),
  ]);

  const profile = (profileRes.data as { timezone?: string | null } | null) ?? null;
  const prefRow = (prefsRes.data as Record<string, unknown> | null) ?? null;
  const alertPrefs = (alertPrefsRes.data as { max_per_day?: number | null } | null) ?? null;
  const subscriptions = ((subsRes.data ?? []) as Record<string, unknown>[]).map(
    (r): PushSubscriptionRecord => ({
      id: String(r.id),
      transport: r.transport as PushSubscriptionRecord['transport'],
      handle: String(r.handle),
      keys: (r.keys as PushSubscriptionRecord['keys']) ?? null,
      state: r.state as PushSubscriptionRecord['state'],
    })
  );

  const prefs: PushPrefs = {
    // A user with no prefs row has never said no. The 0024 default is `true`
    // and the absence of a row means the same thing.
    push_enabled: prefRow ? prefRow.push_enabled !== false : true,
    categories: ((prefRow?.categories as PushPrefs['categories']) ?? {}) as PushPrefs['categories'],
    quiet_hours: (prefRow?.quiet_hours as PushPrefs['quiet_hours']) ?? null,
    max_per_day: alertPrefs?.max_per_day ?? null,
  };

  // Only ever counted for the kinds the cap applies to, and only ever counting
  // pushes that actually went out — `sent_at` is set by the drain, so a queued
  // row that never left does not spend the budget.
  let sentToday = 0;
  if (isProactive(opts.kind) && opts.trigger !== 'test') {
    const since = startOfLocalDay(now, profile?.timezone ?? null).toISOString();
    const counted = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', opts.userId)
      .in('kind', [...PROACTIVE_KINDS])
      .gte('sent_at', since);
    sentToday = counted.count ?? 0;
  }

  const decision = resolveDelivery({
    kind: opts.kind,
    user: { timezone: profile?.timezone ?? null },
    prefs,
    entitlementFlags: ent.flags,
    subscriptions,
    now,
    sentToday,
    trigger: opts.trigger ?? 'event',
  });

  const rows: Record<string, unknown>[] = [
    ...decision.send.map((s) => ({
      notification_id: opts.notificationId,
      subscription_id: s.id,
      transport: s.transport,
      state: 'queued',
      attempts: 0,
      next_attempt_at: now.toISOString(),
    })),
    ...decision.suppressed.map((s) => ({
      notification_id: opts.notificationId,
      subscription_id: s.subscription?.id ?? null,
      transport: s.transport,
      state: 'suppressed',
      reason: s.reason,
    })),
  ];

  if (rows.length) {
    const { error } = await db.from('notification_deliveries').insert(rows as never);
    if (error) {
      log('warn', requestId, 'push.enqueue_failed', { kind: opts.kind, message: error.message });
      return NOTHING;
    }
  }

  // A web row with no keys is undeliverable, not broken-forever: `stale` says
  // "the sender's opinion", and re-registering from the browser brings it back.
  const staleIds = decision.suppressed.filter((s) => s.stale && s.subscription).map((s) => s.subscription!.id);
  if (staleIds.length) {
    await db
      .from('push_subscriptions')
      .update({ state: 'stale', updated_at: now.toISOString() })
      .in('id', staleIds);
  }

  if (decision.send.length || decision.suppressed.length) {
    log('info', requestId, 'push.enqueued', {
      kind: opts.kind,
      queued: decision.send.length,
      suppressed: decision.suppressed.map((s) => s.reason),
    });
  }

  return {
    queued: decision.send.length,
    suppressed: decision.suppressed.map((s: Suppression) => ({
      reason: s.reason,
      plain: s.plain,
      subscription_id: s.subscription?.id ?? null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Drain                                                               */
/* ------------------------------------------------------------------ */

export type DrainResult = {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  receipts_checked: number;
  delivered: number;
  revoked: number;
};

const EMPTY_DRAIN: DrainResult = {
  claimed: 0,
  sent: 0,
  failed: 0,
  retried: 0,
  receipts_checked: 0,
  delivered: 0,
  revoked: 0,
};

export async function drainPush(opts: { requestId: string; limit?: number }): Promise<DrainResult> {
  const db = serviceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const limit = opts.limit ?? 100;
  const result: DrainResult = { ...EMPTY_DRAIN };
  holder().lastDrainAt = nowIso;

  // --- claim -------------------------------------------------------------
  const due = await db
    .from('notification_deliveries')
    .select('id,attempts')
    .eq('state', 'queued')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  const dueRows = (due.data ?? []) as { id: string; attempts: number }[];
  const dueIds = dueRows.map((r) => r.id);
  const attemptsById = new Map(dueRows.map((r) => [r.id, Number(r.attempts ?? 0)]));

  // The claim: push `next_attempt_at` out by a lease so a second drain passing
  // through does not pick the same rows up, and count the attempt here rather
  // than on the way out — a row that was tried and then crashed the process has
  // still been tried, and must not be retried forever.
  let claimed: Record<string, unknown>[] = [];
  for (const id of dueIds) {
    const { data } = await db
      .from('notification_deliveries')
      .update({
        attempts: (attemptsById.get(id) ?? 0) + 1,
        next_attempt_at: new Date(now.getTime() + LEASE_MS).toISOString(),
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('state', 'queued')
      .select(DELIVERY_COLUMNS)
      .maybeSingle();
    if (data) claimed.push(data as Record<string, unknown>);
  }
  result.claimed = claimed.length;

  if (claimed.length) {
    await sendClaimed(claimed, now, opts.requestId, result);
  }

  // --- receipts ----------------------------------------------------------
  await sweepReceipts(now, opts.requestId, result);

  // --- prune -------------------------------------------------------------
  const pruned = await db
    .from('push_subscriptions')
    .update({ state: 'stale', updated_at: nowIso })
    .eq('state', 'active')
    .gte('failure_count', STALE_AFTER_FAILURES)
    .select('id');
  if ((pruned.data ?? []).length) {
    log('info', opts.requestId, 'push.pruned', { count: (pruned.data ?? []).length });
  }

  return result;
}

async function sendClaimed(
  claimed: Record<string, unknown>[],
  now: Date,
  requestId: string,
  result: DrainResult
): Promise<void> {
  const db = serviceClient();
  const nowIso = now.toISOString();

  const notifIds = [...new Set(claimed.map((r) => String(r.notification_id)))];
  const subIds = [...new Set(claimed.map((r) => r.subscription_id).filter(Boolean).map(String))];

  const [notifRes, subRes] = await Promise.all([
    db.from('notifications').select('id,kind,payload,sent_at').in('id', notifIds),
    subIds.length
      ? db.from('push_subscriptions').select('id,user_id,transport,handle,keys,state,failure_count').in('id', subIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const notifs = new Map<string, Record<string, unknown>>();
  for (const n of (notifRes.data ?? []) as Record<string, unknown>[]) notifs.set(String(n.id), n);
  const subs = new Map<string, Record<string, unknown>>();
  for (const s of ((subRes.data ?? []) as Record<string, unknown>[])) subs.set(String(s.id), s);

  type Job = {
    delivery: Record<string, unknown>;
    sub: Record<string, unknown>;
    payload: PushPayload;
  };
  const expoJobs: Job[] = [];
  const webJobs: Job[] = [];

  for (const d of claimed) {
    const notif = notifs.get(String(d.notification_id));
    const sub = d.subscription_id ? subs.get(String(d.subscription_id)) : undefined;
    // The row outlived its subscription or its notification. Not a retry —
    // there is nothing left to send to.
    if (!notif || !sub || sub.state !== 'active') {
      await finalize(d, {
        state: 'failed',
        reason: !notif ? 'notification_gone' : 'subscription_gone',
        error: 'the thing this delivery pointed at is no longer there',
        nowIso,
      });
      result.failed += 1;
      continue;
    }
    const payload = buildPayload({
      id: String(notif.id),
      kind: String(notif.kind),
      payload: (notif.payload as Record<string, unknown>) ?? null,
    });
    (String(d.transport) === 'expo' ? expoJobs : webJobs).push({ delivery: d, sub, payload });
  }

  const outcomes: { job: Job; outcome: SendOutcome }[] = [];

  if (expoJobs.length) {
    const res = await sendExpo(
      expoJobs.map((j) => ({ handle: String(j.sub.handle), payload: j.payload })),
      requestId
    );
    expoJobs.forEach((job, i) => outcomes.push({ job, outcome: res[i] }));
  }

  for (const job of webJobs) {
    const outcome = await sendWeb(
      String(job.sub.handle),
      (job.sub.keys as { p256dh?: string | null; auth?: string | null } | null) ?? null,
      job.payload
    );
    outcomes.push({ job, outcome });
  }

  for (const { job, outcome } of outcomes) {
    const d = job.delivery;
    const attempts = Number(d.attempts ?? 0);

    if (outcome.ok) {
      await finalize(d, { state: 'sent', ticketId: outcome.ticketId, nowIso });
      await db
        .from('push_subscriptions')
        .update({ failure_count: 0, last_success_at: nowIso, updated_at: nowIso })
        .eq('id', String(job.sub.id));
      // First success on this notification — and only the first.
      await db
        .from('notifications')
        .update({ sent_at: nowIso })
        .eq('id', String(d.notification_id))
        .is('sent_at', null);
      result.sent += 1;
      continue;
    }

    if (outcome.revoke) {
      await db
        .from('push_subscriptions')
        .update({ state: 'revoked', updated_at: nowIso })
        .eq('id', String(job.sub.id));
      result.revoked += 1;
      await finalize(d, { state: 'failed', reason: outcome.reason, error: outcome.error, nowIso });
      result.failed += 1;
      log('info', requestId, 'push.token_revoked', {
        transport: String(d.transport),
        reason: outcome.reason,
      });
      continue;
    }

    await db
      .from('push_subscriptions')
      .update({ failure_count: Number(job.sub.failure_count ?? 0) + 1, updated_at: nowIso })
      .eq('id', String(job.sub.id));

    if (outcome.retry && attempts < MAX_ATTEMPTS) {
      // `attempts` is post-claim, so the first failure is attempt 1 → 1m.
      const step = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
      const wait = outcome.retryAfterMs ?? BACKOFF_MS[step];
      await db
        .from('notification_deliveries')
        .update({
          state: 'queued',
          reason: outcome.reason,
          error: outcome.error,
          next_attempt_at: new Date(now.getTime() + wait).toISOString(),
          updated_at: nowIso,
        })
        .eq('id', String(d.id));
      result.retried += 1;
      continue;
    }

    await finalize(d, { state: 'failed', reason: outcome.reason, error: outcome.error, nowIso });
    result.failed += 1;
  }
}

async function finalize(
  delivery: Record<string, unknown>,
  patch: { state: string; reason?: string; error?: string; ticketId?: string | null; nowIso: string }
): Promise<void> {
  const db = serviceClient();
  await db
    .from('notification_deliveries')
    .update({
      state: patch.state,
      reason: patch.reason ?? null,
      error: patch.error ?? null,
      ticket_id: patch.ticketId ?? (delivery.ticket_id as string | null) ?? null,
      next_attempt_at: null,
      updated_at: patch.nowIso,
    })
    .eq('id', String(delivery.id));
}

/**
 * `sent` → `delivered`, but only for expo and only for rows with a real ticket.
 * A dry-run send has a null ticket and never enters this sweep, which is the
 * point: there is nothing to ask about.
 */
async function sweepReceipts(now: Date, requestId: string, result: DrainResult): Promise<void> {
  const db = serviceClient();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - RECEIPT_MIN_AGE_MS).toISOString();
  const giveUp = new Date(now.getTime() - RECEIPT_GIVE_UP_MS).toISOString();

  const { data } = await db
    .from('notification_deliveries')
    .select('id,subscription_id,ticket_id,created_at')
    .eq('state', 'sent')
    .eq('transport', 'expo')
    .not('ticket_id', 'is', null)
    .is('receipt_checked_at', null)
    .lte('created_at', cutoff)
    .limit(100);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) return;

  result.receipts_checked = rows.length;
  const byTicket = new Map<string, Record<string, unknown>>();
  for (const r of rows) byTicket.set(String(r.ticket_id), r);

  const outcomes = await checkReceipts([...byTicket.keys()], requestId);

  for (const [ticket, row] of byTicket) {
    const outcome = outcomes[ticket];
    if (!outcome || outcome.state === 'pending') {
      // Still not published. Ask again next drain — unless it is old enough
      // that no receipt is coming, in which case `sent` is the final truth.
      if (String(row.created_at) <= giveUp) {
        await db
          .from('notification_deliveries')
          .update({ receipt_checked_at: nowIso, reason: 'receipt_unavailable', updated_at: nowIso })
          .eq('id', String(row.id));
      }
      continue;
    }
    if (outcome.state === 'delivered') {
      await db
        .from('notification_deliveries')
        .update({ state: 'delivered', receipt_checked_at: nowIso, updated_at: nowIso })
        .eq('id', String(row.id));
      result.delivered += 1;
      continue;
    }
    await db
      .from('notification_deliveries')
      .update({
        state: 'failed',
        reason: outcome.reason,
        error: outcome.error,
        receipt_checked_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', String(row.id));
    result.failed += 1;
    if (outcome.revoke && row.subscription_id) {
      await db
        .from('push_subscriptions')
        .update({ state: 'revoked', updated_at: nowIso })
        .eq('id', String(row.subscription_id));
      result.revoked += 1;
    }
  }
}
