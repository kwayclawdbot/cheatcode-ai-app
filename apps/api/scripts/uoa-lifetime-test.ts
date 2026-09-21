/**
 * A Day Trade card lives until its option expires.
 *
 * The engine widened to 0-7 day expiries on 21 September. A card that dropped
 * off the board at the first closing bell took a contract with days left on it
 * with it — and, the other way round, a card nothing ever flipped out of
 * `ready` sat on the board for twelve days after its option was gone (NET).
 * These pin the instant a card stops being live, in New York time with the
 * clock change honoured, and the copy that must no longer say "today".
 */
import { leadExpiry, nyCloseUtc, setupFromUoaRecord, validUntilFor } from '../src/lib/uoa/ingest.ts';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        ${JSON.stringify({ got, want })}`);
  ok ? (pass += 1) : (fail += 1);
}
function ok(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? (pass += 1) : (fail += 1);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

console.log('\nthe close in New York, as UTC');
eq('summer (EDT): 16:00 ET is 20:00Z', nyCloseUtc('2026-09-25'), '2026-09-25T20:00:00.000Z');
eq('winter (EST): 16:00 ET is 21:00Z', nyCloseUtc('2026-12-18'), '2026-12-18T21:00:00.000Z');
eq('the Friday before the November clock change is still EDT', nyCloseUtc('2026-10-30'), '2026-10-30T20:00:00.000Z');
eq('the Monday after it is EST', nyCloseUtc('2026-11-02'), '2026-11-02T21:00:00.000Z');
eq('a timestamp is read as its date', nyCloseUtc('2026-09-25T13:31:00Z'), '2026-09-25T20:00:00.000Z');

console.log('\nwhich contract leads');
const suggested = { suggested_contract: { suggestion: { base: { option_symbol: 'NVDA260925C00190000', expiry: '2026-09-25' } } } };
const flowOnly = { flow_contract_check: [{ option_symbol: 'NVDA260923C00190000', expiry: '2026-09-23' }] };
eq('the suggested contract leads when the engine named one', leadExpiry({ ...suggested, ...flowOnly }), '2026-09-25');
eq('otherwise the first contract the flow bought', leadExpiry(flowOnly), '2026-09-23');
eq('the fire-time contracts are the last resort',
  leadExpiry({ filters_at_fire: { contracts: [{ expiry: '2026-09-24' }] } }), '2026-09-24');
eq('no dated contract is no expiry', leadExpiry({}), null);

console.log('\nhow long the card lives');
eq('until the lead contract expires, at its close',
  validUntilFor(suggested, '2026-09-21'), '2026-09-25T20:00:00.000Z');
eq('a record with no contract lives to its own session close',
  validUntilFor({}, '2026-09-21'), '2026-09-21T20:00:00.000Z');
eq('an expiry before the fire session never shortens it below that session',
  validUntilFor({ flow_contract_check: [{ expiry: '2026-09-18' }] }, '2026-09-21'), '2026-09-21T20:00:00.000Z');

console.log('\na live multi-day card, end to end');
const today = ymd(new Date());
const expiry = plusDays(5);
const record = {
  schema: 'uw_alerts.live_alert.v3',
  ticker: 'nvda',
  direction: 'bullish',
  session_date: today,
  fired_at_utc: new Date().toISOString(),
  company_name: 'Nvidia',
  mode: 'live',
  filters_at_fire: { total_premium: 1_250_000, ask_side_share: 0.82, max_dte: 7, underlying_price: 181.2 },
  suggested_contract: {
    suggestion: {
      base: {
        option_symbol: 'NVDA260925C00190000', type: 'call', strike: 190, expiry,
        days_to_expiry: 5, bid: 1.1, ask: 1.2,
      },
    },
  },
};
const row = setupFromUoaRecord(record);
eq('it is written ready, not expired, on its first day', row.state, 'ready');
eq('valid_until is the close of the option expiry day', row.valid_until, nyCloseUtc(expiry));
ok('and that is days away, not tonight', Date.parse(row.valid_until) > Date.parse(nyCloseUtc(today)));
eq('the family keeps its name', row.mode, 'day_trade');
ok('the story says which session the flow printed in, not "today"',
  !/\btoday\b/i.test(row.thesis_plain) && /changed hands in Nvidia on [A-Z][a-z]{2} \d{1,2}/.test(row.thesis_plain));
ok('and it states the engine\'s real window', /expire within 7 days/.test(row.thesis_plain));

const replay = setupFromUoaRecord({ ...record, mode: 'replay' });
eq('a rehearsal is still never live, whatever its contract', replay.state, 'expired');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
