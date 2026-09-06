/**
 * MODERATION — removing a post, muting a member, and the queue that says which
 * ones somebody has asked about.
 *
 * ONE SOURCE OF PERMISSION. Every function here is called from a `staffed()`
 * route, which asks `staff_role(user_id)` of the database on every single
 * request (see lib/admin/staff.ts — read its header, the reasoning is the
 * whole design). Nothing in this file re-decides who is allowed to do
 * anything, and `room_members.role = 'moderator'` — which exists, and which a
 * Circle's creator gets — grants NOTHING here. Two permission systems over one
 * set of actions is how a surface ends up open through the one nobody
 * remembered to check.
 *
 * NOTHING IS DELETED. A removal is `deleted_at` plus `deleted_by` plus a
 * reason. `messages_public` then shows the row in its place with a null body
 * (01 §14: the original is retained for the moderation audit, and after
 * migration 0031 it is retained where only the service role can read it).
 * A mute is a timestamp on the member's row, not a state anyone has to
 * remember to undo.
 *
 * EVERY ACTION WRITES TWO ROWS. `moderation_log` is the community record —
 * append-only at the grant level, so this API can write it and can never
 * rewrite it. `admin_audit_log` is the staff record, written through the one
 * writer 0025 built. They answer different questions ("what happened in this
 * room" vs "what did this employee do") and both are asked.
 */
import { ADVICE_REPORT_REASON } from '@shared/api';
import { serviceClient } from './db';
import { ApiError } from './errors';
import { log } from './log';
import { writeAudit } from './admin/audit';
import { purgePending } from './media/store';

/* ------------------------------------------------------------------ */
/* The community record                                                 */
/* ------------------------------------------------------------------ */

/** The verbs `moderation_action` allows (0001). Named so a typo is a type error. */
export type ModerationAction = 'remove' | 'restrict' | 'warn' | 'mute' | 'ban' | 'lockdown' | 'restore' | 'label';

/**
 * Append one row to `moderation_log`. Never throws: an action that succeeded
 * and failed to log is worse than one logged badly, and the same reasoning
 * `writeAudit` sets out applies here word for word.
 */
export async function logModeration(input: {
  actorId: string;
  action: ModerationAction;
  target: Record<string, unknown>;
  reason?: string | null;
  requestId?: string;
}): Promise<void> {
  try {
    const db = serviceClient();
    const { error } = await db.from('moderation_log').insert({
      actor_id: input.actorId,
      action: input.action,
      target: input.target as never,
      reason: input.reason ?? null,
    });
    if (error) {
      log('error', input.requestId ?? '-', 'moderation.log_failed', {
        action: input.action,
        message: error.message,
      });
    }
  } catch (e) {
    log('error', input.requestId ?? '-', 'moderation.log_threw', {
      action: input.action,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Removing a message                                                   */
/* ------------------------------------------------------------------ */

export type RemoveResult = {
  alreadyRemoved: boolean;
  reportsClosed: number;
  roomId: string;
  /** Comments taken down with the post. Zero when the post was itself a comment. */
  repliesRemoved: number;
  /** Files actually deleted from the bucket in this call. */
  mediaPurged: number;
};

export async function removeMessage(opts: {
  messageId: string;
  actorId: string;
  reason: string;
  requestId: string;
  ip: string | null;
}): Promise<RemoveResult> {
  const db = serviceClient();

  const found = await db
    .from('messages')
    .select('id,room_id,user_id,seq,deleted_at,parent_id,attachment_count')
    .eq('id', opts.messageId)
    .maybeSingle();
  const row = (found.data as Record<string, unknown> | null) ?? null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that message.');

  const roomId = String(row.room_id);
  const alreadyRemoved = Boolean(row.deleted_at);
  const isReply = row.parent_id != null;
  let repliesRemoved = 0;

  // Idempotent. A moderator tapping twice, or two moderators reaching the same
  // report, must not produce a second removal with a later timestamp that
  // overwrites who actually did it.
  if (!alreadyRemoved) {
    const now = new Date().toISOString();
    const { error } = await db
      .from('messages')
      .update({
        deleted_at: now,
        deleted_by: opts.actorId,
        deleted_reason: opts.reason,
      })
      .eq('id', opts.messageId)
      .is('deleted_at', null);
    if (error) {
      throw new ApiError('INTERNAL', 'We could not remove that message. Please try again.', {
        detail: error.message,
      });
    }

    /**
     * REMOVING A POST REMOVES ITS COMMENTS. This is the one part of moderation
     * where a choice had to be made, so it is written down rather than implied.
     *
     * The alternative is to leave the comments standing under a "this was
     * removed" gap. It reads fairer to the people who wrote them, and it is
     * wrong here, for one reason that outweighs the fairness: a comment quotes
     * what it answers. Half a thread about a post that had to come down
     * reconstructs the post. A removal that leaves the content legible in the
     * replies is not a removal, and a reviewer asking how objectionable
     * material is handled would be right to say so.
     *
     * What softens it: `deleted_cascade_of` names the parent on every comment
     * taken this way, so the record distinguishes "a moderator judged this" from
     * "this was standing next to something a moderator judged". Nobody's comment
     * is recorded as having been ruled against.
     *
     * A comment removed on its own merits takes nothing with it — it has no
     * children by construction, because threads are one level deep.
     */
    if (!isReply) {
      const cascade = await db
        .from('messages')
        .update({
          deleted_at: now,
          deleted_by: opts.actorId,
          deleted_reason: `Removed with the post it answered. ${opts.reason}`,
          deleted_cascade_of: opts.messageId,
        })
        .eq('parent_id', opts.messageId)
        .is('deleted_at', null)
        .select('id');
      repliesRemoved = (cascade.data ?? []).length;
    }
  }

  /**
   * AND THE PICTURES ACTUALLY GO.
   *
   * The `deleted_at` updates above have already fired the trigger from
   * migration 0033 §6, which deleted the `media_assets` rows and queued the
   * objects. Queued is not gone: deleting a row in Postgres does not delete a
   * file in the bucket, and only an HTTP call does. This is that call, made
   * here rather than left to the cron so that a reported picture stops
   * resolving in the same second the moderator taps the button.
   *
   * It is best-effort ON PURPOSE and its failure never fails the removal — the
   * queue keeps the intent and `/internal/media/purge` retries it every minute.
   * A moderator being told "that did not work" about a post that IS down would
   * be the worse outcome.
   */
  let mediaPurged = 0;
  try {
    const purge = await purgePending({ limit: 50, requestId: opts.requestId });
    mediaPurged = purge.purged;
  } catch (e) {
    log('error', opts.requestId, 'moderation.media_purge_threw', {
      message_id: opts.messageId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const reportsClosed = await closeReports({
    messageId: opts.messageId,
    actorId: opts.actorId,
    resolution: alreadyRemoved ? 'Already removed.' : `Removed. ${opts.reason}`,
  });

  await logModeration({
    actorId: opts.actorId,
    action: 'remove',
    target: {
      message_id: opts.messageId,
      room_id: roomId,
      author_user_id: row.user_id ?? null,
      replies_removed: repliesRemoved,
      // The number of files that were on this post, recorded BEFORE they were
      // deleted. The bytes are gone; the fact that there were three of them is
      // what makes the removal answerable at a support desk afterwards.
      attachments_removed: Number(row.attachment_count ?? 0),
    },
    reason: opts.reason,
    requestId: opts.requestId,
  });
  await writeAudit({
    actorUserId: opts.actorId,
    action: 'community.message.remove',
    targetKind: 'message',
    targetId: opts.messageId,
    before: { deleted: alreadyRemoved, attachments: Number(row.attachment_count ?? 0) },
    after: { deleted: true, room_id: roomId, replies_removed: repliesRemoved, media_purged: mediaPurged },
    reason: opts.reason,
    requestId: opts.requestId,
    ip: opts.ip,
  });

  return { alreadyRemoved, reportsClosed, roomId, repliesRemoved, mediaPurged };
}

/**
 * A moderator who read the reports and decided the post stays. This is a real
 * outcome, not the absence of one: without it a queue only ever grows, and the
 * next moderator re-reads everything the last one already cleared.
 */
export async function keepMessage(opts: {
  messageId: string;
  actorId: string;
  reason: string;
  requestId: string;
  ip: string | null;
}): Promise<{ reportsClosed: number }> {
  const db = serviceClient();
  const found = await db.from('messages').select('id,room_id').eq('id', opts.messageId).maybeSingle();
  const row = (found.data as Record<string, unknown> | null) ?? null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that message.');

  const reportsClosed = await closeReports({
    messageId: opts.messageId,
    actorId: opts.actorId,
    resolution: `Left up. ${opts.reason}`,
  });

  // 'label' is the enum's verb for "a moderator looked and made a note". There
  // is no 'dismiss', and inventing one would need an enum change for a decision
  // the vocabulary already covers.
  await logModeration({
    actorId: opts.actorId,
    action: 'label',
    target: { message_id: opts.messageId, room_id: String(row.room_id), outcome: 'kept' },
    reason: opts.reason,
    requestId: opts.requestId,
  });
  await writeAudit({
    actorUserId: opts.actorId,
    action: 'community.message.keep',
    targetKind: 'message',
    targetId: opts.messageId,
    after: { reports_closed: reportsClosed },
    reason: opts.reason,
    requestId: opts.requestId,
    ip: opts.ip,
  });

  return { reportsClosed };
}

async function closeReports(opts: {
  messageId: string;
  actorId: string;
  resolution: string;
}): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db
    .from('reports')
    .update({
      status: 'resolved',
      resolution: opts.resolution.slice(0, 500),
      resolved_by: opts.actorId,
      resolved_at: new Date().toISOString(),
    })
    .eq('message_id', opts.messageId)
    .eq('status', 'open')
    .select('id');
  if (error) {
    // The moderation act itself has already happened. Failing the request now
    // would tell the moderator nothing was done when something was.
    log('error', '-', 'moderation.close_reports_failed', { message: error.message });
    return 0;
  }
  return (data ?? []).length;
}

/* ------------------------------------------------------------------ */
/* Muting a member                                                      */
/* ------------------------------------------------------------------ */

/** A mute with no length named. Long enough to cool a room, short enough to forget. */
export const DEFAULT_MUTE_MINUTES = 24 * 60;

export async function moderateMember(opts: {
  roomId: string;
  userId: string;
  actorId: string;
  action: 'mute' | 'unmute';
  minutes?: number;
  reason: string;
  requestId: string;
  ip: string | null;
}): Promise<{ mutedUntil: string | null; memberName: string | null }> {
  const db = serviceClient();

  const room = await db.from('rooms').select('id,name').eq('id', opts.roomId).maybeSingle();
  if (!room.data) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const member = await db
    .from('room_members')
    .select('user_id,moderation_muted_until')
    .eq('room_id', opts.roomId)
    .eq('user_id', opts.userId)
    .maybeSingle();
  if (!member.data) {
    throw new ApiError('NOT_FOUND', 'That person is not in this room, so there is nothing to mute.');
  }

  const until =
    opts.action === 'mute'
      ? new Date(Date.now() + (opts.minutes ?? DEFAULT_MUTE_MINUTES) * 60_000).toISOString()
      : null;

  const { error } = await db
    .from('room_members')
    .update({
      // The MODERATION column, never `muted_until`. That one is the member's own
      // notification switch and 0018 keeps the two apart precisely so a member
      // un-muting themselves cannot lift a moderator's decision.
      moderation_muted_until: until,
      moderation_muted_by: opts.action === 'mute' ? opts.actorId : null,
      moderation_muted_reason: opts.action === 'mute' ? opts.reason : null,
    })
    .eq('room_id', opts.roomId)
    .eq('user_id', opts.userId);
  if (error) {
    throw new ApiError('INTERNAL', 'We could not change that. Please try again.', { detail: error.message });
  }

  const profile = await db
    .from('profiles_public')
    .select('display_name,handle')
    .eq('user_id', opts.userId)
    .maybeSingle();
  const p = (profile.data as Record<string, unknown> | null) ?? null;
  const memberName = (p?.display_name as string) ?? (p?.handle as string) ?? null;

  await logModeration({
    actorId: opts.actorId,
    action: opts.action === 'mute' ? 'mute' : 'restore',
    target: { room_id: opts.roomId, user_id: opts.userId, until },
    reason: opts.reason,
    requestId: opts.requestId,
  });
  await writeAudit({
    actorUserId: opts.actorId,
    action: opts.action === 'mute' ? 'community.member.mute' : 'community.member.unmute',
    targetKind: 'room_member',
    targetId: `${opts.roomId}:${opts.userId}`,
    before: { moderation_muted_until: (member.data as Record<string, unknown>).moderation_muted_until ?? null },
    after: { moderation_muted_until: until },
    reason: opts.reason,
    requestId: opts.requestId,
    ip: opts.ip,
  });

  return { mutedUntil: until, memberName };
}

/* ------------------------------------------------------------------ */
/* Posts that read as advice                                            */
/* ------------------------------------------------------------------ */

/**
 * A DETERMINISTIC TRIPWIRE, NOT A JUDGEMENT — AND NOT A MODEL CALL.
 *
 * People in this room are talking about money, and the difference between
 * "I am long NVDA above 118 and here is why" and "buy NVDA now, guaranteed" is
 * the difference between a community and a liability. The second one is not
 * something this app is qualified to adjudicate, so it does not try:
 *
 *   - NOTHING IS BLOCKED. The post goes up. A filter that silently eats posts
 *     teaches people to write around it, and it would be wrong often.
 *   - The message is stamped `flags.advice_shaped = true`.
 *   - A report is filed with no reporter, so it lands in the same human queue a
 *     member's report lands in, and a person decides.
 *   - The poster is told, in one sentence, what the room is for.
 *
 * WHY NOT ASK KAI. Two reasons, and only one of them is today's outage: a
 * classifier in the posting path makes every post wait on a model, and a model
 * that is down (HTTP 400, no credit, right now) would either block the room or
 * fail open and flag nothing. This runs on the phone's own words in under a
 * millisecond and behaves identically whether or not there is credit in the
 * account.
 *
 * THIS IS NOT A POLICY. It is a queue-filler. What the club actually permits is
 * the owner's to write down; this only makes sure a human sees the posts most
 * likely to need the ruling.
 */
const ADVICE_PATTERNS: { re: RegExp; note: string }[] = [
  // A direct instruction aimed at the reader, about a specific instrument.
  { re: /\b(buy|sell|short|load\s*up|get\s+in|get\s+out|dump|all\s*in)\b[^.!?]{0,40}\$?[A-Z]{1,5}\b/i, note: 'instruction' },
  { re: /\byou\s+(should|need\s+to|have\s+to|gotta|must)\s+(buy|sell|short|hold|add|sell\s+it)\b/i, note: 'instruction' },
  // A promise about an outcome.
  { re: /\b(guaranteed|can'?t\s+lose|no\s+risk|risk[-\s]?free|sure\s+thing|easy\s+money|free\s+money)\b/i, note: 'promise' },
  { re: /\b(will|going\s+to)\s+(double|triple|10x|moon|rip|explode)\b/i, note: 'promise' },
  // Somebody else's money.
  { re: /\b(put|throw|dump)\s+(your|ur|everything|it\s+all)\b/i, note: 'promise' },
];

export type AdviceCheck = { flagged: boolean; notes: string[] };

export function adviceCheck(body: string | null | undefined): AdviceCheck {
  const text = (body ?? '').trim();
  if (!text) return { flagged: false, notes: [] };
  const notes: string[] = [];
  for (const p of ADVICE_PATTERNS) {
    if (p.re.test(text) && !notes.includes(p.note)) notes.push(p.note);
  }
  return { flagged: notes.length > 0, notes };
}

/**
 * Stamp the message and file the system report. Never throws — a tripwire that
 * can fail somebody's post is worse than one that occasionally misses.
 */
export async function flagAdviceShaped(opts: {
  messageId: string;
  roomId: string;
  notes: string[];
  requestId: string;
}): Promise<void> {
  try {
    const db = serviceClient();
    await db
      .from('messages')
      .update({ flags: { advice_shaped: true, advice_notes: opts.notes } as never })
      .eq('id', opts.messageId);
    await db.from('reports').insert({
      reporter_id: null,
      message_id: opts.messageId,
      room_id: opts.roomId,
      reason: ADVICE_REPORT_REASON,
      status: 'open',
    });
  } catch (e) {
    log('warn', opts.requestId, 'moderation.advice_flag_failed', {
      message_id: opts.messageId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/* ------------------------------------------------------------------ */
/* The queue                                                            */
/* ------------------------------------------------------------------ */

export function agePlain(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}
