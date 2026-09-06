/**
 * GET /api/v1/handles/check?handle=marcust
 *
 * "Is this username free, and if not, what else could I have?" Answered while
 * somebody is typing, so the box can go green or say why before they press
 * save.
 *
 * THIS ROUTE DECIDES NOTHING. It is a courtesy for the screen; the write is
 * checked again by `PUT /api/v1/settings`, and the last word after that is the
 * database trigger `profiles_identity_guard` (0034), which runs whether or not
 * the write came through this API at all. A member who calls the settings
 * route without asking here first gets exactly the same answer.
 *
 * SIGNED IN, deliberately. An open endpoint that says whether a username
 * exists is a way to enumerate who is in the club, one guess at a time. It is
 * still a slow leak to a member — they can already see who posts — so it is
 * rate limited: fast enough to type against, far too slow to walk a dictionary
 * through.
 *
 * `for_user` is not a parameter. The caller's own id is used, so that
 * re-checking your own username, or changing only its capitalisation, comes
 * back as free rather than as a collision with yourself.
 */
import type { NextRequest } from 'next/server';
import { HandleCheckResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { describeHandle } from '@/lib/handles';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Query = z.object({ handle: z.string().min(1).max(40) });

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  rateLimit({
    key: `handle-check:${ctx.user.id}`,
    limit: 40,
    windowMs: 60_000,
    messagePlain: 'That is a lot of usernames at once. Give it a minute.',
  });

  const q = parseQuery(req, Query);
  return ok(HandleCheckResponse.parse(await describeHandle(q.handle, ctx.user.id)));
});
