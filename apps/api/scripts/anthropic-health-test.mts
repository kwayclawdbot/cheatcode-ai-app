/**
 * THE HEALTH CHECK SEES AN EMPTY CREDIT BALANCE.
 *
 *   cd apps/api && npx tsx scripts/anthropic-health-test.mts
 *
 * Every provider answer is stubbed — no network, no key, no spend. Each of the
 * five states is driven from the response the provider really gives, the
 * health route's `ok` is checked for the two states that must turn it false,
 * and the cache is checked so polling does not pay for a call every time.
 */
import {
  anthropicHealth,
  classify,
  probeAnthropic,
  resetAnthropicHealthCache,
  FAIL_TTL_MS,
  OK_TTL_MS,
  PROBE_MODEL,
} from '../src/lib/kai/anthropic-health.ts';
import { HealthResponse } from '../../../packages/shared/api.ts';

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

const err = (type: string, message: string) => JSON.stringify({ type: 'error', error: { type, message } });
const reply = (status: number, body: string) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

const CASES: Array<{ name: string; fetchImpl: typeof fetch; want: string; healthy: boolean }> = [
  {
    name: 'a real one-token reply',
    fetchImpl: reply(200, JSON.stringify({ content: [{ type: 'text', text: 'p' }], usage: { output_tokens: 1 } })),
    want: 'ok',
    healthy: true,
  },
  {
    name: '401 authentication_error',
    fetchImpl: reply(401, err('authentication_error', 'invalid x-api-key')),
    want: 'invalid_key',
    healthy: false,
  },
  {
    name: '400 credit balance too low (the September outage, verbatim)',
    fetchImpl: reply(
      400,
      err(
        'invalid_request_error',
        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
      )
    ),
    want: 'no_credit',
    healthy: false,
  },
  { name: '429 rate_limit_error', fetchImpl: reply(429, err('rate_limit_error', 'rate limited')), want: 'rate_limited', healthy: true },
  { name: '529 overloaded_error', fetchImpl: reply(529, err('overloaded_error', 'Overloaded')), want: 'rate_limited', healthy: true },
  { name: '500 api_error', fetchImpl: reply(500, err('api_error', 'boom')), want: 'unreachable', healthy: true },
  {
    name: 'the network throws',
    fetchImpl: (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch,
    want: 'unreachable',
    healthy: true,
  },
];

for (const c of CASES) {
  const h = await probeAnthropic({ key: 'sk-test', fetchImpl: c.fetchImpl });
  check(`${c.name} → ${c.want}`, h.status === c.want && h.healthy === c.healthy, h);
  check(`  and says so in a plain sentence`, h.message.length > 20 && !/undefined|null/.test(h.message), h.message);
  // What the route would answer, with the database fine.
  const body = HealthResponse.parse({
    ok: true && h.healthy,
    supabase: true,
    anthropic: h.healthy,
    anthropic_status: h.status,
    anthropic_message: h.message,
    anthropic_checked_at: h.checked_at,
  });
  if (c.want === 'no_credit' || c.want === 'invalid_key') check(`  and overall ok is FALSE`, body.ok === false);
}

check('no key at all is invalid_key', (await probeAnthropic({ key: undefined })).status === 'invalid_key');
check('an unrelated 400 is not called no_credit', classify(400, err('invalid_request_error', 'max_tokens: bad')) === 'unreachable');

// The probe is a real, minimal model call on the cheap model.
let sent = null as { url: string; body: Record<string, unknown> } | null;
await probeAnthropic({
  key: 'sk-test',
  fetchImpl: (async (url: string, init: RequestInit) => {
    sent = { url: String(url), body: JSON.parse(String(init.body)) };
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch,
});
check('it is a real message call', sent?.url === 'https://api.anthropic.com/v1/messages', sent);
check(`on ${PROBE_MODEL} with max_tokens 1`, sent?.body.model === PROBE_MODEL && sent?.body.max_tokens === 1, sent?.body);

// THE CACHE. Polling must not spend.
let calls = 0;
let clock = 1_000_000;
const counting = (status: number, body: string) =>
  (async () => {
    calls += 1;
    return new Response(body, { status });
  }) as unknown as typeof fetch;
resetAnthropicHealthCache();
const okFetch = counting(200, '{}');
await anthropicHealth({ key: 'k', fetchImpl: okFetch, now: () => clock });
for (let i = 0; i < 20; i += 1) {
  clock += 10_000;
  if (clock - 1_000_000 >= OK_TTL_MS) break;
  await anthropicHealth({ key: 'k', fetchImpl: okFetch, now: () => clock });
}
check('twenty polls inside five minutes make ONE model call', calls === 1, { calls });
const cachedAnswer = await anthropicHealth({ key: 'k', fetchImpl: okFetch, now: () => clock });
check('and the answer says it came from the cache', cachedAnswer.cached === true);
clock = 1_000_000 + OK_TTL_MS + 1;
await anthropicHealth({ key: 'k', fetchImpl: okFetch, now: () => clock });
check('after five minutes it asks again', calls === 2, { calls });

calls = 0;
resetAnthropicHealthCache();
const creditFetch = counting(400, err('invalid_request_error', 'Your credit balance is too low'));
await Promise.all([1, 2, 3].map(() => anthropicHealth({ key: 'k', fetchImpl: creditFetch, now: () => clock })));
check('three monitors at once on a cold cache make one call', calls === 1, { calls });
clock += FAIL_TTL_MS + 1;
await anthropicHealth({ key: 'k', fetchImpl: creditFetch, now: () => clock });
check('a failed answer is re-checked after a minute, so a top-up shows quickly', calls === 2, { calls });
resetAnthropicHealthCache();

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
