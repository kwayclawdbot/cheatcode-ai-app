/**
 * Running one of Kai's answers on the chart (LIVE-8).
 *
 * The user asked a question about the chart they are looking at and the server
 * sent back the whole answer at once: the words, and the chart actions with the
 * millisecond each one belongs to. This runs them.
 *
 * WHY A RUNNER AND NOT A LOOP AT THE CALL SITE. Three things have to be true at
 * once and none of them survives being written inline:
 *
 *   IT IS SINGLE-CONSUMER. `applyChartCommand` keeps a queue of one and a second
 *   sequence SUPERSEDES the first — so two actions fired without awaiting the
 *   first would leave the level the first was drawing silently never drawn. Each
 *   action is therefore awaited, exactly as `LivePlayer` awaits the show's.
 *
 *   THE CLOCK IS THE ANSWER'S, NOT THE ACTION'S. Each action is due at its own
 *   offset from the first word. An action that overruns its slot does not push
 *   everything after it back — the next one is already late and fires at once.
 *   Pacing against elapsed time rather than against the previous action is what
 *   keeps a gesture on the word it belongs to when one of them takes longer than
 *   its share.
 *
 *   AND WHEN THERE IS AUDIO, THAT CLOCK IS THE PLAYHEAD. `now` is injected, so
 *   the caller hands in `player.currentTime` and every gesture follows the words
 *   Kai is actually saying. It matters because an audio clock does not run at
 *   the rate a wall clock does: it starts late while the file loads and stops
 *   dead while it rebuffers. A wall clock through either of those runs the whole
 *   answer's gestures ahead of the voice, which is worse than no voice at all.
 *   Hence the re-check below rather than one sleep for the whole wait.
 *
 *   A SECOND QUESTION ABANDONS THE FIRST. `cancel()` stops the run between
 *   actions and tells `applyChartCommand` to drop whatever it is mid-way
 *   through. The newest intent is the one the user is owed.
 */

export type AnswerAction<F> = { t_offset_ms: number; frame: F };

export type AnswerRunResult = {
  reason: 'done' | 'cancelled';
  /** How many actions actually reached the chart. */
  fired: number;
  total: number;
};

export type AnswerRun = {
  cancel: () => void;
  done: Promise<AnswerRunResult>;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** How long the runner will sleep before looking at the clock again. */
const TICK_MS = 120;

export function runChartAnswer<F>(opts: {
  actions: AnswerAction<F>[];
  /**
   * Perform one action. Resolves when its choreography has finished — the
   * runner will not start the next until it does.
   */
  perform: (frame: F) => Promise<unknown> | unknown;
  /** Called with the action's own sentence as it fires, if it has one. */
  onFired?: (frame: F) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): AnswerRun {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? wait;
  // Offsets arrive in the order the director placed them, but a sort costs
  // nothing and a frame out of order would fire its whole remainder late.
  const actions = [...opts.actions].sort((a, b) => a.t_offset_ms - b.t_offset_ms);
  const state = { cancelled: false };

  const done = (async (): Promise<AnswerRunResult> => {
    /**
     * YIELD BEFORE THE FIRST ACTION, so `cancel()` in the same tick is seen.
     *
     * An answer's first gesture is usually due at offset zero, and without this
     * the loop reaches `perform` synchronously — before the caller that just
     * constructed the run has had a chance to cancel it. The Trade Portal does
     * exactly that when a second question arrives: it cancels the run it is
     * holding and starts a new one, in one tick. Without the yield the abandoned
     * answer still put its first mark on the chart.
     */
    await Promise.resolve();
    const startedAt = now();
    let fired = 0;
    for (const a of actions) {
      if (state.cancelled) return { reason: 'cancelled', fired, total: actions.length };
      const due = startedAt + a.t_offset_ms;
      /**
       * Wait in short hops, re-reading the clock each time.
       *
       * One `sleep(due - now())` assumes the clock advances a millisecond per
       * millisecond, which a wall clock does and an audio playhead does not. If
       * the voice stalls for a second, a single long sleep still expires on
       * schedule and the gesture fires over a silence. Re-checking costs a
       * handful of timer wakeups and keeps the hand on the word.
       */
      for (;;) {
        if (state.cancelled) return { reason: 'cancelled', fired, total: actions.length };
        const owed = due - now();
        if (owed <= 0) break;
        await sleep(Math.min(owed, TICK_MS));
      }
      if (state.cancelled) return { reason: 'cancelled', fired, total: actions.length };
      opts.onFired?.(a.frame);
      await opts.perform(a.frame);
      fired += 1;
    }
    return { reason: state.cancelled ? 'cancelled' : 'done', fired, total: actions.length };
  })();

  return {
    cancel: () => {
      state.cancelled = true;
    },
    done,
  };
}
