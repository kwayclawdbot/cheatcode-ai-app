/**
 * VOICE MINUTES ON THE SAME CREDITS AS EVERYTHING ELSE (lane C).
 *
 * The rule in `plans.ts` is that a credit is proportional to what the work
 * really cost. Voice is paid to OpenAI by the minute, not to Anthropic by the
 * token, so it is converted at the one exchange rate this codebase already
 * publishes for "what a credit is worth in dollars":
 *
 *     USD_PER_UNIT = FALLBACK_USD_PER_CREDIT / UNITS_PER_CREDIT
 *                  = $0.0152 / 4,000  =  $0.0000038 per unit
 *
 *     one minute of listening  (gpt-4o-mini-transcribe, $0.003)  ~   789 units  ~ 0.20 credit
 *     one minute of Kai talking (gpt-4o-mini-tts,       $0.015)  ~ 3,947 units  ~ 0.99 credit
 *
 * So a ten-second question costs about 0.03 of a credit to hear, and a
 * thirty-second spoken reply about half a credit to say. Neither is worth a
 * whole credit on its own, and `kai_credit_spend` will not charge less than
 * one (a question "always costs at least one credit"). Charging a full credit
 * per utterance would bill voice at 5-30x what it cost, which is exactly the
 * disproportion the credit system exists to prevent.
 *
 * SO VOICE ACCRUES AND IS CHARGED WHOLE CREDITS AS IT CROSSES THEM. Every
 * voice call writes its real dollar cost to `kai_model_usage` (feature
 * `voice_in` / `voice_out`, which is also how the owner's spend view sees it).
 * After each call, today's voice dollars for that person are summed, turned
 * into units, and every whole credit not yet charged is charged — each under a
 * DETERMINISTIC request id `voice:<user>:<day>:<n>`. `kai_credit_spend` refuses
 * a second spend under the same request id, so two calls racing to charge the
 * third credit charge it once. Rounding is the user's way: a day that used 2.9
 * credits of voice pays 2. Same direction as `creditsForUnits`.
 *
 * FAILS OPEN, like `credits.ts`. A ledger that cannot be written never costs
 * anybody the words they just spoke. The ceiling and the daily allowance are
 * still checked BEFORE each call by `gateVoice`.
 */
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import { callRpc } from '../rpc';
import { creditState, type CreditState } from './credits';
import { FALLBACK_USD_PER_CREDIT, UNITS_PER_CREDIT } from './plans';

export type VoiceFeature = 'voice_in' | 'voice_out';

export const USD_PER_UNIT = FALLBACK_USD_PER_CREDIT / UNITS_PER_CREDIT;

/** Voice dollars → chargeable units. Pure; tested. */
export function unitsForUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return usd / USD_PER_UNIT;
}

/** Whole credits a day's voice has earned, rounded the user's way. Pure; tested. */
export function wholeCreditsFor(usdToday: number): number {
  return Math.floor(unitsForUsd(usdToday) / UNITS_PER_CREDIT + 1e-9);
}

/** The id the nth voice credit of a day is charged under. Pure; tested. */
export function voiceChargeId(userId: string, dayKey: string, n: number): string {
  return `voice:${userId}:${dayKey}:${n}`;
}

/**
 * ASK BEFORE. The same verdict chat gets, and the same sentence: someone out of
 * credits is told so in Kai's words, not with a generic error.
 */
export async function gateVoice(userId: string, requestId: string): Promise<CreditState> {
  const state = await creditState(userId, requestId);
  if (state.verdict !== 'allow') {
    throw new ApiError('ENTITLEMENT_REQUIRED', state.refusal_plain ?? 'You have used your Kai credits for now.', {
      status: 402,
      detail: { reason: state.verdict },
    });
  }
  return state;
}

/** Write what one voice call cost. Never throws. */
export async function recordVoiceUsage(opts: {
  feature: VoiceFeature;
  model: string;
  userId: string;
  requestId: string;
  durationMs: number;
  costUsd: number | null;
}): Promise<void> {
  try {
    const { error } = await serviceClient().from('kai_model_usage').insert({
      request_id: opts.requestId,
      feature: opts.feature,
      model: opts.model,
      user_id: opts.userId,
      turn_index: 0,
      // Tokens are not what OpenAI bills audio by here; NULL, never 0.
      input_tokens: null,
      output_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cost_usd: opts.costUsd,
      duration_ms: Math.round(opts.durationMs),
      stop_reason: null,
    });
    if (error) log('warn', opts.requestId, 'voice.usage_write_failed', { message: error.message });
    if (opts.costUsd === null) log('warn', opts.requestId, 'voice.unpriced_model', { model: opts.model });
  } catch (e) {
    log('warn', opts.requestId, 'voice.usage_write_threw', { message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * CHARGE AFTER. Charge every whole credit today's voice has crossed and that
 * has not been charged yet. Never throws; returns how many it charged.
 */
export async function settleVoiceCredits(opts: {
  userId: string;
  state: CreditState;
  requestId: string;
}): Promise<number> {
  try {
    if (opts.state.degraded) return 0; // no period row to charge against; see credits.ts rule 3
    const db = serviceClient();
    const { data: rows, error } = await db
      .from('kai_model_usage')
      .select('cost_usd')
      .eq('user_id', opts.userId)
      .in('feature', ['voice_in', 'voice_out'])
      .gte('created_at', opts.state.period.start);
    if (error) {
      log('warn', opts.requestId, 'voice.settle_read_failed', { message: error.message });
      return 0;
    }
    const usd = (rows ?? []).reduce((a, r) => a + (Number((r as { cost_usd: unknown }).cost_usd) || 0), 0);
    const owed = wholeCreditsFor(usd);
    if (owed <= 0) return 0;

    const prefix = voiceChargeId(opts.userId, opts.state.period.key, 0).slice(0, -1);
    // DISTINCT request ids, not rows: one credit split across the daily grant
    // and a purchased top-up is written as two ledger rows under one id.
    const { data: spent } = await db
      .from('kai_credit_ledger')
      .select('request_id')
      .eq('user_id', opts.userId)
      .eq('kind', 'spend')
      .like('request_id', `${prefix}%`);
    const already = new Set((spent ?? []).map((r) => (r as { request_id: string }).request_id)).size;

    let charged = 0;
    for (let n = already + 1; n <= owed; n += 1) {
      const out = await callRpc<{ charged: number; reason?: string }>(
        'kai_credit_spend',
        {
          p_user_id: opts.userId,
          p_period_kind: opts.state.period.kind,
          p_period_key: opts.state.period.key,
          p_credits: 1,
          p_units: UNITS_PER_CREDIT,
          p_cost_usd: Math.round(FALLBACK_USD_PER_CREDIT * 1_000_000) / 1_000_000,
          p_request_id: voiceChargeId(opts.userId, opts.state.period.key, n),
          p_conversation_id: null,
          p_note: `voice minutes: credit ${n} of the day (${usd.toFixed(6)} USD of voice so far)`,
        },
        opts.requestId
      );
      if (!out.ok) {
        log('error', opts.requestId, 'voice.charge_failed', { reason: out.missing ? 'rpc_missing' : out.message });
        break;
      }
      charged += Number(out.data?.charged ?? 0) > 0 ? 1 : 0;
    }
    if (charged) log('info', opts.requestId, 'voice.charged', { user_id: opts.userId, credits: charged, usd_today: usd });
    return charged;
  } catch (e) {
    log('error', opts.requestId, 'voice.settle_threw', { message: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}
