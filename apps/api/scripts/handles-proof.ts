/**
 * handles-proof — run the username rules against the real database and print
 * what actually happened.
 *
 *   npx tsx scripts/handles-proof.ts           # the local database (.env.local)
 *   npx tsx scripts/handles-proof.ts prod      # the hosted one   (.env.prod)
 *
 * WHAT IT PROVES, AND WHY EACH ONE IS HERE
 *
 * 1. THE RESERVED LIST IN THE CODE AND THE ONE IN THE DATABASE ARE THE SAME.
 *    The phone checks against `packages/shared/handles.ts` so the box can go
 *    red without a round trip; the database enforces `reserved_handles`. Two
 *    lists is how a name gets reserved in one place and registrable in the
 *    other, so this fails loudly the day they drift.
 *
 * 2. THE DATABASE REFUSES WHAT THE CODE REFUSES. Each case is put to
 *    `handle_problem()` — the function the trigger itself calls — rather than
 *    to a re-implementation of the rules in this file, which would prove only
 *    that the file agrees with itself.
 *
 * 3. THE TRIGGER IS ACTUALLY ATTACHED. One real UPDATE, of `everyone`, which
 *    must be refused. It is the one write this script makes and it is a write
 *    that has to fail, so a pass changes nothing; a success is the failure,
 *    and the previous handle is put straight back.
 *
 * 4. `everyone` AND `kai` CANNOT BE REGISTERED. Named explicitly because they
 *    are the two the mention lane depends on.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { RESERVED_HANDLES, checkHandle, foldHandle } from '../../../packages/shared/handles';

const which = process.argv[2] === 'prod' ? '.env.prod' : '.env.local';
const cfg: Record<string, string> = {};
for (const line of readFileSync(new URL(`../${which}`, import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) cfg[m[1]] = m[2].trim();
}
const db = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Case = { handle: string; shouldPass: boolean; why: string };

const CASES: Case[] = [
  { handle: 'everyone', shouldPass: false, why: 'the mention scope @everyone is being built on it' },
  { handle: 'here', shouldPass: false, why: 'mention scope' },
  { handle: 'kai', shouldPass: false, why: 'the assistant' },
  { handle: 'Kai', shouldPass: false, why: 'reservation is case-insensitive' },
  { handle: 'a_d_m_i_n', shouldPass: false, why: 'reservation folds underscores away' },
  { handle: 'Ad_Min', shouldPass: false, why: 'both at once' },
  { handle: 'support', shouldPass: false, why: 'a member must not look like the help desk' },
  { handle: 'cheatcode', shouldPass: false, why: 'the brand' },
  { handle: '9lives', shouldPass: false, why: 'a username starts with a letter' },
  { handle: 'ab', shouldPass: false, why: 'shorter than three' },
  { handle: 'a'.repeat(21), shouldPass: false, why: 'longer than twenty' },
  { handle: 'has space', shouldPass: false, why: 'letters, numbers and underscores only' },
  { handle: 'dot.name', shouldPass: false, why: 'a dot makes @where-does-it-end ambiguous' },
  { handle: 'trail_', shouldPass: false, why: 'no trailing underscore' },
  { handle: 'two__bars', shouldPass: false, why: 'no doubled underscore' },
  { handle: 'marcus_t', shouldPass: true, why: 'an ordinary username' },
  { handle: 'Kway99', shouldPass: true, why: 'digits and capitals are fine' },
];

async function main() {
  console.log(`${which} -> ${cfg.SUPABASE_URL}\n`);
  let failures = 0;

  /* ---- 1. the two lists ------------------------------------------- */
  const { data: rows, error } = await db.from('reserved_handles').select('name');
  if (error) throw new Error(`could not read reserved_handles: ${error.message}`);
  const inDb = new Set((rows ?? []).map((r) => String((r as { name: string }).name)));
  const inCode = new Set(RESERVED_HANDLES.map(foldHandle));

  const missingFromDb = [...inCode].filter((h) => !inDb.has(h));
  const missingFromCode = [...inDb].filter((h) => !inCode.has(h));

  console.log(`reserved words: ${inCode.size} in code, ${inDb.size} in the database`);
  if (missingFromDb.length) {
    failures += 1;
    console.log(`  FAIL  in code but not in the database: ${missingFromDb.join(', ')}`);
  }
  if (missingFromCode.length) {
    // Not a failure. Staff can reserve a name by inserting a row, and the
    // database is the one that enforces it — the code list only makes the
    // phone quicker. It is still worth naming, so nobody is surprised.
    console.log(`  note  reserved in the database only (staff added them): ${missingFromCode.join(', ')}`);
  }
  if (!missingFromDb.length) console.log('  ok    every word the code reserves is reserved in the database');

  /* ---- 2. a profile to borrow ------------------------------------- */
  const { data: anyProfile } = await db.from('profiles').select('user_id,handle').limit(1).maybeSingle();
  const victim = (anyProfile as { user_id: string; handle: string | null } | null) ?? null;
  if (!victim) {
    console.log('\nno profiles in this database — the write probes need one. Stopping here.');
    process.exit(failures ? 1 : 0);
  }

  /* ---- 3. the rule the trigger enforces, asked directly ----------- */
  // `handle_problem()` IS what the trigger runs — it calls this function and
  // raises whatever comes back. So asking it here is asking the enforcement
  // itself, without a write, and nothing can be left renamed by a crash.
  console.log('\nthe database\'s own answer, per case:');
  for (const c of CASES) {
    const shape = checkHandle(c.handle);
    const { data: problem, error: pe } = await db.rpc('handle_problem', { p_handle: c.handle });
    if (pe) throw new Error(`handle_problem failed on "${c.handle}": ${pe.message}`);
    const { data: free } = await db.rpc('handle_available', {
      p_handle: c.handle,
      p_except: victim.user_id,
    });

    const codeOk = shape.ok;
    const dbOk = problem === null;
    const agree = codeOk === dbOk;
    const right = dbOk === c.shouldPass;

    if (!agree || !right) failures += 1;
    console.log(
      `  ${right && agree ? 'ok   ' : 'FAIL '} ${c.handle.padEnd(22)} ` +
        `code=${codeOk ? 'accept' : 'refuse'} db=${dbOk ? 'accept' : 'refuse'} ` +
        `free=${free === true ? 'y' : 'n'}  (${c.why})` +
        (problem ? `\n           database said: ${problem}` : '')
    );
  }

  /* ---- 4. one real write, to prove the trigger is actually on ----- */
  // Everything above trusts that the trigger calls `handle_problem`. This is
  // the one case that does not: a genuine UPDATE of a reserved name, which
  // must be refused. It is a write that MUST fail, so nothing is changed by
  // it whether the trigger is there or not — and if it succeeds, that is the
  // failure, and the script says so loudly enough to be fixed at once.
  const { error: writeError } = await db
    .from('profiles')
    .update({ handle: 'everyone' })
    .eq('user_id', victim.user_id);
  if (writeError) {
    console.log(`\n  ok    a real UPDATE to "everyone" was refused: ${writeError.message}`);
  } else {
    failures += 1;
    console.log('\n  FAIL  a real UPDATE to "everyone" SUCCEEDED — the trigger is not attached.');
    await db.from('profiles').update({ handle: victim.handle }).eq('user_id', victim.user_id);
    console.log(`        put ${victim.handle ?? 'null'} back.`);
  }

  console.log(failures ? `\n${failures} problem(s).` : '\nEverything agrees.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
