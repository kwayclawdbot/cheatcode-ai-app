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

  /**
   * A CONVERSATION ABOUT A SYMBOL IS A CONVERSATION ABOUT ITS CHART.
   *
   * THE BUG THIS FIXES, in the owner's words: "when asked to mark what's on
   * chart the chart moves but nothing happens". Asked to mark SPY, Kai replied
   * *"I have no chart data to mark or read for it"* — which is false. Twenty-one
   * levels and eight drawings resolve on SPY off stored bars; the proof harness
   * draws every one of them.
   *
   * He was not refusing. HE WAS NEVER GIVEN THE CHART. `chartCtx` in the message
   * handler is loaded from `context.chart` on the conversation row, and only the
   * Trade Portal ever wrote that block. Every conversation made through THIS
   * route — the Kai sheet on the ticker page, the sheet on a plan, the workspace
   * tabs, and the portal's own fallback when it opens without a conversation —
   * was stamped with a `sheet` and no `chart`. So `loadChartContext` returned
   * null, the chart protocol and the resolved level list were both left out of
   * the prompt, no chart command could be issued, and the last line of the
   * context told him to say he has no graded setup and invent nothing. He did
   * exactly as instructed. The chart still moved, because the camera work runs
   * on the client, so it looked like drawing that silently failed.
   *
   * THIS CHANGES NOTHING ABOUT WHAT HE MAY CLAIM. The chart block carries a
   * symbol and a timeframe, never a price — every number is still resolved
   * server-side from a real row, and a level that will not resolve is still
   * dropped rather than filled in. Nor does it grant a trade plan: `setup_id`
   * is only set when a graded setup actually exists, so an ungraded symbol gets
   * a markable chart and still gets no entry, stop or target.
   */
  const chart = sheet.symbol
    ? {
        symbol: sheet.symbol,
        timeframe: '1d',
        setup_id: body.context?.kind === 'setup' ? (body.context.id ?? null) : null,
        alert_id: body.context?.kind === 'alert' ? (body.context.id ?? null) : null,
        plan_id: null,
        trigger_ts: null,
      }
    : null;

  const { data, error } = await db
    .from('conversations')
    .insert({
      user_id: ctx.user.id,
      mode: body.mode,
      title: body.title ?? (sheet.context ? sheet.header_plain : null),
      context: { pinned, sheet: body.context ?? null, ...(chart ? { chart } : null) },
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
