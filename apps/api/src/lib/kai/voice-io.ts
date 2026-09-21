/**
 * KAI, HANDS-FREE: the microphone in and the voice out (lane C, 2026-09-21).
 *
 * Two jobs, both on OpenAI, and the key never leaves the server:
 *
 *   hearing   the phone uploads what the member said; this sends it to OpenAI's
 *             transcription endpoint and returns the words.
 *   speaking  Kai's finished reply goes through `speak()` in `./tts.ts` — the
 *             same voice, bucket and cache the chart answer already uses — as
 *             an MP3, because a spoken chat reply is long and not choreographed.
 *
 * NEITHER NEEDS ANTHROPIC. When the Anthropic credit is exhausted Kai cannot
 * write a reply, but the microphone still hears and the voice still speaks the
 * reply that says so.
 *
 * Everything in this file that has no network in it is exported for
 * `scripts/kai-voice-test.mts`, which runs without a key, a database or a model.
 */
import { env } from '../env';
import { log } from '../log';

/* ==================================================================== */
/* 1. Limits                                                             */
/* ==================================================================== */

/**
 * THE BODY CAP IS VERCEL'S, NOT A TASTE. A serverless function refuses a
 * request body over 4.5 MB before our code runs, with an HTML error the app
 * cannot read. Capping at 4 MB means the member hears our sentence instead.
 * A minute of the phone's AAC at 64 kbit/s is under 0.5 MB, so this is room,
 * not a squeeze.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Under this there is nothing in the file but a container header. */
export const MIN_AUDIO_BYTES = 1_000;
/** One question, not a dictation. The app stops itself at this length too. */
export const MAX_AUDIO_SECONDS = 60;
/** What a spoken reply is cut to. About 75 seconds of Kai at his pace. */
export const MAX_SPOKEN_CHARS = 1_200;
/** What `/speak` will accept at all. A reply longer than this is not a reply. */
export const MAX_SPEAK_INPUT_CHARS = 8_000;

/**
 * The containers OpenAI transcription reads, keyed by what the phone says it
 * sent. The extension matters: OpenAI decides the format from the FILE NAME,
 * so a WebM blob uploaded as `voice.bin` fails even though the bytes are fine.
 */
const EXT_FOR_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/3gpp': 'mp4',
};

/** `audio/webm;codecs=opus` → `webm`, or null for a type we will not send on. */
export function extensionFor(mime: string | null | undefined): string | null {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  return EXT_FOR_TYPE[base] ?? null;
}

/* ==================================================================== */
/* 2. Prices — what OpenAI charges US                                    */
/* ==================================================================== */

/**
 * Dollars per MINUTE of audio, from OpenAI's published pricing page
 * (developers.openai.com/api/docs/pricing, read 2026-09-21). Transcription is
 * quoted per minute there directly. gpt-4o-mini-tts is quoted per token
 * ($0.60/M text in, $12/M audio out) with OpenAI's own estimate of about
 * $0.015 a minute of speech, which is the figure used here.
 *
 * Like `pricing.ts`: a model with no rate here is NOT priced at zero. It is
 * logged as unpriced and charged nothing, and the gap shows in the ledger.
 */
export const VOICE_USD_PER_MINUTE: Record<string, number> = {
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-4o-transcribe': 0.006,
  'whisper-1': 0.006,
  'gpt-4o-mini-tts': 0.015,
};

export function voiceCostUsd(model: string, durationMs: number): number | null {
  const rate = VOICE_USD_PER_MINUTE[model];
  if (rate === undefined || !Number.isFinite(durationMs) || durationMs < 0) return null;
  return Math.round(((durationMs / 60_000) * rate) * 1_000_000) / 1_000_000;
}

/* ==================================================================== */
/* 3. Switches                                                           */
/* ==================================================================== */

export const STT_MODEL = () => env('KAI_STT_MODEL') ?? 'gpt-4o-mini-transcribe';
/** Used only when the primary model itself is refused (not on an outage). */
export const STT_FALLBACK_MODEL = 'whisper-1';

/**
 * ONE SWITCH FOR THE WHOLE FEATURE. `KAI_VOICE=0` hides the microphone and the
 * voice-replies row in the app (they read `available` from `GET /kai/voice`),
 * so a switched-off voice is an absent button, never a dead one.
 */
export function voiceAvailable(): boolean {
  const flag = env('KAI_VOICE');
  if (flag === '0' || flag === 'false') return false;
  return Boolean(env('OPENAI_API_KEY'));
}

/* ==================================================================== */
/* 4. Hearing                                                            */
/* ==================================================================== */

export type Transcript = {
  text: string;
  model: string;
  /** From the provider when it reports one, else what the phone measured. */
  duration_ms: number;
};

/** Why hearing failed, in terms the route can turn into the right status. */
export class VoiceProviderError extends Error {
  constructor(
    readonly kind: 'unconfigured' | 'rejected' | 'unavailable',
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

/**
 * A spelling hint, not an instruction. Transcription models take a short
 * prompt as "text that came before this audio", which is how "Nvidia" comes
 * back as Nvidia and not "in video", and "NVDA" as a ticker.
 */
const HINT =
  'A trader asking Kai about the stock market. Tickers and names like Nvidia (NVDA), Tesla (TSLA), Apple (AAPL), SPY, QQQ, AMD, Palantir, VWAP, RSI.';

type FetchLike = typeof fetch;

async function callTranscribe(
  model: string,
  audio: Blob,
  filename: string,
  key: string,
  fetcher: FetchLike
): Promise<Response> {
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', model);
  form.append('response_format', 'json');
  form.append('language', 'en');
  form.append('prompt', HINT);
  return fetcher('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
}

/**
 * Words out of a recording. THROWS `VoiceProviderError` — unlike `speak()`,
 * there is no useful degraded answer to a question nobody could hear.
 *
 * FALLBACK IS NARROW ON PURPOSE. whisper-1 is tried only when OpenAI refuses the
 * primary MODEL (400/404 — renamed, retired, not on this key's project). An
 * outage (5xx, 429, timeout) is not retried on a second model: that doubles the
 * wait for an answer that will fail the same way.
 */
export async function transcribe(opts: {
  audio: Blob;
  filename: string;
  declaredMs: number;
  requestId: string;
  fetcher?: FetchLike;
}): Promise<Transcript> {
  const key = env('OPENAI_API_KEY');
  if (!key || !voiceAvailable()) throw new VoiceProviderError('unconfigured', 'voice is not configured');
  const fetcher = opts.fetcher ?? fetch;

  const attempt = async (model: string) => {
    let res: Response;
    try {
      res = await callTranscribe(model, opts.audio, opts.filename, key, fetcher);
    } catch (e) {
      throw new VoiceProviderError('unavailable', e instanceof Error ? e.message : String(e));
    }
    return { res, model };
  };

  let { res, model } = await attempt(STT_MODEL());
  if (!res.ok && (res.status === 400 || res.status === 404) && model !== STT_FALLBACK_MODEL) {
    const body = (await res.text()).slice(0, 200);
    // A 400 about the AUDIO (unreadable file) is not a model problem — the
    // second model would refuse it identically. Only fall back on model errors.
    if (/model/i.test(body)) {
      log('warn', opts.requestId, 'voice.stt_model_refused', { model, status: res.status, body });
      ({ res, model } = await attempt(STT_FALLBACK_MODEL));
    } else {
      throw new VoiceProviderError('rejected', body, res.status);
    }
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    log('warn', opts.requestId, 'voice.stt_failed', { model, status: res.status, body });
    if (res.status === 400 || res.status === 413 || res.status === 415) {
      throw new VoiceProviderError('rejected', body, res.status);
    }
    throw new VoiceProviderError('unavailable', body, res.status);
  }

  let json: { text?: unknown; usage?: { type?: string; seconds?: unknown }; duration?: unknown } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new VoiceProviderError('unavailable', 'unreadable transcription response');
  }
  const text = typeof json.text === 'string' ? json.text.trim() : '';
  // whisper-1 reports `usage: { type: 'duration', seconds }`. The gpt-4o
  // transcribers report tokens instead, so the phone's own measurement is used.
  const seconds = Number(json.usage?.type === 'duration' ? json.usage.seconds : json.duration);
  const duration_ms = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : opts.declaredMs;
  return { text, model, duration_ms };
}

/* ==================================================================== */
/* 5. Speaking — turning a written reply into something to say           */
/* ==================================================================== */

/**
 * What of a written reply should be SAID.
 *
 * Kai's replies are written for a screen: markdown emphasis, bullets, links,
 * and machine fences (`kai-ui`, chart commands) the app strips before display.
 * Read aloud raw, a voice says "asterisk asterisk" and reads JSON. So:
 * fences go entirely, links keep their words, list markers and emphasis go,
 * and a reply longer than `MAX_SPOKEN_CHARS` is cut at a sentence and says the
 * rest is on screen — never mid-word, never silently.
 */
export function spokenText(written: string, maxChars = MAX_SPOKEN_CHARS): { text: string; truncated: boolean } {
  let s = written ?? '';
  s = s.replace(/```[\s\S]*?(```|$)/g, ' '); // fenced blocks, closed or not
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // images
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links keep their words
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s*[-*+•]\s+/gm, '');
  s = s.replace(/^\s*\d+[.)]\s+/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2');
  s = s.replace(/\|/g, ' ');
  s = s.replace(/[ \t]*\n+[ \t]*/g, '. ').replace(/\.\s*\.(\s*\.)*/g, '.');
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[.\s]+/, '');

  if (s.length <= maxChars) return { text: s, truncated: false };
  const tail = ' The rest is on your screen.';
  const room = s.slice(0, maxChars - tail.length);
  const lastStop = Math.max(room.lastIndexOf('. '), room.lastIndexOf('! '), room.lastIndexOf('? '));
  const cut = lastStop > room.length * 0.4 ? room.slice(0, lastStop + 1) : room.slice(0, room.lastIndexOf(' ')) + '.';
  return { text: (cut + tail).trim(), truncated: true };
}
