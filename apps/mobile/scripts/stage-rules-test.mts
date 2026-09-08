/**
 * THE MIRROR TEST — the server's stage gates must equal the training lane's.
 *
 *   npx tsx scripts/stage-rules-test.mts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's readiness stage (0042) is decided on the SERVER, from evidence the
 * phone reports, because training progress lives only in AsyncStorage and a
 * client that simply announced "I graduated" would make the whole ladder
 * self-serve. The full argument is in `apps/api/src/lib/stage/rules.ts`.
 *
 * The cost of that decision is a DUPLICATED TABLE: `DAY_GATES` on the server is
 * a copy of the Day 2 and Day 7 gates in
 * `apps/mobile/src/features/training/curriculum.ts`. Duplicated numbers drift,
 * and this particular drift would be silent and nasty — the app would show a
 * member passing Day 2 while the server declined to promote them, and the only
 * symptom would be a tag that never changes.
 *
 * So this reads BOTH and fails if they disagree. It does not check that the
 * numbers are RIGHT — the curriculum owns that, and the training lane may
 * change them freely. It checks that exactly one file has an opinion.
 *
 * NOT YET IN `npm test`. That script is being edited by the training lane in
 * the same working tree and currently names a file they have not committed, so
 * adding a line to it here would commit their half-done change too. Wire this
 * in — one entry alongside `training-gates-test.mts` — once that lands.
 */
import { createRequire } from 'node:module';

// `curriculum.ts` `require()`s the day thumbnails, which Metro understands and
// Node does not. Registering a loader that returns a number is what the bundler
// does, and it lets the REAL curriculum be imported here rather than a copy of
// it — which matters more here than anywhere, since a copy is the exact thing
// this test exists to catch. Lifted from `training-gates-test.mts`.
const req = createRequire(import.meta.url);
for (const ext of ['.jpg', '.png']) {
  (req.extensions as Record<string, unknown>)[ext] = (m: { exports: unknown }) => {
    m.exports = 1;
  };
}

const { TRAINING_DAYS } = await import('../src/features/training/curriculum.ts');
const { DAY_GATES } = await import('../../api/src/lib/stage/rules.ts');

const failures: string[] = [];
const note = (ok: boolean, msg: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

console.log('\nThe server grades training with the curriculum\'s own numbers');

for (const dayId of Object.keys(DAY_GATES) as (keyof typeof DAY_GATES)[]) {
  const mirrored = DAY_GATES[dayId];
  const source = TRAINING_DAYS.find((d) => d.id === dayId);

  if (!source) {
    note(false, `${dayId} is graded by the server but no longer exists in the curriculum`);
    continue;
  }

  note(
    source.gate.minScorePct === mirrored.minScorePct,
    `${dayId} pass mark agrees (curriculum ${source.gate.minScorePct}, server ${mirrored.minScorePct})`
  );

  const srcLessons = [...source.lessonIds].sort().join(',');
  const mirLessons = [...mirrored.lessonIds].sort().join(',');
  note(
    srcLessons === mirLessons,
    `${dayId} lesson list agrees (${source.lessonIds.length} lessons)`
  );

  const srcReqs = source.gate.requirements
    .map((r) => `${r.skill}:${r.minPct}`)
    .sort()
    .join(',');
  const mirReqs = mirrored.requirements
    .map((r) => `${r.skill}:${r.minPct}`)
    .sort()
    .join(',');
  note(
    srcReqs === mirReqs,
    `${dayId} skill floors agree (${srcReqs || 'none'})`
  );
}

/*
 * The two gates the funnel actually hangs on. If the curriculum ever renames a
 * day, the loop above passes vacuously — it only walks days the SERVER knows —
 * so name them here as well.
 */
console.log('\nThe two days that move a stage still exist');
for (const dayId of ['day-2', 'day-7']) {
  note(
    TRAINING_DAYS.some((d) => d.id === dayId),
    `${dayId} is in the curriculum`
  );
  note(dayId in DAY_GATES, `${dayId} is graded by the server`);
}

console.log(failures.length ? `\n${failures.length} failure(s).\n` : '\nAll good.\n');
process.exit(failures.length ? 1 : 0);
