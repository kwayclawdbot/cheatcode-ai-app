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
import { KIND_LABEL } from './types';
import { subscribeAsk } from './ask-bus';

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
  const ALL: ChartCommandName[] = [
    'mark_level', 'set_timeframe', 'show_invalidation', 'mark_plan', 'zoom_trigger',
    'compare_prior', 'highlight_community', 'annotation_remove', 'annotation_explain',
    'alert_from_level', 'prepare_trade',
  ];
  if (!(ALL as string[]).includes(name)) return null;
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
  onCommand: (c: ChartCommand) => string | null;
}) {
  const { mode, portal, symbol, alertId, opening, onCommand } = opts;
  const [turns, setTurns] = useState<PortalTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const convo = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cmdRef = useRef(onCommand);
  cmdRef.current = onCommand;
  const portalRef = useRef(portal);
  portalRef.current = portal;

  useEffect(() => {
    setTurns(opening ? [{ kind: 'kai', id: nid(), text: opening, streaming: false }] : []);
    convo.current = portal?.kai.conversation_id ?? null;
  }, [opening, portal?.kai.conversation_id]);

  useEffect(() => () => {
    abort.current?.abort();
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
    const applyCommand = (c: ChartCommand) => {
      sawCommand = true;
      const said = cmdRef.current(c);
      if (said) narrate(said);
    };
    const finish = () => {
      setTurns((p) => p.map((t) => (t.kind === 'kai' && t.id === replyId ? { ...t, streaming: false } : t)));
      // Deterministic fallback: the stack has no chart_command frames yet, but
      // the level the user asked for is already loaded on this screen.
      if (!sawCommand) {
        const inferred = inferCommand(body, portalRef.current);
        if (inferred) applyCommand(inferred);
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
            if (inferred) applyCommand(inferred);
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
        const created = await api.createConversation(
          mode,
          { symbols: [symbol], ...(portalRef.current?.alert?.id ? {} : null) },
          { kind: 'portal', symbol, id: alertId ?? portalRef.current?.alert?.id },
        );
        convo.current = created.id;
      }
      abort.current = new AbortController();
      await api.streamMessage(
        convo.current,
        body,
        {
          onFrame: (f: KaiFrame) => {
            if (isCommandFrame(f)) {
              const c = readCommand(f);
              if (c) applyCommand(c);
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
                if (c) applyCommand(c);
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

  return { turns, send, streaming, narrate };
}

/* ------------------------------------------------------------------ */
/* Applying a command to the annotation set                            */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * Turn one command into the state changes the screen must make.
 * Returns the annotations to upsert, an optional timeframe switch, an optional
 * focus timestamp, and the sentence to narrate. Everything is derived from the
 * portal payload — no price is created here.
 */
export function planCommand(c: ChartCommand, p: TradePortal | null, existing: Annotation[]): {
  upsert: Annotation[];
  remove: string[];
  timeframe: PortalTimeframe | null;
  focusTs: string | null;
  compare: boolean;
  route: string | null;
  narration: string;
} | null {
  const empty = { upsert: [] as Annotation[], remove: [] as string[], timeframe: null, focusTs: null, compare: false, route: null };
  const sym = p?.symbol ?? '';
  const now = new Date().toISOString();
  const mk = (
    kind: Annotation['kind'], price: number, opts: Partial<Annotation> = {},
  ): Annotation => ({
    id: `kai-${kind}-${price}`,
    symbol: sym,
    timeframe: null,
    kind,
    price,
    price2: null,
    ts_from: null,
    ts_to: null,
    text: `${KIND_LABEL[kind]} ${price}`,
    reason: null,
    provenance: 'kai',
    status: 'valid',
    source_alert_id: p?.alert?.id ?? null,
    source_setup_id: null,
    source_plan_id: p?.plan?.id ?? null,
    created_at: now,
    updated_at: now,
    ...opts,
  });

  // A frame that carried persisted annotations draws exactly those, whatever
  // the command was — the reason and provenance come from the server with them.
  const served = Array.isArray(c.payload.annotations) ? (c.payload.annotations as Record<string, unknown>[]) : null;
  if (served?.length) {
    const ups = served.map((a): Annotation | null => {
      const price = num(a.price) ?? num(Array.isArray(a.range) ? (a.range as unknown[])[0] : null);
      if (price == null) return null;
      const kind = String(a.kind ?? a.semantic ?? 'note') as Annotation['kind'];
      const status = String(a.status ?? 'valid');
      return {
        ...mk(kind, price),
        id: String(a.id ?? `kai-${kind}-${price}`),
        price2: num(a.price2),
        ts_from: typeof a.ts_from === 'string' ? a.ts_from : null,
        ts_to: typeof a.ts_to === 'string' ? a.ts_to : null,
        text: typeof a.text === 'string' && a.text ? a.text : `${KIND_LABEL[kind]} ${price}`,
        reason: typeof a.reason === 'string' ? a.reason : null,
        provenance: (['kai', 'user', 'community', 'plan'].includes(String(a.provenance))
          ? String(a.provenance)
          : 'kai') as Annotation['provenance'],
        status: (['valid', 'invalidated', 'hidden', 'deleted'].includes(status)
          ? status
          : 'valid') as Annotation['status'],
      };
    }).filter((a): a is Annotation => a != null);
    if (ups.length) {
      const tfRaw = String(c.payload.timeframe ?? c.payload.tf ?? '');
      const tf = (['1m', '5m', '15m', '1h', '4h', 'D'] as string[]).includes(tfRaw) ? (tfRaw as PortalTimeframe) : null;
      return {
        ...empty,
        upsert: ups,
        timeframe: tf,
        focusTs: typeof c.payload.ts === 'string' ? c.payload.ts : null,
        narration: c.narration ?? `Marked ${ups.length} level${ups.length === 1 ? '' : 's'} on the chart.`,
      };
    }
  }

  switch (c.command) {
    case 'set_timeframe': {
      const tf = String(c.payload.timeframe ?? c.payload.tf ?? '');
      const known = (['1m', '5m', '15m', '1h', '4h', 'D'] as string[]).includes(tf);
      if (!known) return null;
      return { ...empty, timeframe: tf as PortalTimeframe, narration: c.narration ?? `Switched to the ${tf === 'D' ? 'daily' : tf} chart.` };
    }
    case 'zoom_trigger': {
      const ts = String(c.payload.ts ?? p?.chart.focus_ts ?? '');
      if (!ts) return null;
      return { ...empty, focusTs: ts, narration: c.narration ?? 'Focused on the candle that triggered the alert.' };
    }
    case 'compare_prior':
      return { ...empty, compare: true, narration: c.narration ?? 'Drew the prior session behind today for comparison.' };

    case 'show_invalidation': {
      const price = num(c.payload.price) ?? p?.alert?.stop ?? p?.plan?.stop ?? null;
      if (price == null) return null;
      const from = num(c.payload.price) != null ? 'the alert' : p?.alert?.stop != null ? 'this alert' : 'your saved plan';
      return {
        ...empty,
        upsert: [mk('invalidation', price, {
          text: `Invalid ${price}`,
          reason: `Below ${price} the reason for this trade is gone. Level taken from ${from}.`,
        })],
        narration: c.narration ?? `Marked the invalidation at ${price} — from ${from}.`,
      };
    }
    case 'mark_plan': {
      const entry = num(c.payload.entry) ?? p?.plan?.entry ?? p?.alert?.entry ?? null;
      const stop = num(c.payload.stop) ?? p?.plan?.stop ?? p?.alert?.stop ?? null;
      const target = num(c.payload.target) ?? p?.plan?.targets[0] ?? p?.alert?.target ?? null;
      const ups: Annotation[] = [];
      if (entry != null) ups.push(mk('entry', entry, { price2: p?.alert?.entry_high ?? null, reason: 'The entry area on your plan.' }));
      if (stop != null) ups.push(mk('stop', stop, { reason: 'The stop on your plan. It attaches as a paper leg when the entry fills.' }));
      if (target != null) ups.push(mk('target', target, { reason: 'The first target on your plan.' }));
      if (!ups.length) return null;
      return { ...empty, upsert: ups, narration: c.narration ?? 'Marked the entry, stop and first target from your plan.' };
    }
    case 'mark_level': {
      const list = Array.isArray(c.payload.annotations) ? (c.payload.annotations as Record<string, unknown>[]) : null;
      if (list?.length) {
        const ups = list.map((a) => {
          const price = num(a.price) ?? num(Array.isArray(a.range) ? (a.range as unknown[])[0] : null);
          const kind = String(a.semantic ?? a.kind ?? 'note') as Annotation['kind'];
          return price != null ? mk(kind, price, { reason: String(a.text ?? a.reason ?? '') || null }) : null;
        }).filter((a): a is Annotation => a != null);
        if (!ups.length) return null;
        return { ...empty, upsert: ups, narration: c.narration ?? `Marked ${ups.length} level${ups.length === 1 ? '' : 's'} on the chart.` };
      }
      const kind = String(c.payload.kind ?? 'trigger') as Annotation['kind'];
      const price = num(c.payload.price)
        ?? (kind === 'trigger' ? existing.find((a) => a.kind === 'trigger')?.price ?? p?.alert?.entry ?? null : null);
      if (price == null) return null;
      return {
        ...empty,
        upsert: [mk(kind, price, { reason: c.narration ?? `The ${KIND_LABEL[kind].toLowerCase()} level on this alert.` })],
        narration: c.narration ?? `Marked the ${KIND_LABEL[kind].toLowerCase()} at ${price}.`,
      };
    }
    case 'highlight_community': {
      const price = num(c.payload.price);
      if (price == null) return null;
      return {
        ...empty,
        upsert: [mk('support', price, {
          id: `community-${price}`,
          provenance: 'community',
          text: `Members ${price}`,
          reason: 'The level members mention most in the room. Community observation — it does not change the grade.',
        })],
        narration: c.narration ?? `Highlighted ${price}, the level members mention most.`,
      };
    }
    case 'annotation_remove': {
      const id = String(c.payload.id ?? c.payload.annotation_id ?? '');
      if (!id) return null;
      return { ...empty, remove: [id], narration: c.narration ?? 'Removed that annotation.' };
    }
    case 'annotation_explain': {
      const id = String(c.payload.id ?? c.payload.annotation_id ?? '');
      const a = existing.find((x) => x.id === id);
      if (!a) return null;
      return { ...empty, narration: c.narration ?? a.reason ?? `${KIND_LABEL[a.kind]} at ${a.price}.` };
    }
    case 'alert_from_level': {
      const price = num(c.payload.price);
      return {
        ...empty,
        route: `/alert/new?symbol=${encodeURIComponent(sym)}${price != null ? `&level=${price}` : ''}`,
        narration: c.narration ?? 'Opened an alert draft from that level — nothing is armed until you confirm it.',
      };
    }
    case 'prepare_trade': {
      const route = p?.plan?.action?.route ?? (sym ? `/plan/new?symbol=${encodeURIComponent(sym)}` : null);
      if (!route) return null;
      return { ...empty, route, narration: c.narration ?? 'Opened the order for review. Nothing is sent until you confirm it.' };
    }
    default:
      return null;
  }
}
