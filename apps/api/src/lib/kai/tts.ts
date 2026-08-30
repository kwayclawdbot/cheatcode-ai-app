/**
 * Kai's voice, on the API side (LIVE-8).
 *
 * The show has spoken since LIVE-2 (`workers/kai-live/src/tts.ts`). This is the
 * same voice, the same model, the same bucket and — critically — the same cache
 * key, so a line Kai has already said costs nothing to say again no matter which
 * side asks for it. Everything the two must agree on lives in
 * `packages/shared/tts.ts` and is imported by both; what differs is only what
 * genuinely differs. The worker charges a segment budget and latches its
 * unavailability across a five-minute show. An answer is one request.
 *
 * WHY IT IS A SEPARATE SWITCH FROM THE CHART (brief §2d). The chart moving and
 * Kai speaking are not one feature. The chart works silently and always has —
 * the frames carry `narration` and the portal renders it — so voice is a
 * product decision layered on top, not a dependency. `LIVE_ANSWER_VOICE=0`
 * turns it off and nothing else about an answer changes.
 *
 * WHEN THERE IS NO AUDIO — no key, no credits, provider down — the answer is
 * still an answer. `audio_url` is null, the timings fall back to the estimate,
 * and the chart performs over the written words exactly as it did before this
 * file existed. A credit outage costs the audio, not the answer.
 */
import { createHash } from 'node:crypto';
import {
  audioKeyFor,
  estimateDurationMs,
  instructionsFor,
  wavDurationMs,
  type SpeechResult,
  type TtsVoice,
} from '@shared/tts';
import { serviceClient } from '../db';
import { env } from '../env';
import { log } from '../log';

export type { SpeechResult };

const BUCKET = () => env('LIVE_AUDIO_BUCKET') ?? 'live-audio';
const MODEL = () => env('LIVE_TTS_MODEL') ?? 'gpt-4o-mini-tts';
const VOICE = (v: TtsVoice) =>
  v === 'kai' ? (env('LIVE_TTS_VOICE_KAI') ?? 'ash') : (env('LIVE_TTS_VOICE_COHOST') ?? 'coral');
const SPEED = () => Number(env('LIVE_TTS_SPEED') ?? 1.0);

/** The switch. Voice is on unless it is explicitly turned off. */
export function answerVoiceEnabled(): boolean {
  const flag = env('LIVE_ANSWER_VOICE');
  if (flag === '0' || flag === 'false') return false;
  return Boolean(env('OPENAI_API_KEY'));
}

/**
 * The URL a PHONE can fetch, which is not always the one the server built.
 *
 * `getPublicUrl` composes the audio URL from `SUPABASE_URL`, and in local
 * development that is `http://127.0.0.1:54321`. The server resolves it fine.
 * The device running the app does not: on a phone, 127.0.0.1 is the phone, so
 * every answer came back with a perfectly good `audio_url` pointing at nothing
 * and played silently — no error, because a voice that will not start is a
 * degrade this feature is designed to survive.
 *
 * `PUBLIC_STORAGE_ORIGIN` is the machine's address as the device sees it (in
 * dev, the LAN IP behind `EXPO_PUBLIC_API_BASE`). Unset in production, where
 * `SUPABASE_URL` is already a public hostname and this does nothing.
 */
function publicUrl(path: string): string {
  const url = serviceClient().storage.from(BUCKET()).getPublicUrl(path).data.publicUrl;
  const origin = env('PUBLIC_STORAGE_ORIGIN');
  if (!origin) return url;
  try {
    const from = new URL(url);
    const to = new URL(origin);
    from.protocol = to.protocol;
    from.host = to.host;
    return from.toString();
  } catch {
    return url;
  }
}

/** A cache hit costs one list call and nothing else — no model, no dollars. */
async function cached(path: string): Promise<SpeechResult | null> {
  const slash = path.lastIndexOf('/');
  const dir = slash > 0 ? path.slice(0, slash) : '';
  const name = slash > 0 ? path.slice(slash + 1) : path;
  const { data, error } = await serviceClient().storage.from(BUCKET()).list(dir, { search: name, limit: 1 });
  if (error || !data?.length) return null;
  const url = publicUrl(path);
  const res = await fetch(url).catch(() => null);
  const buf = res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  const ms = buf ? wavDurationMs(buf) : null;
  return { audio_url: url, duration_ms: ms ?? 0, state: ms ? 'ready' : 'estimated', cached: true };
}

/**
 * One passage, spoken.
 *
 * NEVER THROWS. Every failure path lands on a null URL and an estimated
 * duration, because the caller is answering a user's question and there is
 * nothing useful for it to do with an exception.
 */
export async function speak(opts: {
  text: string;
  voice?: TtsVoice;
  requestId?: string;
}): Promise<SpeechResult> {
  const requestId = opts.requestId ?? '-';
  const voice: TtsVoice = opts.voice ?? 'kai';
  const text = opts.text.trim();
  const fallback = (): SpeechResult => ({
    audio_url: null,
    duration_ms: estimateDurationMs(text),
    state: 'estimated',
    cached: false,
  });
  if (!text) return { audio_url: null, duration_ms: 0, state: 'estimated', cached: false };

  const key = env('OPENAI_API_KEY');
  if (!key || !answerVoiceEnabled()) return fallback();

  const model = MODEL();
  const voiceName = VOICE(voice);
  const speed = SPEED();
  const path = audioKeyFor({
    text,
    voice: voiceName,
    model,
    speed,
    sha256: (i) => createHash('sha256').update(i).digest('hex'),
  });

  const hit = await cached(path).catch(() => null);
  if (hit) return { ...hit, duration_ms: hit.duration_ms || estimateDurationMs(text) };

  let buf: Uint8Array;
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
        instructions: instructionsFor(voice),
      }),
    });
    if (!res.ok) {
      log('warn', requestId, 'tts.failed', { status: res.status, body: (await res.text()).slice(0, 160) });
      return fallback();
    }
    buf = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    log('warn', requestId, 'tts.request_failed', { message: e instanceof Error ? e.message : String(e) });
    return fallback();
  }

  const ms = wavDurationMs(buf) ?? estimateDurationMs(text);
  const up = await serviceClient()
    .storage.from(BUCKET())
    .upload(path, buf, { contentType: 'audio/wav', upsert: true, cacheControl: '31536000' });

  if (up.error) {
    // The audio exists but nobody can fetch it, so it is no better than none.
    log('warn', requestId, 'tts.upload_failed', { message: up.error.message });
    return { audio_url: null, duration_ms: ms, state: 'estimated', cached: false };
  }

  return { audio_url: publicUrl(path), duration_ms: ms, state: 'ready', cached: false };
}
