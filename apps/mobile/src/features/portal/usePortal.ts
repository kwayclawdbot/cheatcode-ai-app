/**
 * Portal data hooks.
 *
 * `usePortal` fetches the payload once per (symbol, alert, setup, ctx) and keeps
 * the annotation set as LOCAL STATE afterwards, because Kai's chart commands and
 * the user's hide/delete both mutate it in place — the chart must never wait for
 * a refetch to show a level Kai just drew.
 *
 * ── AND IT REFRESHES ─────────────────────────────────────────────────────────
 * The portal header carries the working price, so it re-asks on the quote
 * cadence while it is the visible screen. A REFRESH IS NOT A RELOAD: it never
 * raises the spinner, it never replaces the annotations (they are the local
 * truth, and a poll landing on top of a line Kai has just drawn would erase it
 * mid-conversation), and a failed one leaves the last good payload where it is.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { portalApi } from '../../lib/trade-api';
import { TradeApiError } from '../../lib/trade-api';
import { useMarketRefresh } from '../../lib/useMarketRefresh';
import type { Candle, GoalMode } from '../../lib/types';
import type { Annotation, PortalContext, PortalTimeframe, TradePortal } from './types';

export function usePortal(
  symbol: string,
  opts: { alert?: string | null; setup?: string | null; ctx?: PortalContext | null; mode: GoalMode },
) {
  const [data, setData] = useState<TradePortal | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True when the refusal was about the PLAN, not about a fault. */
  const [locked, setLocked] = useState(false);
  const { alert, setup, ctx, mode } = opts;
  /** Only the newest request may write — polls and reloads can overlap. */
  const seq = useRef(0);

  const run = useCallback(async (quiet: boolean) => {
    if (!symbol) return;
    const mine = ++seq.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
      setLocked(false);
    }
    try {
      const p = await portalApi.portal(symbol, { alert, setup, ctx, mode });
      if (seq.current !== mine) return;
      setData(p);
      // A quiet poll leaves the marks alone — see the header.
      if (!quiet) setAnnotations(p.annotations);
    } catch (e) {
      if (seq.current !== mine || quiet) return;
      setData(null);
      /**
       * "YOUR PLAN DOES NOT COVER THIS" IS NOT "SOMETHING WENT WRONG".
       *
       * A free account hitting the Trade section gets a 402 from the server,
       * and rendering that as "I could not open that chart just now" tells a
       * person the app is broken when it is working exactly as intended. The
       * code is kept so the screen can say the true thing instead.
       */
      setLocked(e instanceof TradeApiError && e.code === 'ENTITLEMENT_REQUIRED');
      setError(e instanceof TradeApiError ? e.message : 'I could not open that chart just now.');
    } finally {
      if (seq.current === mine && !quiet) setLoading(false);
    }
  }, [symbol, alert, setup, ctx, mode]);

  const load = useCallback(() => run(false), [run]);
  useEffect(() => { void load(); }, [load]);

  useMarketRefresh({
    onRefresh: useCallback(() => { void run(true); }, [run]),
    kind: 'quote',
    // A locked portal has no price to refresh and asking again would only
    // collect another 402 every fifteen seconds.
    enabled: !!symbol && !locked,
  });

  /** Add or replace one annotation (a Kai chart command, or a user level). */
  const upsertAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => {
      const i = prev.findIndex((x) => x.id === a.id);
      if (i === -1) return [...prev, a];
      const next = [...prev];
      next[i] = a;
      return next;
    });
  }, []);

  const setAnnotationStatus = useCallback((id: string, status: Annotation['status']) => {
    setAnnotations((prev) =>
      status === 'deleted'
        ? prev.filter((a) => a.id !== id)
        : prev.map((a) => (a.id === id ? { ...a, status } : a)));
    void portalApi.patchAnnotation(id, { status }).catch(() => { /* local state is the truth the user sees */ });
  }, []);

  /**
   * A DRAWING THE USER MADE, SAVED AND THEN SWAPPED FOR THE REAL ROW.
   *
   * It goes on screen first with the local id the chart page minted, because the
   * line has to appear under the finger rather than after a server. The POST
   * then comes back with the row that will survive a reload, and the draft is
   * replaced by it — same shape, same place, a real id. If the write fails the
   * draft is left exactly where it is: losing someone's drawing because a
   * request timed out is worse than keeping one that will not survive a reload,
   * and the alternative (a line vanishing under the hand that drew it) reads as
   * the app being broken.
   */
  const createUserAnnotation = useCallback(async (draft: Annotation) => {
    setAnnotations((prev) => [...prev, draft]);
    try {
      const saved = await portalApi.createAnnotation({
        symbol: draft.symbol,
        timeframe: draft.timeframe ?? 'D',
        kind: draft.kind,
        price: draft.price,
        price2: draft.price2,
        ts_from: draft.ts_from,
        ts_to: draft.ts_to,
        text: draft.text,
      });
      if (saved) setAnnotations((prev) => prev.map((a) => (a.id === draft.id ? saved : a)));
    } catch {
      /* the draft stands; see above */
    }
  }, []);

  /** Move or resize one of the user's own drawings, and remember it. */
  const updateUserAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => prev.map((x) => (x.id === a.id ? a : x)));
    // A draft that has not been saved yet has nothing to PATCH.
    if (a.id.startsWith('draft:') || a.id.startsWith('local:')) return;
    // ALL FOUR NUMBERS, not just the price. A trendline has two ends and a zone
    // has two edges; sending only `price` meant a reshape looked right until the
    // next reload and then quietly undid itself.
    void portalApi.patchAnnotation(a.id, {
      price: a.price, price2: a.price2, ts_from: a.ts_from, ts_to: a.ts_to,
    }).catch(() => { /* local state is what the user sees */ });
  }, []);

  return {
    data, annotations, upsertAnnotation, createUserAnnotation, updateUserAnnotation,
    setAnnotationStatus, loading, error, locked, reload: load,
  };
}

/**
 * Candles for the selected timeframe. `exact` is false when the stack had to
 * answer with a coarser resolution — the rail says so rather than lying.
 *
 * ── THE LAST BAR IS STILL BEING WRITTEN ──────────────────────────────────────
 * So the series is re-asked on a cadence that matches the bar's width: 30s on
 * 1-minute candles, a minute on 5s and 15s, five minutes on hourlies and dailies,
 * a quarter of an hour on the 4-hour. Two reasons it refetches the SERIES rather
 * than merging a partial bar onto the end: the server is cache-first so the call
 * is cheap, and a bar this side assembled from a quote is a candle nobody
 * printed. Nothing polls while the market is closed — the last bar is finished.
 */
export function usePortalCandles(symbol: string, tf: PortalTimeframe | null) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [exact, setExact] = useState(true);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const [tick, setTick] = useState(0);
  /** Reset on every (symbol, tf) change — a new series loads loudly. */
  const drawn = useRef(false);

  useEffect(() => { drawn.current = false; }, [symbol, tf]);

  useEffect(() => {
    if (!symbol || !tf) return;
    const mine = ++seq.current;
    const quiet = drawn.current;
    if (!quiet) setLoading(true);
    portalApi.candles(symbol, tf)
      .then((r) => {
        if (seq.current !== mine) return;
        // An empty answer to a refresh does not blank a chart that is already
        // drawn; the bars on it were real when they arrived.
        if (r.candles.length || !quiet) setCandles(r.candles);
        setExact(r.exact);
        drawn.current = true;
      })
      .catch(() => { if (seq.current === mine && !quiet) setCandles([]); })
      .finally(() => { if (seq.current === mine && !quiet) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, tick]);

  useMarketRefresh({
    onRefresh: useCallback(() => setTick((t) => t + 1), []),
    kind: 'candles',
    timeframe: tf,
    enabled: !!symbol && !!tf,
  });

  return { candles, exact, loading };
}


/* ------------------------------------------------------------------ */
/* One chart truth per symbol                                          */
/* ------------------------------------------------------------------ */

/**
 * The marks on a symbol's chart, for any surface that is not the Trade portal.
 *
 * THE POINT IS THAT THERE IS ONLY ONE SET. `chart_annotations` has always been
 * keyed by (user, symbol) — what was missing was that the ticker page never
 * read it, and passed `annotations={[]}` to its chart. So a line you drew in
 * Trade did not exist on the ticker page and one drawn there could not have
 * existed at all, which made "the chart" two different charts wearing the same
 * candles.
 *
 * This is the same store the portal uses, reached the same way, so a drawing
 * made on either surface is on both the next time they load. It is a separate
 * HOOK rather than a separate cache: `usePortal` gets its annotations inside
 * the portal payload because that endpoint already returns them, and asking for
 * them twice there would be a second request for something already in hand.
 */
export function useSymbolAnnotations(symbol: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      setAnnotations(await portalApi.annotations(symbol));
    } catch {
      // A chart with no marks is a legitimate chart. It is not worth an error
      // state, and the drawing tools still work on it.
      setAnnotations([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { void load(); }, [load]);

  /** Drawn here, saved, then swapped for the row that will survive a reload. */
  const createUserAnnotation = useCallback(async (draft: Annotation) => {
    setAnnotations((prev) => [...prev, draft]);
    try {
      const saved = await portalApi.createAnnotation({
        symbol: draft.symbol,
        timeframe: draft.timeframe ?? 'D',
        kind: draft.kind,
        price: draft.price,
        price2: draft.price2,
        ts_from: draft.ts_from,
        ts_to: draft.ts_to,
        text: draft.text,
      });
      if (saved) setAnnotations((prev) => prev.map((a) => (a.id === draft.id ? saved : a)));
    } catch {
      // The draft stands. Losing somebody's drawing to a timed-out request is
      // worse than keeping one that will not survive a reload.
    }
  }, []);

  const updateUserAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => prev.map((x) => (x.id === a.id ? a : x)));
    if (a.id.startsWith('draft:') || a.id.startsWith('local:')) return;
    void portalApi.patchAnnotation(a.id, {
      price: a.price, price2: a.price2, ts_from: a.ts_from, ts_to: a.ts_to,
    }).catch(() => { /* local state is what the user sees */ });
  }, []);

  const setAnnotationStatus = useCallback((id: string, status: Annotation['status']) => {
    setAnnotations((prev) =>
      status === 'deleted' ? prev.filter((a) => a.id !== id) : prev.map((a) => (a.id === id ? { ...a, status } : a)));
    void portalApi.patchAnnotation(id, { status }).catch(() => { /* as above */ });
  }, []);

  return { annotations, loading, createUserAnnotation, updateUserAnnotation, setAnnotationStatus, reload: load };
}
