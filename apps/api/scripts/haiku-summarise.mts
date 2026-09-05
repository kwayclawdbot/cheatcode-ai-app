/**
 * WHAT IT COST AND HOW MANY PASSES IT TOOK.
 *
 * Prices come from the app's own table (lib/kai/pricing.ts) so this report and
 * the app's usage rows can never disagree. Two costs are given for every
 * question: what the run actually cost with the prompt cache working, and what
 * the same tokens would have cost with no cache at all.
 */
import { readFileSync } from 'node:fs';
import { costUsd, uncachedCostUsd } from '../src/lib/kai/pricing.ts';

type Call = { input_tokens: number|null; output_tokens: number|null; cache_read_input_tokens: number|null; cache_creation_input_tokens: number|null; stop_reason: string|null; ms: number; tool_calls: {name:string}[] };
type Row = { model: string; rep: number; id: string; chart: string|null; bait: boolean;
  asks: { ask: string; calls: Call[]; tool_turns: number; tools_used: {name:string}[]; narrative: string; director_calls: number; error: string|null }[] };

const files = process.argv.slice(2);
type Agg = { calls: number; toolTurns: number; inp: number; out: number; cr: number; cc: number; cost: number; uncached: number; ms: number; n: number; empty: number; errors: number };
const blank = (): Agg => ({ calls:0, toolTurns:0, inp:0, out:0, cr:0, cc:0, cost:0, uncached:0, ms:0, n:0, empty:0, errors:0 });

for (const f of files) {
  const rows = JSON.parse(readFileSync(f, 'utf8')) as Row[];
  const model = rows[0].model;
  const total = blank();
  const byQ = new Map<string, Agg>();
  for (const r of rows) {
    const g = byQ.get(r.id) ?? blank();
    for (const a of r.asks) {
      for (const c of a.calls) {
        const t = { input_tokens: c.input_tokens, output_tokens: c.output_tokens, cache_read_input_tokens: c.cache_read_input_tokens, cache_creation_input_tokens: c.cache_creation_input_tokens };
        g.calls++; g.inp += c.input_tokens ?? 0; g.out += c.output_tokens ?? 0;
        g.cr += c.cache_read_input_tokens ?? 0; g.cc += c.cache_creation_input_tokens ?? 0;
        g.cost += costUsd(model, t) ?? 0; g.uncached += uncachedCostUsd(model, t) ?? 0; g.ms += c.ms;
      }
      g.toolTurns += a.tool_turns;
      if (!a.narrative.trim()) g.empty++;
      if (a.error) g.errors++;
    }
    g.n += r.asks.length;
    byQ.set(r.id, g);
  }
  for (const g of byQ.values()) { total.calls+=g.calls; total.toolTurns+=g.toolTurns; total.inp+=g.inp; total.out+=g.out; total.cr+=g.cr; total.cc+=g.cc; total.cost+=g.cost; total.uncached+=g.uncached; total.ms+=g.ms; total.n+=g.n; total.empty+=g.empty; total.errors+=g.errors; }

  console.log(`\n===== ${model} =====`);
  console.log('question                 asks  calls/ask  toolturns/ask  in_fresh  cache_read  cache_write  out  $/ask(cached)  $/ask(no cache)  s/ask');
  for (const [id, g] of [...byQ].sort()) {
    console.log(
      id.padEnd(24),
      String(g.n).padStart(4),
      (g.calls/g.n).toFixed(2).padStart(10),
      (g.toolTurns/g.n).toFixed(2).padStart(14),
      Math.round(g.inp/g.n).toString().padStart(9),
      Math.round(g.cr/g.n).toString().padStart(11),
      Math.round(g.cc/g.n).toString().padStart(12),
      Math.round(g.out/g.n).toString().padStart(5),
      (g.cost/g.n).toFixed(5).padStart(14),
      (g.uncached/g.n).toFixed(5).padStart(16),
      (g.ms/g.n/1000).toFixed(1).padStart(6),
    );
  }
  console.log('-'.repeat(140));
  console.log(
    'ALL'.padEnd(24), String(total.n).padStart(4),
    (total.calls/total.n).toFixed(2).padStart(10),
    (total.toolTurns/total.n).toFixed(2).padStart(14),
    Math.round(total.inp/total.n).toString().padStart(9),
    Math.round(total.cr/total.n).toString().padStart(11),
    Math.round(total.cc/total.n).toString().padStart(12),
    Math.round(total.out/total.n).toString().padStart(5),
    (total.cost/total.n).toFixed(5).padStart(14),
    (total.uncached/total.n).toFixed(5).padStart(16),
    (total.ms/total.n/1000).toFixed(1).padStart(6),
  );
  console.log(`empty answers: ${total.empty}   errors: ${total.errors}   total spend on this arm: $${total.cost.toFixed(4)}`);
  const perMsgCached = total.cost/total.n, perMsgUncached = total.uncached/total.n;
  console.log(`heavy user, 50 messages a day, 30 days: $${(perMsgCached*50*30).toFixed(2)} with the cache working, $${(perMsgUncached*50*30).toFixed(2)} without it`);
}
