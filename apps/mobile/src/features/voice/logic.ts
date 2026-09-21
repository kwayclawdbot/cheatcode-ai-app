/**
 * THE PARTS OF HANDS-FREE THAT HAVE NO MICROPHONE IN THEM (lane C).
 *
 * Pure, dependency-free, and run by `scripts/voice-logic-test.mts` in a plain
 * tsx process: when to stop listening, how loud the meter should look, and
 * which reply to read out. The hook in `useKaiVoice.tsx` owns the hardware and
 * asks this file every question it has to answer about it.
 */

/* ==================================================================== */
/* 1. When to stop listening                                            */
/* ==================================================================== */

export type SilenceVerdict = 'listening' | 'stop_after_speech' | 'stop_nothing_heard' | 'stop_too_long';

export type SilenceOptions = {
  /** How long a pause after speech ends the question. The brief says ~1.5 s. */
  silenceMs?: number;
  /** Give up if nobody has said anything by now. */
  noSpeechMs?: number;
  /** Hard ceiling — the server refuses more than 60 s. */
  maxMs?: number;
  /** Speech must be at least this loud (dBFS) whatever the room is like. */
  minSpeechDb?: number;
};

/**
 * A pause detector that LEARNS THE ROOM.
 *
 * A fixed threshold fails both ways on a phone: in a quiet bedroom the floor is
 * about -60 dBFS and a whisper clears -45; on a street the floor itself is -40
 * and a fixed -45 "speech" line never goes quiet, so it would listen forever.
 * So the floor is the quietest level heard so far, speech is anything 12 dB
 * over it (and never quieter than `minSpeechDb`), and a pause is dropping 3 dB
 * back under that line. The floor is a RUNNING minimum rather than a
 * calibration window on purpose: someone who starts talking the instant they
 * tap would otherwise calibrate the floor on their own voice, and the first
 * breath between words corrects it.
 *
 * It only ever STOPS AFTER SPEECH. Silence before anyone has spoken is someone
 * gathering their thought, not the end of a question — that case gets the much
 * longer `noSpeechMs` and a different verdict, so the app can say "I didn't
 * hear anything" instead of sending an empty recording.
 *
 * Metering can be missing (a platform that does not report it); then `feed` is
 * simply never called with a level and only the ceiling applies. Tap-to-stop
 * always works regardless.
 */
export function createSilenceDetector(opts: SilenceOptions = {}) {
  const silenceMs = opts.silenceMs ?? 1500;
  const noSpeechMs = opts.noSpeechMs ?? 8000;
  const maxMs = opts.maxMs ?? 60_000;
  const minSpeechDb = opts.minSpeechDb ?? -50;
  const LOUD_DB = -30;

  let floor = Infinity;
  let spoke = false;
  let quietSince: number | null = null;

  return {
    feed(db: number | undefined, atMs: number): SilenceVerdict {
      if (atMs >= maxMs) return 'stop_too_long';
      if (typeof db !== 'number' || !Number.isFinite(db)) {
        return !spoke && atMs >= noSpeechMs ? 'stop_nothing_heard' : 'listening';
      }
      const level = Math.max(db, -100);
      floor = Math.min(floor, level);
      const speechLine = Math.max(minSpeechDb, floor + 12);

      // OR LOUD IN ABSOLUTE TERMS. Someone who talks from the first sample with
      // no gap has set the floor on their own voice, so nothing is "12 dB over"
      // it yet. Erring towards "they spoke" costs a transcription of a noisy
      // room; erring the other way throws a real question away.
      if (level >= speechLine || level >= LOUD_DB) {
        spoke = true;
        quietSince = null;
        return 'listening';
      }
      if (!spoke) return atMs >= noSpeechMs ? 'stop_nothing_heard' : 'listening';
      if (level < Math.min(speechLine, LOUD_DB) - 3) {
        if (quietSince === null) quietSince = atMs;
        return atMs - quietSince >= silenceMs ? 'stop_after_speech' : 'listening';
      }
      // Between the lines: trailing off, not yet a pause. Keep the clock
      // running rather than resetting it, so a mumbled tail does not hold the
      // microphone open.
      return 'listening';
    },
    get heardSpeech() {
      return spoke;
    },
  };
}

/* ==================================================================== */
/* 2. The meter                                                          */
/* ==================================================================== */

/** dBFS (-160 silence … 0 full scale) → 0..1 for drawing. */
export function meterLevel(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const v = (db + 60) / 50;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** `0:07`. A timer with no hours, because the ceiling is a minute. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ==================================================================== */
/* 3. Which reply to read out                                            */
/* ==================================================================== */

export type WallLike = { kind: string; id: string; text?: string; streaming?: boolean };

/**
 * THE REPLY THAT JUST FINISHED, OR NOTHING.
 *
 * Called on the edge where Kai stops streaming. It returns the last Kai text
 * AFTER the member's last message — so a turn that was stopped, failed cold, or
 * produced only a card says nothing, and history loaded from the server (which
 * never streamed) is never read aloud. `alreadySpoken` stops a re-render from
 * saying the same reply twice.
 */
export function replyToSpeak(items: readonly WallLike[], alreadySpoken: string | null): WallLike | null {
  let lastUser = -1;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].kind === 'user_text') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return null;
  for (let i = items.length - 1; i > lastUser; i -= 1) {
    const it = items[i];
    if (it.kind === 'kai_text') {
      if (it.streaming || !it.text?.trim() || it.id === alreadySpoken) return null;
      return it;
    }
  }
  return null;
}

/* ==================================================================== */
/* 4. The upload's file name                                             */
/* ==================================================================== */

/** The server decides the format from the name, so the name must match the bytes. */
export function fileFor(mime: string | null | undefined, fallbackExt = 'm4a'): { name: string; type: string } {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/webm' || base === 'video/webm') return { name: 'voice.webm', type: 'audio/webm' };
  if (base === 'audio/ogg') return { name: 'voice.ogg', type: 'audio/ogg' };
  if (base === 'audio/mp4' || base === 'audio/m4a' || base === 'audio/x-m4a' || base === 'audio/aac') {
    return { name: 'voice.m4a', type: 'audio/mp4' };
  }
  if (base === 'audio/wav' || base === 'audio/x-wav') return { name: 'voice.wav', type: 'audio/wav' };
  return fallbackExt === 'm4a' ? { name: 'voice.m4a', type: 'audio/m4a' } : { name: `voice.${fallbackExt}`, type: `audio/${fallbackExt}` };
}
