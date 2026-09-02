/**
 * `resolveDelivery()` — the table.
 *
 *   cd apps/api && npm test
 *
 * WHY A TABLE AND NOT A SPEC. Every bug in a notification system lives in this
 * function: the timezone nobody has, the window that wraps past midnight, the
 * budget that quietly ate a trigger the user asked for, the switch that was
 * read as off when it was merely absent. None of those are visible in a code
 * review and all of them are one line of arithmetic. So the decision was made
 * pure — no database, no network, no clock — and every case below runs in
 * microseconds with no stack around it. There is no excuse not to run this.
 *
 * WHAT IS GUARDED, and why each one earns a row rather than a comment:
 *
 *  1. THE WRAP PAST MIDNIGHT. 22:00→07:00 is what a person means by quiet
 *     hours, and `start < now < end` is wrong for all nine of those hours. It
 *     is asserted at 23:30, at 03:00 and at 12:00 on the same window.
 *  2. THE TIMEZONE IS THE USER'S. The same instant is inside one user's quiet
 *     hours and outside another's. A UTC-only implementation passes every test
 *     written in UTC and buzzes New York at 2am.
 *  3. THE BUDGET IS PROACTIVE-ONLY. A trigger on an alert the user created is
 *     never capped. This is a promise the product makes out loud (brief §4.2)
 *     and it is one boolean away from being broken.
 *  4. ABSENT IS ON. `categories:{}` is a user who has never opened the switches,
 *     not a user who switched everything off.
 *  5. SUPPRESSIONS ARE RECORDS. Every path out returns a reason and never an
 *     empty result — a notification that vanished with no row is unanswerable
 *     six hours later when someone asks why they did not get it.
 *  6. THE ADDENDA (§12.1, §12.2): a user-level suppression carries
 *     `transport:'none'` and no subscription; a web row with null keys is
 *     skipped and marked stale rather than throwing inside the drain.
 */
import {
  DEFAULT_MAX_PER_DAY,
  KIND_CATEGORY,
  PROACTIVE_KINDS,
  inQuietHours,
  isProactive,
  localMinutes,
  parseClock,
  resolveDelivery,
  startOfLocalDay,
  type PushPrefs,
  type PushSubscriptionRecord,
  type ResolveInput,
} from '../src/lib/push/policy.ts';
import type { NotifyKind } from '../src/lib/notify.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const expoSub = (over: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord => ({
  id: 'sub-expo',
  transport: 'expo',
  handle: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  keys: null,
  state: 'active',
  ...over,
});

const webSub = (over: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord => ({
  id: 'sub-web',
  transport: 'web',
  handle: 'https://push.example/abc',
  keys: { p256dh: 'BPublicKey', auth: 'authsecret' },
  state: 'active',
  ...over,
});

const prefs = (over: Partial<PushPrefs> = {}): PushPrefs => ({
  push_enabled: true,
  categories: {},
  quiet_hours: null,
  max_per_day: null,
  ...over,
});

/** Noon UTC on a Wednesday in March — nowhere near anyone's midnight. */
const NOON_UTC = new Date('2026-03-11T12:00:00Z');

const resolve = (over: Partial<ResolveInput> = {}) =>
  resolveDelivery({
    kind: 'alert_trigger',
    user: { timezone: 'America/New_York' },
    prefs: prefs(),
    subscriptions: [expoSub()],
    now: NOON_UTC,
    sentToday: 0,
    ...over,
  });

const reasons = (r: ReturnType<typeof resolve>) => r.suppressed.map((s) => s.reason);

/* ------------------------------------------------------------------ */

section('The clock, on its own');

ok('a plain HH:MM parses to minutes since midnight', parseClock('22:00') === 22 * 60);
ok('seconds are tolerated', parseClock('07:30:00') === 7 * 60 + 30);
ok('a single-digit hour parses', parseClock('7:30') === 7 * 60 + 30);
ok('midnight is zero, not falsy-null', parseClock('00:00') === 0);
ok('an hour past 23 is not a time', parseClock('24:00') === null);
ok('a minute past 59 is not a time', parseClock('22:60') === null);
ok('nonsense is null rather than a throw', parseClock('later') === null);
ok('an empty preference is null', parseClock('') === null && parseClock(null) === null);

ok(
  'noon UTC is 08:00 in New York',
  localMinutes(NOON_UTC, 'America/New_York') === 8 * 60,
  localMinutes(NOON_UTC, 'America/New_York')
);
ok('noon UTC is 21:00 in Tokyo', localMinutes(NOON_UTC, 'Asia/Tokyo') === 21 * 60);
ok(
  'an unknown timezone answers null rather than throwing into an order path',
  localMinutes(NOON_UTC, 'Mars/Olympus_Mons') === null
);

section('Quiet hours — the window that wraps past midnight');

const wrapping = { start: '22:00', end: '07:00', timezone: 'UTC' };

ok('23:30 is inside 22:00→07:00', inQuietHours(wrapping, new Date('2026-03-11T23:30:00Z'), null));
ok('03:00 is inside 22:00→07:00 — the next day', inQuietHours(wrapping, new Date('2026-03-12T03:00:00Z'), null));
ok('22:00 exactly is inside (the window is closed at the start)', inQuietHours(wrapping, new Date('2026-03-11T22:00:00Z'), null));
ok('07:00 exactly is OUTSIDE (open at the end, so 07:00 rings)', !inQuietHours(wrapping, new Date('2026-03-12T07:00:00Z'), null));
ok('12:00 is outside 22:00→07:00', !inQuietHours(wrapping, new Date('2026-03-11T12:00:00Z'), null));
ok('21:59 is outside 22:00→07:00', !inQuietHours(wrapping, new Date('2026-03-11T21:59:00Z'), null));

const sameDay = { start: '09:00', end: '17:00', timezone: 'UTC' };
ok('a same-day window still works — 12:00 is inside 09:00→17:00', inQuietHours(sameDay, NOON_UTC, null));
ok('08:59 is outside 09:00→17:00', !inQuietHours(sameDay, new Date('2026-03-11T08:59:00Z'), null));

ok('no quiet hours at all is not quiet', !inQuietHours(null, NOON_UTC, null));
ok('a half-filled window is not quiet', !inQuietHours({ start: '22:00', end: null, timezone: 'UTC' }, NOON_UTC, null));
ok(
  'start === end is treated as NO window, never as all day — a fat finger must not mute someone forever',
  !inQuietHours({ start: '08:00', end: '08:00', timezone: 'UTC' }, new Date('2026-03-11T08:30:00Z'), null)
);
ok(
  'a malformed time fails towards delivering, because a silent app looks broken',
  !inQuietHours({ start: 'evening', end: 'morning', timezone: 'UTC' }, NOON_UTC, null)
);

section('Quiet hours — the timezone is the user’s, not the server’s');

// The same instant. 03:00 in Tokyo, 13:00 in Berlin, 08:00 in New York.
const instant = new Date('2026-03-11T18:00:00Z');
const window2200to0700 = (tz: string | null) => ({ start: '22:00', end: '07:00', timezone: tz });

ok(
  'Tokyo (03:00 local) is asleep at this instant',
  inQuietHours(window2200to0700('Asia/Tokyo'), instant, null)
);
ok(
  'New York (14:00 local) is awake at the SAME instant',
  !inQuietHours(window2200to0700('America/New_York'), instant, null)
);
ok(
  'with no timezone on the window, the profile’s is used',
  inQuietHours(window2200to0700(null), instant, 'Asia/Tokyo')
);
ok(
  'with neither, the market timezone is the fallback rather than UTC',
  !inQuietHours(window2200to0700(null), instant, null)
);

const r = resolve({
  user: { timezone: 'Asia/Tokyo' },
  prefs: prefs({ quiet_hours: window2200to0700(null) }),
  now: instant,
});
ok('a non-UTC user inside their own quiet hours is suppressed', reasons(r).join() === 'quiet_hours', reasons(r));
ok('and nothing is queued for them', r.send.length === 0);
ok('and the suppression names no device — the decision was user-level', r.suppressed[0].subscription === null);
ok('and its transport is ‘none’ (§12.2)', r.suppressed[0].transport === 'none');
ok('and it carries a sentence the UI can print', /quiet hours/i.test(r.suppressed[0].plain), r.suppressed[0].plain);

section('Quiet hours suppress EVERYTHING, including a triggered alert (§4.1)');

const quietTrigger = resolve({
  kind: 'alert_trigger',
  prefs: prefs({ quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } }),
  now: new Date('2026-03-12T03:00:00Z'),
});
ok('an alert the user created is still silenced at 3am', reasons(quietTrigger).join() === 'quiet_hours');
ok('there is no critical override in v1', quietTrigger.send.length === 0);

section('The master switch and the category switches');

ok(
  'push_enabled false suppresses everything, user-level',
  reasons(resolve({ prefs: prefs({ push_enabled: false }) })).join() === 'prefs_off'
);
ok(
  'and it beats a perfectly good device',
  resolve({ prefs: prefs({ push_enabled: false }), subscriptions: [expoSub(), webSub()] }).send.length === 0
);

ok(
  'a category switched off suppresses that kind',
  reasons(resolve({ kind: 'kai_room_reply', prefs: prefs({ categories: { community: false } }) })).join() ===
    'category_off'
);
ok(
  'and leaves the other kinds alone',
  resolve({ kind: 'alert_trigger', prefs: prefs({ categories: { community: false } }) }).send.length === 1
);
ok(
  'ABSENT means ON — a user who never opened the switches gets everything',
  resolve({ kind: 'community' as unknown as NotifyKind, prefs: prefs({ categories: {} }) }).send.length === 1
);
ok(
  'an explicit true is on, same as absent',
  resolve({ kind: 'kai_room_reply', prefs: prefs({ categories: { community: true } }) }).send.length === 1
);

ok(
  'every NotifyKind maps to exactly one category',
  (['alert_trigger', 'alert_activated', 'setup_published', 'kai_room_reply', 'debrief_ready', 'paper_reset', 'system'] as NotifyKind[])
    .every((k) => typeof KIND_CATEGORY[k] === 'string')
);

section('The daily budget — proactive kinds ONLY (§4.2)');

ok('alert_activated is proactive', isProactive('alert_activated'));
ok('system is proactive', isProactive('system'));
// SWING-3. Nobody asked for THIS symbol on THIS morning, so the morning scan's
// picks spend the daily budget and wait out quiet hours exactly like the rest.
ok('setup_published is proactive', isProactive('setup_published'));
ok('alert_trigger is NOT — the user asked for exactly this one', !isProactive('alert_trigger'));
ok('kai_room_reply is NOT — they @-mentioned Kai themselves', !isProactive('kai_room_reply'));
ok('debrief_ready is NOT — it follows a trade they closed', !isProactive('debrief_ready'));
ok('paper_reset is NOT — they pressed the button', !isProactive('paper_reset'));
ok('the proactive set is those three and no more', PROACTIVE_KINDS.size === 3);

const spent = { prefs: prefs({ max_per_day: 5 }), sentToday: 5 };
ok(
  'a proactive push over the cap is suppressed with reason budget',
  reasons(resolve({ kind: 'alert_activated', ...spent })).join() === 'budget'
);
ok(
  'and the sentence says the number the user themselves set',
  /\b5\b/.test(resolve({ kind: 'alert_activated', ...spent }).suppressed[0].plain)
);
ok(
  'A TRIGGER ON THE USER’S OWN ALERT IS NEVER CAPPED',
  resolve({ kind: 'alert_trigger', ...spent }).send.length === 1
);
ok('nor is a debrief', resolve({ kind: 'debrief_ready', ...spent }).send.length === 1);
ok('nor is a room reply', resolve({ kind: 'kai_room_reply', ...spent }).send.length === 1);
ok(
  'one under the cap still goes',
  resolve({ kind: 'alert_activated', prefs: prefs({ max_per_day: 5 }), sentToday: 4 }).send.length === 1
);
ok(
  'a null max_per_day means the 0008 default, not unlimited',
  reasons(resolve({ kind: 'alert_activated', sentToday: DEFAULT_MAX_PER_DAY })).join() === 'budget'
);
ok(
  'max_per_day 0 means none at all',
  reasons(resolve({ kind: 'alert_activated', prefs: prefs({ max_per_day: 0 }), sentToday: 0 })).join() === 'budget'
);

section('Devices');

ok(
  'zero subscriptions is a recorded reason, not a silent nothing',
  reasons(resolve({ subscriptions: [] })).join() === 'no_subscription'
);
ok('and it is user-level', resolve({ subscriptions: [] }).suppressed[0].transport === 'none');

ok(
  'a revoked device is not a target',
  reasons(resolve({ subscriptions: [expoSub({ state: 'revoked' })] })).join() === 'no_subscription'
);
ok(
  'a stale device is not a target either',
  reasons(resolve({ subscriptions: [expoSub({ state: 'stale' })] })).join() === 'no_subscription'
);
ok(
  'two live devices both get one',
  resolve({ subscriptions: [expoSub(), webSub()] }).send.length === 2
);
ok(
  'a live device beside a revoked one still gets one, and nothing is suppressed',
  (() => {
    const res = resolve({ subscriptions: [expoSub(), webSub({ state: 'revoked' })] });
    return res.send.length === 1 && res.suppressed.length === 0;
  })()
);

section('§12.1 — a web row with null keys is storable and undeliverable');

const noKeys = resolve({ subscriptions: [webSub({ keys: null })] });
ok('it is not sent to', noKeys.send.length === 0);
ok('it is suppressed as keys_missing rather than throwing', reasons(noKeys).join() === 'keys_missing');
ok('the suppression names the device, because this one IS per-device', noKeys.suppressed[0].subscription?.id === 'sub-web');
ok('its transport is the real one, not none', noKeys.suppressed[0].transport === 'web');
ok('and the caller is told to mark it stale', noKeys.suppressed[0].stale === true);
ok(
  'half a key pair is still no key pair',
  reasons(resolve({ subscriptions: [webSub({ keys: { p256dh: 'B', auth: null } })] })).join() === 'keys_missing'
);
ok(
  'an expo row is never asked for keys',
  resolve({ subscriptions: [expoSub({ keys: null })] }).send.length === 1
);
ok(
  'a broken web row does NOT take the good phone down with it',
  (() => {
    const res = resolve({ subscriptions: [expoSub(), webSub({ keys: null })] });
    return res.send.length === 1 && res.send[0].id === 'sub-expo' && res.suppressed.length === 1;
  })()
);
ok(
  'a lone broken row reports keys_missing, not no_subscription — there IS a device, it is just unusable',
  reasons(noKeys).join() === 'keys_missing'
);

section('Entitlement');

ok(
  'a flag set to false gates push',
  reasons(resolve({ entitlementFlags: { push_notifications: false } })).join() === 'entitlement'
);
ok(
  'an absent flag does not gate anything — placement lives in the database',
  resolve({ entitlementFlags: {} }).send.length === 1
);
ok(
  'and an explicit true does not either',
  resolve({ entitlementFlags: { push_notifications: true } }).send.length === 1
);

section('The order of the gates is the product');

ok(
  'entitlement beats push_enabled',
  reasons(resolve({ entitlementFlags: { push_notifications: false }, prefs: prefs({ push_enabled: false }) })).join() ===
    'entitlement'
);
ok(
  'push_enabled beats the category switch',
  reasons(
    resolve({ kind: 'kai_room_reply', prefs: prefs({ push_enabled: false, categories: { community: false } }) })
  ).join() === 'prefs_off'
);
ok(
  'the category switch beats quiet hours',
  reasons(
    resolve({
      kind: 'kai_room_reply',
      prefs: prefs({ categories: { community: false }, quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } }),
      now: new Date('2026-03-12T03:00:00Z'),
    })
  ).join() === 'category_off'
);
ok(
  'quiet hours beat the budget',
  reasons(
    resolve({
      kind: 'alert_activated',
      prefs: prefs({ max_per_day: 1, quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } }),
      sentToday: 9,
      now: new Date('2026-03-12T03:00:00Z'),
    })
  ).join() === 'quiet_hours'
);
ok(
  'the budget beats having no device',
  reasons(resolve({ kind: 'alert_activated', prefs: prefs({ max_per_day: 1 }), sentToday: 9, subscriptions: [] })).join() ===
    'budget'
);

section('A test bypasses the switches it should, and not the one it should not');

ok(
  'a test ignores the category switch — the user just pressed the button',
  resolve({ kind: 'system', prefs: prefs({ categories: { system: false } }), trigger: 'test' }).send.length === 1
);
ok(
  'a test ignores the daily budget',
  resolve({ kind: 'system', prefs: prefs({ max_per_day: 1 }), sentToday: 99, trigger: 'test' }).send.length === 1
);
ok(
  'A TEST DOES NOT IGNORE QUIET HOURS — that is the answer the user needs',
  reasons(
    resolve({
      kind: 'system',
      prefs: prefs({ quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } }),
      now: new Date('2026-03-12T03:00:00Z'),
      trigger: 'test',
    })
  ).join() === 'quiet_hours'
);
ok(
  'nor the master switch — off is off',
  reasons(resolve({ kind: 'system', prefs: prefs({ push_enabled: false }), trigger: 'test' })).join() === 'prefs_off'
);

section('Nothing is ever silently dropped');

const everyCase: ResolveInput[] = [
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs({ push_enabled: false }), subscriptions: [], now: NOON_UTC, sentToday: 0 },
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs({ categories: { trade_alerts: false } }), subscriptions: [expoSub()], now: NOON_UTC, sentToday: 0 },
  { kind: 'alert_activated', user: { timezone: null }, prefs: prefs({ max_per_day: 1 }), subscriptions: [expoSub()], now: NOON_UTC, sentToday: 4 },
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs(), subscriptions: [], now: NOON_UTC, sentToday: 0 },
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs(), subscriptions: [webSub({ keys: null })], now: NOON_UTC, sentToday: 0 },
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs({ quiet_hours: { start: '00:00', end: '23:59', timezone: 'UTC' } }), subscriptions: [expoSub()], now: NOON_UTC, sentToday: 0 },
  { kind: 'alert_trigger', user: { timezone: null }, prefs: prefs(), subscriptions: [expoSub()], now: NOON_UTC, sentToday: 0, entitlementFlags: { push_notifications: false } },
];
ok(
  'every suppressing case produces at least one row with a reason and a sentence',
  everyCase.every((c) => {
    const res = resolveDelivery(c);
    return res.send.length + res.suppressed.length > 0 && res.suppressed.every((s) => s.reason && s.plain);
  })
);
ok(
  'and a delivering case produces no suppression at all',
  (() => {
    const res = resolve();
    return res.send.length === 1 && res.suppressed.length === 0;
  })()
);

section('The budget’s day is the user’s day, not UTC’s');

const tokyoDay = startOfLocalDay(new Date('2026-03-11T18:00:00Z'), 'Asia/Tokyo');
ok(
  'at 18:00 UTC, Tokyo’s day started at 15:00 UTC the same date',
  tokyoDay.toISOString() === '2026-03-11T15:00:00.000Z',
  tokyoDay.toISOString()
);
// 22:00 on the 10th in New York, and the US is already on summer time by
// 2026-03-11 — so the boundary is 04:00Z, not 05:00Z. The offset is READ at
// `now` rather than assumed, which is the only reason this lands right.
const nyDay = startOfLocalDay(new Date('2026-03-11T02:00:00Z'), 'America/New_York');
ok(
  'at 02:00 UTC, New York is still on the PREVIOUS day, at the offset in force that day',
  nyDay.toISOString() === '2026-03-10T04:00:00.000Z',
  nyDay.toISOString()
);
ok(
  'an unknown timezone falls back rather than throwing',
  startOfLocalDay(NOON_UTC, 'Mars/Olympus_Mons') instanceof Date
);

section('The decision is PURE');

const frozen: ResolveInput = {
  kind: 'alert_trigger',
  user: { timezone: 'America/New_York' },
  prefs: prefs({ quiet_hours: { start: '22:00', end: '07:00', timezone: 'America/New_York' } }),
  subscriptions: [expoSub(), webSub()],
  now: NOON_UTC,
  sentToday: 0,
};
const a = JSON.stringify(resolveDelivery(frozen));
const b = JSON.stringify(resolveDelivery(frozen));
ok('the same input gives the same answer', a === b);
ok(
  'and it did not mutate its input',
  JSON.stringify(frozen.subscriptions) ===
    JSON.stringify([expoSub(), webSub()])
);

/* ------------------------------------------------------------------ */

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
