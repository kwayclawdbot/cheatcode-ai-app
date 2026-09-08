/**
 * A SESSION IS NAMED IN NEW YORK, WHEREVER THE PHONE IS.
 *
 *   cd apps/mobile && npm test
 *
 * WHAT SHIPPED. The ticker strip printed
 *
 *     SESSION · SEP 3
 *     OPEN 362.07   351.32 … 364.69   VOLUME 65.0M
 *
 * for TSLA. Those are Friday SEPTEMBER 4's numbers — Sep 3 opened 365.82 and
 * closed 376.37 — so a row of real, verified prices was published under the
 * wrong day. The strip's own header comment refuses to say "Today" precisely
 * because mislabelling real numbers is the worst kind of wrong, and then the
 * label did it anyway.
 *
 * THE MISTAKE was one argument: `toLocaleDateString(undefined, …)` formats in
 * the DEVICE's timezone. Polygon stamps a daily bar at midnight ET
 * (`2026-09-04T04:00:00Z`), and that instant is
 *
 *     Sep 4 in New York, London, Accra and Auckland
 *     SEP 3 in Chicago, Denver and Los Angeles
 *
 * so the same bar had two names depending on who was looking, and the app has
 * members on both sides of that line. The duplicate 16:00 ET stamp the API was
 * also storing (`2026-09-04T20:00:00Z` — see apps/api `dailyBarStamp`) broke it
 * the other way, naming Friday "Sep 5" for anyone east of London.
 *
 * So this file runs the SAME assertions under five real timezones, driven by
 * `TZ` on a child process rather than by whatever the machine happens to be
 * set to — a test that only ever runs in one zone cannot see this class of bug
 * at all. The parent process spawns; the child asserts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sessionDatePlain, whenPlain } from '../src/lib/when';

/** Zones chosen so that the OLD code fails in at least one of them, both ways. */
const ZONES = [
  'America/New_York',   // the market's own clock
  'America/Los_Angeles', // ET midnight lands on the previous day — the shipped bug
  'Europe/London',
  'Africa/Accra',        // UTC, and a real slice of this membership
  'Pacific/Auckland',    // +12/+13 — the direction the 16:00 stamp broke
];

/* ================================================================== */
/* Parent: run the child once per zone                                 */
/* ================================================================== */

if (!process.env.SESSION_DATE_TZ) {
  const self = fileURLToPath(import.meta.url);
  let bad = 0;

  /*
    THE CALL SITE, checked as source. The strip itself cannot be imported here —
    `useTickerNow` reaches the API client, which reaches Expo — so the guard on
    the surface that actually shipped the wrong day is that it goes through the
    one helper and formats no date of its own.
  */
  const strip = readFileSync(new URL('../src/features/ticker/useTickerNow.ts', import.meta.url), 'utf8');
  if (!/sessionDatePlain\(bar\.t\)/.test(strip)) {
    console.log('  FAIL the session strip no longer names the bar through sessionDatePlain');
    bad += 1;
  }
  // The CALL, not the word — the comment above the fix names it on purpose.
  if (/\.toLocaleDateString\s*\(/.test(strip)) {
    console.log('  FAIL the session strip formats a date in the device timezone again');
    bad += 1;
  }

  for (const tz of ZONES) {
    try {
      execFileSync(process.execPath, ['--import', 'tsx', self], {
        env: { ...process.env, TZ: tz, SESSION_DATE_TZ: tz },
        stdio: 'inherit',
      });
    } catch {
      bad += 1;
    }
  }
  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'} — session naming, ${bad} timezone(s) failed\n`);
  process.exit(bad ? 1 : 0);
}

/* ================================================================== */
/* Child: one timezone, the whole table                                */
/* ================================================================== */

const TZ = process.env.SESSION_DATE_TZ;
let failures = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) return; // the passing case is silent; five zones of green is noise
  failures += 1;
  console.log(`  FAIL [${TZ}] ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

console.log(`\n${TZ}  (device reads ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);

/*
  THE BAR FROM THE DEFECT, with its real numbers. Friday 2026-09-04:
  o=362.07 h=364.69 l=351.32 c=354.08 v=65.0M, stamped at midnight ET.
*/
const TSLA_SEP4 = '2026-09-04T04:00:00.000Z';
/* Thursday 2026-09-03, the session whose name was printed over Friday's row. */
const TSLA_SEP3 = '2026-09-03T04:00:00.000Z';
/* The stamp the grouped-daily fallback used to store for the SAME Friday. */
const AAPL_SEP4_CLOSE_STAMP = '2026-09-04T20:00:00.000Z';

ok("Friday's bar is called Sep 4", sessionDatePlain(TSLA_SEP4) === 'Sep 4', sessionDatePlain(TSLA_SEP4));
ok("Thursday's bar is called Sep 3", sessionDatePlain(TSLA_SEP3) === 'Sep 3', sessionDatePlain(TSLA_SEP3));
ok(
  'the 16:00 ET stamp for that Friday is also Sep 4',
  sessionDatePlain(AAPL_SEP4_CLOSE_STAMP) === 'Sep 4',
  sessionDatePlain(AAPL_SEP4_CLOSE_STAMP),
);
ok(
  'both stamps for one session agree',
  sessionDatePlain(TSLA_SEP4) === sessionDatePlain(AAPL_SEP4_CLOSE_STAMP),
);

/*
  A SESSION IS NOT A PLACE. Whatever this device thinks the date is, the bar
  belongs to the same trading day for every member — so the answer here must be
  the answer New York gives, byte for byte.
*/
const inNewYork = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric',
}).format(new Date(TSLA_SEP4));
ok('the name is the market\'s, not the device\'s', sessionDatePlain(TSLA_SEP4) === inNewYork, {
  here: sessionDatePlain(TSLA_SEP4), newYork: inNewYork,
});

/*
  THE OLD LINE, kept here as the thing that must never come back. In a zone
  west of Eastern it renames Friday's bar to Thursday; the assertion is not
  that it is wrong everywhere, but that we no longer agree with it wherever it
  disagrees with the market.
*/
const deviceLocal = new Date(TSLA_SEP4).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
if (deviceLocal !== 'Sep 4') {
  console.log(`       (device-local formatting says "${deviceLocal}" here — the bug this replaces)`);
  ok('device-local formatting is not what we ship', sessionDatePlain(TSLA_SEP4) !== deviceLocal);
}

/* Nothing is invented: an absent or unparseable stamp names no session. */
ok('no bar, no name', sessionDatePlain(null) === null);
ok('an unparseable stamp names nothing', sessionDatePlain('whenever') === null);
ok('an empty string names nothing', sessionDatePlain('') === null);
ok('a millisecond number is a stamp too', sessionDatePlain(Date.parse(TSLA_SEP4)) === 'Sep 4');

/*
  THE NEIGHBOUR IT MUST MATCH. `whenPlain` has always rendered market clock
  times in ET; a date that disagreed with the time printed beside it would be a
  second, quieter version of the same bug.
*/
const lastPrint = whenPlain('2026-09-04T19:55:00Z', new Date('2026-09-20T12:00:00Z'));
ok('the session date agrees with the ET clock line', (lastPrint ?? '').startsWith('Sep 4'), lastPrint);

if (failures) {
  console.log(`  ${failures} failed in ${TZ}`);
  process.exit(1);
}
console.log('  ok   session names are New York\'s in this zone');
