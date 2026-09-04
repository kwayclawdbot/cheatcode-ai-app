/**
 * GET /api/v1/desk/themes → every live theme from the most recent judging.
 *
 * Sorted on magnitude alone. Size and timing are judged separately and never
 * averaged, so a 5y+ theme outranks a "now" theme when it is bigger — marking
 * something down for being early is the failure the desk exists to avoid.
 */
import type { NextRequest } from 'next/server';
import { DeskThemesResponse } from '@shared/desk';
import { authed, ok, type Ctx } from '@/lib/http';
import { kaiSource, loadThemes } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) => {
  const { asOf, themes } = await loadThemes(kaiSource());
  return ok(DeskThemesResponse.parse({ asOf, themes }));
});
