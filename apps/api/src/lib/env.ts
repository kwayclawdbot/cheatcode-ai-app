/** Server-only env access. Values never leave the server. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

/**
 * THE OLD GLOBAL SETTING. Kept because it still means exactly what it always
 * meant — one model for the whole of Kai — and because it is the one-line way
 * back if the per-feature split goes wrong.
 *
 * NOTHING ON THE REQUEST PATH READS THIS ANY MORE. The model a call uses is
 * chosen per feature by `modelFor()` in `./kai/models.ts`, which consults
 * `KAI_MODEL_<FEATURE>` first and this second. Reading it directly would put a
 * call back on one global model without saying so.
 */
export const KAI_MODEL = () => env('KAI_MODEL') ?? 'claude-sonnet-5';
export const KAI_PROMPT_VERSION = 'kai-v1-slice-2026-08-26';
