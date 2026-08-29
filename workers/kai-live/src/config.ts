/**
 * The worker's environment, read once and validated loudly.
 *
 * This process is not a Next.js route: nothing loads `.env.local` for it, and a
 * show that starts with a missing key does not fail at the missing key — it
 * fails four minutes later, halfway through a segment, on air. So the file is
 * read at import and the required names are checked before anything is created.
 *
 * NOTHING HERE IS EVER LOGGED. `describeEnv()` reports presence, never value.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKER_ROOT = resolve(HERE, '..');
export const REPO_ROOT = resolve(WORKER_ROOT, '..', '..');

/**
 * Two files, in this order, each overriding nothing already in `process.env`:
 *
 *   workers/kai-live/.env.local — the worker's own (gitignored). OPENAI_API_KEY
 *                                 lives here and only here.
 *   apps/api/.env.local         — the API's, reused for ANTHROPIC_API_KEY,
 *                                 KAI_MODEL, SUPABASE_*, INTERNAL_SECRET.
 *
 * Reusing the API's file is deliberate: two copies of a Supabase service key on
 * one machine is two chances to update one and not the other.
 */
function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
  }
}

loadEnvFile(resolve(WORKER_ROOT, '.env.local'));
loadEnvFile(resolve(REPO_ROOT, 'apps', 'api', '.env.local'));

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`kai-live: missing required environment variable ${name}`);
  return v;
}

function num(name: string, fallback: number): number {
  const n = Number(env(name));
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  supabaseUrl: () => requireEnv('SUPABASE_URL'),
  supabaseServiceKey: () => requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  anthropicKey: () => env('ANTHROPIC_API_KEY'),
  kaiModel: () => env('KAI_MODEL') ?? 'claude-sonnet-5',
  openaiKey: () => env('OPENAI_API_KEY'),
  internalSecret: () => env('INTERNAL_SECRET'),
  apiBase: () => env('LIVE_API_BASE') ?? 'http://localhost:3000',

  /** The account whose workspace the show's annotations are drawn into. */
  stageUserEmail: () => env('LIVE_STAGE_USER_EMAIL') ?? 'stage@kai-live.local',

  /** Hard cap. Breaching it drops the director to cached/fixture segments. */
  budgetPerHour: () => num('SHOW_BUDGET_USD_PER_HOUR', 3.0),
  /** How many segments to keep ready ahead of the one playing. Spec says 2. */
  prepDepth: () => Math.max(1, Math.round(num('SHOW_PREP_DEPTH', 2))),
  /** Stop after this many segments. 0 = run until the rundown is exhausted. */
  maxSegments: () => Math.max(0, Math.round(num('SHOW_MAX_SEGMENTS', 0))),

  ttsModel: () => env('LIVE_TTS_MODEL') ?? 'gpt-4o-mini-tts',
  /** Standing default (feedback_voice_tts_provider): ash leads, coral bridges. */
  ttsVoiceKai: () => env('LIVE_TTS_VOICE_KAI') ?? 'ash',
  ttsVoiceCohost: () => env('LIVE_TTS_VOICE_COHOST') ?? 'coral',
  audioBucket: () => env('LIVE_AUDIO_BUCKET') ?? 'live-audio',
} as const;

/** Presence only. Never values. Printed at the top of a run. */
export function describeEnv(): Record<string, boolean | string> {
  return {
    supabase: Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')),
    anthropic: Boolean(env('ANTHROPIC_API_KEY')),
    openai: Boolean(env('OPENAI_API_KEY')),
    internal_secret: Boolean(env('INTERNAL_SECRET')),
    api_base: config.apiBase(),
    model: config.kaiModel(),
    budget_usd_per_hour: String(config.budgetPerHour()),
  };
}
