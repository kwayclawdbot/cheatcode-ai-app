/**
 * POST /api/v1/community/calls   — publish a call
 * GET  /api/v1/community/calls   — one member's calls (?user_id=, default you)
 *
 * A CALL IS NOT A POST. A member may say anything they like in a room; a member
 * who publishes an entry and a stop or a target has said something that can be
 * checked against a price later, and 0038's generated `scoreable` column is
 * what decides which of those they did. This route never sets it.
 *
 * WHAT PUBLISHING DOES: writes the row, tells the followers, and returns the
 * shaped call. The resolver (`/internal/social/resolve`) does everything after
 * that — nothing here waits for a price.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CommunityCall, CreateCommunityCallBody } from '@shared/api';
import { authed, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { emitUserEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { loadAuthor, mentionFor } from '@/lib/social/authors';
import { createCall, listCalls, shapeCall } from '@/lib/social/calls';
import { fanOutToFollowers } from '@/lib/social/fanout';

export const dynamic = 'force-dynamic';

/**
 * Ten published calls an hour. Room posting is 10/min (03 Unit 1) because a
 * room is a conversation; a call is a claim that goes into somebody's permanent
 * record and onto every follower's phone, and nobody has ten of those in a
 * minute. The limit is the product saying so.
 */
const CALL_LIMIT = 10;
const CALL_WINDOW_MS = 60 * 60_000;

const Query = z.object({ user_id: z.string().optional() });

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const { user_id } = parseQuery(req, Query);
  const calls = await listCalls({
    authorId: user_id ?? ctx.user.id,
    viewerId: ctx.user.id,
  });
  return ok({ calls: calls.map((c) => CommunityCall.parse(c)) });
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateCommunityCallBody);

  rateLimit({
    key: `community-call:${ctx.user.id}`,
    limit: CALL_LIMIT,
    windowMs: CALL_WINDOW_MS,
    messagePlain: 'That is a lot of calls in an hour. Give it a while — a call is a claim, not a comment.',
  });

  const row = await createCall({
    userId: ctx.user.id,
    symbol: body.symbol,
    direction: body.direction,
    entry: body.entry ?? null,
    stop: body.stop ?? null,
    target: body.target ?? null,
    thesis: body.thesis,
    requestId: ctx.requestId,
  });

  const author = await loadAuthor(ctx.user.id, ctx.requestId);

  await emitUserEvent(
    ctx.user.id,
    'system',
    'community_call',
    row.id,
    { event: 'call_published', symbol: row.symbol, direction: row.direction, scoreable: row.scoreable },
    ctx.requestId
  );

  /**
   * THE FAN-OUT CANNOT FAIL THE PUBLISH. The call is already written; a broken
   * notification service must not turn a published call into an error the
   * member sees. Same wrapping `notify()` itself uses — see the header of
   * `lib/notify.ts`.
   */
  if (author) {
    try {
      const who = mentionFor(author);
      const verb = row.direction === 'long' ? 'went long' : 'went short';
      // The banner copy IS the inbox copy, so the sentence is written once.
      // "@kway went long NVDA at 231.40", and no entry price when there is none
      // to print rather than the word "null".
      const at = row.entry === null ? '' : ` at ${row.entry.toFixed(2)}`;
      await fanOutToFollowers({
        authorId: ctx.user.id,
        kind: 'community_call',
        titlePlain: `${who} · ${row.symbol}`,
        bodyPlain: `${who} ${verb} ${row.symbol}${at}`,
        route: `/contributor/${ctx.user.id}`,
        payload: { call_id: row.id, symbol: row.symbol, direction: row.direction },
        requestId: ctx.requestId,
      });
    } catch (e) {
      log('warn', ctx.requestId, 'social.call_fanout_threw', {
        call_id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return ok(
    {
      call: author ? CommunityCall.parse(shapeCall(row, author)) : null,
      plain: row.scoreable
        ? 'Published. It has real levels, so it will be scored when it resolves.'
        : 'Published. Without an entry and a stop or a target there is nothing to check it against, so it will not be scored.',
    },
    { status: 201 }
  );
});
