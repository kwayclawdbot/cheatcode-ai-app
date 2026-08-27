import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import {
  fixtureCandles, fixtureCandlesDaily, fixtureSetupDetail, fixtureWorkspace,
} from '../../lib/fixtures';
import { rangeFor } from '../trade/useTrade';
import type { Candle, GoalMode, SetupDetail, SymbolWorkspace, Timeframe } from '../../lib/types';

export const WORKSPACE_TABS = [
  { key: 'overview' as const, label: 'Overview' },
  { key: 'kai' as const, label: 'Kai' },
  { key: 'plan' as const, label: 'Plan' },
  { key: 'community' as const, label: 'Community' },
];

/** The workspace's own timeframe rail — 1D / 5D / 1M / 1Y (V5-W1). */
export const WORKSPACE_TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '5D', label: '5D' },
  { key: '1M', label: '1M' },
  { key: '1Y', label: '1Y' },
];

/**
 * `GET /symbols/:symbol?mode=` → the one persistent asset workspace.
 * The symbol is the canonical object (audit §2): everything about it is here,
 * and a setup is a module inside it rather than a competing destination.
 */
export function useWorkspace(symbol: string, mode: GoalMode) {
  const fallback: SymbolWorkspace = { ...fixtureWorkspace, symbol: symbol || fixtureWorkspace.symbol };
  return useResource<SymbolWorkspace>(() => api.workspace(symbol, mode), fallback, [symbol, mode]);
}

/**
 * The setup's depth — narration, confirmations, evidence, the four explanation
 * levels. It backs "See why" without turning the setup back into a screen.
 */
export function useSetupDepth(setupId: string | null | undefined) {
  const offline = !api.available();
  const [detail, setDetail] = useState<SetupDetail | null>(offline && setupId ? fixtureSetupDetail : null);

  useEffect(() => {
    let alive = true;
    if (!setupId) { setDetail(null); return; }
    if (offline) { setDetail({ ...fixtureSetupDetail, id: setupId }); return; }
    api.setupDetail(setupId)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [setupId, offline]);

  return detail;
}

/**
 * Candles for the workspace chart.
 * Sample bars appear ONLY in fixtures mode — on a live stack an empty answer
 * stays empty rather than drawing invented price action under real levels.
 */
export function useWorkspaceCandles(symbol: string, tf: Timeframe, seed: Candle[] = []) {
  const offline = !api.available();
  const [candles, setCandles] = useState<Candle[]>(seed);
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
    api.candles(symbol, r.tf, r.from, r.to)
      .then((c) => { if (alive) { setCandles(c); setIsFixture(false); } })
      .catch(() => { if (alive) { setCandles([]); setIsFixture(false); } });
    return () => { alive = false; };
  }, [symbol, tf, offline]);

  return { candles, isFixture, footer: rangeFor(tf).footer };
}

/**
 * "Watch this" — the plain-language name for following the setup and drafting
 * its default alert (audit §8). One call, one confirmation sentence.
 */
export function useWatchThis(setupId: string | null | undefined, initial = false) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOn(initial), [initial]);

  const watch = useCallback(async () => {
    if (!setupId || on) return;
    setBusy(true);
    setError(null);
    if (!api.available()) { setOn(true); setBusy(false); return; }
    try {
      await api.followSetup(setupId);
      setOn(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't save. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [setupId, on]);

  return { on, busy, error, watch };
}
