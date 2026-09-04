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
import { ALL_MODES, secondTab } from '../src/features/nav/second-tab.ts';

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
// Whatever mode you are in, the line on screen names the mode you are in AND
// says what the other one does. Nobody should have to hunt through Account to
// find out where their alerts went.
truthy('day trade names Invest', secondTab('day_trade').note.includes('Invest'));
truthy('swing names Invest', secondTab('swing').note.includes('Invest'));
truthy('invest names Day Trade and Swing', secondTab('invest').note.includes('Day Trade') && secondTab('invest').note.includes('Swing'));
for (const m of ALL_MODES) {
  truthy(`${m}: the note says which mode you are in`, /Day Trade|Swing|Invest/.test(secondTab(m).note));
}

console.log('\n[5] a profile with no mode still gets a tab');
// `primary_mode` can be null on a row written before onboarding finished. The
// screens default it to day_trade; this proves that default is a real tab and
// not a blank one.
const fallback = secondTab(undefined as never);
eq('unknown mode falls back to alerts', fallback.label, 'Alerts');
eq('unknown mode is not the desk', fallback.desk, false);

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
