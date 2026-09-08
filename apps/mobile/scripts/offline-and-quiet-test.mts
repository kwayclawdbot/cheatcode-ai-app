/**
 * RETURN · REVIEW · RECOVER — the three rules, checked as pure logic.
 *
 *   npx tsx scripts/offline-and-quiet-test.mts
 *
 * Three things landed in this wave that a screenshot cannot protect, because
 * each of them is a rule about what the app is ALLOWED TO SAY:
 *
 *   1. An absent fact is never a failure. A plan that named no target did not
 *      miss its target, and the trade review must not mark anybody down for it.
 *   2. A failed load is never a verified empty list (audit F18). "Nothing needs
 *      you" is a finding, and it may only be said when every read answered.
 *   3. Nothing is remembered without the instant it was fetched, and nothing
 *      remembered is served past its age limit.
 *
 * All three are pure functions on purpose, so the rule is what is checked
 * rather than a rendering of it. The API-side adherence module is imported
 * across the workspace: it takes only type-level imports from the contract, so
 * tsx never has to resolve zod to run it.
 */
import {
  adherenceFrom, headlineFor, practiceFor, exitPrice, firstTarget, entryLevel, stopWasMoved,
  type AdherenceFacts,
} from '../../api/src/lib/kai/debrief-adherence.ts';
import { homeStanding } from '../../api/src/lib/v5/standing.ts';
import { capabilityFor, updatedAtLabel, onlineFrom } from '../src/lib/capability-state.ts';
import { isFresh, cacheKey, MAX_AGE_MS } from '../src/lib/offline-cache.ts';
import { openingFor } from '../src/features/home/opening.ts';
import { withBriefingOffer } from '../src/features/home/wake-message.ts';


let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`); }
};
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`); }
};

/* ================================================================== */
/* 1 — the trade review may not judge somebody for a missing fact       */
/* ================================================================== */

console.log('\n[1] plan adherence');

const BASE: AdherenceFacts = {
  direction: 'long',
  plannedEntry: 178.4,
  plannedStop: 171.9,
  plannedTarget: 195,
  actualEntry: 178.4,
  actualExit: 186.2,
  stopMoved: false,
  hasPlan: true,
};

const board = adherenceFrom(BASE);
ok('the board case produces a block', !!board);
eq('headline', board?.headline, 'Risk respected. Exit improvised.');
eq('entry followed', board?.checks[0].status, 'followed');
eq('entry detail names the fill', board?.checks[0].detail_plain, 'You entered at 178.40 as planned.');
eq('stop respected', board?.checks[1].status, 'followed');
eq('exit changed', board?.checks[2].status, 'changed');
eq('exit detail names both numbers', board?.checks[2].detail_plain, 'You exited at 186.20, not your 195.00 target.');
eq('and it offers the exit exercise', board?.practice?.skill, 'trade_management');
eq('with the board’s own words', board?.practice?.label, 'Practise the exit');
eq('the levels ride along for the chart', board?.planned_levels, { entry: 178.4, stop: 171.9, target: 195 });

/**
 * THE RULE THAT MATTERS MOST. A plan with no target has nothing to miss. The
 * line must be `not_planned`, must say so in words, and must NOT produce a
 * practice hand-off — being sent to a lesson about missing a target you never
 * set is the same accusation dressed as help.
 */
const noTarget = adherenceFrom({ ...BASE, plannedTarget: null });
eq('no target -> not_planned, never changed', noTarget?.checks[2].status, 'not_planned');
ok(
  'and it says there was nothing to miss',
  /no target to miss|nothing to miss/.test(noTarget?.checks[2].detail_plain ?? ''),
  noTarget?.checks[2].detail_plain,
);
eq('no target -> no practice hand-off', noTarget?.practice, null);
ok('no target -> the headline does not accuse', !/improvis/i.test(noTarget?.headline ?? ''), noTarget?.headline);

const noStop = adherenceFrom({ ...BASE, plannedStop: null, plannedTarget: null });
eq('no stop -> not_planned', noStop?.checks[1].status, 'not_planned');
ok('no stop -> the headline says risk was never defined', noStop?.headline.startsWith('Risk was never defined.'), noStop?.headline);
eq('nothing planned -> nothing to practise', noStop?.practice, null);

const noFill = adherenceFrom({ ...BASE, actualExit: null });
eq('no exit fill -> not a failure', noFill?.checks[2].status, 'not_planned');
ok('and it refuses to guess a price', /not going to guess|do not have/i.test(noFill?.checks[2].detail_plain ?? ''), noFill?.checks[2].detail_plain);

eq('no plan at all -> no block, the receipt already said it once', adherenceFrom({ ...BASE, hasPlan: false }), null);

// Deviations that ARE deviations still are.
const moved = adherenceFrom({ ...BASE, stopMoved: true });
eq('a moved stop is a change', moved?.checks[1].status, 'changed');
eq('and the stop is what to practise', moved?.practice?.skill, 'trade_management');
const overrun = adherenceFrom({ ...BASE, actualExit: 168 });
eq('coming out past the stop is a change', overrun?.checks[1].status, 'changed');
const late = adherenceFrom({ ...BASE, actualEntry: 182 });
eq('a materially different entry is a change', late?.checks[0].status, 'changed');
eq('slippage inside tolerance is not', adherenceFrom({ ...BASE, actualEntry: 178.6 })?.checks[0].status, 'followed');
const clean = adherenceFrom({ ...BASE, actualExit: 195 });
eq('hitting the target is followed', clean?.checks[2].status, 'followed');
eq('and a clean trade offers no correction', clean?.practice, null);
eq('clean headline', clean?.headline, 'Risk respected. Plan followed.');

// Short trades invert every comparison.
const short = adherenceFrom({ ...BASE, direction: 'short', plannedEntry: 195, actualEntry: 195, plannedStop: 200, plannedTarget: 178, actualExit: 186 });
eq('short: exit short of target is a change', short?.checks[2].status, 'changed');
eq('short: exit inside the stop is respected', short?.checks[1].status, 'followed');

// The pure readers.
eq('entryLevel reads the shapes plans write', entryLevel({ level: 178.4 }), 178.4);
eq('entryLevel on a silent plan', entryLevel(null), null);
eq('firstTarget takes the first, from either shape', firstTarget([{ level: 195 }, { price: 210 }]), 195);
eq('firstTarget on nothing', firstTarget(null), null);

const sources = {
  orders: [
    { id: 'o1', side: 'buy_to_open', type: 'market', qty: 10, status: 'filled', created_at: '' },
    { id: 'o2', side: 'sell_to_close', type: 'market', qty: 10, status: 'filled', created_at: '' },
  ],
  fills: [
    { order_id: 'o1', qty: 10, price: 178.4, ts: '' },
    { order_id: 'o2', qty: 4, price: 186, ts: '' },
    { order_id: 'o2', qty: 6, price: 186.2, ts: '' },
  ],
  planEvents: [],
} as never;
eq('exitPrice is weighted across a scaled-out exit', Math.round((exitPrice(sources) ?? 0) * 100) / 100, 186.12);
eq('a stop being ATTACHED is not a stop being moved', stopWasMoved({ planEvents: [{ type: 'stop_attached', payload: {}, created_at: '' }] } as never), false);
eq('a stop being CHANGED is', stopWasMoved({ planEvents: [{ type: 'stop_updated', payload: {}, created_at: '' }] } as never), true);

eq(
  'headlineFor never names a leg the plan did not carry',
  headlineFor([
    { key: 'entry', label: '', status: 'not_planned', detail_plain: '', planned: null, actual: null },
    { key: 'stop', label: '', status: 'not_planned', detail_plain: '', planned: null, actual: null },
    { key: 'exit', label: '', status: 'not_planned', detail_plain: '', planned: null, actual: null },
  ]),
  'Risk was never defined. Nothing else was written down.',
);
eq(
  'practiceFor offers the exit before the stop before the entry',
  practiceFor([
    { key: 'entry', label: '', status: 'changed', detail_plain: '', planned: null, actual: null },
    { key: 'stop', label: '', status: 'changed', detail_plain: '', planned: null, actual: null },
    { key: 'exit', label: '', status: 'changed', detail_plain: '', planned: null, actual: null },
  ])?.skill,
  'trade_management',
);

/* ================================================================== */
/* 2 — quiet is a finding; unanswered is not (audit F18)                */
/* ================================================================== */

console.log('\n[2] quiet vs unverified');

const AT = '2026-09-08T13:42:00.000Z';
const allAnswered = {
  setups: { ok: true, count: 0 },
  alerts: { ok: true, count: 0 },
  positions: { ok: true, count: 0 },
  plans: { ok: true, count: 0 },
  briefing: { ok: true, present: false },
};

const quiet = homeStanding({ checkedAt: AT, needsDecision: false, reads: allAnswered });
eq('everything answered and empty -> quiet', quiet.state, 'quiet');
eq('and it is allowed to say the watchlist is up to date', quiet.plain, 'Nothing needs a decision. Your watchlist is up to date.');
eq('the timestamp is the server’s', quiet.checked_at, AT);
eq('every check is reported', quiet.checks.length, 5);

const oneFailed = homeStanding({
  checkedAt: AT,
  needsDecision: false,
  reads: { ...allAnswered, positions: { ok: false, count: 0 } },
});
eq('ONE failed read demotes the whole standing', oneFailed.state, 'unverified');
ok('it names what it could not check', /open positions/.test(oneFailed.plain), oneFailed.plain);
ok('and it never claims the list is clear', !/up to date|nothing needs a decision/i.test(oneFailed.plain), oneFailed.plain);
eq('a failed read reports no count', oneFailed.checks.find((c) => c.key === 'positions')?.count, null);

const busy = homeStanding({ checkedAt: AT, needsDecision: true, reads: allAnswered });
eq('something to decide -> needs_you', busy.state, 'needs_you');

const busyButBlind = homeStanding({
  checkedAt: AT,
  needsDecision: true,
  reads: { ...allAnswered, alerts: { ok: false, count: 0 } },
});
eq('a found object does not rescue a failed read', busyButBlind.state, 'unverified');
ok('but the object is still acknowledged', /needs you/i.test(busyButBlind.plain), busyButBlind.plain);

/* the client half of the same rule */
console.log('\n[3] the shared capability states');

eq('nothing held, request in flight', capabilityFor({ hasData: false, loading: true }), 'loading');
eq('a failed request with nothing behind it', capabilityFor({ hasData: false, failed: true }), 'failed');
eq('a failed refresh over good data keeps the data', capabilityFor({ hasData: true, failed: true }), 'stale');
eq('no network outranks a failed request', capabilityFor({ hasData: false, failed: true, online: false }), 'offline');
eq('an entitlement wall outranks everything', capabilityFor({ hasData: false, failed: true, online: false, blocked: true }), 'blocked');
eq('an unknown network is not an offline one', capabilityFor({ hasData: true, empty: false, online: undefined }), 'ready');
eq('empty AND verified is quiet', capabilityFor({ hasData: true, empty: true, verified: true }), 'quiet');
eq('empty and UNVERIFIED is never quiet', capabilityFor({ hasData: true, empty: true, verified: false }), 'failed');

/* ================================================================== */
/* 4 — nothing is remembered without the instant it was fetched         */
/* ================================================================== */

console.log('\n[4] the offline cache');

const NOW = Date.parse(AT);
ok('a fresh entry is served', isFresh(NOW - 60_000, NOW));
ok('an entry older than the limit is not', !isFresh(NOW - MAX_AGE_MS - 1, NOW));
ok('a timestamp from the future is not trusted', !isFresh(NOW + 10 * 60_000, NOW));
ok('the key always carries the account', cacheKey('user-1', 'home.v5.day_trade').includes('user-1'));
ok('and two accounts never share one', cacheKey('a', 'home.v5') !== cacheKey('b', 'home.v5'));
eq('no timestamp, no provenance line', updatedAtLabel(null), null);
eq('an unparseable timestamp is not rendered as one', updatedAtLabel('not a date'), null);
ok('a real one reads as a time', (updatedAtLabel(NOW) ?? '').startsWith('Last updated '), updatedAtLabel(NOW) ?? '');

/* ================================================================== */
/* 5 — connectivity, and the difference between "no" and "not yet"      */
/* ================================================================== */

console.log('\n[5] connectivity');

eq('connected and reachable', onlineFrom({ isConnected: true, isInternetReachable: true }), true);
eq('not connected', onlineFrom({ isConnected: false, isInternetReachable: false }), false);
eq(
  'a captive portal is offline, not a broken service',
  onlineFrom({ isConnected: true, isInternetReachable: false }),
  false,
);
eq(
  'undetermined reachability falls back to connected',
  onlineFrom({ isConnected: true, isInternetReachable: null }),
  true,
);

/* ================================================================== */
/* 6 — the opening object (audit F03)                                   */
/* ================================================================== */

console.log('\n[6] what home opens with');

eq('a beginner opens with the lesson', openingFor({ stage: 'beginner', mode: 'day_trade', hasPriority: true }).kind, 'training');
eq('so does somebody mid-programme', openingFor({ stage: 'developing', mode: 'invest', hasPriority: true }).kind, 'training');
eq('and on a quiet morning too', openingFor({ stage: 'beginner', mode: 'day_trade', hasPriority: false }).kind, 'training');
eq('a trade-ready member opens with the setup', openingFor({ stage: 'trade_ready', mode: 'day_trade', hasPriority: true }).kind, 'priority');
eq('an investor opens with the company', openingFor({ stage: 'trade_ready', mode: 'invest', hasPriority: true }).kind, 'priority');
eq('with nothing to decide, the standing opens', openingFor({ stage: 'trade_ready', mode: 'swing', hasPriority: false }).kind, 'standing');
ok('an unknown stage is treated as a beginner', openingFor({ stage: null, mode: 'day_trade', hasPriority: true }).kind === 'training');
ok(
  'training is drawn once, never twice',
  openingFor({ stage: 'beginner', mode: 'day_trade', hasPriority: true }).trainingInOpening === true
  && openingFor({ stage: 'trade_ready', mode: 'day_trade', hasPriority: true }).trainingInOpening === false,
);

/* the prose the compact opening holds back stays one tap away */
const message = {
  date: '2026-09-08',
  greeting: 'Morning, Kway.',
  state: 'The market is open.',
  lead: 'META is the one worth looking at.',
  evidence: null,
  aside: null,
  question: 'Where do you want to start?',
  directions: [
    { id: 'wd-primary', label: 'Show me META', kind: 'route', route: '/symbol/META' },
    { id: 'wd-trade', label: 'Find me something', kind: 'route', route: '/trade' },
    { id: 'wd-alerts', label: 'Check my alerts', kind: 'route', route: '/alerts' },
  ],
  at: AT,
  degraded: false,
} as const;

const offered = withBriefingOffer({ ...message, directions: [...message.directions] }, true);
ok('the briefing is always reachable from the compact opening', offered.directions.some((d) => d.kind === 'briefing'));
eq('and the offer says what it does', offered.directions.find((d) => d.kind === 'briefing')?.label, 'Read the briefing');
ok('still at most three offers', offered.directions.length <= 3);
ok('the primary action is never the one dropped', offered.directions[0].id === 'wd-primary');
eq(
  'a message with no prose and no report gains nothing',
  withBriefingOffer({ ...message, state: null, evidence: null, aside: null, directions: [] }, false).directions.length,
  0,
);
eq(
  'and an existing briefing offer is not duplicated',
  withBriefingOffer(
    { ...message, directions: [{ id: 'wd-briefing', label: 'The full report', kind: 'briefing' }] },
    true,
  ).directions.length,
  1,
);

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
