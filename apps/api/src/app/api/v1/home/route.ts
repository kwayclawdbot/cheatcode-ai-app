/**
 * GET /api/v1/home?mode=
 *
 * The primary screen's payload: market status + freshness, the once-a-day Kai
 * briefing, the lead graded setup, what Kai is watching, and today's risk
 * budget. Anthropic failure → briefing:null + degraded:true. Never a fake
 * briefing (BUILD-BRIEF).
 */
import type { NextRequest } from 'next/server';
import { HomeQuery, HomeResponse, SETUP_CAPS, type WatchingItem } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { marketBlock, marketDate, quoteFromSnapshot } from '@/lib/market';
import { assembleContext } from '@/lib/kai/context';
import { derivedEnvelope } from '@/lib/kai/objects';
import { getOrCreateBriefing } from '@/lib/kai/briefing';

export const dynamic = 'force-dynamic';

const INVEST_NOTICE =
  'Managed Investing arrives in a later release. Everything below still works — Kai will grade and explain, and nothing touches real money.';

/** Realised losses booked today, in the user's paper accounts. */
async function riskUsedToday(userId: string): Promise<number> {
  const db = serviceClient();
  const since = `${marketDate()}T00:00:00Z`;
  const { data } = await db
    .from('positions')
    .select('realized_pnl,closed_at')
    .eq('user_id', userId)
    .gte('closed_at', since);
  let used = 0;
  for (const row of data ?? []) {
    const pnl = Number((row as Record<string, unknown>).realized_pnl ?? 0);
    if (Number.isFinite(pnl) && pnl < 0) used += Math.abs(pnl);
  }
  return Math.round(used * 100) / 100;
}

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, HomeQuery);
  const kctx = await assembleContext({ userId: ctx.user.id, mode: q.mode, cap: SETUP_CAPS[q.mode ?? 'day_trade'] });
  const mode = kctx.mode;

  const [briefingResult, used] = await Promise.all([
    getOrCreateBriefing(kctx, mode, ctx.requestId),
    riskUsedToday(ctx.user.id),
  ]);

  const lead = kctx.setups.find((s) => s.state !== 'invalidated' && s.state !== 'expired') ?? kctx.setups[0] ?? null;
  const leadEnvelope = lead ? derivedEnvelope(lead, ctx.user.id) : null;

  const watching: WatchingItem[] = kctx.setups
    .filter((s) => !lead || s.id !== lead.id)
    .map((s) => ({
      setup_id: s.id,
      symbol: s.symbol,
      grade_display: s.grade_display ?? null,
      grade_band: (s.grade_band as WatchingItem['grade_band']) ?? null,
      state: s.state as WatchingItem['state'],
      next_action:
        s.state === 'invalidated'
          ? 'Off — the level failed'
          : s.state === 'ready'
            ? 'Conditions met — your move'
            : 'Watching',
      quote: quoteFromSnapshot(s.symbol, s.quote_snapshot),
    }));

  const cap = kctx.risk?.daily_loss_cap_usd ?? null;

  return ok(
    HomeResponse.parse({
      mode,
      market: marketBlock(),
      briefing: briefingResult.briefing,
      lead_setup: leadEnvelope,
      watching,
      daily_risk: {
        cap,
        used,
        remaining: cap === null ? null : Math.round((cap - used) * 100) / 100,
        currency: 'USD',
      },
      degraded: briefingResult.degraded,
      degraded_reason: briefingResult.reason,
      invest_mode_notice: mode === 'invest' ? INVEST_NOTICE : null,
    })
  );
});
