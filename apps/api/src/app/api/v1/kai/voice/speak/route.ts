/**
 * POST /api/v1/kai/voice/speak   { text }  →  { audio_url, duration_ms, truncated }
 *
 * One of Kai's finished replies, spoken — same voice, bucket and cache as the
 * chart answer (`lib/kai/tts.ts`), as MP3. Rules in `lib/kai/voice-routes.ts`.
 */
import { makeSpeak, REAL_DEPS } from '@/lib/kai/voice-routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = makeSpeak(REAL_DEPS);
