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

/**
 * A lesson walked properly: taught, watched, drilled, and the assessment
 * passed. `xp.ts` is the authority on what that is worth.
 */
const fullRun = { interactive: 10, video: 10, practice: 20, assessment: 30 };
/** The farm: the video played, nothing else happened. */
const watchedOnly = { interactive: 0, video: 10, practice: 0, assessment: 0 };

head('After finishing all of Day 1');
const day1Done = clone(afterL1);
day1Done.completedLessonIds = [...TRAINING_DAYS[0].lessonIds];
day1Done.dayProgress = {
  'day-1': {
    completedLessonIds: [...TRAINING_DAYS[0].lessonIds],
    bestScorePct: 82,
    lessonXp: { d1l1: { ...fullRun } },
  },
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

/* ═══════════════════ XP, AND THE RULE THAT VIDEOS CANNOT BUY A BELT ═══════ */

const { XP_AWARD, competencyEarned, isVideoOnly, ledgerForScreens, bestOfEach, totalXp } =
  await import('../src/features/training/xp.ts');
const { dayXp, totalXpPoints } = await import('../src/features/training/gates.ts');

head('The XP awards are the spec’s numbers');
ok('interactive is 10', XP_AWARD.interactive === 10);
ok('video is 10', XP_AWARD.video === 10);
ok('Kai practice is 20', XP_AWARD.practice === 20);
ok('assessment passed is 30', XP_AWARD.assessment === 30);
ok(
  'and watching is never worth more than doing',
  XP_AWARD.video < XP_AWARD.practice && XP_AWARD.video < XP_AWARD.assessment,
);

head('VIDEO XP ALONE CANNOT SATISFY A COMPETENCY — the anti-farming rule');
ok('a video and nothing else earns no competency', !competencyEarned(watchedOnly));
ok('and is recognised as video-only', isVideoOnly(watchedOnly));
ok(
  'TEN videos and nothing else still earn no competency',
  !competencyEarned({ interactive: 0, video: 100, practice: 0, assessment: 0 }),
);
ok(
  'a full day of teaching and drills, assessment skipped, earns no competency',
  !competencyEarned({ interactive: 10, video: 10, practice: 20, assessment: 0 }),
);
ok(
  'even 60 XP of teaching and practice does not clear it',
  totalXp({ interactive: 10, video: 10, practice: 20, assessment: 0 }) === 40 &&
    !competencyEarned({ interactive: 10, video: 10, practice: 20, assessment: 0 }),
);
ok('the passed assessment is what earns it', competencyEarned(fullRun));
ok(
  'and an assessment ALONE earns it — the measurement is the load-bearing part',
  competencyEarned({ interactive: 0, video: 0, practice: 0, assessment: 30 }),
);

head('A lesson only banks what it actually did');
const lessonScreens = ['opening', 'concept', 'quiz', 'video', 'kai_check', 'mastery_challenge', 'completion'] as const;
const passed = ledgerForScreens(lessonScreens, true);
const failed = ledgerForScreens(lessonScreens, false);
ok('a passed run banks all four kinds', totalXp(passed) === 70);
ok('a failed run banks the same work…', failed.interactive === 10 && failed.video === 10 && failed.practice === 20);
ok('…but no assessment XP', failed.assessment === 0);
ok('so a failed run satisfies nothing', !competencyEarned(failed));
ok(
  'a lesson with no assessment screen banks none either',
  ledgerForScreens(['opening', 'concept', 'video', 'completion'], true).assessment === 0,
);
ok(
  'each kind is paid once, however many screens of it there are',
  ledgerForScreens(['concept', 'concept', 'concept', 'quiz', 'quiz'], false).interactive === 10,
);
ok(
  'the completion screen itself is worth nothing',
  totalXp(ledgerForScreens(['completion'], true)) === 0,
);
ok(
  'a video-only lesson produces exactly the farm case',
  isVideoOnly(ledgerForScreens(['video'], false)),
);

head('Replaying a lesson does not pay twice');
ok(
  'a second walk banks no extra video XP',
  bestOfEach(fullRun, fullRun).video === XP_AWARD.video,
);
ok(
  'but passing the assessment on the retry DOES get picked up',
  bestOfEach(failed, passed).assessment === XP_AWARD.assessment,
);
ok(
  'and a worse retry never takes XP away',
  bestOfEach(passed, failed).assessment === XP_AWARD.assessment,
);

head('THE GATE ENFORCES IT — a day of watching does not open the next day');
const farmer = clone(day1Done);
// Every lesson finished, a good score on the board, and the whole day watched.
farmer.dayProgress['day-1'].lessonXp = { d1l1: { ...watchedOnly } };
ok('the lessons are all complete', evaluateDayGate(farmer, 'day-1').lessonsComplete);
ok('the score floor is met', evaluateDayGate(farmer, 'day-1').score.met);
ok('every skill floor is met', evaluateDayGate(farmer, 'day-1').requirements.every((r) => r.met));
ok(
  'and the day STILL does not pass, because nothing was assessed',
  !evaluateDayGate(farmer, 'day-1').passed,
);
ok(
  'the gate names the reason rather than locking silently',
  evaluateDayGate(farmer, 'day-1').assessment.met === false,
);
ok('so Day 2 stays shut', !isDayUnlocked(farmer, 'day-2'));
ok(
  'and the day it did earn is reported honestly: 10 XP, all of it video',
  dayXp(farmer, 'day-1').video === 10 && totalXpPoints(farmer) === 10,
);

head('The same member, having passed the assessment');
ok('the assessment requirement is met', evaluateDayGate(day1Done, 'day-1').assessment.met);
ok('the day passes', evaluateDayGate(day1Done, 'day-1').passed);
ok('Day 2 opens', isDayUnlocked(day1Done, 'day-2'));
ok('and the XP total reflects the real work', totalXpPoints(day1Done) === 70);

head('A profile written before the ledger existed is not credited with XP');
const legacy = clone(day1Done);
delete (legacy.dayProgress['day-1'] as { lessonXp?: unknown }).lessonXp;
ok('its day XP reads as zero', totalXp(dayXp(legacy, 'day-1')) === 0);
ok('the gate does not pass on missing evidence', !evaluateDayGate(legacy, 'day-1').passed);

head('Curated videos are honest by construction');
const videoScreens = l1.screens.filter(
  (s): s is Extract<typeof s, { type: 'video' }> => s.type === 'video',
);
ok(
  'a curated screen always carries its assignment',
  videoScreens.every((s) => s.status !== 'curated' || s.curated !== undefined),
);
ok(
  'and a non-curated screen never does',
  videoScreens.every((s) => s.status === 'curated' || s.curated === undefined),
);
ok(
  'every curated pick names the matrix row it came from',
  videoScreens.every((s) => !s.curated || s.curated.matrix_row.length > 0),
);
ok(
  'every curated pick carries a Kai normalization note',
  videoScreens.every((s) => !s.curated || s.curated.kai_normalization.length > 0),
);
ok(
  'and no external video is live without the owner approving it',
  videoScreens.every((s) => !s.curated || s.curated.owner_approved === false),
  'an approved pick is in the content files — confirm that was a person’s decision',
);

head('An unknown id is never quietly unlocked');
ok('no such day', !isDayUnlocked(fresh, 'day-99'));
ok('no such lesson', !isLessonUnlocked(fresh, 'nope'));

console.log(failures ? `\ntraining gates FAILED (${failures})` : '\ntraining gates OK');
process.exit(failures ? 1 : 0);
