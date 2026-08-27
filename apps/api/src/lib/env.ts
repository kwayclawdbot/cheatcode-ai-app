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

export const KAI_MODEL = () => env('KAI_MODEL') ?? 'claude-sonnet-5';
export const KAI_PROMPT_VERSION = 'kai-v1-slice-2026-08-26';
