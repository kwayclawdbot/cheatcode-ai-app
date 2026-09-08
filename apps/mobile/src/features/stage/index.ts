/**
 * Readiness stage (0042) — where the funnel thinks a member is, and what the
 * app does about it.
 *
 * The stage MOVES. Nothing in here should be written as though it were an
 * identity: it is set at onboarding from one question, and after that it is
 * earned in Training Mode and can be corrected by staff.
 */
export { StageTag } from './StageTag';
export { STAGE_LABEL, STAGE_BLURB, STAGE_NEXT, START_OPTIONS } from './labels';
export { homeOrderFor, type HomeOrder } from './home-order';
export { useStageEvolution } from './useStageEvolution';
