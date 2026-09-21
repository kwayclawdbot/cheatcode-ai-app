/**
 * THE SHOW WORKER ONLY SENDS `effort` TO A MODEL THAT TAKES IT.
 *
 *   cd workers/kai-live && npx tsx scripts/effort-test.ts
 *
 * Haiku 4.5 answers `output_config: { effort }` with a 400. The worker sent it
 * on every call, so pointing KAI_MODEL at Haiku killed the show. This checks
 * the request body for both models the product routes to, and that a model
 * nobody has asked about gets the cautious answer. No network: the lookup's
 * fetch is stubbed.
 */
import { effortFor } from '../src/analyze.ts';
import { createCapabilityLookup, isEffortRejection } from '../../../packages/shared/model-capabilities.ts';

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

const sonnet = effortFor('claude-sonnet-5');
check('Sonnet 5 is sent effort: low', sonnet.output_config?.effort === 'low', sonnet);
const haiku = effortFor('claude-haiku-4-5');
check('Haiku 4.5 is sent NO effort field at all', !('output_config' in haiku), haiku);

// A model the seed does not know: cautious until the provider answers, then
// whatever the provider said.
const calls: string[] = [];
const lookup = createCapabilityLookup({
  apiKey: () => 'test-key',
  log: () => {},
  fetchImpl: (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ capabilities: { effort: { supported: true } } }), { status: 200 });
  }) as unknown as typeof fetch,
});
check('an unknown model is NOT sent effort before the provider answers', lookup.supportsEffort('claude-new-9') === false);
const answered = await lookup.refreshCapabilities('claude-new-9');
check('the provider is asked about it', calls.some((u) => u.endsWith('/v1/models/claude-new-9')), calls);
check('and its answer replaces the guess', answered.source === 'provider' && lookup.supportsEffort('claude-new-9'));

// The last line: a 400 naming effort is recognised, and sticks.
const rejection = Object.assign(new Error('400 This model does not support the effort parameter'), { status: 400 });
const credit = Object.assign(new Error('400 Your credit balance is too low'), { status: 400 });
check('an effort 400 is recognised', isEffortRejection(rejection));
check('a credit 400 is NOT mistaken for one', !isEffortRejection(credit));
lookup.noteEffortRejected('claude-sonnet-5');
check('after a rejection the model is never sent effort again', lookup.supportsEffort('claude-sonnet-5') === false);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
