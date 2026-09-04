import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from './api';
import { env } from './env';
import { fixtureReply, fixtureSetups, fixtureSheetReply } from './fixtures';
import type { KaiFrame, KaiObjectEnvelope } from '@cheatcode/shared';
import { adaptActionPreview, adaptGradedSetup } from './adapters';
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

  /**
   * Put an object into the conversation without asking Kai a question.
   * Home uses it for the wake-up's offers: "the full report" and "what else
   * moved" are things Kai already has, so they land in the thread directly
   * rather than round-tripping a prompt the user never typed.
   */
  const append = useCallback((extra: WallItem[]) => {
    if (!extra.length) return;
    setItems((p) => (extra.every((e) => p.some((it) => it.id === e.id)) ? p : [...p, ...extra.filter((e) => !p.some((it) => it.id === e.id))]));
  }, []);

  return { items, send, append, streaming, pinnedSetupId: pinnedSetupId || null };
}

export const wallId = nextId;

/* ==================================================================== */
/* V5 — the contextual thread behind the global Kai sheet                */
/* ==================================================================== */

/**
 * A standalone Kai thread pinned to one object.
 *
 * `useKaiWall` above is Home's wall: it reads route params and seeds itself
 * from the briefing. The sheet needs the same streaming mechanics with no
 * route coupling and a context that is pinned onto the conversation
 * (`POST /kai/conversations { context }` — API-3), so Kai answers about THAT
 * object instead of sending the user back to Home (audit §5).
 */
export function useKaiThread(opts: {
  mode: GoalMode;
  /** pinned object; changing `key` resets the thread */
  context: { kind: string; id?: string; symbol?: string };
  key: number;
  opening?: string | null;
}) {
  const { mode, context, key, opening } = opts;
  const [items, setItems] = useState<WallItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const convoId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef(context);
  ctxRef.current = context;

  // A new open (nonce bump) starts a fresh thread and a fresh conversation.
  useEffect(() => {
    convoId.current = null;
    setItems(opening ? [{ kind: 'kai_text', id: nextId(), text: opening }] : []);
    setStreaming(false);
  }, [key, opening]);

  useEffect(() => () => {
    abort.current?.abort();
    if (timer.current) clearInterval(timer.current);
  }, []);

  const patchText = useCallback((id: string, chunk: string) => {
    setItems((prev) => prev.map((it) => (it.kind === 'kai_text' && it.id === id ? { ...it, text: it.text + chunk } : it)));
  }, []);

  const send = useCallback(async (text: string) => {
    if (streaming || !text.trim()) return;
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

    // --- fixtures: canned deltas, then the action_preview the artboard shows
    if (!api.available()) {
      const sym = ctxRef.current.symbol ?? 'this';
      const canned = fixtureSheetReply(sym);
      const words = canned.split(' ');
      let i = 0;
      setTimeout(() => {
        startReply();
        timer.current = setInterval(() => {
          if (i >= words.length) {
            if (timer.current) clearInterval(timer.current);
            setItems((p) => [...p, {
              kind: 'action',
              id: nextId(),
              action: {
                action: 'draft_alert',
                label: `Alert me on the 3rd attempt`,
                summary_plain: `Tell me when ${sym} clears 504 with volume.`,
                args: { natural_language: `Tell me when ${sym} clears 504 with volume`, symbol: sym },
              },
            }]);
            finish();
            return;
          }
          patchText(replyId, (i === 0 ? '' : ' ') + words[i]);
          i += 1;
        }, 22);
      }, 260);
      return;
    }

    // --- real stream, with the object pinned on the conversation
    try {
      if (!convoId.current) {
        const c = ctxRef.current;
        const pinned = {
          ...(c.symbol ? { symbols: [c.symbol] } : null),
          ...(c.kind === 'setup' && c.id ? { setup_ids: [c.id] } : null),
        };
        const created = await api.createConversation(
          mode,
          Object.keys(pinned).length ? pinned : undefined,
          { kind: c.kind, id: c.id, symbol: c.symbol },
        );
        convoId.current = created.id;
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
              } else if (env?.type === 'action_preview' || env?.type === 'alert_preview') {
                const act = adaptActionPreview(env);
                if (act) setItems((p) => [...p, { kind: 'action', id: nextId(), action: act }]);
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
  }, [mode, streaming, patchText]);

  /** Drop an item (an action the user has just acted on) out of the thread. */
  const removeItem = useCallback((id: string) => {
    setItems((p) => p.filter((it) => it.id !== id));
  }, []);

  /** Append a plain Kai line (used to confirm an action landed). */
  const pushNotice = useCallback((text: string) => {
    setItems((p) => [...p, { kind: 'notice', id: nextId(), text }]);
  }, []);

  return { items, send, streaming, removeItem, pushNotice };
}
