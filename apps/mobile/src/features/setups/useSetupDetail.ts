import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureCandles, fixtureSetupDetail } from '../../lib/fixtures';
import type { Candle, SetupDetail } from '../../lib/types';

/** GET /setups/:id → Live / Plan / Learn. */
export function useSetupDetail(id: string) {
  const fallback: SetupDetail = { ...fixtureSetupDetail, id: id || fixtureSetupDetail.id };
  return useResource<SetupDetail>(() => api.setupDetail(id), fallback, [id]);
}

/**
 * The Live view's chart — 5-minute bars for the session.
 *
 * The sample series is used ONLY in fixtures mode. On the live stack an empty
 * `/market/candles` answer stays empty: sample bars drawn under real entry and
 * stop levels would be a fabricated chart, which is exactly what the freshness
 * rules exist to prevent. CandleChart renders the levels and says so instead.
 */
export function useSetupCandles(symbol: string | undefined) {
  const offline = !api.available();
  const [candles, setCandles] = useState<Candle[]>(offline ? fixtureCandles : []);
  const [fromFixture, setFromFixture] = useState(offline);

  useEffect(() => {
    let alive = true;
    if (!symbol) return;
    if (offline) { setCandles(fixtureCandles); setFromFixture(true); return; }
    api.candles(symbol, '5m')
      .then((c) => { if (alive) { setCandles(c); setFromFixture(false); } })
      .catch(() => { if (alive) { setCandles([]); setFromFixture(false); } });
    return () => { alive = false; };
  }, [symbol, offline]);

  return { candles, fromFixture };
}
