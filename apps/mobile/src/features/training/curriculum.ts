import type { TrainingProfile, TrainingUnit } from './types';

export const TRAINING_UNITS: TrainingUnit[] = [
  {
    id: 'foundations',
    title: 'Trader Foundations',
    subtitle: 'From complete beginner to confident chart reader.',
    lessons: [
      {
        id: 'welcome',
        unitId: 'foundations',
        title: 'Welcome to the Markets',
        subtitle: 'How the market works and what traders actually do.',
        kind: 'interactive',
        minutes: 4,
        skill: 'market_basics',
        image: require('../../../assets/training/thumb_market_basics.jpg'),
      },
      {
        id: 'stocks',
        unitId: 'foundations',
        title: 'How Stocks Work',
        subtitle: 'Price, ownership, liquidity and why stocks move.',
        kind: 'interactive',
        minutes: 5,
        skill: 'market_basics',
        image: require('../../../assets/training/thumb_market_basics.jpg'),
      },
      {
        id: 'candles',
        unitId: 'foundations',
        title: 'Reading Candlestick Charts',
        subtitle: 'Open, high, low, close and pressure.',
        kind: 'video',
        minutes: 7,
        skill: 'candles',
        image: require('../../../assets/training/thumb_candles.jpg'),
      },
      {
        id: 'market-structure',
        unitId: 'foundations',
        title: 'Market Structure',
        subtitle: 'Higher highs, higher lows and trend direction.',
        kind: 'interactive',
        minutes: 6,
        skill: 'market_structure',
        image: require('../../../assets/training/thumb_market_structure.jpg'),
      },
      {
        id: 'support-resistance',
        unitId: 'foundations',
        title: 'Support & Resistance',
        subtitle: 'Find levels that actually matter.',
        kind: 'kai_practice',
        minutes: 8,
        skill: 'support_resistance',
        image: require('../../../assets/training/thumb_support_resistance.jpg'),
      },
      {
        id: 'trend-momentum',
        unitId: 'foundations',
        title: 'Trend & Momentum',
        subtitle: 'Strength, weakness and continuation.',
        kind: 'interactive',
        minutes: 8,
        skill: 'market_structure',
        image: require('../../../assets/training/thumb_market_structure.jpg'),
      },
      {
        id: 'entries-exits',
        unitId: 'foundations',
        title: 'Entries & Exits',
        subtitle: 'Build a trade plan before entering.',
        kind: 'video',
        minutes: 10,
        skill: 'entries',
        image: require('../../../assets/training/thumb_entries_exits.jpg'),
      },
      {
        id: 'risk',
        unitId: 'foundations',
        title: 'Risk Management',
        subtitle: 'Position size, stops and account survival.',
        kind: 'interactive',
        minutes: 9,
        skill: 'risk_management',
        image: require('../../../assets/training/thumb_risk.jpg'),
      },
      {
        id: 'paper',
        unitId: 'foundations',
        title: 'Paper Trading',
        subtitle: 'Practice full decisions with Kai watching.',
        kind: 'chart_challenge',
        minutes: 12,
        skill: 'trade_management',
        image: require('../../../assets/training/thumb_paper_trading.jpg'),
      },
      {
        id: 'graduate',
        unitId: 'foundations',
        title: 'Trader Readiness',
        subtitle: 'Graduate into Kai-assisted trading.',
        kind: 'mastery',
        minutes: 10,
        skill: 'trade_management',
        image: require('../../../assets/training/thumb_graduation.jpg'),
      },
    ],
  },
];

/**
 * THE STARTING PROFILE IS EMPTY, AND THAT IS DELIBERATE.
 *
 * The design package shipped this seeded — three lessons complete, Market
 * Basics at 80%, a three-day streak — because that is what makes a mockup
 * screenshot look alive. On a real device it is a claim about work the learner
 * has not done: they would open Training for the first time and be told they
 * had already finished Welcome, How Stocks Work and Candlesticks, and the
 * mastery dashboard would report a number nothing produced.
 *
 * The mockup's visual language is untouched — the path, the ring, the skill
 * bars all render exactly as approved. They just start at zero, which is the
 * honest reading of a learner who has not started.
 */
export const DEFAULT_TRAINING_PROFILE: TrainingProfile = {
  completedLessonIds: [],
  currentLessonId: 'welcome',
  streak: 0,
  readiness: 'beginner',
  mastery: {
    market_basics: 0,
    candles: 0,
    market_structure: 0,
    support_resistance: 0,
    entries: 0,
    risk_management: 0,
    trade_management: 0,
  },
};

export const allLessons = () => TRAINING_UNITS.flatMap((u) => u.lessons);
export const lessonById = (id: string) => allLessons().find((l) => l.id === id) ?? null;
export const lessonIndex = (id: string) => Math.max(0, allLessons().findIndex((l) => l.id === id));
export const nextLesson = (id: string) => allLessons()[lessonIndex(id) + 1] ?? null;
