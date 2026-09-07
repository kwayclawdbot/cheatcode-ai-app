/**
 * WHICH MODEL ANSWERS WHICH QUESTION — AND WHAT THAT MODEL WILL ACCEPT.
 *
 * THE GAP THIS FILLS. `KAI_MODEL` was one setting for the whole product. Every
 * call Kai makes — the chat, the chart director, the object retry, the nightly
 * briefing — ran on whatever it named. So the only choice available was "all of
 * Kai on the cheap model" or "all of Kai on the expensive one", and the
 * measurement on 5 September says the two halves of Kai want different things:
 * Haiku 4.5 answers chat at 58% of the price and never invents a price, but it
 * gets money arithmetic wrong out loud; and on every call that sends no tools
 * it caches nothing at all, so it is the MORE expensive model there. One
 * setting cannot express that.
 *
 * So the model is chosen PER FEATURE, using the same closed list of feature
 * names the cost ledger already groups by (`UsageFeature` in ./usage.ts). One
 * vocabulary: what the routing table calls a feature is exactly what the bill
 * calls it, so a row in `kai_model_usage` can be read straight back as "this is
 * what that setting cost me" with nothing to translate.
 *
 * ONE QUESTION RUNS ON ONE MODEL. Caches are keyed by model, so switching model
 * part way through a tool loop builds a second cache and reads neither. The
 * routing is therefore per FEATURE and never per turn: every round trip of one
 * chat question is `chat`, and it is the same model start to finish.
 *
 * WHAT CAN BE RETUNED WITHOUT A DEPLOY. Every feature reads an environment
 * variable before it reads the default below, so the owner can move one feature
 * off Haiku from the ledger's own evidence without touching code:
 *
 *     KAI_MODEL_CHAT=claude-sonnet-5      # one feature
 *     KAI_MODEL=claude-sonnet-5           # ALL of them, as it always did
 *
 * `KAI_MODEL` keeps its old meaning exactly — one string that governs the whole
 * product — so an existing deployment that sets it behaves as it did before,
 * and it stays the one-line way back to a single model if this split goes wrong.
 */
import { env } from '../env';
import { log } from '../log';
import type { UsageFeature } from './usage';

export const SONNET_5 = 'claude-sonnet-5';
export const HAIKU_4_5 = 'claude-haiku-4-5';

/** Used when a feature has no default and nothing is configured. */
export const FALLBACK_MODEL = SONNET_5;

/**
 * THE DEFAULTS, AND THE MEASURED REASON FOR EACH ONE.
 *
 * From the 186-call head-to-head in `HAIKU-VS-SONNET-2026-09-05.md`:
 *
 *   `chat` — SONNET, and this is the one default that went AGAINST the plan.
 *     Haiku was the intended default and it was re-measured on 5 September on
 *     the current code, after position sizing moved server-side. It is still
 *     honest about prices — 0 invented in 60 answers, twice now — and after the
 *     `answer_on_chart` salvage it never came back blank. What it still does is
 *     ARITHMETIC ABOUT MONEY, OUT LOUD, WRONG:
 *
 *       "this setup can fit in your account at about 110 shares — that would
 *        put your position at $6,417, well within your $1,000 position limit"
 *
 *       "202 shares × $4.94 = $998 (just under your daily loss cap of $300)"
 *
 *       "you're capped at 20 shares (20 × $50.27 = $1,005, just inside the
 *        limit)"   [the limit is $1,000]
 *
 *     Two of six money answers stated a position OVER the limit as compliance
 *     with it. It talks itself back to the right number afterwards — "Wait,
 *     that math is wrong" — but the wrong figure is written, streamed and read
 *     first. Sonnet got every one of them right, in four lines instead of
 *     fourteen. It also got the reward-to-risk sum wrong twice (2.9 where it is
 *     3.0, 1.9 where it is 2.0), drew something on 7 of 12 chart questions
 *     against Sonnet's 8 of 8, and paraphrases the beginner glossary the voice
 *     block says to quote word for word.
 *
 *     The saving forgone is $8.22 per heavy user per month ($5.95 against
 *     $14.17, both measured with caching on). A dollar figure that breaks the
 *     risk policy while claiming to obey it costs more than that.
 *
 *     TO TRY IT ANYWAY, one line and no deploy: KAI_MODEL_CHAT=claude-haiku-4-5.
 *     Chat is the one call that carries tool definitions, so it is also the
 *     only one where Haiku caches properly — everything below would cost MORE
 *     on Haiku, not less.
 *
 *   Everything that must EMIT JSON — SONNET. `chart_answer` is the director
 *     that decides which levels get drawn; `chat_object_retry` is the second
 *     attempt at a structured object the validator just rejected; and
 *     `chat_command_recovery` answers with one line of JSON or nothing. JSON
 *     discipline is precisely where Haiku failed, and a retry that runs on the
 *     model that just failed is not a retry.
 *
 *   Everything that goes through `completeOnce` with NO TOOLS — SONNET. The
 *     tool definitions are about 1,250 tokens and are rendered before the
 *     system prompt. Without them the prompt is 3,807 tokens, under Haiku's
 *     4,096 minimum, and Haiku then caches NOTHING — measured: three identical
 *     calls, 3,807 uncached input tokens each, no cache entry ever created, no
 *     error. Sonnet cached 4,974 of 4,988 on the same calls. On those calls
 *     Haiku is the more expensive model, which is the opposite of the point.
 */
export const FEATURE_MODEL_DEFAULTS: Record<UsageFeature, string> = {
  // The tool loop. Measured on both; Sonnet, for the money arithmetic above.
  chat: SONNET_5,
  // Emits a `kai_object` block that a validator already rejected once.
  chat_object_retry: SONNET_5,
  // Emits one line of JSON.
  chat_command_recovery: SONNET_5,
  // The director. Emits `{"cues": [...]}` and nothing else.
  chart_answer: SONNET_5,
  // The rest reach the model through `completeOnce`, which sends no tools.
  briefing: SONNET_5,
  debrief: SONNET_5,
  assist: SONNET_5,
  room: SONNET_5,
  alert_draft: SONNET_5,
  alert_action: SONNET_5,
  conversation_title: SONNET_5,
  // `scripts/kai-markup-proof.mts`. It reaches the model through `completeOnce`
  // with no tools, so it belongs with the group above for the same measured
  // reason — and a proof that runs on a different model from the thing it is
  // proving is not proving that thing.
  chart_markup_proof: SONNET_5,
};

/** `chart_answer` -> `KAI_MODEL_CHART_ANSWER`. */
export function envVarFor(feature: UsageFeature): string {
  return `KAI_MODEL_${feature.toUpperCase()}`;
}

/**
 * The model that answers for one feature.
 *
 * Order: the feature's own variable, then the global `KAI_MODEL`, then the
 * default above. A feature name that is not in the table (there is no such
 * thing today — the type forbids it) falls back to Sonnet rather than to
 * nothing.
 */
export function modelFor(feature?: UsageFeature | null): string {
  if (feature) {
    const specific = env(envVarFor(feature));
    if (specific) return specific;
  }
  const global = env('KAI_MODEL');
  if (global) return global;
  return (feature ? FEATURE_MODEL_DEFAULTS[feature] : undefined) ?? FALLBACK_MODEL;
}

/** Every feature and the model it will use right now. For reporting. */
export function modelRouting(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of Object.keys(FEATURE_MODEL_DEFAULTS) as UsageFeature[]) out[f] = modelFor(f);
  return out;
}

/**
 * THE SHORTEST PROMPT EACH MODEL WILL CACHE AT ALL.
 *
 * A prefix under this length is not cached and NOTHING SAYS SO: no error, and
 * `cache_creation_input_tokens` comes back 0. Measured 5 September — Sonnet 5
 * caches from 1,024 tokens, Haiku 4.5 from 4,096.
 *
 * WHY IT MATTERS HERE. Kai's chat prompt clears Haiku's floor by 957 tokens,
 * and only because the four tool definitions (about 1,250 tokens) are rendered
 * in front of it. Trim a tool, or the sheet block, or the voice block, and the
 * chat silently stops caching and the bill roughly doubles with nothing on
 * screen to say why. `usage.ts` watches for that.
 */
export const MIN_CACHEABLE_PREFIX_TOKENS: Record<string, number> = {
  [SONNET_5]: 1024,
  [HAIKU_4_5]: 4096,
  'claude-opus-5': 1024,
};

/** The floor for a model we have no measurement for: the strictest one seen. */
export const DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS = 4096;

export function minCacheablePrefix(model: string): number {
  return MIN_CACHEABLE_PREFIX_TOKENS[model] ?? DEFAULT_MIN_CACHEABLE_PREFIX_TOKENS;
}

/* ------------------------------------------------------------------ */
/* Capabilities — asked of the provider, not remembered                 */
/* ------------------------------------------------------------------ */

/**
 * WHAT THIS MODEL WILL ACCEPT, ANSWERED BY THE PROVIDER.
 *
 * THE BUG THIS FIXES. Both model calls sent `output_config: { effort: 'low' }`
 * unconditionally. Haiku 4.5 rejects it — `400 invalid_request_error: This
 * model does not support the effort parameter` — so `KAI_MODEL=claude-haiku-4-5`
 * made every single Kai reply fail in under a second. That failure is
 * indistinguishable from the revoked-key outage of 4-5 September: every turn
 * errors immediately, every reply is written as an empty stub, and the owner
 * reports "Kai stopped replying".
 *
 * IT IS NOT A STRING COMPARISON. `model.includes('haiku')` would work today and
 * be wrong the next time a model ships — quietly, in whichever direction the
 * new model happens to differ. The provider publishes the answer for free:
 * `GET /v1/models/{id}` returns `capabilities.effort.supported`, costs no
 * tokens, and is the same source that would tell us about a model that does not
 * exist yet. So that is what is asked.
 *
 * THE SEED IS A CACHE, NOT A BELIEF. The three models this app actually routes
 * to are seeded with what that endpoint returned on 5 September 2026, so a cold
 * process never waits on a network call to send its first request. Anything
 * else is looked up in the background and the answer replaces the guess.
 *
 * A MODEL WE HAVE NOT ASKED ABOUT GETS THE CAUTIOUS ANSWER. Until the lookup
 * comes back, an unknown model is treated as not supporting `effort`: the call
 * costs slightly more thinking than it needed to, which is a bill, where the
 * other way round is a dead product.
 */
type Capabilities = {
  effort: boolean;
  /** How we know. 'assumed' means nobody has told us yet. */
  source: 'seed' | 'provider' | 'assumed' | 'rejected';
};

const capabilities = new Map<string, Capabilities>([
  // Verified 2026-09-05 against GET /v1/models/{id}.
  [SONNET_5, { effort: true, source: 'seed' }],
  [HAIKU_4_5, { effort: false, source: 'seed' }],
  ['claude-opus-5', { effort: true, source: 'seed' }],
]);

const inFlight = new Set<string>();

/** Does this model accept `output_config.effort`? Never throws, never blocks. */
export function supportsEffort(model: string): boolean {
  const known = capabilities.get(model);
  if (known) return known.effort;
  capabilities.set(model, { effort: false, source: 'assumed' });
  log('warn', 'models', 'model.capabilities_unknown', {
    model,
    assumed_effort: false,
    note: 'asking the provider; effort is omitted until it answers',
  });
  void refreshCapabilities(model);
  return false;
}

/**
 * Ask the provider what this model can do and remember the answer.
 *
 * Awaitable so a script can be sure of the answer before it measures anything;
 * fired and forgotten on the request path, where the cautious default already
 * made the call safe.
 */
export async function refreshCapabilities(model: string): Promise<Capabilities> {
  const current = capabilities.get(model) ?? { effort: false, source: 'assumed' as const };
  if (current.source === 'provider' || current.source === 'rejected') return current;
  if (inFlight.has(model)) return current;
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return current;
  inFlight.add(model);
  try {
    const res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log('warn', 'models', 'model.capabilities_lookup_failed', { model, status: res.status });
      return current;
    }
    const body = (await res.json()) as {
      capabilities?: { effort?: { supported?: unknown } };
    };
    const supported = body?.capabilities?.effort?.supported;
    if (typeof supported !== 'boolean') {
      // The field is absent rather than false. Say nothing we cannot support.
      log('warn', 'models', 'model.capabilities_incomplete', { model });
      return current;
    }
    const next: Capabilities = { effort: supported, source: 'provider' };
    capabilities.set(model, next);
    log('info', 'models', 'model.capabilities', { model, effort: supported, source: 'provider' });
    return next;
  } catch (e) {
    log('warn', 'models', 'model.capabilities_lookup_threw', {
      model,
      message: e instanceof Error ? e.message : String(e),
    });
    return current;
  } finally {
    inFlight.delete(model);
  }
}

/**
 * The provider rejected `effort` for this model. Believe it over everything.
 *
 * This is the last line of the capability check and the only one that cannot be
 * wrong: whatever the table said, whatever the lookup said, a 400 naming the
 * parameter is the provider telling us plainly, and it sticks for the life of
 * the process.
 */
export function noteEffortRejected(model: string): void {
  capabilities.set(model, { effort: false, source: 'rejected' });
  log('warn', 'models', 'model.effort_rejected', { model });
}

/** Is this error the provider refusing `output_config.effort`? */
export function isEffortRejection(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (status !== 400) return false;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /effort/i.test(message);
}

/** For tests and probes: what we currently believe, and how we came to. */
export function capabilitySnapshot(): Record<string, Capabilities> {
  return Object.fromEntries(capabilities);
}
