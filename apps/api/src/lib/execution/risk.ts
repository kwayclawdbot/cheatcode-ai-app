/**
 * Daily risk budget and the risk checks a preview runs.
 *
 * `daily_risk_used` = today's REALISED losses + today's OPEN risk (round-3
 * brief). Open risk is qty × |entry − stop| on positions opened today, because
 * money that is still on the table is still spent from the budget: a user who
 * has three live trades each risking $50 has $150 committed even though nothing
 * has been lost yet. Counting only realised losses would let them open an
 * unlimited number of positions in the morning and discover the cap at 3pm.
 *
 * ADVISORY vs BLOCKER (02 §4, round-3 brief)
 *   blocker   — freshness, capability, entitlement, buying power, a spent daily
 *               cap in day mode, a position cap already reached. Not dismissible.
 *   advisory  — reward:risk below policy, sector exposure, a missing stop, an
 *               order placed while the market is closed. Dismissible, and it is
 *               rendered as a caution: a 58% sector exposure is NEVER "Passes".
 */
import type { AppMode, DailyRisk, RiskCheck } from '@shared/api';
import { serviceClient } from '../db';
import { marketDate } from '../market';
import { round2 } from './paper';
import type { RiskPolicyRow } from '../kai/context';

export type DailyRiskDetail = DailyRisk & {
  realized_loss: number;
  open_risk: number;
  plain: string;
};

/**
 * Today's realised losses plus open risk on positions opened today.
 *
 * 0020 ships `daily_risk_v`, which computes exactly this in SQL against the ET
 * calendar day — one round-trip, and the same numbers the database itself would
 * enforce. The TypeScript path below is the fallback for an un-migrated
 * database; both produce the same figure, and the view wins when it exists.
 */
export async function dailyRisk(userId: string, cap: number | null): Promise<DailyRiskDetail> {
  const db = serviceClient();
  const since = `${marketDate()}T00:00:00Z`;

  const view = await db
    .from('daily_risk_v')
    .select('realized_loss,open_risk,used,cap')
    .eq('user_id', userId)
    .maybeSingle();
  if (!view.error && view.data) {
    const v = view.data as Record<string, unknown>;
    const viewCap = v.cap === null || v.cap === undefined ? cap : Number(v.cap);
    const used = round2(Number(v.used ?? 0));
    return {
      cap: viewCap,
      used,
      remaining: viewCap === null ? null : round2(viewCap - used),
      currency: 'USD',
      realized_loss: round2(Number(v.realized_loss ?? 0)),
      open_risk: round2(Number(v.open_risk ?? 0)),
      plain: riskPlain(viewCap, used),
    };
  }

  const [closed, open] = await Promise.all([
    db.from('positions').select('realized_pnl,closed_at').eq('user_id', userId).gte('closed_at', since),
    db
      .from('positions')
      .select('id,qty,avg_cost,direction,opened_at,origin_plan_id')
      .eq('user_id', userId)
      .is('closed_at', null)
      .gte('opened_at', since),
  ]);

  let realizedLoss = 0;
  for (const row of closed.data ?? []) {
    const pnl = Number((row as Record<string, unknown>).realized_pnl ?? 0);
    if (Number.isFinite(pnl) && pnl < 0) realizedLoss += Math.abs(pnl);
  }

  const openRows = (open.data ?? []) as Record<string, unknown>[];
  const planIds = openRows.map((r) => String(r.origin_plan_id ?? '')).filter(Boolean);
  const stops = new Map<string, number>();
  if (planIds.length) {
    const { data } = await db.from('trade_plans').select('id,stop').in('id', planIds);
    for (const p of (data ?? []) as Record<string, unknown>[]) {
      const s = Number(p.stop);
      if (Number.isFinite(s)) stops.set(String(p.id), s);
    }
  }

  let openRisk = 0;
  for (const r of openRows) {
    const stop = stops.get(String(r.origin_plan_id ?? ''));
    if (stop === undefined) continue;
    const qty = Number(r.qty);
    const avg = Number(r.avg_cost);
    if (!Number.isFinite(qty) || !Number.isFinite(avg)) continue;
    openRisk += Math.abs(avg - stop) * qty;
  }

  const used = round2(realizedLoss + openRisk);

  return {
    cap,
    used,
    remaining: cap === null ? null : round2(cap - used),
    currency: 'USD',
    realized_loss: round2(realizedLoss),
    open_risk: round2(openRisk),
    plain: riskPlain(cap, used),
  };
}

function riskPlain(cap: number | null, used: number): string {
  if (cap === null) return `You have no daily loss limit set. $${used} of risk is committed today.`;
  const remaining = round2(cap - used);
  if (remaining <= 0) {
    return `Your daily limit of $${cap} is fully committed. Nothing new today — that is the rule you set.`;
  }
  return `$${used} of your $${cap} daily limit is committed. $${remaining} left.`;
}

/* ------------------------------------------------------------------ */
/* Check builders                                                       */
/* ------------------------------------------------------------------ */

export function okCheck(key: string, label: string, plain: string): RiskCheck {
  return { key, label, status: 'ok', plain, code: null, dismissible: false };
}

export function advisory(key: string, label: string, plain: string, code: RiskCheck['code'] = null): RiskCheck {
  return { key, label, status: 'advisory', plain, code, dismissible: true };
}

export function blocker(key: string, label: string, plain: string, code: RiskCheck['code']): RiskCheck {
  return { key, label, status: 'blocker', plain, code, dismissible: false };
}

export function unknownCheck(key: string, label: string, plain: string): RiskCheck {
  return { key, label, status: 'unknown', plain, code: null, dismissible: false };
}

/* ------------------------------------------------------------------ */
/* Exposure                                                             */
/* ------------------------------------------------------------------ */

export type ExposureInput = {
  equity: number | null;
  notional: number | null;
  sectorNotional: number;
  sector: string | null;
};

/**
 * Sector concentration AFTER this order, as a share of account value. This is
 * an advisory in every case: a concentrated book is a judgement call, not a
 * rule violation, and pretending otherwise would either block a legitimate
 * trade or — worse — render as a green "Passes" when it is 58%.
 */
export function sectorCheck(input: ExposureInput, policy: RiskPolicyRow | null): RiskCheck {
  const limit = policy?.max_sector_concentration_pct ?? null;
  if (input.equity === null || input.notional === null || !input.sector) {
    return unknownCheck(
      'sector_exposure',
      'Sector exposure',
      'I do not know enough about this account to work out your sector exposure yet.'
    );
  }
  const after = ((input.sectorNotional + input.notional) / input.equity) * 100;
  const pct = Math.round(after);
  if (limit !== null && after > limit) {
    return advisory(
      'sector_exposure',
      'Sector exposure',
      `This puts about ${pct}% of your account in ${input.sector}. Your own guideline is ${limit}%. That is a lot riding on one story — it is your call, but I would not call it clean.`,
      'RISK_LIMIT_CONCENTRATION'
    );
  }
  if (after >= 40) {
    return advisory(
      'sector_exposure',
      'Sector exposure',
      `This puts about ${pct}% of your account in ${input.sector}. That is concentrated. One piece of news moves most of your book.`,
      'RISK_LIMIT_CONCENTRATION'
    );
  }
  return okCheck('sector_exposure', 'Sector exposure', `About ${pct}% of your account would be in ${input.sector}.`);
}

/** Reward:risk against the user's own minimum — advisory, with hard-stop copy. */
export function rewardRiskCheck(
  rr: number | null,
  maxLoss: number | null,
  policy: RiskPolicyRow | null
): RiskCheck {
  const min = policy?.min_reward_risk ?? null;
  const lossLine = maxLoss === null ? '' : ` You can lose up to $${maxLoss} on this order if the stop executes.`;
  if (rr === null) {
    return unknownCheck(
      'reward_risk',
      'Reward against risk',
      `Without both a target and a stop I cannot work out what you are being paid to take this risk.${lossLine}`
    );
  }
  if (min !== null && rr < min) {
    return advisory(
      'reward_risk',
      'Reward against risk',
      `This pays ${rr} to 1 and your own minimum is ${min} to 1. You are risking more than the idea is offering.${lossLine}`
    );
  }
  return okCheck(
    'reward_risk',
    'Reward against risk',
    `${rr} to 1${min === null ? '' : `, above your minimum of ${min} to 1`}.${lossLine}`
  );
}

export function missingStopCheck(stop: number | null): RiskCheck {
  if (stop !== null) {
    return okCheck('stop', 'Exit is defined', `Your exit is at $${stop} and it is submitted with the order.`);
  }
  return advisory(
    'stop',
    'Exit is defined',
    'There is no stop on this one. That means there is no price at which you have already decided to be wrong — the loss is open-ended until you close it yourself.'
  );
}

export function modeLabel(mode: AppMode): string {
  return mode.replace('_', ' ');
}
