/**
 * The parts of Kai's voice that BOTH callers have to agree on (LIVE-8).
 *
 * There are two now: the show, which speaks a five-minute segment, and Kai
 * answering a question on the chart, which speaks fifteen seconds. They share a
 * storage bucket, and that is the whole reason this file exists.
 *
 * THE CACHE KEY IS THE THING THAT MUST NOT DRIFT. One object per
 * (model, voice, speed, text) hash. If the two callers computed that hash even
 * slightly differently they would not collide — they would quietly keep two
 * copies of every line, pay twice, and diverge the first time a voice changed on
 * one side. It is not an optimisation detail: the deprecated show cached per
 * (ticker, phase), then changed the cohost voice, and every replay kept playing
 * the old voice until someone deleted the directory. A cache keyed on the thing
 * that PRODUCED the audio cannot do that.
 *
 * WAV, NOT MP3, so the duration can be MEASURED rather than estimated. Every
 * chart action is timed against the length of the line it belongs to — a level
 * drawn 60% of the way through a sentence lands where it lands because the
 * audio's real length is known. An estimated duration puts every mark slightly
 * off the words, which is precisely what reads as a script rather than a person.
 *
 * Pure and dependency-free on purpose: no storage client, no HTTP, no key. Each
 * caller keeps its own of those, because the worker charges a segment budget and
 * the API does not.
 */

/** Who is speaking. `ash` leads, `coral` bridges — the standing default. */
export type TtsVoice = 'kai' | 'cohost';

/** What a line's audio ended up being. */
export type SpeechResult = {
  audio_url: string | null;
  duration_ms: number;
  /** `ready` means the duration was measured off real audio. */
  state: 'ready' | 'estimated' | 'failed';
  cached: boolean;
};

/** One object per (model, voice, speed, text). Shared by every caller. */
export function audioKeyFor(opts: {
  text: string;
  voice: string;
  model: string;
  speed: number;
  /** Node's `createHash`, injected so this file needs no imports at all. */
  sha256: (input: string) => string;
}): string {
  const h = opts.sha256(`${opts.model}|${opts.voice}|${opts.speed}|${opts.text}`).slice(0, 32);
  return `${opts.voice}/${h}.wav`;
}

/**
 * The delivery note handed to the engine.
 *
 * Not the same for both voices: Kai is the analyst working the chart and the
 * cohost frames and hands over. Reading both at the same energy is what makes a
 * two-voice show sound like one person doing an accent.
 */
export function instructionsFor(voice: TtsVoice): string {
  return voice === 'kai'
    ? 'A market analyst talking to a camera. Direct, unhurried, certain. Land on the numbers. Let a short sentence sit before the next one.'
    : 'A show host framing a segment and handing over. Warm, brisk, welcoming. Never breathless.';
}

/** Roughly 165 words a minute plus a beat per sentence. Only used with no audio. */
export function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const sentences = (text.match(/[.!?]/g) ?? []).length;
  return Math.max(900, Math.round((words / 165) * 60_000 + sentences * 280));
}

/**
 * Duration from a RIFF/WAVE header.
 *
 * Returns null for anything it does not recognise rather than guessing — a wrong
 * duration is worse than a known estimate, because it is trusted. (Guard learned
 * the hard way: OpenAI streams `0xFFFFFFFF` as the WAV data-chunk size, so the
 * header's claim is capped against the real buffer.)
 */
export function wavDurationMs(buf: Uint8Array): number | null {
  if (buf.length < 44) return null;
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  const u32 = (at: number) =>
    buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16) | (buf[at + 3] << 24 >>> 0);

  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WAVE') return null;

  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = ascii(offset, offset + 4);
    const size = u32(offset + 4) >>> 0;
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      byteRate = u32(body + 8) >>> 0;
    } else if (id === 'data') {
      const real = Math.min(size === 0xffffffff ? Infinity : size, buf.length - body);
      if (!byteRate) return null;
      return Math.round((real / byteRate) * 1000);
    }
    if (size === 0xffffffff) break;
    offset = body + size + (size % 2);
  }
  return null;
}
