/**
 * PROOF FOR THE PER-FEATURE MODEL ROUTING — costs nothing to run.
 *
 * It touches the API three times and every one is free: two capability lookups,
 * which read no tokens, and two deliberately-rejected requests, which are
 * refused before the model runs and bill nothing.
 *
 * Three things are checked, and each of them was a real failure:
 *
 *  1. `effort` is decided by asking the provider, not by matching a name.
 *     Sending `output_config: { effort: 'low' }` to Haiku 4.5 returns a 400 and
 *     kills every reply. The live lookup at the end of this file is the check
 *     that cannot go stale.
 *  2. Every feature routes somewhere, the defaults are the measured ones, and
 *     an environment variable overrides one feature without touching the rest.
 *  3. A chart answer whose JSON wrapper is missing is still read. That is the
 *     failure the user saw as "I came back with nothing that time".
 *
 * Run: npx tsx scripts/model-routing-test.mts
 */
import 'dotenv/config';
import { readChartAnswer } from '../src/lib/kai/stream.ts';
import {
  FEATURE_MODEL_DEFAULTS,
  HAIKU_4_5,
  SONNET_5,
  capabilitySnapshot,
  envVarFor,
  isEffortRejection,
  modelFor,
  modelRouting,
  refreshCapabilities,
  supportsEffort,
} from '../src/lib/kai/models.ts';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/* --- 1. routing ---------------------------------------------------- */

// Measure the code's own defaults, not whatever this shell happens to export.
for (const k of Object.keys(process.env)) if (k.startsWith('KAI_MODEL')) delete process.env[k];

const routing = modelRouting();
console.log('\nDEFAULT ROUTING');
for (const [f, m] of Object.entries(routing)) console.log(`  ${f.padEnd(22)} ${m}`);
console.log('');

// Sonnet, against the original plan — see the measured reason in models.ts.
check('chat defaults to Sonnet 5', routing.chat === SONNET_5, routing.chat);
check('and Haiku is one variable away', (() => {
  process.env[envVarFor('chat')] = HAIKU_4_5;
  const m = modelFor('chat');
  delete process.env[envVarFor('chat')];
  return m === HAIKU_4_5;
})());
for (const f of ['chart_answer', 'chat_object_retry', 'chat_command_recovery'] as const) {
  check(`${f} defaults to Sonnet 5 (it emits JSON)`, routing[f] === SONNET_5, routing[f]);
}
for (const f of ['briefing', 'debrief', 'assist', 'room', 'alert_draft', 'alert_action', 'conversation_title'] as const) {
  check(`${f} defaults to Sonnet 5 (completeOnce sends no tools)`, routing[f] === SONNET_5, routing[f]);
}
check(
  'every feature in the ledger has a model',
  Object.values(FEATURE_MODEL_DEFAULTS).every((m) => typeof m === 'string' && m.length > 0)
);

process.env[envVarFor('chat')] = 'claude-opus-5';
check('KAI_MODEL_CHAT moves one feature', modelFor('chat') === 'claude-opus-5', modelFor('chat'));
check('and leaves the others alone', modelFor('chart_answer') === SONNET_5, modelFor('chart_answer'));
delete process.env[envVarFor('chat')];

process.env.KAI_MODEL = HAIKU_4_5;
check(
  'KAI_MODEL still governs everything, as it always did',
  modelFor('chat') === HAIKU_4_5 && modelFor('briefing') === HAIKU_4_5
);
process.env[envVarFor('briefing')] = SONNET_5;
check('a feature variable beats the global one', modelFor('briefing') === SONNET_5, modelFor('briefing'));
delete process.env.KAI_MODEL;
delete process.env[envVarFor('briefing')];

/* --- 2. the chart answer that lost its wrapper --------------------- */

console.log('');
const contract = readChartAnswer('{ "answer": "Two things hold it back." }');
check('the contract still reads as the contract', contract?.how === 'json' && contract.answer === 'Two things hold it back.');

// The exact Haiku failure: the prose, no wrapper. Measured 5 of 11.
const bare = readChartAnswer(
  'The invalidation is a daily close below the stop. That is the price that proves the idea wrong.'
);
check('prose with no wrapper is read, not binned', bare?.how === 'bare_prose', bare);

const cut = readChartAnswer('{"answer": "This idea is proven wrong if price closes below the');
check('a wrapper cut off mid-sentence is read as far as it goes', cut?.how === 'truncated_json', cut);

const escaped = readChartAnswer('{"answer": "Line one.\\nLine two \\"quoted\\" end."}');
check('escapes survive', escaped?.answer === 'Line one.\nLine two "quoted" end.', escaped?.answer);

check('a mangled object is still dropped', readChartAnswer('{ answr: [1,2,') === null);
check('an empty body is still dropped', readChartAnswer('   ') === null);
check('the wrong key is still dropped', readChartAnswer('{"cues": []}') === null);

/* --- 3. the capability, from the provider -------------------------- */

console.log('');
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('SKIP  provider capability lookup — no ANTHROPIC_API_KEY');
} else {
  const sonnet = await refreshCapabilities(SONNET_5);
  const haiku = await refreshCapabilities(HAIKU_4_5);
  check('provider says Sonnet 5 takes effort', sonnet.effort === true && sonnet.source === 'provider', sonnet);
  check('provider says Haiku 4.5 does NOT', haiku.effort === false && haiku.source === 'provider', haiku);
  check('so the seeded table agrees with the provider', supportsEffort(SONNET_5) && !supportsEffort(HAIKU_4_5));
  console.log('  capabilities:', JSON.stringify(capabilitySnapshot()));

  /**
   * THE LAST LINE OF DEFENCE, AGAINST THE REAL PROVIDER.
   *
   * If the table and the lookup are both somehow wrong, `completeOnce` catches
   * the 400 and retries without `effort`. That only works if the error is
   * recognised, and only helps if an unrelated 400 is NOT mistaken for it.
   * Both are checked here against the live API. Neither call bills a token —
   * they are both rejected before the model runs.
   */
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let effortErr: unknown = null;
  try {
    await raw.messages.create({
      model: HAIKU_4_5,
      max_tokens: 16,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'hi' }],
    });
    console.log('NOTE  the provider now ACCEPTS effort on Haiku 4.5 — re-read this whole file');
  } catch (e) {
    effortErr = e;
  }
  // A 400 for something else entirely — an empty credit balance is the one that
  // actually happens — is not the answer to this question, and pretending it is
  // would be a red light for a problem this file cannot see.
  const msg = effortErr instanceof Error ? effortErr.message : '';
  if (/credit balance|rate.?limit|overloaded/i.test(msg)) {
    console.log(`SKIP  the effort 400 — the account answered with something else: ${msg.slice(0, 110)}`);
    check('and that other 400 is NOT mistaken for an effort rejection', !isEffortRejection(effortErr));
  } else {
    check('the effort 400 is recognised', effortErr !== null && isEffortRejection(effortErr), {
      message: msg.slice(0, 120),
    });
  }

  let otherErr: unknown = null;
  try {
    await raw.messages.create({ model: HAIKU_4_5, max_tokens: 16, messages: [] });
  } catch (e) {
    otherErr = e;
  }
  check('an unrelated 400 is NOT mistaken for it', otherErr !== null && !isEffortRejection(otherErr));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
