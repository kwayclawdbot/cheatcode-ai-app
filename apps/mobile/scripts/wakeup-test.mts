/**
 * The wake-up message, checked as text.
 *
 *   npx tsx scripts/wakeup-test.mts
 *
 * The composer is pure, so the exact words Kai says on each of the three days
 * that matter — an ordinary one, an empty one, and one where the data never
 * arrived — are assertable without a browser. If someone changes the wording,
 * this fails and the new wording has to be looked at on purpose.
 */
import { composeWakeup, degradedWakeup, localDay } from '../src/features/home/wake-message.ts';
import { fixtureHomeV5, fixtureHomeV5Quiet } from '../src/lib/fixtures.ts';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
  else console.log(`  ✓ ${label}`);
};
const truthy = (label: string, got: unknown) => {
  if (got) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label} — got ${JSON.stringify(got)}`); }
};

const MORNING = new Date(2026, 8, 4, 8, 42, 0);

console.log('\n[1] an ordinary day');
const a = composeWakeup({ name: 'Kway', data: fixtureHomeV5, now: MORNING });
eq('greeting', a.greeting, 'Morning, Kway.');
eq('state', a.state, "The market is open. Futures flat · CPI print at 10:00 is the day\u2019s risk.");
eq('lead', a.lead, 'META is the one worth looking at — approaching entry.');
eq('evidence', a.evidence, 'Entry 504 · 0.4% away · Buyers holding 480 · volume 1.6× · risk $58 if wrong');
eq('aside', a.aside, 'NVDA also moved: 1% from invalidation · B−.');
eq('question', a.question, 'Where do you want to start?');
eq('directions', a.directions.map((d) => d.label), ['Show me META', 'What else moved?', 'The full report']);
eq('primary route is the server’s own', a.directions[0], { id: 'wd-primary', kind: 'route', route: '/symbol/META?tab=overview&setup=seed-meta', label: 'Show me META' });
eq('date is the local day', a.date, localDay(MORNING));
eq('not degraded', a.degraded, false);

console.log('\n[2] a day with nothing to report');
const b = composeWakeup({ name: 'Kway', data: fixtureHomeV5Quiet, now: MORNING });
eq('greeting', b.greeting, 'Morning, Kway.');
eq('state', b.state, 'The market is closed.');
eq('lead', b.lead, 'Nothing on your list needs a decision right now.');
eq('evidence', b.evidence, 'I went through your setups, your alerts and your open positions. That is the whole answer — I am not going to manufacture one.');
eq('no aside', b.aside, null);
eq('question', b.question, 'Want to go looking, or leave it be?');
eq('directions', b.directions.map((d) => d.label), ['Find me something', 'Check my alerts']);
truthy('every direction still goes somewhere', b.directions.every((d) => d.kind !== 'route' || d.route.startsWith('/')));

console.log('\n[3] the data never arrived');
const c = degradedWakeup({ name: 'Kway', now: MORNING });
eq('greeting still happens', c.greeting, 'Morning, Kway.');
eq('lead', c.lead, 'I could not pull your morning read just now.');
eq('question', c.question, 'Want me to try again, or go straight to your alerts?');
eq('directions', c.directions.map((d) => d.label), ['Try again', 'Check my alerts']);
eq('degraded', c.degraded, true);
eq('composeWakeup with no data degrades the same way', composeWakeup({ name: 'Kway', data: null, now: MORNING }).lead, c.lead);

console.log('\n[4] the clock and the name');
eq('afternoon', composeWakeup({ name: 'Kway', data: fixtureHomeV5, now: new Date(2026, 8, 4, 14, 0) }).greeting, 'Afternoon, Kway.');
eq('evening', composeWakeup({ name: 'Kway', data: fixtureHomeV5, now: new Date(2026, 8, 4, 19, 0) }).greeting, 'Evening, Kway.');
eq('no name', composeWakeup({ data: fixtureHomeV5, now: MORNING }).greeting, 'Morning.');

console.log('\n[5] no offer is ever empty');
for (const [label, w] of [['ordinary', a], ['quiet', b], ['degraded', c]] as const) {
  truthy(`${label}: at least two directions`, w.directions.length >= 2);
  truthy(`${label}: at most three directions`, w.directions.length <= 3);
  truthy(`${label}: every label is real text`, w.directions.every((d) => d.label.trim().length > 2));
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
