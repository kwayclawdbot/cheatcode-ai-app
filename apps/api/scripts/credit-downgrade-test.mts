/**
 * A MID-DAY DOWNGRADE APPLIES THE LOWER CEILING AND KEEPS THE MONTH'S SPEND.
 *
 *   cd apps/api && npx tsx scripts/credit-downgrade-test.mts
 *
 * Runs the real SQL — 0029, 0030 and 0051 — in a throwaway Postgres started in
 * a temp directory (no network, nothing hosted is touched), called with the
 * exact arguments the API builds (`creditStateArgs`). It first shows the 0030
 * defect, then applies 0051 and shows it fixed. Needs `initdb`, `pg_ctl` and
 * `psql` on the PATH; without them it says SKIP and exits non-zero only if
 * CREDIT_SQL_TEST_REQUIRED=1.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creditStateArgs, periodFor, type CreditBasis } from '../src/lib/kai/credits.ts';
import { PLANS } from '../src/lib/kai/plans.ts';

let failures = 0;
function check(name: string, pass: boolean, detail?: unknown): void {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

if (spawnSync('initdb', ['--version']).status !== 0) {
  console.log('SKIP  no local Postgres (initdb) — the downgrade SQL was not exercised');
  process.exit(process.env.CREDIT_SQL_TEST_REQUIRED === '1' ? 1 : 0);
}

const MIG = new URL('../../../supabase/migrations/', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'kai-credit-sql-'));
const data = join(dir, 'data');
const port = String(20000 + Math.floor(Math.random() * 20000));
const quiet = { stdio: ['ignore', 'ignore', 'pipe'] as ['ignore', 'ignore', 'pipe'] };
execFileSync('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'], quiet);
execFileSync('pg_ctl', ['-D', data, '-w', '-l', join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, 'start'], quiet);

function sql(text: string): string {
  return execFileSync('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
    input: text,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
const file = (name: string) => readFileSync(new URL(name, MIG), 'utf8');

try {
  // What Supabase provides that these migrations lean on.
  sql(`
    create role anon; create role authenticated; create role service_role;
    create table subscriptions (user_id uuid primary key, tier text, status text);
    create table entitlement_flags (tier text, flag text, value jsonb, primary key (tier, flag));
    create or replace function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at := now(); return new; end $$;
  `);
  sql(file('0029_kai_model_usage.sql'));
  sql(file('0030_kai_credits.sql'));

  const basis: CreditBasis = { usd_per_credit: 0.0152, source: 'fallback', questions: 0, clamped: false };
  const period = periodFor(new Date(), 'America/New_York');
  const state = (user: string, plan: keyof typeof PLANS) => {
    const a = creditStateArgs(user, PLANS[plan], period, basis);
    const lit = (v: unknown) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v)}'`);
    const out = sql(`select kai_credit_state(${lit(a.p_user_id)}::uuid, ${lit(a.p_period_kind)}, ${lit(a.p_period_key)},
      ${lit(a.p_period_start)}::timestamptz, ${lit(a.p_period_end)}::timestamptz, ${lit(a.p_plan_key)},
      ${lit(a.p_granted_credits)}, ${lit(a.p_cost_ceiling_usd)}::numeric, ${lit(a.p_basis_usd_per_credit)},
      ${lit(a.p_basis_source)}, ${lit(a.p_day_start)}::timestamptz, ${lit(a.p_ceiling_since)}::timestamptz)`);
    const j = JSON.parse(out) as Record<string, unknown>;
    return {
      plan: j.plan_key,
      granted: Number(j.granted_credits),
      ceiling: j.cost_ceiling_usd === null ? null : Number(j.cost_ceiling_usd),
      spent: Number(j.spent_usd),
    };
  };
  const spend = (user: string, usd: number) =>
    sql(`insert into kai_model_usage (request_id, feature, model, user_id, cost_usd)
         values ('r-${Math.random()}', 'chat', 'claude-sonnet-5', '${user}', ${usd})`);

  check('the API always sends a ceiling window, free plan included',
    creditStateArgs('u', PLANS.free, period, basis).p_ceiling_since === period.ceilingSince);

  // --- the 0030 defect, shown so the fix below means something ----------
  const OLD = '00000000-0000-4000-8000-0000000000a1';
  state(OLD, 'vip');
  spend(OLD, 12);
  const oldFree = state(OLD, 'free');
  check('0030: VIP -> free mid-day WIPED the ceiling (the defect)', oldFree.ceiling === null, oldFree);

  // --- 0051 ---------------------------------------------------------------
  sql(file('0051_a_downgrade_keeps_the_cost_ceiling.sql'));

  const A = '00000000-0000-4000-8000-0000000000b1';
  const vip = state(A, 'vip');
  check('VIP opens the day: 75 credits, $20 ceiling', vip.granted === 75 && vip.ceiling === 20, vip);
  spend(A, 12);
  const pro = state(A, 'pro');
  check('VIP -> Pro mid-day: the lower $10 ceiling applies at once', pro.ceiling === 10, pro);
  check('  and the $12 already spent carries over (so the ceiling now binds)', pro.spent === 12 && pro.spent >= (pro.ceiling ?? Infinity), pro);
  check("  and today's 75 credits are not taken back", pro.granted === 75, pro);
  const free = state(A, 'free');
  check('Pro -> free mid-day: the $10 ceiling is NOT wiped', free.ceiling === 10, free);
  check('  and the spend still reads $12, not $0', free.spent === 12, free);

  const B = '00000000-0000-4000-8000-0000000000b2';
  state(B, 'vip');
  spend(B, 5);
  const bFree = state(B, 'free');
  check('VIP -> free directly keeps the $20 ceiling and the $5 spend', bFree.ceiling === 20 && bFree.spent === 5, bFree);

  const C = '00000000-0000-4000-8000-0000000000b3';
  state(C, 'free');
  const cPro = state(C, 'pro');
  check('free -> Pro still upgrades at once: 40 credits, $10 ceiling', cPro.granted === 40 && cPro.ceiling === 10, cPro);
  const cVip = state(C, 'vip');
  check('Pro -> VIP still raises the ceiling to $20', cVip.granted === 75 && cVip.ceiling === 20, cVip);

  // A caller that still sends no window (an old API build) still gets the spend.
  const D = '00000000-0000-4000-8000-0000000000b4';
  state(D, 'vip');
  spend(D, 3);
  const dRow = JSON.parse(sql(`select kai_credit_state('${D}'::uuid, 'day', '${period.key}', '${period.start}', '${period.end}', 'free', 10, null, 0.0152, 'fallback', '${period.start}', null)`));
  check('an old caller that sends no window still sees the spend', Number(dRow.spent_usd) === 3 && Number(dRow.cost_ceiling_usd) === 20, dRow);

  const grants = sql(`select count(*) from kai_credit_ledger where user_id = '${A}' and kind = 'grant'`);
  check('still exactly one grant row for the day', grants === '1', grants);
} finally {
  spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
