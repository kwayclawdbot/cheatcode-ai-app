export type TrainingLessonKind =
  | 'interactive'
  | 'video'
  | 'kai_practice'
  | 'chart_challenge'
  | 'mastery';

export type TrainingSkill =
  | 'market_basics'
  | 'candles'
  | 'market_structure'
  | 'support_resistance'
  | 'entries'
  | 'risk_management'
  | 'trade_management';

export type TrainingLesson = {
  id: string;
  unitId: string;
  title: string;
  subtitle: string;
  kind: TrainingLessonKind;
  minutes: number;
  skill: TrainingSkill;
  image?: number;
};

export type TrainingUnit = {
  id: string;
  title: string;
  subtitle: string;
  lessons: TrainingLesson[];
};

export type TrainingMastery = Record<TrainingSkill, number>;

export type TrainingProfile = {
  completedLessonIds: string[];
  currentLessonId: string;
  mastery: TrainingMastery;
  streak: number;
  readiness: 'beginner' | 'guided' | 'assisted';
};
