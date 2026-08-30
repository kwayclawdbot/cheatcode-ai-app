/**
 * Kai's chart-control commands (spec §7).
 *
 * THE RULE THAT SHAPES THIS FILE: Kai names WHICH level, the server resolves
 * WHAT the number is.
 *
 * The model is never asked for a price. It emits a command with a symbolic
 * reference — `{"command":"mark_level","args":{"level":"trigger"}}` — and this
 * file looks that reference up in the setup, alert, plan, position or community
 * objects that were loaded into the context. If the reference cannot be
 * resolved from a real row, the command is DROPPED rather than filled in with
 * a plausible number. That is the difference between a chart annotation and a
 * hallucination with a line attached.
 *
 * Every resolved frame carries `provenance` naming the row the number came
 * from, and `narration` — one sentence Kai says while the chart changes, because
 * spec §8 requires chart changes to be narrated, not silent.
 */
import {
  ChartCommandName,
  type AnnotationKind,
  type AnnotationRow,
  type ChartCommandFrame,
} from '@shared/api';
import { LIVE_ZONE_TARGETS } from '@shared/live';
import { z } from 'zod';
import { levels, isLong } from '../setups';
import type { SetupRow } from './context';
import { markPlanLevels, patchAnnotation, upsertAnnotation, listAnnotations } from '../round4/annotations';
import { log } from '../log';

/* ------------------------------------------------------------------ */
/* What the model is allowed to say                                     */
/* ------------------------------------------------------------------ */

export const ChartCommandRequest = z.object({
  command: ChartCommandName,
  args: z.record(z.string(), z.unknown()).default({}),
  /** The one sentence Kai says while the chart moves. */
  narration: z.string().max(400).optional(),
});
export type ChartCommandRequest = z.infer<typeof ChartCommandRequest>;

/** Named levels the model may reference. It may not reference a number. */
const LEVEL_KEYS = [
  'trigger',
  'entry',
  'stop',
  'invalidation',
  'target',
  'target1',
  'target2',
  'support',
  'resistance',
  'community',
] as const;
type LevelKey = (typeof LEVEL_KEYS)[number];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', 'D', 'daily', 'five_minute'] as const;

const TIMEFRAME_ALIAS: Record<string, string> = {
  D: '1d',
  daily: '1d',
  day: '1d',
  five_minute: '5m',
  '5min': '5m',
  '1min': '1m',
  hour: '1h',
  '60m': '1h',
};

/* ------------------------------------------------------------------ */
/* The objects a command may be resolved against                        */
/* ------------------------------------------------------------------ */

export type ChartContext = {
  userId: string;
  symbol: string;
  timeframe: string;
  setup: SetupRow | null;
  alertId: string | null;
  planId: string | null;
  /** Levels from a saved plan, which override the setup's when present. */
  plan: { entry: number | null; stop: number | null; targets: { price: number; label?: string }[] } | null;
  /** The most-mentioned level in the room, when members have named one. */
  communityLevel: number | null;
  triggerTs: string | null;
  supports: number[];
  resistances: number[];
  /** Prior session, for `compare_prior`. */
  priorSession: { from: string; to: string } | null;
  /**
   * The window the stored bars actually cover, and the last close.
   *
   * A LINE NEEDS ONLY A PRICE; A SHAPE NEEDS A TIME AS WELL. A box has to span
   * something, a ring has to sit on a bar, and an arrow has to start somewhere.
   * Inventing either end would put a rectangle over a stretch of chart that
   * means nothing, so both come from the candles `loadChartContext` already
   * fetched and a shape without them is dropped like any other unresolvable
   * reference.
   */
  bars: { firstTs: string | null; lastTs: string | null; lastPrice: number | null };
  /**
   * The timeframe the LEVELS were measured on — not the one the user is
   * looking at. `loadChartContext` computes support and resistance from daily
   * bars and reads plan and setup levels off rows graded the same way, so every
   * number here is a daily number whatever `timeframe` happens to say.
   *
   * ANNOTATIONS ARE STORED AGAINST THIS ONE. They used to be stored against
   * whatever the chart was showing, which meant the same trigger was written
   * once as a 5m row and again as a 1d row the next time the user was on the
   * daily — `upsertAnnotation` matches on (user, symbol, timeframe, kind,
   * price), so it deduped against neither. Two rows, two lines, one price.
   */
  levelTimeframe: string;
};

export type Resolved = { price: number; label: string; kind: AnnotationKind; reason: string; provenance: string };

/**
 * Resolve one named level against the real objects. Returns null when nothing
 * in the loaded context defines it — which is a refusal, not a failure.
 */
export function resolveLevel(ctx: ChartContext, key: string): Resolved | null {
  const k = String(key).toLowerCase() as LevelKey;
  const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
  const long = ctx.setup ? isLong(ctx.setup.intent) : true;
  const entry = ctx.plan?.entry ?? setupLevels.entry;
  const stop = ctx.plan?.stop ?? setupLevels.stop;
  const targets = ctx.plan?.targets?.length ? ctx.plan.targets : setupLevels.targets;
  const from = ctx.plan ? 'the plan you saved' : ctx.setup ? `the ${ctx.symbol} setup` : 'the loaded objects';

  switch (k) {
    case 'trigger':
      return entry === null
        ? null
        : {
            price: entry,
            label: 'Trigger',
            kind: 'trigger',
            reason: `This is the level that makes the idea actionable. ${long ? 'Above' : 'Below'} $${entry} it is confirmed.`,
            provenance: `Entry condition on ${from}.`,
          };
    case 'entry':
      return entry === null
        ? null
        : {
            price: entry,
            label: 'Entry',
            kind: 'entry',
            reason: `The entry area from ${from}: $${entry}.`,
            provenance: `Entry condition on ${from}.`,
          };
    case 'stop':
      return stop === null
        ? null
        : {
            price: stop,
            label: 'Stop',
            kind: 'stop',
            reason: `Where you get out if you are wrong, at $${stop}.`,
            provenance: `Stop level on ${from}.`,
          };
    case 'invalidation':
      return stop === null
        ? null
        : {
            price: stop,
            label: 'Invalidation',
            kind: 'invalidation',
            reason: `${long ? 'A close below' : 'A close above'} $${stop} means the reason for the idea is gone, not just that the trade is losing.`,
            provenance: `Invalidation on ${from}.`,
          };
    case 'target':
    case 'target1':
      return targets[0]
        ? {
            price: targets[0].price,
            label: targets[0].label ?? 'First target',
            kind: 'target',
            reason: `The first place the plan takes something off, at $${targets[0].price}.`,
            provenance: `Targets on ${from}.`,
          }
        : null;
    case 'target2':
      return targets[1]
        ? {
            price: targets[1].price,
            label: targets[1].label ?? 'Second target',
            kind: 'target',
            reason: `A later target at $${targets[1].price}.`,
            provenance: `Targets on ${from}.`,
          }
        : null;
    case 'support':
      return ctx.supports[0] !== undefined
        ? {
            price: ctx.supports[0],
            label: 'Support',
            kind: 'support',
            reason: `$${ctx.supports[0]} is the nearest price below where buyers have stepped in before.`,
            provenance: 'Swing lows computed from the stored daily bars.',
          }
        : null;
    case 'resistance':
      return ctx.resistances[0] !== undefined
        ? {
            price: ctx.resistances[0],
            label: 'Resistance',
            kind: 'resistance',
            reason: `$${ctx.resistances[0]} is the nearest price above where sellers have stepped in before.`,
            provenance: 'Swing highs computed from the stored daily bars.',
          }
        : null;
    case 'community':
      return ctx.communityLevel !== null
        ? {
            price: ctx.communityLevel,
            label: 'Community level',
            kind: 'note',
            reason: `Members of the room keep naming $${ctx.communityLevel}. That is a community observation, not my analysis, and it does not change the grade.`,
            provenance: 'Structured ideas posted by members in the room for this symbol.',
          }
        : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Shapes                                                               */
/* ------------------------------------------------------------------ */

/**
 * A ring, an arrow and a band — the three things a person at a whiteboard draws
 * that a horizontal rule cannot say.
 *
 * ANCHORED, NEVER FREEHAND. A circle's centre is a stored level at a stored bar.
 * An arrow runs from the last stored close to a stored level. A band's two edges
 * are both levels that could have been drawn as lines on their own. So a shape
 * asserts nothing that a `mark_level` would not have asserted already — it just
 * says it in the form the sentence is actually using.
 *
 * They ride `mark_level` rather than getting commands of their own, exactly as
 * they do in the show: it is the command that means "put this annotation on the
 * chart and point at it", and the client's choreography already stages one
 * annotation as a single gesture. A shape is not a new kind of chart action, it
 * is a new kind of thing to draw.
 */
async function markShape(
  ctx: ChartContext,
  shape: string,
  level: string,
  say: (fallback: string) => string
): Promise<ChartCommandFrame | null> {
  const v = level.trim().toLowerCase();
  const base = {
    symbol: ctx.symbol,
    timeframe: ctx.levelTimeframe,
    provenance: 'kai' as const,
    source_alert_id: ctx.alertId,
    source_setup_id: ctx.setup?.id ?? null,
    source_plan_id: ctx.planId,
  };

  if (shape === 'zone') {
    const pair = (LIVE_ZONE_TARGETS as Record<string, readonly string[]>)[v];
    if (!pair) return null;
    const [aName, bName] = pair;
    const a = resolveLevel(ctx, aName);
    const b = resolveLevel(ctx, bName);
    if (!a || !b || !ctx.bars.firstTs || !ctx.bars.lastTs) return null;
    const text = v === 'risk' ? 'At risk' : v === 'reward' ? 'To target' : 'Range';
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'box',
      price: a.price,
      price2: b.price,
      ts_from: ctx.bars.firstTs,
      ts_to: ctx.bars.lastTs,
      text,
      reason: `The band between the ${aName} and the ${bName}. Both edges are stored levels: ${a.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'zone', level: v, price: a.price, price2: b.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`I shaded the band between the ${aName} and the ${bName}.`),
      provenance: `${a.provenance} and ${b.provenance}, over the stored bars.`,
    };
  }

  const lv = resolveLevel(ctx, v);
  if (!lv) return null;

  if (shape === 'circle') {
    // The bar that made the level matter, falling back to the most recent one —
    // the same rule `zoom_trigger` already uses, so the two never disagree about
    // which candle a level belongs to.
    const ts = ctx.triggerTs ?? ctx.bars.lastTs;
    if (!ts) return null;
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'circle',
      price: lv.price,
      ts_from: ts,
      text: lv.label,
      reason: `Ringing the bar this ${v} comes from. ${lv.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'circle', level: v, price: lv.price, focus_ts: ts, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`This bar — where the ${v} comes from.`),
      provenance: `${lv.provenance} Centred on a stored bar.`,
    };
  }

  if (shape === 'arrow') {
    const from = ctx.bars.lastPrice;
    const ts = ctx.bars.lastTs;
    if (from === null || ts === null) return null;
    // An arrow from a price to itself is a dot, and a dot claiming to be an
    // arrow is worse than no gesture at all.
    if (Math.abs(from - lv.price) < Math.max(0.01, Math.abs(lv.price) * 0.0005)) return null;
    const ann = await upsertAnnotation(ctx.userId, {
      ...base,
      kind: 'arrow',
      price: from,
      price2: lv.price,
      ts_from: ts,
      ts_to: ts,
      text: 'To go',
      reason: `How far price still has to travel to the ${v}. ${lv.reason}`,
    });
    if (!ann) return null;
    return {
      type: 'chart_command',
      command: 'mark_level',
      payload: { shape: 'arrow', level: v, price: from, price2: lv.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
      annotations: [ann],
      narration: say(`That is the distance still to travel to the ${v}.`),
      provenance: `The last stored close and the ${v}. ${lv.provenance}`,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Execution                                                            */
/* ------------------------------------------------------------------ */

/**
 * Turn one model-emitted command into a frame with real numbers and real,
 * persisted annotations. Returns null when nothing could be resolved.
 */
export async function executeChartCommand(
  ctx: ChartContext,
  req: ChartCommandRequest,
  requestId = '-'
): Promise<ChartCommandFrame | null> {
  const args = req.args ?? {};
  const say = (fallback: string) => req.narration?.trim() || fallback;

  try {
    switch (req.command) {
      case 'mark_level': {
        const key = String(args.level ?? args.name ?? args.kind ?? 'trigger');
        // A shape rides this command; see `markShape`. Everything below is the
        // horizontal rule that `mark_level` has always drawn.
        const shape = typeof args.shape === 'string' ? args.shape.trim().toLowerCase() : null;
        if (shape) return await markShape(ctx, shape, key, say);
        const r = resolveLevel(ctx, key);
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: r.kind,
          price: r.price,
          text: r.label,
          reason: r.reason,
          provenance: 'kai',
          source_alert_id: ctx.alertId,
          source_setup_id: ctx.setup?.id ?? null,
          source_plan_id: ctx.planId,
        });
        return {
          type: 'chart_command',
          command: 'mark_level',
          payload: { level: key, price: r.price, label: r.label, kind: r.kind, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: ann ? [ann] : [],
          narration: say(`I marked ${r.label.toLowerCase()} at $${r.price} on the chart. ${r.reason}`),
          provenance: r.provenance,
        };
      }

      case 'mark_plan': {
        const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
        const entry = ctx.plan?.entry ?? setupLevels.entry;
        const stop = ctx.plan?.stop ?? setupLevels.stop;
        const targets = ctx.plan?.targets?.length ? ctx.plan.targets : setupLevels.targets;
        if (entry === null && stop === null && targets.length === 0) return null;
        const anns = await markPlanLevels({
          userId: ctx.userId,
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          entry,
          stop,
          invalidation: stop,
          targets,
          long: ctx.setup ? isLong(ctx.setup.intent) : true,
          sourceAlertId: ctx.alertId,
          sourceSetupId: ctx.setup?.id ?? null,
          sourcePlanId: ctx.planId,
          triggerTs: ctx.triggerTs,
        });
        return {
          type: 'chart_command',
          command: 'mark_plan',
          payload: { entry, stop, targets: targets.map((t) => t.price), symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: anns,
          narration: say(
            `I put the whole plan on the chart: entry ${entry === null ? 'not set' : `$${entry}`}, stop ${stop === null ? 'not set' : `$${stop}`}${targets[0] ? `, first target $${targets[0].price}` : ''}.`
          ),
          provenance: ctx.plan ? 'The plan you saved.' : `The ${ctx.symbol} setup.`,
        };
      }

      case 'show_invalidation': {
        const r = resolveLevel(ctx, 'invalidation');
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: 'invalidation',
          price: r.price,
          text: 'Invalidation',
          reason: r.reason,
          provenance: 'kai',
          source_alert_id: ctx.alertId,
          source_setup_id: ctx.setup?.id ?? null,
        });
        return {
          type: 'chart_command',
          command: 'show_invalidation',
          payload: { price: r.price, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: ann ? [ann] : [],
          narration: say(`What kills this is $${r.price}. ${r.reason}`),
          provenance: r.provenance,
        };
      }

      case 'set_timeframe': {
        const raw = String(args.timeframe ?? args.tf ?? '').trim();
        const tf = TIMEFRAME_ALIAS[raw] ?? raw;
        if (!tf || !TIMEFRAMES.includes(tf as (typeof TIMEFRAMES)[number])) return null;
        return {
          type: 'chart_command',
          command: 'set_timeframe',
          payload: { timeframe: tf, symbol: ctx.symbol },
          annotations: [],
          narration: say(`Switched the chart to the ${tf === '1d' ? 'daily' : tf} view.`),
          provenance: 'A view change only — no levels moved.',
        };
      }

      case 'zoom_trigger': {
        // NAMED, NOT ALWAYS THE TRIGGER. It is called `zoom_trigger` because the
        // trigger is what it was first asked to frame, but "take me to the
        // resistance" is the same camera move over a different level — and
        // ignoring `args.level`, as this did, silently flew to the trigger while
        // Kai was talking about something else. The default is unchanged, so
        // every existing caller behaves exactly as it did.
        const key = typeof args.level === 'string' && args.level.trim() ? args.level : 'trigger';
        const r = resolveLevel(ctx, key);
        // Only the trigger has a stored candle of its own on this side; any
        // other level is framed by price, which is a real number either way.
        const ts = r && (key === 'trigger' || key === 'entry') ? ctx.triggerTs : null;
        if (!ts && !r) return null;
        return {
          type: 'chart_command',
          command: 'zoom_trigger',
          payload: { level: key, focus_ts: ts, price: r?.price ?? null, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say(
            ts
              ? 'I zoomed the chart to the candle where this triggered.'
              : `I centred the chart on the ${String(r?.label ?? key).toLowerCase()}.`
          ),
          provenance: ts ? 'The trigger timestamp on the alert.' : (r?.provenance ?? 'The setup entry condition.'),
        };
      }

      case 'compare_prior': {
        if (!ctx.priorSession) return null;
        return {
          type: 'chart_command',
          command: 'compare_prior',
          payload: { range: ctx.priorSession, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say('I put the prior session beside this one so you can see what changed.'),
          provenance: 'Stored daily bars for the previous trading day.',
        };
      }

      case 'highlight_community': {
        const r = resolveLevel(ctx, 'community');
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.levelTimeframe,
          kind: 'note',
          price: r.price,
          text: 'Community level',
          reason: r.reason,
          provenance: 'community',
          source_alert_id: ctx.alertId,
        });
        return {
          type: 'chart_command',
          command: 'highlight_community',
          payload: { price: r.price, symbol: ctx.symbol, timeframe: ctx.timeframe, label: 'community' },
          annotations: ann ? [ann] : [],
          narration: say(`The room keeps naming $${r.price}. That is what members are saying, not my analysis.`),
          provenance: r.provenance,
        };
      }

      case 'annotation_remove': {
        const id = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        if (!id) return null;
        const row = await patchAnnotation(ctx.userId, id, {
          status: args.hide === true ? 'hidden' : 'deleted',
        }).catch(() => null);
        if (!row) return null;
        return {
          type: 'chart_command',
          command: 'annotation_remove',
          payload: { annotation_id: id, status: row.status },
          annotations: [row],
          narration: say(row.status === 'hidden' ? 'I hid that mark. It is still there if you want it back.' : 'I removed that mark.'),
          provenance: 'Your own chart marks.',
        };
      }

      case 'annotation_explain': {
        const id = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        const list = await listAnnotations({ userId: ctx.userId, symbol: ctx.symbol, includeHidden: true });
        const found: AnnotationRow | undefined = id
          ? list.annotations.find((a) => a.id === id)
          : list.annotations.find((a) => a.kind === String(args.kind));
        if (!found) return null;
        return {
          type: 'chart_command',
          command: 'annotation_explain',
          payload: { annotation_id: found.id, kind: found.kind, price: found.price },
          annotations: [found],
          narration: say(found.reason ?? `That mark is the ${found.kind} at $${found.price}.`),
          provenance: found.provenance === 'kai' ? 'A mark I placed, with the reason it was placed.' : 'A mark you placed.',
        };
      }

      case 'alert_from_level': {
        const key = String(args.level ?? 'trigger');
        const r = resolveLevel(ctx, key);
        if (!r) return null;
        // A PROPOSAL. Kai does not create the alert — the client posts it to the
        // real endpoint and the normal confirmation applies (spec §8).
        return {
          type: 'chart_command',
          command: 'alert_from_level',
          payload: {
            symbol: ctx.symbol,
            price: r.price,
            natural_language: `Tell me when ${ctx.symbol} reaches ${r.price}`,
            route: '/alert/new',
            proposal: true,
          },
          annotations: [],
          narration: say(`I have written the watch for $${r.price}. Tap it and it is armed — I do not arm it myself.`),
          provenance: r.provenance,
        };
      }

      case 'prepare_trade': {
        const setupLevels = ctx.setup ? levels(ctx.setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
        const entry = ctx.plan?.entry ?? setupLevels.entry;
        const stop = ctx.plan?.stop ?? setupLevels.stop;
        if (entry === null || stop === null) return null;
        return {
          type: 'chart_command',
          command: 'prepare_trade',
          payload: {
            symbol: ctx.symbol,
            plan_id: ctx.planId,
            entry,
            stop,
            route: ctx.planId
              ? `/order/new?symbol=${ctx.symbol}&plan=${ctx.planId}`
              : `/plan/new?symbol=${ctx.symbol}${ctx.setup ? `&setup=${ctx.setup.id}` : ''}`,
            proposal: true,
          },
          annotations: [],
          narration: say(
            'I have the ticket ready from the plan. Preparing it is not placing it — you confirm the order yourself.'
          ),
          provenance: ctx.plan ? 'The plan you saved.' : `The ${ctx.symbol} setup.`,
        };
      }

      /* ---------------- chart commands v2 (LIVE-1) ---------------- */
      //
      // Camera commands. The determinism rule applies to them exactly as it
      // does to levels, with one difference worth being explicit about: a
      // camera move carries no PRICE, so what has to be real is the TIME. A
      // `zoom_range` over invented timestamps would frame a stretch of chart
      // that means nothing, so both ends come from a loaded object or the
      // command is dropped.

      case 'zoom_range': {
        const from = typeof args.from === 'string' ? args.from : ctx.priorSession?.from ?? null;
        const to = typeof args.to === 'string' ? args.to : ctx.priorSession?.to ?? null;
        if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
        return {
          type: 'chart_command',
          command: 'zoom_range',
          payload: {
            from,
            to,
            padding: typeof args.padding === 'number' ? args.padding : 0.12,
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
          },
          annotations: [],
          narration: say('I framed the stretch of chart this is about.'),
          provenance: typeof args.from === 'string' ? 'A window on the setup being discussed.' : 'The prior session, from stored bars.',
        };
      }

      case 'scroll_bars': {
        const bars = Number(args.bars);
        if (!Number.isFinite(bars) || bars === 0) return null;
        const n = Math.max(-2000, Math.min(2000, Math.round(bars)));
        return {
          type: 'chart_command',
          command: 'scroll_bars',
          payload: { bars: n, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say(n < 0 ? 'I scrolled back to show you more history.' : 'I scrolled forward.'),
          provenance: 'A view change only — no levels moved.',
        };
      }

      case 'scroll_to_now':
        return {
          type: 'chart_command',
          command: 'scroll_to_now',
          payload: { symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say('Back to the live edge.'),
          provenance: 'A view change only — no levels moved.',
        };

      case 'flash_annotation': {
        // Pulses something ALREADY on the chart, so the id has to exist. An
        // unresolvable id is dropped rather than flashed at nothing.
        const fid = typeof args.annotation_id === 'string' ? args.annotation_id : null;
        const known = await listAnnotations({ userId: ctx.userId, symbol: ctx.symbol, includeHidden: false });
        const target: AnnotationRow | undefined = fid
          ? known.annotations.find((a) => a.id === fid)
          : known.annotations.find((a) => a.kind === String(args.kind ?? args.level ?? ''));
        if (!target) return null;
        return {
          type: 'chart_command',
          command: 'flash_annotation',
          payload: {
            annotation_id: target.id,
            pulses: Math.max(1, Math.min(6, Number(args.pulses) || 2)),
            symbol: ctx.symbol,
          },
          annotations: [target],
          narration: say(`This one — the ${target.kind} at $${target.price}.`),
          provenance: target.provenance === 'kai' ? 'A mark I placed.' : 'A mark already on your chart.',
        };
      }

      case 'pointer_hint': {
        // The only command that changes nothing at all. It exists so Kai can
        // point at where something is ABOUT to happen while still narrating —
        // attention first, then the mark.
        const rail = typeof args.rail === 'string' ? (TIMEFRAME_ALIAS[args.rail] ?? args.rail) : null;
        const key = typeof args.level === 'string' ? args.level : null;
        const r = key ? resolveLevel(ctx, key) : null;
        const ts = typeof args.ts === 'string' ? args.ts : ctx.triggerTs;
        if (!rail && !r && !ts) return null;
        return {
          type: 'chart_command',
          command: 'pointer_hint',
          payload: {
            price: r?.price ?? null,
            ts: r ? null : ts,
            rail: rail && TIMEFRAMES.includes(rail as (typeof TIMEFRAMES)[number]) ? rail : null,
            linger: args.linger === true,
            symbol: ctx.symbol,
          },
          annotations: [],
          narration: say('Watch here.'),
          provenance: r ? r.provenance : 'A place on the chart, not a number.',
        };
      }

      default:
        return null;
    }
  } catch (e) {
    log('warn', requestId, 'chart_command.failed', {
      command: req.command,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The prompt block                                                     */
/* ------------------------------------------------------------------ */

/**
 * Appended to the system prompt whenever the conversation is attached to a
 * chart. It lists the commands, insists on symbolic level names, and says out
 * loud that a number in `args` will be ignored — because the fastest way to get
 * a model to stop guessing prices is to tell it the guess will be thrown away.
 */
export function chartCommandProtocol(ctx: { symbol: string; timeframe: string; available: string[] }): string {
  return `CHART CONTROL

You are talking to the user underneath a live ${ctx.symbol} chart on the
${ctx.timeframe} timeframe. When they ask you to change the chart — mark a level,
switch timeframe, show what invalidates the setup, zoom to the trigger, compare
with the prior session, highlight the community level, remove or explain a mark,
turn a level into a watch, or prepare the trade — emit ONE fenced block:

\`\`\`chart_command
{ "command": "mark_level", "args": { "level": "trigger" }, "narration": "I marked the trigger at the level the setup is built on." }
\`\`\`

Rules, and they are strict:
- NEVER put a price in args. ${
    ctx.available.length
      ? `Name the level. THESE ARE THE ONES THIS CHART ACTUALLY HAS: ${ctx.available.join(', ')} — naming any other draws nothing.`
      : 'No named level resolves on this chart right now, so nothing can be marked on it. Say so rather than naming one.'
  } The server
  looks the number up in the setup, the plan or the room and draws it. A number
  you write is discarded, and a level that is not in the data is not drawn at all.
- One command per reply. Say your sentence in the text BEFORE the block — the
  chart changing without you saying what changed is not acceptable.
- commands: mark_level · set_timeframe (args.timeframe one of 1m, 5m, 15m, 1h,
  4h, 1d) · show_invalidation · mark_plan · zoom_trigger · compare_prior ·
  highlight_community · annotation_remove (args.annotation_id) ·
  annotation_explain (args.annotation_id) · alert_from_level · prepare_trade
- camera commands, for looking rather than marking: zoom_range (args.from,
  args.to — real timestamps from the objects you were given, never invented) ·
  scroll_bars (args.bars, negative goes back) · scroll_to_now ·
  flash_annotation (args.annotation_id — pulses a mark that is ALREADY drawn) ·
  pointer_hint (args.level or args.ts or args.rail — points, changes nothing).
  Use them when the thing you are describing is off screen. Describing a level
  the user cannot see is the same mistake as inventing one.
- alert_from_level and prepare_trade PROPOSE. They do not arm a watch and they
  do not place an order. Say so.
- Community levels are labelled as the room's opinion, never as your analysis.`;
}

/**
 * The one tool that answers instead of describing (LIVE-8).
 *
 * A `chart_command` is a single action the user asked for: "mark the trigger",
 * "switch to the hourly". `answer_on_chart` is a different thing entirely — the
 * user asked a QUESTION, and the reply is Kai working the chart while he talks:
 * camera moves, the level he is naming marked as he names it, the candle he is
 * pointing at ringed. The whole answer is directed and timed server-side by the
 * same director the live show runs.
 *
 * WHY THE MODEL ONLY WRITES PROSE INTO IT. Placing the markers is a second job,
 * and a model concentrating on prose does that one badly — measured across the
 * show's build, markers written inline came out sparse and evenly spread, and
 * instructions to write more of them moved the count without ever moving the
 * judgement. So the model writes what Kai says and nothing else. It is also the
 * anti-invention rule doing its work one more time: a writer that never places a
 * marker never writes `[MARK:resistance:625.66]`, and a price that is never
 * written cannot be wrong.
 */
export function chartAnswerProtocol(ctx: { symbol: string; timeframe: string; available: string[] }): string {
  return `ANSWERING ON THE CHART

When the user asks a QUESTION about this ${ctx.symbol} chart — why the grade is
what it is, what would change it, where the risk is, what happened at some point
on it, what you make of it — do not reply with a paragraph. Answer ON the chart:

\`\`\`answer_on_chart
{ "answer": "Two things hold it back. It has not cleared the resistance, and it is still a long way under the trigger, so the entry is not live yet. The stop is where the idea stops being true." }
\`\`\`

The server directs that prose: it moves the camera, marks the levels you named as
you name them, rings the candle and paces every gesture to the word it belongs
to. You write the words. That is the whole job.

Rules:
- NEVER write a price, and NEVER write a marker like [MARK:trigger]. Name levels
  in plain English. ${
    ctx.available.length
      ? `THIS CHART HAS: ${ctx.available.join(', ')}. Those are the words that draw something — name any other level and nothing appears.`
      : 'This chart has no named level that resolves right now, so talk about what price has done rather than about levels.'
  } A level you name that is not in the data is simply not
  drawn; nothing is invented to fill it.
- Two to four sentences. This is fifteen to thirty seconds of speech, not a
  segment. Say the thing and stop.
- Do NOT ask for a different timeframe. They are looking at the ${ctx.timeframe}
  chart and asked about it.
- Put nothing outside the block. The prose inside it IS your reply — it is shown
  to the user as you say it.
- USE IT EVEN WHEN THERE IS NO GRADED SETUP ON THIS SYMBOL. A chart with support
  and resistance on it is a chart you can answer about: those levels came from
  stored bars and are already drawn.
- OPEN WITH THE ANSWER, NOT WITH A DISCLAIMER. Do not begin "I don't have a
  graded setup on this, but..." — the user asked about the chart, not about your
  coverage, and leading with what you lack reads as a refusal even when the
  answer follows it. Mention the missing grade only if they asked for one.

WHICH BLOCK, AND THIS IS NOT A JUDGEMENT CALL:

  They told you to change the chart   -> one chart_command block.
      "mark the trigger", "switch to the hourly", "show me the invalidation",
      "clear that line". An instruction, in the imperative.

  ANYTHING ELSE THEY ASK       -> answer_on_chart. This is the DEFAULT.
      "why is this only a B?", "what do you make of it?", "what would change
      your mind?", "is this a good entry?", "what happened here?", "walk me
      through it", "what am I looking at?", "should I be worried?"

If you are about to write prose ABOUT this chart, that prose belongs inside an
answer_on_chart block. Plain prose with no block leaves the chart sitting still
while you describe things the user cannot see — you are standing at a chart with
your hands in your pockets. Prose on its own is only right when the question is
not about the chart at all.`;
}

export const CHART_LEVEL_KEYS = LEVEL_KEYS;
