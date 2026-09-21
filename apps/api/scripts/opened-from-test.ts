/**
 * Opening Trade from a card finds THAT card — by the card's own id.
 *
 * The AMD "A setup" on the board opened Trade on "NOT GRADED" because its card
 * id, `setup:<uuid>`, was looked up as a row in `alerts`. These assertions pin
 * the three names a link can carry and which of them may reach a column that
 * references `alerts` (only a real alert uuid).
 */
import { findOpenedCard, openedFrom } from '../src/lib/round4/opened-from.ts';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        ${JSON.stringify({ got, want })}`);
  ok ? (pass += 1) : (fail += 1);
}

const SETUP = '3ed7e89c-a90d-5440-840c-c9130009233f';
const ALERT = '0b6fc1aa-3c45-45e8-ae7a-cc3e3889bfc2';

console.log('\nreading the link');
eq('a setup card id is a setup, never an alert row',
  openedFrom({ alert: `setup:${SETUP}` }),
  { cardId: `setup:${SETUP}`, alertId: null, setupId: SETUP });
eq('an alert card id is an alert row',
  openedFrom({ alert: `alert:${ALERT}` }),
  { cardId: `alert:${ALERT}`, alertId: ALERT, setupId: null });
eq('a bare uuid keeps its old meaning: an alert row',
  openedFrom({ alert: ALERT }),
  { cardId: `alert:${ALERT}`, alertId: ALERT, setupId: null });
eq('?setup= alone names the setup and no card',
  openedFrom({ setup: SETUP }),
  { cardId: null, alertId: null, setupId: SETUP });
eq('an explicit ?setup= beats the one inside the card id',
  openedFrom({ alert: `setup:${ALERT}`, setup: SETUP }).setupId, SETUP);
eq('garbage names nothing, and never reaches a uuid column',
  openedFrom({ alert: 'setup:not-a-uuid', setup: 'x' }),
  { cardId: null, alertId: null, setupId: null });
eq('nothing is nothing', openedFrom({}), { cardId: null, alertId: null, setupId: null });
eq('case is normalised so the card id matches the board',
  openedFrom({ alert: `SETUP:${SETUP.toUpperCase()}` }).cardId, `setup:${SETUP}`);

console.log('\nfinding the card');
const cards = [
  { id: `setup:${SETUP}`, alert_id: null, setup_id: SETUP, sym: 'AMD' },
  { id: `alert:${ALERT}`, alert_id: ALERT, setup_id: null, sym: 'AAPL' },
  { id: 'setup:11111111-1111-4111-8111-111111111111', alert_id: null, setup_id: '11111111-1111-4111-8111-111111111111', sym: 'AMD' },
];
eq('the AMD setup card is found by its own id',
  findOpenedCard(cards, openedFrom({ alert: `setup:${SETUP}` }))?.id, `setup:${SETUP}`);
eq('an alert card is found by its alert row',
  findOpenedCard(cards, openedFrom({ alert: ALERT }))?.id, `alert:${ALERT}`);
eq('?setup= finds the card built from that setup',
  findOpenedCard(cards, openedFrom({ setup: SETUP }))?.id, `setup:${SETUP}`);
eq('a link that names nothing finds nothing (the symbol fallback is the caller\'s)',
  findOpenedCard(cards, openedFrom({})), null);
eq('a link to a card that is gone finds nothing',
  findOpenedCard(cards, openedFrom({ alert: 'setup:22222222-2222-4222-8222-222222222222' })), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
