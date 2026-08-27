/**
 * GET /api/v1/notifications?group=action_required|changes|fyi
 *
 * The grouped inbox (S72). Grouping is by consequence, not by feature: what
 * needs you, what changed, and what is only information. Every row carries a
 * deep-link route so the inbox can open the thing it is about.
 */
import type { NextRequest } from 'next/server';
import { NotificationsQuery, NotificationsResponse, type NotificationRow, type NotificationGroup } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { NOTIF_GROUP, type NotifyKind } from '@/lib/notify';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, NotificationsQuery);
  const db = serviceClient();

  const { data, error } = await db
    .from('notifications')
    .select('id,kind,payload,delivery,created_at')
    .eq('user_id', ctx.user.id)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    throw new ApiError('INTERNAL', 'We could not load your inbox. Please try again.', { detail: error.message });
  }

  const rows: NotificationRow[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const payload = (r.payload as Record<string, unknown>) ?? {};
    const kind = String(r.kind);
    const group =
      (payload.group as NotificationGroup) ?? NOTIF_GROUP[kind as NotifyKind] ?? ('fyi' as NotificationGroup);
    const delivery = (r.delivery as Record<string, unknown> | null) ?? null;
    return {
      id: String(r.id),
      kind,
      group,
      title_plain: String(payload.title_plain ?? 'Something happened'),
      body_plain: String(payload.body_plain ?? ''),
      route: (payload.route as string) ?? null,
      payload,
      created_at: String(r.created_at),
      read: Boolean(delivery?.read_at),
    };
  });

  const filtered = q.group ? rows.filter((r) => r.group === q.group) : rows;

  return ok(
    NotificationsResponse.parse({
      groups: {
        action_required: filtered.filter((r) => r.group === 'action_required'),
        changes: filtered.filter((r) => r.group === 'changes'),
        fyi: filtered.filter((r) => r.group === 'fyi'),
      },
      unread_count: rows.filter((r) => !r.read).length,
      empty_copy: 'Nothing here. I only send you something when it needs you or when something actually changed.',
    })
  );
});
