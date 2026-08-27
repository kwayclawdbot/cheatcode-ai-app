/**
 * Trade debrief (02 §4 `POST /positions/:id/debrief`, MOBILE-B screen 5).
 *
 * Split on purpose:
 *   - The NUMBERS are computed, never generated: outcome, hold time, exit
 *     reason, the process receipt and the timeline all come from `positions`,
 *     `orders`, `order_events`, `fills`, `trade_plans` and `plan_events`.
 *   - Only the JUDGEMENT is Kai's: what worked, what failed, the lesson. Kai is
 *     shown the computed facts and is told it may not introduce a number that
 *     is not among them.
 *
 * Process before outcome (07 §7): a losing trade with a defined invalidation
 * and a respected stop is a good trade, and the receipt says so.
 */
import type { DebriefPayload, ProcessReceiptItem, TimelineItem, DebriefOutcome } from '@shared/api';
import { log } from '../log';
import { buildSystemPrompt } from './system-prompt';
import { anthropicConfigured, completeOnce } from './stream';
import { scanOutput } from './guard';
import type { ProfileRow, RiskPolicyRow } from './context';

export type DebriefSources = {
  position: {
    id: string;
    symbol: string;
    direction: 'long' | 'short';
    qty: number;
    avg_cost: number;
    opened_at: string;
    closed_at: string | null;
    realized_pnl: number | null;
    mode: string;
    origin_plan_id: string | null;
    origin_setup_id: string | null;
    simulated: boolean;
  };
  plan: {
    id: string;
    status: string;
    entry_condition: Record<string, unknown> | null;
    invalidation: Record<string, unknown> | null;
    stop: number | null;
    targets: unknown;
    size: Record<string, unknown> | null;
    exit_style: string;
    origin: Record<string, unknown> | null;
  } | null;
  planEvents: { type: string; payload: Record<string, unknown>; created_at: string }[];
  orders: { id: string; side: string; type: string; qty: number; status: string; created_at: string }[];
  orderEvents: { order_id: string; from_status: string | null; to_status: string | null; payload: Record<string, unknown> | null; created_at: string }[];
  fills: { order_id: string; qty: number; price: number; ts: string }[];
  setupThesis: string | null;
  risk: RiskPolicyRow | null;
  profile: ProfileRow;
};

/* ------------------------------------------------------------------ */
/* Computed facts                                                       */
/* ------------------------------------------------------------------ */

export function holdPlain(openedAt: string, closedAt: string | null): { plain: string; ms: number | null } {
  if (!closedAt) return { plain: 'still open', ms: null };
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return { plain: 'unknown', ms: null };
  const mins = Math.round(ms / 60000);
  if (mins < 60) return { plain: `${mins}m`, ms };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return { plain: `${h}h ${m}m`, ms };
  const d = Math.floor(h / 24);
  return { plain: `${d}d ${h % 24}h`, ms };
}

function exitReason(s: DebriefSources): string {
  const closing = s.orders.find((o) => o.side === 'sell_to_close' || o.side === 'buy_to_cover');
  const ev = s.orderEvents.find((e) => e.order_id === closing?.id && e.to_status === 'filled');
  const reason = (ev?.payload as Record<string, unknown> | null)?.reason;
  if (typeof reason === 'string' && reason.trim()) return reason;
  const planEv = [...s.planEvents].reverse().find((e) => e.type === 'closed' || e.type === 'exit');
  const planReason = planEv?.payload?.reason;
  if (typeof planReason === 'string' && planReason.trim()) return planReason;
  const pnl = Number(s.position.realized_pnl ?? 0);
  if (pnl > 0) return 'Exited in the target zone';
  if (pnl < 0) return 'Stopped out at the invalidation level';
  return 'Closed flat';
}

export function computeOutcome(s: DebriefSources): DebriefOutcome {
  const pnl = s.position.realized_pnl === null ? null : Math.round(Number(s.position.realized_pnl) * 100) / 100;
  const cost = Number(s.position.avg_cost) * Number(s.position.qty);
  const pnl_pct = pnl !== null && cost ? Math.round((pnl / Math.abs(cost)) * 10000) / 100 : null;
  const held = holdPlain(s.position.opened_at, s.position.closed_at);
  return {
    pnl,
    pnl_pct,
    held: held.plain,
    held_ms: held.ms,
    exit_reason: exitReason(s),
    semantic: pnl === null || pnl === 0 ? 'neutral' : pnl > 0 ? 'positive' : 'risk',
  };
}

export function computeReceipt(s: DebriefSources): ProcessReceiptItem[] {
  const plan = s.plan;
  const hasInvalidation = Boolean(plan?.invalidation && Object.keys(plan.invalidation).length);
  const hasStop = plan?.stop !== null && plan?.stop !== undefined;
  const hasTargets = Array.isArray(plan?.targets) ? (plan?.targets as unknown[]).length > 0 : Boolean(plan?.targets);
  const sizedFromRisk = Boolean(plan?.size && Object.keys(plan.size).length);
  const maxLoss = Number((plan?.size as Record<string, unknown> | null)?.max_loss_usd ?? NaN);
  const cap = s.risk?.daily_loss_cap_usd ?? null;
  const withinCap = cap === null || !Number.isFinite(maxLoss) ? null : maxLoss <= cap;
  const pnl = Number(s.position.realized_pnl ?? 0);
  const lossWithinPlan =
    Number.isFinite(maxLoss) && pnl < 0 ? Math.abs(pnl) <= maxLoss * 1.05 : pnl >= 0;

  return [
    {
      label: 'You had a written plan before you were in',
      ok: Boolean(plan),
      detail_plain: plan ? 'The plan was recorded before the order went in.' : 'No plan was recorded for this one.',
    },
    {
      label: 'You defined what would prove you wrong',
      ok: hasInvalidation,
      detail_plain: hasInvalidation
        ? 'The invalidation was written down, so being wrong was a decision, not a surprise.'
        : 'No invalidation was written down, so there was nothing to be wrong against.',
    },
    {
      label: 'You had a stop',
      ok: Boolean(hasStop),
      detail_plain: hasStop ? `The stop sat at $${plan?.stop}.` : 'No stop level was set on this one.',
    },
    {
      label: 'You knew where you were taking profit',
      ok: Boolean(hasTargets),
      detail_plain: hasTargets ? 'At least one target was defined up front.' : 'No target was defined up front.',
    },
    {
      label: 'The size came from the risk, not the excitement',
      ok: sizedFromRisk,
      detail_plain: sizedFromRisk
        ? Number.isFinite(maxLoss)
          ? `The plan risked about $${maxLoss} if it failed.`
          : 'The size was derived from the plan.'
        : 'The size was not derived from a planned risk.',
    },
    {
      label: 'The loss stayed inside what you planned to risk',
      ok: Boolean(lossWithinPlan),
      detail_plain:
        withinCap === false
          ? 'The planned risk was larger than your daily loss cap.'
          : pnl >= 0
            ? 'This one did not cost you anything.'
            : Number.isFinite(maxLoss)
              ? `You planned to risk $${maxLoss} and it cost $${Math.abs(pnl)}.`
              : 'There was no planned risk to compare the loss against.',
    },
  ];
}

export function computeTimeline(s: DebriefSources): TimelineItem[] {
  const out: TimelineItem[] = [];
  if (s.plan) {
    out.push({
      at: s.position.opened_at,
      kind: 'plan',
      label: 'Plan written',
      plain: `The plan for ${s.position.symbol} was recorded before anything was placed.`,
    });
  }
  for (const e of s.planEvents) {
    out.push({
      at: e.created_at,
      kind: `plan_${e.type}`,
      label: `Plan ${e.type.replace(/_/g, ' ')}`,
      plain: String(e.payload?.plain ?? e.payload?.reason ?? `The plan moved to ${e.type.replace(/_/g, ' ')}.`),
    });
  }
  for (const e of s.orderEvents) {
    out.push({
      at: e.created_at,
      kind: `order_${e.to_status ?? 'event'}`,
      label: `Order ${String(e.to_status ?? 'updated').replace(/_/g, ' ')}`,
      plain: String(
        e.payload?.plain ??
          `The order moved from ${e.from_status ?? 'draft'} to ${e.to_status ?? 'an update'}. Accepted is not the same as filled.`
      ),
    });
  }
  for (const f of s.fills) {
    out.push({
      at: f.ts,
      kind: 'fill',
      label: 'Filled',
      plain: `${f.qty} shares at $${f.price}.`,
    });
  }
  if (s.position.closed_at) {
    out.push({
      at: s.position.closed_at,
      kind: 'closed',
      label: 'Position closed',
      plain: exitReason(s) + '.',
    });
  }
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/* ------------------------------------------------------------------ */
/* Judgement                                                            */
/* ------------------------------------------------------------------ */

function deterministicJudgement(
  outcome: DebriefOutcome,
  receipt: ProcessReceiptItem[]
): { what_worked: string[]; what_failed: string[]; lesson_plain: string } {
  const kept = receipt.filter((r) => r.ok).map((r) => r.label);
  const missed = receipt.filter((r) => !r.ok).map((r) => r.label);
  const lesson = missed.length
    ? `The part of your process that slipped here was: ${missed[0].toLowerCase()}. That is the one to fix before the next one — the outcome is downstream of it.`
    : 'You did the whole process on this one. Whatever the number says, that is the part to repeat.';
  return {
    what_worked: kept.length ? kept : ['You closed the position rather than letting it run on hope.'],
    what_failed: missed,
    lesson_plain: lesson,
  };
}

export async function generateDebrief(
  s: DebriefSources,
  requestId: string
): Promise<{ payload: DebriefPayload; degraded: boolean; reason: string | null }> {
  const outcome = computeOutcome(s);
  const process_receipt = computeReceipt(s);
  const timeline = computeTimeline(s);

  const base: DebriefPayload = {
    position_id: s.position.id,
    symbol: s.position.symbol,
    direction: s.position.direction,
    outcome,
    process_receipt,
    timeline,
    simulated: s.position.simulated,
    ...deterministicJudgement(outcome, process_receipt),
  };

  if (!anthropicConfigured()) {
    return { payload: base, degraded: true, reason: 'Kai is offline right now.' };
  }

  const facts = {
    symbol: s.position.symbol,
    direction: s.position.direction,
    qty: s.position.qty,
    avg_cost: s.position.avg_cost,
    realized_pnl: outcome.pnl,
    held: outcome.held,
    exit_reason: outcome.exit_reason,
    mode: s.position.mode,
    simulated: s.position.simulated,
    thesis: s.setupThesis,
    plan: s.plan
      ? { stop: s.plan.stop, targets: s.plan.targets, invalidation: s.plan.invalidation, size: s.plan.size, exit_style: s.plan.exit_style }
      : null,
    process_receipt,
    risk_policy: s.risk,
  };

  const system = buildSystemPrompt({
    displayName: s.profile.display_name,
    experience: s.profile.experience,
    involvement: s.profile.involvement,
    explanationLevel: s.profile.explanation_level,
    mode: s.position.mode,
  });

  try {
    const text = await completeOnce({
      system,
      messages: [
        {
          role: 'user',
          content: `Write the debrief for this closed paper trade. These are the ONLY facts you have:

${JSON.stringify(facts, null, 2)}

Return ONLY JSON, no fence, no prose:
{
  "what_worked": ["short lines, each about the PROCESS, drawn from the receipt above"],
  "what_failed": ["short lines, each about the PROCESS — empty array if nothing failed"],
  "lesson_plain": "two sentences at most. Process before outcome: a loss taken at a defined invalidation is a good trade, and a win taken with no plan is still a bad one. No congratulation, no encouragement to trade more, no score."
}

Do not use a number that is not in the facts above. Do not praise or scold the person. Do not mention XP, streaks or badges — this product has none.`,
        },
      ],
      maxTokens: 700,
    });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return { payload: base, degraded: true, reason: 'Kai could not write that debrief.' };
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      what_worked?: unknown;
      what_failed?: unknown;
      lesson_plain?: unknown;
    };

    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6) : [];
    const lesson = typeof parsed.lesson_plain === 'string' ? parsed.lesson_plain.trim() : '';
    if (!lesson) return { payload: base, degraded: true, reason: 'Kai could not write that debrief.' };

    const scan = scanOutput(lesson, ...strings(parsed.what_worked), ...strings(parsed.what_failed));
    if (!scan.ok) {
      log('warn', requestId, 'debrief.INJECTION_SCAN_BLOCKED', { findings: scan.findings });
      return { payload: base, degraded: true, reason: 'Kai could not write that debrief.' };
    }

    return {
      payload: {
        ...base,
        what_worked: strings(parsed.what_worked).length ? strings(parsed.what_worked) : base.what_worked,
        what_failed: strings(parsed.what_failed),
        lesson_plain: lesson,
      },
      degraded: false,
      reason: null,
    };
  } catch (e) {
    log('warn', requestId, 'debrief.generation_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return { payload: base, degraded: true, reason: 'Kai is offline right now.' };
  }
}
