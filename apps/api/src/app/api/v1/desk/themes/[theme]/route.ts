/**
 * GET /api/v1/desk/themes/[theme] → the theme in depth.
 *
 * The judgement, the running argument the desk has kept since April, every
 * company it wrote up under this theme, and the companies those write-ups said
 * fit it better than what they were handed.
 */
import type { NextRequest } from 'next/server';
import { DeskThemeResponse } from '@shared/desk';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { kaiSource, loadLeads, loadPicksForTheme, loadTheme, loadThemeNote } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ theme: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { theme: string } }) => {
    const name = decodeURIComponent(ctx.params.theme);
    const src = kaiSource();
    const theme = await loadTheme(src, name);
    if (!theme) throw new ApiError('NOT_FOUND', `The desk is not tracking a theme called "${name}".`);

    const [note, picks, leads] = await Promise.all([
      loadThemeNote(src, name),
      loadPicksForTheme(src, name),
      loadLeads(src, name),
    ]);

    return ok(DeskThemeResponse.parse({
      theme,
      note,
      writtenUp: picks.map((p) => ({
        ticker: p.ticker, company: p.company, grade: p.grade,
        status: p.status, direction: p.direction, pickDate: p.pickDate,
        themeRank: p.themeRank,
        // How it actually turned out, once its horizon ran out. Null on every
        // row today; the list says so rather than showing a blank column.
        outcome: p.outcome, excessPct: p.excessPct,
      })),
      leads,
    }));
  },
);
