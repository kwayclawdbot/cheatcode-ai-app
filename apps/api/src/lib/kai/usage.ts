/**
 * WHAT EVERY MODEL CALL COST, WRITTEN DOWN.
 *
 * THE GAP THIS FILLS. Until now nothing in this app recorded a single token.
 * The bill arrived as one number a month and there was no way to answer the two
 * questions that actually matter — "what did this user cost me" and "which part
 * of Kai is expensive" — from the owner's own data. Not approximately: at all.
 *
 * So every call to the model now writes one row: the tokens in, the tokens out,
 * how much of the input was served from cache, which feature asked, who for,
 * and what it cost in dollars. `kai_model_usage` is the table; the reading
 * queries are at the bottom of the migration that creates it.
 *
 * LOGGING MUST NEVER COST THE USER AN ANSWER. Every write here is wrapped and
 * swallowed. If the database is down, or the table has not been migrated yet,
 * or the row is rejected, Kai's reply still goes out and a warning goes to the
 * log. A cost ledger that can break a conversation is worse than no ledger.
 *
 * NOTHING IS INVENTED. A field the provider did not return is stored as NULL,
 * never as 0 — the two mean different things and a zero that means "we did not
 * ask" would quietly understate every total built on top of it.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { serviceClient } from '../db';
import { log } from '../log';
import { costUsd, type TokenCounts } from './pricing';
import { minCacheablePrefix } from './models';

/**
 * WHICH PART OF KAI SPENT THE MONEY.
 *
 * A closed list, so "cost per feature" is a GROUP BY and not a guess. Every
 * call site names itself; a new one that forgets will not compile.
 */
export type UsageFeature =
  | 'chat'
  | 'chat_object_retry'
  | 'chat_command_recovery'
  | 'chart_answer'
  | 'briefing'
  | 'debrief'
  | 'assist'
  | 'room'
  | 'alert_draft'
  | 'alert_action'
  | 'conversation_title';

export type UsageMeta = {
  feature: UsageFeature;
  requestId: string;
  userId?: string | null;
  conversationId?: string | null;
  /**
   * Which call this was inside one request, counted from 0. A question that
   * used tools makes several; the number of rows sharing a `request_id` is how
   * many round trips that one question actually took.
   */
  turnIndex?: number;
};

/** Pull the four counts off the SDK's usage object without inventing any. */
export function tokenCounts(u: Anthropic.Usage | null | undefined): TokenCounts {
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    input_tokens: n(u?.input_tokens),
    output_tokens: n(u?.output_tokens),
    cache_read_input_tokens: n(u?.cache_read_input_tokens),
    cache_creation_input_tokens: n(u?.cache_creation_input_tokens),
  };
}

/**
 * Write one row. Never throws, never rejects — callers may fire and forget.
 */
export async function recordModelUsage(opts: {
  meta: UsageMeta;
  model: string;
  usage: Anthropic.Usage | null | undefined;
  durationMs?: number | null;
  /** Why the model stopped, when it is known. Useful for spotting truncation. */
  stopReason?: string | null;
}): Promise<void> {
  try {
    const counts = tokenCounts(opts.usage);
    const row = {
      request_id: opts.meta.requestId,
      feature: opts.meta.feature,
      model: opts.model,
      user_id: opts.meta.userId ?? null,
      conversation_id: opts.meta.conversationId ?? null,
      turn_index: opts.meta.turnIndex ?? 0,
      input_tokens: counts.input_tokens,
      output_tokens: counts.output_tokens,
      cache_read_input_tokens: counts.cache_read_input_tokens,
      cache_creation_input_tokens: counts.cache_creation_input_tokens,
      cost_usd: costUsd(opts.model, counts),
      duration_ms: opts.durationMs ?? null,
      stop_reason: opts.stopReason ?? null,
    };
    const { error } = await serviceClient().from('kai_model_usage').insert(row);
    if (error) {
      log('warn', opts.meta.requestId, 'usage.write_failed', {
        feature: opts.meta.feature,
        message: error.message,
      });
      return;
    }
    // Also on the console, so a deployment with no database access still leaves
    // a trail and so `cache_read_input_tokens` can be watched during a change.
    log('info', opts.meta.requestId, 'usage.model_call', {
      feature: row.feature,
      model: row.model,
      turn_index: row.turn_index,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      cache_read_input_tokens: row.cache_read_input_tokens,
      cache_creation_input_tokens: row.cache_creation_input_tokens,
      cost_usd: row.cost_usd,
    });

    /**
     * THE CLIFF, WATCHED.
     *
     * A prompt long enough to cache that read nothing from cache and wrote
     * nothing to it did not cache — silently, because there is no error for it.
     * That is what happens when a prompt falls under the model's minimum
     * cacheable length, and Kai's chat prompt on Haiku 4.5 clears that minimum
     * by under a thousand tokens. This is the line that would have found it in
     * a day instead of in a bill three months later.
     */
    const floor = minCacheablePrefix(row.model);
    if (
      (row.input_tokens ?? 0) >= floor &&
      row.cache_read_input_tokens === 0 &&
      row.cache_creation_input_tokens === 0
    ) {
      log('warn', opts.meta.requestId, 'usage.prompt_never_cached', {
        feature: row.feature,
        model: row.model,
        input_tokens: row.input_tokens,
        min_cacheable_prefix: floor,
      });
    }
  } catch (e) {
    log('warn', opts.meta.requestId, 'usage.write_threw', {
      feature: opts.meta.feature,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
