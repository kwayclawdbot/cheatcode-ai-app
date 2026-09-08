import type {
  LessonContent,
  TrainingDay,
  TrainingLessonNode,
  TrainingProfile,
} from './types';
import { DAY1_LESSON1 } from './content/day1-lesson1';

/**
 * THE SEVEN DAYS.
 * ===========================================================================
 *
 * Straight out of docs/training/TRAINING-7DAY-SPEC.md — the day titles, the
 * outcomes, the minute budgets (D1 30 · D2 40 · D3 45 · D4 50 · D5 40 · D6 60
 * · D7 60 ≈ 5h25m) and the lesson nodes named in each day's section. Each
 * day's lesson minutes add up to that day's budget.
 *
 * ONLY ONE LESSON HAS CONTENT. `hasContent` is true for `d1l1` and false for
 * the other twenty-nine, because `content/day1-lesson1.ts` is the only lesson
 * that has been written. That flag is the whole honesty mechanism here: the
 * landing screen will not offer a lesson that does not exist, and the lesson
 * route says so plainly if one is reached by URL.
 *
 * ABOUT THE GATE NUMBERS. Where the spec states a percentage it is used
 * verbatim — Day 1's 70%, Day 2's Trend 80 / Structure 75 / Levels 70. Where
 * the spec describes a gate in words only ("build 3 trades — logical entry,
 * logical stop, R:R ≥ threshold"), the number below is this engine's default
 * floor and is marked as such. Nothing here pretends to be a spec number that
 * is not one.
 */

const IMG = {
  marketBasics: require('../../../assets/training/thumb_market_basics.jpg'),
  candles: require('../../../assets/training/thumb_candles.jpg'),
  structure: require('../../../assets/training/thumb_market_structure.jpg'),
  levels: require('../../../assets/training/thumb_support_resistance.jpg'),
  entries: require('../../../assets/training/thumb_entries_exits.jpg'),
  risk: require('../../../assets/training/thumb_risk.jpg'),
  psychology: require('../../../assets/training/thumb_psychology.jpg'),
  paper: require('../../../assets/training/thumb_paper_trading.jpg'),
  graduation: require('../../../assets/training/thumb_graduation.jpg'),
} as const;

export const TRAINING_DAYS: TrainingDay[] = [
  {
    id: 'day-1',
    index: 1,
    title: 'Market Basics',
    outcome: 'Understand what you are actually looking at — and what you are actually buying.',
    minutes: 30,
    phase: 'read',
    image: IMG.marketBasics,
    lessonIds: ['d1l1', 'd1l2', 'd1l3', 'd1challenge'],
    // Spec: "Gate: bullish/bearish candle, entry/stop/target, timeframe, vocabulary. 70%."
    gate: {
      minScorePct: 70,
      requirements: [{ label: 'Market basics', skill: 'market_basics', minPct: 70 }],
    },
  },
  {
    id: 'day-2',
    index: 2,
    title: 'Read the Chart',
    outcome: 'Look at any chart and answer one question: up, down, or sideways.',
    minutes: 40,
    phase: 'read',
    image: IMG.structure,
    lessonIds: ['d2l1', 'd2l2', 'd2l3', 'd2kai', 'd2challenge'],
    // Spec: "Gates: Trend ≥80% · Structure ≥75% · Levels ≥70%."
    gate: {
      minScorePct: 75,
      requirements: [
        { label: 'Trend', skill: 'trend', minPct: 80 },
        { label: 'Structure', skill: 'market_structure', minPct: 75 },
        { label: 'Levels', skill: 'support_resistance', minPct: 70 },
      ],
    },
  },
  {
    id: 'day-3',
    index: 3,
    title: 'Find the Setup',
    outcome: 'Tell a real setup from noise, and say out loud why you would take it.',
    minutes: 45,
    phase: 'analyze',
    image: IMG.levels,
    lessonIds: ['d3l1', 'd3l2', 'd3l3', 'd3video', 'd3challenge'],
    // Spec names the gate in words only ("identify breakout, pullback,
    // setup-vs-noise, articulate basic thesis"); 70 is this engine's floor.
    gate: {
      minScorePct: 70,
      requirements: [{ label: 'Setup recognition', skill: 'setups', minPct: 70 }],
    },
  },
  {
    id: 'day-4',
    index: 4,
    title: 'Build the Trade',
    outcome: 'Turn a setup into an entry, a stop, a target and a position size.',
    minutes: 50,
    phase: 'analyze',
    image: IMG.entries,
    lessonIds: ['d4l1', 'd4l2', 'd4l3', 'd4l4', 'd4builder'],
    // Spec: "build 3 trades — logical entry, logical stop, R:R ≥ threshold,
    // sizing correct" — no percentage given; 70 is this engine's floor.
    gate: {
      minScorePct: 70,
      requirements: [
        { label: 'Entries', skill: 'entries', minPct: 70 },
        { label: 'Risk management', skill: 'risk_management', minPct: 70 },
      ],
    },
  },
  {
    id: 'day-5',
    index: 5,
    title: 'Execute the Plan',
    outcome: 'Place the order, then trade the plan you already wrote.',
    minutes: 40,
    phase: 'execute',
    image: IMG.psychology,
    lessonIds: ['d5l1', 'd5l2', 'd5l3', 'd5video', 'd5sim'],
    // Behavioural day; the spec sets no percentage. 70 is this engine's floor.
    gate: {
      minScorePct: 70,
      requirements: [{ label: 'Trade management', skill: 'trade_management', minPct: 70 }],
    },
  },
  {
    id: 'day-6',
    index: 6,
    title: 'Trade With Kai',
    outcome: 'Paper trade three times — guided, assisted, then on your own.',
    minutes: 60,
    phase: 'practice',
    image: IMG.paper,
    lessonIds: ['d6sim1', 'd6sim2', 'd6sim3', 'd6journal'],
    // Spec sets no percentage; 75 is this engine's floor before the exam day.
    gate: {
      minScorePct: 75,
      requirements: [{ label: 'Trade management', skill: 'trade_management', minPct: 75 }],
    },
  },
  {
    id: 'day-7',
    index: 7,
    title: 'Get Trade Ready',
    outcome: 'Prove it once without help, then leave Training Mode for good.',
    minutes: 60,
    phase: 'prove',
    image: IMG.graduation,
    lessonIds: ['d7exam1', 'd7exam2', 'd7handoff'],
    // The spec's worked example scores an 87% overall; it does not state the
    // pass mark. 80 is this engine's graduation floor.
    gate: { minScorePct: 80, requirements: [] },
  },
];

export const TRAINING_LESSON_NODES: TrainingLessonNode[] = [
  /* ── DAY 1 · Understand What the Hell You're Looking At ─────────────── */
  {
    id: 'd1l1',
    dayId: 'day-1',
    title: 'What Is a Stock?',
    subtitle: 'Company, shares, buyers and sellers, price — and nothing else.',
    minutes: 9,
    kind: 'interactive',
    skill: 'market_basics',
    hasContent: true,
  },
  {
    id: 'd1l2',
    dayId: 'day-1',
    title: 'How a Trade Works',
    subtitle: 'Buy, it moves, you sell — then entry, stop and target on day one.',
    minutes: 6,
    kind: 'interactive',
    skill: 'entries',
    hasContent: false,
  },
  {
    id: 'd1l3',
    dayId: 'day-1',
    title: 'Reading Candles',
    subtitle: 'Open, high, low, close. Body and wick. No pattern names.',
    minutes: 7,
    kind: 'video',
    skill: 'candles',
    hasContent: false,
  },
  {
    id: 'd1challenge',
    dayId: 'day-1',
    title: 'Kai Challenge',
    subtitle: 'Five candles: who controlled it, and which one showed rejection?',
    minutes: 8,
    kind: 'kai_practice',
    skill: 'candles',
    hasContent: false,
  },

  /* ── DAY 2 · Read the Market ────────────────────────────────────────── */
  {
    id: 'd2l1',
    dayId: 'day-2',
    title: 'Market Structure',
    subtitle: 'Higher highs, higher lows, lower highs, lower lows. That is all.',
    minutes: 8,
    kind: 'interactive',
    skill: 'market_structure',
    hasContent: false,
  },
  {
    id: 'd2l2',
    dayId: 'day-2',
    title: 'Trend',
    subtitle: 'How I identify the trend in 10 seconds — on real charts.',
    minutes: 7,
    kind: 'video',
    skill: 'trend',
    hasContent: false,
  },
  {
    id: 'd2l3',
    dayId: 'day-2',
    title: 'Support & Resistance',
    subtitle: 'Where has price repeatedly reacted? Tap it; Kai overlays the zone.',
    minutes: 9,
    kind: 'interactive',
    skill: 'support_resistance',
    hasContent: false,
  },
  {
    id: 'd2kai',
    dayId: 'day-2',
    title: 'Kai Practice',
    subtitle: 'Five charts: trend, then tap support, then tap resistance.',
    minutes: 8,
    kind: 'kai_practice',
    skill: 'support_resistance',
    hasContent: false,
  },
  {
    id: 'd2challenge',
    dayId: 'day-2',
    title: 'Day 2 Challenge',
    subtitle: 'A fresh chart with no hints. Trend, support, resistance.',
    minutes: 8,
    kind: 'chart_challenge',
    skill: 'trend',
    hasContent: false,
  },

  /* ── DAY 3 · Understand Setups ──────────────────────────────────────── */
  {
    id: 'd3l1',
    dayId: 'day-3',
    title: 'A Trade Needs a Thesis',
    subtitle: '"I think X will happen because Y is occurring, and I am wrong if Z."',
    minutes: 10,
    kind: 'interactive',
    skill: 'setups',
    hasContent: false,
  },
  {
    id: 'd3l2',
    dayId: 'day-3',
    title: 'Setup #1 — The Breakout',
    subtitle: 'Resistance, approach, confirmation, breakout.',
    minutes: 9,
    kind: 'interactive',
    skill: 'setups',
    hasContent: false,
  },
  {
    id: 'd3l3',
    dayId: 'day-3',
    title: 'Setup #2 — The Pullback',
    subtitle: 'Trend, pullback to support, confirmation, continuation.',
    minutes: 9,
    kind: 'interactive',
    skill: 'setups',
    hasContent: false,
  },
  {
    id: 'd3video',
    dayId: 'day-3',
    title: 'Why I Pass on Most Setups',
    subtitle: 'No trade is a decision, and usually the right one.',
    minutes: 7,
    kind: 'video',
    skill: 'setups',
    hasContent: false,
  },
  {
    id: 'd3challenge',
    dayId: 'day-3',
    title: 'Kai Setup Challenge',
    subtitle: 'Eight charts. Trade, Watch or Pass — and say why.',
    minutes: 10,
    kind: 'chart_challenge',
    skill: 'setups',
    hasContent: false,
  },

  /* ── DAY 4 · Build the Trade ────────────────────────────────────────── */
  {
    id: 'd4l1',
    dayId: 'day-4',
    title: 'Entry',
    subtitle: 'A setup is not an entry. Interesting is not "enter now".',
    minutes: 10,
    kind: 'interactive',
    skill: 'entries',
    hasContent: false,
  },
  {
    id: 'd4l2',
    dayId: 'day-4',
    title: 'Stop',
    subtitle: 'Not "5%". Where is your idea wrong? The stop goes past that.',
    minutes: 10,
    kind: 'interactive',
    skill: 'risk_management',
    hasContent: false,
  },
  {
    id: 'd4l3',
    dayId: 'day-4',
    title: 'Target',
    subtitle: 'Where could price reasonably go — and what that makes the R:R.',
    minutes: 10,
    kind: 'interactive',
    skill: 'entries',
    hasContent: false,
  },
  {
    id: 'd4l4',
    dayId: 'day-4',
    title: 'Position Size',
    subtitle: '$5,000 account, 1% risk, $2 per share — 25 shares. That is the maths.',
    minutes: 8,
    kind: 'interactive',
    skill: 'risk_management',
    hasContent: false,
  },
  {
    id: 'd4builder',
    dayId: 'day-4',
    title: 'Trade Builder',
    subtitle: 'Place entry, stop and target yourself. Kai grades the placement.',
    minutes: 12,
    kind: 'trade_builder',
    skill: 'entries',
    hasContent: false,
  },

  /* ── DAY 5 · Execute Without Doing Dumb Shit ────────────────────────── */
  {
    id: 'd5l1',
    dayId: 'day-5',
    title: 'Order Types',
    subtitle: 'Market, limit, stop. Three is enough.',
    minutes: 8,
    kind: 'interactive',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd5l2',
    dayId: 'day-5',
    title: 'Managing the Trade',
    subtitle: 'Before entry, plan the trade. After entry, trade the plan.',
    minutes: 8,
    kind: 'interactive',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd5l3',
    dayId: 'day-5',
    title: 'The Four Mistakes',
    subtitle: 'Chasing, moving stops, oversizing, revenge trading.',
    minutes: 9,
    kind: 'interactive',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd5video',
    dayId: 'day-5',
    title: 'The Trades I Wish I Never Took',
    subtitle: 'Real scars, not motivation.',
    minutes: 7,
    kind: 'video',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd5sim',
    dayId: 'day-5',
    title: 'Kai Intervention',
    subtitle: 'The trade goes against you. What do you do?',
    minutes: 8,
    kind: 'simulation',
    skill: 'trade_management',
    hasContent: false,
  },

  /* ── DAY 6 · Paper Trade With Kai ───────────────────────────────────── */
  {
    id: 'd6sim1',
    dayId: 'day-6',
    title: 'Sim 1 — Guided',
    subtitle: 'Kai asks every question and holds your hand through the plan.',
    minutes: 15,
    kind: 'simulation',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd6sim2',
    dayId: 'day-6',
    title: 'Sim 2 — Assisted',
    subtitle: 'Fewer questions. You build the trade, Kai reviews it.',
    minutes: 15,
    kind: 'simulation',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd6sim3',
    dayId: 'day-6',
    title: 'Sim 3 — Independent',
    subtitle: '"Analyse this chart and submit your trade plan." Kai grades it.',
    minutes: 18,
    kind: 'simulation',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd6journal',
    dayId: 'day-6',
    title: 'The Journal',
    subtitle: 'Before, after, and the only question that matters: did I follow my plan?',
    minutes: 12,
    kind: 'journal',
    skill: 'trade_management',
    hasContent: false,
  },

  /* ── DAY 7 · Live Market Readiness ──────────────────────────────────── */
  {
    id: 'd7exam1',
    dayId: 'day-7',
    title: 'Final Assessment',
    subtitle: 'Ten rapid-fire scenarios across everything you have learned.',
    minutes: 18,
    kind: 'mastery',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd7exam2',
    dayId: 'day-7',
    title: 'Full Trade Exam',
    subtitle: 'One chart, no assistance. Kai scores you by dimension.',
    minutes: 27,
    kind: 'mastery',
    skill: 'trade_management',
    hasContent: false,
  },
  {
    id: 'd7handoff',
    dayId: 'day-7',
    title: 'Kai Live Handoff',
    subtitle: 'Training Mode changes. You leave Foundations for good.',
    minutes: 15,
    kind: 'mastery',
    skill: 'trade_management',
    hasContent: false,
  },
];

/**
 * THE WRITTEN LESSONS. One entry today. Adding Day 2 Lesson 1 means writing
 * `content/day2-lesson1.ts`, importing it here, and flipping that node's
 * `hasContent` to true — no engine change.
 */
export const LESSON_CONTENT: Record<string, LessonContent> = {
  [DAY1_LESSON1.lessonId]: DAY1_LESSON1,
};

/**
 * THE STARTING PROFILE IS EMPTY, AND THAT IS DELIBERATE.
 *
 * The design package shipped this seeded — three lessons complete, Market
 * Basics at 80%, a three-day streak — because that is what makes a mockup
 * screenshot look alive. On a real device it is a claim about work the learner
 * has not done. The mockup's visual language is untouched; it just starts at
 * zero, which is the honest reading of a learner who has not started.
 */
export const DEFAULT_TRAINING_PROFILE: TrainingProfile = {
  completedLessonIds: [],
  currentLessonId: 'd1l1',
  streak: 0,
  readiness: 'beginner',
  mastery: {
    market_basics: 0,
    candles: 0,
    market_structure: 0,
    trend: 0,
    support_resistance: 0,
    setups: 0,
    entries: 0,
    risk_management: 0,
    trade_management: 0,
  },
  competencies: {},
  dayProgress: {},
};

/* ─────────────────────────────── lookups ────────────────────────────────── */

export const dayById = (id: string): TrainingDay | null =>
  TRAINING_DAYS.find((d) => d.id === id) ?? null;

export const dayByIndex = (index: number): TrainingDay | null =>
  TRAINING_DAYS.find((d) => d.index === index) ?? null;

export const lessonNodeById = (id: string): TrainingLessonNode | null =>
  TRAINING_LESSON_NODES.find((l) => l.id === id) ?? null;

export const dayForLesson = (lessonId: string): TrainingDay | null => {
  const node = lessonNodeById(lessonId);
  return node ? dayById(node.dayId) : null;
};

export const lessonsForDay = (dayId: string): TrainingLessonNode[] => {
  const day = dayById(dayId);
  if (!day) return [];
  return day.lessonIds
    .map((id) => lessonNodeById(id))
    .filter((n): n is TrainingLessonNode => n !== null);
};

/** Flat order across all seven days — used only to find "the one after this". */
export const orderedLessonNodes = (): TrainingLessonNode[] =>
  TRAINING_DAYS.flatMap((d) => lessonsForDay(d.id));

export const nextLessonNode = (lessonId: string): TrainingLessonNode | null => {
  const all = orderedLessonNodes();
  const i = all.findIndex((l) => l.id === lessonId);
  if (i < 0) return null;
  return all[i + 1] ?? null;
};

export const lessonContentFor = (lessonId: string): LessonContent | null =>
  LESSON_CONTENT[lessonId] ?? null;

export const TOTAL_TRAINING_MINUTES = TRAINING_DAYS.reduce((n, d) => n + d.minutes, 0);
