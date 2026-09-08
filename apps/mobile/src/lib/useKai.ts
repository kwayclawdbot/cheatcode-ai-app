import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { api } from './api';
import { offlineMode } from './env';
import { fixtureReply, fixtureSetups, fixtureSheetReply } from './fixtures';
import type { KaiFrame, KaiObjectEnvelope } from '@cheatcode/shared';
import { adaptActionPreview, adaptCredits, adaptGradedSetup } from './adapters';
import {
  createThreadBinding, readTranscript, retryableTurn, suggestedQuestions, targetKey, transcriptItems,
  type FailedTurn, type SuggestionSubject, type ThreadBinding, type ThreadTarget,
} from './kai-continuity';
import type { Credits, GoalMode, GradedSetup, WallItem } from './types';

let seq = 0;
const nextId = () => `w${++seq}`;

/**
 * ONE KAI, WEARING TWO FRONT DOORS.
 * ===========================================================================
 *
 * `useKaiWall` (Home) and `useKaiThread` (the contextual sheet) were two
 * complete copies of the same machine — two `convoId` refs, two abort
 * controllers, two stream readers that had drifted apart. The audit's word for
 * what that produced is right: "Different Kai entry points can feel like
 * different assistants" (F05). They are now two thin wrappers over ONE engine,
 * `useKaiEngine`, so the interaction contract — context, composing, thinking,
 * streaming, stop, retry, saved history — is the same object in both places
 * rather than the same intention in two places.
 *
 * Both public signatures are unchanged where they had callers, because
 * `features/kai-sheet/KaiSheet.tsx` is not this lane's file to edit.
 *
 * WHICH CONVERSATION A TURN GOES TO is no longer this file's business: the
 * thread is an input (`ThreadTarget`), and `lib/kai-continuity.ts` holds the
 * identity, the generation gate and the argument for why it exists (F04).
 * Everything below writes to the screen only through `owns(gen)`, so a reply
 * that arrives after the member has moved to another conversation has nowhere
 * to be drawn.
 */

/**
 * THE BALANCE, ARRIVING WITH THE ANSWER.
 *
 * The message stream carries a `credits` frame after every reply — and instead
 * of one on a reply Kai refused to give. Reading it here means the strip above
 * the composer is right the moment the answer lands, with no second request and
 * no window in which the screen is showing a balance that has already moved.
 *
 * IT IS NOT PART OF `KaiFrame`. That union lives in `packages/shared/api.ts`,
 * which this lane does not own, so the frame is narrowed structurally instead.
 * The SSE reader already passes unknown events through untouched — an older app
 * simply ignores this one, which is exactly the behaviour that makes adding a
 * frame safe.
 */
function creditsFromFrame(f: unknown): Credits | null {
  const frame = f as { type?: unknown; credits?: unknown };
  if (frame?.type !== 'credits') return null;
  return adaptCredits(frame.credits);
}

/** How much of a saved conversation is worth restoring on open. */
const TRANSCRIPT_LIMIT = 200;

const STOPPED_PLAIN = 'Stopped.';
const UNREACHABLE_PLAIN = "I couldn't answer that just now.";
const HISTORY_FAILED_PLAIN =
  "I couldn't load the earlier messages in this conversation. Anything you send still goes to it.";
const HISTORY_EMPTY_PLAIN = 'Nothing was said in this conversation yet.';
const HISTORY_OFFLINE_PLAIN = 'Saved messages need the service; this build is running on examples.';

/**
 * Saved messages, read from the API.
 *
 * THIS USED TO READ `conversation_messages` THROUGH THE SUPABASE CLIENT, because
 * when the wall first needed a transcript there was no route to ask: the
 * conversations endpoint had `GET` (the drawer) and `POST` (create), and `:id`
 * had only `PATCH`. The owner-only policy in `0014_rls_grants.sql` made that a
 * real guarantee rather than a hole, and there is precedent for it here, but it
 * left the phone needing table knowledge to draw a conversation.
 *
 * `GET /kai/conversations/:id/messages` exists now and this reads it. The route
 * scopes to the owner exactly as the policy did, and it can page, which a
 * `.limit()` on the table could only truncate.
 */
async function fetchTranscript(conversationId: string): Promise<WallItem[]> {
  const { messages } = await api.conversationMessages(conversationId, { limit: TRANSCRIPT_LIMIT });
  const turns = readTranscript(messages);
  if (!turns.length) {
    return [{ kind: 'notice', id: `h:${conversationId}:empty`, text: HISTORY_EMPTY_PLAIN }];
  }
  return transcriptItems(conversationId, turns);
}

/* ==================================================================== */
/* The engine both entry points run on                                   */
/* ==================================================================== */

type FixtureTurn = { reply: string; tail: WallItem | null };

type EngineOpts = {
  mode: GoalMode;
  /** WHICH conversation. Changing this is a thread switch, not a re-render. */
  target: ThreadTarget;
  /** What the wall shows before anything has been said in this thread. */
  base: WallItem[];
  /** Pinned onto a conversation this engine creates. Never onto a saved one. */
  pinned?: { symbols?: string[]; setup_ids?: string[] };
  context?: { kind: string; id?: string; symbol?: string };
  fixture: (text: string) => FixtureTurn;
  fixtureDelayMs: number;
  fixtureTickMs: number;
};

function useKaiEngine(opts: EngineOpts) {
  const bindingRef = useRef<ThreadBinding | null>(null);
  const binding: ThreadBinding = bindingRef.current ?? (bindingRef.current = createThreadBinding());

  /**
   * TWO LISTS, AND THAT IS THE POINT.
   *
   * `head` is what the thread already was — the seed, or the saved transcript.
   * `live` is what has happened since it was opened. Keeping them apart is what
   * makes a transcript arriving late unable to erase a turn the member has
   * already sent, and a turn unable to erase the transcript. The old single
   * `items` array was reset from `seed` on every seed change, which is how the
   * invest notice arriving after a question used to wipe the question.
   */
  const [head, setHead] = useState<WallItem[]>(opts.base);
  const [live, setLive] = useState<WallItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [failed, setFailed] = useState<FailedTurn | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [credits, setCredits] = useState<Credits | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const liveRef = useRef<WallItem[]>(live);
  liveRef.current = live;
  const failedRef = useRef<FailedTurn | null>(failed);
  failedRef.current = failed;

  const streamingRef = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** How the turn currently in flight is called off. Null when nothing is. */
  const stopTurn = useRef<(() => void) | null>(null);
  /** True once this sitting has replaced `head` with something server-shaped. */
  const restored = useRef(false);
  /** The generation whose transcript request is outstanding. */
  const loadGen = useRef<number | null>(null);

  const loadHistory = useCallback(async (id: string, gen: number) => {
    restored.current = true;
    if (offlineMode) {
      if (binding.owns(gen)) setHead([{ kind: 'notice', id: `h:${id}:offline`, text: HISTORY_OFFLINE_PLAIN }]);
      return;
    }
    loadGen.current = gen;
    setLoadingHistory(true);
    try {
      const items = await fetchTranscript(id);
      if (binding.owns(gen)) setHead(items);
    } catch {
      if (binding.owns(gen)) setHead([{ kind: 'notice', id: `h:${id}:failed`, text: HISTORY_FAILED_PLAIN }]);
    } finally {
      if (loadGen.current === gen) { loadGen.current = null; setLoadingHistory(false); }
    }
  }, [binding]);

  /**
   * THE THREAD SWITCH. Abandon the stream first, then forget everything the old
   * thread had on screen, then fetch what the new one actually contains.
   */
  const key = targetKey(opts.target);
  useEffect(() => {
    const move = binding.point(optsRef.current.target, streamingRef.current);
    if (!move.changed) return;
    if (move.abort) abort.current?.abort();
    abort.current = null;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    stopTurn.current = null;
    streamingRef.current = false;
    loadGen.current = null;
    restored.current = false;
    setStreaming(false);
    setLoadingHistory(false);
    setFailed(null);
    setLive([]);
    setHead(optsRef.current.base);
    if (move.load) void loadHistory(move.load, move.generation);
  }, [key, binding, loadHistory]);

  /**
   * Home's seed is built from data that can land after the first render (the
   * invest notice). Adopting it is only safe while the thread is still blank —
   * once anything has been said, or a transcript has been restored, the seed
   * has been superseded and must not come back.
   */
  const baseKey = opts.base.map((it) => it.id).join('|');
  useEffect(() => {
    if (restored.current || liveRef.current.length) return;
    setHead(optsRef.current.base);
  }, [baseKey]);

  useEffect(() => () => {
    abort.current?.abort();
    if (timer.current) clearInterval(timer.current);
  }, []);

  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body || streamingRef.current) return;

    const gen = binding.generation();
    const owns = () => binding.owns(gen);
    const { mode, pinned, context, fixture, fixtureDelayMs, fixtureTickMs } = optsRef.current;

    const userId = nextId();
    const typingId = nextId();
    const replyId = nextId();
    let started = false;
    let cancelled = false;
    /** A request that did not happen, as opposed to an answer Kai declined. */
    let transportError: string | null = null;

    const startReply = () => {
      if (!owns()) return;
      started = true;
      setLive((p) => p.map((it) => (it.id === typingId
        ? { kind: 'kai_text', id: replyId, text: '', streaming: true }
        : it)));
    };

    const patch = (chunk: string) => {
      if (!owns() || !chunk) return;
      setLive((p) => p.map((it) => (it.kind === 'kai_text' && it.id === replyId
        ? { ...it, text: it.text + chunk }
        : it)));
    };

    /**
     * Settle the turn. Three endings, and they are different on purpose:
     *   STOPPED   — whatever arrived stays, and the wall says it was stopped.
     *   FAILED COLD — nothing arrived, so the turn is lifted out of the wall
     *                 entirely and the words go back to the member (F05).
     *   FAILED WARM — a partial answer arrived, so it stays and retry is
     *                 offered without repopulating the composer.
     */
    const finish = () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      stopTurn.current = null;
      streamingRef.current = false;
      if (!owns()) return;
      setStreaming(false);
      const settle = (p: WallItem[]): WallItem[] => p
        .filter((it) => it.id !== typingId)
        .map((it) => (it.kind === 'kai_text' && it.id === replyId ? { ...it, streaming: false } : it));
      if (cancelled) {
        setLive((p) => [...settle(p), { kind: 'notice', id: nextId(), text: STOPPED_PLAIN }]);
        return;
      }
      if (transportError && !started) {
        setLive((p) => settle(p).filter((it) => it.id !== userId));
        setFailed({ generation: gen, text: body, plain: transportError, restore: true });
        return;
      }
      setLive(settle);
      if (transportError) setFailed({ generation: gen, text: body, plain: transportError, restore: false });
    };

    setLive((p) => [...p, { kind: 'user_text', id: userId, text: body }, { kind: 'typing', id: typingId }]);
    setStreaming(true);
    streamingRef.current = true;
    setFailed(null);

    // --- fixtures: the same wall mechanics, canned deltas, a real Stop
    if (!api.available()) {
      const canned = fixture(body);
      const words = canned.reply.split(' ');
      const tail = canned.tail;
      let i = 0;
      let kick: ReturnType<typeof setTimeout> | null = null;
      stopTurn.current = () => {
        cancelled = true;
        if (kick) { clearTimeout(kick); kick = null; }
        finish();
      };
      kick = setTimeout(() => {
        kick = null;
        if (cancelled || !owns()) return;
        startReply();
        timer.current = setInterval(() => {
          if (cancelled || !owns()) { finish(); return; }
          if (i >= words.length) {
            if (tail) setLive((p) => [...p, tail]);
            finish();
            return;
          }
          patch((i === 0 ? '' : ' ') + words[i]);
          i += 1;
        }, fixtureTickMs);
      }, fixtureDelayMs);
      return;
    }

    // --- the real stream, against the conversation this thread IS
    try {
      let conversationId = binding.conversationId();
      if (!conversationId) {
        const created = await api.createConversation(mode, pinned, context);
        // The member moved to another thread while the server was thinking.
        // The conversation is real and stays on the server; it is simply not
        // what this wall is showing any more, so it is dropped, not adopted.
        if (!binding.adopt(gen, created.id)) { finish(); return; }
        conversationId = created.id;
      }
      if (cancelled || !owns()) { finish(); return; }

      const controller = new AbortController();
      abort.current = controller;
      stopTurn.current = () => { cancelled = true; controller.abort(); };

      await api.streamMessage(
        conversationId,
        body,
        {
          onFrame: (f: KaiFrame) => {
            if (!owns()) return;
            if (f.type === 'text_delta') {
              if (!started) startReply();
              patch(f.text ?? '');
            } else if (f.type === 'object') {
              const envelope = f.object as KaiObjectEnvelope;
              if (envelope?.type === 'graded_setup') {
                const setup = adaptGradedSetup(envelope);
                if (setup) setLive((p) => [...p, { kind: 'setup', id: nextId(), setup }]);
              } else if (envelope?.type === 'action_preview' || envelope?.type === 'alert_preview') {
                const act = adaptActionPreview(envelope);
                if (act) setLive((p) => [...p, { kind: 'action', id: nextId(), action: act }]);
              }
            } else if (f.type === 'error') {
              // Kai declining, in his own voice (out of credits, a refusal).
              // That is an ANSWER, not a failed request: it stays, and it does
              // not offer a retry that would spend the same allowance again.
              if (!started) startReply();
              patch(f.message_plain);
            } else {
              const c = creditsFromFrame(f);
              if (c) setCredits(c);
            }
          },
          onError: (m) => { transportError = m; },
          onDone: finish,
        },
        controller.signal,
      );
    } catch (e) {
      transportError = e instanceof Error ? e.message : UNREACHABLE_PLAIN;
      finish();
    }
  }, [binding]);

  /** The member's own interrupt. Nothing else in the app may call this. */
  const stop = useCallback(() => { stopTurn.current?.(); }, []);

  /**
   * Send the failed turn again — and only into the thread it failed in. A
   * retry that survived a thread switch would be the F04 bug with extra steps.
   */
  const retry = useCallback(() => {
    const f = retryableTurn(failedRef.current, binding.generation());
    if (!f) return;
    setFailed(null);
    void send(f.text);
  }, [binding, send]);

  const clearFailure = useCallback(() => { setFailed(null); }, []);

  /**
   * Put an object into the conversation without asking Kai a question.
   * Home uses it for the wake-up's offers: "the full report" and "what else
   * moved" are things Kai already has, so they land in the thread directly
   * rather than round-tripping a prompt the user never typed.
   */
  const append = useCallback((extra: WallItem[]) => {
    if (!extra.length) return;
    setLive((p) => {
      const fresh = extra.filter((e) => !p.some((it) => it.id === e.id));
      return fresh.length ? [...p, ...fresh] : p;
    });
  }, []);

  /** Drop an item (an action the user has just acted on) out of the thread. */
  const removeItem = useCallback((id: string) => {
    setLive((p) => p.filter((it) => it.id !== id));
  }, []);

  /** Append a plain Kai line (used to confirm an action landed). */
  const pushNotice = useCallback((text: string) => {
    setLive((p) => [...p, { kind: 'notice', id: nextId(), text }]);
  }, []);

  const items = useMemo(() => [...head, ...live], [head, live]);
  const failedNow = retryableTurn(failed, binding.generation());

  return {
    items,
    send,
    append,
    stop,
    retry,
    clearFailure,
    removeItem,
    pushNotice,
    streaming,
    loadingHistory,
    failed: failedNow,
    credits,
    setCredits,
    conversationId: binding.conversationId(),
  };
}

/* ==================================================================== */
/* Home's wall                                                           */
/* ==================================================================== */

function subjectFor(target: ThreadTarget, symbol: string): SuggestionSubject {
  if (symbol) return { kind: 'symbol', symbol };
  if (target.kind === 'saved') return { kind: 'saved' };
  if (target.kind === 'new') return { kind: 'new' };
  return { kind: 'today' };
}

/**
 * Home's conversation wall.
 *
 * `target` is the conversation the screen says it is in — and now the one it
 * actually talks to. A saved thread is bound to its server id before a word is
 * sent and has its transcript restored; `new` earns a real server conversation
 * on its first turn (`POST /kai/conversations`); `today` is the one Kai woke
 * into. Each turn streams from `POST /kai/conversations/:id/messages` as SSE.
 *
 * PINNING BELONGS TO THE THREAD IT WAS OPENED IN. The `setup_id` / `symbol`
 * route parameters are only ever attached to a conversation this wall CREATES.
 * A saved conversation already carries the context it was created with, and
 * stamping a new object onto it from a route would rewrite somebody's history.
 */
export function useKaiWall(
  mode: GoalMode,
  seed: WallItem[],
  target: ThreadTarget = { kind: 'today' },
) {
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

  const pinned = useMemo(
    () => (pinnedSetupId || pinnedSymbol
      ? {
          ...(pinnedSetupId ? { setup_ids: [pinnedSetupId] } : null),
          ...(pinnedSymbol ? { symbols: [pinnedSymbol] } : null),
        }
      : undefined),
    [pinnedSetupId, pinnedSymbol],
  );

  const fixture = useCallback((): FixtureTurn => ({
    reply: fixtureReply,
    tail: { kind: 'setup', id: nextId(), setup: fixtureSetups[0] as GradedSetup },
  }), []);

  const engine = useKaiEngine({
    mode,
    target,
    base: seed,
    pinned,
    fixture,
    fixtureDelayMs: 380,
    fixtureTickMs: 28,
  });
  const { send } = engine;

  // Fire the pinned question once the seeded wall exists, so Kai's answer
  // lands under the briefing rather than replacing it.
  useEffect(() => {
    if (!askText || asked.current === askText) return;
    asked.current = askText;
    const t = setTimeout(() => { void send(askText); }, 400);
    return () => clearTimeout(t);
  }, [askText, send]);

  const suggestions = useMemo(
    () => suggestedQuestions(subjectFor(target, pinnedSymbol)),
    // `target` is rebuilt on every render; its key is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetKey(target), pinnedSymbol],
  );

  return { ...engine, suggestions, pinnedSetupId: pinnedSetupId || null };
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
 *
 * It is the same engine now. A new open (nonce bump) is a thread switch like
 * any other, which is what gives the sheet the abort-before-switch and the
 * generation gate it never had.
 */
export function useKaiThread(opts: {
  mode: GoalMode;
  /** pinned object; changing `key` resets the thread */
  context: { kind: string; id?: string; symbol?: string };
  key: number;
  opening?: string | null;
}) {
  const { mode, context, key, opening } = opts;

  const target = useMemo<ThreadTarget>(() => ({ kind: 'new', nonce: key }), [key]);
  const base = useMemo<WallItem[]>(
    () => (opening ? [{ kind: 'kai_text', id: `open:${key}`, text: opening }] : []),
    [opening, key],
  );
  const pinned = useMemo(() => {
    const p = {
      ...(context.symbol ? { symbols: [context.symbol] } : null),
      ...(context.kind === 'setup' && context.id ? { setup_ids: [context.id] } : null),
    };
    return Object.keys(p).length ? p : undefined;
  }, [context.kind, context.id, context.symbol]);
  const ctx = useMemo(
    () => ({ kind: context.kind, id: context.id, symbol: context.symbol }),
    [context.kind, context.id, context.symbol],
  );

  const symbol = context.symbol ?? '';
  const fixture = useCallback((): FixtureTurn => {
    const sym = symbol || 'this';
    return {
      reply: fixtureSheetReply(sym),
      tail: {
        kind: 'action',
        id: nextId(),
        action: {
          action: 'draft_alert',
          label: 'Alert me on the 3rd attempt',
          summary_plain: `Tell me when ${sym} clears 504 with volume.`,
          args: { natural_language: `Tell me when ${sym} clears 504 with volume`, symbol: sym },
        },
      },
    };
  }, [symbol]);

  const engine = useKaiEngine({
    mode,
    target,
    base,
    pinned,
    context: ctx,
    fixture,
    fixtureDelayMs: 260,
    fixtureTickMs: 22,
  });

  const suggestions = useMemo(
    () => suggestedQuestions(
      symbol
        ? { kind: 'symbol', symbol }
        : context.kind === 'setup'
          ? { kind: 'setup', symbol: null }
          : { kind: 'new' },
    ),
    [symbol, context.kind],
  );

  return { ...engine, suggestions };
}
