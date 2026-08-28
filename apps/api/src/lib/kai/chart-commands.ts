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
};

type Resolved = { price: number; label: string; kind: AnnotationKind; reason: string; provenance: string };

/**
 * Resolve one named level against the real objects. Returns null when nothing
 * in the loaded context defines it — which is a refusal, not a failure.
 */
function resolveLevel(ctx: ChartContext, key: string): Resolved | null {
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
        const r = resolveLevel(ctx, key);
        if (!r) return null;
        const ann = await upsertAnnotation(ctx.userId, {
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
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
          timeframe: ctx.timeframe,
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
          timeframe: ctx.timeframe,
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
        const ts = ctx.triggerTs;
        const r = resolveLevel(ctx, 'trigger');
        if (!ts && !r) return null;
        return {
          type: 'chart_command',
          command: 'zoom_trigger',
          payload: { focus_ts: ts, price: r?.price ?? null, symbol: ctx.symbol, timeframe: ctx.timeframe },
          annotations: [],
          narration: say(
            ts ? 'I zoomed the chart to the candle where this triggered.' : 'I centred the chart on the trigger level.'
          ),
          provenance: ts ? 'The trigger timestamp on the alert.' : 'The setup entry condition.',
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
          timeframe: ctx.timeframe,
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
- NEVER put a price in args. Name the level: ${ctx.available.join(', ')}. The server
  looks the number up in the setup, the plan or the room and draws it. A number
  you write is discarded, and a level that is not in the data is not drawn at all.
- One command per reply. Say your sentence in the text BEFORE the block — the
  chart changing without you saying what changed is not acceptable.
- commands: mark_level · set_timeframe (args.timeframe one of 1m, 5m, 15m, 1h,
  4h, 1d) · show_invalidation · mark_plan · zoom_trigger · compare_prior ·
  highlight_community · annotation_remove (args.annotation_id) ·
  annotation_explain (args.annotation_id) · alert_from_level · prepare_trade
- alert_from_level and prepare_trade PROPOSE. They do not arm a watch and they
  do not place an order. Say so.
- Community levels are labelled as the room's opinion, never as your analysis.`;
}

export const CHART_LEVEL_KEYS = LEVEL_KEYS;
