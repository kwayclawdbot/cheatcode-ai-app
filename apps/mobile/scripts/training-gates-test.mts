/**
 * THE SEVEN-DAY GATES, CHECKED WITHOUT A BROWSER.
 *
 * `src/features/training/gates.ts` decides which day a member is allowed into
 * and which lesson inside it. Those are the rules most likely to be adjusted
 * later and the ones whose failure is quietest — a gate that opens too early
 * hands a beginner a stop-loss lesson, and nothing on screen looks wrong. So
 * they are pure functions with no React in them, and this is what checks them.
 *
 * The one piece of machinery below: `curriculum.ts` `require()`s the day
 * thumbnails, which Metro understands and Node does not. Registering a loader
 * for .jpg/.png that returns a number is exactly what the bundler does, and it
 * lets the real curriculum data be imported here rather than a copy of it.
 */
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
for (const ext of ['.jpg', '.png']) {
  (req.extensions as Record<string, unknown>)[ext] = (m: { exports: unknown }) => {
    m.exports = 1;
  };
}

const { TRAINING_DAYS, TRAINING_LESSON_NODES, DEFAULT_TRAINING_PROFILE, lessonsForDay } =
  await import('../src/features/training/curriculum.ts');
const { evaluateDayGate, isDayUnlocked, isLessonUnlocked, nextOpenLessonId, dayState } =
  await import('../src/features/training/gates.ts');

type Profile = typeof DEFAULT_TRAINING_PROFILE;

let failures = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
};
const head = (s: string) => console.log(`\n${s}\n${'-'.repeat(s.length)}`);

const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p)) as Profile;

console.log('training gates');

head('The curriculum is the spec’s curriculum');
ok('seven days', TRAINING_DAYS.length === 7);
ok(
  'numbered 1 to 7 in order',
  TRAINING_DAYS.every((d, i) => d.index === i + 1),
);
ok(
  'the minute budget is the spec’s: 30/40/45/50/40/60/60',
  TRAINING_DAYS.map((d) => d.minutes).join('/') === '30/40/45/50/40/60/60',
);
ok(
  'and every day’s lessons add up to that day’s budget',
  TRAINING_DAYS.every(
    (d) => lessonsForDay(d.id).reduce((n, l) => n + l.minutes, 0) === d.minutes,
  ),
  TRAINING_DAYS.filter(
    (d) => lessonsForDay(d.id).reduce((n, l) => n + l.minutes, 0) !== d.minutes,
  ).map((d) => d.id).join(', '),
);
ok(
  'every lesson id a day names actually exists',
  TRAINING_DAYS.every((d) => d.lessonIds.every((id) => TRAINING_LESSON_NODES.some((n) => n.id === id))),
);
ok(
  'exactly one lesson is written',
  TRAINING_LESSON_NODES.filter((n) => n.hasContent).length === 1,
);
ok(
  'and it is Day 1 Lesson 1',
  TRAINING_LESSON_NODES.find((n) => n.hasContent)?.id === 'd1l1',
);

head('Day 2 carries the spec’s three thresholds');
const day2 = TRAINING_DAYS[1];
ok('Trend at 80', day2.gate.requirements.some((r) => r.skill === 'trend' && r.minPct === 80));
ok('Structure at 75', day2.gate.requirements.some((r) => r.skill === 'market_structure' && r.minPct === 75));
ok('Levels at 70', day2.gate.requirements.some((r) => r.skill === 'support_resistance' && r.minPct === 70));

head('A brand new learner');
const fresh = DEFAULT_TRAINING_PROFILE;
ok('has completed nothing', fresh.completedLessonIds.length === 0);
ok('has zero mastery everywhere', Object.values(fresh.mastery).every((v) => v === 0));
ok('has no competency signals', Object.keys(fresh.competencies).length === 0);
ok('is standing in Day 1', dayState(fresh, 'day-1') === 'active');
ok('and Day 2 is shut', !isDayUnlocked(fresh, 'day-2'));
ok('Lesson 1 of Day 1 is open', isLessonUnlocked(fresh, 'd1l1'));
ok('Lesson 2 is not, because Lesson 1 is not done', !isLessonUnlocked(fresh, 'd1l2'));
ok('and the first thing to open is d1l1', nextOpenLessonId(fresh) === 'd1l1');

head('After finishing Day 1 Lesson 1 at 100%');
const afterL1 = clone(fresh);
afterL1.completedLessonIds = ['d1l1'];
afterL1.mastery.market_basics = 100;
afterL1.dayProgress = { 'day-1': { completedLessonIds: ['d1l1'], bestScorePct: 100 } };
ok('Lesson 2 opens', isLessonUnlocked(afterL1, 'd1l2'));
ok('Lesson 3 does not', !isLessonUnlocked(afterL1, 'd1l3'));
ok(
  'Day 2 is STILL shut — one lesson is not a day',
  !isDayUnlocked(afterL1, 'day-2'),
);
ok(
  'and the gate says exactly why: the day is not finished',
  evaluateDayGate(afterL1, 'day-1').lessonsComplete === false,
);

head('After finishing all of Day 1');
const day1Done = clone(afterL1);
day1Done.completedLessonIds = [...TRAINING_DAYS[0].lessonIds];
day1Done.dayProgress = {
  'day-1': { completedLessonIds: [...TRAINING_DAYS[0].lessonIds], bestScorePct: 82 },
};
ok('the Day 1 gate passes', evaluateDayGate(day1Done, 'day-1').passed);
ok('Day 2 opens', isDayUnlocked(day1Done, 'day-2'));
ok('Day 3 stays shut', !isDayUnlocked(day1Done, 'day-3'));
ok('and the next thing to open is the first lesson of Day 2', nextOpenLessonId(day1Done) === 'd2l1');

head('A day finished BADLY does not open the next one');
const day1Weak = clone(day1Done);
day1Weak.dayProgress['day-1'].bestScorePct = 61; // under the spec's 70
ok('the gate fails', !evaluateDayGate(day1Weak, 'day-1').passed);
ok('on the score, and says so', evaluateDayGate(day1Weak, 'day-1').score.met === false);
ok('Day 2 is shut again', !isDayUnlocked(day1Weak, 'day-2'));

head('A skill floor is enough to hold a day shut on its own');
const day1NoMastery = clone(day1Done);
day1NoMastery.mastery.market_basics = 40;
ok('score is fine', evaluateDayGate(day1NoMastery, 'day-1').score.met);
ok('but the requirement is not', evaluateDayGate(day1NoMastery, 'day-1').requirements.some((r) => !r.met));
ok('so the day does not pass', !evaluateDayGate(day1NoMastery, 'day-1').passed);

head('Day 1 Lesson 1 cannot reach the “not built yet” panel');
const { LESSON_CONTENT } = await import('../src/features/training/curriculum.ts');
const { IMPLEMENTED_SCREEN_TYPES } = await import('../src/features/training/types.ts');
const l1 = LESSON_CONTENT.d1l1;
const implemented = new Set<string>(IMPLEMENTED_SCREEN_TYPES as readonly string[]);
const used = l1.screens.map((s) => s.type);
ok('the canonical lesson is thirteen beats plus a completion', l1.screens.length === 14);
ok('it ends on the completion screen', used[used.length - 1] === 'completion');
ok(
  'and every screen it uses has a renderer',
  used.every((t) => implemented.has(t)),
  used.filter((t) => !implemented.has(t)).join(', '),
);
ok(
  'it exercises every implemented screen type at least once',
  [...implemented].every((t) => used.includes(t as (typeof used)[number])),
  [...implemented].filter((t) => !used.includes(t as (typeof used)[number])).join(', '),
);
ok(
  'every quiz names a correct option that exists',
  l1.screens
    .filter((s): s is Extract<typeof s, { type: 'quiz' }> => s.type === 'quiz')
    .every((s) => s.options.some((o) => o.id === s.correctId)),
);
ok(
  'so does every mastery question',
  l1.screens
    .filter((s): s is Extract<typeof s, { type: 'mastery_challenge' }> => s.type === 'mastery_challenge')
    .every((s) => s.questions.every((q) => q.options.some((o) => o.id === q.correctId))),
);
ok(
  'the human video is marked as being filmed, not as playable',
  l1.screens.every((s) => s.type !== 'video' || s.status === 'filming'),
);
ok(
  'and the auction book carries no invented ticker',
  l1.screens.every((s) => s.type !== 'auction' || s.symbol === undefined),
);

head('An unknown id is never quietly unlocked');
ok('no such day', !isDayUnlocked(fresh, 'day-99'));
ok('no such lesson', !isLessonUnlocked(fresh, 'nope'));

console.log(failures ? `\ntraining gates FAILED (${failures})` : '\ntraining gates OK');
process.exit(failures ? 1 : 0);
