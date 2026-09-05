/**
 * The real ledger, if it has anything in it. `kai_model_usage` records one row
 * per model call; rows sharing a request_id are one question, so counting them
 * gives the number of passes that question took.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const which = process.argv[2] ?? 'local';
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error, count } = await db
  .from('kai_model_usage')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .limit(400);
if (error) { console.log(which, 'ERROR:', error.message); process.exit(0); }
console.log(`${which}: kai_model_usage has ${count} rows`);
const rows = (data ?? []) as Record<string, any>[];
if (!rows.length) process.exit(0);

const byReq = new Map<string, Record<string, any>[]>();
for (const r of rows) { const k = r.request_id ?? '-'; byReq.set(k, [...(byReq.get(k) ?? []), r]); }
const byModel = new Map<string, { calls: number; in: number; out: number; cr: number; cc: number; cost: number }>();
for (const r of rows) {
  const m = r.model ?? '?';
  const g = byModel.get(m) ?? { calls: 0, in: 0, out: 0, cr: 0, cc: 0, cost: 0 };
  g.calls++; g.in += r.input_tokens ?? 0; g.out += r.output_tokens ?? 0;
  g.cr += r.cache_read_input_tokens ?? 0; g.cc += r.cache_creation_input_tokens ?? 0; g.cost += Number(r.cost_usd ?? 0);
  byModel.set(m, g);
}
for (const [m, g] of byModel) {
  console.log(`  ${m}: ${g.calls} calls | avg uncached ${Math.round(g.in / g.calls)} | avg from cache ${Math.round(g.cr / g.calls)} | avg written ${Math.round(g.cc / g.calls)} | avg out ${Math.round(g.out / g.calls)} | total $${g.cost.toFixed(4)}`);
}
const chat = [...byReq.values()].filter((v) => v.some((r) => r.feature === 'chat'));
if (chat.length) {
  const passes = chat.map((v) => v.filter((r) => r.feature === 'chat').length);
  console.log(`  questions with a chat turn: ${chat.length} | model calls per question: avg ${(passes.reduce((a, b) => a + b, 0) / passes.length).toFixed(2)}, max ${Math.max(...passes)}`);
}
// The chat feature on its own — that is the thing being priced.
const chatRows = rows.filter((r) => r.feature === 'chat');
if (chatRows.length) {
  const n = chatRows.length;
  const sum = (k: string) => chatRows.reduce((a, r) => a + (r[k] ?? 0), 0);
  console.log(`  CHAT ONLY (${n} calls): avg uncached ${Math.round(sum('input_tokens') / n)} | from cache ${Math.round(sum('cache_read_input_tokens') / n)} | written ${Math.round(sum('cache_creation_input_tokens') / n)} | out ${Math.round(sum('output_tokens') / n)}`);
  console.log(`     cost of those calls: $${chatRows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0).toFixed(5)}`);
}
const feats = new Map<string, number>();
for (const r of rows) feats.set(r.feature ?? '?', (feats.get(r.feature ?? '?') ?? 0) + 1);
console.log('  by feature:', [...feats].map(([k, v]) => `${k}=${v}`).join(' '));
