/**
 * One chart command → the state changes the screen must make.
 *
 * PURE, AND IN ITS OWN FILE FOR A REASON. It lived inside `useKaiPortal.ts` and
 * so could not be imported by anything that does not run React and a native
 * audio module — which meant it had no test. It then went a whole release
 * silently returning null for the five camera commands LIVE-1 added, including
 * `pointer_hint`, which is the single commonest action a directed answer is made
 * of. The portal accepted them off the wire, planned nothing, and did nothing,
 * with no error anywhere. A pure function this important needs to be reachable
 * from a test process; that is the whole point of this file.
 *
 * NO PRICE IS CREATED HERE. Every number comes from the annotations the server
 * already persisted, or from the alert/plan/setup on screen.
 */
import type {
  Annotation, ChartCommand, PortalTimeframe, TradePortal,
} from './types';
import { KIND_LABEL } from './types';

/** Every spelling of a timeframe the server or a client may use, as the rail names it. */
const TIMEFRAME_ALIAS: Record<string, PortalTimeframe> = {
  '1m': '1m', '1min': '1m', 'minute': '1m',
  '5m': '5m', '5min': '5m', 'five_minute': '5m',
  '15m': '15m', '15min': '15m',
  '1h': '1h', '60m': '1h', 'hour': '1h', 'hourly': '1h',
  '4h': '4h', '240m': '4h',
  'D': 'D', '1d': 'D', 'd': 'D', 'day': 'D', 'daily': 'D',
};

export function normalizeTimeframe(v: unknown): PortalTimeframe | null {
  const raw = String(v ?? '').trim();
  return TIMEFRAME_ALIAS[raw] ?? TIMEFRAME_ALIAS[raw.toLowerCase()] ?? null;
}

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
      const tf = normalizeTimeframe(c.payload.timeframe ?? c.payload.tf);
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
      /**
       * `1d` AND `D` ARE THE SAME TIMEFRAME AND ONLY ONE OF THEM WAS ACCEPTED.
       *
       * The rail calls the daily `D`; the API calls it `1d` and normalises `D`
       * TO `1d` on the way out (`TIMEFRAME_ALIAS`). So the server's daily
       * command has always arrived as `1d`, failed this membership test, and
       * returned null — the one silent drop that made "show me the daily"
       * do nothing at all, on every path, since the command existed.
       */
      const tf = normalizeTimeframe(c.payload.timeframe ?? c.payload.tf);
      if (!tf) return null;
      return { ...empty, timeframe: tf, narration: c.narration ?? `Switched to the ${tf === 'D' ? 'daily' : tf} chart.` };
    }
    case 'zoom_trigger': {
      // `p?.chart.focus_ts` — the guard stopped one link short. A portal without
      // a chart block threw a TypeError out of a pure function, and in a
      // DIRECTED ANSWER that throw rejects the runner's promise and kills every
      // action after it, not just this one.
      const ts = String(c.payload.ts ?? p?.chart?.focus_ts ?? '');
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
    /* ---------------- the camera commands (LIVE-1) ---------------- */
    /**
     * THESE FELL THROUGH TO `default: return null` AND WERE SILENTLY DROPPED.
     *
     * Round 4's eleven commands all change the annotation set, so `planCommand`
     * was built around "what does this add or remove". LIVE-1 added five that
     * change NOTHING except where the camera is looking, and nobody came back
     * here — so the portal accepted them off the wire, planned nothing, and did
     * nothing, with no error anywhere.
     *
     * It barely showed while the chart was only ever asked to mark a level.
     * A DIRECTED ANSWER IS MOSTLY THESE: the director's commonest cue by a wide
     * margin is the cursor moving to the level being spoken, which is
     * `pointer_hint`. An answer with nine actions was performing two of them.
     *
     * They return a plan with no state change on purpose. The payload is what
     * matters and it goes straight through to `applyChartCommand`, where
     * `choreoInput` already reads every field these carry — the pointer target,
     * the flash id, the range, the bar count. Nothing new had to be taught to
     * the chart; it was only ever this hand-off that was missing.
     */
    case 'pointer_hint':
      return { ...empty, narration: c.narration ?? '' };

    case 'flash_annotation':
      return { ...empty, narration: c.narration ?? '' };

    case 'zoom_range':
      return { ...empty, narration: c.narration ?? '' };

    case 'scroll_bars':
      return { ...empty, narration: c.narration ?? '' };

    case 'scroll_to_now':
      return { ...empty, narration: c.narration ?? '' };

    default:
      return null;
  }
}
