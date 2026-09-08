/**
 * The bridge that lets a stage actually evolve (0042).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A HOOK AND NOT A CALL INSIDE `completeLessonRun`
 * ─────────────────────────────────────────────────────────────────────────────
 * The natural place to report a finished lesson is the moment one finishes,
 * inside the training store's `completeLessonRun`. That store belongs to the
 * training lane and this work does not edit it, so instead this WATCHES the
 * store's public value from outside and reports when it changes. The effect is
 * the same and the coupling runs one way: training knows nothing about stages.
 *
 * It also turns out to be the more robust of the two. Reporting on the event
 * loses the report if the request fails or the app dies mid-lesson; reporting
 * on the STATE re-reports the same evidence next time the screen mounts, and
 * the server's ratchet makes a repeat call a no-op. A member who graduates on a
 * plane is promoted the next time they open the app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT SENDS, AND WHAT IT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Evidence — per-skill mastery and per-day scores and completions. Never a
 * conclusion: the server re-grades it against its own copy of the gates, for
 * the reasons argued in `apps/api/src/lib/stage/rules.ts`.
 *
 * It is deliberately silent. A promotion is a nice thing to be told about and
 * this is not the thing that tells you — Home redraws for the new stage and the
 * tag beside your name changes. A toast that fired on app-open because a
 * retried request finally landed would be worse than no toast.
 */
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { useTraining } from '../training/store';

/**
 * @param onChanged called only when the server actually moved the stage, so the
 *        caller can refresh the profile that Home and the community line read.
 */
export function useStageEvolution(onChanged?: () => void) {
  const { profile, ready, enrolled } = useTraining();
  // What we last sent. Prevents a re-render storm from becoming a request
  // storm, and makes the "report the state" design above cheap.
  const lastSent = useRef<string | null>(null);
  // Held in a ref rather than named in the dependency list. Callers pass things
  // like `refreshProfile`, which is a new function on every render — as a
  // dependency it would re-run this effect on every render of Home forever.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!ready || !enrolled) return;
    if (!api.available()) return;

    const day_progress = Object.fromEntries(
      Object.entries(profile.dayProgress ?? {}).map(([dayId, d]) => [
        dayId,
        { completed_lesson_ids: d.completedLessonIds ?? [], best_score_pct: d.bestScorePct ?? null },
      ])
    );
    const body = { mastery: profile.mastery ?? {}, day_progress };

    const signature = JSON.stringify(body);
    if (signature === lastSent.current) return;
    lastSent.current = signature;

    let cancelled = false;
    void (async () => {
      try {
        const res = await api.evaluateStage(body);
        if (!cancelled && res?.changed) onChangedRef.current?.();
      } catch {
        // Never surface this. A member who just finished a lesson is not the
        // person to hand a networking error to, and the next mount retries the
        // same evidence anyway — so allow the retry rather than blocking it.
        lastSent.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, enrolled, profile]);
}
