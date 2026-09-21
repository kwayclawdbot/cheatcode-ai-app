/**
 * THE CREDIT GATE FAILS OPEN — AND NOW IT IS SEEN DOING IT. Plus the loop guard.
 *
 *   cd apps/api && npx tsx scripts/credit-gate-test.mts
 *
 * The database is pointed at a port nothing listens on, so every read fails
 * the way an outage does. No network leaves the machine.
 *
 *  1. The member still gets through with a full day's credits (unchanged).
 *  2. Every fail-open writes one loud structured line with the event, route
 *     and user id, and bumps the counter `/api/v1/health` shows.
 *  3. The counter only counts the last hour.
 *  4. The loop guard lets 12 questions a minute through and refuses the 13th
 *     with a plain sentence, per person, and lets them back in a minute later.
 */
process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-not-a-key';

const { creditState, failOpenLastHour, recordFailOpen, resetFailOpenCounter } = await import(
  '../src/lib/kai/credits.ts'
);
const { PLANS } = await import('../src/lib/kai/plans.ts');
const { allowKaiQuestion, resetRateGuard, KAI_QUESTIONS_PER_MINUTE, SLOW_DOWN_PLAIN } = await import(
  '../src/lib/kai/rate-guard.ts'
);

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/* --- 1 + 2. fail open, loudly -------------------------------------- */

const lines: string[] = [];
const realError = console.error;
const realWarn = console.warn;
console.error = (...a: unknown[]) => lines.push(a.map(String).join(' '));
console.warn = () => {};
resetFailOpenCounter();
const USER = '00000000-0000-4000-8000-000000000001';
const state = await creditState(USER, 'req-test', 'kai.messages');
console.error = realError;
console.warn = realWarn;

check('the database is down and the question is still allowed', state.verdict === 'allow', state.verdict);
check('with a full day of credits', state.available === PLANS[state.plan.key].daily_credits, state.available);
check('and it is marked degraded, so it is never billed afterwards', state.degraded === true);

const failLine = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .find((j) => j && j.event === 'credit_gate.fail_open');
check('one structured line named credit_gate.fail_open', Boolean(failLine), lines.slice(0, 3));
check('carrying the route', failLine?.route === 'kai.messages', failLine);
check('carrying the user id', failLine?.user_id === USER, failLine);
check('at error level, with a metric name', failLine?.level === 'error' && failLine?.metric === 'credit_gate_fail_open');
check('the health counter reads 1', failOpenLastHour() === 1, failOpenLastHour());

/* --- 3. the last hour only ----------------------------------------- */

resetFailOpenCounter();
console.error = () => {};
const t0 = 10_000_000;
recordFailOpen({ route: 'me', userId: 'a', reason: 'x', plan: 'free' }, '-', t0);
recordFailOpen({ route: 'me', userId: 'b', reason: 'x', plan: 'free' }, '-', t0 + 30 * 60_000);
recordFailOpen({ route: 'me', userId: 'c', reason: 'x', plan: 'free' }, '-', t0 + 50 * 60_000);
console.error = realError;
check('three in the hour read 3', failOpenLastHour(t0 + 55 * 60_000) === 3);
check('the first drops out after an hour', failOpenLastHour(t0 + 61 * 60_000) === 2);
check('and all of them two hours later', failOpenLastHour(t0 + 120 * 60_000) === 0);
resetFailOpenCounter();

/* --- 4. the loop guard ---------------------------------------------- */

resetRateGuard();
const now = 50_000_000;
let allowed = 0;
for (let i = 0; i < KAI_QUESTIONS_PER_MINUTE; i += 1) if (allowKaiQuestion('loop', now + i * 1000).allowed) allowed += 1;
check(`${KAI_QUESTIONS_PER_MINUTE} questions in a minute all go through`, allowed === KAI_QUESTIONS_PER_MINUTE, allowed);
const thirteenth = allowKaiQuestion('loop', now + 12_000);
check('the 13th is refused', thirteenth.allowed === false);
check('with a wait that ends when the oldest one is a minute old', thirteenth.retryAfterSec === 48, thirteenth);
check('someone else is not affected', allowKaiQuestion('other', now + 12_000).allowed);
check('a minute after the first, one more is allowed', allowKaiQuestion('loop', now + 60_000).allowed);
check('the refusal is a plain sentence', /faster than Kai can answer/.test(SLOW_DOWN_PLAIN) && !/429|rate/i.test(SLOW_DOWN_PLAIN));
check('the route uses it before the credit read', (await import('node:fs')).readFileSync(
  new URL('../src/app/api/v1/kai/conversations/[id]/messages/route.ts', import.meta.url), 'utf8'
).search(/allowKaiQuestion\(user\.id\)[\s\S]*creditState\(user\.id, requestId, 'kai\.messages'\)/) > 0);
resetRateGuard();

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
