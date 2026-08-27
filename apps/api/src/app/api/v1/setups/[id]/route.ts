/**
 * GET /api/v1/setups/:id?mode=
 *
 * The whole setup object behind the Setup-detail screen: three views (Live,
 * Plan, Learn), the four explanation levels, and exactly one next action.
 *
 * Every number is computed from the row, the user's risk policy and their paper
 * balance — nothing here is generated. The live quote is real (Polygon, cached
 * in `candles`); the row's own `quote_snapshot` is only a fallback, and it is
 * labeled `delayed`/`seed` rather than silently promoted.
 */
import type { NextRequest } from 'next/server';
import { SetupDetailQuery, SetupDetailResponse, type MarketQuote } from '@shared/api';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { marketBlock } from '@/lib/market';
import { getQuote, buildQuote, polygonConfigured } from '@/lib/market/polygon';
import { loadProfile, loadRiskPolicy, setupsByIds, type SetupRow } from '@/lib/kai/context';
import { gradedSetupFromRow } from '@/lib/kai/objects';
import {
  SEED_RUN_ID,
  levels,
  isLong,
  buildStepper,
  buildConfirmations,
  toEvidence,
  narration,
  sizeSuggestion,
  scenarios,
  whyPlain,
  buildQuiz,
  fitFor,
} from '@/lib/setups';

export const dynamic = 'force-dynamic';

const STATE_ACTION: Record<string, { action: string; label: string }> = {
  discovered: { action: 'ask_kai', label: 'Ask Kai about this' },
  watching: { action: 'watch', label: 'Watch it' },
  forming: { action: 'watch', label: 'Watch it' },
  ready: { action: 'watch', label: 'Watch it' },
  invalidated: { action: 'review', label: 'See what changed' },
  expired: { action: 'review', label: 'See what changed' },
};

async function paperEquity(userId: string): Promise<number | null> {
  const db = serviceClient();
  const { data } = await db
    .from('accounts')
    .select('equity,cash')
    .eq('user_id', userId)
    .eq('kind', 'paper')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  const eq = Number(row?.equity ?? row?.cash);
  return Number.isFinite(eq) ? eq : null;
}

/** Real quote first; the stored snapshot only when the market call gave nothing. */
async function quoteFor(row: SetupRow): Promise<{ quote: MarketQuote; degraded: boolean }> {
  if (polygonConfigured()) {
    const q = await getQuote(row.symbol);
    if (q.price !== null) return { quote: q, degraded: false };
  }
  const snap = (row.quote_snapshot ?? {}) as Record<string, unknown>;
  const price = Number(snap.price);
  return {
    quote: buildQuote({
      symbol: row.symbol,
      price: Number.isFinite(price) ? price : null,
      prevClose: null,
      sourceTs: typeof snap.source_ts === 'string' ? snap.source_ts : null,
      seed: true,
    }),
    degraded: true,
  };
}

export const GET = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const q = parseQuery(req, SetupDetailQuery);
  const [row] = await setupsByIds([ctx.params.id]);
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that setup. It may have expired.');

  const db = serviceClient();
  const [profile, risk, equity, quoteResult, instrument, thesis, roomRow] = await Promise.all([
    loadProfile(ctx.user.id),
    loadRiskPolicy(ctx.user.id),
    paperEquity(ctx.user.id),
    quoteFor(row),
    db.from('instruments').select('name').eq('symbol', row.symbol).maybeSingle(),
    db
      .from('theses')
      .select('id,summary_plain,status')
      .eq('setup_id', row.id)
      .eq('status', 'active')
      .maybeSingle(),
    db.from('setups').select('discussion_room_id').eq('id', row.id).maybeSingle(),
  ]);

  const mode = q.mode ?? profile.primary_mode;
  const { entry, stop, targets, rr } = levels(row);
  const long = isLong(row.intent);
  const quote = quoteResult.quote;

  const confirmations = buildConfirmations(row, quote.price);
  const size = sizeSuggestion(row, risk, equity);
  const graded = gradedSetupFromRow(row, row.catalyst);
  const sc = (row.score_components ?? {}) as Record<string, unknown>;

  const nextAction = STATE_ACTION[row.state] ?? STATE_ACTION.discovered;

  return ok(
    SetupDetailResponse.parse({
      id: row.id,
      symbol: row.symbol,
      name: ((instrument.data as Record<string, unknown> | null)?.name as string) ?? null,
      mode: row.mode,
      intent: row.intent,
      state: row.state,
      grade_band: row.grade_band,
      grade_display: row.grade_display,
      score: row.score,
      seeded: row.scanner_run_id === SEED_RUN_ID,
      source: typeof sc.source === 'string' ? sc.source : null,
      refreshed_at: typeof sc.refreshed_at === 'string' ? sc.refreshed_at : null,

      live: {
        quote,
        state: row.state,
        stepper: buildStepper(row.state as never),
        narration_plain: narration(row),
        confirmations,
      },

      plan: {
        entry,
        entry_condition: row.entry_condition,
        entry_plain:
          entry === null
            ? 'There is no trigger level on this one yet.'
            : `It becomes live ${long ? 'above' : 'below'} $${entry}${(row.entry_condition as Record<string, unknown> | null)?.hold ? ', and it has to hold there' : ''}.`,
        invalidation: row.invalidation,
        invalidation_plain:
          stop === null
            ? 'No invalidation level is defined yet, which means there is nothing to be wrong against.'
            : `The idea fails ${long ? 'below' : 'above'} $${stop}. That is the number that ends it, not a feeling.`,
        stop,
        targets,
        size_suggestion: size,
        scenarios: scenarios(row, size),
        risk_reward: rr,
        risk_reward_plain:
          rr === null
            ? 'I cannot work out reward against risk without both a target and an invalidation.'
            : `You are risking 1 to make about ${rr}.`,
        actions: [
          { action: 'watch', label: 'Watch it', enabled: true, hint: null, primary: true, route: null },
          {
            action: 'build_plan',
            label: 'Build plan',
            enabled: false,
            hint: 'Plans arrive with paper trading.',
            primary: false,
            route: null,
          },
        ],
      },

      learn: {
        why_plain: whyPlain(row),
        evidence: toEvidence(confirmations),
        similar_example: null,
        quiz: buildQuiz(row),
      },

      explain: graded.explain,
      fit: fitFor(row, risk, mode, size),
      next_action: { ...nextAction, enabled: true, hint: null, primary: true, route: null },
      thesis: thesis.data
        ? {
            id: String((thesis.data as Record<string, unknown>).id),
            summary_plain: String((thesis.data as Record<string, unknown>).summary_plain),
            status: String((thesis.data as Record<string, unknown>).status),
          }
        : null,
      discussion_room_id: ((roomRow.data as Record<string, unknown> | null)?.discussion_room_id as string) ?? null,
      market: marketBlock(new Date(), quote.freshness),
      degraded: quoteResult.degraded,
      degraded_reason: quoteResult.degraded
        ? 'This price is the last one we stored, not a live one.'
        : null,
    })
  );
});
