/**
 * ADDING A SYMBOL TO THE CATALOGUE, ON DEMAND.
 *
 * THE OWNER'S INSTRUCTION: *"the trade section should still analyze tickers not
 * followed specifically. he should be a trade assistant on any ticker."*
 *
 * The Trade section used to answer `NOT_FOUND` — "I do not follow CRWD yet, so
 * there is no chart to open" — for anything without a row in `instruments`. That
 * reads as a limit and is really a gate: Polygon answers for CRWD, the chart
 * resolver measures twenty-one levels on it, and the tools price it. Nothing was
 * missing except a row.
 *
 * WHY A ROW IS GENUINELY REQUIRED, having looked rather than assumed. Three
 * tables have a foreign key onto `instruments(symbol)`: `candles`, and through
 * the round-4 schema `chart_annotations`, plus `option_contracts`. Without a row
 * the bars cannot be cached (every chart load re-fetches from Polygon) and — the
 * one that actually matters — KAI CANNOT MARK THE CHART, because every
 * annotation he draws is a persisted row and the insert is refused. A Trade
 * section that opens a symbol Kai cannot draw on is not what was asked for.
 *
 * WHY THIS IS NOT "FAKING A ROW". `instruments` is a reference catalogue —
 * symbol, name, exchange, kind, active — and it is NOT the list of what the
 * scanner follows. That list is `scan_universes`, which this file does not
 * touch. Adding a real, listed ticker to a catalogue of tradable symbols is what
 * the catalogue is for.
 *
 * EVERY FIELD COMES FROM POLYGON AND THE SYMBOL MUST EXIST THERE. If Polygon's
 * reference endpoint does not know the ticker, NOTHING IS WRITTEN and the caller
 * gets a refusal — which is now a true statement about the world ("there is no
 * such ticker") rather than a statement about our own coverage. A row is never
 * invented from the string the user typed; that would let a typo become a
 * permanent fake company with a chart.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { fetchTickerReference } from './polygon';

export type EnsureResult =
  | { ok: true; symbol: string; name: string | null; added: boolean }
  | { ok: false; symbol: string; plain: string };

/** Polygon's asset type → the `instrument_kind` enum. Anything else is not v1 tradable. */
function kindOf(type: string | undefined): 'equity' | 'etf' | null {
  const t = String(type ?? '').toUpperCase();
  if (t === 'CS' || t === 'ADRC' || t === 'ADRP' || t === 'PFD' || t === 'UNIT') return 'equity';
  if (t === 'ETF' || t === 'ETN' || t === 'ETV' || t === 'FUND' || t === 'ETS') return 'etf';
  return null;
}

/** In-flight de-duplication: two tabs opening the same new symbol is one lookup. */
const inFlight = new Map<string, Promise<EnsureResult>>();

/**
 * Make sure `symbol` is in the catalogue, adding it from Polygon if it is not.
 *
 * Cheap on the common path: one indexed primary-key read, and nothing else when
 * the row is already there. The Polygon lookup and the insert happen once in the
 * life of a symbol.
 */
export async function ensureInstrument(symbolRaw: string): Promise<EnsureResult> {
  const symbol = String(symbolRaw ?? '').trim().toUpperCase();
  if (!symbol || !/^[A-Z][A-Z.\-]{0,9}$/.test(symbol)) {
    return { ok: false, symbol, plain: `"${symbolRaw}" is not a ticker I can look up.` };
  }

  const db = serviceClient();
  const existing = await db.from('instruments').select('symbol,name').eq('symbol', symbol).maybeSingle();
  if (existing.data) {
    const row = existing.data as { symbol: string; name: string | null };
    return { ok: true, symbol, name: row.name ?? null, added: false };
  }

  const hit = inFlight.get(symbol);
  if (hit) return hit;

  const run = (async (): Promise<EnsureResult> => {
    const ref = await fetchTickerReference(symbol);
    if (!ref || !ref.ticker) {
      // Could be a symbol that does not exist, or Polygon declining to answer.
      // Either way we do not know that it is real, so nothing is written.
      return {
        ok: false,
        symbol,
        plain: `I could not find a listed ticker called ${symbol}. If it is newly listed or not a US stock, I may not be able to see it.`,
      };
    }
    const kind = kindOf(ref.type);
    if (!kind) {
      return {
        ok: false,
        symbol,
        plain: `${symbol} is not a stock or an ETF, so I cannot open a chart of it here.`,
      };
    }
    const { error } = await db.from('instruments').insert({
      symbol,
      name: ref.name ?? null,
      exchange: ref.primary_exchange ?? null,
      kind,
      active: ref.active ?? true,
    });
    if (error) {
      // A racing insert from another request is a success, not a failure: the
      // row we wanted now exists, which is all the caller asked for.
      const again = await db.from('instruments').select('symbol,name').eq('symbol', symbol).maybeSingle();
      if (again.data) {
        const row = again.data as { symbol: string; name: string | null };
        return { ok: true, symbol, name: row.name ?? null, added: false };
      }
      log('warn', 'instruments', 'instrument.insert_failed', { symbol, message: error.message });
      return { ok: false, symbol, plain: `I could not open ${symbol} just now. Please try again.` };
    }
    log('info', 'instruments', 'instrument.added', { symbol, name: ref.name ?? null, kind });
    return { ok: true, symbol, name: ref.name ?? null, added: true };
  })().finally(() => inFlight.delete(symbol));

  inFlight.set(symbol, run);
  return run;
}
