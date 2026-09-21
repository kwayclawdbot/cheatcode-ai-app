/**
 * POST /api/v1/kai/voice/transcribe   (multipart: `audio` file, `duration_ms`)
 *   →  { text, heard, plain }
 *
 * What the member said, in words. OpenAI does the hearing; the key never
 * leaves this server. Limits, credits and failure wording are in
 * `lib/kai/voice-routes.ts`.
 */
import { makeTranscribe, REAL_DEPS } from '@/lib/kai/voice-routes';

export const dynamic = 'force-dynamic';
// Transcription of a minute of audio can take several seconds; the default
// serverless ceiling is enough, but say so rather than rely on it.
export const maxDuration = 60;

export const POST = makeTranscribe(REAL_DEPS);
