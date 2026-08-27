/**
 * Setup detail derivations — Live / Plan / Learn.
 *
 * Everything in here is computed from the `setups` row, the user's risk policy
 * and their paper balance. Nothing is generated and nothing is invented: if a
 * value is not in the row it comes back null with plain copy saying so.
 * Semantics only — no colours (14 palette lock).
 */
import type {
  SetupStepper,
  Confirmation,
  EvidenceItem,
  Scenario,
  SizeSuggestion,
  Quiz,
  SetupState,
} from '@shared/api';
import { entryPrice, invalidationPrice, normalizeTargets, type SetupRow, type RiskPolicyRow } from './kai/context';

export const SEED_RUN_ID = '00000000-0000-0000-0000-000000000000';

export function isLong(intent: string): boolean {
  return intent === 'buy_to_open' || intent === 'buy_to_cover';
}

export function levels(row: SetupRow) {
  const entry = entryPrice(row.entry_condition);
  const stop = row.stop ?? invalidationPrice(row.invalidation);
  const targets = normalizeTargets(row.targets);
  const perShare = entry !== null && stop !== null ? Math.round(Math.abs(entry - stop) * 100) / 100 : null;
  const rr =
    entry !== null && stop !== null && targets.length && perShare
      ? Math.round((Math.abs(targets[0].price - entry) / perShare) * 100) / 100
      : null;
  return { entry, stop, targets, perShare, rr };
}

/* ------------------------------------------------------------------ */
/* Live                                                                 */
/* ------------------------------------------------------------------ */

const STEP_ORDER: SetupState[] = ['discovered', 'watching', 'forming', 'ready'];

const STEP_LABELS: Record<SetupState, string> = {
  discovered: 'Spotted',
  watching: 'Basic conditions in place',
  forming: 'Confirmation building',
  ready: 'Every requirement met',
  invalidated: 'Invalidated',
  expired: 'Window closed',
};

const STATE_NARRATION: Record<SetupState, string> = {
  discovered: 'I have just spotted this. Nothing to do yet — I am still watching it.',
  watching: 'The basic conditions are there. I am waiting for the first real sign of strength.',
  forming: 'The confirmation I need is building. Not there yet.',
  ready: 'Everything I defined has happened. This one is your move now.',
  invalidated: 'This one is off. The level it depended on gave way.',
  expired: 'The window for this closed before it did anything.',
};

export function buildStepper(state: SetupState): SetupStepper {
  const idx = STEP_ORDER.indexOf(state);
  const failed = state === 'invalidated' || state === 'expired';

  const steps = STEP_ORDER.map((s, i) => ({
    key: s,
    label: STEP_LABELS[s],
    status: failed
      ? i === 0
        ? ('done' as const)
        : ('failed' as const)
      : i < idx
        ? ('done' as const)
        : i === idx
          ? ('current' as const)
          : ('pending' as const),
  }));

  return {
    steps,
    current_index: failed ? steps.length - 1 : Math.max(0, idx),
    plain: STATE_NARRATION[state],
  };
}

export function narration(row: SetupRow): string {
  const base = STATE_NARRATION[row.state as SetupState] ?? STATE_NARRATION.watching;
  return row.thesis_plain ? `${row.thesis_plain} ${base}` : base;
}

type Component = { key: string; label: string; askedFor: string };

const COMPONENTS: Component[] = [
  { key: 'structure', label: 'The shape is there', askedFor: 'a base or level worth trading against' },
  { key: 'volume', label: 'Volume showed up', askedFor: 'real participation, not a drift' },
  { key: 'trend', label: 'The trend agrees', askedFor: 'the bigger picture pointing the same way' },
  { key: 'catalyst', label: 'There is a reason', askedFor: 'a catalyst or a story behind the move' },
];

const OK_THRESHOLD = 60;

/**
 * `ok:null` where the scanner gave us nothing — the app shows "not known",
 * never a silent tick or cross.
 */
export function buildConfirmations(row: SetupRow, price: number | null): Confirmation[] {
  const sc = (row.score_components ?? {}) as Record<string, unknown>;
  const { entry, stop } = levels(row);
  const long = isLong(row.intent);

  const out: Confirmation[] = COMPONENTS.map((c) => {
    const raw = Number(sc[c.key]);
    if (!Number.isFinite(raw)) {
      return { label: c.label, ok: null, detail_plain: `I do not have a read on ${c.askedFor} for this one.` };
    }
    return {
      label: c.label,
      ok: raw >= OK_THRESHOLD,
      detail_plain:
        raw >= OK_THRESHOLD
          ? `Scored ${Math.round(raw)} out of 100 — ${c.askedFor} is there.`
          : `Scored ${Math.round(raw)} out of 100 — I want more of ${c.askedFor} before this counts.`,
    };
  });

  if (entry !== null) {
    out.push({
      label: long ? 'Price is through the trigger' : 'Price is under the trigger',
      ok: price === null ? null : long ? price >= entry : price <= entry,
      detail_plain:
        price === null
          ? 'I do not have a price for this right now.'
          : `Last price $${price} against a trigger of $${entry}.`,
    });
  }
  if (stop !== null) {
    out.push({
      label: 'Still on the right side of the invalidation',
      ok: price === null ? null : long ? price > stop : price < stop,
      detail_plain:
        price === null
          ? 'I do not have a price for this right now.'
          : `The idea fails ${long ? 'below' : 'above'} $${stop}.`,
    });
  }
  return out;
}

export function toEvidence(confirmations: Confirmation[]): EvidenceItem[] {
  return confirmations
    .filter((c) => c.ok !== null)
    .map((c) => ({ label: c.label, ok: Boolean(c.ok), detail_plain: c.detail_plain }));
}

/* ------------------------------------------------------------------ */
/* Plan                                                                 */
/* ------------------------------------------------------------------ */

export function sizeSuggestion(
  row: SetupRow,
  risk: RiskPolicyRow | null,
  equity: number | null
): SizeSuggestion {
  const { entry, stop, perShare, rr } = levels(row);
  const cap = risk?.daily_loss_cap_usd ?? null;
  const maxPct = risk?.max_position_pct ?? null;
  const minRR = risk?.min_reward_risk ?? null;

  if (entry === null || stop === null || !perShare) {
    return {
      shares: null,
      notional: null,
      max_loss_usd: null,
      within_policy: false,
      plain:
        'I cannot size this one yet — without both an entry and an invalidation level there is no risk to size against.',
    };
  }

  const byRisk = cap === null ? Infinity : Math.floor(cap / perShare);
  const byPosition =
    maxPct === null || equity === null ? Infinity : Math.floor((equity * (maxPct / 100)) / entry);
  const shares = Math.max(0, Math.min(byRisk, byPosition));

  if (!Number.isFinite(shares) || shares < 1) {
    return {
      shares: 0,
      notional: 0,
      max_loss_usd: 0,
      within_policy: false,
      plain:
        cap !== null && perShare > cap
          ? `One share risks $${perShare}, which is more than your whole daily limit of $${cap}. This one is too wide for your rules today.`
          : 'Your rules do not leave room for a position here today.',
    };
  }

  const maxLoss = Math.round(shares * perShare * 100) / 100;
  const notional = Math.round(shares * entry * 100) / 100;
  const rrOk = rr === null || minRR === null ? true : rr >= minRR;

  return {
    shares,
    notional,
    max_loss_usd: maxLoss,
    within_policy: rrOk,
    plain: rrOk
      ? `${shares} share${shares === 1 ? '' : 's'} keeps the loss near $${maxLoss} if the level fails — inside your rules.`
      : `${shares} share${shares === 1 ? '' : 's'} would risk about $${maxLoss}, but the reward-to-risk here is ${rr} and your rule is ${minRR}. I would leave this one.`,
  };
}

export function scenarios(row: SetupRow, size: SizeSuggestion): Scenario[] {
  const { entry, stop, targets, perShare } = levels(row);
  const shares = size.shares ?? 0;
  const first = targets[0]?.price ?? null;
  // No sizeable position → the dollar outcomes are unknowable, not zero. A "$0
  // if it fails" next to a real invalidation would read as "this is free".
  const sizeable = shares > 0;
  const win = sizeable && entry !== null && first !== null ? Math.round(Math.abs(first - entry) * shares * 100) / 100 : null;
  const lose = sizeable ? size.max_loss_usd : null;

  return [
    {
      name: 'It works',
      plain:
        first !== null
          ? `Price reaches $${first} and you take the first target.`
          : 'It follows through, but I have no target level on this one yet.',
      outcome_usd: win,
      semantic: 'positive',
    },
    {
      name: 'It fails',
      plain:
        stop !== null
          ? `Price gives up $${stop} and you are out at the invalidation.`
          : 'It fails, but there is no invalidation level defined on this one yet.',
      outcome_usd: lose === null ? null : -Math.abs(lose),
      semantic: 'risk',
    },
    {
      name: 'It goes nowhere',
      plain:
        entry !== null
          ? `Price sits around $${entry} and never triggers. Nothing happens and nothing is risked.`
          : 'It never sets up, so nothing happens and nothing is risked.',
      outcome_usd: sizeable ? 0 : null,
      semantic: 'neutral',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Learn                                                                */
/* ------------------------------------------------------------------ */

export function whyPlain(row: SetupRow): string {
  const { entry, stop } = levels(row);
  const long = isLong(row.intent);
  const parts = [row.thesis_plain ?? `${row.symbol} is on my list.`];
  if (entry !== null) {
    parts.push(
      `The number that matters is $${entry}. ${long ? 'Above' : 'Below'} it, the people on our side of the trade are in control; on the other side of it they are not.`
    );
  }
  if (stop !== null) {
    parts.push(`If price ${long ? 'closes below' : 'closes above'} $${stop}, the reason for the idea is gone and so is the idea.`);
  }
  parts.push('A grade is about quality, not permission. A good grade never means "trade now".');
  return parts.join(' ');
}

/** One question, answer revealed, no score. Built from the row's own numbers. */
export function buildQuiz(row: SetupRow): Quiz | null {
  const { entry, stop, targets } = levels(row);
  if (entry === null || stop === null) return null;
  const long = isLong(row.intent);
  const options = [
    `Price ${long ? 'closes below' : 'closes above'} $${stop}`,
    `Price ${long ? 'reaches' : 'drops to'} $${targets[0]?.price ?? entry}`,
    `Price sits still for an hour`,
    `The day closes red`,
  ];
  return {
    q: `What would tell you this ${row.symbol} idea is wrong?`,
    options,
    answer_idx: 0,
    explanation_plain: `The invalidation is the only one of those that changes the idea. $${stop} is the level the whole thesis leans on — the rest is noise or impatience.`,
  };
}

/* ------------------------------------------------------------------ */
/* Fit                                                                  */
/* ------------------------------------------------------------------ */

export function fitFor(
  row: SetupRow,
  risk: RiskPolicyRow | null,
  userMode: string,
  size: SizeSuggestion
): { ok: boolean; reasons: string[] } {
  const { rr } = levels(row);
  const reasons: string[] = [];
  let ok = true;

  if (row.mode !== userMode) {
    ok = false;
    reasons.push(`This is a ${String(row.mode).replace('_', ' ')} idea and you are in ${String(userMode).replace('_', ' ')} mode.`);
  } else {
    reasons.push(`Fits your ${String(userMode).replace('_', ' ')} rules.`);
  }

  const minRR = risk?.min_reward_risk ?? null;
  if (rr !== null && minRR !== null) {
    if (rr < minRR) {
      ok = false;
      reasons.push(`Reward-to-risk is ${rr} and your rule is ${minRR}, so I will not push this one.`);
    } else {
      reasons.push(`Reward-to-risk is ${rr}, above your minimum of ${minRR}.`);
    }
  }

  if (!size.within_policy) {
    ok = false;
    reasons.push(size.plain);
  }

  if (row.state === 'invalidated' || row.state === 'expired') {
    ok = false;
    reasons.push('This one is no longer live, so there is nothing to fit.');
  }

  return { ok, reasons };
}
