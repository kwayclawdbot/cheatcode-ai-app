/**
 * AN UNGRADED SYMBOL NEVER RENDERS A PRICE IN AN ENTRY SLOT.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. `/api/v1/symbols/:symbol` used to compute its
 * suggestion as `entry ?? quote.price`. On a symbol with no graded setup that
 * is the LAST TRADED PRICE with the word "Entry" over it, and it was going
 * straight into the Entry tile on the plan screen and on the symbol screen's
 * plan tab. Beside a stop of "—" it is indistinguishable from a level the
 * grading engine produced.
 *
 * The route has been fixed. This test does NOT trust that: every case here
 * feeds the OLD, LYING payload — entry present, stop null, entry exactly equal
 * to the quote — through the real client code and checks that the price does
 * not reach a tile. A phone can be pointed at an API that has not been
 * redeployed, and a rule that only holds when the server behaves is not a rule.
 *
 * The two paths a suggestion can take to a screen are both covered:
 *
 *   · `/plan/new`  → tradeApi.suggestedPlan → suggestedLevels → PlanView
 *   · `/symbol/:s` → adaptWorkspace          → PlanTab
 *
 * And the thing that must NOT happen in the other direction: a price the USER
 * typed is a decision, and blanking it would be its own dishonesty.
 */
import {
  entrySlot, planStanding, suggestedLevels,
  NO_SETUP_PLAIN, NO_STOP_PLAIN, NO_STOP_SUGGESTED,
} from '../src/features/orders/plan-read';
import { adaptWorkspace } from '../src/lib/v5';
import type { Plan } from '../src/features/orders/types';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/** The price the old route smuggled through. Nothing may print it. */
const LAST_TRADED = 178.42;

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: null, symbol: 'NVDA', name: 'NVIDIA Corporation', side: 'long',
  entry: null, stop: null, targets: [],
  size_shares: null, size_notional: null, size_plain: null, rr: null,
  if_target: null, if_stopped: null, daily_cap: { cap: null, used: null },
  exit_style: 'auto', status: 'draft', quote: null, setup_id: null,
  order_state: null, no_plan_plain: null, ...over,
});

/* ── 1. the suggestion, filtered ─────────────────────────────────── */
console.log('\nthe server offers the last traded price as an entry');
{
  // Exactly what the old route sent for a symbol with no graded setup.
  const got = suggestedLevels({
    symbol: 'NVDA', entry: LAST_TRADED, stop: null, targets: [], noPlanPlain: null,
  });

  ok('the entry is dropped', got.entry === null, got.entry);
  ok('and it is not the last traded price under another name', got.entry !== LAST_TRADED);
  ok('the stop stays empty too', got.stop === null);
  ok('a target with nothing to measure it from goes with them', got.targets.length === 0);
  ok('and the reason is stated, not implied', (got.noPlanPlain ?? '').length > 40, got.noPlanPlain);
  // The client cannot tell a graded entry from the smuggled quote — the
  // payload is identical — so the sentence must not vouch for either. What it
  // can say for certain is that a price on its own is not an entry.
  ok('the reason says a price on its own is not an entry',
    (got.noPlanPlain ?? '').includes('not an entry'), got.noPlanPlain);
  ok('and it never claims the number was a real entry',
    !(got.noPlanPlain ?? '').includes('There is an entry'), got.noPlanPlain);
  ok('no price appears anywhere in the reason',
    !String(got.noPlanPlain).includes(String(LAST_TRADED)), got.noPlanPlain);
}

console.log('\na graded setup with an entry and no stop is still not a plan');
{
  const got = suggestedLevels({
    symbol: 'NVDA', entry: 182.5, stop: null, targets: [201], noPlanPlain: null,
  });
  // Half a plan on a screen is read as a plan, so the entry goes with the stop.
  ok('the entry goes too, rather than standing alone', got.entry === null, got.entry);
  ok('the target goes with it', got.targets.length === 0);
  ok('and the reason is about the missing invalidation',
    got.noPlanPlain === NO_STOP_SUGGESTED('NVDA'), got.noPlanPlain);
}

console.log('\na real plan is left completely alone');
{
  const got = suggestedLevels({
    symbol: 'META', entry: 504.6, stop: 486.2, targets: [548.1], noPlanPlain: null,
  });
  ok('the entry survives', got.entry === 504.6);
  ok('the stop survives', got.stop === 486.2);
  ok('the target survives', JSON.stringify(got.targets) === '[548.1]');
  ok('and nothing is explained away', got.noPlanPlain === null);
}

console.log('\nthe server’s own words are preferred when it sends them');
{
  const said = 'I have no graded setup on NVDA, so I have no entry and no stop to give you.';
  const got = suggestedLevels({
    symbol: 'NVDA', entry: LAST_TRADED, stop: null, targets: [], noPlanPlain: said,
  });
  ok('the route’s sentence is used as written', got.noPlanPlain === said, got.noPlanPlain);
  ok('and the entry is still refused', got.entry === null);
}

/* ── 2. the tile itself ──────────────────────────────────────────── */
console.log('\nwhat actually reaches the Entry tile');
{
  const p = plan({ entry: null, stop: null });
  ok('an ungraded symbol shows a dash, not a number', entrySlot(p) === '—', entrySlot(p));
  ok('and the dash is not a formatted price', !/\d/.test(entrySlot(p)), entrySlot(p));

  // The whole point, stated as bluntly as it can be.
  const lying = plan({ entry: LAST_TRADED, stop: null });
  const filtered = suggestedLevels({
    symbol: lying.symbol, entry: lying.entry, stop: lying.stop, targets: [], noPlanPlain: null,
  });
  const rendered = entrySlot({ entry: filtered.entry });
  ok('the last traded price never reaches the tile',
    !rendered.includes('178'), rendered);

  const real = plan({ entry: 504.6, stop: 486.2 });
  ok('a real entry still prints', entrySlot(real) === '504.6', entrySlot(real));
}

/* ── 3. where the plan stands, and what the screen says ──────────── */
console.log('\nthe screen says why, in words');
{
  const none = planStanding(plan());
  ok('no entry and no stop is not a plan', none.hasPlan === false);
  ok('and the reason is the no-setup one', none.blockedPlain === NO_SETUP_PLAIN('NVDA'), none.blockedPlain);

  const half = planStanding(plan({ entry: 182.5 }));
  ok('an entry with no stop is not a plan either', half.hasPlan === false);
  ok('and says the invalidation is what is missing',
    half.blockedPlain === NO_STOP_PLAIN('NVDA'), half.blockedPlain);

  const whole = planStanding(plan({ entry: 504.6, stop: 486.2 }));
  ok('an entry and a stop is a plan', whole.hasPlan === true);
  ok('and there is nothing to explain', whole.blockedPlain === null);

  // A price the user typed is a decision. It must never be hidden from them.
  const typed = plan({ entry: 191.0, stop: null });
  ok('a number the user typed is still shown', entrySlot(typed) === '191');
  ok('while the screen still says what is missing',
    planStanding(typed).blockedPlain === NO_STOP_PLAIN('NVDA'));

  /*
   * The stale-sentence bug, caught by tapping through the running screen.
   *
   * The server's "I have no entry and no stop to give you" is true on arrival
   * and false the moment the user types an entry. It described the load, not
   * the screen. So it is only used while nothing has been filled in.
   */
  const served = 'I have no graded setup on NVDA, so I have no entry and no stop to give you.';
  const untouched = planStanding(plan({ no_plan_plain: served }));
  ok('on arrival the server’s own words are used', untouched.blockedPlain === served);

  const edited = planStanding(plan({ entry: 191.0, no_plan_plain: served }));
  ok('after the user types an entry the stale sentence is dropped',
    edited.blockedPlain !== served, edited.blockedPlain);
  ok('and the screen stops claiming there is no entry',
    !(edited.blockedPlain ?? '').includes('no entry'), edited.blockedPlain);
  ok('it asks for the stop instead',
    edited.blockedPlain === NO_STOP_PLAIN('NVDA'), edited.blockedPlain);

  const stopOnly = planStanding(plan({ stop: 182, no_plan_plain: served }));
  ok('a stop with no entry says so', stopOnly.blockedPlain?.includes('no entry'), stopOnly.blockedPlain);

  const finished = planStanding(plan({ entry: 191, stop: 182, no_plan_plain: served }));
  ok('and once both are set nothing is explained away at all',
    finished.hasPlan === true && finished.blockedPlain === null, finished);
}

/* ── 4. the symbol screen's plan tab, through the real adapter ───── */
console.log('\nthe symbol screen, driven by the old lying payload');
{
  const workspace = adaptWorkspace({
    symbol: 'NVDA',
    identity: { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    quote: { symbol: 'NVDA', price: LAST_TRADED, change: -1.2, change_pct: -0.7 },
    overview: {
      setup_module: null,
      // `key_levels` labels the quote "Last" — an honest label the tiles must
      // still not promote into an entry.
      key_levels: [{ label: 'Last', price: LAST_TRADED, semantic: 'note' }],
    },
    plan: {
      existing_plan: null,
      suggested: {
        entry: LAST_TRADED,          // <- the lie
        stop: null,
        targets: [],
        size: { shares: null, notional: null, plain: 'no size' },
        rr: null,
        scenarios: [],
      },
      daily_risk: { cap: 500, used: 0 },
    },
  }, 'NVDA');

  const s = workspace.plan.suggested;
  ok('the plan tab is handed no entry', s?.entry == null, s?.entry);
  ok('and it is definitely not the quote', s?.entry !== LAST_TRADED);
  ok('no stop either', s?.stop == null);
  ok('and it carries the reason to print', Boolean(s?.no_plan_plain), s?.no_plan_plain);
  ok('the "Last" key level is not promoted into an entry',
    JSON.stringify(s ?? {}).indexOf('178.42') === -1, s);

  // And the case that must keep working.
  const good = adaptWorkspace({
    symbol: 'META',
    quote: { symbol: 'META', price: 504.62 },
    plan: { suggested: { entry: 504.6, stop: 486.2, targets: [548.1], scenarios: [] } },
  }, 'META');
  ok('a graded symbol still shows its entry', good.plan.suggested?.entry === 504.6, good.plan.suggested);
  ok('and its stop', good.plan.suggested?.stop === 486.2);
  ok('with nothing to explain away', good.plan.suggested?.no_plan_plain == null);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
