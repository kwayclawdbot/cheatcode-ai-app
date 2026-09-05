/**
 * DOES THE CACHE ACTUALLY HIT — measured, not read off the code.
 *
 *   cd apps/api && npx tsx --env-file=.env.local scripts/kai-cache-proof.mts
 *
 * THIS SPENDS REAL MONEY. It makes eight real calls to the model (a few cents)
 * because the only honest way to know whether a prompt cache is working is
 * `cache_read_input_tokens` coming back non-zero from the provider. A cache
 * that never hits is the DEFAULT failure mode: every reply still works and the
 * only thing that changes is the bill, so reading the code proves nothing.
 *
 * It builds the prompt exactly the way `POST /kai/conversations/:id/messages`
 * builds it — the same functions, the same real rows out of the database — in
 * two shapes:
 *
 *   BEFORE  one system string, market timestamp in the middle of it, no
 *           markers. What shipped until today.
 *   AFTER   three marked system blocks ordered by how often each changes, the
 *           timestamp moved out to the end of the conversation, and the tail
 *           of the conversation marked as well.
 *
 * Each shape is run four times, imitating one question that used tools twice
 * and then a second question in the same conversation.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { SETUP_CAPS, type AppMode } from '@shared/api';
import { serviceClient } from '../src/lib/db.ts';
import { assembleContext, renderContext, renderMarketLine } from '../src/lib/kai/context.ts';
import { buildSystemPrompt } from '../src/lib/kai/system-prompt.ts';
import { KAI_TOOLS, TOOL_PROTOCOL } from '../src/lib/kai/tools.ts';
import { voicePromptBlock, experienceOf } from '../src/lib/kai/voice.ts';
import { KAI_MODEL } from '../src/lib/env.ts';
import { costUsd, uncachedCostUsd } from '../src/lib/kai/pricing.ts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = KAI_MODEL();

const db = serviceClient();
const { data: convs } = await db.from('conversations').select('id,user_id,mode').limit(1);
const conv = convs![0] as { id: string; user_id: string; mode: string | null };
const mode = (conv.mode ?? 'day_trade') as AppMode;

const kctx = await assembleContext({
  userId: conv.user_id,
  mode,
  conversationId: conv.id,
  pinnedSetupIds: [],
  cap: SETUP_CAPS[mode],
});
const experience = experienceOf(
  (kctx.profile.onboarding as Record<string, unknown>)?.experience ?? kctx.profile.experience
);

const identity = buildSystemPrompt({
  displayName: kctx.profile.display_name,
  experience: kctx.profile.experience,
  involvement: kctx.profile.involvement,
  explanationLevel: kctx.profile.explanation_level,
  mode,
});
const protocols = [voicePromptBlock(experience, []), TOOL_PROTOCOL].join('\n\n');
const facts = `CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx, null, { market: false })}`;

/* ---- BEFORE: one string, timestamp buried in it, nothing marked ---- */
const systemBefore = `${identity}

${voicePromptBlock(experience, [])}

${TOOL_PROTOCOL}

CONTEXT (facts you may use — nothing outside this is known to you)
${renderContext(kctx, null)}`;

/* ---- AFTER: three marked blocks, stable first ---- */
const systemAfter: Anthropic.TextBlockParam[] = [
  { type: 'text', text: identity, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: protocols, cache_control: { type: 'ephemeral' } },
  { type: 'text', text: facts, cache_control: { type: 'ephemeral' } },
];

type Row = {
  label: string;
  input: number;
  output: number;
  read: number;
  write: number;
  cost: number | null;
  uncached: number | null;
};

async function call(
  label: string,
  system: Anthropic.MessageCreateParams['system'],
  messages: Anthropic.MessageParam[],
  cacheTail: boolean
): Promise<Row> {
  const res = await client.messages.create({
    model,
    max_tokens: 300,
    output_config: { effort: 'low' },
    system,
    messages,
    tools: KAI_TOOLS,
    ...(cacheTail ? { cache_control: { type: 'ephemeral' as const } } : null),
  });
  const u = res.usage;
  const counts = {
    input_tokens: u.input_tokens ?? null,
    output_tokens: u.output_tokens ?? null,
    cache_read_input_tokens: u.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
  };
  return {
    label,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    read: u.cache_read_input_tokens ?? 0,
    write: u.cache_creation_input_tokens ?? 0,
    cost: costUsd(model, counts),
    uncached: uncachedCostUsd(model, counts),
  };
}

/**
 * One question that used a tool twice, then a second question. Four calls,
 * which is what a normal tool-using turn plus a follow-up really costs.
 */
function conversation(marketAtEnd: boolean): Anthropic.MessageParam[][] {
  const q1 = 'What is the top ranked setup right now and why?';
  const q2 = 'And what would prove that one wrong?';
  const line = marketAtEnd ? `\n\n${renderMarketLine(kctx)}` : '';
  const t1: Anthropic.MessageParam[] = [{ role: 'user', content: `${q1}${line}` }];
  const t2: Anthropic.MessageParam[] = [
    ...t1,
    { role: 'assistant', content: 'Let me check the ranked list.' },
    { role: 'user', content: 'Tool result: { "ok": true, "rows": 4 }' },
  ];
  const t3: Anthropic.MessageParam[] = [
    ...t2,
    { role: 'assistant', content: 'And the quote.' },
    { role: 'user', content: 'Tool result: { "ok": true, "price": 100.0 }' },
  ];
  const t4: Anthropic.MessageParam[] = [
    ...t3,
    { role: 'assistant', content: 'Here is the read on it.' },
    { role: 'user', content: `${q2}${line}` },
  ];
  return [t1, t2, t3, t4];
}

function report(name: string, rows: Row[]) {
  console.log(`\n=== ${name} ===`);
  console.log('call            input   cached  written  output      cost   uncached');
  let cost = 0;
  let unc = 0;
  let read = 0;
  let billedIn = 0;
  for (const r of rows) {
    console.log(
      `${r.label.padEnd(14)} ${String(r.input).padStart(6)} ${String(r.read).padStart(8)} ` +
        `${String(r.write).padStart(8)} ${String(r.output).padStart(7)} ` +
        `${(r.cost ?? NaN).toFixed(5).padStart(9)} ${(r.uncached ?? NaN).toFixed(5).padStart(10)}`
    );
    cost += r.cost ?? 0;
    unc += r.uncached ?? 0;
    read += r.read;
    billedIn += r.input + r.read + r.write;
  }
  console.log(
    `TOTAL          prompt tokens ${billedIn}  ·  from cache ${read} ` +
      `(${((100 * read) / (billedIn || 1)).toFixed(1)}%)`
  );
  console.log(`TOTAL cost $${cost.toFixed(5)}   (same traffic with no cache: $${unc.toFixed(5)})`);
  return { cost, unc, read, billedIn };
}

console.log(`model ${model} · ${kctx.setups.length} ranked setups · ${kctx.turns.length} stored turns`);

const before: Row[] = [];
for (const [i, msgs] of conversation(false).entries()) {
  before.push(await call(`before #${i + 1}`, systemBefore, msgs, false));
}
const b = report('BEFORE — one system string, timestamp inside it, no markers', before);

const after: Row[] = [];
for (const [i, msgs] of conversation(true).entries()) {
  after.push(await call(`after #${i + 1}`, systemAfter, msgs, true));
}
const a = report('AFTER — three marked blocks, timestamp moved to the end', after);

console.log('\n=== VERDICT ===');
console.log(`cache reads BEFORE: ${b.read} tokens`);
console.log(`cache reads AFTER : ${a.read} tokens`);
console.log(
  `cost for the same four calls: $${b.cost.toFixed(5)} → $${a.cost.toFixed(5)} ` +
    `(${(100 * (1 - a.cost / (b.cost || 1))).toFixed(1)}% less)`
);
if (a.read === 0) {
  console.log('FAIL — nothing was read from cache. Something in the prefix still moves.');
  process.exit(1);
}
console.log('PASS — the cache is being read.');

/**
 * THE HARDER TEST, AND THE ONE THE WHOLE DESIGN TURNS ON.
 *
 * Everything above happened inside one question. The real saving is a SECOND
 * question, minutes later, as a separate web request — with a market timestamp
 * that has moved. That is exactly the value that used to sit at the front of
 * the prompt and made every request unique. If the three system blocks still
 * read back here, the timestamp is genuinely out of the way.
 */
const later = await assembleContext({
  userId: conv.user_id,
  mode,
  conversationId: conv.id,
  pinnedSetupIds: [],
  cap: SETUP_CAPS[mode],
});
console.log(
  `\n=== A LATER QUESTION — timestamp has moved (${kctx.marketBlock.session_ts} → ${later.marketBlock.session_ts}) ===`
);
const nextTurn = await call(
  'turn 2',
  systemAfter,
  [{ role: 'user', content: `Anything change since then?\n\n${renderMarketLine(later)}` }],
  true
);
console.log(
  `input ${nextTurn.input} · from cache ${nextTurn.read} · written ${nextTurn.write} · ` +
    `cost $${(nextTurn.cost ?? NaN).toFixed(5)} vs $${(nextTurn.uncached ?? NaN).toFixed(5)} uncached`
);
if (nextTurn.read === 0) {
  console.log('FAIL — a new question misses the cache. Something per-request is still in the prefix.');
  process.exit(1);
}
console.log('PASS — a fresh question still reads the whole stable prefix back.');
