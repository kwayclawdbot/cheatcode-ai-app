/**
 * Portal data hooks.
 *
 * `usePortal` fetches the payload once per (symbol, alert, setup, ctx) and keeps
 * the annotation set as LOCAL STATE afterwards, because Kai's chart commands and
 * the user's hide/delete both mutate it in place — the chart must never wait for
 * a refetch to show a level Kai just drew.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { portalApi } from '../../lib/trade-api';
import { TradeApiError } from '../../lib/trade-api';
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

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      const p = await portalApi.portal(symbol, { alert, setup, ctx, mode });
      setData(p);
      setAnnotations(p.annotations);
    } catch (e) {
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
      setLoading(false);
    }
  }, [symbol, alert, setup, ctx, mode]);

  useEffect(() => { void load(); }, [load]);

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

/** Candles for the selected timeframe. `exact` is false when the stack had to
 *  answer with a coarser resolution — the rail says so rather than lying. */
export function usePortalCandles(symbol: string, tf: PortalTimeframe | null) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [exact, setExact] = useState(true);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    if (!symbol || !tf) return;
    const mine = ++seq.current;
    setLoading(true);
    portalApi.candles(symbol, tf)
      .then((r) => {
        if (seq.current !== mine) return;
        setCandles(r.candles);
        setExact(r.exact);
      })
      .catch(() => { if (seq.current === mine) setCandles([]); })
      .finally(() => { if (seq.current === mine) setLoading(false); });
  }, [symbol, tf]);

  return { candles, exact, loading };
}
