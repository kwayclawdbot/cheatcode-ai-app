/**
 * What is on the chart when you open it, and what waits to be asked for.
 *
 * THE OWNER'S REPORT: "the trade chart should not populate with a bunch of shit
 * on it, the chart should only populate one marking at a time.. the spy chart is
 * showing with a million markings and labels that's no good."
 *
 * He is right, and the cause was structural rather than a bad default. Every
 * annotation ever written for a symbol — every level Kai marked in every past
 * conversation, every shelf, every average, every zone — came back from
 * `/annotations` on load and went straight onto the chart. The declutter added
 * in 16c4029 capped how many RULES could be drawn at once, which stopped the
 * plot being solid stripes, but a cap is a ceiling and the problem was the
 * floor: the resting state of the chart was "everything anyone ever marked".
 *
 * SO THE FLOOR MOVES. A chart at rest shows what this trade is about and
 * nothing else. Everything else is still there, still listed, still one tap
 * away — it is not deleted and it is not unreachable. It just no longer arrives
 * uninvited.
 *
 * TWO THINGS SURVIVE THE CUT, AND ONLY TWO.
 *
 *   WHAT YOU DREW. A line you put on the chart yourself is not clutter — you
 *   chose where it goes and you are the reason it exists. There are never many
 *   of them, and a chart that hid your own work to look tidy would be the app
 *   overruling you. Same rule as the declutter, for the same reason.
 *
 *   THE TRADE'S OWN LEVELS, when there is a live trade on screen. The entry, the
 *   stop, what invalidates it and the target are not decoration: they are the
 *   thing the screen is for, and a trade chart that made you ask to see your own
 *   stop would be absurd. On a symbol with no plan and no alert, none of this
 *   applies and the chart opens genuinely empty.
 *
 * EVERYTHING ELSE IS SUMMONED. Kai marks what he names as he narrates a read
 * (one at a time, which is what the choreography has always done and could never
 * be seen doing on a chart that was already full); the pattern registry marks
 * gaps when you ask for gaps; the levels rail puts a stored mark back when you
 * tap it. Nothing is lost. It is the difference between a chart that answers a
 * question and a chart that shouts every answer it has ever given.
 */
import type { Annotation, TradePortal } from './types';

/** The levels a trade is made of. These are decisions, not observations. */
const TRADE_KINDS = new Set<Annotation['kind']>(['trigger', 'entry', 'stop', 'invalidation', 'target']);

/**
 * True when the screen is showing an actual trade rather than just a chart.
 *
 * Without one there is no entry to draw and no stop to respect, so a stored
 * annotation that happens to be of kind `stop` belongs to some earlier idea and
 * has no claim on this screen.
 */
export function hasLiveTrade(portal: TradePortal | null): boolean {
  return Boolean(portal?.plan || portal?.alert);
}

/**
 * The marks a chart opens with.
 *
 * Returns ids rather than annotations so the caller keeps ONE list — the full
 * set still feeds the rail, the count and the inspector, and only what reaches
 * the canvas is narrowed. A filter that dropped rows would make the history
 * unreachable, which is the opposite of the intent.
 */
export function defaultVisibleIds(annotations: Annotation[], portal: TradePortal | null): Set<string> {
  const live = hasLiveTrade(portal);
  const planId = portal?.plan?.id ?? null;
  const alertId = portal?.alert?.id ?? null;
  const out = new Set<string>();

  for (const a of annotations) {
    if (a.status !== 'valid' && a.status !== 'invalidated') continue;

    // Yours, always.
    if (a.provenance === 'user') { out.add(a.id); continue; }

    if (!live || !TRADE_KINDS.has(a.kind)) continue;

    /**
     * IT HAS TO BE *THIS* TRADE'S LEVEL, not any old one.
     *
     * A stop Kai marked for a plan you closed last week is the same `kind` as
     * the stop on the plan in front of you, and showing both is how a chart ends
     * up with three stops on it. When a mark names the plan or alert it came
     * from, that name has to match. When it names neither — which is what a
     * level marked straight from the setup looks like — it is taken at face
     * value, because there is nothing better to go on and the alternative is
     * hiding the stop of the trade being displayed.
     */
    const src = a.source_plan_id ?? a.source_alert_id;
    if (src && src !== planId && src !== alertId) continue;
    out.add(a.id);
  }
  return out;
}

/**
 * The set the chart is actually given: what opens by default, plus everything
 * summoned since.
 *
 * `revealed` grows and never shrinks within a visit — a level Kai marked stays
 * marked until the user hides or deletes it, exactly as before. What changed is
 * only where the list starts.
 */
export function visibleAnnotations(
  annotations: Annotation[],
  portal: TradePortal | null,
  revealed: ReadonlySet<string>,
): Annotation[] {
  const base = defaultVisibleIds(annotations, portal);
  const stored = annotations.filter((a) => base.has(a.id) || revealed.has(a.id));
  return [...stored, ...tradeLevelAnnotations(portal, stored)];
}

/** The id prefix of a level drawn from the trade itself rather than stored. */
export const TRADE_LEVEL_PREFIX = 'trade-level:';

export const isTradeLevel = (a: Pick<Annotation, 'id'>): boolean => a.id.startsWith(TRADE_LEVEL_PREFIX);

/**
 * THE TRADE'S OWN LEVELS, DRAWN FROM THE TRADE — whether or not a mark was
 * ever stored for them.
 *
 * THE BUG (owner audit, 21 September): arriving on Trade from an alert, the
 * chart said "Nothing marked on AMD yet" while the Decide step listed entry
 * 578.75, stop 534.10 and target 712.71. The levels only reached the canvas if
 * the server had already WRITTEN them as annotations for this member, which it
 * does on one particular kind of arrival and not otherwise. So whether the
 * member saw their own stop depended on how they got to the screen.
 *
 * Now the entry, the stop and the target of the trade on screen are drawn from
 * the same numbers the Decide step reads — the saved plan first, the alert
 * second, exactly `readPortal`'s order — in every step and on the full-screen
 * stage, because both surfaces draw through `visibleAnnotations`. A stored mark
 * of the same kind for this trade wins, so nothing is ever drawn twice.
 *
 * These are never saved and never counted: `annotations` (the rail, the count,
 * the inspector's list) is untouched, and their ids say what they are.
 */
export function tradeLevelAnnotations(portal: TradePortal | null, onCanvas: Annotation[]): Annotation[] {
  if (!portal || !hasLiveTrade(portal)) return [];
  const plan = portal.plan;
  const alert = portal.alert;
  const n = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const entry = n(plan?.entry) ?? n(alert?.entry);
  const stop = n(plan?.stop) ?? n(alert?.stop);
  const target = (plan?.targets?.length ? n(plan.targets[0]) : null) ?? n(alert?.target);
  // RULE 2 of `portal2/read.ts`: an entry with no stop is not a plan — the
  // route fills a bare entry with the last traded price. Nothing is drawn.
  if (entry === null || stop === null) return [];

  const have = new Set(onCanvas.filter((a) => a.status === 'valid').map((a) => a.kind));
  const drawn: Annotation[] = [];
  const add = (kind: 'entry' | 'stop' | 'target', price: number, price2: number | null, text: string, reason: string) => {
    if (have.has(kind) || (kind === 'stop' && have.has('invalidation'))) return;
    drawn.push({
      id: `${TRADE_LEVEL_PREFIX}${portal.symbol}:${kind}`,
      symbol: portal.symbol,
      timeframe: null,
      kind,
      price,
      price2,
      ts_from: null,
      ts_to: null,
      text,
      reason,
      provenance: 'plan',
      status: 'valid',
      source_alert_id: null,
      source_setup_id: null,
      source_plan_id: plan?.id ?? null,
      created_at: null,
      updated_at: null,
    });
  };
  add('entry', entry, plan?.entry == null ? n(alert?.entry_high) : null, 'Entry',
    alert?.condition ?? 'Where the idea is still worth paying for.');
  add('stop', stop, null, 'Stop', 'Past this the reason for the trade is gone.');
  if (target !== null) add('target', target, null, 'Target', 'The first place the move has somewhere to stop.');
  return drawn;
}
