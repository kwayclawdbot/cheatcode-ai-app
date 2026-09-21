/**
 * The voice doors on the API (`apps/api/src/lib/kai/voice-routes.ts`).
 *
 * THE FILE PART IS BUILT TWO WAYS, for the reason `uploadAvatar` in
 * `lib/api.ts` gives: on the phone `{ uri, name, type }` is React Native's file
 * object and the runtime streams it off disk; on the web `FormData.append`
 * takes a Blob or a string and nothing else, so a plain object becomes the
 * literal text "[object Object]" and no recording arrives. The web recorder
 * hands back a `blob:` URL, which `fetch` reads back into a real Blob.
 */
import { Platform } from 'react-native';
import { apiRequest, apiUpload } from '../../lib/api';
import { fileFor } from './logic';

export type VoiceSettings = { available: boolean; replies: boolean; max_seconds: number };

export const voiceApi = {
  settings: () => apiRequest<VoiceSettings>('/kai/voice'),
  setReplies: (replies: boolean) =>
    apiRequest<VoiceSettings>('/kai/voice', { method: 'PUT', body: JSON.stringify({ replies }) }),

  transcribe: async (rec: { uri: string; durationMs: number }): Promise<{ text: string; heard: boolean; plain: string | null }> => {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(rec.uri)).blob();
      const f = fileFor(blob.type, 'webm');
      if (typeof File === 'function') form.append('audio', new File([blob], f.name, { type: blob.type || f.type }));
      else form.append('audio', blob, f.name);
    } else {
      // expo-audio records AAC in an .m4a container on both platforms with the
      // options in `useKaiVoice` — see RECORDING there.
      const f = fileFor('audio/m4a');
      form.append('audio', { uri: rec.uri, name: f.name, type: f.type } as unknown as Blob);
    }
    form.append('duration_ms', String(Math.round(rec.durationMs)));
    return apiUpload('/kai/voice/transcribe', form);
  },

  speak: (text: string) =>
    apiRequest<{ audio_url: string; duration_ms: number; truncated: boolean }>('/kai/voice/speak', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
