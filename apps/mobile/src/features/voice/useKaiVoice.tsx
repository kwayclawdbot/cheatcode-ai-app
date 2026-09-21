/**
 * KAI, HANDS-FREE — the microphone in the Kai composer and his voice out
 * (lane C, owner-approved 2026-09-21).
 *
 * One hook, used by every Kai chat surface (Home and the Kai sheet). It returns
 * two things for the composer to place — a `button` beside Send and an
 * `overlay` that stands in for the text field while listening — so the shared
 * `Composer` stays a dumb pill and grows no knowledge of audio.
 *
 *   tap mic       → asks for the microphone (once), starts listening
 *   tap again     → stops; so does ~1.5 s of quiet after speech (see logic.ts)
 *   stopped       → uploads to /kai/voice/transcribe, and the words are SENT as
 *                   the member's own message through the same `onTranscript`
 *                   the keyboard uses — so they appear on the wall exactly as
 *                   if typed, and every guard on sending still applies.
 *   voice replies → when on (Settings → How Kai talks to you), each reply Kai
 *                   FINISHES in this session is read out. Tapping the mic while
 *                   he speaks stops him. So does asking the next question.
 *
 * WHAT IS NEVER SHOWN: a microphone when the server has not said voice is live
 * (`useVoicePrefs().available`), or on a web browser with no MediaRecorder.
 * The 09-07 audit removed a mic that did nothing; this one is drawn only when
 * pressing it can work.
 *
 * PERMISSION DENIED is a state with words and a way out (the phone's Settings),
 * not a silent no-op.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  createAudioPlayer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
  type RecordingOptions,
} from 'expo-audio';
import { voiceApi } from './api';
import { createSilenceDetector, meterLevel, replyToSpeak, type WallLike } from './logic';
import { useVoicePrefs } from './store';
import { KaiMicButton, VoiceOverlay } from './VoiceUI';

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing' | 'speaking';

/**
 * RECORDING. AAC in an .m4a container on both phones, mono, 64 kbit/s — a
 * minute is under half a megabyte, far inside the server's 4 MB cap, and it is
 * a format OpenAI reads directly. (The LOW_QUALITY preset records AMR in 3GP on
 * Android, which OpenAI does not read, so it is not a starting point.) On the
 * web, MediaRecorder's WebM/Opus where the browser has it — Safari falls back
 * to MP4 on its own and the upload is named from the blob's real type.
 */
const RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

const webCanRecord = () =>
  Platform.OS !== 'web' ||
  (typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (globalThis as { MediaRecorder?: unknown }).MediaRecorder === 'function');

export type VoiceMessage = { text: string; settings?: boolean } | null;

export function useKaiVoice(opts: {
  /** Where the words go. The composer's own send, so they post as the member's message. */
  onTranscript: (text: string) => void;
  /** The wall, so a finished reply can be read out. */
  items: readonly WallLike[];
  /** Kai is writing. The falling edge is when a reply is finished. */
  streaming: boolean;
}) {
  const prefs = useVoicePrefs();
  const recorder = useAudioRecorder(RECORDING);
  const rec = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [message, setMessage] = useState<VoiceMessage>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const phaseRef = useRef<VoicePhase>('idle');
  const startedAt = useRef(0);
  const detector = useRef(createSilenceDetector());
  const player = useRef<AudioPlayer | null>(null);
  const spokenId = useRef<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const mounted = useRef(true);
  /**
   * Words that came back while Kai was still writing. The engine drops a send
   * made mid-answer (`useKai.send` returns early while streaming), so they are
   * held and sent the moment he finishes rather than lost.
   */
  const pending = useRef<string | null>(null);

  const go = (p: VoicePhase) => {
    phaseRef.current = p;
    if (mounted.current) setPhase(p);
  };

  /* ---------------- speaking ---------------- */

  const stopSpeaking = useCallback(() => {
    const p = player.current;
    player.current = null;
    if (p) {
      try {
        p.pause();
        p.remove();
      } catch {
        /* already gone */
      }
    }
    if (phaseRef.current === 'speaking') go('idle');
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();
      go('speaking');
      try {
        const out = await voiceApi.speak(text);
        // The member moved on while the audio was being made.
        if (phaseRef.current !== 'speaking' || !mounted.current) return;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
        const p = createAudioPlayer(out.audio_url);
        player.current = p;
        p.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish && player.current === p) stopSpeaking();
        });
        p.play();
      } catch (e) {
        if (phaseRef.current === 'speaking') {
          go('idle');
          setMessage({ text: e instanceof Error ? e.message : "Kai's voice didn't come through. His answer is on your screen." });
        }
      }
    },
    [stopSpeaking]
  );

  // The falling edge of `streaming` is a finished reply.
  const wasStreaming = useRef(opts.streaming);
  useEffect(() => {
    const was = wasStreaming.current;
    wasStreaming.current = opts.streaming;
    if (opts.streaming && !was) {
      // A new question is on its way: whatever Kai was saying is stale.
      stopSpeaking();
      return;
    }
    if (!was || opts.streaming) return;
    if (pending.current) {
      // The member already asked the next thing; that wins over reading this out.
      const next = pending.current;
      pending.current = null;
      optsRef.current.onTranscript(next);
      return;
    }
    if (!prefs.available || !prefs.replies) return;
    const reply = replyToSpeak(opts.items, spokenId.current);
    if (!reply?.text) return;
    spokenId.current = reply.id;
    void speak(reply.text);
  }, [opts.streaming, opts.items, prefs.available, prefs.replies, speak, stopSpeaking]);

  /* ---------------- listening ---------------- */

  const finish = useCallback(
    async (why: 'tap' | 'silence' | 'nothing' | 'too_long' | 'abandon') => {
      if (phaseRef.current !== 'recording') return;
      const durationMs = Date.now() - startedAt.current;
      go('transcribing');
      try {
        await recorder.stop();
      } catch {
        /* a recorder that is already stopped still has its file */
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (why === 'abandon') {
        go('idle');
        return;
      }
      if (why === 'nothing') {
        go('idle');
        setMessage({ text: "I didn't hear anything. Tap the mic and ask again." });
        return;
      }
      if (!uri || durationMs < 600) {
        go('idle');
        setMessage({ text: 'That was too quick for me to catch. Tap, ask, then pause.' });
        return;
      }
      try {
        const out = await voiceApi.transcribe({ uri, durationMs });
        if (!mounted.current) return;
        go('idle');
        if (out.heard && out.text.trim()) {
          setMessage(null);
          if (optsRef.current.streaming) pending.current = out.text.trim();
          else optsRef.current.onTranscript(out.text.trim());
        } else {
          setMessage({ text: out.plain ?? "I didn't catch anything there. Try again." });
        }
      } catch (e) {
        go('idle');
        setMessage({ text: e instanceof Error ? e.message : "I couldn't hear that just now. Try again, or type it." });
      }
    },
    [recorder]
  );

  const start = useCallback(async () => {
    setMessage(null);
    stopSpeaking();
    go('starting');
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain !== false) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        go('idle');
        setMessage(
          Platform.OS === 'web'
            ? { text: "Your browser is blocking the microphone. Allow it for this site in the address bar, then tap the mic again." }
            : { text: 'Cheat Code needs the microphone to hear you. Turn it on in Settings.', settings: true }
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      detector.current = createSilenceDetector({ maxMs: (prefs.maxSeconds || 60) * 1000 - 500 });
      startedAt.current = Date.now();
      setLevels([]);
      setElapsed(0);
      go('recording');
    } catch (e) {
      go('idle');
      setMessage({ text: "The microphone didn't start. Try again." });
      if (__DEV__) console.warn('voice.start_failed', e);
    }
  }, [recorder, stopSpeaking, prefs.maxSeconds]);

  // Every meter tick: draw it, and ask whether the question is over.
  useEffect(() => {
    if (phaseRef.current !== 'recording') return;
    const at = Date.now() - startedAt.current;
    setElapsed(at);
    if (typeof rec.metering === 'number') {
      const lvl = meterLevel(rec.metering);
      setLevels((l) => [...l.slice(-15), lvl]);
    }
    const verdict = detector.current.feed(rec.metering, at);
    if (verdict === 'stop_after_speech') void finish('silence');
    else if (verdict === 'stop_nothing_heard') void finish('nothing');
    else if (verdict === 'stop_too_long') void finish('too_long');
  }, [rec, finish]);

  // Going to the background ends a recording; the question is abandoned, not sent.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        if (phaseRef.current === 'recording') void finish('abandon');
        stopSpeaking();
      }
    });
    return () => sub.remove();
  }, [finish, stopSpeaking]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const p = player.current;
      player.current = null;
      try {
        p?.pause();
        p?.remove();
      } catch {
        /* gone */
      }
    };
  }, []);

  // Messages clear themselves, except the one with somewhere to go.
  useEffect(() => {
    if (!message || message.settings) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const press = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'recording') void finish('tap');
    else if (p === 'speaking') stopSpeaking();
    else if (p === 'idle' && !optsRef.current.streaming) void start();
  }, [finish, start, stopSpeaking]);

  const enabled = prefs.available && webCanRecord();
  if (!enabled) return { enabled: false as const, phase, button: null, overlay: null, stopSpeaking };

  const button = (
    <KaiMicButton
      phase={phase}
      level={levels[levels.length - 1] ?? 0}
      onPress={press}
      // While Kai writes, the circle beside this one is Stop; the mic waits.
      waiting={opts.streaming && phase === 'idle'}
    />
  );
  const overlay =
    phase === 'recording' || phase === 'starting' || phase === 'transcribing' || message ? (
      <VoiceOverlay
        phase={phase}
        levels={levels}
        elapsedMs={elapsed}
        message={message}
        onDismiss={() => setMessage(null)}
        onOpenSettings={() => {
          setMessage(null);
          void Linking.openSettings();
        }}
      />
    ) : null;

  return { enabled: true as const, phase, button, overlay, stopSpeaking };
}
