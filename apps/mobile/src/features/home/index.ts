export { ModeChip, ModeSheet, ModeControl, ModeSegmented, MODE_LABEL } from './ModeSheet';
export { useHomeV5, usePriorityCandles } from './useHomeV5';
export type { HomeFixture, HomeV5Plus } from './useHomeV5';
export { ConversationsDrawer } from './ConversationsDrawer';
export { useConversations } from './useConversations';
/** Redesign V2 — Kai is an agent (docs/design/redesign-2026-09-21). */
export {
  KAI_OFFLINE_PLAIN, briefFootnote, briefRows, chartCaption, clockLabel, composeBrief, composeOpening, dateLabel,
  followUps, greeting, learningPlacement, mentionedSymbols, monitoringLine, rMultiple, resumeToday, statusLine,
} from './agent';
export type { AgentOpen, BriefRow, FollowUp, ResponseObjects, TodayBrief } from './agent';
export { KaiMessage, KaiWords, KaiNote, UserMessage, FollowUpChips, MonitoringLine } from './KaiThread';
export { TodayBriefCard, BriefRowView } from './TodayBriefCard';
export { SetupToolCard } from './SetupToolCard';
export { ComparisonToolCard } from './ComparisonToolCard';
export { LearningPathCard } from './LearningPathCard';
export { KaiComposer } from './KaiComposer';
