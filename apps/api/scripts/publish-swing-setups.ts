/**
 * SWING-3 — announce the swing setups for one session.
 *
 *   cd apps/api
 *   npx tsx scripts/publish-swing-setups.ts --dry-run
 *   npx tsx scripts/publish-swing-setups.ts --date=2026-09-01
 *   npx tsx scripts/publish-swing-setups.ts --ids=<uuid>,<uuid>
 *
 * The ingest can do this itself with `--notify`; this exists for the case the
 * ingest cannot cover — the morning ran, the picks landed, and the fan-out did
 * not (a bad deploy, an outage, a filter that was wrong and has been fixed).
 * Re-running it is SAFE by construction: `publishSetups` reads back what it has
 * already sent for these setups and subtracts, so an operator repairing a
 * morning cannot double-notify the people who already heard.
 *
 * `--date` is an ET session, defaulting to today. Setups are looked up by the
 * `quote_snapshot.et_date` the ingest stamps, and the same gate applies as
 * everywhere else: ready, long, swing, graded, and dated to the session asked
 * for. There is no flag that widens it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceClient } from '../src/lib/db.ts';
import { publishSetups } from '../src/lib/swing/publish.ts';
import { etDateFor } from '../src/lib/swing/ingest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE ?? resolve(HERE, '../.env.local');
for (const line of safeRead(ENV_FILE).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const AS_JSON = ARGS.includes('--json');
const DATE = arg('--date') ?? etDateFor(new Date().toISOString());
const IDS = (arg('--ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

main().catch((e) => {
  console.error('publish-swing-setups failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

async function main(): Promise<void> {
  const ids = IDS.length ? IDS : await idsForSession(DATE);
  const say = (...a: unknown[]) => { if (!AS_JSON) console.log(...a); };
  say(`session ${DATE}: ${ids.length} candidate setup${ids.length === 1 ? '' : 's'}${DRY ? ' (dry run)' : ''}`);

  const report = await publishSetups({ ids, todayEt: DATE, dryRun: DRY, requestId: 'publish-swing-setups' });

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`announced ${report.published} of ${report.considered} to ${report.notified} recipient(s)`);
    for (const s of report.perSetup) {
      console.log(`  ${s.symbol.padEnd(6)} ${s.refused ? `refused: ${s.refused}` : `${s.recipients} recipient(s)`}`);
    }
    const refusals = Object.entries(report.refusals);
    if (refusals.length) console.log(`refusals: ${refusals.map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }
  process.exit(0);
}

/** Every setup the ingest stamped with this ET session. The gate does the rest. */
async function idsForSession(date: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from('setups')
    .select('id')
    .eq('quote_snapshot->>et_date', date);
  if (error) throw new Error(`setups read failed — ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

function arg(name: string): string | undefined {
  const hit = ARGS.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}
function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}
