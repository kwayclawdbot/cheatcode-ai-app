import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  fixtureCandles, fixtureCandlesDaily, fixtureSearch, fixtureSymbolDetail, fixtureTradeLanding,
} from '../../lib/fixtures';
import type { Candle, GoalMode, SearchResult, SymbolDetail, Timeframe, TradeLanding } from '../../lib/types';

export const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '5D', label: '5D' },
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
];

/** Timeframe chip → the `/market/candles` query the API exposes (1d or 5m). */
export function rangeFor(tf: Timeframe): { tf: '1d' | '5m'; from: string; to: string; footer: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const day = 24 * 3600_000;
  const back = (d: number) => new Date(now.getTime() - d * day).toISOString().slice(0, 10);
  switch (tf) {
    case '1D': return { tf: '5m', from: back(1), to, footer: '1D · 5m candles' };
    case '5D': return { tf: '5m', from: back(7), to, footer: '5D · 5m candles' };
    case '1M': return { tf: '1d', from: back(31), to, footer: '1M · daily candles' };
    case '3M': return { tf: '1d', from: back(92), to, footer: '3M · daily candles' };
    case 'YTD': return { tf: '1d', from: `${now.getFullYear()}-01-01`, to, footer: 'YTD · daily candles' };
    case '1Y':
    default: return { tf: '1d', from: back(366), to, footer: '1Y · daily candles' };
  }
}

export function useTradeLanding(mode: GoalMode) {
  return useResource<TradeLanding>(() => api.tradeLanding(mode), fixtureTradeLanding, [mode]);
}

export function useSymbolDetail(symbol: string, mode: GoalMode) {
  const fallback: SymbolDetail = { ...fixtureSymbolDetail, symbol: symbol || fixtureSymbolDetail.symbol };
  return useResource<SymbolDetail>(() => api.symbolDetail(symbol, mode), fallback, [symbol, mode]);
}

/**
 * Candles for a timeframe chip.
 * Sample bars appear ONLY in fixtures mode — on the live stack an empty answer
 * stays empty rather than drawing invented price action under real levels.
 */
export function useCandles(symbol: string | undefined, tf: Timeframe, seed: Candle[] = []) {
  const offline = !api.available();
  const [candles, setCandles] = useState<Candle[]>(seed);
  const [loading, setLoading] = useState(false);
  const [isFixture, setIsFixture] = useState(offline);

  useEffect(() => {
    let alive = true;
    if (!symbol) return;
    const r = rangeFor(tf);
    if (offline) {
      setCandles(r.tf === '5m' ? fixtureCandles : fixtureCandlesDaily);
      setIsFixture(true);
      return;
    }
    setLoading(true);
    api.candles(symbol, r.tf, r.from, r.to)
      .then((c) => { if (alive) { setCandles(c); setIsFixture(false); } })
      .catch(() => { if (alive) { setCandles([]); setIsFixture(false); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [symbol, tf, offline]);

  return { candles, loading, isFixture, footer: rangeFor(tf).footer };
}

/**
 * GET /trade/search — debounced.
 * Whatever the symbol match is, the query is ALSO always offered to Kai: the
 * artboard's search accepts "safe AI stock under $200" as a first-class input,
 * and a matched ticker doesn't mean the user wasn't asking a question.
 */
function withKaiRow(results: SearchResult[], term: string): SearchResult[] {
  const hasIntent = results.some((r) => r.kind === 'kai_question');
  return hasIntent ? results : [...results, { kind: 'kai_question', text: term }];
}

export function useSymbolSearch(q: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setPending(false); return; }
    let alive = true;
    setPending(true);
    const t = setTimeout(() => {
      if (!api.available()) {
        const upper = term.toUpperCase();
        const local = fixtureSearch.filter(
          (r) => r.kind === 'instrument' && (r.symbol.startsWith(upper) || r.name.toUpperCase().includes(upper)),
        );
        setResults(withKaiRow(local, term));
        setPending(false);
        return;
      }
      api.search(term)
        .then((r) => { if (alive) setResults(withKaiRow(r, term)); })
        .catch(() => { if (alive) setResults([{ kind: 'kai_question', text: term }]); })
        .finally(() => { if (alive) setPending(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return { results, pending };
}

/** Add / remove a symbol from the watchlist with an optimistic local flag. */
export function useWatchlistToggle(symbol: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(initial), [initial]);

  const toggle = useCallback(async () => {
    const next = !on;
    setOn(next);
    if (!api.available()) return;
    setBusy(true);
    try {
      await (next ? api.addToWatchlist(symbol) : api.removeFromWatchlist(symbol));
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }, [on, symbol]);

  return { on, busy, toggle };
}
