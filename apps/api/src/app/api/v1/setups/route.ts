/**
 * GET /api/v1/setups?mode=&state=
 *
 * Ranked score-desc, capped 5 day / 3 swing (03 Unit 2). Each card carries
 * grade_display, state, risk, fit and exactly one next action (07 §1).
 * Freshness comes from the row's own quote_snapshot — never upgraded.
 */
import type { NextRequest } from 'next/server';
import { SetupsQuery, SetupsResponse, SETUP_CAPS, type SetupCard } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { marketBlock, quoteFromSnapshot } from '@/lib/market';
import {
  loadProfile,
  loadRiskPolicy,
  rankedSetups,
  entryPrice,
  invalidationPrice,
  normalizeTargets,
  type SetupRow,
  type RiskPolicyRow,
} from '@/lib/kai/context';

export const dynamic = 'force-dynamic';

const SEED_RUN_ID = '00000000-0000-0000-0000-000000000000';

const STATE_ACTION: Record<string, { label: string; action: SetupCard['next_action']['action'] }> = {
  discovered: { label: 'Ask Kai', action: 'ask_kai' },
  watching: { label: 'Open setup', action: 'open_setup' },
  forming: { label: 'Open setup', action: 'open_setup' },
  ready: { label: 'Open setup', action: 'open_setup' },
  invalidated: { label: 'Review', action: 'review' },
  expired: { label: 'Review', action: 'review' },
};

export function toCard(row: SetupRow, risk: RiskPolicyRow | null, userMode: string): SetupCard {
  const quote = quoteFromSnapshot(row.symbol, row.quote_snapshot);
  const entry = entryPrice(row.entry_condition);
  const stop = row.stop ?? invalidationPrice(row.invalidation);
  const targets = normalizeTargets(row.targets);
  const long = row.intent === 'buy_to_open' || row.intent === 'buy_to_cover';
  const perShare = entry !== null && stop !== null ? Math.round(Math.abs(entry - stop) * 100) / 100 : null;

  const rr =
    entry !== null && stop !== null && targets.length
      ? Math.abs(targets[0].price - entry) / Math.max(0.0001, Math.abs(entry - stop))
      : null;
  const minRR = risk?.min_reward_risk ?? null;
  const withinPolicy = rr === null || minRR === null ? true : rr >= minRR;

  const action = STATE_ACTION[row.state] ?? { label: 'Ask Kai', action: 'ask_kai' as const };

  return {
    id: row.id,
    symbol: row.symbol,
    mode: row.mode,
    intent: row.intent as SetupCard['intent'],
    state: row.state as SetupCard['state'],
    grade_band: (row.grade_band as SetupCard['grade_band']) ?? null,
    grade_display: row.grade_display ?? null,
    score: row.score ?? null,
    thesis_plain: row.thesis_plain ?? null,
    entry,
    stop,
    targets,
    risk: {
      est_risk_usd: perShare,
      plain:
        stop !== null
          ? `It fails ${long ? 'below' : 'above'} $${stop}${perShare !== null ? ` — about $${perShare} a share if you are wrong` : ''}.`
          : 'No invalidation level on this one yet.',
    },
    fit: {
      matches_mode: row.mode === userMode,
      within_risk_policy: withinPolicy,
      plain: withinPolicy
        ? `Fits your ${String(userMode).replace('_', ' ')} rules.`
        : `Below your minimum reward-to-risk of ${minRR}. Kai will not push this one.`,
    },
    next_action: action,
    quote,
    seeded: row.scanner_run_id === SEED_RUN_ID,
  };
}

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, SetupsQuery);
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;
  const cap = SETUP_CAPS[mode];

  const [risk, rows] = await Promise.all([loadRiskPolicy(ctx.user.id), rankedSetups(mode, cap, q.state)]);

  return ok(
    SetupsResponse.parse({
      mode,
      cap,
      setups: rows.map((r) => toCard(r, risk, mode)),
      market: marketBlock(),
    })
  );
});
