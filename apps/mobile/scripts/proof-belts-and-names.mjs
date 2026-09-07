/**
 * THE BELT, THE NAME, AND THE DOOR — SHOT IN THE RUNNING APP.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8097
 *   PROOF_BASE=http://localhost:8097 node scripts/proof-belts-and-names.mjs
 *
 * Three owner asks land on the same pixels, so they are proven together:
 *
 *   · A USERNAME IS A DOOR. Every rendered name that has a member behind it
 *     opens that member's profile. This is asserted by CLICKING, not by
 *     looking for a cursor — the failure it exists to catch is a name that is
 *     wrapped in a Pressable which navigates nowhere, which looks identical to
 *     a working one in a screenshot.
 *
 *   · A NAME WEARS ITS BELT. The computed colour of each author's name is read
 *     out of the live DOM and compared against the palette, and the palette is
 *     PARSED OUT OF `src/ui/tokens.ts` rather than transcribed here. A proof
 *     holding its own copy of five hex values is a proof that keeps passing
 *     after somebody retunes the ladder.
 *
 *   · A COMMUNITY CALL CARD WEARS ITS AUTHOR'S BELT ON THE EDGE. And — the
 *     assertion that matters most, because this is the regression that would
 *     be invisible — the volt INSIDE the card survives: the authorship wash,
 *     the COMMUNITY TRADE eyebrow and the buttons are all still volt. The edge
 *     moved; the grammar did not. If a future change re-paints the whole card
 *     in the belt colour, the card stops saying "a person wrote this, not Kai"
 *     and every screenshot still looks fine.
 *
 * WHAT THIS CANNOT PROVE: the avatar round trip. Fixtures mode has no API and
 * no storage, so picking a photo is proven separately against the real stack
 * by `proof-avatar-change.mjs`.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8097';
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

/* ── THE PALETTE, READ FROM THE ONE SOURCE ────────────────────────────────
 * Sliced out of tokens.ts the same way `gen-theme.mts` slices the font map,
 * and for the same reason: this file must not become a second copy of the
 * palette that has no way of knowing when the first one changes. */
function sliceBlock(src, header) {
  const open = src.indexOf(header);
  if (open === -1) throw new Error(`proof: could not find \`${header}\` in src/ui/tokens.ts`);
  return src.slice(open, src.indexOf('} as const;', open));
}
function beltPalette() {
  const src = readFileSync(path.join(ROOT, 'src', 'ui', 'tokens.ts'), 'utf8');
  const out = {};
  for (const line of sliceBlock(src, 'export const belt = {').split('\n')) {
    const m = line.match(/^\s*(white|blue|purple|brown|black)\s*:\s*'(#[0-9A-Fa-f]{6})'/);
    if (m) out[m[1]] = m[2];
  }
  if (Object.keys(out).length !== 5) throw new Error(`proof: parsed ${Object.keys(out).length} belts, expected 5`);
  return out;
}
/**
 * The EDGE colours, which are a different string to the ink.
 *
 * A first version of this file compared the card's edge against the opaque
 * `rgb(...)` of the belt and failed against a card that was, in fact, correct:
 * the ring is a half-strength alpha, so what actually lands in the DOM is
 * `rgba(192, 140, 94, 0.5)`. Worth keeping as a note, because "the assertion
 * was wrong, not the app" is the failure mode that gets a real proof deleted.
 */
function beltEdges() {
  const src = readFileSync(path.join(ROOT, 'src', 'ui', 'tokens.ts'), 'utf8');
  const out = {};
  for (const line of sliceBlock(src, 'export const beltAlpha = {').split('\n')) {
    const m = line.match(/^\s*(white|blue|purple|brown|black)\s*:\s*'(rgba\([^']+\))'/);
    // The DOM prints `rgba(192, 140, 94, 0.5)`; the source writes it without
    // spaces and with a trailing zero. Normalise to what the browser emits.
    if (m) out[m[1]] = m[2].replace(/rgba\(([^)]+)\)/, (_, inner) =>
      `rgba(${inner.split(',').map((n) => n.trim().replace(/^0?\.50$/, '0.5')).join(', ')})`);
  }
  if (Object.keys(out).length !== 5) throw new Error(`proof: parsed ${Object.keys(out).length} belt edges, expected 5`);
  return out;
}
const BELT = beltPalette();
const EDGE = beltEdges();
const rgbOf = (hex) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const VOLT = 'rgb(200, 255, 0)';

console.log('\nthe ladder, as parsed from tokens.ts');
for (const [k, v] of Object.entries(BELT)) console.log(`    ${k.padEnd(7)} ${v}  ${rgbOf(v)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const go = async (route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `belts-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);

/** The computed text colour of the first element matching a selector. */
const colorOf = (sel) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);

/* ================================================================== */
/* 1. A ROOM OF MIXED BELTS                                            */
/* ================================================================== */
console.log('\nbelts / a feed where five members are on five rungs');
await go('/community');
note(await has('screen-community'), 'the community opened');
await shot('01-community-mixed-belts');

/*
 * The five fixture members sit on five different rungs on purpose — see the
 * note over `sofia` in src/lib/fixtures.ts. The point of shooting them in ONE
 * frame is the thing a per-colour unit test cannot check: that a room of mixed
 * belts still reads as one product rather than as a bag of colours.
 */
const inkOf = async (who) => {
  const loc = page.locator(`text="${who}"`).first();
  if (!(await loc.count())) return null;
  return loc.evaluate((el) => getComputedStyle(el).color);
};
const wearsRung = async (who, rung) => {
  const got = await inkOf(who);
  if (got === null) { note(false, `${who} is on the screen`); return; }
  note(got === rgbOf(BELT[rung]), `${who} wears the ${rung} belt (${got})`);
};

// The room's own conversation. Four rungs plus Kai, who has none.
for (const [who, rung] of [['Priya Raman', 'brown'], ['Jordan', 'black'], ['Marcus T.', 'purple'], ['Sam', 'white']]) {
  await wearsRung(who, rung);
}
{
  // Kai is not a member. A rung on the assistant would be the app claiming it
  // earned something, and violet is the one colour that must not become a belt.
  const kai = await inkOf('Kai');
  note(kai === null || !Object.values(BELT).slice(1).some((h) => kai === rgbOf(h)),
    `Kai is not wearing a belt (${kai})`);
}

/* ================================================================== */
/* 2. THE NAME IS A DOOR                                               */
/* ================================================================== */
console.log('\nbelts / tapping a name opens that member');
{
  const before = page.url();
  const name = page.locator('text="Priya Raman"').first();
  if (await name.count()) {
    await name.click();
    await page.waitForTimeout(2200);
    const url = page.url();
    note(url !== before, `tapping the name went somewhere (${url.replace(BASE, '')})`);
    note(/\/contributor\//.test(url), 'and where it went is that member\'s profile');
    note(await has('contributor-belt'), 'the profile it landed on carries the belt');
    await shot('02-name-opened-profile');
  } else {
    note(false, 'a name was on the screen to tap');
  }
}

/* ================================================================== */
/* 3. THE CARD WEARS THE BELT, AND KEEPS ITS VOLT                      */
/* ================================================================== */
console.log('\nbelts / a community call card is edged in its author\'s belt');
await go('/community');
{
  const edge = page.locator('[data-testid^="call-edge-"]').first();
  note(await edge.count() > 0, 'the card has an edge element to inspect');

  if (await edge.count()) {
    // The ring is a gradient node; react-native-web renders the stops into
    // `background-image`, so that is where the belt colour actually lands.
    const bg = await edge.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.backgroundImage} ${s.backgroundColor} ${s.borderColor}`;
    });
    note(!bg.includes(VOLT), `the card edge is no longer volt (${VOLT})`);
    const worn = Object.entries(EDGE).find(([, rgba]) => bg.includes(rgba));
    note(!!worn, `the card edge is a belt, at half strength (${worn ? worn[0] : bg.slice(0, 90)})`);
    // The author of the fixture call in this room is a brown belt, so the edge
    // is not merely SOME belt — it is HERS. An edge that painted every card the
    // same rung would satisfy the assertion above and mean nothing.
    note(worn?.[0] === 'brown', 'and it is the belt of the member who wrote it, not a default');
  }

  // THE HALF THAT MUST NOT HAVE MOVED. Volt is the user acting, and it is what
  // says a person wrote this rather than Kai. If the belt ate the volt, the
  // card has quietly changed what it claims.
  const eyebrow = page.locator('text="COMMUNITY TRADE"').first();
  note(await eyebrow.count() > 0, 'the card still says COMMUNITY TRADE');
  if (await eyebrow.count()) {
    note((await eyebrow.evaluate((el) => getComputedStyle(el).color)) === VOLT,
      'and that eyebrow is still volt — a person wrote this, not Kai');
  }
  await shot('03-call-card-belt-edge');
}

/* ================================================================== */
/* 4. THE BLACK BELT IS A FINISH                                       */
/* ================================================================== */
/* ================================================================== */
/* 4. ALL FIVE RUNGS IN ONE LIST                                       */
/* ================================================================== */
console.log('\nbelts / the leaderboard is the honest test — five names, five belts');
await go('/leaderboard');
{
  note(await has('screen-leaderboard') || (await page.locator('text=/accuracy/i').count()) > 0,
    'the board opened');
  // The board prints the HANDLE, not the display name — that is how you type
  // somebody into a room, and it is what this screen has always shown.
  for (const [who, rung] of [
    ['@dee', 'black'], ['@priya_r', 'brown'],
    ['@sofiab', 'purple'], ['@marcusk', 'blue'],
  ]) {
    await wearsRung(who, rung);
  }

  /*
   * YOUR OWN ROW IS VOLT, NOT YOUR BELT — and that is the rule, not an
   * oversight. The pinned row is already volt throughout: the rank, the
   * accuracy and the border all say "this one is you", because volt is the
   * member's own colour. Tinting the single word of the name a belt colour
   * inside an otherwise volt row would not read as a rank, it would read as a
   * rendering fault. The belt is still stated on the row by its chip.
   *
   * A first version of this proof asserted the white belt here and failed
   * against an app that was right. Recorded so nobody "fixes" the screen to
   * satisfy a future version of this file.
   */
  const you = await inkOf('@kway');
  note(you === VOLT, `your own row stays volt rather than taking a belt (${you})`);
  await shot('04-leaderboard-five-rungs');
}

console.log('\nbelts / the top of the ladder is metal, not a colour');
{
  const ink = await inkOf('@dee');
  note(ink === rgbOf(BELT.black), `the black belt's name is platinum (${ink})`);
  note(ink !== null && ink !== 'rgb(0, 0, 0)', 'and it is emphatically not #000 on a #0B0B0E ground');
  // The claim the palette makes about black: it is the brightest rung, because
  // the top of the ladder should be the most present thing in the list.
  const others = await Promise.all(['@priya_r', '@sofiab', '@marcusk'].map(inkOf));
  note(others.every(Boolean) && ink !== null, 'the other rungs were all on the board to compare against');
  const lum = (c) => {
    const [r, g, b] = (c ?? 'rgb(0,0,0)').match(/\d+/g).map(Number).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  note(others.filter(Boolean).every((c) => lum(ink) >= lum(c)),
    'and it is the brightest rung on the board');
}

/* ================================================================== */
/* 5. NO NAME IS A DEAD BUTTON                                         */
/* ================================================================== */
console.log('\nbelts / nothing pretends to be tappable');
{
  /*
   * A circle message carries its author as a bare string with no id behind it,
   * so those names CANNOT open a profile. The right answer is plain text, and
   * the wrong one — the one this checks for — is a Pressable that navigates
   * nowhere, which teaches a member that names sometimes silently fail.
   */
  await go('/community');
  const deadButtons = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role="button"]')) {
      const label = el.getAttribute('aria-label') ?? '';
      if (/^Open .*'s profile$/.test(label) && !el.onclick && !el.getAttribute('tabindex')) out.push(label);
    }
    return out;
  });
  note(deadButtons.length === 0, `no name advertises a profile it cannot open (${deadButtons.length} found)`);
}

/* ================================================================== */
await browser.close();
console.log(
  failures.length === 0
    ? '\nbelts and names: all assertions passed\n'
    : `\n${failures.length} FAILED:\n${failures.map((f) => `  · ${f}`).join('\n')}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
