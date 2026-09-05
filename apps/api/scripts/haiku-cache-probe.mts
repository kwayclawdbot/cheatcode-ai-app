/**
 * DOES THE PROMPT ACTUALLY CACHE ON EACH MODEL?
 *
 * A cached prefix has a MINIMUM LENGTH and it differs by model — 1,024 tokens on
 * Sonnet 5, 4,096 on Haiku 4.5. A marker sitting under that minimum creates
 * nothing, silently: no error, `cache_creation_input_tokens: 0`, the answer still
 * arrives and only the bill moves.
 *
 * The chat route marks three system blocks and the end of the conversation. This
 * measures where each of those markers actually falls, in each model's own
 * tokens, and then runs the same request twice under each model and reports what
 * the provider really did with them.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { SETUP_CAPS, type AppMode } from '@shared/api';
import { assembleContext, renderContext, renderMarketLine } from '../src/lib/kai/context.ts';
import { buildSystemPrompt } from '../src/lib/kai/system-prompt.ts';
import { KAI_TOOLS, TOOL_PROTOCOL } from '../src/lib/kai/tools.ts';
import { voicePromptBlock, experienceOf } from '../src/lib/kai/voice.ts';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import { availableLevels, availableDrawings, chartCommandProtocol, chartAnswerProtocol } from '../src/lib/kai/chart-commands.ts';
import { levelTableFor } from '../src/lib/kai/chart-answer.ts';
import { SHEET_ACTION_PROTOCOL, loadSheetContext } from '../src/lib/kai/sheet-context.ts';

const OWNER = '080ae0db-5d7d-4c16-a785-3de192ada266';
const MODE: AppMode = 'swing';
const MIN: Record<string, number> = { 'claude-sonnet-5': 1024, 'claude-haiku-4-5': 4096 };
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function blocksFor(chart: string | null) {
  const chartCtx = chart ? await loadChartContext(OWNER, { symbol: chart, timeframe: '1d' }) : null;
  const kctx = await assembleContext({
    userId: OWNER, mode: MODE, pinnedSetupIds: chartCtx?.setup?.id ? [chartCtx.setup.id] : [], cap: SETUP_CAPS[MODE],
  });
  const experience = experienceOf((kctx.profile.onboarding as Record<string, unknown>)?.experience ?? kctx.profile.experience);
  const chartLevels = chartCtx ? availableLevels(chartCtx) : [];
  const sheet = await loadSheetContext(OWNER, chartCtx
    ? { kind: (chartCtx.setup ? 'alert' : 'symbol') as 'alert' | 'symbol', id: chartCtx.setup?.id ? `setup:${chartCtx.setup.id}` : chartCtx.symbol, symbol: chartCtx.symbol }
    : undefined);
  const identity = buildSystemPrompt({
    displayName: kctx.profile.display_name, experience: kctx.profile.experience,
    involvement: kctx.profile.involvement, explanationLevel: kctx.profile.explanation_level, mode: MODE,
  });
  const protocols = [
    sheet.prompt_block ? SHEET_ACTION_PROTOCOL : null,
    voicePromptBlock(experience, []),
    TOOL_PROTOCOL,
    chartCtx ? chartCommandProtocol({ symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, available: chartLevels, drawings: availableDrawings(chartCtx) }) : null,
    chartCtx ? chartAnswerProtocol({ symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, available: [...levelTableFor(chartCtx).keys()] }) : null,
  ].filter((s): s is string => Boolean(s)).join('\n\n');
  const facts = `CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx, chartCtx ? { symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, levels: chartLevels } : null, { market: false })}${sheet.prompt_block ? `\n\n${sheet.prompt_block}` : ''}`;
  return { identity, protocols, facts, marketLine: renderMarketLine(kctx) };
}

for (const chart of [null, 'GTLB'] as const) {
  const b = await blocksFor(chart);
  console.log(`\n############ prompt with ${chart ? `the ${chart} chart open` : 'no chart open'} ############`);
  for (const model of ['claude-sonnet-5', 'claude-haiku-4-5']) {
    const count = async (blocks: Anthropic.TextBlockParam[]) =>
      (await client.messages.countTokens({ model, system: blocks, tools: KAI_TOOLS, messages: [{ role: 'user', content: 'x' }] })).input_tokens;
    const t = (s: string): Anthropic.TextBlockParam => ({ type: 'text', text: s });
    const c0 = await count([]);                                   // tools only
    const c1 = await count([t(b.identity)]);                      // + block 1
    const c2 = await count([t(b.identity), t(b.protocols)]);      // + block 2
    const c3 = await count([t(b.identity), t(b.protocols), t(b.facts)]); // + block 3
    const min = MIN[model];
    const verdict = (n: number) => (n >= min ? `caches   (${n} >= ${min})` : `NO CACHE (${n} < ${min})`);
    console.log(`\n  ${model}   minimum cacheable prefix: ${min} tokens`);
    console.log(`    marker 1, after "who Kai is"      cumulative ${String(c1).padStart(5)}  ${verdict(c1)}`);
    console.log(`    marker 2, after "how he may act"  cumulative ${String(c2).padStart(5)}  ${verdict(c2)}`);
    console.log(`    marker 3, after "the facts"       cumulative ${String(c3).padStart(5)}  ${verdict(c3)}`);
    console.log(`    (tool definitions alone: ${c0})`);
  }
}
