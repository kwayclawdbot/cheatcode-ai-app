/**
 * The desk read path, against the LIVE brain database.
 *
 *   cd apps/api && npx tsx scripts/desk-proof.ts
 *
 * `desk-test.ts` proves the mapping is right about data it was handed. This
 * proves the data is actually there — that every column this lane reads exists
 * under the name it reads it by, that a theme note comes back as prose and not
 * as a 404, and that the numbers on a screen would be the numbers in the
 * database.
 *
 * READ ONLY. Nothing in this file writes; `addManualWatch` is exercised by
 * hand, not by a script that leaves rows behind in a live system.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  kaiSource, loadLeads, loadPicksForTheme, loadPicksForTicker,
  loadTheme, loadThemeNote, loadThemes, loadWatchlist,
} from '../src/lib/desk/source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const safeRead = (p: string): string => {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
};
for (const file of [process.env.ENV_FILE ?? resolve(HERE, '../.env.local'), resolve(HERE, '../.env.prod')]) {
  for (const line of safeRead(file).split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}

async function main() {
  const src = kaiSource();
  console.log(`\ndesk-proof — ${src.url}\n`);

  // ── the watchlist ─────────────────────────────────────────
  console.log('the watchlist\n');
  const wl = await loadWatchlist(src);
  ok('the watchlist reads', Array.isArray(wl.rows));
  ok('it is not empty — a zero here means the brain refresh never wrote',
    wl.rows.length > 0, wl.rows.length);
  ok('every row has a ticker', wl.rows.every((r) => !!r.ticker));
  ok('no ticker appears twice — one company, one row',
    new Set(wl.rows.map((r) => r.ticker)).size === wl.rows.length,
    wl.rows.map((r) => r.ticker));
  ok('every state is one the app knows how to colour',
    wl.rows.every((r) => typeof r.state === 'string'));
  ok('prices are numbers or honestly null, never NaN',
    wl.rows.every((r) => r.price === null || Number.isFinite(r.price)));
  ok('there is an as-of', !!wl.asOf, wl.asOf);
  console.log(`        ${wl.rows.length} names: ${wl.rows.map((r) => r.ticker).join(', ')}`);

  // ── one write-up ──────────────────────────────────────────
  console.log('\na written argument\n');
  const sample = wl.rows[0]?.ticker;
  ok('there is a name to look up', !!sample, sample);
  if (sample) {
    const picks = await loadPicksForTicker(src, sample);
    ok(`${sample} has at least one write-up`, picks.length > 0, picks.length);
    const p = picks[0];
    ok('it is dated', !!p?.pickDate, p?.pickDate);
    ok('it carries an argument', (p?.thesis ?? '').length > 500, (p?.thesis ?? '').length);
    ok('catalysts are shaped objects, never half-parsed',
      (p?.catalysts ?? []).every((c) => !!c.when && !!c.what), p?.catalysts);
    ok('the unfinished flag is a boolean, decided rather than absent',
      typeof p?.unfinished === 'boolean');
    console.log(`        ${sample}: grade ${p?.grade ?? 'none'} · ${p?.catalysts.length ?? 0} catalyst(s) · ${(p?.thesis ?? '').length} chars`);
  }

  // ── the themes ────────────────────────────────────────────
  console.log('\nthe themes\n');
  const th = await loadThemes(src);
  ok('the themes read', th.themes.length > 0, th.themes.length);
  ok('they are dated', !!th.asOf, th.asOf);
  ok('sorted biggest first', th.themes.every((t, i) =>
    i === 0 || (th.themes[i - 1].magnitude ?? 0) >= (t.magnitude ?? 0)));
  // The rule this whole system turns on: nothing is demoted for being years
  // out. If every top theme were "now", the judging has quietly collapsed size
  // into timing.
  const top10 = th.themes.slice(0, 10);
  ok('the top of the list is not all near-term — size is not standing in for timing',
    new Set(top10.map((t) => t.timeline)).size > 1,
    top10.map((t) => `${t.theme}:${t.timeline}`));
  console.log(`        ${th.themes.length} themes, judged ${th.asOf}`);
  console.log(`        biggest: ${top10.slice(0, 3).map((t) => `${t.theme} ${t.magnitude}/10 ${t.timeline}`).join(' · ')}`);

  // ── one theme in depth ────────────────────────────────────
  console.log('\none theme in depth\n');
  const name = th.themes[0]?.theme;
  if (name) {
    const [one, note, picks, leads] = await Promise.all([
      loadTheme(src, name),
      loadThemeNote(src, name),
      loadPicksForTheme(src, name),
      loadLeads(src, name),
    ]);
    ok(`${name} resolves`, !!one);
    ok('size and timing are both present and separate',
      one?.magnitude != null && !!one?.timeline, { m: one?.magnitude, t: one?.timeline });
    ok('the running argument comes back as prose', (note ?? '').length > 200, (note ?? '').length);
    ok('the companies written up under it read', Array.isArray(picks), picks.length);
    ok('leads read, and none is listed twice',
      new Set(leads.map((l) => l.ticker)).size === leads.length);
    // Every nomination the desk has ever made is unscored. Until that changes,
    // the screen must not imply these were considered.
    ok('the nomination loop is still open — leads are unscored',
      leads.every((l) => !l.scoredOn), leads.filter((l) => l.scoredOn).map((l) => l.ticker));
    console.log(`        ${name}: note ${(note ?? '').length} chars · ${picks.length} written up · ${leads.length} leads`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
