/**
 * THE DATA IS LIVE, AND THE LABEL OVER IT IS TRUE.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. Every price surface in this app fetched once in a
 * `useEffect` and then froze. Home, Alerts and Trade are tabs, so they never
 * unmount, so a quote fetched at 9:31 was still the number on screen at two in
 * the afternoon — under a green "Live · 9:31 AM" dot, because the freshness
 * label was the server's word from the moment it answered and nothing ever
 * compared it to the clock again. The server was fine the whole time.
 *
 * Three things had to become true, and this file is the standing proof of all
 * three, because each of them is the kind of property that is easy to write
 * once and quietly lose:
 *
 *   1. THE CADENCE IS THE SESSION'S.   15s open, 60s extended, and genuinely
 *      NOTHING when the market is closed. Candles follow their own bar width.
 *   2. NOTHING POLLS THAT NOBODY IS LOOKING AT.  A backgrounded app or a hidden
 *      browser tab issues zero requests. This is the cost rule, and it is
 *      driven here with a fake clock and a fake tab rather than described.
 *   3. A FRESHNESS LABEL ONLY EVER GETS WORSE.  It decays with age and it may
 *      never promote the server's `delayed` or `stale` to `live`.
 */
import {
  CANDLE_INTERVAL_MS, QUOTE_INTERVAL_MS, currentSession, forgetMarketStatus,
  noteMarketStatus, refreshIntervalMs, sessionFromClock, sessionOf,
} from '../src/lib/market-session';
import { startMarketPoll, type Scheduler } from '../src/lib/poller';
import { decayFreshness } from '../src/lib/freshness-decay';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

function head(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

/* ================================================================== */
/* 1. The cadence is the session's                                     */
/* ================================================================== */

head('How often a quote is worth asking for');
{
  ok('open → every 15 seconds', refreshIntervalMs('open', 'quote') === 15_000,
    refreshIntervalMs('open', 'quote'));
  ok('pre / post market → every minute', refreshIntervalMs('extended', 'quote') === 60_000,
    refreshIntervalMs('extended', 'quote'));
  /*
    THE ONE THAT SAVES THE MONEY. A closed market must return null — "do not
    ask again" — and not a large number. A phone left on the alerts tab
    overnight is the case this is about: at a slow poll it would still make
    hundreds of requests before the bell for a price that cannot change.
  */
  ok('closed → never, not slowly', refreshIntervalMs('closed', 'quote') === null,
    refreshIntervalMs('closed', 'quote'));
  ok('and the table agrees with itself', QUOTE_INTERVAL_MS.closed === null);
}

head('A bar refreshes on a cadence that matches its width');
{
  const open = (tf: string) => refreshIntervalMs('open', 'candles', tf);
  ok('1m  → 30s', open('1m') === 30_000, open('1m'));
  ok('5m  → 60s', open('5m') === 60_000, open('5m'));
  ok('15m → 60s', open('15m') === 60_000, open('15m'));
  ok('1h  → 5min', open('1h') === 300_000, open('1h'));
  ok('4h  → 15min', open('4h') === 900_000, open('4h'));
  ok('1d  → 5min', open('1d') === 300_000, open('1d'));
  ok("the portal's 'D' is the same daily bar", open('D') === CANDLE_INTERVAL_MS['1d']);

  // Asking for hourly candles at the quote cadence would buy the same bar 240
  // times. The bar's width is the only sane throttle.
  ok('an hourly bar is never asked for at the quote cadence',
    (open('1h') ?? 0) > (QUOTE_INTERVAL_MS.open ?? 0) * 4);

  ok('a closed market draws no bars either', refreshIntervalMs('closed', 'candles', '1m') === null);

  // Extended hours are thin: a 30-second poll out there buys the same three
  // bars over and over.
  ok('nothing beats the quote cadence before the bell',
    refreshIntervalMs('extended', 'candles', '1m') === 60_000,
    refreshIntervalMs('extended', 'candles', '1m'));

  // An unrecognised width must not fall through to "as fast as possible".
  ok('an unknown bar width is treated as a slow bar',
    refreshIntervalMs('open', 'candles', '3h') === 300_000);
}

head("Reading the server's word for the session");
{
  ok("'open' is open", sessionOf('open') === 'open');
  ok("'pre' and 'post' are both extended",
    sessionOf('pre') === 'extended' && sessionOf('post') === 'extended');
  ok("'closed' and 'holiday' are both closed",
    sessionOf('closed') === 'closed' && sessionOf('holiday') === 'closed');
  ok('and a server that said nothing is not an answer', sessionOf(undefined) === null);
}

head('With no market block, the New York clock answers');
{
  // Every instant below is written in UTC and read in ET, which is the point:
  // the phone's own zone must never decide whether the market is open.
  const at = (iso: string) => sessionFromClock(new Date(iso));
  ok('Wed 10:30 ET is open', at('2026-09-09T14:30:00Z') === 'open', at('2026-09-09T14:30:00Z'));
  ok('Wed 08:00 ET is pre-market', at('2026-09-09T12:00:00Z') === 'extended', at('2026-09-09T12:00:00Z'));
  ok('Wed 17:00 ET is post-market', at('2026-09-09T21:00:00Z') === 'extended', at('2026-09-09T21:00:00Z'));
  ok('Wed 02:00 ET is closed', at('2026-09-09T06:00:00Z') === 'closed', at('2026-09-09T06:00:00Z'));
  ok('Saturday lunchtime is closed', at('2026-09-12T16:00:00Z') === 'closed', at('2026-09-12T16:00:00Z'));
  ok('and so is Sunday', at('2026-09-13T16:00:00Z') === 'closed');
  ok('the bell is 9:30, not 9:00', at('2026-09-09T13:15:00Z') === 'extended');
  ok('and 16:00 is the close', at('2026-09-09T20:00:00Z') === 'extended');
}

head('What Home saw, every other screen gets to use');
{
  /*
    `/home` is the only payload carrying a `market` block and it is the first
    screen anybody opens. Its answer is remembered so the watchlist knows to
    stay quiet on Thanksgiving — a holiday the clock above cannot see.
  */
  forgetMarketStatus();
  const thanksgiving = new Date('2026-11-26T15:00:00Z'); // a Thursday, 10:00 ET
  ok('the clock alone would call a holiday morning open',
    sessionFromClock(thanksgiving) === 'open');

  noteMarketStatus('holiday', thanksgiving.getTime());
  ok('but the server said holiday, and that wins',
    currentSession(null, thanksgiving) === 'closed');

  ok("a payload's OWN market block outranks everything",
    currentSession('open', thanksgiving) === 'open');

  // It expires, or a remembered "open" would keep the watchlist polling all
  // evening on the strength of one visit to Home that morning.
  forgetMarketStatus();
  noteMarketStatus('closed', thanksgiving.getTime() - 60 * 60_000);
  ok('an hour-old memory has expired and the clock takes over again',
    currentSession(null, thanksgiving) === 'open',
    currentSession(null, thanksgiving));
  forgetMarketStatus();
}

/* ================================================================== */
/* 2. Nothing polls that nobody is looking at                          */
/* ================================================================== */

/** A clock and a timer we own, so the test can move time without waiting. */
function fakeWorld() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map<number, { fn: () => void; ms: number; next: number }>();
  const scheduler: Scheduler = {
    now: () => now,
    setInterval: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { fn, ms, next: now + ms });
      return id;
    },
    clearInterval: (h) => { timers.delete(h as number); },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    // Fire every timer that comes due, in time order, like a real event loop.
    for (;;) {
      let due: [number, { fn: () => void; ms: number; next: number }] | null = null;
      for (const entry of timers) if (!due || entry[1].next < due[1].next) due = entry;
      if (!due || due[1].next > target) break;
      now = due[1].next;
      due[1].next = now + due[1].ms;
      due[1].fn();
    }
    now = target;
  };
  return {
    scheduler,
    advance,
    setNow: (t: number) => { now = t; },
    at: () => now,
    liveTimers: () => timers.size,
  };
}

/** A tab that can be hidden, with the listener the real one uses. */
function fakeTab(visible = true) {
  let fg = visible;
  const subs = new Set<(v: boolean) => void>();
  return {
    isForeground: () => fg,
    subscribeForeground: (fn: (v: boolean) => void) => { subs.add(fn); return () => subs.delete(fn); },
    set: (v: boolean) => { fg = v; for (const s of subs) s(v); },
    listeners: () => subs.size,
  };
}

head('A market that is closed creates no timer at all');
{
  const w = fakeWorld();
  const tab = fakeTab(true);
  let ticks = 0;
  const stop = startMarketPoll({
    intervalMs: refreshIntervalMs('closed', 'quote'),
    fire: () => { ticks += 1; },
    lastRunAt: w.at(),
    isForeground: tab.isForeground,
    subscribeForeground: tab.subscribeForeground,
    scheduler: w.scheduler,
  });
  w.advance(8 * 60 * 60_000); // the whole night
  ok('eight hours pass and nothing is requested', ticks === 0, ticks);
  ok('there is no timer running', w.liveTimers() === 0);
  ok('and nothing is listening for the tab either', tab.listeners() === 0);
  stop();
}

head('A backgrounded app issues zero requests');
{
  const w = fakeWorld();
  const tab = fakeTab(true);
  let ticks = 0;
  const stop = startMarketPoll({
    intervalMs: 15_000,
    fire: () => { ticks += 1; },
    lastRunAt: w.at(),
    isForeground: tab.isForeground,
    subscribeForeground: tab.subscribeForeground,
    scheduler: w.scheduler,
  });

  w.advance(45_000);
  ok('while it is on screen it refreshes on the interval', ticks === 3, ticks);

  tab.set(false);          // phone locked, or the browser tab hidden
  const atSleep = ticks;
  ok('going away kills the timer, it does not pause it', w.liveTimers() === 0);
  w.advance(10 * 60_000);  // ten minutes in somebody's pocket
  ok('ten minutes in the background costs nothing', ticks === atSleep, { atSleep, ticks });

  /*
    AND IT IS RIGHT AGAIN THE INSTANT YOU LOOK. The data on screen is ten
    minutes old, which is far past one interval, so the correct number is owed
    immediately rather than fifteen seconds from now.
  */
  tab.set(true);
  ok('coming back refreshes at once', ticks === atSleep + 1, { atSleep, ticks });
  ok('and the timer is running again', w.liveTimers() === 1);

  stop();
  const atStop = ticks;
  w.advance(5 * 60_000);
  ok('blurring the screen stops it for good', ticks === atStop);
  ok('with no timer left behind', w.liveTimers() === 0);
  ok('and no listener left behind', tab.listeners() === 0);
}

head('A tab that was never in front never fires');
{
  const w = fakeWorld();
  const tab = fakeTab(false);   // hidden before the surface even mounted
  let ticks = 0;
  const stop = startMarketPoll({
    intervalMs: 15_000,
    fire: () => { ticks += 1; },
    lastRunAt: w.at() - 60 * 60_000,   // an hour-old number: very much due
    isForeground: tab.isForeground,
    subscribeForeground: tab.subscribeForeground,
    scheduler: w.scheduler,
  });
  w.advance(60_000);
  ok('stale data in a hidden tab is still not fetched', ticks === 0, ticks);
  ok('and no timer was created', w.liveTimers() === 0);
  tab.set(true);
  ok('showing it fetches the number it owes', ticks === 1, ticks);
  stop();
}

head('Coming back to a number that is still fresh asks for nothing');
{
  const w = fakeWorld();
  const tab = fakeTab(true);
  let ticks = 0;
  const stop = startMarketPoll({
    intervalMs: 15_000,
    fire: () => { ticks += 1; },
    lastRunAt: w.at(),   // just fetched — mount counts as a fetch
    isForeground: tab.isForeground,
    subscribeForeground: tab.subscribeForeground,
    scheduler: w.scheduler,
  });
  ok('mounting does not immediately re-ask for what it just loaded', ticks === 0, ticks);
  w.advance(14_000);
  ok('and it waits out the interval', ticks === 0, ticks);
  w.advance(2_000);
  ok('then it asks once', ticks === 1, ticks);
  stop();
}

/* ================================================================== */
/* 3. A freshness label only ever gets worse                           */
/* ================================================================== */

const T0 = Date.parse('2026-09-09T14:30:00Z');   // Wednesday, 10:30 ET
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();
const open = { now: T0, session: 'open' as const };

head('The word decays as the price ages');
{
  ok('a print from ten seconds ago is live',
    decayFreshness('live', null, iso(10_000), open) === 'live');
  ok('a quote nobody refreshed for two minutes is not live any more',
    decayFreshness('live', null, iso(120_000), open) === 'delayed',
    decayFreshness('live', null, iso(120_000), open));
  ok('and by ten minutes it is stale',
    decayFreshness('live', null, iso(600_000), open) === 'stale',
    decayFreshness('live', null, iso(600_000), open));

  /*
    THE BUG THIS WHOLE LANE IS ABOUT, stated as an assertion: a quote fetched
    at 9:31 and left on a mounted tab until 14:00 must not still say "Live".
  */
  const nineThirtyOne = Date.parse('2026-09-09T13:31:00Z');
  const twoPm = Date.parse('2026-09-09T18:00:00Z');
  ok('9:31 does not read as live at two in the afternoon',
    decayFreshness('live', null, new Date(nineThirtyOne).toISOString(),
      { now: twoPm, session: 'open' }) === 'stale');
}

head('It may never make a label better');
{
  ok("the server's 'delayed' on a one-second-old quote stays delayed",
    decayFreshness('delayed', null, iso(1_000), open) === 'delayed');
  ok("and its 'stale' stays stale no matter how new the timestamp",
    decayFreshness('stale', null, iso(0), open) === 'stale');
  ok('an entitlement delay is never promoted to live',
    decayFreshness('delayed', 'entitlement', iso(1_000), open) === 'delayed');
  ok('a feed gap is never promoted either',
    decayFreshness('delayed', 'feed_gap', iso(1_000), open) === 'delayed');

  // A delayed quote can still get WORSE — that is the direction that is allowed.
  ok('but a delayed quote can go stale with age',
    decayFreshness('delayed', null, iso(20 * 60_000), open) === 'stale');
}

head("Some labels are already the honest word and must be left alone");
{
  /*
    "Market closed" is the true thing to say about a Saturday price. Decaying it
    to "Stale" would replace a fact with an alarm, and the number under it is
    not going to improve before Monday.
  */
  ok('a closed-market quote does not decay into stale',
    decayFreshness('live', 'market_closed', iso(72 * 3600_000), open) === 'live');
  ok('sample data stays sample data',
    decayFreshness('delayed', 'seed', iso(72 * 3600_000), open) === 'delayed');
  ok("'closed' is not a claim about recency",
    decayFreshness('closed', null, iso(72 * 3600_000), open) === 'closed');
  ok("nor is 'unknown'",
    decayFreshness('unknown', null, iso(72 * 3600_000), open) === 'unknown');

  // Overnight EVERY price is old. That is not news and must not paint the
  // whole app red.
  ok('nothing decays while the market is closed',
    decayFreshness('live', null, iso(6 * 3600_000), { now: T0, session: 'closed' }) === 'live');
}

head('And it never guesses');
{
  ok('a quote with no timestamp keeps the word it came with',
    decayFreshness('live', null, null, open) === 'live');
  ok('an unparseable timestamp is not a stale one',
    decayFreshness('live', null, 'whenever', open) === 'live');
  ok('a timestamp from the future is a clock disagreement, not freshness',
    decayFreshness('live', null, iso(-60_000), open) === 'live');

  // Extended hours poll every 60s, so a 60s threshold would flicker between
  // Live and Delayed on a screen that is working perfectly.
  const ext = { now: T0, session: 'extended' as const };
  ok('the live window is wider than the poll interval before the bell',
    decayFreshness('live', null, iso(70_000), ext) === 'live');
  ok('but it still runs out', decayFreshness('live', null, iso(120_000), ext) === 'delayed');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — live refresh, ${failures} failed\n`);
if (failures) process.exit(1);
