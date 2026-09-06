/**
 * GET /api/v1/moderation/queue
 *
 * Every open report, oldest first, with the words that were actually posted.
 *
 * WHY THE QUEUE HAS TO EXIST. `POST /messages/:id/report` has been writing rows
 * since round 2 and nothing has ever read them. A report route with no queue is
 * a button that files a complaint into a table nobody opens, which is worse
 * than no button: it tells a member their report was heard.
 *
 * THE BODY COMES FROM `messages_moderation`, the security-definer view 0015
 * built for exactly this and granted to nobody but the service role. That is
 * the only place a REMOVED message's original words still exist after migration
 * 0031, and it is why a moderator can still see what they are deciding about
 * after somebody else has already taken it down.
 *
 * Reads are audited. The damage an admin surface does is rarely a write (see
 * lib/admin/audit.ts), and this one shows member conversations.
 */
import type { NextRequest } from 'next/server';
import { MODERATION_MIN_ROLE, ModerationQueueResponse } from '@shared/api';
import { ok, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { agePlain } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

const PAGE = 100;

export const GET = staffed(
  async (_req: NextRequest, ctx: StaffCtx) => {
    const db = serviceClient();

    const { data, error } = await db
      .from('reports')
      .select('id,message_id,room_id,reason,reporter_id,created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(PAGE);
    if (error) {
      // An empty queue and an unreadable one are different facts and must not
      // look the same. This is the second one, and it says so.
      throw new ApiError('INTERNAL', 'We could not read the moderation queue. Nothing has been cleared.', {
        detail: error.message,
      });
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const messageIds = rows.map((r) => r.message_id).filter((v): v is string => typeof v === 'string');

    const messages = messageIds.length
      ? await db
          .from('messages_moderation')
          .select('id,body,user_id,room_id,room_name,deleted_at')
          .in('id', messageIds)
      : { data: [] as Record<string, unknown>[] };

    const byMessage = new Map<string, Record<string, unknown>>();
    for (const m of ((messages.data ?? []) as Record<string, unknown>[])) byMessage.set(String(m.id), m);

    const people = [
      ...new Set(
        [
          ...rows.map((r) => r.reporter_id),
          ...[...byMessage.values()].map((m) => m.user_id),
        ].filter((v): v is string => typeof v === 'string')
      ),
    ];
    const names = new Map<string, string>();
    if (people.length) {
      const p = await db.from('profiles_public').select('user_id,display_name,handle').in('user_id', people);
      for (const row of ((p.data ?? []) as Record<string, unknown>[])) {
        names.set(String(row.user_id), String(row.display_name ?? row.handle ?? 'Member'));
      }
    }

    const items = rows.map((r) => {
      const messageId = typeof r.message_id === 'string' ? r.message_id : null;
      const m = messageId ? (byMessage.get(messageId) ?? null) : null;
      const authorId = m && typeof m.user_id === 'string' ? m.user_id : null;
      const reporterId = typeof r.reporter_id === 'string' ? r.reporter_id : null;
      return {
        report_id: String(r.id),
        message_id: messageId,
        room_id: (m?.room_id as string) ?? (r.room_id as string) ?? null,
        room_name: (m?.room_name as string) ?? null,
        // The retained original, removed or not. Null only when the message row
        // itself is gone, which this app never does — so a null here is a fact
        // worth seeing rather than a blank to paper over.
        body: (m?.body as string) ?? null,
        author_user_id: authorId,
        author_name: authorId ? (names.get(authorId) ?? null) : null,
        reason: String(r.reason ?? ''),
        reporter_user_id: reporterId,
        // Null reporter = the system filed it (a post that reads as advice).
        reporter_name: reporterId ? (names.get(reporterId) ?? null) : null,
        already_removed: Boolean(m?.deleted_at),
        created_at: String(r.created_at),
        age_plain: agePlain(String(r.created_at)),
      };
    });

    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'community.queue.read',
      targetKind: 'moderation_queue',
      after: { open: items.length },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      ModerationQueueResponse.parse({
        items,
        open_count: items.length,
        empty_copy: 'Nothing is waiting. No member has reported a post and nothing has tripped the advice check.',
      })
    );
  },
  { min: MODERATION_MIN_ROLE }
);
