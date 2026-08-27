/**
 * The asset workspace — `src/features/setups` folded in (consolidation rule 1).
 * A setup no longer has a feature directory of its own: it is a module here.
 */
export { useWorkspace, useSetupDepth, useWorkspaceCandles, useWatchThis, WORKSPACE_TABS, WORKSPACE_TIMEFRAMES } from './useWorkspace';
export { SetupModuleCard, PositionModuleCard } from './SetupModule';
export { WorkspaceTabs, CommunityLine, SeeWhyPanel, KaiTab, PlanTab, CommunityTab, HistoryRail } from './tabs';
export { BuySellBar } from './BuySellBar';
