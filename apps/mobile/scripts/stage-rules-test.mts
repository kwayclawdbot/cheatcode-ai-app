/**
 * THE EVIDENCE PATH IS GONE — and this is what stops it coming back.
 *
 *   npx tsx scripts/stage-rules-test.mts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TEST USED TO BE
 * ─────────────────────────────────────────────────────────────────────────────
 * A MIRROR TEST. A member's readiness stage (0042) was decided on the server
 * from evidence the phone reported — per-skill mastery and per-day scores —
 * because training progress lived only in AsyncStorage and a client that simply
 * announced "I graduated" would have made the whole ladder self-serve. The cost
 * of that decision was a DUPLICATED TABLE: `DAY_GATES` in
 * `apps/api/src/lib/stage/rules.ts` was a copy of the Day 2 and Day 7 gates in
 * `apps/mobile/src/features/training/curriculum.ts`. This file read both and
 * failed when they disagreed, because that drift would have been silent and
 * nasty: the app showing a member passing Day 2 while the server declined to
 * promote them, with a tag that never changed as the only symptom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS NOW THE OPPOSITE TEST
 * ─────────────────────────────────────────────────────────────────────────────
 * Training progress moved to the server (0046) and the belt became the measured
 * ladder (0047 §7), so stage DERIVES from the belt — `stage_for_belt()` is the
 * table, `sync_stage_from_belt()` is the write, `grade_belt_exam` is the caller.
 * BELT-MERGE-spec.md §9: the product does not carry the same ladder twice.
 *
 * That makes the evidence path not merely redundant but wrong — it graded a
 * body of self-reported numbers against a second copy of the gates, and the
 * local training profile it read from was the contaminated one (one AsyncStorage
 * key with no account id, audit F10). `stageFromEvidence`, `DAY_GATES`,
 * `evaluateGate`, `decideStage`, `rankOf` and `POST /api/v1/stage/evaluate` are
 * all removed.
 *
 * THE COVERAGE IS NOT DELETED, IT IS INVERTED. Deleting this file would have
 * left nothing saying the ladder is single, and the cheapest way to reintroduce
 * a second one is for somebody to restore a helper that "was there before". So
 * this now asserts the retirement: the symbols are gone, the route is gone, the
 * belt→stage table is the only ladder, and the one thing that legitimately
 * survived — `START_PLACEMENT`, the self-reported first rung — still agrees with
 * the three chats (0045).
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

// `curriculum.ts` `require()`s the day thumbnails, which Metro understands and
// Node does not. Registering a loader that returns a number is what the bundler
// does. Kept from the mirror test: the curriculum is still imported below, to
// prove it no longer needs a twin rather than to compare it against one.
const req = createRequire(import.meta.url);
for (const ext of ['.jpg', '.png']) {
  (req.extensions as Record<string, unknown>)[ext] = (m: { exports: unknown }) => {
    m.exports = 1;
  };
}

const failures: string[] = [];
const note = (ok: boolean, msg: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const rules = (await import('../../api/src/lib/stage/rules.ts')) as Record<string, unknown>;

console.log('\nThe evidence path is retired, not merely unused');

for (const gone of ['DAY_GATES', 'evaluateGate', 'stageFromEvidence', 'decideStage', 'rankOf']) {
  note(!(gone in rules), `lib/stage/rules.ts no longer exports ${gone}`);
}

const routeDir = resolve(repo, 'apps/api/src/app/api/v1/stage');
note(!existsSync(routeDir), 'POST /api/v1/stage/evaluate no longer exists');

/*
 * The retirement has to be ARGUED where the next reader lands, not just
 * performed. This codebase does not delete reasoning silently, and a reader who
 * finds a stage helper missing needs the paragraph that says the belt took over
 * or they will write it again.
 */
const rulesSrc = readFileSync(resolve(repo, 'apps/api/src/lib/stage/rules.ts'), 'utf8');
note(
  /sync_stage_from_belt/.test(rulesSrc) && /0047/.test(rulesSrc),
  'lib/stage/rules.ts points the reader at sync_stage_from_belt (0047 §7)'
);

console.log('\nThere is exactly one ladder, and it is the belt');

const migration = resolve(repo, 'supabase/migrations/0047_the_belt_is_earned_by_passing_a_test.sql');
note(existsSync(migration), '0047 is present');
const sql = existsSync(migration) ? readFileSync(migration, 'utf8') : '';
note(/create or replace function stage_for_belt/.test(sql), '0047 defines stage_for_belt()');
note(/create or replace function sync_stage_from_belt/.test(sql), '0047 defines sync_stage_from_belt()');

/*
 * The ratchet is the single most important rule on this ladder — automatic
 * evolution promotes only — and it moved from TypeScript into SQL rather than
 * being dropped. Its four outcomes are the proof it arrived intact.
 */
for (const reason of ['locked', 'promoted', 'unchanged', 'no_downgrade']) {
  note(sql.includes(`'${reason}'`), `the ratchet still reports '${reason}'`);
}

console.log('\nThe self-reported first rung survived, and still means the three chats');

const placement = rules.START_PLACEMENT as
  | Record<string, { stage: string; mode: string; room: string }>
  | undefined;
note(Boolean(placement), 'START_PLACEMENT is still exported (onboarding needs it)');

if (placement) {
  const answers = ['brand_new', 'investor', 'swing', 'active'];
  for (const a of answers) note(Boolean(placement[a]), `START_PLACEMENT covers "${a}"`);

  // 0045 merged the desks into three chats. Only `beginners` and `traders` are
  // reachable from onboarding; a placement naming a per-desk slug is the old
  // room map coming back.
  const rooms = new Set(Object.values(placement).map((p) => p.room));
  note(
    [...rooms].every((r) => r === 'beginners' || r === 'traders'),
    `every placement room is one of the three chats (${[...rooms].sort().join(', ')})`
  );
  note(
    placement.swing?.room === 'traders' && placement.active?.room === 'traders',
    'swing and active traders read the same chat'
  );
  note(
    placement.investor?.stage === 'beginner',
    'an investor is placed at beginner — this ladder measures trade readiness'
  );
}

console.log('\nThe curriculum no longer needs a twin on the server');

const { TRAINING_DAYS } = await import('../src/features/training/curriculum.ts');
note(Array.isArray(TRAINING_DAYS) && TRAINING_DAYS.length > 0, 'the curriculum still loads');

const apiCurriculum = resolve(repo, 'apps/api/src/lib/training/curriculum.ts');
note(
  existsSync(apiCurriculum),
  'the server has its own training curriculum (0046) — the gates it grades are rows, not a reported body'
);

console.log(failures.length ? `\n${failures.length} failure(s).\n` : '\nAll good.\n');
process.exit(failures.length ? 1 : 0);
