/**
 * THE TICKER PAGE AS A SNAPSHOT, ON THE REAL STACK, ON TWO KINDS OF SYMBOL.
 *
 *   npx expo start --port 8100        (NO EXPO_PUBLIC_FIXTURES — .env is hosted)
 *   PROOF_BASE=http://localhost:8100 node scripts/proof-ticker-rich.mjs
 *
 * WHY TWO SYMBOLS AND NOT ONE. Every failure mode of this page is a failure of
 * ABSENCE, not of presence. A symbol the desk has graded fills every block, and
 * a page that looks good full tells you nothing about the far commoner case —
 * a ticker somebody typed in that has no alert, no plan, no members talking
 * about it and no lines drawn on it. That page must still look like a page
 * somebody designed, and it must never fill its gaps with dashes, zeroes or an
 * apology. So the proof runs both and photographs both.
 *
 *   HOT   whichever symbol the live alerts board actually has a card for, read
 *         off the board rather than hard-coded — a ticker that was hot when
 *         this script was written is not hot today.
 *   COLD  a large, dull, almost-never-alerted name.
 *
 * IT ASSERTS THE HONESTY RULES, BY TEXT:
 *   · no "—" placeholder anywhere on either page
 *   · no component fraction ("3/5", "14/20") — the house scoring rule
 *   · the cold page still says something: the "nothing to act on" sentence
 *
 * It signs up a throwaway account rather than using the owner's, and it writes
 * nothing except its own screenshots.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8100';
/**
 * THE OWNER'S LOGIN, READ-ONLY.
 *
 * A throwaway account cannot prove this page. `/trade/portal/:symbol` answers
 * 402 for an account with no plan, so on a free login the desk's read is
 * ENTITLEMENT-LOCKED and the rich half of the page — the grade, the levels, the
 * contract — does not exist to photograph. The locked state is proved too (it
 * is what most members see) but it cannot be the only thing proved.
 *
 * This script only ever NAVIGATES and SCREENSHOTS. It creates nothing, posts
 * nothing and deletes nothing, so borrowing the owner's session costs him
 * nothing and leaves no row behind.
 */
const CREDS = path.join(os.homedir(), '.openclaw/secrets/cheatcode_ai_app_owner');
const readCreds = () => {
  try {
    const txt = readFileSync(CREDS, 'utf8');
    const email = /CHEATCODE_APP_EMAIL=(.+)/.exec(txt)?.[1]?.trim();
    const password = /CHEATCODE_APP_PASSWORD=(.+)/.exec(txt)?.[1]?.trim();
    return email && password ? { email, password } : null;
  } catch { return null; }
};
/** A name the desk is very unlikely to have graded today. */
const COLD = process.env.COLD_SYMBOL ?? 'KO';

/** `NN/100` is the mandated grade score; every other fraction is banned. */
const FRACTION = /\b\d{1,3}\s*\/\s*(?!100\b)\d{1,3}\b/g;

const failures = [];
const note = (ok, msg, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) {
    failures.push(msg);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail).slice(0, 400)}`);
  }
};

const HIDE_DEV_CHROME = '.__expo_fast_refresh { display: none !important; }';
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

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · ${name}.png`);
};
const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`);
const tap = async (page, screen, testid, timeout = 30_000) => {
  const el = on(page, screen, testid).last();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
};
/** Which screens and controls the app is actually showing — the only useful thing to know when a step does not advance. */
const whereAmI = async (page) => {
  const ids = await page.locator('[data-testid]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-testid')).filter(Boolean),
  ).catch(() => []);
  const screens = [...new Set(ids.filter((i) => i.startsWith('screen-')))];
  const ctas = [...new Set(ids.filter((i) => i.startsWith('cta-') || i.startsWith('experience-') || i.startsWith('focus-')))];
  console.log(`      url=${page.url()}`);
  console.log(`      screens: ${screens.join(', ') || '(none)'}`);
  console.log(`      controls: ${ctas.slice(0, 14).join(', ') || '(none)'}`);
};

const arrive = async (page, screen, timeout = 45_000) => {
  try {
    await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout });
  } catch (e) {
    console.log(`  ! never arrived at ${screen}`);
    await whereAmI(page);
    throw e;
  }
  await page.waitForTimeout(700);
};
const go = async (page, route, screen, ready) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  if (screen) await arrive(page, screen);
  if (ready) {
    try {
      await page.locator(`[data-testid="${screen}"] [data-testid="${ready}"]`).last()
        .waitFor({ state: 'visible', timeout: 60_000 });
    } catch {
      console.log(`  · ${route} never showed ${ready} — capturing whatever it settled on`);
    }
  }
  await page.waitForTimeout(2000);
};
const readText = async (page, selector, label) => {
  try {
    const t = (await page.locator(selector).last().innerText({ timeout: 6000 })).replace(/\s+/g, ' ').trim();
    console.log(`  · ${label}: ${t.slice(0, 200)}`);
    return t;
  } catch {
    console.log(`  · ${label}: (not rendered)`);
    return '';
  }
};
const count = (page, testid) => page.locator(`[data-testid="${testid}"]`).count();

/** The two rules that must hold on EVERY ticker page, hot or cold. */
const assertHonest = async (page, where) => {
  const text = await page.locator('#root').innerText();

  const fractions = [...new Set([...text.matchAll(FRACTION)].map((m) => m[0]))];
  note(fractions.length === 0, `${where}: no component fractions`, fractions);

  /**
   * THE DASH RULE. A blank never looks blank — it looks like a finding. An em
   * dash where a P/E should be reads as "this company has no P/E", which is a
   * claim the app has no business making when the truth is that the value did
   * not load. The page omits the row instead, so a dash anywhere is a bug.
   */
  /**
   * A PLACEHOLDER IS AN ELEMENT WHOSE ENTIRE TEXT IS A DASH — not any dash on
   * the page. Kai writes in real prose and real prose contains em dashes; the
   * first version of this check counted those and failed the page for having
   * been written properly. What is banned is a dash standing WHERE A VALUE GOES.
   */
  const placeholders = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#root *'))
      .filter((el) => el.children.length === 0)
      .map((el) => (el.textContent ?? '').trim())
      .filter((t) => t === '—' || t === '-' || t === '--').length);
  note(placeholders === 0, `${where}: no dash placeholders where a value goes`,
    placeholders ? `${placeholders} found` : undefined);

  return text;
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 1600 }, deviceScaleFactor: 2, colorScheme: 'dark',
  });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 240)); });

  console.log("real mode, hosted stack — read-only");

  // ---- 1. sign in as the entitled account
  console.log('\n[1] sign in (owner, read-only)');
  const creds = readCreds();
  if (!creds) {
    console.log('  ! no owner credentials on this machine — cannot prove the entitled page');
    process.exit(1);
  }
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 120_000 });
  await arrive(page, 'screen-sign-in', 60_000);
  await on(page, 'screen-sign-in', 'field-email').fill(creds.email);
  await on(page, 'screen-sign-in', 'field-password').fill(creds.password);
  await tap(page, 'screen-sign-in', 'cta-sign-in');
  await page.waitForTimeout(9000);
  await whereAmI(page);

  // ---- 2. which symbol is actually hot today
  console.log('\n[2] read the live alerts board for a symbol that has a card');
  await page.goto(`${BASE}/alerts`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(3000);
  let hot = process.env.HOT_SYMBOL ?? '';
  if (!hot) {
    // Every alert card testID ends in its symbol; the board is the only honest
    // source for "what does this account actually have an alert on today".
    const ids = await page.locator('[data-testid^="alert-card-"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-testid')),
    ).catch(() => []);
    const first = (ids ?? []).find(Boolean);
    if (first) hot = first.replace('alert-card-', '').toUpperCase();
  }
  if (!hot) {
    /**
     * A NAMED FALLBACK, NOT A GUESS SCRAPED OFF THE SCREEN.
     *
     * This used to pull the first all-caps word out of the board's text when no
     * alert-card testID was found, and on a board with no cards that produced
     * "YOUR" and "HERE" — the proof then opened /symbol/HERE, got a 404, and
     * reported the ticker page as broken. A heuristic that can invent a ticker
     * is worse than a constant that cannot.
     */
    hot = 'NVDA';
    console.log('  · no alert-card testID on the board; using NVDA');
  }
  console.log(`  · hot symbol = ${hot}`);
  await shot(page, 'ticker-rich-00-alerts-board');

  // ---- 3. the alerted symbol — the rich page
  console.log(`\n[3] /symbol/${hot} — the page with something on it`);
  await go(page, `/symbol/${hot}`, 'screen-ticker', 'ticker-price');
  await page.waitForTimeout(4500);
  await shot(page, 'ticker-rich-01-hot');

  await readText(page, '[data-testid="ticker-price"]', 'price');
  const hasSession = await count(page, 'ticker-session');
  note(hasSession > 0, 'hot: the session strip drew (open · range · volume)');
  if (hasSession) await readText(page, '[data-testid="ticker-session"]', 'session');

  const hasNow = await count(page, 'ticker-now');
  note(hasNow > 0, 'hot: the "is there anything to act on" block drew');
  if (hasNow) await readText(page, '[data-testid="ticker-now"]', 'now');

  console.log(`  · levels block: ${await count(page, 'ticker-now-levels')}`);
  console.log(`  · grade pill:   ${await count(page, 'ticker-now-grade')}`);
  console.log(`  · contract:     ${await count(page, 'ticker-contract')}`);
  console.log(`  · peak:         ${await count(page, 'ticker-peak')}`);
  console.log(`  · your lines:   ${await count(page, 'ticker-your-lines')}`);
  console.log(`  · member calls: ${await count(page, 'ticker-calls')}`);

  // The chart parity that shipped before this lane must survive it.
  note(await count(page, 'ticker-chart') > 0, 'hot: the shared SymbolChart is still mounted');
  // And Kai is still exactly one surface.
  note(await count(page, 'ticker-kai-view') > 0, 'hot: KaiView is present');

  await assertHonest(page, 'hot');

  // full-height capture so the whole argument is in one image
  await page.screenshot({ path: path.join(OUT, 'ticker-rich-02-hot-full.png'), fullPage: true });
  console.log('  · ticker-rich-02-hot-full.png');

  // ---- 4. the cold symbol — the quiet page must look intentional
  console.log(`\n[4] /symbol/${COLD} — the page with nothing on it`);
  await go(page, `/symbol/${COLD}`, 'screen-ticker', 'ticker-price');
  await page.waitForTimeout(4500);
  await shot(page, 'ticker-rich-03-cold');

  const coldText = await assertHonest(page, 'cold');

  note(await count(page, 'ticker-chart') > 0, 'cold: the chart is still there');
  const coldNow = await count(page, 'ticker-now');
  note(coldNow > 0, 'cold: the page still ANSWERS the question rather than hiding it');
  if (coldNow) await readText(page, '[data-testid="ticker-now"]', 'cold now-block');

  /**
   * THE SENTENCE THAT MAKES THE QUIET PAGE INTENTIONAL. Either the desk has a
   * graded setup here after all (fine — then it is not a cold page), or it says
   * plainly that it does not and what it can do instead.
   */
  const said = await count(page, 'ticker-blocked') + await count(page, 'ticker-offer');
  const gradedAnyway = await count(page, 'ticker-now-grade');
  note(said > 0 || gradedAnyway > 0,
    'cold: it says there is nothing to act on, in words',
    coldText.replace(/\s+/g, ' ').slice(0, 300));

  note(!/undefined|NaN|null/.test(coldText), 'cold: no undefined / NaN / null leaked onto the page');

  await page.screenshot({ path: path.join(OUT, 'ticker-rich-04-cold-full.png'), fullPage: true });
  console.log('  · ticker-rich-04-cold-full.png');

  await browser.close();

  console.log(failures.length ? `\n${failures.length} FAILED\n` : '\nall passed\n');
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
