/**
 * Kai's voice.
 *
 * OpenAI `gpt-4o-mini-tts`, ash for Kai and coral for the cohost — the standing
 * default. One object per (text, voice, model, speed) hash in the `live-audio`
 * bucket, so re-running a show costs nothing at the TTS and a fixed typo costs
 * one line.
 *
 * THE CACHE KEY INCLUDES THE VOICE, AND THAT IS NOT AN OPTIMISATION DETAIL.
 * The deprecated show cached per (ticker, phase) and then changed the cohost
 * voice; every replay kept playing the old voice from cache, and the only way
 * out was deleting the directory. A cache keyed on the thing that produced the
 * audio cannot do that.
 *
 * WAV, NOT MP3, so the duration can be MEASURED. `SayFrame.duration_ms` is what
 * every chart action in the line is timed against — a level drawn at 0.6 through
 * a sentence lands where it lands because the audio's real length is known. An
 * estimated duration would put every mark slightly off the words, which is
 * precisely the thing that reads as a script rather than a person. (Guard from
 * the same show, learned the hard way: OpenAI streams `0xFFFFFFFF` as the WAV
 * data-chunk size, so the header's claim is capped against the real buffer.)
 *
 * WHEN THERE IS NO TTS AT ALL — no key, no credits, provider down — a segment is
 * still produced. `audio_url` is null, `audio_state` is `estimated`, and the
 * duration is worked out from the words. The show plays as captions over a
 * moving chart. That degrade is deliberate and is the reason `audio_url` is
 * nullable in the contract: a credit outage should cost the audio, not the show.
 */
import { createHash } from 'node:crypto';
import { config } from './config.ts';
import { log } from './log.ts';
import { db } from './db.ts';
import { Budget, ttsCostUsd } from './budget.ts';

export type SpeechResult = {
  audio_url: string | null;
  duration_ms: number;
  state: 'ready' | 'estimated' | 'failed';
  cached: boolean;
};

export type TtsStatus = { available: boolean; reason: string | null };

let status: TtsStatus = { available: true, reason: null };

/**
 * Latched unavailability.
 *
 * The first 401 or 429 means the next four hundred lines will also fail, and
 * paying the latency of four hundred failed HTTPS requests to discover that is
 * how a show that could have run as captions instead runs as nothing.
 */
function disable(reason: string): void {
  if (status.available) {
    status = { available: false, reason };
    log('error', 'tts.disabled', { reason, note: 'the show continues with captions and no audio' });
  }
}

export function ttsStatus(): TtsStatus {
  return status;
}

/** Roughly 165 words a minute plus a beat per sentence. Only used with no audio. */
export function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const sentences = (text.match(/[.!?]/g) ?? []).length;
  return Math.max(900, Math.round((words / 165) * 60_000 + sentences * 280));
}

/**
 * Duration from a RIFF/WAVE header. Returns null for anything it does not
 * recognise rather than guessing — a wrong duration is worse than a known
 * estimate, because it is trusted.
 */
export function wavDurationMs(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === 'data') {
      // The header's size is not to be trusted: streamed WAVs carry 0xFFFFFFFF.
      const real = Math.min(size === 0xffffffff ? Infinity : size, buf.length - body);
      if (!byteRate) return null;
      return Math.round((real / byteRate) * 1000);
    }
    if (size === 0xffffffff) break;
    offset = body + size + (size % 2);
  }
  return null;
}

function keyFor(text: string, voice: string, model: string, speed: number): string {
  const h = createHash('sha256').update(`${model}|${voice}|${speed}|${text}`).digest('hex').slice(0, 32);
  return `${voice}/${h}.wav`;
}

/**
 * The delivery note handed to the TTS engine.
 *
 * Not the same for both voices: Kai is the analyst working the chart and the
 * cohost frames and hands over, and reading both at the same energy is what
 * makes a two-voice show sound like one person doing an accent.
 */
function instructionsFor(voice: 'kai' | 'cohost'): string {
  return voice === 'kai'
    ? 'A market analyst talking to a camera. Direct, unhurried, certain. Land on the numbers. Let a short sentence sit before the next one.'
    : 'A show host framing a segment and handing over. Warm, brisk, welcoming. Never breathless.';
}

async function existingUrl(path: string): Promise<string | null> {
  const bucket = config.audioBucket();
  const slash = path.lastIndexOf('/');
  const dir = slash > 0 ? path.slice(0, slash) : '';
  const name = slash > 0 ? path.slice(slash + 1) : path;
  const { data, error } = await db().storage.from(bucket).list(dir, { search: name, limit: 1 });
  if (error || !data?.length) return null;
  return publicUrl(path);
}

function publicUrl(path: string): string {
  return db().storage.from(config.audioBucket()).getPublicUrl(path).data.publicUrl;
}

/**
 * One line, spoken.
 *
 * Never throws. Every failure path lands on an estimated duration and a null
 * URL, because the caller is a director in the middle of a show and there is
 * nothing useful for it to do with an exception.
 */
export async function speak(opts: {
  text: string;
  voice: 'kai' | 'cohost';
  budget: Budget;
  segment: number;
}): Promise<SpeechResult> {
  const text = opts.text.trim();
  if (!text) return { audio_url: null, duration_ms: 0, state: 'estimated', cached: false };

  const model = config.ttsModel();
  const voiceName = opts.voice === 'kai' ? config.ttsVoiceKai() : config.ttsVoiceCohost();
  const speed = Number(process.env.LIVE_TTS_SPEED ?? 1.0);
  const path = keyFor(text, voiceName, model, speed);

  const key = config.openaiKey();
  if (!key) {
    disable('OPENAI_API_KEY is not set');
    return { audio_url: null, duration_ms: estimateDurationMs(text), state: 'estimated', cached: false };
  }
  if (!status.available) {
    return { audio_url: null, duration_ms: estimateDurationMs(text), state: 'estimated', cached: false };
  }

  // Cache first. A hit costs one list call and nothing else — no model, no
  // storage write, no dollars.
  const hit = await existingUrl(path).catch(() => null);
  if (hit) {
    const head = await fetch(hit).catch(() => null);
    const buf = head?.ok ? Buffer.from(await head.arrayBuffer()) : null;
    const ms = buf ? wavDurationMs(buf) : null;
    return {
      audio_url: hit,
      duration_ms: ms ?? estimateDurationMs(text),
      state: ms ? 'ready' : 'estimated',
      cached: true,
    };
  }

  let buf: Buffer;
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        voice: voiceName,
        input: text,
        response_format: 'wav',
        speed,
        instructions: instructionsFor(opts.voice),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      const reason = `${res.status} ${body.slice(0, 160)}`;
      // 401/402/429 are the show-is-over-for-audio class. A 500 might be one
      // bad request, so it fails this line without latching the whole run.
      if (res.status === 401 || res.status === 402 || res.status === 429) disable(reason);
      else log('warn', 'tts.line_failed', { status: res.status });
      return { audio_url: null, duration_ms: estimateDurationMs(text), state: 'estimated', cached: false };
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    log('warn', 'tts.request_failed', { message: String(e) });
    return { audio_url: null, duration_ms: estimateDurationMs(text), state: 'estimated', cached: false };
  }

  opts.budget.record({
    segment: opts.segment,
    kind: 'tts',
    usd: ttsCostUsd(text.length),
    detail: `${voiceName} ${text.length} chars`,
    // Marked NOT measured: the per-character rate is an approximation. See
    // budget.ts.
    measured: false,
  });

  const up = await db()
    .storage.from(config.audioBucket())
    .upload(path, buf, { contentType: 'audio/wav', upsert: true, cacheControl: '31536000' });

  if (up.error) {
    log('warn', 'tts.upload_failed', { message: up.error.message });
    return {
      audio_url: null,
      duration_ms: wavDurationMs(buf) ?? estimateDurationMs(text),
      state: 'estimated',
      cached: false,
    };
  }

  const ms = wavDurationMs(buf);
  return {
    audio_url: publicUrl(path),
    duration_ms: ms ?? estimateDurationMs(text),
    state: ms ? 'ready' : 'estimated',
    cached: false,
  };
}
