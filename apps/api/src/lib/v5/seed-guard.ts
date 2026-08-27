/**
 * "Are the seeded setups still telling the truth about price?"
 *
 * The four seed setups carry hand-shaped levels until the market-intelligence
 * worker exists. `apps/api/scripts/refresh-seed-setups.mjs` re-levels them from
 * Polygon daily bars, and a `supabase db reset` restores whatever seed.sql
 * holds. When those two drift, every screen shows a plan built on levels the
 * market left behind weeks ago — planning META at $504 against a $576 quote —
 * and nothing in the app says so.
 *
 * So the API checks once per process (and at most hourly after that) and WARNS
 * with the exact command. It never mutates data and never fails a request: a
 * stale seed is an operator problem, not a user-facing error.
 */
import { serviceClient } from '../db';
import { log } from '../log';

const KEY = '__cheatcode_seed_levels_checked__';
const SEED_RUN_ID = '00000000-0000-0000-0000-000000000000';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RECHECK_MS = 60 * 60 * 1000;
const FIX = 'cd apps/api && node scripts/refresh-seed-setups.mjs --write-seed';

function holder(): { at: number } {
  const g = globalThis as unknown as Record<string, { at: number } | undefined>;
  if (!g[KEY]) g[KEY] = { at: 0 };
  return g[KEY] as { at: number };
}

/** Idempotent, fire-and-forget. Safe to call from any setup read path. */
export function ensureSeedLevelsChecked(): void {
  const h = holder();
  if (Date.now() - h.at < RECHECK_MS) return;
  h.at = Date.now();
  void checkSeedLevels().catch(() => {
    /* a warning that cannot be produced is not worth an error */
  });
}

async function checkSeedLevels(): Promise<void> {
  const db = serviceClient();
  const { data } = await db
    .from('setups')
    .select('symbol,score_components')
    .eq('scanner_run_id', SEED_RUN_ID);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) return;

  const stale: string[] = [];
  for (const r of rows) {
    const components = (r.score_components as Record<string, unknown>) ?? {};
    const raw = components.refreshed_at;
    const at = typeof raw === 'string' ? Date.parse(raw) : NaN;
    if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) stale.push(String(r.symbol));
  }
  if (!stale.length) return;

  log('warn', 'boot', 'seed.levels_stale', {
    symbols: stale.join(','),
    why: 'seeded setups have no refreshed_at stamp, or one older than 7 days — their levels may contradict the live quote',
    fix: FIX,
  });
}
