/**
 * THE TRANSCRIPTS, SIDE BY SIDE, IN PLAIN TEXT.
 * One file the owner can read end to end: the question, what each model looked
 * up, what it said, and what it drew.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { QUESTIONS } from './haiku-questions.mts';

type Row = { model: string; rep: number; id: string; chart: string|null; bait: boolean; why: string;
  chart_level_prices: Record<string, number>;
  asks: { ask: string; narrative: string; tool_turns: number;
    tools_used: {name:string; input:unknown; result:unknown}[];
    chart_answer_actions: unknown[]; chart_commands: unknown[]; calls: {output_tokens:number|null}[]; error: string|null }[] };

const files = process.argv.slice(2, -1);
const out = process.argv[process.argv.length - 1];
const all: Row[] = [];
for (const f of files) all.push(...(JSON.parse(readFileSync(f, 'utf8')) as Row[]));

const L: string[] = [];
L.push('KAI ON HAIKU 4.5 VS SONNET 5 — EVERY QUESTION, EVERY ANSWER');
L.push('Run 2026-09-05, market closed (Saturday). Owner account, swing mode, paper $10,000.');
L.push('Each question was asked three times to each model. Nothing here is edited.');
L.push('');

for (const q of QUESTIONS) {
  L.push('='.repeat(100));
  L.push(`QUESTION: ${q.asks.join('   >>>   ')}`);
  L.push(`Chart open: ${q.chart ?? 'none'}${q.bait ? '    *** DESIGNED TO TEMPT AN INVENTED NUMBER ***' : ''}`);
  L.push(`What it is testing: ${q.why}`);
  const truth = all.find((r) => r.id === q.id)?.chart_level_prices ?? {};
  if (Object.keys(truth).length) {
    L.push('The real levels on that chart (what any number must match):');
    L.push('  ' + Object.entries(truth).map(([k, v]) => `${k}=${v}`).join('  '));
  }
  L.push('');
  for (const model of ['claude-sonnet-5', 'claude-haiku-4-5']) {
    for (const r of all.filter((x) => x.id === q.id && x.model === model).sort((a, b) => a.rep - b.rep)) {
      L.push(`--- ${model}  run ${r.rep} ---`);
      for (const a of r.asks) {
        if (r.asks.length > 1) L.push(`  [asked] ${a.ask}`);
        L.push(`  looked up: ${a.tools_used.length ? a.tools_used.map((t) => `${t.name}(${JSON.stringify(t.input)})`).join(', ') : 'nothing'}   (${a.tool_turns} extra pass${a.tool_turns === 1 ? '' : 'es'})`);
        for (const t of a.tools_used) L.push(`     -> ${JSON.stringify(t.result).slice(0, 700)}`);
        L.push('  said:');
        for (const line of (a.narrative || '(nothing)').split('\n')) L.push('    ' + line);
        const drew = (a.chart_answer_actions as Record<string, unknown>[]).map((x) => {
          const f = (x.frame ?? {}) as Record<string, unknown>;
          const p = (f.payload ?? {}) as Record<string, unknown>;
          return `${f.command ?? '?'}:${p.level ?? p.shape ?? ''}@${p.price ?? '-'}`;
        });
        const cmds = (a.chart_commands as Record<string, unknown>[]).map((c) => `${JSON.stringify(c.requested)}${c.resolved ? '' : ' [NOT RESOLVED]'}`);
        L.push(`  drew on the chart: ${[...drew, ...cmds].join(', ') || 'nothing'}`);
        if (a.error) L.push(`  ERROR: ${a.error}`);
      }
      L.push('');
    }
  }
}
writeFileSync(out, L.join('\n'));
console.log('wrote', out, L.length, 'lines');
