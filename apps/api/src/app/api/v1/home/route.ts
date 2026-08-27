/**
 * GET /api/v1/home?mode=
 *
 * V5 H1: Kai's opening line (what changed and why it matters) → ONE dominant
 * priority object with ONE primary action whose label is state-driven → compact
 * "Also watching" rows → the composer. The morning briefing is still here, but
 * it lives BELOW the priority now (`briefing`), because a wall of bullets above
 * the one thing that needs you is what made this screen a dashboard instead of
 * a decision (audit §4).
 *
 * Round-2 keys (`briefing`, `lead_setup`, `watching`, `daily_risk`) are all
 * still present and still mean the same thing — this payload is a superset, so
 * a client mid-migration never breaks.
 *
 * Anthropic failure → `briefing:null` + `degraded:true`. The priority object is
 * computed from database rows, not from a model, so Home still answers "what
 * needs my attention" when Kai is offline. That is the point of deriving it.
 */
import type { NextRequest } from 'next/server';
import {
  HomeQuery,
  HomeV5Response,
  PAPER_ACCOUNT_PLAIN,
  SETUP_CAPS,
  type BriefingPayload,
  type WatchingItem,
} from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { marketBlock, quoteFromSnapshot } from '@/lib/market';
import { assembleContext } from '@/lib/kai/context';
import { derivedEnvelope } from '@/lib/kai/objects';
import { getOrCreateBriefing } from '@/lib/kai/briefing';
import { dailyRisk } from '@/lib/execution/risk';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { loadPaperAccount } from '@/lib/execution/engine';
import { alsoWatching, choosePriority } from '@/lib/v5/priority';
import { loadFollowMarks } from '@/lib/v5/attention';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

const INVEST_NOTICE =
  'Managed Investing arrives in a later release. Everything below still works — Kai will grade and explain, and nothing touches real money.';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const q = parseQuery(req, HomeQuery);
  const db = serviceClient();
  const kctx = await assembleContext({ userId: ctx.user.id, mode: q.mode, cap: SETUP_CAPS[q.mode ?? 'day_trade'] });
  const mode = kctx.mode;

  const [briefingResult, positions, account, triggered, plans] = await Promise.all([
    getOrCreateBriefing(kctx, mode, ctx.requestId),
    loadOpenPositions({ userId: ctx.user.id }),
    loadPaperAccount(ctx.user.id),
    db
      .from('alerts')
      .select('id,natural_language,refs,created_at')
      .eq('user_id', ctx.user.id)
      .eq('status', 'triggered')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('trade_plans')
      .select('id,symbol,entry_condition,stop')
      .eq('user_id', ctx.user.id)
      .eq('status', 'planned')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const [risk, marks] = await Promise.all([
    dailyRisk(ctx.user.id, kctx.risk?.daily_loss_cap_usd ?? null),
    // Which symbols/setups the user actually has something riding on. Home's
    // priority and Alerts → Attention both rank off this, so they agree.
    loadFollowMarks(ctx.user.id, positions.rows),
  ]);

  const lead = kctx.setups.find((s) => s.state !== 'invalidated' && s.state !== 'expired') ?? kctx.setups[0] ?? null;
  const leadEnvelope = lead ? derivedEnvelope(lead, ctx.user.id) : null;

  const priority = choosePriority({
    userId: ctx.user.id,
    setups: kctx.setups,
    positions: positions.rows,
    triggeredAlerts: ((triggered.data ?? []) as Record<string, unknown>[]).map((a) => {
      const refs = (a.refs as Record<string, unknown>) ?? {};
      return {
        id: String(a.id),
        symbol: typeof refs.symbol === 'string' ? refs.symbol : null,
        natural_language: (a.natural_language as string) ?? null,
        created_at: String(a.created_at),
      };
    }),
    armedPlans: ((plans.data ?? []) as Record<string, unknown>[]).map((p) => {
      const ec = (p.entry_condition as Record<string, unknown>) ?? {};
      const level = Number(ec.level ?? ec.price);
      return {
        id: String(p.id),
        symbol: String(p.symbol),
        entry: Number.isFinite(level) ? level : null,
        stop: p.stop === null || p.stop === undefined ? null : Number(p.stop),
      };
    }),
    equity: account?.equity ?? null,
    dayChange: null,
    marks,
  });

  // Round-2 `watching` stays exactly as it was.
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

  return ok(
    HomeV5Response.parse({
      mode,
      market: marketBlock(),
      opening_line: openingLine({
        name: kctx.profile.display_name,
        briefing: (briefingResult.briefing?.payload as BriefingPayload | undefined) ?? null,
        priority,
        degraded: briefingResult.degraded,
      }),
      priority,
      also_watching: alsoWatching({
        userId: ctx.user.id,
        setups: kctx.setups,
        positions: positions.rows,
        priority,
      }),
      briefing: briefingResult.briefing,
      lead_setup: leadEnvelope,
      watching,
      daily_risk: { cap: risk.cap, used: risk.used, remaining: risk.remaining, currency: 'USD' },
      paper_plain: PAPER_ACCOUNT_PLAIN,
      degraded: briefingResult.degraded || positions.degraded,
      degraded_reason: briefingResult.reason ?? positions.degraded_reason,
      invest_mode_notice: mode === 'invest' ? INVEST_NOTICE : null,
    })
  );
});

/**
 * One sentence: what changed and why it matters. It leans on the briefing's own
 * headline when Kai wrote one, and falls back to the derived priority when Kai
 * is offline — never to a cheerful greeting with nothing behind it.
 */
function openingLine(opts: {
  name: string | null;
  briefing: BriefingPayload | null;
  priority: ReturnType<typeof choosePriority>;
  degraded: boolean;
}): string {
  const who = opts.name ? `, ${opts.name}` : '';
  if (!opts.priority) {
    return opts.briefing?.headline ?? `Nothing needs you right now${who}. That is a real answer, not an empty screen.`;
  }
  if (opts.briefing?.headline && !opts.degraded) return opts.briefing.headline;
  switch (opts.priority.kind) {
    case 'position':
      return `${opts.priority.symbol} needs a decision${who}.`;
    case 'alert':
      return `Something you were watching happened${who}.`;
    case 'portfolio':
      return `Your book is steady${who} — nothing has changed enough to act on.`;
    default:
      return `One setup needs your attention${who}.`;
  }
}
