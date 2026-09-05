/**
 * WHAT THE LOST BREAKPOINTS ACTUALLY COST.
 *
 * Caching is a PREFIX match, so a marker that falls under a model's minimum does
 * not lose the cache — the next marker that DOES qualify still covers everything
 * before it. What the lost markers cost is GRANULARITY: when the facts block
 * changes because the scanner published, the earlier markers are what let the
 * unchanged front of the prompt survive.
 *
 * Three calls per model:
 *   1. cold          — nothing cached yet
 *   2. same prompt   — everything should come back from cache
 *   3. facts changed — this is the one that separates the two models
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { SETUP_CAPS, type AppMode } from '@shared/api';
import { assembleContext, renderContext } from '../src/lib/kai/context.ts';
import { buildSystemPrompt } from '../src/lib/kai/system-prompt.ts';
import { KAI_TOOLS, TOOL_PROTOCOL } from '../src/lib/kai/tools.ts';
import { voicePromptBlock, experienceOf } from '../src/lib/kai/voice.ts';
import { SHEET_ACTION_PROTOCOL, loadSheetContext } from '../src/lib/kai/sheet-context.ts';

const OWNER = '080ae0db-5d7d-4c16-a785-3de192ada266';
const MODE: AppMode = 'swing';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const kctx = await assembleContext({ userId: OWNER, mode: MODE, cap: SETUP_CAPS[MODE] });
const experience = experienceOf((kctx.profile.onboarding as Record<string, unknown>)?.experience ?? kctx.profile.experience);
const sheet = await loadSheetContext(OWNER, undefined);
const identity = buildSystemPrompt({
  displayName: kctx.profile.display_name, experience: kctx.profile.experience,
  involvement: kctx.profile.involvement, explanationLevel: kctx.profile.explanation_level, mode: MODE,
});
const protocols = [sheet.prompt_block ? SHEET_ACTION_PROTOCOL : null, voicePromptBlock(experience, []), TOOL_PROTOCOL]
  .filter((s): s is string => Boolean(s)).join('\n\n');
const factsBase = `CONTEXT (facts you may use — nothing outside this is known to you)\n${renderContext(kctx, null, { market: false })}`;
// The scanner published: one setup row differs. Same shape, different bytes.
const factsChanged = factsBase.replace('SLB', 'HAL');

const sys = (facts: string): Anthropic.TextBlockParam[] => [
  { type: 'text', text: identity, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: protocols, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: facts, cache_control: { type: 'ephemeral' } },
];

// WITH TOOLS is the chat route. WITHOUT TOOLS is the briefing job, the chart
// director and the missed-command classifier, which all call `completeOnce`.
for (const withTools of [true, false]) {
for (const model of ['claude-sonnet-5', 'claude-haiku-4-5']) {
  const effort = model.includes('haiku') ? {} : { output_config: { effort: 'low' as const } };
  const one = async (facts: string, label: string) => {
    const r = await client.messages.create({
      model, max_tokens: 24, ...effort, system: sys(facts),
      ...(withTools ? { tools: KAI_TOOLS } : null),
      messages: [{ role: 'user', content: 'Say OK and nothing else.' }],
    });
    const u = r.usage;
    const read = u.cache_read_input_tokens ?? 0, made = u.cache_creation_input_tokens ?? 0, fresh = u.input_tokens ?? 0;
    console.log(`  ${label.padEnd(28)} uncached ${String(fresh).padStart(5)} | from cache ${String(read).padStart(5)} | written ${String(made).padStart(5)} | total ${fresh + read + made}`);
    return { fresh, read, made };
  };
  console.log(`\n=== ${model} ${withTools ? 'WITH the four tools (the chat route)' : 'WITHOUT tools (briefing / director / classifier)'} ===`);
  await one(factsBase, '1. cold');
  await one(factsBase, '2. same prompt again');
  const c = await one(factsChanged, '3. the setups changed');
  const rate = model.includes('haiku') ? 1 : 2;
  const cost = (c.fresh + c.made * 1.25 + c.read * 0.1) * rate / 1e6;
  console.log(`  cost of that third call: $${cost.toFixed(6)}`);
}
}
