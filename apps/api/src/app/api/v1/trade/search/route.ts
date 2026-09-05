/**
 * GET /api/v1/trade/search?q=
 *
 * Symbol or company-name prefix against `instruments`. Nothing matched is not
 * an error — the query is offered to Kai as a question instead (02 §2:
 * "natural-language intents (unresolved → offered as Kai question)").
 */
import type { NextRequest } from 'next/server';
import { TradeSearchQuery, TradeSearchResponse, type InstrumentResult } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { fetchTickerReference } from '@/lib/market/polygon';

export const dynamic = 'force-dynamic';

const LIMIT = 10;

export const GET = authed(async (req: NextRequest, _ctx: Ctx) => {
  const { q } = parseQuery(req, TradeSearchQuery);
  const term = q.trim();
  const db = serviceClient();

  const { data } = await db
    .from('instruments')
    .select('symbol,name,exchange,kind')
    .or(`symbol.ilike.${term}%,name.ilike.%${term}%`)
    .eq('active', true)
    .limit(LIMIT);

  const rows = (data ?? []) as Record<string, unknown>[];
  const upper = term.toUpperCase();

  const instruments: InstrumentResult[] = rows
    .map((r) => ({
      symbol: String(r.symbol),
      name: (r.name as string) ?? null,
      exchange: (r.exchange as string) ?? null,
      kind: (r.kind as InstrumentResult['kind']) ?? 'equity',
      route: `/symbol/${String(r.symbol)}`,
    }))
    // Exact ticker first, then ticker prefix, then name matches.
    .sort((a, b) => rank(a.symbol, upper) - rank(b.symbol, upper));

  /**
   * A TICKER THE CATALOGUE HAS NOT MET YET IS STILL A TICKER.
   *
   * The Trade section opens any listed symbol now, but this search only ever
   * looked at our own `instruments` table — so typing CRWD before anyone had
   * opened it answered "I do not follow anything called CRWD" and there was no
   * way to reach the chart at all. The section being able to open a symbol is
   * worth nothing if the search cannot hand you to it.
   *
   * Asked of Polygon ONLY when nothing local matched and the term is shaped like
   * a ticker, so the ordinary search — a name fragment, a partial symbol — costs
   * exactly what it did before. Nothing is written here: the row is created when
   * the chart is actually opened, so browsing a search box never fills the
   * catalogue with things nobody looked at.
   */
  if (!instruments.length && /^[A-Za-z][A-Za-z.\-]{0,9}$/.test(term)) {
    const ref = await fetchTickerReference(upper);
    if (ref?.ticker) {
      instruments.push({
        symbol: upper,
        name: ref.name ?? null,
        exchange: ref.primary_exchange ?? null,
        kind: String(ref.type ?? '').toUpperCase() === 'ETF' ? 'etf' : 'equity',
        route: `/symbol/${upper}`,
      });
    }
  }

  return ok(
    TradeSearchResponse.parse({
      q: term,
      instruments,
      intent: instruments.length ? null : { kind: 'kai_question', text: term },
      empty_copy: instruments.length
        ? ''
        : `I could not find a listed ticker or company called "${term}". Ask me about it instead and I will tell you what I know.`,
    })
  );
});

function rank(symbol: string, term: string): number {
  if (symbol === term) return 0;
  if (symbol.startsWith(term)) return 1;
  return 2;
}
