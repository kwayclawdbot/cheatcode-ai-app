/**
 * Kai's voice, playing under one answer (LIVE-8).
 *
 * ITS REAL JOB IS TO BE A CLOCK. Playing a WAV is four lines; what this exists
 * for is `now()`, which reports where the VOICE is rather than how long ago the
 * answer started. `runChartAnswer` times every gesture against it, so the hand
 * moving to a level and Kai saying its name are the same event even when the
 * audio does not cooperate — a file that takes half a second to load, or stalls
 * mid-sentence on a bad connection, drags the chart along with it instead of
 * leaving the gestures a beat ahead of the words.
 *
 * A WALL CLOCK IS THE FALLBACK, NOT A FAILURE. With voice switched off, no
 * credits, or a provider that did not answer, `audio_url` is null, this returns
 * `Date.now` and the answer performs silently over its written words — which is
 * exactly how the feature shipped before there was a voice at all. Nothing else
 * in the path knows the difference.
 *
 * SEPARATE FILE BECAUSE OF WHAT IT IMPORTS. `expo-audio` is a native module;
 * keeping it here is what lets `answer.ts` — the pacing, the interruption
 * handling, the part with the tests — stay pure and run in a plain tsx process.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

export type AnswerVoice = {
  /** Milliseconds into the answer, as the listener hears it. */
  now: () => number;
  /** Stop and release. Safe to call twice; called on finish and on cancel. */
  stop: () => void;
};

export function playAnswer(url: string | null): AnswerVoice {
  if (!url) {
    const startedAt = Date.now();
    return { now: () => Date.now() - startedAt, stop: () => {} };
  }

  let player: AudioPlayer | null = null;
  try {
    player = createAudioPlayer(url);
    player.play();
  } catch {
    // A voice that will not start is not a broken answer. Fall back to the wall
    // clock and let the chart perform over the written words.
    player = null;
  }

  const startedAt = Date.now();
  let stopped = false;
  /**
   * How long the chart will wait for a voice that never arrives.
   *
   * Holding at zero until the first sample is right — see below — but a file
   * that silently never loads leaves `currentTime` at zero forever, and a
   * runner pacing against a clock that does not advance never fires another
   * gesture. The answer would sit there, written on screen, under a chart that
   * never moved. Three seconds is longer than a cached WAV takes to start and
   * short enough that the fallback still feels like an answer.
   */
  const GIVE_UP_MS = 3000;
  let started = false;

  return {
    now: () => {
      if (!player || stopped) return Date.now() - startedAt;
      const waited = Date.now() - startedAt;
      let at = 0;
      try {
        at = Math.max(0, Math.round(player.currentTime * 1000));
      } catch {
        return waited;
      }
      if (at > 0) started = true;
      /**
       * BEFORE THE FIRST SAMPLE, HOLD AT ZERO.
       *
       * `currentTime` is 0 while the file is still loading, and returning the
       * wall clock during that window would fire the opening gestures before Kai
       * has said anything. Zero is the honest answer: he has not started, so
       * neither has the chart.
       */
      if (!started && waited < GIVE_UP_MS) return 0;
      // It never started. Perform the answer silently rather than not at all.
      if (!started) return waited - GIVE_UP_MS;
      return at;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        player?.pause();
        player?.remove();
      } catch {
        /* already gone */
      }
      player = null;
    },
  };
}
