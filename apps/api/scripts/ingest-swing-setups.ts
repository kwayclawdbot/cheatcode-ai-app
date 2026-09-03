/**
 * SWING-1 — the Kai SMS alerts, ingested into the app as `setups`. CLI.
 *
 *   cd apps/api
 *   npx tsx scripts/ingest-swing-setups.ts --since=2026-06-01
 *   npx tsx scripts/ingest-swing-setups.ts --since=2026-06-01 --dry-run
 *   npx tsx scripts/ingest-swing-setups.ts --json          (machine-readable summary)
 *   ENV_FILE=.env.prod npx tsx scripts/ingest-swing-setups.ts --since=2026-01-01
 *
 * THE LOGIC IS NOT HERE. It is `src/lib/swing/run.ts`, because the unattended
 * cron (`/api/v1/internal/swing/ingest`) runs the very same function. This file
 * is argv, an env file and stdout — nothing a scheduled run does not do.
 *
 * `--notify` is opt-in and always off in `--dry-run`: a human backfilling six
 * months of history must not be one forgotten flag away from pushing the back
 * catalogue at every user on the service.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestSwingSetups, type IngestSummary } from '../src/lib/swing/run.ts';
import { medallionFamilyFor, pickKey } from '../src/lib/swing/ingest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE ?? resolve(HERE, '../.env.local');

for (const line of safeRead(ENV_FILE).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes('--json');
const WINDOW_ARG = arg('--window-days');

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((s) => {
    if (AS_JSON) console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }).catch((e) => {
    console.error('ingest-swing-setups failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

export async function run(opts: { since?: string; quiet?: boolean } = {}): Promise<IngestSummary> {
  return ingestSwingSetups({
    since: opts.since ?? arg('--since') ?? undefined,
    windowDays: WINDOW_ARG === null ? undefined : Number(WINDOW_ARG),
    dryRun: ARGS.includes('--dry-run'),
    notify: ARGS.includes('--notify'),
    log: opts.quiet || AS_JSON ? undefined : (...a: unknown[]) => console.log(...a),
  });
}

function arg(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

export { pickKey, medallionFamilyFor };
export type { IngestSummary };
