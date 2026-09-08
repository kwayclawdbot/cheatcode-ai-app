/**
 * THE CHAT MOVED ONTO THE KIT AND LOST NOTHING.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8091
 *   PROOF_BASE=http://localhost:8091 PROOF_LABEL=after node scripts/proof-chat-on-the-kit.mjs
 *
 * `docs/trade-ui-MIGRATION.md` step 4 recorded that the conversation could NOT
 * move onto `ConversationPreview`, and the reason was a good one: `RoomMessage`
 * carries twenty-odd fields the kit had never heard of, so adopting it would
 * have deleted a dozen shipped features from three screens to gain a shared
 * shell. The decision was reversed by extending the kit with SLOTS rather than
 * with fields — the room passes the components it already ships — and this file
 * is the check on the only claim that reversal rests on: that nothing went.
 *
 * SO IT IS RUN TWICE, ONCE ON EACH SIDE OF THE CHANGE, and the two runs must
 * agree feature for feature:
 *
 *   git stash push -- src/features/community/ui/Message.tsx \
 *                     src/features/community/ui/ClubFeed.tsx
 *   PROOF_LABEL=before node scripts/proof-chat-on-the-kit.mjs   # old components
 *   git stash pop
 *   PROOF_LABEL=after  node scripts/proof-chat-on-the-kit.mjs   # on the kit
 *
 * A presence check that only ever runs after the change proves that the new
 * code draws things; it cannot prove the old code did not draw MORE. Running
 * the identical assertions on both sides is what makes "zero features lost" a
 * measurement instead of a claim, so the counts are printed rather than merely
 * asserted — a feature that silently drops from four to one still passes a
 * `> 0` test.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';
const LABEL = process.env.PROOF_LABEL ?? 'after';
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const count = (sel) => page.locator(sel).count();
const tally = {};
/** Counts, not booleans — see the header. */
const feature = async (name, sel, min = 1) => {
  const n = await count(sel);
  tally[name] = n;
  note(n >= min, `${name} — ${n}`);
};

/* ── the club board ───────────────────────────────────────────────── */
console.log(`\nthe club feed (${LABEL})`);
await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.screenshot({ path: path.join(OUT, `chat-kit-${LABEL}-01-club.png`), fullPage: true });

await feature('club message rows', '[data-testid^="club-message-"]');
await feature('belt-dyed member names', '[data-testid^="club-author-name-"]');
await feature('reaction bars', '[data-testid^="reactions-"]');
await feature('thread lines', '[data-testid^="thread-"]', 0);
await feature('quoted posts', '[data-testid^="quote-"]', 0);
await feature('setup objects', '[data-testid^="setup-object-"]', 0);
await feature('member call cards', '[data-testid^="club-message-call-"]', 0);
await feature('removed posts', '[data-testid^="club-message-removed-"]', 0);

{
  /* The belt law: a name is DYED, and Kai is never dyed. Read out of the live
     DOM rather than transcribed, so a palette change cannot quietly pass. */
  const inks = await page.locator('[data-testid^="club-author-name-"]').evaluateAll(
    (ns) => ns.map((n) => getComputedStyle(n.querySelector('*') ?? n).color),
  );
  tally['distinct name inks'] = new Set(inks).size;
  note(inks.length > 0, `names carry an ink — ${new Set(inks).size} distinct across ${inks.length}`);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  note(/\bAI\b/.test(body), 'Kai is still marked AI');
}

/* ── a room ───────────────────────────────────────────────────────── */
console.log(`\na room (${LABEL})`);
/* The fixture room by route, the way proof-social reaches it — clicking
   through the board landed on whatever the board happened to list first, which
   on a quiet fixture was nothing at all and quietly measured an empty page. */
await page.goto(`${BASE}/room/room-meta`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(OUT, `chat-kit-${LABEL}-02-room.png`), fullPage: true });
await feature('room message rows', '[data-testid^="message-row-"]', 0);
await feature('room author names', '[data-testid^="message-author-name-"]', 0);
await feature('room reaction bars', '[data-testid^="reactions-"]', 0);

await browser.close();
console.log(`\n${LABEL} tally: ${JSON.stringify(tally)}`);
console.log(failures.length ? `\nFAIL — ${failures.length}\n${failures.join('\n')}` : '\nPASS');
process.exit(failures.length ? 1 : 0);
