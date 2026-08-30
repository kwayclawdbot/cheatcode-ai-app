/**
 * Kai inside the portal (spec 10 §7 "Kai chart-control commands", §8).
 *
 * `src/lib/useKai.ts` (lane MOBILE-A) drives Home's wall and the global sheet.
 * Neither knows about `chart_command` frames, and both belong to another lane,
 * so the portal runs its own thread over the SAME transport (`api.createConversation`
 * + `api.streamMessage`) and adds one thing: a frame handler that applies chart
 * commands IN PLACE and narrates them.
 *
 * DETERMINISM RULE (§7): a level Kai marks always comes from an object already
 * on screen — the alert, the plan, the setup or a community-named price. Nothing
 * here invents a number. When the server has not shipped `chart_command` yet,
 * the same rule is applied client-side against the loaded objects and the
 * narration says where the level came from, so the user is never shown a price
 * with no provenance.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { KaiFrame } from '@cheatcode/shared';
import type { GoalMode } from '../../lib/types';
import type {
  Annotation, ChartCommand, ChartCommandName, PortalTimeframe, TradePortal,
} from './types';
import { CHART_COMMAND_NAMES, KIND_LABEL } from './types';
import { subscribeAsk } from './ask-bus';
import { runChartAnswer, type AnswerRun } from '../chart/answer';
import { playAnswer } from '../chart/answer-audio';

/**
 * What the screen hands back after performing one command.
 *
 * `done` is the CHOREOGRAPHY finishing — the pointer has travelled, the line has
 * drawn, the camera has landed. An answer needs it because `applyChartCommand`
 * keeps a queue of one: firing the next gesture without waiting for this one
 * supersedes it, and the level it was drawing is silently never drawn.
 */
export type PortalCommandResult = { narration: string | null; done: Promise<unknown> };

export type PortalTurn =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'kai'; id: string; text: string; streaming: boolean }
  | { kind: 'narration'; id: string; text: string }
  | { kind: 'typing'; id: string };

let n = 0;
const nid = () => `p${++n}`;

const isCommandFrame = (f: KaiFrame): boolean =>
  (f as { type?: string }).type === 'chart_command';

function readCommand(f: unknown): ChartCommand | null {
  const r = (f ?? {}) as Record<string, unknown>;
  const inner = (r.chart_command ?? r.payload ?? r) as Record<string, unknown>;
  const name = String(r.command ?? inner.command ?? '');
  // `CHART_COMMAND_NAMES` rather than a list kept here: this one had fallen a
  // whole release behind and silently rejected every camera command LIVE-1
  // added, which is most of what a directed answer is made of.
  if (!(CHART_COMMAND_NAMES as string[]).includes(name)) return null;
  const payload = { ...((inner.payload ?? inner) as Record<string, unknown>) };
  // The frame carries the annotations the server ALREADY persisted. Those are
  // the authoritative geometry — the client draws them rather than re-deriving
  // a level from the payload.
  if (Array.isArray(r.annotations) && r.annotations.length) payload.annotations = r.annotations;
  return {
    command: name as ChartCommandName,
    payload,
    narration: typeof r.narration === 'string' && r.narration ? r.narration : null,
  };
}

/**
 * A whole answer, directed server-side (LIVE-8).
 *
 * The user asked a question about this chart and the reply is not a paragraph —
 * it is Kai working the chart while he talks. The server ran the same director
 * the live show runs over the prose, resolved every marker against the same real
 * rows every other chart command goes through, and put a millisecond on each
 * action. Nothing here decides WHAT happens; this only reads it off the wire.
 */
export type ChartAnswer = {
  spoken: string;
  durationMs: number;
  /** Kai speaking it. Null when voice is off or the TTS could not — the chart
   *  still performs and the words are still on screen. */
  audioUrl: string | null;
  actions: { t_offset_ms: number; command: ChartCommand }[];
};

const isAnswerFrame = (f: KaiFrame): boolean => (f as { type?: string }).type === 'chart_answer';

export function readAnswer(f: unknown): ChartAnswer | null {
  const r = (f ?? {}) as Record<string, unknown>;
  const spoken = typeof r.spoken === 'string' ? r.spoken : '';
  if (!spoken.trim()) return null;
  const raw = Array.isArray(r.actions) ? (r.actions as Record<string, unknown>[]) : [];
  const actions = raw
    .map((a) => {
      const command = readCommand(a.frame);
      const t = Number(a.t_offset_ms);
      return command && Number.isFinite(t) ? { t_offset_ms: Math.max(0, Math.round(t)), command } : null;
    })
    .filter((a): a is { t_offset_ms: number; command: ChartCommand } => a != null);
  const durationMs = Number(r.duration_ms);
  const audioUrl = typeof r.audio_url === 'string' && r.audio_url ? r.audio_url : null;
  return { spoken, durationMs: Number.isFinite(durationMs) ? durationMs : 0, audioUrl, actions };
}

/* ------------------------------------------------------------------ */
/* The deterministic fallback: intent → a level that already exists    */
/* ------------------------------------------------------------------ */

const TF_WORDS: { re: RegExp; tf: PortalTimeframe }[] = [
  { re: /\b(daily|day chart|1\s?d\b|\bD\b)/i, tf: 'D' },
  { re: /\b(four[- ]hour|4\s?h)\b/i, tf: '4h' },
  { re: /\b(hourly|1\s?h|60[- ]min)/i, tf: '1h' },
  { re: /\b(fifteen|15)[- ]?min/i, tf: '15m' },
  { re: /\b(five|5)[- ]?min/i, tf: '5m' },
  { re: /\b(one|1)[- ]?min/i, tf: '1m' },
];

export function inferCommand(text: string, p: TradePortal | null): ChartCommand | null {
  const t = text.toLowerCase();
  for (const w of TF_WORDS) {
    if (w.re.test(text) && /(switch|show|go to|chart|timeframe|view)/.test(t)) {
      return { command: 'set_timeframe', payload: { timeframe: w.tf }, narration: null };
    }
  }
  if (/\b(invalidat|what breaks|what kills|no longer)/.test(t)) {
    return { command: 'show_invalidation', payload: {}, narration: null };
  }
  if (/\btrigger\b/.test(t) && /(zoom|focus|show me|jump)/.test(t)) {
    return { command: 'zoom_trigger', payload: {}, narration: null };
  }
  if (/\b(entry|stop|target|plan)\b/.test(t) && /(mark|draw|show|put)/.test(t)) {
    return { command: 'mark_plan', payload: {}, narration: null };
  }
  if (/\btrigger\b/.test(t) && /(mark|draw|show)/.test(t)) {
    return { command: 'mark_level', payload: { kind: 'trigger' }, narration: null };
  }
  if (/(community|members|everyone)/.test(t) && /(level|price)/.test(t)) {
    return { command: 'highlight_community', payload: {}, narration: null };
  }
  if (/(prior|previous|yesterday|last)\s+(session|day)/.test(t)) {
    return { command: 'compare_prior', payload: {}, narration: null };
  }
  if (/(prepare|set up|build)\s+(the\s+)?(trade|order)/.test(t) && p?.plan) {
    return { command: 'prepare_trade', payload: {}, narration: null };
  }
  return null;
}

export function useKaiPortal(opts: {
  mode: GoalMode;
  portal: TradePortal | null;
  symbol: string;
  alertId?: string | null;
  opening?: string | null;
  onCommand: (c: ChartCommand) => PortalCommandResult | null;
}) {
  const { mode, portal, symbol, alertId, opening, onCommand } = opts;
  const [turns, setTurns] = useState<PortalTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const convo = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cmdRef = useRef(onCommand);
  cmdRef.current = onCommand;
  /**
   * The answer currently performing on the chart, if any.
   *
   * A SECOND QUESTION ABANDONS THE FIRST. Two answers running at once would race
   * for the same chart and `applyChartCommand` would supersede half of each, so
   * the older one is cancelled the moment a new question is sent — and again on
   * unmount, so a run does not go on drawing on a screen that is gone.
   */
  const answerRun = useRef<AnswerRun | null>(null);
  /**
   * What Kai is saying RIGHT NOW, for the stage's lower third.
   *
   * State rather than a ref because a caption has to re-render as it changes,
   * and `live` is separate from `streaming`: the model finishes streaming long
   * before the chart has finished performing, and the caption belongs to the
   * PERFORMANCE. Ending it when the text stopped arriving would drop the
   * subtitle halfway through the answer it is subtitling.
   */
  const [answer, setAnswer] = useState<{ text: string; live: boolean } | null>(null);
  const portalRef = useRef(portal);
  portalRef.current = portal;

  useEffect(() => {
    setTurns(opening ? [{ kind: 'kai', id: nid(), text: opening, streaming: false }] : []);
    convo.current = portal?.kai.conversation_id ?? null;
  }, [opening, portal?.kai.conversation_id]);

  useEffect(() => () => {
    abort.current?.abort();
    answerRun.current?.cancel();
    if (timer.current) clearInterval(timer.current);
  }, []);

  const patch = useCallback((id: string, chunk: string) => {
    setTurns((prev) => prev.map((t) => (t.kind === 'kai' && t.id === id ? { ...t, text: t.text + chunk } : t)));
  }, []);

  const narrate = useCallback((text: string) => {
    setTurns((prev) => [...prev, { kind: 'narration', id: nid(), text }]);
  }, []);

  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body || streaming) return;
    // Asking again abandons whatever the last answer was still drawing. The
    // newest question is the one the user is owed, and two answers on one chart
    // would supersede each other's gestures half-finished.
    answerRun.current?.cancel();
    answerRun.current = null;
    setAnswer(null);
    const typingId = nid();
    setTurns((p) => [...p, { kind: 'user', id: nid(), text: body }, { kind: 'typing', id: typingId }]);
    setStreaming(true);

    const replyId = nid();
    let started = false;
    let sawCommand = false;
    const start = () => {
      started = true;
      setTurns((p) => p.map((t) => (t.id === typingId ? { kind: 'kai', id: replyId, text: '', streaming: true } : t)));
    };
    const applyCommand = (c: ChartCommand): Promise<unknown> => {
      sawCommand = true;
      const r = cmdRef.current(c);
      if (!r) return Promise.resolve();
      if (r.narration) narrate(r.narration);
      return r.done;
    };

    /**
     * Perform a directed answer.
     *
     * The prose is streamed into the reply like any other text — the user reads
     * the same words the chart is performing — and the actions run against the
     * clock the server timed them on. Not awaited by the frame handler: the
     * stream keeps arriving while the chart works, and the run is cancelled by
     * the next question rather than by the end of this one.
     */
    const performAnswer = (a: ChartAnswer) => {
      sawCommand = true;
      if (!started) start();
      patch(replyId, a.spoken);
      answerRun.current?.cancel();

      /**
       * KAI SPEAKS AND THE GESTURES FOLLOW HIS VOICE, not a stopwatch started
       * next to it. `playAnswer` hands back the playhead as the clock, so a
       * file that loads late or stalls mid-sentence takes the whole chart with
       * it rather than leaving the hand a second ahead of the words. With no
       * audio it hands back a wall clock and nothing else changes — the answer
       * plays silently, exactly as it did before there was a voice.
       */
      setAnswer({ text: a.spoken, live: true });
      const voice = playAnswer(a.audioUrl);
      const run = runChartAnswer({
        actions: a.actions.map((x) => ({ t_offset_ms: x.t_offset_ms, frame: x.command })),
        now: voice.now,
        perform: (c) => {
          const r = cmdRef.current(c);
          if (!r) return Promise.resolve();
          // The command's own sentence is NOT narrated here. The answer's prose
          // already said it, in Kai's words, and repeating the server's fallback
          // line under it reads as the chart talking over him.
          return r.done;
        },
      });
      const finish = () => {
        voice.stop();
        // The words stay on screen; only the LIVE state ends. A caption that
        // vanishes on the last gesture takes the answer with it before anyone
        // has finished reading the sentence.
        setAnswer((prev) => (prev ? { ...prev, live: false } : prev));
      };
      void run.done.then(finish, finish);
      answerRun.current = {
        done: run.done,
        // Cancelling stops the voice too. An abandoned answer that keeps talking
        // over the next one is the single most obvious way this could feel
        // broken.
        cancel: () => {
          run.cancel();
          voice.stop();
        },
      };
    };
    const finish = () => {
      setTurns((p) => p.map((t) => (t.kind === 'kai' && t.id === replyId ? { ...t, streaming: false } : t)));
      // Deterministic fallback: the stack has no chart_command frames yet, but
      // the level the user asked for is already loaded on this screen.
      if (!sawCommand) {
        const inferred = inferCommand(body, portalRef.current);
        if (inferred) void applyCommand(inferred);
      }
      setStreaming(false);
    };

    /* ---------------- fixtures: same mechanics, canned deltas ---------------- */
    if (!api.available()) {
      const inferred = inferCommand(body, portalRef.current);
      const canned = inferred
        ? `On it — ${symbol} is marked on the chart below.`
        : `${symbol} held above its trigger while volume ran above average. Ask me to mark a level and I'll draw it on the chart.`;
      const words = canned.split(' ');
      let i = 0;
      setTimeout(() => {
        start();
        timer.current = setInterval(() => {
          if (i >= words.length) {
            if (timer.current) clearInterval(timer.current);
            if (inferred) void applyCommand(inferred);
            finish();
            return;
          }
          patch(replyId, (i === 0 ? '' : ' ') + words[i]);
          i += 1;
        }, 22);
      }, 220);
      return;
    }

    /* ---------------- live stream ---------------- */
    try {
      if (!convo.current) {
        /**
         * `portal` IS NOT A CONTEXT KIND THE SERVER ACCEPTS.
         *
         * It only takes symbol | setup | alert | order | position | room | home,
         * so this call answered 400 and the whole chat died with a validation
         * error the moment it was reached. It hid because the portal payload
         * normally arrives WITH a conversation already made for it, so this
         * branch only runs when that one is missing — a degraded portal, which
         * is exactly when a working chat matters most.
         *
         * `alert` when the portal was opened over one, `symbol` otherwise, which
         * is the same sheet the server stamps when it makes this conversation
         * itself. The two paths now produce the same conversation either way.
         */
        const openedOver = alertId ?? portalRef.current?.alert?.id ?? null;
        const created = await api.createConversation(
          mode,
          { symbols: [symbol] },
          openedOver ? { kind: 'alert', symbol, id: openedOver } : { kind: 'symbol', symbol },
        );
        convo.current = created.id;
      }
      abort.current = new AbortController();
      await api.streamMessage(
        convo.current,
        body,
        {
          onFrame: (f: KaiFrame) => {
            if (isAnswerFrame(f)) {
              const a = readAnswer(f);
              if (a) performAnswer(a);
              return;
            }
            if (isCommandFrame(f)) {
              const c = readCommand(f);
              if (c) void applyCommand(c);
              return;
            }
            const type = (f as { type?: string }).type;
            if (type === 'text_delta') {
              if (!started) start();
              patch(replyId, (f as { text?: string }).text ?? '');
            } else if (type === 'object') {
              const env = (f as { object?: Record<string, unknown> }).object ?? {};
              // `chart_response` (02 §7) is the existing frame that carries
              // annotations; treat it as a mark_level batch.
              if (env.type === 'chart_response') {
                const c = readCommand({ command: 'mark_level', payload: env.payload ?? env, narration: null });
                if (c) void applyCommand(c);
              }
            } else if (type === 'error') {
              if (!started) start();
              patch(replyId, (f as { message_plain?: string }).message_plain ?? '');
            }
          },
          onError: (m) => { if (!started) start(); patch(replyId, m); },
          onDone: finish,
        },
        abort.current.signal,
      );
    } catch (e) {
      if (!started) start();
      patch(replyId, e instanceof Error ? e.message : "I couldn't answer that just now.");
      finish();
    }
  }, [mode, streaming, symbol, alertId, patch, narrate]);

  // A question typed into the top-bar search that matched no symbol arrives
  // here (see ask-bus). It is an ordinary turn — Kai answers it about the chart
  // the user is already on, rather than the search dead-ending on "no match".
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => subscribeAsk((q) => { void sendRef.current(q); }), []);

  return { turns, send, streaming, narrate, answer };
}

export { planCommand } from './plan-command';
