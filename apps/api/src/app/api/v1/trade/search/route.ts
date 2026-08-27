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

  return ok(
    TradeSearchResponse.parse({
      q: term,
      instruments,
      intent: instruments.length ? null : { kind: 'kai_question', text: term },
      empty_copy: instruments.length
        ? ''
        : `I do not follow anything called "${term}". Ask me about it instead and I will tell you what I know.`,
    })
  );
});

function rank(symbol: string, term: string): number {
  if (symbol === term) return 0;
  if (symbol.startsWith(term)) return 1;
  return 2;
}
