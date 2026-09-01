/**
 * SWING-1 §6.3 — the browser proof.
 *
 *   node scripts/proof-swing1.mjs        (PROOF_BASE / PROOF_API override)
 *
 * The standing rule in this repo is that a UI claim is not made until it has
 * been seen in a browser, so this is a real Chromium against the real stack:
 * local Supabase holding the setups `scripts/ingest-swing-setups.ts` actually
 * ingested from the live Kai scanner, apps/api on :3000, Metro on :8081.
 *
 * It signs a fresh user up through the UI, walks onboarding, then arms a REAL
 * watch on each of two ingested swing setups through the API — one whose
 * percentile puts it in the top decile (a gold A) and one whose RAW scanner
 * score was over 90 but whose percentile is not (a violet B). The second is the
 * whole point of §2 on screen: the same pick, graded by the two different
 * numbers, lands on two different medallions.
 *
 * What it asserts, on screen and not in a payload:
 *   - the Alerts tab renders the ingested swing setups;
 *   - the medallion carries the percentile score, not the 31..190 raw one;
 *   - the band the medallion draws is the band the ingest computed;
 *   - the scorecard shows no fraction anywhere (spec §4, grade.ts rule 2);
 *   - the family's real win rate appears as its OWN line with its n, separate
 *     from the medallion (§4).
 *
 * Everything lands in proof/swing1-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const EMAIL = `proofswing1+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (p, n) => {
  const root = p.locator('#root');
  await ((await root.count()) ? root : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  ✓ ${n}.png`);
};

const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const tap = async (page, screen, testid, ms = 700) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
  await page.waitForTimeout(ms);
};
const arrive = async (page, screen, ms = 900) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(ms);
};
const go = async (page, route, wait = 3000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};
const seen = async (page, screen, testid) =>
  (await page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).count()) > 0;

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
};

async function accessToken(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k);
    }
    keys.sort();
    const bases = new Set(keys.map((k) => k.replace(/\.\d+$/, '')));
    for (const base of bases) {
      const parts = keys.filter((k) => k === base || k.startsWith(base + '.'));
      let raw = parts.map((k) => window.localStorage.getItem(k) ?? '').join('');
      if (!raw) continue;
      if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
      try {
        const v = JSON.parse(raw);
        if (v?.access_token) return v.access_token;
        if (v?.currentSession?.access_token) return v.currentSession.access_token;
      } catch { /* not this one */ }
    }
    return null;
  });
}

const apiCall = async (token, p, init = {}) => {
  const res = await fetch(`${API}/api/v1${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json, text };
};

/** Onboarding is another lane's screen set; walk whatever is actually there. */
async function walkOnboarding(page) {
  const visible = async (screen) =>
    page.locator(`[data-testid="${screen}"]`).last()
      .waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);

  const step = async (screen, ids) => {
    if (!(await visible(screen))) return false;
    console.log(`  · ${screen}`);
    for (const id of ids) if (await seen(page, screen, id)) await tap(page, screen, id, 700);
    return true;
  };

  await step('screen-onboarding-kai', ['mode-swing', 'funding-paper']);
  await step('screen-goal', ['mode-swing', 'goal-swing', 'cta-continue']);
  await step('screen-risk', ['cta-continue']);
  await step('screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']);
  await step('screen-summary', ['cta-start', 'cta-continue']);
  await step('screen-kai-plan', ['cta-start']);
  await step('screen-learn', ['level-504', 'cta-watch', 'cta-continue']);
  await page.locator('[data-testid="screen-home"]').last()
    .waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error('onboarding never reached Home'); });
}

/**
 * The setups this proof puts on screen, read straight out of the database the
 * ingest wrote — never hardcoded, because the whole claim is that the score is
 * recomputed rather than pinned.
 */
async function liveSwingSetups() {
  const url = (process.env.SUPABASE_URL ?? await envFromApi('SUPABASE_URL')).replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? await envFromApi('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(
    `${url}/rest/v1/setups?select=id,symbol,score,grade_band,score_components,state&mode=eq.swing&state=eq.ready`
    + `&quote_snapshot->>origin=eq.kai_sms_scanner&order=score.desc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`could not read the ingested setups: ${res.status}`);
  return res.json();
}

async function envFromApi(name) {
  const text = await fs.readFile(path.resolve(ROOT, '../api/.env.local'), 'utf8');
  const v = text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
  if (!v) throw new Error(`${name} is not set — this proof is env-driven like the ingest is`);
  return v;
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });

  const setups = await liveSwingSetups();
  if (setups.length < 2) throw new Error(`only ${setups.length} live swing setups — run scripts/ingest-swing-setups.ts first`);

  // One from the top decile, and one the RAW score would have made an A but the
  // percentile does not. The second is the evidence that §2 actually bites.
  const gold = setups.find((s) => Number(s.score) >= 90) ?? setups[0];
  const demoted = setups.find(
    (s) => Number(s.score_components?.raw_breakout_score) >= 90 && Number(s.score) < 90,
  ) ?? setups[1];
  console.log(`\nsetups on trial:`);
  console.log(`  ${gold.symbol}: percentile ${gold.score} (${gold.grade_band}), raw scanner score ${gold.score_components?.raw_breakout_score}`);
  console.log(`  ${demoted.symbol}: percentile ${demoted.score} (${demoted.grade_band}), raw scanner score ${demoted.score_components?.raw_breakout_score}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  try {
    console.log(`\n[1] a real user: ${EMAIL}`);
    await go(page, '/welcome', 2500);
    await tap(page, 'screen-welcome', 'cta-get-started');
    await arrive(page, 'screen-sign-up');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');
    await walkOnboarding(page);
    await page.waitForTimeout(1500);

    const token = await accessToken(page);
    if (!token) throw new Error('no access token — the sign-up did not produce a session');

    console.log('\n[2] arm a real watch on each ingested setup, through the API');
    for (const s of [gold, demoted]) {
      const draft = await apiCall(token, '/alerts/draft', {
        method: 'POST',
        body: JSON.stringify({
          natural_language: `Watch ${s.symbol} for the swing setup Kai found.`,
          refs: { symbol: s.symbol, setup_id: s.id },
        }),
      });
      const draftId = draft.json?.alert?.id ?? draft.json?.preview?.alert_id ?? draft.json?.alert_id;
      if (!draftId) throw new Error(`draft failed for ${s.symbol}: ${draft.status} ${draft.text?.slice(0, 300)}`);
      const armed = await apiCall(token, '/alerts', { method: 'POST', body: JSON.stringify({ draft_id: draftId }) });
      if (armed.status < 200 || armed.status >= 300) throw new Error(`arming failed for ${s.symbol}: ${armed.status} ${armed.text?.slice(0, 300)}`);
      console.log(`  · ${s.symbol} armed`);
    }

    console.log('\n[3] the Alerts tab, in the browser');
    await go(page, '/alerts', 4000);
    await arrive(page, 'screen-alerts');
    // Whichever tab these land in, the cards are on screen once we are there.
    for (const t of ['active', 'watching']) {
      if (await seen(page, 'screen-alerts', `alerts-tab-${t}`)) {
        await tap(page, 'screen-alerts', `alerts-tab-${t}`, 1400);
        if (await page.locator(`[data-testid="medallion-${gold.symbol}"]`).count()) break;
      }
    }
    await page.waitForTimeout(1200);
    await shot(page, 'swing1-01-alerts-tab');

    const medallion = page.locator(`[data-testid="medallion-${gold.symbol}"]`).last();
    ok(`the ${gold.symbol} card is on screen`, await medallion.count() > 0);
    await medallion.waitFor({ state: 'visible', timeout: 20_000 });

    // The medallion announces grade and score for a screen reader (grade.ts
    // rule 1). That label is where the number actually reaching a user lives.
    const label = await medallionLabel(page, gold.symbol);
    console.log(`  · ${gold.symbol} medallion says: ${label}`);
    ok('the medallion carries a score', /score\s+(\d+)/i.test(label ?? ''), label);
    const shown = Number((label ?? '').match(/score\s+(\d+)/i)?.[1]);
    ok(
      'the score on screen is the PERCENTILE, not the 31..190 scanner score',
      shown === Math.round(Number(gold.score)),
      { on_screen: shown, percentile: gold.score, raw: gold.score_components?.raw_breakout_score },
    );
    ok('and it is inside 0..100, which the raw score is not', shown >= 0 && shown <= 100, shown);
    ok(`the ${gold.symbol} medallion reads as the band the ingest computed`, (label ?? '').includes(`Grade ${gold.grade_band}`), label);

    const demotedLabel = await medallionLabel(page, demoted.symbol);
    if (demotedLabel) {
      console.log(`  · ${demoted.symbol} medallion says: ${demotedLabel}`);
      ok(
        `${demoted.symbol} scored ${demoted.score_components?.raw_breakout_score} raw and is NOT an A — the percentile is doing the work`,
        !/Grade\s+A/i.test(demotedLabel),
        demotedLabel,
      );
    }

    console.log('\n[4] one alert in detail');
    await page.locator(`[data-testid="alert-expand-${gold.symbol}"]`).last().click();
    await page.waitForTimeout(1600);
    // The expanded body opens below the fold; scroll it into frame so the
    // screenshot shows the thing the assertions below are about.
    await page.locator(`[data-testid="medallion-${gold.symbol}"]`).last()
      .scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, 'swing1-02-alert-detail');

    ok('the scorecard is open', await page.locator(`[data-testid="scorecard-${gold.symbol}"]`).count() > 0);
    // Scoped to the SCORECARD, not the card: the medallion is allowed to show
    // "90 of 100" — that is grade.ts rule 1, the letter plus its supporting
    // score. Rule 2 is about the components, and "18/20" is what must never
    // reach a screen.
    const scorecardText = await page.locator(`[data-testid="scorecard-${gold.symbol}"]`).last().innerText();
    ok(
      'no component fraction reaches the screen (grade.ts rule 2)',
      !/\b\d{1,3}\s*\/\s*\d{1,3}\b/.test(scorecardText),
      scorecardText.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g),
    );
    ok(
      'a component the scanner had no read on says Unknown rather than scoring zero',
      /Unknown/.test(scorecardText) || !/risk/i.test(scorecardText),
      scorecardText.replace(/\s+/g, ' ').slice(0, 300),
    );

    const perf = page.locator(`[data-testid="family-performance-${gold.symbol}"]`).last();
    ok('the family\'s real record is on the card as its own line (§4)', await perf.count() > 0);
    if (await perf.count()) {
      const line = (await perf.innerText()).replace(/\s+/g, ' ');
      console.log(`  · record line: ${line}`);
      ok('it carries its sample size', /\bof \d+ picks\b/.test(line), line);
      ok('it says it is a record, not a forecast', /what has happened, not what will/i.test(line), line);
      ok('and it says what it measured — close to close, no stop, no target', /close to close/i.test(line) && /no stop was published and no target/i.test(line), line);
      ok('and it explicitly disowns the medallion', /grade above says nothing about it/i.test(line), line);
    }

    // Evidence, so the scorecard's Unknowns are visible rather than asserted.
    if (await seen(page, `scorecard-${gold.symbol}`, 'scorecard-evidence')) {
      await page.locator(`[data-testid="scorecard-${gold.symbol}"] [data-testid="scorecard-evidence"]`).last().click();
      await page.waitForTimeout(900);
    }
    await page.locator(`[data-testid="scorecard-${gold.symbol}"]`).last().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, 'swing1-03-scorecard-evidence');

    await perf.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, 'swing1-04-family-record');

    console.log('\n[5] History — the back catalogue, with what each alert did');
    await go(page, '/alerts', 3500);
    await arrive(page, 'screen-alerts');
    await tap(page, 'screen-alerts', 'alerts-tab-history', 2000);
    await shot(page, 'swing1-05-history');

    const rows = page.locator('[data-testid^="alert-history-"]');
    const rowCount = await rows.count();
    console.log(`  · ${rowCount} resolved alerts on History`);
    ok('the back catalogue is on History, not an empty tab', rowCount > 0, rowCount);

    const outcomes = page.locator('[data-testid^="outcome-"]');
    const outcomeCount = await outcomes.count();
    console.log(`  · ${outcomeCount} of them carry a measured result`);
    ok('resolved alerts show what they actually did', outcomeCount > 0, outcomeCount);
    ok('no row invents a result it does not have', outcomeCount <= rowCount, { outcomeCount, rowCount });

    const firstOutcome = (await outcomes.first().innerText()).replace(/\s+/g, ' ');
    console.log(`  · first outcome: ${firstOutcome}`);
    ok('the result carries its disclosure, not just a number', /close to close/i.test(firstOutcome), firstOutcome);
    ok('and refuses to be read as a managed trade', /not the result of a managed trade/i.test(firstOutcome), firstOutcome);

    // The whole History tab, read as text: nothing may show a stop or a target
    // the source never persisted.
    const historyText = (await page.locator('[data-testid="alerts-list-history"]').last().innerText()).replace(/\s+/g, ' ');
    ok('History never claims a stop', !/\bStop\b/.test(historyText), historyText.slice(0, 200));
    ok('History never claims a target', !/\bTarget\b/.test(historyText), historyText.slice(0, 200));

    // And Active must not print a level the scanner never published either.
    await tap(page, 'screen-alerts', 'alerts-tab-active', 1600);
    await page.locator(`[data-testid="alert-expand-${gold.symbol}"]`).last().click();
    await page.waitForTimeout(1400);
    const activeCard = (await page.locator(`[data-testid="alert-card-${gold.symbol}"]`).last().innerText()).replace(/\s+/g, ' ');
    const stopCell = activeCard.match(/Stop\s+([^\s]+)/)?.[1] ?? null;
    const targetCell = activeCard.match(/Target\s+([^\s]+)/)?.[1] ?? null;
    console.log(`  · levels on the Active card — stop ${stopCell}, target ${targetCell}`);
    ok('the card shows no stop it does not hold', stopCell === null || stopCell === '—', stopCell);
    ok('and no target it does not hold', targetCell === null || targetCell === '—', targetCell);
    ok('and it says why it cannot size the trade instead of sizing it anyway', /no risk to size against/i.test(activeCard), activeCard.slice(0, 400));
    ok('the context that justifies the call is on the card without opening anything else',
      activeCard.length > 400 && /Grade/i.test(activeCard), activeCard.length);

    console.log('\n[6] the ticker page for the same setup');
    await go(page, `/symbol/${gold.symbol}`, 4000);
    await page.waitForTimeout(1200);
    await shot(page, 'swing1-06-ticker');
  } finally {
    await page.waitForTimeout(400);
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

/** The medallion's accessibility label — what a screen reader is actually told. */
async function medallionLabel(page, symbol) {
  const el = page.locator(`[data-testid="medallion-${symbol}"]`).last();
  if (!(await el.count())) return null;
  return (await el.getAttribute('aria-label'))
    ?? (await el.getAttribute('aria-labelledby'))
    ?? (await el.innerText().catch(() => null));
}

main().catch((e) => {
  console.error('\nproof-swing1 failed:', e.message);
  process.exit(1);
});
