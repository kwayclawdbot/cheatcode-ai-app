/**
 * POST /api/v1/kai/conversations
 * `{mode, pinned?, context?}` → `{id, context, header_plain, context_plain, available_actions}`
 *
 * Round 3 adds `context:{kind, id?, symbol?}` — the Kai contextual sheet
 * (V5 W2 / audit §5). The context is stored on the conversation row and
 * re-read on every message, so the sheet keeps talking about the same order,
 * position, alert, setup or room for as long as it is open. The real object is
 * loaded here too, so the sheet can render its header and its pinned line
 * without a second request.
 *
 * `pinned` (round 1) still works and still means the same thing. A context of
 * kind `setup` also pins that setup, so both mechanisms agree.
 */
import type { NextRequest } from 'next/server';
import {
  ConversationsQuery,
  ConversationsResponse,
  CreateContextConversationRequest,
  CreateContextConversationResponse,
} from '@shared/api';
import { authed, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { loadSheetContext } from '@/lib/kai/sheet-context';
import { CONVERSATIONS_EMPTY_COPY, loadConversations, toSummary } from '@/lib/round4/conversations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/kai/conversations?q=&limit=
 *
 * The Home drawer (round 4): PINNED first, then RECENT, each row already
 * carrying the title and a subtitle. A row is never a UUID — an untitled
 * conversation is named from what it is about (see lib/round4/conversations.ts),
 * so the drawer is readable the moment it opens.
 *
 * `q` searches the title AND the first message, because "the one where I asked
 * about volume" has no matching title at all.
 */
export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, ConversationsQuery);
  const { rows, firstText } = await loadConversations({
    userId: ctx.user.id,
    q: q.q ?? null,
    limit: q.limit ?? 40,
  });
  const summaries = rows.map((r) => toSummary(r, firstText.get(r.id) ?? null));

  return ok(
    ConversationsResponse.parse({
      pinned: summaries.filter((s) => s.pinned),
      recent: summaries.filter((s) => !s.pinned),
      q: q.q ?? null,
      total: summaries.length,
      empty_copy: q.q ? `Nothing matches "${q.q}".` : CONVERSATIONS_EMPTY_COPY,
      new_conversation_label: 'New conversation',
      search_placeholder: 'Search conversations',
    })
  );
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateContextConversationRequest);
  const db = serviceClient();

  const sheet = await loadSheetContext(ctx.user.id, body.context);

  // A context we could not resolve is not a fatal error — the sheet still opens
  // and Kai answers generally — but it must be reported, not silently dropped.
  const unresolved = Boolean(body.context) && sheet.context === null;

  const pinned = { ...(body.pinned ?? {}) };
  if (body.context?.kind === 'setup' && body.context.id) {
    pinned.setup_ids = [...new Set([...(pinned.setup_ids ?? []), body.context.id])];
  }
  if (sheet.symbol) {
    pinned.symbols = [...new Set([...(pinned.symbols ?? []), sheet.symbol])];
  }

  const { data, error } = await db
    .from('conversations')
    .insert({
      user_id: ctx.user.id,
      mode: body.mode,
      title: body.title ?? (sheet.context ? sheet.header_plain : null),
      context: { pinned, sheet: body.context ?? null },
    })
    .select('id,mode,created_at')
    .single();

  if (error || !data) {
    throw new ApiError('INTERNAL', 'We could not start that conversation. Please try again.', {
      detail: error?.message,
    });
  }

  const row = data as unknown as { id: string; mode: string; created_at: string };
  return ok(
    CreateContextConversationResponse.parse({
      id: row.id,
      mode: row.mode,
      created_at: row.created_at,
      context: sheet.context,
      header_plain: sheet.header_plain,
      context_plain: sheet.context_plain,
      available_actions: sheet.available_actions,
      degraded: unresolved,
      degraded_reason: unresolved
        ? 'I could not find the thing this was opened over, so I am answering generally rather than about it.'
        : null,
    }),
    { status: 201 }
  );
});
