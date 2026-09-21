/**
 * THE THREE VOICE DOORS (lane C), written as factories so they can be tested.
 *
 *   GET  /api/v1/kai/voice             is voice on, and does this member want replies spoken
 *   PUT  /api/v1/kai/voice             { replies: boolean }
 *   POST /api/v1/kai/voice/transcribe  multipart: audio (file), duration_ms
 *   POST /api/v1/kai/voice/speak       { text }
 *
 * Every dependency with a network behind it — who the caller is, the credit
 * balance, OpenAI, the ledger — is passed in. The route files pass the real
 * ones; `scripts/kai-voice-test.mts` passes fakes and proves the rules below
 * without a key, a database or a model.
 *
 * THE RULES, in the order a request meets them:
 *   1. No valid session, no service. Checked before the body is even read.
 *   2. Voice switched off (no key, or KAI_VOICE=0) is an honest 503, and the
 *      app never draws the button in the first place (`available: false`).
 *   3. Size and length are checked BEFORE credits and before OpenAI, so an
 *      oversized upload costs nothing and says why.
 *   4. Credits are asked before, charged after — same order as chat.
 *   5. A provider failure is a plain sentence and a status the app can act on,
 *      never OpenAI's error text.
 */
import type { NextRequest } from 'next/server';
import { requireUser, type AuthedUser } from '../auth';
import { serviceClient } from '../db';
import { ApiError, errorResponse } from '../errors';
import { log, newRequestId } from '../log';
import { rateLimit } from '../ratelimit';
import type { CreditState } from './credits';
import { speak as ttsSpeak } from './tts';
import { gateVoice, recordVoiceUsage, settleVoiceCredits } from './voice-billing';
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_SPEAK_INPUT_CHARS,
  MIN_AUDIO_BYTES,
  VoiceProviderError,
  extensionFor,
  spokenText,
  transcribe as sttTranscribe,
  voiceAvailable,
  voiceCostUsd,
  type Transcript,
} from './voice-io';
import { estimateDurationMs, type SpeechResult } from '@shared/tts';

export const TTS_MODEL_NAME = 'gpt-4o-mini-tts';

export type VoiceDeps = {
  auth: (req: Request) => Promise<AuthedUser>;
  available: () => boolean;
  gate: (userId: string, requestId: string) => Promise<CreditState>;
  transcribe: (opts: { audio: Blob; filename: string; declaredMs: number; requestId: string }) => Promise<Transcript>;
  speak: (opts: { text: string; requestId: string }) => Promise<SpeechResult>;
  record: typeof recordVoiceUsage;
  settle: typeof settleVoiceCredits;
  readPref: (userId: string) => Promise<boolean>;
  writePref: (userId: string, replies: boolean) => Promise<void>;
  limit: (key: string) => void;
};

/* ------------------------------------------------------------------ */
/* the preference: profiles.onboarding -> prefs -> voice               */
/* ------------------------------------------------------------------ */

/**
 * Stored where the accessibility prefs already live (`lib/prefs.ts`):
 * `profiles.onboarding.prefs`, namespaced `voice`, so no migration and no
 * collision with the onboarding answers. READ-MODIFY-WRITE ON THE SERVER, from
 * the row as it is now — never from a copy the phone is holding, which could
 * put back an accessibility setting another device just changed.
 */
async function readPrefDb(userId: string): Promise<boolean> {
  const { data } = await serviceClient().from('profiles').select('onboarding').eq('user_id', userId).maybeSingle();
  const onboarding = ((data as { onboarding?: Record<string, unknown> } | null)?.onboarding ?? {}) as Record<string, unknown>;
  const prefs = (onboarding.prefs ?? {}) as Record<string, unknown>;
  const voice = (prefs.voice ?? {}) as Record<string, unknown>;
  return voice.replies === true;
}

async function writePrefDb(userId: string, replies: boolean): Promise<void> {
  const db = serviceClient();
  const { data, error: readError } = await db.from('profiles').select('onboarding').eq('user_id', userId).maybeSingle();
  if (readError) throw new ApiError('INTERNAL', 'We could not save that change. Please try again.');
  const onboarding = { ...(((data as { onboarding?: Record<string, unknown> } | null)?.onboarding ?? {}) as Record<string, unknown>) };
  const prefs = { ...((onboarding.prefs as Record<string, unknown>) ?? {}) };
  prefs.voice = { ...((prefs.voice as Record<string, unknown>) ?? {}), replies };
  onboarding.prefs = prefs;
  const { error } = await db.from('profiles').update({ onboarding }).eq('user_id', userId);
  if (error) throw new ApiError('INTERNAL', 'We could not save that change. Please try again.');
}

export const REAL_DEPS: VoiceDeps = {
  auth: (req) => requireUser(req),
  available: voiceAvailable,
  gate: gateVoice,
  transcribe: (o) => sttTranscribe(o),
  speak: (o) => ttsSpeak({ text: o.text, voice: 'kai', requestId: o.requestId, format: 'mp3', enabled: voiceAvailable }),
  record: recordVoiceUsage,
  settle: settleVoiceCredits,
  readPref: readPrefDb,
  writePref: writePrefDb,
  limit: (key) =>
    rateLimit({ key, limit: 20, windowMs: 60_000, messagePlain: 'That is a lot of talking in one minute. Give it a moment.' }),
};

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

const UNAVAILABLE = () =>
  new ApiError('KAI_UNAVAILABLE', "Kai's voice is not switched on right now. You can still type to him.", { status: 503 });

function wrap(handler: (req: Request, requestId: string) => Promise<Response>) {
  return async (req: Request | NextRequest): Promise<Response> => {
    const requestId = newRequestId();
    try {
      const res = await handler(req, requestId);
      res.headers.set('x-request-id', requestId);
      return res;
    } catch (e) {
      const err =
        e instanceof ApiError ? e : new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
      log(err.status >= 500 ? 'error' : 'warn', requestId, 'voice.request_error', {
        path: new URL(req.url).pathname,
        code: err.code,
        status: err.status,
        message: err.message,
      });
      return errorResponse(err, requestId);
    }
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function providerError(e: unknown): ApiError {
  if (e instanceof VoiceProviderError) {
    if (e.kind === 'unconfigured') return UNAVAILABLE();
    if (e.kind === 'rejected') {
      return new ApiError('VALIDATION_FAILED', "I couldn't make out that recording. Try saying it again.", {
        status: 422,
      });
    }
  }
  return new ApiError('KAI_UNAVAILABLE', "I couldn't hear that just now — the voice service didn't answer. Try again, or type it.", {
    status: 503,
  });
}

/* ------------------------------------------------------------------ */
/* GET / PUT /kai/voice                                                */
/* ------------------------------------------------------------------ */

export function makeVoiceSettings(deps: VoiceDeps) {
  const GET = wrap(async (req) => {
    const user = await deps.auth(req);
    const available = deps.available();
    return json({
      available,
      // A preference for a voice that is switched off is reported as off, so
      // the app never shows a toggle that is on and silent.
      replies: available ? await deps.readPref(user.id) : false,
      max_seconds: MAX_AUDIO_SECONDS,
    });
  });
  const PUT = wrap(async (req) => {
    const user = await deps.auth(req);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'That change did not come through. Try again.');
    }
    const replies = (body as { replies?: unknown } | null)?.replies;
    if (typeof replies !== 'boolean') throw new ApiError('VALIDATION_FAILED', 'Say on or off.');
    if (replies && !deps.available()) throw UNAVAILABLE();
    await deps.writePref(user.id, replies);
    return json({ available: deps.available(), replies, max_seconds: MAX_AUDIO_SECONDS });
  });
  return { GET, PUT };
}

/* ------------------------------------------------------------------ */
/* POST /kai/voice/transcribe                                          */
/* ------------------------------------------------------------------ */

export function makeTranscribe(deps: VoiceDeps) {
  return wrap(async (req, requestId) => {
    const user = await deps.auth(req);
    if (!deps.available()) throw UNAVAILABLE();
    deps.limit(`voice:${user.id}`);

    // Refuse an oversized body on its declared length, before reading a byte.
    const declaredLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES + 64 * 1024) {
      throw new ApiError('VALIDATION_FAILED', `That recording is too long. Keep it under ${MAX_AUDIO_SECONDS} seconds.`, {
        status: 413,
      });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'No recording arrived with that request. Try again.');
    }
    const audio = form.get('audio');
    if (!audio || typeof audio === 'string') {
      // The web-FormData trap (see `uploadAvatar` in the app): a plain object
      // appended to a browser FormData arrives as the string "[object Object]".
      throw new ApiError('VALIDATION_FAILED', 'No recording arrived with that request. Try again.');
    }
    const blob = audio as Blob;
    if (blob.size > MAX_AUDIO_BYTES) {
      throw new ApiError('VALIDATION_FAILED', `That recording is too long. Keep it under ${MAX_AUDIO_SECONDS} seconds.`, {
        status: 413,
      });
    }
    if (blob.size < MIN_AUDIO_BYTES) {
      throw new ApiError('VALIDATION_FAILED', "That was too short for me to hear anything. Hold on a beat longer.");
    }
    const ext = extensionFor(blob.type) ?? extensionFor(String(form.get('mime') ?? ''));
    if (!ext) {
      throw new ApiError('VALIDATION_FAILED', 'That recording is in a format I cannot read.', { status: 415 });
    }
    const declaredMs = Number(form.get('duration_ms'));
    if (!Number.isFinite(declaredMs) || declaredMs <= 0) {
      throw new ApiError('VALIDATION_FAILED', 'The recording arrived without its length. Try again.');
    }
    if (declaredMs > MAX_AUDIO_SECONDS * 1000 + 1500) {
      throw new ApiError('VALIDATION_FAILED', `That recording is too long. Keep it under ${MAX_AUDIO_SECONDS} seconds.`, {
        status: 413,
      });
    }

    const state = await deps.gate(user.id, requestId);

    let result: Transcript;
    try {
      result = await deps.transcribe({ audio: blob, filename: `voice.${ext}`, declaredMs, requestId });
    } catch (e) {
      throw providerError(e);
    }

    // The provider did the work either way, so it is recorded either way — an
    // empty transcript of a silent room cost the same as a question.
    const billedMs = Math.min(Math.max(result.duration_ms, 1000), MAX_AUDIO_SECONDS * 1000);
    await deps.record({
      feature: 'voice_in',
      model: result.model,
      userId: user.id,
      requestId,
      durationMs: billedMs,
      costUsd: voiceCostUsd(result.model, billedMs),
    });
    await deps.settle({ userId: user.id, state, requestId });

    return json({
      text: result.text,
      heard: result.text.length > 0,
      plain: result.text ? null : "I didn't catch anything there. Try again a little closer to the phone.",
    });
  });
}

/* ------------------------------------------------------------------ */
/* POST /kai/voice/speak                                               */
/* ------------------------------------------------------------------ */

export function makeSpeak(deps: VoiceDeps) {
  return wrap(async (req, requestId) => {
    const user = await deps.auth(req);
    if (!deps.available()) throw UNAVAILABLE();
    deps.limit(`voice:${user.id}`);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'Nothing arrived to say.');
    }
    const raw = (body as { text?: unknown } | null)?.text;
    if (typeof raw !== 'string' || !raw.trim()) throw new ApiError('VALIDATION_FAILED', 'Nothing arrived to say.');
    if (raw.length > MAX_SPEAK_INPUT_CHARS) {
      throw new ApiError('VALIDATION_FAILED', 'That is too long to read out. It is on your screen.', { status: 413 });
    }
    const spoken = spokenText(raw);
    if (!spoken.text) throw new ApiError('VALIDATION_FAILED', 'There is nothing in that reply to read out.');

    const state = await deps.gate(user.id, requestId);
    const out = await deps.speak({ text: spoken.text, requestId });
    if (!out.audio_url) {
      throw new ApiError('KAI_UNAVAILABLE', "Kai's voice didn't come through just now. His answer is on your screen.", {
        status: 503,
      });
    }

    // A cache hit cost nothing to make, so it costs the member nothing.
    if (!out.cached) {
      const ms = out.duration_ms || estimateDurationMs(spoken.text);
      await deps.record({
        feature: 'voice_out',
        model: TTS_MODEL_NAME,
        userId: user.id,
        requestId,
        durationMs: ms,
        costUsd: voiceCostUsd(TTS_MODEL_NAME, ms),
      });
      await deps.settle({ userId: user.id, state, requestId });
    }

    return json({
      audio_url: out.audio_url,
      duration_ms: out.duration_ms || estimateDurationMs(spoken.text),
      truncated: spoken.truncated,
    });
  });
}
