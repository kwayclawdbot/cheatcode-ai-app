/**
 * WHAT A MODEL WILL ACCEPT — one lookup, shared by the API and the show worker.
 *
 * This is the 5 September fix from `apps/api/src/lib/kai/models.ts`, moved here
 * so the two processes that call Anthropic cannot disagree. The worker used to
 * send `output_config: { effort: 'low' }` on every call, which Haiku 4.5 rejects
 * with a 400 — the exact failure the API had already fixed for itself.
 *
 * No imports, no environment reads, no logger: each process passes in how to
 * find its key and how to log, and gets back the same four functions. The full
 * reasoning (why it asks the provider, why the unknown answer is "no") lives in
 * the API's `models.ts` header.
 */

export type ModelCapabilities = {
  effort: boolean;
  /** How we know. 'assumed' means nobody has told us yet. */
  source: 'seed' | 'provider' | 'assumed' | 'rejected';
};

/** Verified 2026-09-05 against GET /v1/models/{id}. A cache, not a belief. */
export const CAPABILITY_SEED: ReadonlyArray<readonly [string, ModelCapabilities]> = [
  ['claude-sonnet-5', { effort: true, source: 'seed' }],
  ['claude-haiku-4-5', { effort: false, source: 'seed' }],
  ['claude-opus-5', { effort: true, source: 'seed' }],
];

export type CapabilityDeps = {
  apiKey: () => string | undefined;
  log: (level: 'info' | 'warn', event: string, fields: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
};

export type CapabilityLookup = {
  /** Does this model accept `output_config.effort`? Never throws, never blocks. */
  supportsEffort(model: string): boolean;
  /** Ask the provider and remember the answer. Awaitable for scripts. */
  refreshCapabilities(model: string): Promise<ModelCapabilities>;
  /** The provider rejected `effort` for this model. Believe it over everything. */
  noteEffortRejected(model: string): void;
  snapshot(): Record<string, ModelCapabilities>;
};

/** Is this error the provider refusing `output_config.effort`? */
export function isEffortRejection(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (status !== 400) return false;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /effort/i.test(message);
}

export function createCapabilityLookup(deps: CapabilityDeps): CapabilityLookup {
  const capabilities = new Map<string, ModelCapabilities>(CAPABILITY_SEED.map(([m, c]) => [m, { ...c }]));
  // One question per model at a time; a second caller waits for the same answer.
  const inFlight = new Map<string, Promise<ModelCapabilities>>();

  function refreshCapabilities(model: string): Promise<ModelCapabilities> {
    const current = capabilities.get(model) ?? { effort: false, source: 'assumed' as const };
    if (current.source === 'provider' || current.source === 'rejected') return Promise.resolve(current);
    const pending = inFlight.get(model);
    if (pending) return pending;
    const key = deps.apiKey();
    if (!key) return Promise.resolve(current);
    const asked = ask(model, key, current).finally(() => inFlight.delete(model));
    inFlight.set(model, asked);
    return asked;
  }

  async function ask(model: string, key: string, current: ModelCapabilities): Promise<ModelCapabilities> {
    try {
      const res = await (deps.fetchImpl ?? fetch)(
        `https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`,
        {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!res.ok) {
        deps.log('warn', 'model.capabilities_lookup_failed', { model, status: res.status });
        return current;
      }
      const body = (await res.json()) as { capabilities?: { effort?: { supported?: unknown } } };
      const supported = body?.capabilities?.effort?.supported;
      if (typeof supported !== 'boolean') {
        deps.log('warn', 'model.capabilities_incomplete', { model });
        return current;
      }
      const next: ModelCapabilities = { effort: supported, source: 'provider' };
      capabilities.set(model, next);
      deps.log('info', 'model.capabilities', { model, effort: supported, source: 'provider' });
      return next;
    } catch (e) {
      deps.log('warn', 'model.capabilities_lookup_threw', {
        model,
        message: e instanceof Error ? e.message : String(e),
      });
      return current;
    }
  }

  return {
    supportsEffort(model) {
      const known = capabilities.get(model);
      if (known) return known.effort;
      capabilities.set(model, { effort: false, source: 'assumed' });
      deps.log('warn', 'model.capabilities_unknown', {
        model,
        assumed_effort: false,
        note: 'asking the provider; effort is omitted until it answers',
      });
      void refreshCapabilities(model);
      return false;
    },
    refreshCapabilities,
    noteEffortRejected(model) {
      capabilities.set(model, { effort: false, source: 'rejected' });
      deps.log('warn', 'model.effort_rejected', { model });
    },
    snapshot() {
      return Object.fromEntries(capabilities);
    },
  };
}
