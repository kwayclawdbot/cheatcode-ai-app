/**
 * KAI'S OPENING, BRIEF, FOLLOW-UPS AND MONITORING LINE — checked as text.
 *
 *   npx tsx scripts/home-agent-test.mts
 *
 * Redesign V2 ("Kai is an agent"). `features/home/agent.ts` is pure, so the
 * exact words Kai opens with and every rule about what he may promise are
 * assertable without a browser. If the wording changes, this fails and the new
 * wording has to be looked at on purpose.
 */
import {
  KAI_OFFLINE_PLAIN, MAX_FOLLOWUPS, briefRows, chipsThatFit, chartCaption, composeBrief, composeOpening, followUps, mentionedSymbols,
  monitoringLine, rMultiple, resumeToday, statusLine,
} from '../src/features/home/agent.ts';
import { fixtureHomeV5, fixtureHomeV5Quiet } from '../src/lib/fixtures.ts';
import { KAI_OFFLINE_PLAIN as SHARED_OFFLINE } from '../../../packages/shared/api.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (label: string, cond: unknown, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label}${detail === undefined ? '' : `\n      got: ${JSON.stringify(detail)}`}`); }
};
const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

const MORNING = new Date(2026, 8, 21, 9, 14);
const pre = { ...fixtureHomeV5, market: { ...fixtureHomeV5.market, status: 'pre' as const } };
const checksOk = { state: 'needs_you' as const, plain: '', checks: [
  { key: 'setups', label: 'Your setups', ok: true, count: 3 },
  { key: 'positions', label: 'Your positions', ok: true, count: 2 },
] };

console.log('\n[1] the brief is built from the read, most pressing first');
const rows = briefRows(pre);
eq('four rows at most, priority first', rows.map((r) => `${r.kind}:${r.symbol}`), ['setup:META', 'setup:AMD', 'position:NVDA', 'earnings:NVDA']);
eq('the priority row carries its own state words', rows[0].label, 'Approaching entry');
eq('and its chart note as the line under it', rows[0].sub, 'Entry 504 · 0.4% away');
eq('the server\'s short state words are used as written', rows[1].label, 'Resistance nearby');
eq('a report date reads like a person says it', rows[3].label, 'Wed · after close');
eq('and says whether the company confirmed it', rows[3].sub, 'Earnings · date confirmed');
eq('a report opens the earnings panel, not a new screen', rows[3].open, { kind: 'surface', surface: 'earnings', symbol: 'NVDA' });
eq('a setup opens its own page', rows[0].open, { kind: 'route', route: '/symbol/META?tab=overview&setup=seed-meta' });
ok('no row is a macro event — there is no source for one', rows.every((r) => r.symbol && r.symbol !== 'CPI'));

console.log('\n[2] Kai\'s opening, trade-ready');
const opening = composeOpening({ now: MORNING, name: 'Kway Coffie', stage: 'trade_ready', mode: 'swing', data: pre, standing: checksOk, rows });
eq(
  'greeting, what he checked, what he found — nothing else',
  opening,
  'Morning, Kway. I checked your list and your 2 open positions before the bell. META has the cleanest setup, AMD is approaching resistance, and NVDA reports Wednesday after the close.',
);
const blindStanding = { state: 'unverified' as const, plain: 'Your positions could not be read.', checks: [
  { key: 'setups', label: 'Your setups', ok: true, count: 3 },
  { key: 'positions', label: 'Your positions', ok: false, count: null },
] };
const blind = composeOpening({ now: MORNING, name: 'Kway', stage: 'trade_ready', mode: 'swing', data: pre, standing: blindStanding, rows });
ok('a failed read is named, and the picture is called incomplete', blind.includes('I could not read your positions just now, so this is not the whole picture.'), blind);
const quietRows = briefRows(fixtureHomeV5Quiet);
const quiet = composeOpening({
  now: MORNING, name: 'Kway', stage: 'trade_ready', mode: 'swing', data: fixtureHomeV5Quiet,
  standing: { state: 'quiet', plain: '', checks: [{ key: 'setups', label: 'Your setups', ok: true, count: 0 }] }, rows: quietRows,
});
ok('a verified quiet morning is said as a finding', quiet.includes("Nothing needs a decision right now — I'm not going to invent one."), quiet);
const unverifiedQuiet = composeOpening({
  now: MORNING, name: 'Kway', stage: 'trade_ready', mode: 'swing', data: fixtureHomeV5Quiet,
  standing: { state: 'unverified', plain: '', checks: [] }, rows: quietRows,
});
ok('an unverified quiet morning does not promise it is quiet', unverifiedQuiet.includes("can't promise that's the whole list"), unverifiedQuiet);
const nothing = composeOpening({ now: MORNING, name: 'Kway', stage: 'trade_ready', mode: 'swing', data: null, standing: null, rows: [] });
ok('no payload at all still greets, and says nothing is made up', nothing.startsWith('Morning, Kway.') && nothing.includes('Nothing here is made up'), nothing);
const stale = composeOpening({ now: MORNING, name: 'Kway', stage: 'trade_ready', mode: 'swing', data: pre, standing: null, rows, rememberedAt: new Date(2026, 8, 21, 8, 42).toISOString() });
ok('a remembered read says when it was read', stale.includes('This is what I read at 8:42 AM'), stale);

console.log('\n[3] a beginner is never sold a trade');
const beginner = composeOpening({ now: MORNING, name: 'Kway', stage: 'beginner', mode: 'invest', data: pre, standing: checksOk, rows });
ok('no setup language', !/cleanest setup|your move|entry/i.test(beginner), beginner);
ok('says nothing asks them to trade', beginner.includes('Nothing here asks you to trade.'), beginner);
ok('offers to explain, and points at the lesson', beginner.includes("I'll explain what it means in plain words") && beginner.includes('next lesson'), beginner);
const bChips = followUps({ setups: [{ symbol: 'META', entry: '> 504' }], comparison: null, brief: null, mentioned: [], hasAction: false }, { stage: 'beginner', kaiAvailable: true, others: ['AMD'] });
ok('no "Set alert" or "Compare" chip for a beginner', !bChips.some((c) => /alert|compare/.test(c.id)), bChips.map((c) => c.id));
ok('they get "Explain it simply" instead', bChips.some((c) => c.label === 'Explain it simply'));

console.log('\n[4] follow-ups come from the response, never from a list');
const setupChips = followUps({ setups: [{ symbol: 'META', entry: '> 504' }], comparison: null, brief: null, mentioned: [], hasAction: false }, { stage: 'trade_ready', kaiAvailable: true, others: ['META', 'AMD'] });
eq('a setup gets thesis, compare-with-the-next-name and alert', setupChips.map((c) => c.label), ['Explain the thesis', 'Compare AMD', 'Set alert']);
eq('each chip sends a task that names the ticker', setupChips.map((c) => c.task), ['Explain the thesis on META.', 'Compare META with AMD.', 'Set an alert on META at the entry, > 504.']);
eq('a response about nothing gets no chips', followUps({ setups: [], comparison: null, brief: null, mentioned: [], hasAction: false }, { stage: 'trade_ready', kaiAvailable: true, others: ['AMD'] }), []);
eq('a response that already proposes an action gets none', followUps({ setups: [{ symbol: 'META' }], comparison: null, brief: null, mentioned: [], hasAction: true }, { stage: 'trade_ready', kaiAvailable: true, others: [] }), []);
const offChips = followUps({ setups: [{ symbol: 'META' }], comparison: null, brief: null, mentioned: [], hasAction: false }, { stage: 'trade_ready', kaiAvailable: false, others: ['AMD'] });
ok('with Kai offline, only chips that need no answer remain', offChips.every((c) => c.kind === 'open'), offChips);
const brief = composeBrief({ ...pre, standing: null }, MORNING)!;
const briefChips = followUps({ setups: [], comparison: null, brief, mentioned: [], hasAction: false }, { stage: 'trade_ready', kaiAvailable: true, others: [] });
eq('the brief offers where to start, the top name and the report', briefChips.map((c) => c.label), ['What should I watch first?', 'Walk me through META', 'NVDA earnings']);
eq('only tickers the app already holds count as mentioned', mentionedSymbols('I like META and AI; AMD at $180 too. SPY?', ['META', 'AMD', 'NVDA']), ['META', 'AMD']);

console.log('\n[5] "Kai will update you" only with a real alert behind it');
eq('an armed alert on the ticker is repeated as a promise', monitoringLine(['META'], pre.agent), 'Kai will update you when META breaks 504 on volume.');
eq('no alert on the ticker, no line', monitoringLine(['AMD'], pre.agent), null);
eq('no agent block, no line', monitoringLine(['META'], null), null);
eq(
  'words that are not a condition are quoted, not rephrased',
  monitoringLine(['PURR'], { ...pre.agent!, monitoring: [{ id: 'x', symbol: 'PURR', plain: 'PURR breakout watch', clause: null }] }),
  'Kai is watching: “PURR breakout watch”.',
);

console.log('\n[6] the status line');
eq('positions when there are any', statusLine({ kaiAvailable: true, online: true, positionsOpen: 8, market: pre.market }), { text: 'Monitoring 8 positions', live: true });
eq('the session when there are none', statusLine({ kaiAvailable: true, online: true, positionsOpen: 0, market: { ...pre.market, status: 'open' } }), { text: 'Market open', live: true });
eq('offline wins, with no live dot', statusLine({ kaiAvailable: false, online: true, positionsOpen: 8, market: pre.market }), { text: 'Kai offline', live: false });
eq('no network wins over everything', statusLine({ kaiAvailable: true, online: false, positionsOpen: 8, market: pre.market }).text, 'No connection');

console.log('\n[7] small rules');
eq('R from level strings', rMultiple('> 504', '< 460', '540'), 0.8);
eq('R from the board\'s numbers', rMultiple(24.4, 22.37, 30.49), 3);
eq('no R when a level is missing', rMultiple('> 504', null, '540'), null);
eq('no R when the target is on the stop side', rMultiple(100, 95, 90), null);
eq('today continues a conversation from today', resumeToday({ id: 'c1', last_message_at: new Date(2026, 8, 21, 8, 1).toISOString() }, MORNING), 'c1');
eq('but not yesterday\'s', resumeToday({ id: 'c1', last_message_at: new Date(2026, 8, 20, 22, 0).toISOString() }, MORNING), null);
eq('the offline sentence is the server\'s sentence', KAI_OFFLINE_PLAIN, SHARED_OFFLINE);
eq('the chart caption is Kai\'s latest line while he writes', chartCaption([
  { kind: 'user_text', id: 'u', text: 'show me nvda' },
  { kind: 'kai_text', id: 'k', text: "Here is Nvidia on the daily. That line is yesterday's high, and it held twice.▍", streaming: true },
], true), "That line is yesterday's high, and it held twice.");
eq('and nothing once he has finished', chartCaption([{ kind: 'kai_text', id: 'k', text: 'Done.' }], false), null);

console.log('\n[8] the war room is gone from Home');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const home = readFileSync(path.resolve(HERE, '../src/app/(tabs)/home.tsx'), 'utf8');
ok('no brain, no HUD frame, no status light', !/KaiBrain|HudFrame|KaiStatusLight|warroom/.test(home));
ok('the composer says it takes tasks', readFileSync(path.resolve(HERE, '../src/features/home/KaiComposer.tsx'), 'utf8').includes('Ask Kai or give Kai a task…'));
ok('the mic is drawn in Kai\'s violet', /tone="kai"/.test(home));

console.log('\n[9] follow-up chips never take more than two rows');
eq('three short chips share one row', chipsThatFit([100, 90, 80], 350), 3);
eq('three chips over two rows all show', chipsThatFit([200, 140, 250], 350), 3);
eq('a chip that would start a third row is dropped', chipsThatFit([300, 300, 300], 350), 2);
eq('a first chip wider than the row still shows', chipsThatFit([500, 300], 350), 2);
eq('never more than three, however narrow they are', chipsThatFit([40, 40, 40, 40], 350), 3);
eq('before measuring, every chip up to the cap is allowed', chipsThatFit([0, 0, 0, 0], 0), 3);
eq('the cap is three', MAX_FOLLOWUPS, 3);

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
