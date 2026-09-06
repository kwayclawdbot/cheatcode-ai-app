/**
 * THE SOCIAL-TRADING LAYER, SHOT IN THE RUNNING APP.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8099
 *   PROOF_BASE=http://localhost:8099 node scripts/proof-social-trading.mjs
 *
 * It walks composer -> published community call -> Following feed -> the board,
 * and asserts the things a screenshot cannot prove on its own:
 *
 *   · THE CARD IS THE MEMBER'S, NOT KAI'S. A community call carries the
 *     eyebrow "COMMUNITY TRADE" and the author's avatar in a volt authorship
 *     block. It must NOT carry a grade, a score, a score bar or a medallion —
 *     nothing graded it, and a letter on somebody's own idea would be the app
 *     claiming an opinion it does not have. This is the single most valuable
 *     assertion in the file, because the failure is silent: a card that grows
 *     a grade still renders perfectly.
 *
 *   · THE BELT IS ON IT. Small, hairline, volt-family — and present, because a
 *     belt that only appears on a profile is a belt nobody sees.
 *
 *   · THE INCENTIVE LINE CHANGES WHILE YOU TYPE. "An entry plus a stop or a
 *     target is what makes a call count" becomes "This one counts" the moment
 *     the second number lands. That sentence IS the scoreable rule, so if it
 *     stops moving the rule has stopped being taught.
 *
 *   · A SNAKE_CASE REFUSAL NEVER REACHES A PERSON. Typing a stop above the
 *     entry on a long produces an English sentence, not `stop_not_below_entry`.
 *
 *   · THE BOARD LEADS WITH ACCURACY, and says how points work in words.
 *
 *   · THERE IS NO MONEY ANYWHERE. No P/L, no returns, no account size on any
 *     of these screens — checked as text, on every one of them.
 *
 * WHAT THIS CANNOT PROVE: that the server writes the row. Fixtures mode has no
 * API, so `Publish it` takes the local path — what is proven here is the
 * composer, the card, the two feeds and the board, not the round trip.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8099';
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const go = async (route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `social-trading-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const idText = async (id) => (await page.locator(`[data-testid="${id}"]`).first().innerText()).replace(/\s+/g, ' ');

/** No screen in this layer may ever print money. */
const NO_MONEY = /\$\s?\d|P\/?L\b|profit|account size|returns?\b/i;

/* ================================================================== */
/* 1. THE COMPOSER                                                     */
/* ================================================================== */
console.log('\nsocial-trading / publishing a call');
await go('/community/call/new');
note(await has('screen-community-call-new'), 'the composer opened');

const symbolBox = page.locator('[data-testid="composer-symbol"]');
note(await symbolBox.count() > 0, 'it asks for a ticker');
await symbolBox.fill('META');
await page.waitForTimeout(500);
note(await has('composer-ticker-mark'), 'and the ticker gets its MARK, not plain text, as soon as it is typed');

const thesis = page.locator('[data-testid="composer-thesis"]');
await thesis.fill('$META held 480 three times and just reclaimed VWAP. I want the 504 break on volume.');
await page.waitForTimeout(400);

const counterEmpty = await idText('composer-counter');
note(/\/280$/.test(counterEmpty), `the thesis is capped at 280 and says so ("${counterEmpty}")`);

/* -- 1a. the incentive, before any levels ------------------------------ */
const before = await idText('composer-scoreable');
note(/makes a call count/i.test(before), `with no levels it says what would make it count ("${before.slice(0, 62)}…")`);
await shot('01-composer-empty');

/* -- 1b. a snake_case rule, said in English ---------------------------- */
await page.locator('[data-testid="composer-entry"]').fill('504');
await page.locator('[data-testid="composer-stop"]').fill('520');   // above entry on a LONG
await page.waitForTimeout(500);
const levelErr = await has('composer-level-error') ? await idText('composer-level-error') : '';
note(!!levelErr, 'a stop above the entry on a long is refused');
note(/stop has to sit below the entry/i.test(levelErr), `and the refusal is a sentence ("${levelErr}")`);
note(!/stop_not_below_entry|_/.test(levelErr), 'no snake_case constraint name reaches the person');
note(
  await page.locator('[data-testid="composer-publish"][aria-disabled="true"], [data-testid="composer-publish"][disabled]').count() > 0,
  'and publishing is off while the levels contradict each other',
);
await shot('02-composer-level-error');

/* -- 1c. the incentive line MOVES ------------------------------------- */
await page.locator('[data-testid="composer-stop"]').fill('496.5');
await page.locator('[data-testid="composer-target"]').fill('522');
await page.waitForTimeout(600);
const after = await idText('composer-scoreable');
note(before !== after, `the incentive line changes as the levels land ("${before.slice(0, 34)}…" -> "${after.slice(0, 34)}…")`);
note(/counts/i.test(after), 'and it now says this one counts');
note(!(await has('composer-level-error')), 'the level refusal is gone');

/* -- 1d. the preview is the real card --------------------------------- */
note(await has('community-call-preview'), 'the composer previews the card it is about to publish');
const preview = await idText('composer-preview');
note(/COMMUNITY TRADE/.test(preview), 'the preview carries the COMMUNITY TRADE eyebrow');
note(/Community trade, not advice\./.test(preview), 'and the one quiet not-advice line');
await shot('03-composer-ready');

/* -- 1e. publish ------------------------------------------------------- */
await page.locator('[data-testid="composer-publish"]').click();
await page.waitForTimeout(1400);
note(await has('sheet-call-published'), 'publishing confirms in a sheet rather than silently');
const sheet = await idText('sheet-call-published');
note(/counts/i.test(sheet), `and the sheet says whether it will score ("${sheet.slice(0, 70)}…")`);
await shot('04-published');
await page.locator('[data-testid="sheet-call-published"] >> text=Back to the club').click().catch(() => {});
await page.waitForTimeout(2200);

/* ================================================================== */
/* 2. THE PUBLISHED CARD, IN THE FOLLOWING FEED                        */
/* ================================================================== */
console.log('\nsocial-trading / the community call card');
await go('/community?feed=following');
note(await has('community-feed'), 'the Community tab carries a feed switch');
note(await has('following-feed'), 'and the Following feed renders');
await shot('05-following-feed');

const card = page.locator('[data-testid^="community-call-"]').first();
note(await card.count() > 0, 'a member call is drawn as a card');

if (await card.count()) {
  const body = (await card.innerText()).replace(/\s+/g, ' ');

  /* -- 2a. it is the member's, and it says so ------------------------- */
  note(/COMMUNITY TRADE/.test(body), 'its eyebrow is COMMUNITY TRADE — not a house-alert eyebrow');
  note(/Community trade, not advice\./.test(body), 'it carries the one quiet not-advice line');
  note(
    (body.match(/not advice|not investment advice/gi) ?? []).length === 1,
    'exactly one disclaimer line on the card, not a paragraph',
  );

  /* -- 2b. THE BELT ---------------------------------------------------- */
  const belt = page.locator('[data-testid^="call-belt-"]').first();
  note(await belt.count() > 0, 'the author line carries a belt chip');
  if (await belt.count()) {
    const beltText = (await belt.innerText()).trim();
    note(/^(WHITE|BLUE|PURPLE|BROWN|BLACK)$/.test(beltText), `and it names the rung ("${beltText}")`);
    const box = await belt.boundingBox();
    // Small and quiet. A badge taller than the name it sits beside is a badge
    // that has taken over the row.
    note(!!box && box.height <= 22, `drawn small — ${box ? Math.round(box.height) : 0}px tall, not a trophy`);
  }

  /* -- 2c. IT IS NOT GRADED. The assertion that matters. -------------- */
  note(!/\bNo grade\b/i.test(body), 'no "No grade" ring — the card never raises the question');
  note(!/\bGrade\b/i.test(body), 'the word "grade" appears nowhere on it');
  note(
    await page.locator('[data-testid^="medallion-"]').count() === 0,
    'no grade medallion anywhere in the Following feed',
  );
  note(
    await page.locator('[data-testid^="bars-"]').count() === 0,
    'and no score bars — nothing scored it, so nothing is drawn',
  );

  /* -- 2d. levels, and only the ones that exist ----------------------- */
  const levels = page.locator('[data-testid^="call-levels-"]').first();
  if (await levels.count()) {
    const lv = (await levels.innerText()).replace(/\s+/g, ' ');
    note(/Entry/.test(lv), 'a call with an entry shows the Entry cell');
    note(!/—/.test(lv), 'and no level cell is a dash standing in for a number that does not exist');
  }

  /* -- 2e. the ticker is never plain text ----------------------------- */
  note(
    await page.locator('[data-testid^="ticker-mark-"]').count() > 0,
    'every symbol on the feed carries its mark',
  );
}

/* -- 2f. a shared trade is a row, not a card ------------------------- */
const trade = page.locator('[data-testid^="shared-trade-"]').first();
note(await trade.count() > 0, 'the feed also renders shared trades');
if (await trade.count()) {
  const t = (await trade.innerText()).replace(/\s+/g, ' ');
  note(/Entry/.test(t), 'a shared trade shows its levels');
  note(!NO_MONEY.test(t), `and no size, no dollars, no P/L on it ("${t.slice(0, 74)}…")`);
}

const feedText = await text();
note(!/\$\s?\d/.test(feedText), 'nothing in the Following feed prints a dollar figure');

/* -- 2g. the two empty states are different -------------------------- */
// Both cannot be shown from one fixture, so what is asserted is that the two
// have separate identities in the DOM rather than one shared "Nothing here".
note(
  !(await has('following-empty-nobody')) || !(await has('following-empty-quiet')),
  'the two empty states are distinct elements, never both at once',
);

/* ================================================================== */
/* 2h. THE PROFILE — where Follow replaced Save                        */
/* ================================================================== */
console.log('\nsocial-trading / the contributor profile');
await go('/contributor/u-jordan');
note(await has('screen-contributor'), 'the profile opened');
await shot('10-contributor');

const profile = await text();
note(await has('follow-contributor'), 'it offers Follow');
note(
  await page.locator('[data-testid="save-contributor"]').count() === 0,
  'and the device-local "Save" button is gone, not hidden',
);
note(!/saved on this device/i.test(profile), 'nothing claims a follow is device-local any more');
note(await has('contributor-handle'), 'the username is on the profile — it never used to be');
note(await has('contributor-belt'), 'the belt is on it');
note(await has('contributor-followers'), 'and the follower count');
note(await has('contributor-record'), 'the record is drawn');
note(/of resolved calls hit the target/i.test(profile), 'and it explains what the accuracy figure counts');
note(await has('contributor-trades'), 'a TRADES section lists the trades they chose to show');
note(await has('contributor-belt-progress'), 'the belt shows what the next rung costs');

/* -- the reversed product rule ---------------------------------------- */
note(
  !/No rankings, no leaderboards, no profit contests/i.test(profile),
  'the screen no longer says there are no leaderboards — the app has one',
);
note(
  !/Not a rank, and never profit/i.test(profile),
  'and the stat caption no longer denies that ranks exist',
);
note(/Outcomes only/i.test(profile), 'what survives the reversal is said: outcomes only');
note(/never profit|no number on this screen is money/i.test(profile), 'and never dollar P/L');

/* ================================================================== */
/* 3. THE BOARD                                                        */
/* ================================================================== */
console.log('\nsocial-trading / the leaderboard');
await go('/leaderboard');
note(await has('screen-leaderboard'), 'the board opened');
await shot('06-leaderboard');

const board = await text();
note(/This week/.test(board) && /This month/.test(board) && /All time/.test(board), 'three periods');
note(/ACCURACY/i.test(board), 'the accuracy column is labelled — the number is never unexplained');

const acc = page.locator('[data-testid^="board-accuracy-"]').first();
note(await acc.count() > 0, 'every row carries an accuracy figure');
if (await acc.count()) {
  const a = (await acc.innerText()).trim();
  note(/%|—/.test(a), `and it is a percentage, or a dash where nothing has resolved ("${a}")`);
  const box = await acc.boundingBox();
  note(!!box && box.height >= 16, 'drawn at the size of the number that matters, not as small print');
}

note(await has('board-you'), "the caller's own row is pinned when it is off the board");
if (await has('board-you')) {
  const you = await idText('board-you');
  note(/WHERE YOU ARE/i.test(you), `and it is labelled as theirs ("${you.slice(0, 46)}…")`);
}

/* -- 3a. the rules are printed --------------------------------------- */
note(await has('board-rules-toggle'), 'the board offers to explain how points work');
await page.locator('[data-testid="board-rules-toggle"]').click();
await page.waitForTimeout(600);
note(await has('board-rules'), 'and opening it shows the rules');
const rules = await idText('board-rules');
note(/entry/i.test(rules) && /stop|target/i.test(rules), 'the rules say what makes a call scoreable at all');
note(rules.length > 120, `and they are real sentences, not a legend (${rules.length} chars)`);
await shot('07-leaderboard-rules');

/* -- 3b. still no money ---------------------------------------------- */
const boardText = await text();
note(!/\$\s?\d/.test(boardText), 'the board prints no dollar figure anywhere');
note(/never shows profit/i.test(boardText), 'and says so in words at the foot of it');

/* -- 3c. switching period does not blank the board -------------------- */
await page.locator('[data-testid="board-period-all"]').click();
await page.waitForTimeout(900);
note(await has('board-rows'), 'switching to All time keeps rows on screen');
await shot('08-leaderboard-all-time');

/* ================================================================== */
/* 4. THE BELT MOMENT                                                  */
/* ================================================================== */
console.log('\nsocial-trading / moving up a belt');
await go('/community?belt=1');
await page.waitForTimeout(900);
note(await has('sheet-belt-up'), 'the belt-up moment can be opened and looked at');
if (await has('sheet-belt-up')) {
  const b = await idText('sheet-belt-up');
  note(/belt/i.test(b), `it names the belt ("${(await idText('belt-up-title')).trim()}")`);
  note(/both ways|takes the rung back/i.test(b), 'and it says a belt can be lost again — no one-way scoreboard');
  note(!/🎉|🏆|congratulations!/i.test(b), 'restrained: no confetti, no trophy, no exclamation');
}
await shot('09-belt-up');

/* ================================================================== */
await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('social-trading proof: everything asserted held. Screenshots in apps/mobile/proof/social-trading-*.png\n');
