/**
 * THE STAGE FOLLOWS THE BELT NOW (BELT-MERGE-spec.md §9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS HOOK USED TO DO, AND WHY IT HAD TO STOP
 * ─────────────────────────────────────────────────────────────────────────────
 * It watched the local training profile and POSTed it to `/stage/evaluate` as
 * READINESS EVIDENCE — per-skill mastery and per-day scores — for the server to
 * re-grade. That was the right design for the architecture it was written
 * against, and its own header said so: training progress lived only in
 * AsyncStorage, the phone was the only thing that knew, and the choice was
 * between believing the phone's evidence and believing its conclusions.
 *
 * The architecture changed underneath it. Two things happened:
 *
 *   1. TRAINING PROGRESS IS ON THE SERVER (0046). The evidence argument is
 *      gone: the server can read the rows itself. `lib/stage/rules.ts` predicted
 *      this exactly — "when training gets server persistence, the evidence
 *      argument disappears".
 *   2. THE BELT BECAME THE MEASURED LADDER (0047). It has an exam behind it.
 *      Stage measures roughly what the belt measures, and the spec's §9 refuses
 *      to let the product carry the same ladder twice: stage DERIVES from belt —
 *      white → beginner, blue/purple → developing, brown/black → trade ready —
 *      and `grade_belt_exam` is what writes it.
 *
 * That leaves the old path actively harmful rather than merely redundant. The
 * local profile was the CONTAMINATED one: one AsyncStorage key with no account
 * id, so two accounts on one handset inherited each other's learning (audit
 * F10), and this hook was the pipe that carried the contamination into
 * `profiles.stage`. Sending it at all is the bug.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SO WHAT IS LEFT
 * ─────────────────────────────────────────────────────────────────────────────
 * A READ. The server has already decided; this asks what it decided and tells
 * the caller when the answer differs from the profile the app is holding, so
 * Home can refresh and redraw for the new stage. It sends nothing, claims
 * nothing, and cannot promote anybody.
 *
 * The signature is unchanged — `app/(tabs)/home.tsx` calls
 * `useStageEvolution(refreshProfile)` and keeps working — and it stays
 * deliberately silent. A promotion is a nice thing to be told about and this is
 * not the thing that tells you: Home redraws and the tag beside your name
 * changes. A toast firing on app-open because a request finally landed would be
 * worse than no toast.
 */
import { useEffect, useRef } from 'react';
import { useSession } from '../../lib/session';
import { fetchBeltProfile, trainingApiAvailable } from '../training/remote';

/**
 * @param onChanged called only when the server's stage differs from the one the
 *        app is currently showing, so the caller can refresh the profile that
 *        Home and the community line read.
 */
export function useStageEvolution(onChanged?: () => void) {
  const { session, profile } = useSession();
  const userId = session?.user?.id ?? null;
  const held = profile?.stage ?? null;

  // Held in a ref rather than named in the dependency list. Callers pass things
  // like `refreshProfile`, which is a new function on every render — as a
  // dependency it would re-run this effect on every render of Home forever.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // What we last saw the server say, per account. Stops a re-render storm from
  // becoming a request storm, and resets when the account changes.
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !trainingApiAvailable()) return;
    const signature = `${userId}:${held ?? '-'}`;
    if (signature === lastSeen.current) return;
    lastSeen.current = signature;

    let cancelled = false;
    void (async () => {
      try {
        const belt = await fetchBeltProfile();
        if (cancelled) return;
        // The server applied the stage when the exam was passed. If what it
        // holds is not what this app is showing, the app is stale.
        if (belt.stage && belt.stage !== held) onChangedRef.current?.();
      } catch {
        // Never surface this. Allow the next mount to retry rather than
        // pinning a failure signature that would block it.
        lastSeen.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, held]);
}
