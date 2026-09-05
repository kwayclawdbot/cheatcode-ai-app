/**
 * Trade plans: the object that sits between "I like this idea" and an order.
 *
 * A plan is where the numbers get decided while nothing is at stake — entry,
 * the level that says you were wrong, the target, and the size that keeps the
 * loss inside the user's own rule. The server computes the size suggestion so
 * two clients can never disagree about how much risk a plan carries.
 *
 * `exit_style` defaults from `profiles.involvement`: someone who chose "guided"
 * gets `auto` (the stop executes); someone hands-on gets `alert_assisted` (the
 * stop notifies and they close). Both are honest about what they are; neither
 * is called protection when it is not.
 */
import type {
  AppMode,
  ExitStyle,
  PlanEventRow,
  PlanRow,
  PlanStatus,
  PlainAction,
  PositionEffect,
  Scenario,
  SetupTarget,
  SizeSuggestion,
} from '@shared/api';
import { STOP_ALERT_ASSISTED_PLAIN, STOP_ATTACHES_PLAIN } from '@shared/api';
import { serviceClient } from '../db';
import { normalizeTargets, type RiskPolicyRow } from '../kai/context';
import { round2 } from './paper';

export const PLAN_COLUMNS =
  'id,user_id,setup_id,mode,status,symbol,intent,entry_condition,invalidation,stop,targets,size,scenarios,exit_style,origin,created_at,updated_at';

export function defaultExitStyle(involvement: string): ExitStyle {
  return involvement === 'guided' ? 'auto' : 'alert_assisted';
}

export function exitStylePlain(style: ExitStyle): string {
  return style === 'auto' ? STOP_ATTACHES_PLAIN : STOP_ALERT_ASSISTED_PLAIN;
}

export function isLongIntent(intent: PositionEffect): boolean {
  return intent === 'buy_to_open' || intent === 'buy_to_cover';
}

/* ------------------------------------------------------------------ */
/* Size + scenarios                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Is there a plan here at all?                                         */
/* ------------------------------------------------------------------ */

/**
 * What the server offers as a starting point for a plan — and, when it has
 * nothing, WHY, in words the screen can print.
 *
 * THE BUG THIS EXISTS TO END. This route used to compute its suggestion as
 * `entry ?? quote.price`. On a symbol with no graded setup that is the LAST
 * TRADED PRICE with the word "Entry" over it: a number nobody decided,
 * indistinguishable on a screen from a level the grading engine produced. The
 * grading engine is the whole reason this product is worth trusting, and a
 * conjured entry quietly borrows its authority.
 *
 * So the rule is the same one the Trade section already enforces, and it is
 * the whole of this function: A PLAN IS A PLAN ONLY WHEN THERE IS AN ENTRY AND
 * A LEVEL THAT SAYS IT WAS WRONG. An entry with no invalidation is not a
 * cautious plan; it is a price with a label on it. Where both are missing the
 * suggestion is empty and `no_plan_plain` says so.
 *
 * The quote is deliberately NOT a parameter. There is nothing this function
 * could correctly do with it.
 */
export function planSuggestion(
  symbol: string,
  levels: { entry: number | null; stop: number | null; targets: SetupTarget[] },
  graded: boolean
): {
  entry: number | null;
  stop: number | null;
  targets: SetupTarget[];
  has_plan: boolean;
  no_plan_plain: string | null;
} {
  const entry = levels.entry;
  const stop = levels.stop;
  const hasPlan = entry !== null && stop !== null;

  const why = hasPlan
    ? null
    : entry !== null
      ? `There is an entry on ${symbol} but no level that says the idea failed, so there is no plan here yet and nothing to size. I need to know where this is wrong before you risk anything on it.`
      : graded
        ? `${symbol} has a graded setup but no levels attached to it yet, so there is nothing to build a plan on. The last traded price is not an entry and I will not offer it as one.`
        : `I have no graded setup on ${symbol}, so I have no entry and no stop to give you. What the stock last traded at is not an entry — putting that number in an entry slot would make a guess look like a plan. Set your own levels if you want to build one anyway.`;

  return {
    entry: hasPlan ? entry : null,
    stop: hasPlan ? stop : null,
    targets: hasPlan ? levels.targets : [],
    has_plan: hasPlan,
    no_plan_plain: why,
  };
}

export function planSize(
  entry: number | null,
  stop: number | null,
  targets: SetupTarget[],
  policy: RiskPolicyRow | null,
  equity: number | null,
  requested?: number | null
): SizeSuggestion {
  if (entry === null || stop === null || entry === stop) {
    return {
      shares: requested ?? null,
      notional: requested && entry ? round2(requested * entry) : null,
      max_loss_usd: null,
      within_policy: false,
      plain:
        'Without both an entry and a level that says you were wrong, there is no risk to size against — so I will not put a number on it.',
    };
  }

  const perShare = round2(Math.abs(entry - stop));
  const cap = policy?.daily_loss_cap_usd ?? null;
  const maxPct = policy?.max_position_pct ?? null;
  const minRR = policy?.min_reward_risk ?? null;

  const byRisk = cap === null ? Infinity : Math.floor(cap / perShare);
  const byPosition = maxPct === null || equity === null ? Infinity : Math.floor((equity * (maxPct / 100)) / entry);
  const suggested = Math.max(0, Math.min(byRisk, byPosition));
  const shares = requested ?? (Number.isFinite(suggested) ? suggested : 0);

  if (shares < 1) {
    return {
      shares: 0,
      notional: 0,
      max_loss_usd: 0,
      within_policy: false,
      plain:
        cap !== null && perShare > cap
          ? `One share risks $${perShare}, which is more than your whole daily limit of $${cap}. This one is too wide for your rules today.`
          : 'Your own rules do not leave room for a position here today.',
    };
  }

  const maxLoss = round2(shares * perShare);
  const first = targets[0]?.price ?? null;
  const rr = first === null ? null : round2(Math.abs(first - entry) / perShare);
  const rrOk = rr === null || minRR === null ? true : rr >= minRR;
  const sizeOk = (cap === null || maxLoss <= cap) && (maxPct === null || equity === null || shares * entry <= equity * (maxPct / 100));

  return {
    shares,
    notional: round2(shares * entry),
    max_loss_usd: maxLoss,
    within_policy: rrOk && sizeOk,
    plain: !sizeOk
      ? `${shares} share${shares === 1 ? '' : 's'} would risk about $${maxLoss}, which is more than your own rules allow today.`
      : rrOk
        ? `${shares} share${shares === 1 ? '' : 's'} keeps the loss near $${maxLoss} if the level fails — inside your rules.`
        : `${shares} share${shares === 1 ? '' : 's'} risks about $${maxLoss}, but this pays ${rr} to 1 and your rule is ${minRR} to 1.`,
  };
}

export function planScenarios(
  entry: number | null,
  stop: number | null,
  targets: SetupTarget[],
  shares: number | null,
  long: boolean
): Scenario[] {
  const qty = shares ?? 0;
  const first = targets[0]?.price ?? null;
  const sizeable = qty > 0 && entry !== null;
  const win = sizeable && first !== null ? round2(Math.abs(first - (entry as number)) * qty) : null;
  const lose = sizeable && stop !== null ? round2(Math.abs((entry as number) - stop) * qty) : null;

  return [
    {
      name: 'If it works',
      plain:
        first !== null
          ? `Price ${long ? 'reaches' : 'falls to'} $${first} and you take the first target.`
          : 'It follows through, but there is no target on this one yet.',
      outcome_usd: win,
      semantic: 'positive',
    },
    {
      name: 'If it fails',
      plain:
        stop !== null
          ? `Price ${long ? 'gives up' : 'reclaims'} $${stop} and you are out at the level you already decided on.`
          : 'It fails, and with no stop there is no level that ends it for you.',
      outcome_usd: lose === null ? null : -Math.abs(lose),
      semantic: 'risk',
    },
    {
      name: 'If nothing happens',
      plain:
        entry !== null
          ? `Price sits around $${entry} and never triggers. Nothing happens and nothing is risked.`
          : 'It never sets up, so nothing happens and nothing is risked.',
      outcome_usd: sizeable ? 0 : null,
      semantic: 'neutral',
    },
  ];
}

export function rrFor(entry: number | null, stop: number | null, targets: SetupTarget[]): number | null {
  const first = targets[0]?.price ?? null;
  if (entry === null || stop === null || first === null || entry === stop) return null;
  return round2(Math.abs(first - entry) / Math.abs(entry - stop));
}

export function rrPlain(rr: number | null, policy: RiskPolicyRow | null): string {
  const min = policy?.min_reward_risk ?? null;
  if (rr === null) return 'Without both a target and a stop I cannot tell you what you are being paid to take this risk.';
  if (min !== null && rr < min) {
    return `This pays ${rr} to 1. Your own minimum is ${min} to 1, so by your rules this one is not worth it.`;
  }
  return `This pays ${rr} to 1${min === null ? '' : `, above your minimum of ${min} to 1`}.`;
}

/* ------------------------------------------------------------------ */
/* Shaping                                                              */
/* ------------------------------------------------------------------ */

const STATUS_PLAIN: Record<PlanStatus, string> = {
  draft: 'Written down, not armed. Nothing is watching it and nothing can fill.',
  planned: 'Armed. Kai is watching for the entry condition.',
  active: 'You are in this one.',
  exiting: 'On the way out.',
  closed: 'Finished.',
  cancelled: 'You called this one off.',
  invalidated: 'The level this leaned on gave way, so the plan is off.',
};

export function entryOf(entryCondition: unknown): number | null {
  if (!entryCondition || typeof entryCondition !== 'object') return null;
  const o = entryCondition as Record<string, unknown>;
  for (const k of ['level', 'price', 'trigger', 'above', 'below', 'value']) {
    const v = Number(o[k]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export function toPlanRow(
  row: Record<string, unknown>,
  policy: RiskPolicyRow | null,
  equity: number | null
): PlanRow {
  const entry = entryOf(row.entry_condition);
  const stop = row.stop === null || row.stop === undefined ? null : Number(row.stop);
  const targets = normalizeTargets(row.targets);
  const sizeJson = (row.size as Record<string, unknown>) ?? {};
  const requested = Number.isFinite(Number(sizeJson.shares)) ? Number(sizeJson.shares) : null;
  const size = planSize(entry, stop, targets, policy, equity, requested);
  const intent = String(row.intent) as PositionEffect;
  const rr = rrFor(entry, stop, targets);
  const status = String(row.status) as PlanStatus;
  const exitStyle = (String(row.exit_style ?? 'auto') === 'alert_assisted' ? 'alert_assisted' : 'auto') as ExitStyle;

  return {
    id: String(row.id),
    status,
    symbol: String(row.symbol),
    mode: String(row.mode) as AppMode,
    intent,
    setup_id: (row.setup_id as string) ?? null,
    entry,
    entry_condition: (row.entry_condition as Record<string, unknown>) ?? null,
    stop,
    targets,
    size,
    rr,
    rr_plain: rrPlain(rr, policy),
    scenarios: planScenarios(entry, stop, targets, size.shares, isLongIntent(intent)),
    exit_style: exitStyle,
    exit_style_plain: exitStylePlain(exitStyle),
    created_at: String(row.created_at),
    plain: `${isLongIntent(intent) ? 'Buy' : 'Short'} ${String(row.symbol)}${entry === null ? '' : ` at $${entry}`}${stop === null ? '' : `, out at $${stop}`}. ${STATUS_PLAIN[status]}`,
  };
}

export async function planEvents(planId: string): Promise<PlanEventRow[]> {
  const db = serviceClient();
  const { data } = await db
    .from('plan_events')
    .select('seq,type,payload,created_at')
    .eq('plan_id', planId)
    .order('seq', { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    seq: Number(e.seq),
    type: String(e.type),
    at: String(e.created_at),
    plain: String(((e.payload as Record<string, unknown>) ?? {}).plain ?? ''),
  }));
}

export async function appendPlanEvent(
  planId: string,
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = serviceClient();
  const { data } = await db
    .from('plan_events')
    .select('seq')
    .eq('plan_id', planId)
    .order('seq', { ascending: false })
    .limit(1);
  const top = data && data.length ? Number((data[0] as Record<string, unknown>).seq) : 0;
  await db.from('plan_events').insert({
    plan_id: planId,
    user_id: userId,
    seq: (Number.isFinite(top) ? top : 0) + 1,
    type,
    payload: payload as never,
  });
}

export function planActions(plan: PlanRow): PlainAction[] {
  const out: PlainAction[] = [];
  if (plan.status === 'draft') {
    out.push({ action: 'activate', label: 'Arm this plan', route: null, primary: false, enabled: true, hint: null });
  }
  if (plan.status === 'draft' || plan.status === 'planned') {
    out.push({
      action: 'review_order',
      label: 'Review order',
      route: `/order/new?symbol=${plan.symbol}&side=${plan.intent}&plan=${plan.id}`,
      primary: true,
      enabled: plan.size.shares !== null && plan.size.shares > 0,
      hint: plan.size.shares ? null : 'There is no size on this plan yet.',
    });
    out.push({ action: 'adjust_stop', label: 'Move the stop', route: null, primary: false, enabled: true, hint: null });
    out.push({ action: 'cancel', label: 'Call it off', route: null, primary: false, enabled: true, hint: null });
  }
  out.push({ action: 'ask_kai', label: 'Ask Kai', route: null, primary: false, enabled: true, hint: null });
  return out;
}

export { STATUS_PLAIN as PLAN_STATUS_PLAIN };
