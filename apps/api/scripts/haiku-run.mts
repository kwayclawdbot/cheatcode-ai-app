/**
 * HEAD-TO-HEAD HARNESS — Haiku 4.5 against Sonnet 5, on the app's own prompt.
 *
 * This is a MEASUREMENT script. It changes nothing and writes nothing to the
 * database. It rebuilds the exact request the chat route builds — the same
 * three cached system blocks, the same tool definitions, the same tool loop,
 * the same MAX_TOOL_TURNS — and runs it against whichever model is named.
 *
 * Two things are deliberately NOT copied from the route:
 *   1. `output_config: { effort: 'low' }`, which Haiku 4.5 REJECTS with a 400.
 *      It is sent for Sonnet, as production does, and omitted for Haiku, which
 *      is what production would have to do.
 *   2. The user's turn is not persisted, so no conversation grows during a run.
 *
 * The director behind `answer_on_chart` is held at Sonnet for BOTH arms, so the
 * only thing that differs between the two columns is the model that answers and
 * calls the tools. Its cost is recorded separately.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SETUP_CAPS, type AppMode } from '@shared/api';
import { assembleContext, contextNumbers, renderContext, renderMarketLine } from '../src/lib/kai/context.ts';
import { buildSystemPrompt } from '../src/lib/kai/system-prompt.ts';
import { KAI_TOOLS, TOOL_PROTOCOL, runKaiTool } from '../src/lib/kai/tools.ts';
import { voicePromptBlock, experienceOf } from '../src/lib/kai/voice.ts';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import {
  availableLevels, availableDrawings, chartCommandProtocol, chartAnswerProtocol,
  executeChartCommand, ChartCommandRequest,
} from '../src/lib/kai/chart-commands.ts';
import { answerOnChart, levelTableFor } from '../src/lib/kai/chart-answer.ts';
import { FenceSplitter, CHART_COMMAND_FENCE, CHART_ANSWER_FENCE } from '../src/lib/kai/stream.ts';
import { SHEET_ACTION_PROTOCOL, loadSheetContext } from '../src/lib/kai/sheet-context.ts';
import { QUESTIONS } from './haiku-questions.mts';

const OWNER = '080ae0db-5d7d-4c16-a785-3de192ada266';
const MODE: AppMode = 'swing';
const MAX_TOOL_TURNS = 4;

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const MODEL = arg('--model')!;
const REPS = Number(arg('--reps', '3'));
const OUT = arg('--out', `/tmp/haiku-run-${MODEL}.json`)!;
const ONLY = arg('--only');

// Haiku 4.5 does not accept output_config.effort — verified, 400.
const SUPPORTS_EFFORT = !/haiku/.test(MODEL);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Call = {
  turn: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  stop_reason: string | null;
  ms: number;
  tool_calls: { name: string; input: unknown }[];
};

type AskResult = {
  ask: string;
  calls: Call[];
  tool_turns: number;
  tools_used: { name: string; input: unknown; result: unknown }[];
  narrative: string;
  chart_answer_prose: string[];
  chart_answer_actions: unknown[];
  chart_commands: { requested: unknown; resolved: boolean; level?: string; price?: number | null }[];
  kai_objects: string[];
  director_calls: number;
  error: string | null;
};

async function runAsk(opts: {
  system: Anthropic.TextBlockParam[];
  convo: Anthropic.MessageParam[];
  chartCtx: Awaited<ReturnType<typeof loadChartContext>>;
}): Promise<AskResult & { convo: Anthropic.MessageParam[] }> {
  const { system, chartCtx } = opts;
  const convo = opts.convo;
  const calls: Call[] = [];
  const toolsUsed: AskResult['tools_used'] = [];
  const objSplit = new FenceSplitter();
  const cmdSplit = new FenceSplitter(CHART_COMMAND_FENCE);
  const ansSplit = new FenceSplitter(CHART_ANSWER_FENCE);
  let narrative = '';
  const answerBodies: string[] = [];
  const cmdBodies: string[] = [];
  const objBodies: string[] = [];
  let error: string | null = null;
  let toolTurns = 0;

  try {
    for (let turn = 0; turn <= MAX_TOOL_TURNS; turn += 1) {
      const t0 = Date.now();
      const s = client.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        ...(SUPPORTS_EFFORT ? { output_config: { effort: 'low' as const } } : null),
        system,
        messages: convo,
        ...(turn < MAX_TOOL_TURNS ? { tools: KAI_TOOLS } : null),
        cache_control: { type: 'ephemeral' as const },
      });
      for await (const ev of s) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          const o = objSplit.push(ev.delta.text);
          const c = cmdSplit.push(o.text);
          const a = ansSplit.push(c.text);
          narrative += a.text;
          objBodies.push(...o.objects);
          cmdBodies.push(...c.objects);
          answerBodies.push(...a.objects);
        }
      }
      const fin = await s.finalMessage();
      const u = fin.usage;
      const toolCalls = fin.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      calls.push({
        turn,
        input_tokens: u?.input_tokens ?? null,
        output_tokens: u?.output_tokens ?? null,
        cache_read_input_tokens: u?.cache_read_input_tokens ?? null,
        cache_creation_input_tokens: u?.cache_creation_input_tokens ?? null,
        stop_reason: fin.stop_reason ?? null,
        ms: Date.now() - t0,
        tool_calls: toolCalls.map((c) => ({ name: c.name, input: c.input })),
      });
      if (fin.stop_reason !== 'tool_use' || !toolCalls.length) break;
      toolTurns += 1;
      convo.push({ role: 'assistant', content: fin.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of toolCalls) {
        const out = await runKaiTool(c.name, (c.input ?? {}) as Record<string, unknown>, {
          userId: OWNER, mode: MODE, requestId: 'measure',
        });
        toolsUsed.push({ name: c.name, input: c.input, result: out });
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out) });
      }
      convo.push({ role: 'user', content: results });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // flush
  const oT = objSplit.flush();
  const cT = cmdSplit.push(oT.text); const cF = cmdSplit.flush();
  const aT = ansSplit.push(cT.text + cF.text); const aF = ansSplit.flush();
  narrative += aT.text + aF.text;
  objBodies.push(...oT.objects);
  cmdBodies.push(...cT.objects, ...cF.objects);
  answerBodies.push(...aT.objects, ...aF.objects);

  // resolve chart commands against the real objects (no model call)
  const chartCommands: AskResult['chart_commands'] = [];
  if (chartCtx) {
    for (const body of cmdBodies) {
      let p: unknown; try { p = JSON.parse(body.trim()); } catch { chartCommands.push({ requested: body, resolved: false }); continue; }
      const r = ChartCommandRequest.safeParse(p);
      if (!r.success) { chartCommands.push({ requested: p, resolved: false }); continue; }
      const frame = await executeChartCommand(chartCtx, r.data, 'measure');
      chartCommands.push({
        requested: r.data, resolved: Boolean(frame),
        level: (r.data.args as Record<string, unknown> | undefined)?.level as string | undefined,
        price: (frame?.annotations?.[0] as Record<string, unknown> | undefined)?.price as number | null ?? null,
      });
    }
  }

  // direct the answer_on_chart bodies (director held at Sonnet for both arms)
  const prose: string[] = [];
  const actions: unknown[] = [];
  let directorCalls = 0;
  if (chartCtx) {
    for (const body of answerBodies) {
      let ans = '';
      try { const v = JSON.parse(body.trim()) as { answer?: unknown }; ans = typeof v.answer === 'string' ? v.answer : ''; } catch { /* keep raw */ }
      if (!ans.trim()) { prose.push(`[UNPARSEABLE answer_on_chart body] ${body.slice(0, 400)}`); continue; }
      const d = await answerOnChart(chartCtx, { answer: ans, requestId: 'measure', voice: false });
      directorCalls += 1;
      prose.push(d.spoken);
      for (const a of d.actions) actions.push(a);
      narrative += `${narrative.trim() ? '\n\n' : ''}${d.spoken}`;
    }
  } else if (answerBodies.length) {
    for (const b of answerBodies) prose.push(`[answer_on_chart emitted with NO chart attached] ${b.slice(0, 400)}`);
  }

  return {
    ask: '', calls, tool_turns: toolTurns, tools_used: toolsUsed, narrative: narrative.trim(),
    chart_answer_prose: prose, chart_answer_actions: actions, chart_commands: chartCommands,
    kai_objects: objBodies, director_calls: directorCalls, error, convo,
  };
}

/* ------------------------------------------------------------------ */

const results: unknown[] = [];
const list = QUESTIONS.filter((q) => !ONLY || ONLY.split(',').includes(q.id));

for (let rep = 1; rep <= REPS; rep += 1) {
  for (const q of list) {
    const chartCtx = q.chart ? await loadChartContext(OWNER, { symbol: q.chart, timeframe: '1d' }) : null;
    const kctx = await assembleContext({
      userId: OWNER, mode: MODE, pinnedSetupIds: chartCtx?.setup?.id ? [chartCtx.setup.id] : [],
      cap: SETUP_CAPS[MODE],
    });
    const experience = experienceOf((kctx.profile.onboarding as Record<string, unknown>)?.experience ?? kctx.profile.experience);
    const chartLevels = chartCtx ? availableLevels(chartCtx) : [];
    const chartDrawings = chartCtx ? availableDrawings(chartCtx) : [];
    const answerLevels = chartCtx ? [...levelTableFor(chartCtx).keys()] : [];
    const chartOnScreen = chartCtx ? { symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, levels: chartLevels } : null;

    const systemIdentity = buildSystemPrompt({
      displayName: kctx.profile.display_name, experience: kctx.profile.experience,
      involvement: kctx.profile.involvement, explanationLevel: kctx.profile.explanation_level, mode: MODE,
    });
    // The Trade section always opens the sheet over the object being looked at,
    // so a chart question in the real app carries one. Matched here.
    const sheet = await loadSheetContext(OWNER, chartCtx
      ? { kind: (chartCtx.setup ? 'alert' : 'symbol') as 'alert' | 'symbol',
          id: chartCtx.setup?.id ? `setup:${chartCtx.setup.id}` : chartCtx.symbol,
          symbol: chartCtx.symbol }
      : undefined);

    const systemProtocols = [
      sheet.prompt_block ? SHEET_ACTION_PROTOCOL : null,
      voicePromptBlock(experience, []),
      TOOL_PROTOCOL,
      chartCtx ? chartCommandProtocol({ symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, available: chartLevels, drawings: chartDrawings }) : null,
      chartCtx ? chartAnswerProtocol({ symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, available: answerLevels }) : null,
    ].filter((s): s is string => Boolean(s)).join('\n\n');
    const systemFacts = `CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx, chartOnScreen, { market: false })}${sheet.prompt_block ? `\n\n${sheet.prompt_block}` : ''}`;
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: systemIdentity, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: systemProtocols, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: systemFacts, cache_control: { type: 'ephemeral' } },
    ];
    const marketLine = `${renderMarketLine(kctx)}\nUse this as the current market state and time when you answer.`;

    const convo: Anthropic.MessageParam[] = [];
    const asks: AskResult[] = [];
    for (const ask of q.asks) {
      convo.push({ role: 'user', content: `${ask}\n\n${marketLine}` });
      const r = await runAsk({ system, convo, chartCtx });
      // The assistant's visible reply goes back as the next turn's history,
      // exactly as the route reconstructs it from the database.
      asks.push({ ...r, ask });
      // Rebuild a clean history: user text + assistant narrative, exactly as the
      // route reconstructs it from `conversation_messages` on the next turn.
      convo.length = 0;
      for (const a of asks) {
        convo.push({ role: 'user', content: a.ask });
        if (a.narrative) convo.push({ role: 'assistant', content: a.narrative });
      }
    }

    results.push({
      model: MODEL, rep, id: q.id, chart: q.chart, why: q.why, bait: Boolean(q.bait),
      chart_levels_available: chartLevels,
      chart_level_prices: chartCtx ? Object.fromEntries([...levelTableFor(chartCtx)].map(([k, v]) => [k, v.price])) : {},
      allowed_numbers: contextNumbers(kctx),
      system_chars: systemIdentity.length + systemProtocols.length + systemFacts.length,
      asks,
    });
    const last = asks[asks.length - 1];
    const tot = asks.reduce((a, x) => a + x.calls.length, 0);
    console.log(`${MODEL} rep${rep} ${q.id.padEnd(22)} calls=${tot} toolturns=${asks.reduce((a,x)=>a+x.tool_turns,0)} ${last.error ? 'ERROR ' + last.error.slice(0,80) : ''}`);
    writeFileSync(OUT, JSON.stringify(results, null, 1));
  }
}
console.log('wrote', OUT, results.length, 'rows');
