/**
 * THE CHART, AND KAI'S HANDS ON IT — as one thing, mountable anywhere.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS AND WHY IT EXISTS
 * ═════════════════════════════════════════════════════════════════════════════
 * Everything below was sitting INSIDE `TradePortalV2` — the portal payload, the
 * candles, the annotation set, the timeframe, the focus bar, the reveal set that
 * keeps a chart clean at rest, and the forty-line `applyCommand` that turns one
 * of Kai's chart commands into a performance on the canvas.
 *
 * None of that is about the Trade section. It is what a chart of a symbol IS in
 * this product. Leaving it there meant the chart could only ever exist at
 * `/trade/[symbol]`, and the moment a second place wanted one — Home, an alert,
 * anywhere Kai says "pull it up" — the only options were to copy it or to
 * navigate away from the conversation.
 *
 * `SymbolChart` already solved half of this: it is the whole chart as a
 * component and it deliberately owns no data. This is the other half — the data
 * and the command runtime — so that a host now needs one hook and one component
 * to have a real chart with a real Kai working it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * IT IS A MOVE, NOT A REWRITE
 * ═════════════════════════════════════════════════════════════════════════════
 * The body of `applyCommand` is the portal's, unchanged, down to the ordering
 * that matters most: REACT STATE IS COMMITTED AFTER THE CHOREOGRAPHY. Commit
 * first and every level snaps into existence before Kai's pointer reaches it,
 * and a chart read stops being a reveal and becomes a set of lines that were
 * always there. That behaviour was asked for explicitly and is preserved by
 * moving the code rather than reimplementing it.
 *
 * The chart command vocabulary — all forty-odd verbs, `mark_level` through
 * `show_invalidation` — is untouched. This changes WHERE those commands can
 * render. It does not change one of them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { applyChartCommand, type ChartHandle } from '../chart/apply';
import { usePortal, usePortalCandles } from '../portal/usePortal';
import { planCommand } from '../portal/plan-command';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import type { SymbolOffer } from '../portal/plan-command';
import { visibleAnnotations } from '../portal/visible-annotations';
import type { Annotation, ChartCommand, PortalTimeframe } from '../portal/types';
import type { GoalMode } from '../../lib/types';

export type ChartRuntimeOpts = {
  symbol: string;
  mode: GoalMode;
  /** Opened ABOUT something: the alert or setup this chart is for. */
  alertId?: string | null;
  setupId?: string | null;
  /**
   * A route a command asked to open (a plan, an order ticket).
   *
   * A CALLBACK RATHER THAN A `router.push` IN HERE, because where a command
   * sends you depends on where you are. In the Trade section it is a push onto
   * that stack; in the workspace on Home a command that navigated away would
   * throw the member out of the conversation they are having — the whole point
   * of the workspace is that it does not. The host decides.
   */
  onRoute?: (route: string) => void;
  /** Kai suggesting a different symbol. Rendered by the host or ignored. */
  onOffer?: (offer: SymbolOffer | null) => void;
};

export type ChartRuntime = {
  /** The portal payload — the trade this chart is about, when there is one. */
  data: ReturnType<typeof usePortal>['data'];
  annotations: Annotation[];
  /** Narrowed to what has actually been summoned onto the canvas. */
  onChart: Annotation[];
  candles: ReturnType<typeof usePortalCandles>['candles'];
  exact: boolean;
  timeframe: PortalTimeframe | null;
  focusTs: string | null;
  loading: boolean;
  error: string | null;
  locked: boolean;
  hideAnnotations: boolean;
  revealed: ReadonlySet<string>;

  setTimeframe: (tf: PortalTimeframe) => void;
  setHideAnnotations: (hide: boolean) => void;
  reveal: (ids: string[]) => void;
  reload: () => void;
  upsertAnnotation: ReturnType<typeof usePortal>['upsertAnnotation'];
  createUserAnnotation: ReturnType<typeof usePortal>['createUserAnnotation'];
  updateUserAnnotation: ReturnType<typeof usePortal>['updateUserAnnotation'];
  setAnnotationStatus: ReturnType<typeof usePortal>['setAnnotationStatus'];

  /** Hand the live chart up so commands can be performed on it. */
  bindChart: (h: ChartHandle | null) => void;
  bindStage: (h: ChartHandle | null) => void;
  setStageOpen: (open: boolean) => void;

  /** ONE command → the chart performs it and Kai says what he did. */
  applyCommand: (c: ChartCommand) => PortalCommandResult | null;
};

export function useChartRuntime(opts: ChartRuntimeOpts): ChartRuntime {
  const { symbol, mode, alertId = null, setupId = null, onRoute, onOffer } = opts;
  const router = useRouter();

  const {
    data, annotations, upsertAnnotation, createUserAnnotation, updateUserAnnotation,
    setAnnotationStatus, loading, error, locked, reload,
  } = usePortal(symbol, { alert: alertId, setup: setupId, ctx: 'kai', mode });

  const [tf, setTf] = useState<PortalTimeframe | null>(null);
  const [focusTs, setFocusTs] = useState<string | null>(null);
  const [hideAnnotations, setHideAnnotations] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTf(data.chart.timeframe);
    setFocusTs(data.chart.focus_ts);
  }, [data]);

  const { candles, exact } = usePortalCandles(symbol, tf);

  const chart = useRef<ChartHandle | null>(null);
  const stageChart = useRef<ChartHandle | null>(null);
  const activeChart = () => (stageOpen ? stageChart.current ?? chart.current : chart.current);
  const bindChart = useCallback((h: ChartHandle | null) => { chart.current = h; }, []);
  const bindStage = useCallback((h: ChartHandle | null) => { stageChart.current = h; }, []);

  /**
   * WHAT HAS BEEN SUMMONED ONTO THIS CHART THIS VISIT.
   *
   * The chart opens with what this trade is about and nothing else. Every other
   * level — the shelves, the averages, every mark Kai made in some earlier
   * conversation — is still in `annotations` and still tappable; it simply is
   * not on the canvas until something puts it there.
   *
   * KEYED TO THE SYMBOL, so walking to a different ticker starts clean. That is
   * also what makes a second read legible: the levels arrive one at a time
   * again instead of already being there.
   */
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  useEffect(() => { setRevealed(new Set()); }, [symbol]);
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  /**
   * ONE CHART COMMAND → THE CHART PERFORMS IT, AND KAI SAYS WHAT HE DID.
   *
   * Moved from the portal unchanged, including the ordering: React state is
   * committed AFTER the choreography, so levels do not snap into existence
   * before Kai's pointer reaches them.
   *
   * `commit` runs on both settle paths — a choreography that throws still has
   * to leave the annotations it drew in the model, or the chart would show a
   * line the rail knows nothing about.
   */
  const applyCommand = useCallback((c: ChartCommand): PortalCommandResult | null => {
    const p = planCommand(c, data, annotations);
    if (!p) return null;
    if (p.timeframe) setTf(p.timeframe);
    if (p.focusTs) setFocusTs(p.focusTs);
    if (p.upsert.length) setHideAnnotations(false);
    if (p.offer) onOffer?.(p.offer);

    const handle = activeChart();
    const commit = () => {
      p.upsert.forEach(upsertAnnotation);
      p.remove.forEach((id) => setAnnotationStatus(id, 'deleted'));
      // A mark Kai just drew has been summoned. Without this the choreography
      // stages it onto the canvas and the next render takes it straight back off.
      reveal(p.upsert.map((a) => a.id));
    };
    let done: Promise<unknown> = Promise.resolve();
    if (handle) {
      done = applyChartCommand(handle, {
        command: c.command,
        payload: c.payload,
        annotations: p.upsert.map((a) => ({
          id: a.id, kind: a.kind, price: a.price, price2: a.price2,
          ts_from: a.ts_from, ts_to: a.ts_to, text: a.text,
          provenance: a.provenance, status: a.status,
        })),
        removeIds: p.remove,
        timeframe: p.timeframe,
        focusTs: p.focusTs,
      }).then(commit, commit);
    } else {
      commit();
    }
    if (p.route) (onRoute ?? ((r: string) => router.push(r as never)))(p.route);
    // `marks` is how many lines this actually put on the chart. Zero is right
    // for a camera move and wrong-and-silent for a marking command that
    // resolved to nothing; the caller uses the count to tell the two apart.
    return { narration: p.narration, done, marks: p.upsert.length };
  }, [data, annotations, upsertAnnotation, setAnnotationStatus, reveal, onOffer, onRoute, router]);

  /**
   * WHAT THE CANVAS ACTUALLY GETS. `annotations` stays the whole set — the rail,
   * the count and the inspector all read it — and only the chart is narrowed.
   */
  const onChart = useMemo(
    () => visibleAnnotations(annotations, data, revealed),
    [annotations, data, revealed],
  );

  return {
    data, annotations, onChart, candles, exact,
    timeframe: tf, focusTs, loading, error, locked, hideAnnotations, revealed,
    setTimeframe: setTf, setHideAnnotations, reveal, reload,
    upsertAnnotation, createUserAnnotation, updateUserAnnotation, setAnnotationStatus,
    bindChart, bindStage, setStageOpen,
    applyCommand,
  };
}
