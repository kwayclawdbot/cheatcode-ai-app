/**
 * SWING-1 — the Kai morning alerts, ingested into the app as swing setups.
 *
 *   cd apps/api
 *   npx tsx scripts/ingest-swing-setups.ts --since=2026-06-01
 *   npx tsx scripts/ingest-swing-setups.ts --since=2026-06-01 --dry-run
 *   npx tsx scripts/ingest-swing-setups.ts --json          (machine-readable summary)
 *
 * SOURCE  Kai Supabase, READ ONLY (`lib/swing/source.ts` can only issue GET).
 *         That project is the live SMS product with paying subscribers; SWING-2
 *         owns writes to it and this lane owns none.
 * TARGET  This app's own Supabase, `setups` (+ the `instruments` rows the FK
 *         needs). Both ends are env-driven, so flipping off the local stack onto
 *         the hosted one is a change of environment, not of code.
 *
 * IDEMPOTENT BY (ticker, ET date, alert_type) — the same key `alert_outcomes.py`
 * uses, so "how many picks were there" has one answer across both systems. The
 * setup id is a v5 UUID of that key, so a re-run addresses the same row; and the
 * run compares a fingerprint first, so an unchanged window writes NOTHING at all.
 *
 * THE SCORE IS A PERCENTILE, recomputed every run over a trailing 180 days of
 * long picks. The window is read back further than `--since` for exactly this
 * reason: a pick ingested on day one still has to be ranked against the six
 * months behind it.
 *
 * WHICH FAMILY. `kai_long` only — see ALERT_TYPE_FAMILY in lib/swing/ingest.ts.
 * The brief's `kai_long%` prefix also matches two five-minute opening-range
 * families, and `kai_short` is the other half of what the morning job sends.
 * Neither is ingested, both are named, and every run prints what it declined.
 *
 * WHAT EACH PICK DID travels with it. `alert_performance`'s pick-level row is
 * stamped onto the setup so the History tab can show the result. It is a
 * close-to-close hold from the published trigger — the scanner persisted a stop
 * on 3 of 1,307 long picks — so nothing here may be rendered as a managed trade,
 * and the copy that ships with the number says so.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PERCENTILE_WINDOW_DAYS,
  bandSplit,
  dedupePicks,
  etDateFor,
  familyPerformance,
  fingerprint,
  outcomeFor,
  SWING_LONG_TYPES,
  familyOf,
  isIngestibleType,
  medallionFamilyFor,
  percentileRank,
  pct,
  pickKey,
  setupFor,
  type ScannerAlert,
  type ScannerOutcome,
  type SetupInsert,
} from '../src/lib/swing/ingest.ts';
import { kaiSource, readAll } from '../src/lib/swing/source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE ?? resolve(HERE, '../.env.local');

for (const line of safeRead(ENV_FILE).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const AS_JSON = ARGS.includes('--json');
const SINCE = arg('--since') ?? isoDaysAgo(120);
const WINDOW_DAYS = Number(arg('--window-days') ?? PERCENTILE_WINDOW_DAYS);

export type IngestSummary = {
  since: string;
  window_days: number;
  source_rows: number;
  picks_in_window: number;
  picks_ingested: number;
  declined: Record<string, Record<string, number>>;
  retired: number;
  duplicate_keys: number;
  inserted: number;
  updated: number;
  unchanged: number;
  instruments_added: number;
  band_split: ReturnType<typeof bandSplit>;
  family_performance: ReturnType<typeof familyPerformance>;
  dry_run: boolean;
};

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
  const since = opts.since ?? SINCE;
  const say = (...a: unknown[]) => { if (!opts.quiet && !AS_JSON) console.log(...a); };

  const src = kaiSource();
  const now = new Date();

  /* ---- 1. the source, long family only -------------------------------- */
  // Read back an extra window so the earliest ingested pick can still be ranked
  // against a full trailing distribution.
  const readFrom = isoDaysBefore(since, WINDOW_DAYS + 1);
  say(`source: ${src.url} (read only)`);
  say(`window: picks since ${since}, ranked against ${WINDOW_DAYS} days back to ${readFrom}`);

  const rows = await readAll<ScannerAlert>(
    src,
    'sent_alerts',
    [
      'select=id,ticker,alert_type,alert_price,breakout_score,quality_score,catalyst_score,flow_score,'
        + 'volume_ratio,rsi_at_alert,setup_label,detected_pattern,humanized_message,sector,sector_stance,'
        + 'catalyst_type,scan_metadata,stop_price,pattern_target,next_resistance,sent_at,market_session',
      // Driven by the family map, not a `kai_long%` prefix: two of the three
      // types that prefix matches are five-minute opening-range breaks, and a
      // filter that cannot tell them apart is how one gets labelled 'swing'.
      `alert_type=in.(${SWING_LONG_TYPES.join(',')})`,
      `sent_at=gte.${readFrom}`,
      'order=id.asc',
    ].join('&'),
  );

  // The filter above is the source of truth for which families are in; this is
  // the belt, and it must stay a no-op.
  const strayed = rows.filter((r) => !isIngestibleType(r.alert_type));
  if (strayed.length) throw new Error(`the source returned ${strayed.length} rows outside the swing family — check ALERT_TYPE_FAMILY`);
  const longRows = rows;

  const population = dedupePicks(longRows);
  const populationScores = [...population.values()].map((a) => ({
    date: etDateFor(a.sent_at),
    score: Number(a.breakout_score),
  }));

  const ingestKeys = [...population.entries()].filter(([, a]) => etDateFor(a.sent_at) >= since);
  say(`picks: ${population.size} in the ranking window, ${ingestKeys.length} to ingest (from ${longRows.length} rows)`);

  // What this lane passed over, and under which name. An exclusion nobody can
  // see is indistinguishable from a filter that silently missed something.
  const declined = await declinedFamilies(src, since);
  for (const [family, types] of Object.entries(declined)) {
    say(`declined (${family}): ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  }

  /* ---- 2. the honest performance line ---------------------------------- */
  const outcomes = await readAll<ScannerOutcome>(
    src,
    'alert_performance',
    'select=alert_id,direction,alert_type,anchor_date,win_5d,gain_5d_pct,mfe_5d_pct,mae_5d_pct,'
      + 'sessions_elapsed,resolved,outcome_method,is_primary'
      + '&is_primary=is.true&direction=eq.long&win_5d=not.is.null&order=id.asc',
  );
  const perf = familyPerformance(outcomes);
  // Per-pick, keyed by the `sent_alerts.id` the grader anchored to. The grader
  // marks ONE row per pick `is_primary`, and `dedupePicks` picks the same lowest
  // id, so the two agree on which row a result belongs to.
  const outcomeByAlertId = new Map<number, ReturnType<typeof outcomeFor>>();
  for (const o of outcomes) if (o.alert_id !== null) outcomeByAlertId.set(Number(o.alert_id), outcomeFor(o));
  if (perf) say(`family: ${perf.wins}/${perf.n} won at +5 sessions — ${perf.win_pct}% (as of ${perf.as_of})`);
  else say('family: no graded outcomes for this family yet — the line is omitted rather than guessed');

  /* ---- 3. map ---------------------------------------------------------- */
  const setups: SetupInsert[] = [];
  for (const [key, alert] of ingestKeys) {
    const score = percentileRank(Number(alert.breakout_score), etDateFor(alert.sent_at), populationScores, WINDOW_DAYS);
    const row = setupFor({ alert, key, score, now });
    if (perf) (row.score_components as Record<string, unknown>).family_performance = perf;
    const outcome = outcomeByAlertId.get(Number(alert.id));
    if (outcome) (row.score_components as Record<string, unknown>).outcome = outcome;
    setups.push(row);
  }

  const split = bandSplit(setups);
  say(
    `bands: A ${split.letters.A} (${pct(split.letters.A, split.n)}%) · `
    + `B ${split.letters.B} (${pct(split.letters.B, split.n)}%) · `
    + `C ${split.letters.C} (${pct(split.letters.C, split.n)}%)`,
  );
  say(`medallion: ${Object.entries(split.families).map(([k, v]) => `${k} ${pct(v, split.n)}%`).join(' · ')}`);

  if (DRY) {
    say('dry run — nothing written');
    return summary({ since, rows: rows.length, population, ingested: setups.length, declined, retired: 0, dupes: longRows.length - population.size, inserted: 0, updated: 0, unchanged: 0, instruments: 0, split, perf, dry: true });
  }

  /* ---- 4. write -------------------------------------------------------- */
  const retired = await retireForeignFamilies();
  if (retired) say(`retired: ${retired} setup${retired === 1 ? '' : 's'} an earlier run ingested under a family this lane no longer claims`);

  const instrumentsAdded = await ensureInstruments([...new Set(setups.map((s) => s.symbol))]);
  if (instrumentsAdded) say(`instruments: ${instrumentsAdded} new symbol${instrumentsAdded === 1 ? '' : 's'}`);

  const existing = await loadExisting(setups.map((s) => s.id));
  const toWrite: SetupInsert[] = [];
  let unchanged = 0;
  let updated = 0;
  let inserted = 0;
  for (const s of setups) {
    const cur = existing.get(s.id);
    if (!cur) { inserted += 1; toWrite.push(s); continue; }
    if (fingerprint(cur) === fingerprint(s as unknown as Record<string, unknown>)) { unchanged += 1; continue; }
    updated += 1;
    toWrite.push(s);
  }

  for (let i = 0; i < toWrite.length; i += 200) {
    await appWrite('setups', toWrite.slice(i, i + 200), 'resolution=merge-duplicates');
  }
  say(`setups: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged`);

  return summary({ since, rows: rows.length, population, ingested: setups.length, declined, retired, dupes: longRows.length - population.size, inserted, updated, unchanged, instruments: instrumentsAdded, split, perf, dry: false });

  function summary(o: {
    since: string; rows: number; population: Map<string, ScannerAlert>; ingested: number;
    declined: Record<string, Record<string, number>>; retired: number;
    dupes: number; inserted: number; updated: number; unchanged: number;
    instruments: number; split: ReturnType<typeof bandSplit>; perf: ReturnType<typeof familyPerformance>; dry: boolean;
  }): IngestSummary {
    return {
      since: o.since,
      window_days: WINDOW_DAYS,
      source_rows: o.rows,
      picks_in_window: o.population.size,
      picks_ingested: o.ingested,
      declined: o.declined,
      retired: o.retired,
      duplicate_keys: o.dupes,
      inserted: o.inserted,
      updated: o.updated,
      unchanged: o.unchanged,
      instruments_added: o.instruments,
      band_split: o.split,
      family_performance: o.perf,
      dry_run: o.dry,
    };
  }
}

/* ------------------------------------------------------------------ */
/* The app's own database                                               */
/* ------------------------------------------------------------------ */

function appDb(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return { url, key };
}

async function appWrite(table: string, rows: unknown[], prefer: string): Promise<void> {
  if (!rows.length) return;
  const db = appDb();
  const res = await fetch(`${db.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: db.key,
      Authorization: `Bearer ${db.key}`,
      'Content-Type': 'application/json',
      Prefer: `${prefer},return=minimal`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`write ${table} failed: ${res.status} ${await res.text()}`);
}

async function appRead<T>(table: string, query: string): Promise<T[]> {
  const db = appDb();
  const res = await fetch(`${db.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`read ${table} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

/**
 * What the family map declines, counted, in the same window. One extra GET
 * against the source so the run says out loud which families it passed over —
 * the opening-range longs above all, which look like `kai_long%` and are not
 * swing at all.
 */
async function declinedFamilies(src: Parameters<typeof readAll>[0], since: string): Promise<Record<string, Record<string, number>>> {
  const rows = await readAll<{ alert_type: string | null }>(src, 'sent_alerts', `select=alert_type&sent_at=gte.${since}`);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const family = familyOf(r.alert_type);
    if (family === 'swing_long') continue;
    const t = (r.alert_type ?? 'null').toLowerCase();
    (out[family] ??= {})[t] = ((out[family][t] ?? 0) + 1);
  }
  return out;
}

/**
 * Rows a PREVIOUS run of this script wrote under a family it no longer claims.
 *
 * The first cut of this lane read `alert_type LIKE 'kai_long%'` and so wrote 60
 * opening-range breaks into `setups` as `mode='swing'`. They are mislabelled,
 * this script owns them (`quote_snapshot.origin = 'kai_sms_scanner'`), and
 * leaving them would mean the database disagrees with the code that filled it.
 * Nothing outside this ingest's own rows is touched.
 */
async function retireForeignFamilies(): Promise<number> {
  const mine = await appRead<{ id: string; quote_snapshot: Record<string, unknown> }>(
    'setups',
    "select=id,quote_snapshot&mode=eq.swing&quote_snapshot->>origin=eq.kai_sms_scanner",
  );
  const foreign = mine.filter((r) => !isIngestibleType(String(r.quote_snapshot?.alert_type ?? '')));
  if (!foreign.length) return 0;
  const db = appDb();
  let gone = 0;
  const held: string[] = [];
  // One at a time, because a row something else has adopted — a circle, a plan,
  // a position — must NOT be deleted out from under it. This script cleans up
  // after itself; it does not delete other people's objects to do so.
  for (const r of foreign) {
    const res = await fetch(`${db.url}/rest/v1/setups?id=eq.${r.id}`, {
      method: 'DELETE',
      headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, Prefer: 'return=minimal' },
    });
    if (res.ok) { gone += 1; continue; }
    const text = await res.text();
    if (/foreign key/i.test(text)) { held.push(r.id); continue; }
    throw new Error(`retire failed: ${res.status} ${text}`);
  }
  if (held.length) {
    console.warn(
      `  ! ${held.length} mislabelled setup${held.length === 1 ? '' : 's'} referenced by something else and left in place: ${held.slice(0, 5).join(', ')}`,
    );
  }
  return gone;
}

/** `setups.symbol` has an FK to `instruments`. Add the ones the picks need. */
async function ensureInstruments(symbols: string[]): Promise<number> {
  if (!symbols.length) return 0;
  const known = new Set(
    (await appRead<{ symbol: string }>('instruments', `select=symbol&symbol=in.(${symbols.join(',')})`))
      .map((r) => r.symbol),
  );
  const missing = symbols.filter((s) => !known.has(s));
  if (!missing.length) return 0;
  await appWrite(
    'instruments',
    missing.map((symbol) => ({ symbol, kind: 'equity', active: true, meta: { source: 'kai_sms_scanner' } })),
    'resolution=ignore-duplicates',
  );
  return missing.length;
}

async function loadExisting(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await appRead<Record<string, unknown>>(
      'setups',
      `select=id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,annotations,quote_snapshot,valid_until,scanner_run_id&id=in.(${chunk.join(',')})`,
    );
    for (const r of rows) out.set(String(r.id), r);
  }
  return out;
}

/* ------------------------------------------------------------------ */

function arg(name: string): string | null {
  const hit = ARGS.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function isoDaysBefore(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

function safeRead(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

export { pickKey, medallionFamilyFor };
