/**
 * THE BELT MERGE, CHECKED WITHOUT A DATABASE.
 *
 *   cd apps/api && npx tsx scripts/belt-merge-test.ts
 *
 * The owner's decision — "merge belt system so that user gains belt xp via
 * lessons and/or trade calls but has to take and pass a test to earn the belt
 * itself" — turns into four claims that must keep being true, and every one of
 * them fails quietly if it stops:
 *
 *   1. LESSONS CANNOT BE FARMED. A phone reports what a lesson run produced,
 *      and the server decides what that report is allowed to be worth. If
 *      `sanitiseLedger` ever starts believing the body, thirty lessons is a
 *      Blue Belt and nothing on any screen looks wrong.
 *   2. THE ANSWER KEY NEVER LEAVES THE DATABASE. `paperForClient` is an
 *      allow-list, and the day it becomes a delete-list is the day a new
 *      blueprint field ships the answers to the phone.
 *   3. THE SERVER'S COPY OF THE CURRICULUM IS THE APP'S CURRICULUM. The two
 *      files are a mirror, mirrors drift, and this is what holds it straight —
 *      the same arrangement `lib/stage/rules.ts` has with the mobile lane.
 *   4. THE MIGRATIONS STILL HOLD THE POSTURE THEY ARGUED FOR. A `revoke` that
 *      gets dropped in a later edit is invisible until somebody's phone grants
 *      itself a Black Belt, so the postures are asserted here as text.
 *
 * Everything below is pure — no database, no network, no clock.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LESSON_INDEX } from '../src/lib/training/curriculum.ts';
import { paperForClient, examPlain } from '../src/lib/training/exam.ts';
import { progressToEligible, parseEligibility } from '../src/lib/training/eligibility.ts';
import {
  XP_AWARD,
  competencyEarned,
  emptyLedger,
  isVideoOnly,
  sanitiseLedger,
  totalXp,
} from '../src/lib/training/xp.ts';
import { BELT_EXAM_PLAIN } from '../src/lib/social/belts.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ═══════════════════════════════════════════════════════════════════════ */

section('The four award sizes are the ones the app already ships');

ok('interactive is 10', XP_AWARD.interactive === 10);
ok('video is 10', XP_AWARD.video === 10);
ok('practice is 20', XP_AWARD.practice === 20);
ok('a passed assessment is 30', XP_AWARD.assessment === 30);
ok(
  'and watching is never worth more than doing',
  XP_AWARD.video < XP_AWARD.practice && XP_AWARD.video < XP_AWARD.assessment
);

section('THE ANTI-FARMING RULE SURVIVED THE MOVE TO THE SERVER');

// These five are `training-gates-test.mts` asserted against the server copy.
// If the two files ever answer differently, one of them is grading a belt.
ok('a video and nothing else earns no competency', !competencyEarned({ interactive: 0, video: 10, practice: 0, assessment: 0 }));
ok('ten videos still earn none', !competencyEarned({ interactive: 0, video: 100, practice: 0, assessment: 0 }));
ok(
  'a full day of teaching and drills with the assessment skipped earns none',
  !competencyEarned({ interactive: 10, video: 10, practice: 20, assessment: 0 })
);
ok('the passed assessment is what earns it', competencyEarned({ interactive: 10, video: 10, practice: 20, assessment: 30 }));
ok('an assessment alone earns it — the measurement is the load-bearing part', competencyEarned({ interactive: 0, video: 0, practice: 0, assessment: 30 }));
ok('and the video-only shape is still named', isVideoOnly({ interactive: 0, video: 10, practice: 0, assessment: 0 }));

section('A REPORTED RUN IS WORTH WHAT THE CONFIG SAYS, NEVER WHAT THE BODY SAYS');

const inflated = sanitiseLedger(
  { interactive: 4000, video: 9999, practice: 100000, assessment: 500 },
  true
);
ok('an inflated interactive claim is clamped to 10', inflated.interactive === 10);
ok('an inflated video claim is clamped to 10', inflated.video === 10);
ok('an inflated practice claim is clamped to 20', inflated.practice === 20);
ok('an inflated assessment claim is clamped to 30', inflated.assessment === 30);
ok('so the most one lesson can ever pay is 70', totalXp(inflated) === 70);

const cheated = sanitiseLedger({ interactive: 10, video: 10, practice: 20, assessment: 30 }, false);
ok('assessment XP claimed WITHOUT passing is refused', cheated.assessment === 0);
ok('and the rest of that run is still paid', totalXp(cheated) === 40);
ok('which satisfies no competency', !competencyEarned(cheated));

ok('a run that reports nothing is worth nothing', totalXp(sanitiseLedger({}, true)) === 0);
ok('a run that reports null is worth nothing', totalXp(sanitiseLedger(null, true)) === 0);
ok('a negative claim is worth nothing', sanitiseLedger({ practice: -50 }, true).practice === 0);
ok('a non-numeric claim is worth nothing', sanitiseLedger({ video: 'lots' as unknown as number }, true).video === 0);
ok('the empty ledger is all zeroes', totalXp(emptyLedger()) === 0);

section('THE SERVER KNOWS THE PROGRAMME, AND NOTHING ELSE COUNTS AS A LESSON');

ok('thirty-one lesson nodes', LESSON_INDEX.size === 31);
ok('d1l1 is Day 1, market basics', LESSON_INDEX.get('d1l1')?.dayId === 'day-1' && LESSON_INDEX.get('d1l1')?.skill === 'market_basics');
ok('an invented lesson id is not in the index', LESSON_INDEX.get('free-money') === undefined);
ok('and neither is an empty one', LESSON_INDEX.get('') === undefined);

// THE MIRROR TEST. `apps/mobile/src/features/training/curriculum.ts` is the
// curriculum; this reads it as text (it `require()`s image assets, which Node
// will not do) and checks the server's index against it triple by triple.
const mobileCurriculum = readFileSync(
  path.join(REPO, 'apps/mobile/src/features/training/curriculum.ts'),
  'utf8'
);
const nodeRe = /\{\s*id: '([a-z0-9]+)',\s*dayId: '([a-z0-9-]+)',[\s\S]*?skill: '([a-z_]+)',/g;
const appNodes = new Map<string, { dayId: string; skill: string }>();
for (const m of mobileCurriculum.matchAll(nodeRe)) {
  appNodes.set(m[1], { dayId: m[2], skill: m[3] });
}
ok('the app curriculum was readable', appNodes.size > 0, appNodes.size);
ok('the server index has exactly the app’s lessons', appNodes.size === LESSON_INDEX.size, {
  app: appNodes.size,
  server: LESSON_INDEX.size,
});
const drift: string[] = [];
for (const [id, node] of appNodes) {
  const mine = LESSON_INDEX.get(id);
  if (!mine) drift.push(`${id}: missing on the server`);
  else if (mine.dayId !== node.dayId) drift.push(`${id}: day ${mine.dayId} vs ${node.dayId}`);
  else if (mine.skill !== node.skill) drift.push(`${id}: skill ${mine.skill} vs ${node.skill}`);
}
ok('and every day and skill agrees', drift.length === 0, drift);

section('THE PAPER LEAVES WITHOUT ITS ANSWERS');

const storedPaper = {
  belt: 'blue',
  version: 1,
  pass_pct: 80,
  series_label: 'EXAMPLE SERIES · NOT A LIVE MARKET · NO REAL COMPANY',
  series: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5 }],
  knowledge: [
    {
      id: 'k1',
      prompt: 'What is a share?',
      options: [
        { id: 'a', label: 'A loan' },
        { id: 'b', label: 'Part of a business' },
      ],
      correct_id: 'b',
      because: 'A share is a part of a business.',
    },
  ],
  applied: [
    {
      id: 'a1',
      kind: 'level_choice',
      level: 'stop',
      prompt: 'Put the stop where the idea is wrong.',
      direction: 'long',
      entry: 104.2,
      target: 108,
      options: [
        { id: 'o1', value: 104.05, label: '104.05' },
        { id: 'o2', value: 102.35, label: '102.35' },
      ],
      expected: 'o2',
      because: 'Below the pullback low the structure has broken.',
    },
  ],
  applied_draw: 2,
};

const served = paperForClient(storedPaper);
ok('a stored paper is servable', served !== null);
const wire = JSON.stringify(served);
ok('the served paper carries no correct_id', !wire.includes('correct_id'));
ok('it carries no expected answer', !wire.includes('expected'));
ok('it carries no explanation to work backwards from', !wire.includes('because'));
ok('it still carries the question', wire.includes('What is a share?'));
ok('it still carries the applied task', wire.includes('Put the stop where the idea is wrong.'));
ok('and it still admits the chart is an example', served?.series_label.includes('NOT A LIVE MARKET') === true);
ok('rubbish in is null out, never a half paper', paperForClient(null) === null && paperForClient('nope') === null);

section('THE RING FILLS TO ELIGIBLE AND NOT TO A BELT');

const eligibility = parseEligibility({
  belt: 'white',
  belt_source: 'legacy_points',
  xp_calls: 12,
  xp_training: 70,
  calls_resolved: 1,
  clean_paper_plans: 0,
  may_convert_legacy: false,
  next: {
    key: 'blue',
    label: 'Blue',
    title: 'Foundations',
    proposed: false,
    eligible: false,
    exam_written: true,
    may_sit: false,
    attempts_30d: 0,
    attempts_cap: 3,
    cooldown_until: null,
    exam: { version: 1, pass_pct: 80, questions: 10, applied: 2 },
    checks: [
      { kind: 'competency', key: 'read_a_chart', label: 'Read a chart', have: 'passed', met: true, taught_by: 'd2challenge' },
      { kind: 'competency', key: 'explain_your_risk', label: 'Explain your risk', have: 'passed', met: true, taught_by: 'd4l2' },
      { kind: 'applied', label: 'Complete a clean paper plan', have: 0, need: 1, met: false },
      { kind: 'calls_resolved', label: 'Calls resolved', have: 1, need: 3, met: false },
    ],
  },
});
ok('an eligibility payload parses', eligibility !== null);
ok('four checks, exactly as Board 09 prints', eligibility?.next?.checks.length === 4);
ok('two of four met reads as half a ring', progressToEligible(eligibility?.next ?? null) === 0.5);
ok('and half a ring is NOT eligible', eligibility?.next?.eligible === false);
ok('nor may they sit', eligibility?.next?.may_sit === false);
ok('a member at Black has no ring at all rather than a full one', progressToEligible(null) === null);
ok(
  'training XP alone does not make somebody eligible',
  eligibility !== null && eligibility.xp_training === 70 && eligibility.next?.eligible === false
);

section('WHAT THE APP SAYS ABOUT A RESULT');

const failedChart = examPlain({
  passed: false, score_pct: 86, pass_pct: 80, applied_correct: 1, applied_total: 2, belt_label: 'Blue',
});
ok('a good mark with a fluffed chart does not read as a pass', !failedChart.toLowerCase().includes('you passed'));
ok('and it names the chart half as the reason', failedChart.includes('chart'));
const passedPlain = examPlain({
  passed: true, score_pct: 92, pass_pct: 80, applied_correct: 2, applied_total: 2, belt_label: 'Blue',
});
ok('a pass says so', passedPlain.includes('passed'));
ok('and says the belt was earned by a test, not a total', passedPlain.includes('test'));

section('THE FIVE SENTENCES THE BELT SCREEN PRINTS');

ok('the first is the owner’s model, verbatim from the spec', BELT_EXAM_PLAIN[0].startsWith('You earn XP from lessons and from calls that resolve.'));
ok('it says the test is what earns the belt', BELT_EXAM_PLAIN[0].includes('earned by passing its test'));
ok('the second refuses either half on its own', BELT_EXAM_PLAIN[1].includes('neither replaces the other'));
ok('the third promises no demotion', BELT_EXAM_PLAIN[2].includes('never taken away'));

/* ═══════════════════ THE MIGRATIONS STILL MEAN IT ═══════════════════════ */

const m46 = readFileSync(
  path.join(REPO, 'supabase/migrations/0046_training_progress_belongs_to_the_learner.sql'),
  'utf8'
);
const m47 = readFileSync(
  path.join(REPO, 'supabase/migrations/0047_the_belt_is_earned_by_passing_a_test.sql'),
  'utf8'
);

section('0046 — one ledger, and a replay that pays nothing');

ok('the ledger was widened, not duplicated', !/create table if not exists training_point_events|create table training_xp_events/.test(m46));
ok('all four training sources landed on point_events', ['lesson_interactive', 'lesson_video', 'lesson_practice', 'assessment_passed'].every((s) => m46.includes(`'${s}'`)));
ok('the training ref is the LESSON, not the run', /training_ref_id\(p_lesson_id text\)/.test(m46));
ok('and the curriculum version is deliberately NOT in that hash', !/md5\([^)]*version/.test(m46));
ok('training rows are never scaled by trading accuracy', m46.includes('point_events_training_flat'));
ok('the rollup gained both halves', m46.includes('xp_calls') && m46.includes('xp_training'));
ok('the 0012 LMS tables are dropped, all four', ['courses', 'course_modules', 'lessons', 'lesson_progress'].every((t) => m46.includes(`drop table if exists ${t};`)));
ok('and nothing client-writable was left behind them', !/grant[^;]*on training_[a-z_]+ to (anon|authenticated)/.test(m46));

section('0047 — the exam is the authority and the phone is not');

ok('grading is revoked from both client roles', /revoke all on function grade_belt_exam\(uuid, uuid, jsonb\) from public, anon, authenticated;/.test(m47));
ok('and granted only to the service role', /grant execute on function grade_belt_exam\(uuid, uuid, jsonb\) to service_role;/.test(m47));
ok('the answer key table is unreadable by a client', /revoke all on belt_exams\s+from anon, authenticated;/.test(m47));
ok('belt_for was renamed rather than left as a temptation', m47.includes('drop function if exists belt_for(numeric)') && m47.includes('belt_eligible_by_points'));
ok('no attempt can ever be deleted, service_role included', /revoke delete, truncate on belt_exam_attempts from anon, authenticated, service_role;/.test(m47));
ok('the board sorts on the call half only', (m47.match(/source in \('community_call', 'kai_trade'\)/g) ?? []).length >= 2);
ok('legacy belts are grandfathered, not revoked', m47.includes("set belt_source = 'legacy_points'"));
ok('stage derives from belt', m47.includes('stage_for_belt') && m47.includes('sync_stage_from_belt'));
ok('and the stage ratchet still refuses to demote', m47.includes('no_downgrade'));
ok('the applied half is asserted, not assumed', m47.includes("jsonb_array_length(blueprint->'applied') < 2"));
ok('the exam chart admits it is an example', m47.includes('NOT A LIVE MARKET'));
ok('Blue draws two applied tasks from a pool of four', /'applied_draw', 2/.test(m47) && (m47.match(/'kind','(level_choice|position_size|plan_choice)'/g) ?? []).length === 4);
ok('only Blue has a blueprint — one rung, done properly (spec §11)', (m47.match(/insert into belt_exams/g) ?? []).length === 1);

console.log(`\n${fail ? `belt merge FAILED (${fail} of ${pass + fail})` : `belt merge OK (${pass})`}`);
process.exit(fail ? 1 : 0);
