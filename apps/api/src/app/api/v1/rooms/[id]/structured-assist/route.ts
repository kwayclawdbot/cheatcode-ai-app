/**
 * POST /api/v1/rooms/:id/structured-assist   {structured_idea, body?}
 *
 * The same review as `POST /messages/:id/structured-assist`, run on a draft
 * that DOES NOT EXIST YET. 08 §7 puts Kai's review before publication, and the
 * composer has nothing to point at until the member presses Post — so this is
 * the route the composer actually calls, and the message-scoped one is for
 * reworking something already in the room.
 *
 * NOTHING IS WRITTEN. Not a message, not a draft row, nothing. The response
 * carries `published:false` as a literal and the member's own fields come back
 * untouched in `original`, so keeping their version costs them nothing.
 *
 * The draft is the member's own words, but it still enters the prompt inside
 * the untrusted-content block and the answer is still scanned before it comes
 * back — a member can be injected against just as easily as anyone else.
 */
import type { NextRequest } from 'next/server';
import { RoomStructuredAssistBody, RoomStructuredAssistResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { rateLimit } from '@/lib/ratelimit';
import { gapsIn, runStructuredAssist } from '@/lib/kai/assist';
import { loadMembership, requireMember, loadRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, RoomStructuredAssistBody);

  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  // Same bucket as the message-scoped route: one member, one review budget.
  rateLimit({
    key: `assist:${ctx.user.id}`,
    limit: 6,
    windowMs: 60_000,
    messagePlain: 'Give me a moment to catch up with the last one.',
  });

  const original = body.structured_idea as unknown as Record<string, unknown>;
  const draftText = (body.body ?? '').trim() || body.structured_idea.thesis;

  const result = await runStructuredAssist({
    userId: ctx.user.id,
    original,
    draftText,
    roomMode: (room.mode as string) ?? null,
    draftId: 'draft',
    requestId: ctx.requestId,
  });

  // `gaps` reads the improved draft, not the model's opinion of it: a field is
  // missing or it is not, and that is not something to have a view about.
  return ok(
    RoomStructuredAssistResponse.parse({
      ...result,
      improved_draft: result.improved,
      feedback_plain: result.plain,
      gaps: gapsIn(result.improved),
    })
  );
});
