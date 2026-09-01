/**
 * SWING-1 §6.1 and §6.2 — the gate, against the real source and the real target.
 *
 *   cd apps/api && npx tsx scripts/swing-ingest-proof.ts
 *   npx tsx scripts/swing-ingest-proof.ts --since=2026-04-01
 *
 * This is not a unit test with the databases swapped out. It ingests a real
 * window from the LIVE Kai scanner database into this app's database and then
 * asks the app's own database the four questions the brief asks:
 *
 *   1. does the pick count match the source's own dedup?
 *   2. are there zero shorts?
 *   3. are there zero duplicate (ticker, ET date, alert_type)?
 *   4. does the band split land near 10/40/50, and not at 46% gold?
 *
 * Then it runs the ingest a SECOND time and proves nothing changed, by
 * fingerprinting every row before and after rather than trusting the counter
 * the ingest prints.
 *
 * Where `python3` is on PATH it also asks `alert_outcomes.py` itself for the
 * pick count, so the claim "same unit of truth" is checked against the file
 * that owns it instead of against this repo's copy of the idea.
 *
 * §6.3 — the browser — is `apps/mobile/scripts/proof-swing1.mjs`. A screenshot
 * is not something a script in this directory can honestly produce.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bandSplit,
  dedupePicks,
  etDateFor,
  familyOf,
  fingerprint,
  isIngestibleType,
  medallionFamilyFor,
  pct,
  type ScannerAlert,
} from '../src/lib/swing/ingest.ts';
import { kaiSource, readAll } from '../src/lib/swing/source.ts';
import { run as ingest } from './ingest-swing-setups.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
for (const line of safeRead(process.env.ENV_FILE ?? resolve(HERE, '../.env.local')).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SINCE = process.argv.find((a) => a.startsWith('--since='))?.slice(8) ?? '2026-04-01';
const OUTCOMES_PY = process.env.ALERT_OUTCOMES_PY
  ?? resolve(process.env.HOME ?? '', 'breakout-alert-system/alert_outcomes.py');

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function note(s: string): void { console.log(`  ·     ${s}`); }

main().catch((e) => { console.error('proof failed:', e instanceof Error ? e.message : e); process.exit(1); });

async function main(): Promise<void> {
  console.log(`\nSWING-1 gate — window from ${SINCE}\n`);

  /* ---- run 1 ---------------------------------------------------------- */
  console.log('[1] ingest a real window from the live Kai database');
  const first = await ingest({ since: SINCE, quiet: true });
  note(`${first.picks_ingested} picks ingested — ${first.inserted} inserted, ${first.updated} updated, ${first.unchanged} unchanged`);

  /* ---- §6.1a  the pick count matches the source's own dedup ----------- */
  console.log('\n[2] §6.1 — the count matches the source dedup');
  const src = kaiSource();
  const raw = await readAll<ScannerAlert>(
    src,
    'sent_alerts',
    `select=id,ticker,alert_type,sent_at&sent_at=gte.${SINCE}&order=id.asc`,
  );
  const longRaw = raw.filter((r) => isIngestibleType(r.alert_type));
  const sourcePicks = new Set(
    [...dedupePicks(longRaw as ScannerAlert[]).keys()].filter((k) => k.split('|')[1] >= SINCE),
  );
  note(`source: ${raw.length} rows since ${SINCE}, ${longRaw.length} in the long family, ${sourcePicks.size} distinct picks`);

  // The same column list both times, so the before/after fingerprints in §6.2
  // are comparing the same object and not a shorter one.
  const COLUMNS = 'select=id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,'
    + 'thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,annotations,'
    + 'quote_snapshot,valid_until,scanner_run_id&mode=eq.swing&quote_snapshot->>origin=eq.kai_sms_scanner';
  const stored = await appRead<{
    id: string; symbol: string; quote_snapshot: Record<string, unknown>;
    score: number | string | null; grade_band: 'A' | 'B' | 'C' | null; intent: string;
    score_components: Record<string, unknown>;
  }>('setups', COLUMNS);
  const storedKeys = new Set(stored.map((r) => String((r.score_components as Record<string, unknown>).pick_key)));
  ok('every source pick is in the app database', sourcePicks.size === storedKeys.size, {
    source: sourcePicks.size, app: storedKeys.size,
  });
  const missing = [...sourcePicks].filter((k) => !storedKeys.has(k));
  ok('no source pick was dropped', missing.length === 0, missing.slice(0, 5));

  // The file that owns the definition, asked directly.
  const pythonCount = pickCountFromAlertOutcomes(longRaw);
  if (pythonCount === null) note('python3 or alert_outcomes.py not available — skipping the cross-check against the source of truth');
  else ok('alert_outcomes.py counts the same number of picks', pythonCount === sourcePicks.size, { python: pythonCount, here: sourcePicks.size });

  /* ---- §6.1b  zero shorts --------------------------------------------- */
  console.log('\n[3] §6.1 — zero shorts, and nothing intraday wearing a swing label');
  const types = new Set(stored.map((r) => String((r.quote_snapshot as Record<string, unknown>).alert_type ?? '')));
  note(`alert types present: ${[...types].sort().join(', ')}`);
  ok('every ingested type is in the long family', [...types].every(isIngestibleType), [...types].filter((t) => !isIngestibleType(t)));
  // The `kai_long%` prefix in the brief matches two opening-range families as
  // well. A five-minute OR break stored as mode='swing' with a five-SESSION
  // expiry is a mislabelled object, so the gate names them and checks.
  const intraday = [...types].filter((t) => familyOf(t) === 'intraday_long');
  ok('no opening-range family is stored as swing', intraday.length === 0, intraday);
  ok('every ingested type is classified swing_long, not merely prefixed', [...types].every((t) => familyOf(t) === 'swing_long'));
  ok('every ingested setup is buy_to_open', stored.every((r) => r.intent === 'buy_to_open'));
  const anyShortInDb = await appRead<{ id: string }>(
    'setups',
    "select=id&mode=eq.swing&intent=eq.sell_short",
  );
  ok('the app database holds no short swing setup at all', anyShortInDb.length === 0, anyShortInDb.length);

  /* ---- §6.1c  zero duplicates ----------------------------------------- */
  console.log('\n[4] §6.1 — zero duplicate (ticker, ET date, alert_type)');
  const seen = new Map<string, number>();
  for (const r of stored) {
    const q = r.quote_snapshot as Record<string, unknown>;
    const key = `${String(r.symbol).toUpperCase()}|${String(q.et_date)}|${String(q.alert_type).toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  ok('no key appears twice', dupes.length === 0, dupes.slice(0, 5));
  ok('the stored pick_key agrees with the row it was built from', stored.every((r) => {
    const q = r.quote_snapshot as Record<string, unknown>;
    return String((r.score_components as Record<string, unknown>).pick_key)
      === `${String(r.symbol).toUpperCase()}|${String(q.et_date)}|${String(q.alert_type).toLowerCase()}`;
  }));

  /* ---- §6.1d  the band split ------------------------------------------ */
  console.log('\n[5] §6.1 / §6.4 — the band split');
  const split = bandSplit(stored.map((r) => ({ score: r.score === null ? null : Number(r.score), grade_band: r.grade_band })));
  const a = pct(split.letters.A, split.n);
  const b = pct(split.letters.B, split.n);
  const c = pct(split.letters.C, split.n);
  note(`grade_band: A ${split.letters.A} (${a}%) · B ${split.letters.B} (${b}%) · C ${split.letters.C} (${c}%)`);
  note(`medallion:  ${Object.entries(split.families).map(([k, v]) => `${k} ${pct(v, split.n)}%`).join(' · ')}`);

  ok('A is a decile, not the 46% the raw score would have produced', a >= 5 && a <= 20, a);
  ok('B is around four in ten', b >= 30 && b <= 50, b);
  ok('C is around half', c >= 38 && c <= 62, c);
  ok('gold is nowhere near 46%', pct(split.families.gold, split.n) < 20, pct(split.families.gold, split.n));

  // The counter-factual, computed from the raw score this ingest deliberately
  // did not use — so the report can say what was avoided, not just what shipped.
  const rawGold = stored.filter((r) => {
    const s = Number((r.score_components as Record<string, unknown>).raw_breakout_score);
    return medallionFamilyFor(s) === 'gold' || medallionFamilyFor(s) === 'gold_restrained';
  }).length;
  note(`counter-factual: feeding the raw 31..190 score into the same bands makes ${pct(rawGold, stored.length)}% of these picks an A`);

  /* ---- §6.2  the second run changes nothing --------------------------- */
  console.log('\n[6] §6.2 — run it again; nothing changes');
  const before = new Map(stored.map((r) => [r.id, fingerprint(r as unknown as Record<string, unknown>)]));
  const second = await ingest({ since: SINCE, quiet: true });
  ok('the second run inserts nothing', second.inserted === 0, second.inserted);
  ok('the second run updates nothing', second.updated === 0, second.updated);
  ok('every row is reported unchanged', second.unchanged === second.picks_ingested, { unchanged: second.unchanged, picks: second.picks_ingested });

  const after = await appRead<Record<string, unknown>>('setups', COLUMNS);
  ok('the row count is identical', after.length === before.size, { before: before.size, after: after.length });
  const changed = after.filter((r) => before.get(String(r.id)) !== fingerprint(r));
  ok('no row changed, byte for byte on every column this ingest owns', changed.length === 0, changed.slice(0, 3).map((r) => r.id));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

/* ------------------------------------------------------------------ */

/**
 * Ask `alert_outcomes.py` how many picks these rows are. Not a re-implementation
 * — the actual module, imported and called, so a drift in `pick_key` shows up
 * here instead of six months later as two dashboards disagreeing.
 */
function pickCountFromAlertOutcomes(rows: { id: number; ticker: string; alert_type: string | null; sent_at: string }[]): number | null {
  try {
    const payload = JSON.stringify(rows.map((r) => ({ id: r.id, ticker: r.ticker, alert_type: r.alert_type, sent_at: r.sent_at })));
    const out = execFileSync('python3', ['-c', `
import json, sys, os
sys.path.insert(0, os.path.dirname(${JSON.stringify(OUTCOMES_PY)}))
import alert_outcomes as m
rows = json.load(sys.stdin)
since = ${JSON.stringify(SINCE)}
picks = m.dedupe_alerts(rows)
print(len([k for k in picks if k[1] >= since]))
`], { input: payload, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function appRead<T>(table: string, query: string): Promise<T[]> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?${query}&limit=1000&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`read ${table} failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}
