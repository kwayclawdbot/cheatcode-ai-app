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
  const { alert, setup, ctx, mode } = opts;

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const p = await portalApi.portal(symbol, { alert, setup, ctx, mode });
      setData(p);
      setAnnotations(p.annotations);
    } catch (e) {
      setData(null);
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

  return { data, annotations, upsertAnnotation, setAnnotationStatus, loading, error, reload: load };
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
