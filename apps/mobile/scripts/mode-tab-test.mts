/**
 * What the second tab is, in each mode — checked as text.
 *
 *   npx tsx scripts/mode-tab-test.mts
 *
 * The tab bar, the tab screen and the badge all ask the same function what the
 * second tab is. These are the answers that would be wrong quietly: a tab
 * labelled "Alerts" over a screen of themes, a mode with no answer at all, or a
 * line that tells someone their alerts are gone without telling them how to get
 * back to them.
 */
import {
  ALL_MODES,
  DAY_TRADE_LIVE,
  DEFAULT_MODE,
  modeBadge,
  modeIsLive,
  secondTab,
} from '../src/features/nav/second-tab.ts';

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

console.log('\n[1] every mode gets an answer');
truthy('three modes, no more', ALL_MODES.length === 3);
for (const m of ALL_MODES) {
  const t = secondTab(m);
  truthy(`${m}: has a label`, t.label.trim().length > 2);
  truthy(`${m}: has a title`, t.title.trim().length > 2);
  truthy(`${m}: has a note`, t.note.trim().length > 20);
  // Five labels share the width of a phone. Anything longer than this wraps or
  // gets cut, and a cut word in a tab bar is worse than a shorter one.
  truthy(`${m}: label fits the tab bar (${t.label.length} chars)`, t.label.length <= 9);
}

console.log('\n[2] only Invest shows the desk');
eq('day trade is alerts', secondTab('day_trade').desk, false);
eq('swing is alerts', secondTab('swing').desk, false);
eq('invest is the desk', secondTab('invest').desk, true);
eq('day trade keeps the bell', secondTab('day_trade').icon, 'bell');
eq('swing keeps the bell', secondTab('swing').icon, 'bell');
eq('invest gets the desk glyph', secondTab('invest').icon, 'desk');

console.log('\n[3] the label never lies about the screen');
eq('day trade says Alerts', secondTab('day_trade').label, 'Alerts');
eq('swing says Alerts', secondTab('swing').label, 'Alerts');
eq('invest says Research', secondTab('invest').label, 'Research');
truthy('invest never says Alerts', !secondTab('invest').label.includes('Alert'));
truthy('invest heading is the watchlist', secondTab('invest').title.toLowerCase().includes('watchlist'));

console.log('\n[4] no mode is a one-way door');
// Whatever mode you are in, the line on screen names ANOTHER mode you can move
// to. Nobody should have to hunt through Account to find out where their
// alerts went — and the mode it points at has to be one that is actually live,
// or the exit is a second dead end.
for (const m of ALL_MODES) {
  const note = secondTab(m).note;
  truthy(`${m}: the note says which mode you are in`, /Day Trade|Swing|Invest/.test(note));
  const others = (['day_trade', 'swing', 'invest'] as const)
    .filter((o) => o !== m && modeIsLive(o))
    .map((o) => (o === 'day_trade' ? 'Day Trade' : o === 'swing' ? 'Swing' : 'Invest'));
  truthy(`${m}: the note names a LIVE way out (${others.join('/')})`, others.some((label) => note.includes(label)));
}
truthy('invest points at the mode that has alerts', secondTab('invest').note.includes('Swing'));

console.log('\n[5] a profile with no mode still gets a tab');
// `primary_mode` can be null on a row written before onboarding finished, and
// there is a frame on every cold start before the profile arrives. The screens
// default it to DEFAULT_MODE; this proves that default is a real tab, not a
// blank one — and not the coming-soon one, which would flash "not live yet" at
// somebody purely because their profile was still loading.
const fallback = secondTab(undefined as never);
eq('unknown mode falls back to alerts', fallback.label, 'Alerts');
eq('unknown mode is not the desk', fallback.desk, false);
eq('unknown mode is not the coming-soon screen', fallback.comingSoon, false);
eq('the default mode is live', modeIsLive(DEFAULT_MODE), true);
eq('the default mode is not coming soon', secondTab(DEFAULT_MODE).comingSoon, false);

console.log('\n[6] Day Trade is archived, not deleted');
// The mode still exists and still answers. What changes while DAY_TRADE_LIVE
// is false is that the tab says so instead of drawing an empty alerts board.
truthy('Day Trade is still one of the modes', ALL_MODES.includes('day_trade'));
eq('the flip matches what the tab does', secondTab('day_trade').comingSoon, !DAY_TRADE_LIVE);
eq('Day Trade tracks the flip', modeIsLive('day_trade'), DAY_TRADE_LIVE);
eq('a live mode carries no badge', modeBadge('swing'), null);
eq('invest carries no badge', modeBadge('invest'), null);
if (!DAY_TRADE_LIVE) {
  const dt = secondTab('day_trade');
  eq('the tab bar still says Alerts', dt.label, 'Alerts');
  eq('the tab bar keeps the bell', dt.icon, 'bell');
  eq('the screen heading names the mode', dt.title, 'Day Trade');
  truthy('the badge says coming soon', (modeBadge('day_trade') ?? '').toLowerCase().includes('coming soon'));
  // The copy must not promise a date, and must not call it broken. Both are
  // ways of being wrong that read as reassuring.
  truthy('no invented date in the note', !/\b(20\d\d|Q[1-4]|January|February|March|April|May|June|July|August|September|October|November|December|week|month)\b/i.test(dt.note));
  truthy('does not call itself broken', !/broken|error|failed|unavailable|down\b/i.test(dt.note));
  truthy('does not promise it is nearly ready', !/soon as|any day|shortly|nearly|almost/i.test(dt.note));
  truthy('points at Swing', dt.note.includes('Swing'));
} else {
  eq('flipped live, Day Trade is an ordinary alerts tab', secondTab('day_trade').title, 'Alerts');
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
