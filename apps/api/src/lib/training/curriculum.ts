/**
 * THE CURRICULUM, AS MUCH OF IT AS THE SERVER NEEDS TO KNOW.
 *
 * ===========================================================================
 * WHY THERE IS A COPY HERE AT ALL
 * ===========================================================================
 * The curriculum lives in the app bundle — `curriculum.ts` on the phone is
 * TypeScript that Metro compiles into the binary, and it carries things this
 * side has no use for (thumbnails, minute budgets, screen content). What the
 * server does need is small and load-bearing: WHICH LESSON IDS EXIST, and which
 * day and skill each one belongs to.
 *
 * It needs them because after the belt merge a completed lesson pays XP that
 * counts toward a belt, and `POST /training/lessons/:id/complete` takes the
 * lesson id from a URL. Without this index the body could name its own day and
 * its own skill, and `complete lesson free-money` would be a route onto a
 * ladder. With it, an unknown id is a 404 and the day and skill are the
 * server's own, never the caller's.
 *
 * ===========================================================================
 * THIS IS A MIRROR, AND A TEST HOLDS THE MIRROR STRAIGHT
 * ===========================================================================
 * Duplication is the cost of the server owning the decision, and duplication
 * drifts. `apps/api/scripts/belt-merge-test.ts` reads BOTH this file and
 * `apps/mobile/src/features/training/curriculum.ts` and fails `npm test` if
 * they stop agreeing — the same arrangement `lib/stage/rules.ts` has with
 * `apps/mobile/scripts/stage-rules-test.mts`, and for the same reason: change a
 * lesson in the curriculum and the test tells you this file needs the same
 * edit, rather than the belt quietly grading against last month's programme.
 *
 * ONE LESSON OF THIRTY-ONE IS AUTHORED. `d1l1` is the only node with content;
 * the other thirty are planned. That is not this file's business — it indexes
 * what the programme names, and the app decides what it is willing to open.
 */

export type LessonIndexEntry = { dayId: string; skill: string };

export const LESSON_INDEX = new Map<string, LessonIndexEntry>([
  /* ── DAY 1 · Market Basics ─────────────────────────────────────────── */
  ['d1l1', { dayId: 'day-1', skill: 'market_basics' }],
  ['d1l2', { dayId: 'day-1', skill: 'entries' }],
  ['d1l3', { dayId: 'day-1', skill: 'candles' }],
  ['d1challenge', { dayId: 'day-1', skill: 'candles' }],
  /* ── DAY 2 · Read the Chart ────────────────────────────────────────── */
  ['d2l1', { dayId: 'day-2', skill: 'market_structure' }],
  ['d2l2', { dayId: 'day-2', skill: 'trend' }],
  ['d2l3', { dayId: 'day-2', skill: 'support_resistance' }],
  ['d2kai', { dayId: 'day-2', skill: 'support_resistance' }],
  ['d2challenge', { dayId: 'day-2', skill: 'trend' }],
  /* ── DAY 3 · Find the Setup ────────────────────────────────────────── */
  ['d3l1', { dayId: 'day-3', skill: 'setups' }],
  ['d3l2', { dayId: 'day-3', skill: 'setups' }],
  ['d3l3', { dayId: 'day-3', skill: 'setups' }],
  ['d3video', { dayId: 'day-3', skill: 'setups' }],
  ['d3challenge', { dayId: 'day-3', skill: 'setups' }],
  /* ── DAY 4 · Build the Trade ───────────────────────────────────────── */
  ['d4l1', { dayId: 'day-4', skill: 'entries' }],
  ['d4l2', { dayId: 'day-4', skill: 'risk_management' }],
  ['d4l3', { dayId: 'day-4', skill: 'entries' }],
  ['d4l4', { dayId: 'day-4', skill: 'risk_management' }],
  ['d4builder', { dayId: 'day-4', skill: 'entries' }],
  /* ── DAY 5 · Execute the Plan ──────────────────────────────────────── */
  ['d5l1', { dayId: 'day-5', skill: 'trade_management' }],
  ['d5l2', { dayId: 'day-5', skill: 'trade_management' }],
  ['d5l3', { dayId: 'day-5', skill: 'trade_management' }],
  ['d5video', { dayId: 'day-5', skill: 'trade_management' }],
  ['d5sim', { dayId: 'day-5', skill: 'trade_management' }],
  /* ── DAY 6 · Trade With Kai ────────────────────────────────────────── */
  ['d6sim1', { dayId: 'day-6', skill: 'trade_management' }],
  ['d6sim2', { dayId: 'day-6', skill: 'trade_management' }],
  ['d6sim3', { dayId: 'day-6', skill: 'trade_management' }],
  ['d6journal', { dayId: 'day-6', skill: 'trade_management' }],
  /* ── DAY 7 · Get Trade Ready ───────────────────────────────────────── */
  ['d7exam1', { dayId: 'day-7', skill: 'trade_management' }],
  ['d7exam2', { dayId: 'day-7', skill: 'trade_management' }],
  ['d7handoff', { dayId: 'day-7', skill: 'trade_management' }],
]);

export function lessonEntry(lessonId: string): LessonIndexEntry | null {
  return LESSON_INDEX.get(lessonId) ?? null;
}

/**
 * The competency keys the belt ladder asks for, and the lesson that would
 * measure each one. Read straight out of `points_config()->'belt_requirements'`
 * at runtime — this list is only here so a reader of this file can see, in one
 * place, that FOUR of the five keys Blue and Purple need belong to lessons
 * nobody has written yet.
 *
 * That is not a bug to be coded around. It is the state of the product, and the
 * Belt Profile screen says it out loud: "the lesson that measures this has not
 * been written yet". An eligibility screen that hid it would be promising a
 * belt the curriculum cannot deliver.
 */
export const BELT_COMPETENCY_LESSONS: Record<string, string> = {
  read_a_chart: 'd2challenge',
  explain_your_risk: 'd4l2',
  entries_and_exits: 'd4l1',
  position_sizing: 'd4l4',
  risk_discipline: 'd5l3',
  debrief_honestly: 'd6journal',
  full_mastery: 'd7exam2',
};

/** The only lesson with content today. The app is the authority; this is a note. */
export const AUTHORED_LESSON_IDS = ['d1l1'];
