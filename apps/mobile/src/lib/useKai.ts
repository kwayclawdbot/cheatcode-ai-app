import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from './api';
import { env } from './env';
import { fixtureReply, fixtureSetups } from './fixtures';
import type { KaiFrame, KaiObjectEnvelope } from '@cheatcode/shared';
import { adaptGradedSetup } from './adapters';
import type { GoalMode, GradedSetup, WallItem } from './types';

let seq = 0;
const nextId = () => `w${++seq}`;

/**
 * Home's conversation wall.
 * One conversation is created per session (POST /kai/conversations); each turn
 * streams from POST /kai/conversations/:id/messages as SSE: text_delta frames
 * append to the live bubble, `object` frames land as SetupObject cards.
 * In fixtures mode the same code path runs against a canned reply so the
 * streaming UI is exercised without an API.
 */
export function useKaiWall(mode: GoalMode, seed: WallItem[]) {
  const [items, setItems] = useState<WallItem[]>(seed);
  const [streaming, setStreaming] = useState(false);
  const convoId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Pinned entry (round 2): "Ask Kai about this" on a setup routes to
   *   /home?ask=<question>&setup_id=<id>
   * The setup id is pinned onto the conversation so Kai answers about THAT
   * object, and the question is sent once — a re-render must not re-ask it.
   */
  const params = useLocalSearchParams<{ ask?: string; setup_id?: string; symbol?: string }>();
  const askText = typeof params.ask === 'string' ? params.ask : '';
  const pinnedSetupId = typeof params.setup_id === 'string' ? params.setup_id : '';
  const pinnedSymbol = typeof params.symbol === 'string' ? params.symbol : '';
  const asked = useRef<string>('');

  useEffect(() => { setItems(seed); }, [seed]);
  useEffect(() => () => {
    abort.current?.abort();
    if (timer.current) clearInterval(timer.current);
  }, []);

  const patchText = useCallback((id: string, chunk: string) => {
    setItems((prev) => prev.map((it) => (it.kind === 'kai_text' && it.id === id ? { ...it, text: it.text + chunk } : it)));
  }, []);

  const send = useCallback(async (text: string) => {
    if (streaming) return;
    const userId = nextId();
    const typingId = nextId();
    setItems((p) => [...p, { kind: 'user_text', id: userId, text }, { kind: 'typing', id: typingId }]);
    setStreaming(true);

    const replyId = nextId();
    const startReply = () => {
      setItems((p) => p.map((it) => (it.id === typingId ? { kind: 'kai_text', id: replyId, text: '', streaming: true } : it)));
    };
    const finish = () => {
      setItems((p) => p.map((it) => (it.kind === 'kai_text' && it.id === replyId ? { ...it, streaming: false } : it)));
      setStreaming(false);
    };

    // --- fixtures: same wall mechanics, canned deltas
    if (!api.available()) {
      const words = fixtureReply.split(' ');
      let i = 0;
      setTimeout(() => {
        startReply();
        timer.current = setInterval(() => {
          if (i >= words.length) {
            if (timer.current) clearInterval(timer.current);
            setItems((p) => [...p, { kind: 'setup', id: nextId(), setup: fixtureSetups[0] as GradedSetup }]);
            finish();
            return;
          }
          patchText(replyId, (i === 0 ? '' : ' ') + words[i]);
          i += 1;
        }, 28);
      }, 380);
      return;
    }

    // --- real stream
    try {
      if (!convoId.current) {
        const pinned =
          pinnedSetupId || pinnedSymbol
            ? {
                ...(pinnedSetupId ? { setup_ids: [pinnedSetupId] } : null),
                ...(pinnedSymbol ? { symbols: [pinnedSymbol] } : null),
              }
            : undefined;
        const c = await api.createConversation(mode, pinned);
        convoId.current = c.id;
      }
      abort.current = new AbortController();
      let started = false;
      await api.streamMessage(
        convoId.current,
        text,
        {
          onFrame: (f: KaiFrame) => {
            if (f.type === 'text_delta') {
              if (!started) { started = true; startReply(); }
              patchText(replyId, f.text ?? '');
            } else if (f.type === 'object') {
              const env = f.object as KaiObjectEnvelope;
              if (env?.type === 'graded_setup') {
                const setup = adaptGradedSetup(env);
                if (setup) setItems((p) => [...p, { kind: 'setup', id: nextId(), setup }]);
              }
            } else if (f.type === 'error') {
              if (!started) { started = true; startReply(); }
              patchText(replyId, f.message_plain);
            }
          },
          onError: (m) => {
            if (!started) { started = true; startReply(); }
            patchText(replyId, m);
          },
          onDone: finish,
        },
        abort.current.signal,
      );
    } catch (e) {
      startReply();
      patchText(replyId, e instanceof Error ? e.message : "I couldn't answer that just now. Try again in a moment.");
      finish();
    }
  }, [mode, streaming, patchText, pinnedSetupId, pinnedSymbol]);

  // Fire the pinned question once the seeded wall exists, so Kai's answer
  // lands under the briefing rather than replacing it.
  useEffect(() => {
    if (!askText || asked.current === askText) return;
    asked.current = askText;
    const t = setTimeout(() => { void send(askText); }, 400);
    return () => clearTimeout(t);
  }, [askText, send]);

  return { items, send, streaming, pinnedSetupId: pinnedSetupId || null };
}

export const wallId = nextId;
