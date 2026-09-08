/**
 * TRAINING MODE — THE DATA MODEL
 * ===========================================================================
 *
 * "Zero to Trade Ready in 7 Days" (docs/training/TRAINING-7DAY-SPEC.md) is a
 * SEVEN DAY product, not a list of lessons. The member is never shown "27
 * lessons"; they are shown DAY 3 OF 7. So the model's spine is the day, the
 * day owns its lesson nodes, and the day owns the GATE that decides whether
 * the next day opens.
 *
 * The second thing this file exists to do is make Days 2–7 an AUTHORING job
 * rather than an engineering one. A lesson is a `LessonContent` — an ordered
 * list of `LessonScreen`s, each a plain object in a discriminated union. The
 * engine (`engine/LessonRunner.tsx` + `engine/screens.tsx`) knows how to walk
 * that list and render each `type`. Writing Day 4 Lesson 2 means writing a new
 * data file, not a new screen.
 *
 * IMPLEMENTED vs STUB. Day 1 Lesson 1 is the canonical template and it
 * exercises ten screen types; those ten have real UI. Five more types are
 * declared here with their full content shape but have no renderer yet —
 * they are what Days 4–7 will need (`trade_builder`, `setup_triage`,
 * `paper_sim`, `journal`, `final_exam`). They are typed now so the shape of
 * that later work is already decided, and so an author can draft against it.
 * The runner renders an honest "not built yet" panel if one is ever reached.
 */

/* ───────────────────────── skills, days, lesson nodes ───────────────────── */

export type TrainingLessonKind =
  | 'interactive'
  | 'video'
  | 'kai_practice'
  | 'chart_challenge'
  | 'trade_builder'
  | 'simulation'
  | 'journal'
  | 'mastery';

/**
 * The mastery areas the trader profile tracks. `trend` and `setups` are here
 * because Day 2's gate names Trend and Day 3's names setup recognition as
 * things measured on their own — collapsing them into `market_structure`
 * would have made two of the spec's three Day 2 thresholds unmeasurable.
 */
export type TrainingSkill =
  | 'market_basics'
  | 'candles'
  | 'market_structure'
  | 'trend'
  | 'support_resistance'
  | 'setups'
  | 'entries'
  | 'risk_management'
  | 'trade_management';

export type TrainingPhase = 'read' | 'analyze' | 'execute' | 'practice' | 'prove';

/** One threshold inside a day gate. */
export type TrainingGateRequirement = {
  /** What the member sees when the gate is explained to them. */
  label: string;
  skill: TrainingSkill;
  /** Mastery percentage that must be reached, 0–100. */
  minPct: number;
};

export type TrainingGate = {
  /**
   * Floor on the day's best challenge score, 0–100. Day 1's 70 is the spec's
   * own number ("Gate … 70%"); where the spec describes a gate in words but
   * gives no percentage, this is the engine's default floor and the comment
   * on that day in `curriculum.ts` says so.
   */
  minScorePct: number;
  /** Per-skill mastery floors that must ALSO hold. May be empty. */
  requirements: TrainingGateRequirement[];
};

export type TrainingDay = {
  id: string;
  /** 1–7. The member-facing number: "Day 3 of 7". */
  index: number;
  title: string;
  /** One sentence: what the member can do at the end of this day. */
  outcome: string;
  minutes: number;
  phase: TrainingPhase;
  lessonIds: string[];
  gate: TrainingGate;
  /** `require()`d asset from assets/training/. */
  image: number;
};

export type TrainingLessonNode = {
  id: string;
  dayId: string;
  title: string;
  subtitle: string;
  minutes: number;
  kind: TrainingLessonKind;
  skill: TrainingSkill;
  /**
   * TRUE only when a `LessonContent` exists for this node. The landing screen
   * uses it to decide what is tappable, and the lesson route uses it to decide
   * between the runner and an honest "not written yet" screen. It is never a
   * promise about a lesson that does not exist.
   */
  hasContent: boolean;
};

/* ───────────────────────────── competency signals ───────────────────────── */

/**
 * The granular half of the trader profile. Skill mastery says "Market Basics
 * 80%"; these say WHERE inside it the member is weak, which is what Kai needs
 * in order to teach rather than congratulate.
 *
 *   mastered   — right first time, no help
 *   strong     — right, but not first time
 *   developing — reached the answer after the teaching feedback
 *   passed     — answered in their own words; not machine-scored
 *   unproven   — asked for, not yet demonstrated
 */
export type CompetencySignal = 'mastered' | 'strong' | 'developing' | 'passed' | 'unproven';

/** A competency the author wants a screen to report on. */
export type CompetencyTag = {
  /** Stable key stored on the profile, e.g. `stock_ownership`. */
  key: string;
  /** The row label on the progress board. */
  label: string;
};

/* ─────────────────────────────── screen content ─────────────────────────── */

/** Shared by every screen: a stable id and the label on its advance button. */
type ScreenBase = {
  id: string;
  /** Text on the primary advance control. Defaults are supplied by the runner. */
  cta?: string;
};

/** The diagrams a `concept` screen can carry. All data, no bespoke code. */
export type ConceptVisual =
  | {
      /** A block of share squares with exactly one picked out. */
      kind: 'share_grid';
      columns: number;
      rows: number;
      highlightIndex: number;
      totalLabel: string;
      highlightLabel: string;
    }
  | {
      /** Left-to-right flow: COMPANY → SELLS SHARES → INVESTORS BUY → … */
      kind: 'flow';
      steps: { label: string; detail?: string }[];
      note?: string;
    }
  | {
      /** 2×2 (or n) idea cards. */
      kind: 'cards';
      cards: { label: string; text: string }[];
    }
  | {
      /** Split screen — the trader/investor comparison. */
      kind: 'split';
      left: { title: string; caption: string; lines: string[] };
      right: { title: string; caption: string; lines: string[] };
    }
  | {
      /** A named calculation shown as an equation, e.g. market cap. */
      kind: 'formula';
      lhs: string;
      terms: string[];
      result: string;
      note?: string;
    };

export type OpeningScreen = ScreenBase & {
  type: 'opening';
  eyebrow: string;
  title: string;
  body: string[];
  image?: number;
};

export type ConceptScreen = ScreenBase & {
  type: 'concept';
  eyebrow: string;
  title: string;
  body: string[];
  visual?: ConceptVisual;
  /** The emphasised sentence — the one line the member must not miss. */
  keyLine?: string;
  /** A short aside in Kai's voice. Violet, and always attributed to Kai. */
  kaiNote?: string;
};

export type QuizOption = { id: string; label: string };

/**
 * A quiz screen may also carry the teaching that sets the question up. The
 * spec's canonical lesson does exactly this on three of its thirteen screens
 * ("Core Idea … then quiz"), and splitting each of those into two screens
 * would have turned a 13-beat lesson into a 16-tap one. `title`, `body` and
 * `visual` are the concept half; everything below the question is the quiz.
 */
export type QuizScreen = ScreenBase & {
  type: 'quiz';
  eyebrow: string;
  title?: string;
  body?: string[];
  visual?: ConceptVisual;
  keyLine?: string;
  prompt: string;
  options: QuizOption[];
  correctId: string;
  /** Teaching text after a correct answer. */
  whenCorrect: string;
  /** Teaching text after a wrong one — explains, never scolds. */
  whenWrong: string;
  kaiNote?: string;
  competency?: CompetencyTag;
};

export type VideoScreen = ScreenBase & {
  type: 'video';
  eyebrow: string;
  title: string;
  presenter: string;
  duration: string;
  poster: number;
  /**
   * `filming` is the honest state for every human video in the product today:
   * the script is written, the footage is not shot. The renderer draws it as a
   * designed "in production" card — no play button, because nothing plays.
   */
  status: 'filming' | 'ready';
  statusNote: string;
  /** The beats the video will cover, shown as the script outline. */
  outline: string[];
  /** The summary card that follows the video and carries the lesson. */
  afterCard: { title: string; rows: { label: string; text: string }[] };
};

export type AuctionScreen = ScreenBase & {
  type: 'auction';
  eyebrow: string;
  title: string;
  body: string[];
  /**
   * A REAL symbol, or nothing. The house rule is that a ticker always renders
   * as a market object with its mark — which means an invented symbol must not
   * be put through it. The canonical lesson teaches the auction on round
   * numbers with no company attached, so it sets `bookLabel` and leaves
   * `symbol` off; a later lesson showing a real book sets both.
   */
  symbol?: string;
  companyName?: string;
  bookLabel: string;
  last: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
  /** The aggressive buyer who lifts an offer — the thing being demonstrated. */
  lift: { price: number; label: string; explain: string };
  caption: string;
};

export type SortingScreen = ScreenBase & {
  type: 'sorting';
  eyebrow: string;
  title: string;
  prompt: string;
  buckets: { id: string; label: string; caption: string }[];
  cards: { id: string; label: string; bucketId: string; why: string }[];
  competency?: CompetencyTag;
};

export type KaiCheckScreen = ScreenBase & {
  type: 'kai_check';
  eyebrow: string;
  title: string;
  prompt: string;
  placeholder: string;
  /** Context the tutor call pins. */
  symbol: string;
  timeframe: string;
  stage: string;
  /** Label on the honest self-assessment offered when Kai cannot answer. */
  selfAssessLabel: string;
  competency: CompetencyTag;
};

export type MarketApplicationScreen = ScreenBase & {
  type: 'market_application';
  eyebrow: string;
  title: string;
  symbol: string;
  companyName: string;
  /** A real, dated quote. The date is shown, because a price without one lies. */
  quote: { price: number; marketCapLabel: string; asOf: string };
  scenario: {
    shares: number;
    costLabel: string;
    movedPrice: number;
    movedValueLabel: string;
    question: string;
    answer: string;
  };
  takeaways: string[];
};

export type MasteryQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctId: string;
  competency?: CompetencyTag;
};

export type MasteryChallengeScreen = ScreenBase & {
  type: 'mastery_challenge';
  eyebrow: string;
  title: string;
  intro: string;
  /** No teaching text between these — this is the measurement. */
  questions: MasteryQuestion[];
  passPct: number;
};

export type CompletionScreen = ScreenBase & {
  type: 'completion';
  title: string;
  /** Mastery points added to the lesson's skill on completion. */
  masteryGain: number;
  knowNow: string[];
  kaiMessage: string;
  nextLessonId: string | null;
  nextLabel: string;
  secondaryCta: string;
};

/* ── typed stubs: shapes decided, renderers not written ─────────────────────
 * Days 4–7 need these. Authoring them later is data work against the shapes
 * below; building them is one component each in `engine/screens.tsx`.
 */

export type TradeBuilderScreen = ScreenBase & {
  type: 'trade_builder';
  eyebrow: string;
  title: string;
  symbol: string;
  timeframe: string;
  /** Candles the member places their levels on. */
  series: { t: number; o: number; h: number; l: number; c: number }[];
  account: { balance: number; maxRiskPct: number };
  /** What Kai grades against, so a grade is never invented client-side. */
  model: { entry: number; stop: number; target: number; rationale: string };
  tolerance: { entryPct: number; stopPct: number; targetPct: number };
  minRR: number;
  competency?: CompetencyTag;
};

export type SetupTriageScreen = ScreenBase & {
  type: 'setup_triage';
  eyebrow: string;
  title: string;
  prompt: string;
  /** Trade / Watch / Pass on each chart, with the reason that makes it right. */
  charts: {
    id: string;
    symbol: string;
    timeframe: string;
    series: { t: number; o: number; h: number; l: number; c: number }[];
    verdict: 'trade' | 'watch' | 'pass';
    because: string;
  }[];
  competency?: CompetencyTag;
};

export type PaperSimScreen = ScreenBase & {
  type: 'paper_sim';
  eyebrow: string;
  title: string;
  symbol: string;
  timeframe: string;
  /** guided = Kai asks every question; assisted = fewer; independent = none. */
  assistance: 'guided' | 'assisted' | 'independent';
  setupSeries: { t: number; o: number; h: number; l: number; c: number }[];
  /** Revealed one bar at a time after the plan is committed. */
  resolutionSeries: { t: number; o: number; h: number; l: number; c: number }[];
  prompts: { id: string; ask: string; expects: 'direction' | 'level' | 'text' }[];
  competency?: CompetencyTag;
};

export type JournalScreen = ScreenBase & {
  type: 'journal';
  eyebrow: string;
  title: string;
  intro: string;
  sections: {
    id: string;
    when: 'before' | 'after' | 'review';
    heading: string;
    fields: { id: string; label: string; placeholder: string }[];
  }[];
  /** The question the whole journal exists to ask. */
  verdictQuestion: string;
};

export type FinalExamScreen = ScreenBase & {
  type: 'final_exam';
  eyebrow: string;
  title: string;
  intro: string;
  /** Rapid-fire scenarios, then the single unassisted trade write-up. */
  rapid: MasteryQuestion[];
  writeUp: {
    symbol: string;
    timeframe: string;
    series: { t: number; o: number; h: number; l: number; c: number }[];
    fields: { id: string; label: string; placeholder: string }[];
  };
  /** Kai scores by dimension: Analysis / Risk Management / Execution. */
  dimensions: { key: string; label: string }[];
  passPct: number;
};

export type LessonScreen =
  | OpeningScreen
  | ConceptScreen
  | QuizScreen
  | VideoScreen
  | AuctionScreen
  | SortingScreen
  | KaiCheckScreen
  | MarketApplicationScreen
  | MasteryChallengeScreen
  | CompletionScreen
  | TradeBuilderScreen
  | SetupTriageScreen
  | PaperSimScreen
  | JournalScreen
  | FinalExamScreen;

export type LessonScreenType = LessonScreen['type'];

/** The screen types that have a renderer today. */
export const IMPLEMENTED_SCREEN_TYPES = [
  'opening',
  'concept',
  'quiz',
  'video',
  'auction',
  'sorting',
  'kai_check',
  'market_application',
  'mastery_challenge',
  'completion',
] as const satisfies readonly LessonScreenType[];

export type ImplementedScreenType = (typeof IMPLEMENTED_SCREEN_TYPES)[number];

export type LessonContent = {
  lessonId: string;
  /** Walked in order. The last one should be a `completion`. */
  screens: LessonScreen[];
};

/* ─────────────────────────────── the profile ────────────────────────────── */

export type TrainingMastery = Record<TrainingSkill, number>;

export type TrainingDayProgress = {
  completedLessonIds: string[];
  /** Best score the member has posted on this day's measured screens, or null. */
  bestScorePct: number | null;
};

/**
 * Everything about a learner, and JSON-serialisable end to end because it is
 * stored whole in AsyncStorage under one key.
 */
export type TrainingProfile = {
  completedLessonIds: string[];
  currentLessonId: string;
  mastery: TrainingMastery;
  streak: number;
  readiness: 'beginner' | 'guided' | 'assisted';
  /** Granular signals keyed by `CompetencyTag.key`. */
  competencies: Record<string, CompetencySignal>;
  /** Keyed by day id. */
  dayProgress: Record<string, TrainingDayProgress>;
};

/** What one walk through a lesson produced. Handed to the store on completion. */
export type LessonRunResult = {
  lessonId: string;
  dayId: string;
  skill: TrainingSkill;
  /** 0–100 across every scored question in the lesson; null if none were scored. */
  scorePct: number | null;
  masteryGain: number;
  competencies: Record<string, CompetencySignal>;
};
