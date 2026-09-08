/**
 * Connectivity, remembered reads, and the composer's saved draft.
 *
 * Built for the recovery board (board 07, right screen) and for audit F18's
 * "shared loading, quiet, stale, offline, blocked and failed patterns" — the
 * vocabulary itself lives in `ui/CapabilityState.tsx` so surfaces that need the
 * words but not the network can use it without pulling NetInfo in.
 */
export { useConnectivity, recheck, snapshot, readState, __setConnectivityForTest } from './connectivity';
export type { Connectivity } from './connectivity';
export { useCachedRead } from './useCachedRead';
export type { CachedResource, CachedSource } from './useCachedRead';
export { useDraft, DRAFT_MAX_AGE_MS } from './useDraft';
export type { Draft } from './useDraft';
export { OfflineBanner } from './OfflineBanner';
export { SavedPlanCard } from './SavedPlanCard';
