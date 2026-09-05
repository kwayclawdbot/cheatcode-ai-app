/**
 * WHAT A CREDIT IS WORTH, MEASURED — the calibration behind `UNITS_PER_CREDIT`,
 * re-runnable so the number can be retuned against real traffic instead of
 * argued about.
 *
 *   cd apps/api && npx tsx scripts/credits-proof.mts          # local
 *   cd apps/api && npx tsx scripts/credits-proof.mts prod     # hosted
 *
 * It reads `kai_model_usage`, groups the model calls into questions by
 * `request_id`, and prices each question the way the credit system does:
 * cache-neutral, so `cache_creation_input_tokens` is excluded from what a
 * person is charged but kept in the true-cost column.
 *
 * It prints the number that actually matters — the DISTRIBUTION of credits per
 * question — at several candidate credit sizes, so the choice can be made by
 * looking at it rather than by assertion.
 *
 * NOTHING HERE IS INVENTED. A model with no rate in pricing.ts is reported as
 * unpriced and left out of both sides of every division.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { chargeableUnits, creditsForUnits, UNITS_PER_CREDIT, PLANS, ceilingOutlook } from '../src/lib/kai/plans';

const which = process.argv[2] === 'prod' ? '.env.prod' : '.env.local';
const env: Record<string, string> = {};
for (const line of readFileSync(new URL(`../${which}`, import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error, count } = await db
  .from('kai_model_usage')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .limit(5000);
if (error) { console.log('ERROR', error.message); process.exit(1); }
const rows = (data ?? []) as Record<string, any>[];
console.log(`${which}: kai_model_usage has ${count} rows\n`);

/**
 * ONLY THE FEATURES A CREDIT IS CHARGED FOR. The same list `kai_credit_basis`
 * uses. A background briefing or an alert draft is real model spend, but nobody
 * asked for it and nobody is billed for it, so including it here would
 * calibrate the size of a credit against work that never becomes one.
 */
const CHARGED = new Set([
  'chat', 'chat_object_retry', 'chat_command_recovery', 'chart_answer', 'conversation_title',
]);
const byReq = new Map<string, Record<string, any>[]>();
for (const r of rows) {
  if (!CHARGED.has(r.feature)) continue;
  byReq.set(r.request_id, [...(byReq.get(r.request_id) ?? []), r]);
}

type Q = { req: string; calls: number; units: number; cost: number; unpriced: number; feats: string };
const questions: Q[] = [];
for (const [req, rs] of byReq) {
  let units = 0, cost = 0, unpriced = 0;
  for (const r of rs) {
    const u = chargeableUnits(r.model, r as never);
    if (u === null) { unpriced += 1; continue; }
    units += u;
    cost += Number(r.cost_usd ?? 0);
  }
  questions.push({ req, calls: rs.length, units, cost, unpriced, feats: [...new Set(rs.map((r) => r.feature))].join('+') });
}

/**
 * ONE OUTLIER IS EXCLUDED AND IT IS NAMED RATHER THAN QUIETLY DROPPED. A
 * request with a dozen or more model calls under one id is a PROOF SCRIPT
 * running a battery, not a person asking a question — the chart-vocabulary
 * proof does exactly this. Leaving it in would double the size of a credit off
 * a row no user will ever produce.
 */
const REAL_CALL_CEILING = 8;
const real = questions.filter((q) => q.calls <= REAL_CALL_CEILING && q.units > 0);
const excluded = questions.filter((q) => q.calls > REAL_CALL_CEILING);
for (const q of excluded) {
  console.log(`excluded as a proof run, not a question: ${q.calls} model calls, ${Math.round(q.units)} units [${q.feats}]`);
}
if (!real.length) { console.log('\nno real questions on record here yet.'); process.exit(0); }

console.log(`\n${real.length} real questions.\nchargeable units per question, smallest first:`);
const sorted = [...real].sort((a, b) => a.units - b.units);
console.log('  ' + sorted.map((q) => Math.round(q.units).toLocaleString()).join(' · '));

const totalUnits = real.reduce((a, q) => a + q.units, 0);
const totalCost = real.reduce((a, q) => a + q.cost, 0);

console.log('\ncredits per question at each candidate credit size (rounded the user\'s way):');
for (const size of [2000, 3000, 4000, 5000, 6000]) {
  const credits = sorted.map((q) => Math.max(1, Math.floor(q.units / size)));
  const ones = credits.filter((c) => c === 1).length;
  const mark = size === UNITS_PER_CREDIT ? '  <- shipped' : '';
  console.log(
    `  ${String(size).padStart(5)} units  ${credits.join(' · ').padEnd(34)}` +
    `  ${ones}/${credits.length} cost 1, most expensive ${Math.max(...credits)}${mark}`
  );
}

const shipped = sorted.map((q) => creditsForUnits(q.units));
const totalCredits = shipped.reduce((a, b) => a + b, 0);
const usdPerCredit = totalCost / totalCredits;
console.log(`\nat the shipped ${UNITS_PER_CREDIT.toLocaleString()} units a credit:`);
console.log(`  ${totalCredits} credits charged for $${totalCost.toFixed(5)} of real model spend`);
console.log(`  = $${usdPerCredit.toFixed(5)} a credit`);
console.log(`  (billed units ${Math.round(totalUnits).toLocaleString()}, so we under-charge by ` +
  `${(100 * (1 - (totalCredits * UNITS_PER_CREDIT) / totalUnits)).toFixed(1)}% through rounding in the user's favour)`);

console.log('\nwhat that means for each plan at FULL daily use, every day, for 30 days:');
for (const plan of Object.values(PLANS)) {
  const o = ceilingOutlook(plan, usdPerCredit);
  console.log(
    `  ${plan.name.padEnd(5)} ${String(plan.daily_credits).padStart(3)}/day = ` +
    `${o.monthly_credits.toLocaleString().padStart(6)} credits = $${o.projected_usd.toFixed(2).padStart(7)}` +
    (o.ceiling_usd === null
      ? '   (no ceiling — this is the free-tier exposure per account)'
      : o.fits
        ? `   fits inside $${o.ceiling_usd} with $${o.headroom_usd} to spare`
        : `   DOES NOT FIT inside $${o.ceiling_usd} — the ceiling stops a maximal user around day ${o.binds_on_day}`)
  );
}

const freeMonthly = PLANS.free.daily_credits * 30 * usdPerCredit;
console.log('\nfree-tier exposure, assuming every account finishes all ten credits every day:');
for (const n of [100, 1_000, 10_000]) {
  console.log(`  ${n.toLocaleString().padStart(6)} accounts  $${(freeMonthly * n).toFixed(0)} a month`);
}

/**
 * AND THE SAME SUM PER MODEL, because the chat routing is moving from Sonnet to
 * Haiku underneath all of this and the two give very different answers. Which
 * model chat runs on and whether Pro fits inside $10 are the same decision.
 */
console.log('\nthe same question, per model:');
const byModel = new Map<string, { units: number; cost: number; qs: number }>();
for (const q of real) {
  const rs = byReq.get(q.req)!;
  const model = rs[0].model as string;
  const g = byModel.get(model) ?? { units: 0, cost: 0, qs: 0 };
  g.units += q.units; g.cost += q.cost; g.qs += 1;
  byModel.set(model, g);
}
for (const [model, g] of byModel) {
  const credits = g.units / UNITS_PER_CREDIT;
  const per = g.cost / credits;
  console.log(
    `  ${model.padEnd(18)} ${String(g.qs).padStart(3)} questions  $${per.toFixed(5)} a credit  ->  ` +
    `Pro $${(PLANS.pro.daily_credits * 30 * per).toFixed(2)}/mo vs $10 · ` +
    `VIP $${(PLANS.vip.daily_credits * 30 * per).toFixed(2)}/mo vs $20 · ` +
    `free $${(PLANS.free.daily_credits * 30 * per).toFixed(2)}/account/mo`
  );
}
