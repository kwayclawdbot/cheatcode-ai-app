/**
 * WHAT A THOUSAND WORDS COSTS. One file. One table. Nothing else in this
 * codebase is allowed to know a price.
 *
 * The owner could not answer "what did this user cost me" from his own data,
 * because nothing recorded it. The fix is two halves: `usage.ts` writes down
 * what every model call consumed, and this file turns that into dollars. A
 * price change must be a one-line edit HERE and nowhere else — a magic number
 * scattered through four routes is how a bill silently stops matching reality.
 *
 * Rates are per MILLION tokens, taken from Anthropic's published API pricing.
 * Cache reads and cache writes are not separate list prices: they are fixed
 * multiples of the model's input rate, so they are held as multipliers rather
 * than as four more numbers that could drift apart from the first two.
 *
 * A MODEL WE HAVE NO PRICE FOR IS NOT PRICED AT ZERO. `costUsd` returns null,
 * the row is stored with a null cost, and the reading queries say how many rows
 * that happened to. A guessed cost is worse than an admitted gap.
 */

export type ModelRate = {
  /** US dollars per 1,000,000 input tokens. */
  input_per_mtok: number;
  /** US dollars per 1,000,000 output tokens. */
  output_per_mtok: number;
};

/** Verified 2026-09-05 against Anthropic's published API pricing. */
export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-sonnet-5': { input_per_mtok: 2.0, output_per_mtok: 10.0 },
  'claude-opus-5': { input_per_mtok: 5.0, output_per_mtok: 25.0 },
  'claude-haiku-4-5': { input_per_mtok: 1.0, output_per_mtok: 5.0 },
  'claude-sonnet-4-6': { input_per_mtok: 3.0, output_per_mtok: 15.0 },
};

/**
 * THE RATE FOR A MODEL, WHICHEVER WAY IT WAS NAMED.
 *
 * A REAL GAP THIS CLOSES. The ledger already contains rows for
 * `claude-haiku-4-5-20251001` — the dated snapshot of a model whose rate is
 * written above under its plain name. `MODEL_RATES[model]` missed them, so four
 * real calls are stored with a NULL cost: they are invisible to every total in
 * the admin view and to the credit system's own arithmetic.
 *
 * A dated snapshot is the SAME MODEL at the SAME PRICE — that is what a
 * snapshot is — so a trailing `-YYYYMMDD` is stripped and the plain name looked
 * up again. Nothing else is inferred: a name that still has no rate after that
 * returns undefined and the row stays honestly unpriced, exactly as before.
 */
export function rateFor(model: string): ModelRate | undefined {
  const exact = MODEL_RATES[model];
  if (exact) return exact;
  const undated = model.replace(/-\d{8}$/, '');
  return undated === model ? undefined : MODEL_RATES[undated];
}

/** A cached prefix read back costs a tenth of fresh input. */
export const CACHE_READ_MULTIPLIER = 0.1;
/** Writing a prefix into the 5-minute cache costs a quarter more than input. */
export const CACHE_WRITE_MULTIPLIER = 1.25;

export type TokenCounts = {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
};

/**
 * Dollars for one model call, or null when we cannot say honestly.
 *
 * Null happens for exactly two reasons and both are worth knowing about:
 * the model has no rate in the table above (someone changed KAI_MODEL and did
 * not add its price), or the provider returned no token counts at all. A call
 * with counts present but zero is a real zero and is priced as one.
 */
export function costUsd(model: string, t: TokenCounts): number | null {
  const rate = rateFor(model);
  if (!rate) return null;
  if (t.input_tokens === null && t.output_tokens === null) return null;

  const perInput = rate.input_per_mtok / 1_000_000;
  const perOutput = rate.output_per_mtok / 1_000_000;

  const usd =
    (t.input_tokens ?? 0) * perInput +
    (t.output_tokens ?? 0) * perOutput +
    (t.cache_read_input_tokens ?? 0) * perInput * CACHE_READ_MULTIPLIER +
    (t.cache_creation_input_tokens ?? 0) * perInput * CACHE_WRITE_MULTIPLIER;

  // Six decimal places, which is the column's scale. A tenth of a cent is the
  // smallest unit worth carrying; rounding here means the stored number and the
  // number anyone recomputes from the token columns agree.
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * What this call WOULD have cost with no cache at all — the counterfactual the
 * savings claim rests on. Cached reads and cache writes both become plain input
 * tokens, because without caching that is exactly what they would have been.
 */
export function uncachedCostUsd(model: string, t: TokenCounts): number | null {
  const rate = rateFor(model);
  if (!rate) return null;
  if (t.input_tokens === null && t.output_tokens === null) return null;
  const perInput = rate.input_per_mtok / 1_000_000;
  const perOutput = rate.output_per_mtok / 1_000_000;
  const inputTotal =
    (t.input_tokens ?? 0) + (t.cache_read_input_tokens ?? 0) + (t.cache_creation_input_tokens ?? 0);
  return Math.round((inputTotal * perInput + (t.output_tokens ?? 0) * perOutput) * 1_000_000) / 1_000_000;
}
