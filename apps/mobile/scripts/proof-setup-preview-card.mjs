/**
 * THE ALERT CARD AS THE TRADE OBJECT — before and after, on live data.
 *
 *   cd apps/mobile
 *   npx expo start --web --port 8147                 # no EXPO_PUBLIC_FIXTURES
 *   PROOF_BASE=http://localhost:8147 PROOF_LABEL=before \
 *     PROOF_EMAIL=… PROOF_PASSWORD=… node scripts/proof-setup-preview-card.mjs
 *
 * `PROOF_LABEL` names the run, so the same script shoots the old card and the
 * new one into files that sit next to each other. The assertions run on every
 * label except `before`, whose whole purpose is to photograph the old card.
 *
 * WHAT THIS PROVES, and it is the audit's F06 acceptance line almost verbatim:
 * without expanding anything, a member can see the proposed entry, where the
 * idea fails, the target, and whether this is an idea or an active order.
 * Every one of those was behind "View setup details" until 8 September.
 *
 * It runs against a real signed-in account and whatever the board actually
 * serves that day, so it asserts SHAPES rather than a fixture's numbers — a
 * card that has levels shows them above the fold; a card that has none says so
 * in words and draws no empty ruler. That is the honest form of this test:
 * the families genuinely differ and the proof has to allow them to.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8147';
const LABEL = process.env.PROOF_LABEL ?? 'after';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('PROOF_EMAIL and PROOF_PASSWORD are required'); process.exit(1); }
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
/* Expo's dev overlay is not part of the product. */
await page.addInitScript(() => {
  const inject = () => {
    if (!document.documentElement) return;
    const css = document.createElement('style');
    css.textContent = '#__expo-fast-refresh-overlay,[data-expo-dev-overlay]{display:none!important}';
    document.documentElement.appendChild(css);
  };
  if (document.documentElement) inject();
  else document.addEventListener('DOMContentLoaded', inject, { once: true });
});

const shot = (n) => page.screenshot({ path: path.join(OUT, `setup-card-${LABEL}-${n}.png`), fullPage: true });

/*
  Sign-in is skipped against a fixtures server, which has no account to sign
  into. Tolerating its absence rather than requiring it is what lets the same
  script shoot the live board and the deterministic one — and the deterministic
  one is the only place a committed screenshot can be regenerated a month from
  now, when today's alerts are gone.
*/
console.log(`\nsigning in (${LABEL})`);
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
const needsAuth = await page
  .locator('[data-testid="screen-sign-in"]')
  .waitFor({ timeout: 20_000 })
  .then(() => true, () => false);
if (needsAuth) {
  await page.locator('input[data-testid="field-email"]').first().fill(EMAIL);
  await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);
} else {
  console.log('  (no sign-in screen — fixtures build)');
}

console.log('\nthe alerts board');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
/*
  THE ALERTS TAB IS NOT ALWAYS THE ALERTS BOARD. In Invest mode this tab is the
  research desk, and an account whose `primary_mode` moved between runs shows
  zero cards for a reason that has nothing to do with this card. Say which it
  is, rather than reporting an empty board and letting a reader conclude the
  migration broke something.
*/
const onBoard = await page
  .locator('[data-testid="screen-alerts"]')
  .waitFor({ timeout: 60_000 })
  .then(() => true, () => false);
if (!onBoard) {
  await page.screenshot({ path: path.join(OUT, `setup-card-${LABEL}-00-not-the-board.png`) });
  console.log('\nThis account is not in a mode whose Alerts tab is the alerts board');
  console.log('(Invest mode makes it the research desk). Switch to Swing or Day Trade.');
  await browser.close();
  process.exit(1);
}
/*
  The board fetches candles per symbol after the cards mount, so the chart
  arrives a beat after the card does — measured at 15-18s against a cold hosted
  API. Wait for the picture, not the frame: shooting at 14s photographs the
  honest levels-only fallback and reads as a regression when it is a stopwatch.
*/
await page.waitForTimeout(26_000);
await shot('01-board');

const cards = page.locator('[data-testid^="alert-card-"]');
const count = await cards.count();
console.log(`  ${count} card(s) on the board`);
if (count === 0) {
  console.log('\nNo cards served to this account today — nothing to photograph.');
  await browser.close();
  process.exit(failures.length ? 1 : 0);
}

const first = cards.first();
await first.screenshot({ path: path.join(OUT, `setup-card-${LABEL}-02-card.png`) });

/*
  A card is taller than the phone, so an element screenshot of it is clipped by
  the scroll container and shows only the half above the fold — which is the
  half that was never in question. These two are the lower half: the lifecycle
  row, the three levels as numbers, the ruler and the action. They are the
  actual evidence for F06 and they are shot by scrolling, because that is the
  only way this viewport can see them.
*/
for (const n of [1, 2]) {
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `setup-card-${LABEL}-0${1 + n}-scrolled-${n}.png`) });
}
await page.mouse.wheel(0, -840);
await page.waitForTimeout(1200);

/* Assertions run on every label except `before`, whose whole purpose is to
   photograph the card as it was. */
if (LABEL !== 'before') {
  console.log('\nthe decision essentials, without expanding');
  const t = (await first.innerText()).replace(/\s+/g, ' ');
  const has = (id) => first.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
  const sym = (await first.getAttribute('data-testid')).replace('alert-card-', '');

  /* The lifecycle is on every card, whatever the family, because "is this an
     idea or an order" is the one question no card is allowed to leave open. */
  note(await has(`alert-state-${sym}`), 'the lifecycle state is on the collapsed card');
  note(await has(`alert-cta-${sym}`), 'and one primary action');
  note(await has(`alert-expand-${sym}`), 'the expander is still there');

  /*
    A card either has a price plan or it honestly has none. Both are correct
    and the proof must not force the first: the unusual-options family has no
    stop and no target because nothing behind it ever computed one.
  */
  /*
    A LEVEL LABEL IS NOT A LEVEL. The first version of this checked for the
    words "Entry", "Stop" and "Target" and passed on a card that was drawing
    all three as em-dashes — the exact failure the card has a rule against.
    So the label test is the wrong test; what matters is that no labelled cell
    is empty, and that the card has EITHER a measured plan or a stated absence,
    never neither and never both.
  */
  note(!/\b(Entry|Stop|Target)\s*[—–-]\B/.test(t), 'no level is drawn without a number');

  /*
    A card says EXACTLY ONE of three things about its risk and reward, and
    which one depends on what the wire could actually support:

      · the measured ruler, where all three levels are single prices;
      · the server's own stated ratio, where the entry is a ZONE — a ratio
        measured off one edge of a range is a best case dressed as the case,
        so the app does not compute one;
      · a plain sentence, where the engine publishes no exit plan at all.

    Two of them at once would be two answers to one question, and none of them
    would be the card going quiet about the thing it exists to tell you.
  */
  const says = [
    [/Risk\b/.test(t) && /Reward\b/.test(t), 'the measured risk/reward ruler'],
    [await has(`alert-rr-stated-${sym}`), "the server's stated ratio, because the entry is a zone"],
    [await has(`alert-no-plan-${sym}`), 'a sentence saying no exit plan was supplied'],
  ].filter(([on]) => on).map(([, what]) => what);
  note(says.length === 1, `the plan is stated exactly once — ${says.join(' AND ') || 'NOTHING AT ALL'}`);
  note(!/Risk\/reward unavailable/i.test(t), 'and no ruler reporting its own emptiness');

  /* Evidence stays behind the fold — that is the other half of F06. */
  note(!(await has(`bars-${sym}`)), 'the score breakdown is collapsed');
  note(!(await has(`alert-story-${sym}`)), 'and so is the story');

  console.log('\nexpanded — the same object, one depth further in');
  await first.locator(`[data-testid="alert-expand-${sym}"]`).click();
  await page.waitForTimeout(2500);
  await shot('04-expanded');
  await first.screenshot({ path: path.join(OUT, `setup-card-${LABEL}-05-card-expanded.png`) });
  {
    const e = (await first.innerText()).replace(/\s+/g, ' ');
    note(await has(`alert-cta-${sym}`), 'the primary action survived the expansion');
    note(/Ask Kai about/i.test(e), 'and Kai can be asked about the selected level');
    note((await has(`bars-${sym}`)) || (await has(`hold-plan-${sym}`)) || /No grade/i.test(e),
      'the evidence is now on screen');
  }
}

await browser.close();
console.log(failures.length ? `\nFAIL — ${failures.length}\n${failures.join('\n')}` : '\nPASS');
process.exit(failures.length ? 1 : 0);
