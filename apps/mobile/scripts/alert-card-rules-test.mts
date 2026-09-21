/**
 * The alert card's rules, as pure functions (owner audit, 21 September).
 *
 *   1. A card links to Trade by its real alert row or its setup — never by the
 *      card's own "setup:<uuid>" posing as an alert id (the AMD "A setup" that
 *      opened on NOT GRADED).
 *   2. No gold on a card Kai says to leave: sized, and still outside the
 *      member's rules, means the letter is drawn muted with "I'd pass".
 *   3. The headline does not repeat the symbol the identity row already shows.
 */
import { adaptAlertCard } from '../src/lib/adapters.ts';
import { tradeHref, kaiContextFor } from '../src/features/alerts/links.ts';
import { headlineWithoutSymbol, kaiPasses, sideOf } from '../src/features/alerts/card-rules.ts';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}

const SETUP = '3ed7e89c-a90d-5440-840c-c9130009233f';
const wire = (over: Record<string, unknown> = {}) => ({
  id: `setup:${SETUP}`, kind: 'setup', alert_id: null, setup_id: SETUP,
  identity: { symbol: 'AMD', company_name: 'Advanced Micro Devices', mode: 'swing', mode_label: 'Swing', direction: 'long', instrument: 'equity' },
  grade: { display: 'A', score: 96 },
  state: 'entry_reached', state_label: 'Entry reached',
  event: { headline: 'AMD reached $578.75', what_changed: 'x', at_plain: 'Sep 21, 8:33 AM ET' },
  trade_plan: { entry: 578.75, stop: 534.1, targets: [{ price: 712.71 }], rr: 3,
    size: { shares: 1, within_policy: true, plain: '1 share keeps the loss near $44.65 — inside your rules.' } },
  fit: { est_risk_usd: 44.65, fits_cap: true, conflicts: [] },
  primary_action: { label: 'Open Trade Portal' },
  ...over,
});

console.log('\n1 · the link names what the card actually is');
{
  const amd = adaptAlertCard(wire());
  ok('a setup card carries no alert id', amd.alert_id == null, amd.alert_id);
  ok('and does carry its setup', amd.setup_id === SETUP, amd.setup_id);
  ok('so Trade is opened by the setup', tradeHref(amd) === `/trade/AMD?setup=${SETUP}&ctx=alert`, tradeHref(amd));
  ok('and Kai is asked about the setup', kaiContextFor(amd).kind === 'setup' && kaiContextFor(amd).id === SETUP);

  const ALERT = '0b6fc1aa-3c45-45e8-ae7a-cc3e3889bfc2';
  const own = adaptAlertCard(wire({ id: `alert:${ALERT}`, kind: 'alert', alert_id: ALERT, setup_id: null }));
  ok('an alert card links by its alert row', tradeHref(own) === `/trade/AMD?alert=${ALERT}&ctx=alert`, tradeHref(own));
  const older = adaptAlertCard(wire({ id: `alert:${ALERT}`, kind: 'alert', alert_id: undefined, setup_id: undefined }));
  ok('an older wire with only "alert:<uuid>" still yields the alert row', older.alert_id === ALERT, older.alert_id);
  const position = adaptAlertCard(wire({ id: 'position:p1', kind: 'position', alert_id: null, setup_id: null }));
  ok('a card with neither falls back to its own id', tradeHref(position) === '/trade/AMD?alert=position%3Ap1&ctx=alert', tradeHref(position));
}

console.log('\n2 · no gold A on a card Kai says to leave');
{
  const good = adaptAlertCard(wire());
  ok('a plan inside the member\'s rules keeps its gold', kaiPasses(good) === false);
  const p = adaptAlertCard(wire({
    identity: { symbol: 'P', company_name: null, mode_label: 'Swing', direction: 'long' },
    grade: { display: 'A', score: 97 },
    trade_plan: { entry: 105.86, stop: 95.72, targets: [{ price: 112.47 }], rr: 0.65,
      size: { shares: 9, within_policy: false, plain: '9 shares would risk about $91.26, but the reward-to-risk here is 0.65 and your rule is 1.5. I would leave this one.' } },
    fit: { est_risk_usd: 91.26, fits_cap: true, conflicts: ['Reward against risk is 0.65 to 1 and your rule asks for 1.5 to 1.', '9 shares would risk about $91.26 … I would leave this one.'] },
  }));
  ok('the P card (A, 97, reward 0.65 : 1) is a pass', kaiPasses(p) === true);
  ok('and the letter itself is untouched — never a fake grade', p.grade === 'A' && p.score === 97);
  ok('its two sentences arrive separately, to be stacked', p.fit?.conflict_list?.length === 2, p.fit?.conflict_list);
  const tooWide = adaptAlertCard(wire({ trade_plan: { entry: 500, stop: 400, size: { shares: 0, within_policy: false } } }));
  ok('"too wide for your rules today" is a pass too', kaiPasses(tooWide) === true);
  const unsized = adaptAlertCard(wire({ trade_plan: { entry: 308.79, stop: null, size: { shares: null, within_policy: false } } }));
  ok('a plan nobody could size (a Day Trade card, no stop) is NOT a pass', kaiPasses(unsized) === false);
}

console.log('\n3 · the stock first, and said once');
{
  ok('the symbol is not repeated in the headline', headlineWithoutSymbol('AMD reached $578.75', 'AMD') === 'Reached $578.75');
  ok('a dash after the symbol goes with it', headlineWithoutSymbol('NET — every condition is met', 'NET') === 'Every condition is met');
  ok('a longer ticker that starts with the symbol is left alone', headlineWithoutSymbol('PURR reached $14.73', 'P') === 'PURR reached $14.73');
  ok('a headline that is only the symbol stays', headlineWithoutSymbol('AMD', 'AMD') === 'AMD');
  ok('the kind and direction read in words', sideOf(adaptAlertCard(wire())) === 'Swing · Long');
  ok('and a Day Trade card is still called Day Trade',
    sideOf(adaptAlertCard(wire({ identity: { symbol: 'NET', mode_label: 'Day Trade', direction: 'short' } }))) === 'Day Trade · Short');
}

console.log(fail ? `\nalert card rules FAILED (${fail})` : `\nalert card rules OK (${pass})`);
process.exit(fail ? 1 : 0);
