/**
 * GET /api/v1/kai/voice  →  { available, replies, max_seconds }
 * PUT /api/v1/kai/voice  ←  { replies: boolean }
 *
 * Whether Kai's voice is switched on at all (the app draws no microphone when
 * it is not), and whether this member wants his replies spoken. The rules are
 * in `lib/kai/voice-routes.ts`.
 */
import { makeVoiceSettings, REAL_DEPS } from '@/lib/kai/voice-routes';

export const dynamic = 'force-dynamic';

const handlers = makeVoiceSettings(REAL_DEPS);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
