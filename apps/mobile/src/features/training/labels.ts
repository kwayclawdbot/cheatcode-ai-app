import { color } from '../../ui/tokens';
import type { CompetencySignal, TrainingLessonKind, TrainingSkill } from './types';

/** The member-facing name of each mastery area. One place, every screen. */
export const SKILL_LABEL: Record<TrainingSkill, string> = {
  market_basics: 'Market Basics',
  candles: 'Candlesticks',
  market_structure: 'Market Structure',
  trend: 'Trend',
  support_resistance: 'Support & Resistance',
  setups: 'Setups',
  entries: 'Entries & Exits',
  risk_management: 'Risk Management',
  trade_management: 'Trade Management',
};

/** Display order on the progress board — the order the programme teaches them. */
export const SKILL_ORDER: TrainingSkill[] = [
  'market_basics',
  'candles',
  'market_structure',
  'trend',
  'support_resistance',
  'setups',
  'entries',
  'risk_management',
  'trade_management',
];

export const LESSON_KIND_LABEL: Record<TrainingLessonKind, string> = {
  interactive: 'Interactive',
  video: 'Video + Practice',
  kai_practice: 'Kai Practice',
  chart_challenge: 'Chart Challenge',
  trade_builder: 'Trade Builder',
  simulation: 'Simulation',
  journal: 'Journal',
  mastery: 'Mastery',
};

/**
 * A competency signal's word and its colour.
 *
 * `passed` is muted on purpose. It is the signal a free-response answer earns,
 * and it means "you said it in your own words", not "a machine agreed with
 * you". Colouring it like `mastered` would quietly upgrade a claim nothing
 * measured.
 */
export const SIGNAL_META: Record<CompetencySignal, { label: string; c: string }> = {
  mastered: { label: 'Mastered', c: color.volt },
  strong: { label: 'Strong', c: color.green },
  developing: { label: 'Developing', c: color.gold },
  passed: { label: 'Passed', c: color.muted },
  unproven: { label: 'Not yet shown', c: color.dim },
};
