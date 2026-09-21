/**
 * GET /api/v1/symbols/:symbol/panel?kind=quote|earnings|options
 *
 * The phone's way into the three symbol panels of the Kai workspace. Kai reads
 * the same three through `read_quote_card`, `read_earnings_history` and
 * `read_options_chain`; both go through `lib/market/panels.ts`, so a panel and
 * the sentence Kai says about it are one read.
 *
 * READ-ONLY, AND NOT GATED ON THE CATALOGUE. A symbol outside `instruments`
 * still has a price and still has listed options, and the chart surface already
 * opens for those; refusing the panel beside it would be the odd one out. A
 * ticker that is not shaped like one is refused before anything is fetched.
 *
 * A loader that cannot answer comes back as 404 with its own plain sentence —
 * the panel prints that sentence rather than an empty frame.
 */
import type { NextRequest } from 'next/server';
import {
  EarningsPanelResponse,
  OptionsChainResponse,
  QuoteCardResponse,
  SymbolPanelQuery,
} from '@shared/api';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { panels } from '@/lib/market/panels';

export const dynamic = 'force-dynamic';

const SYMBOL_SHAPE = /^[A-Z][A-Z0-9.\-]{0,11}$/;

export const GET = authedParams<{ symbol: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { symbol: string } }) => {
    const { kind } = parseQuery(req, SymbolPanelQuery);
    const symbol = decodeURIComponent(ctx.params.symbol).trim().toUpperCase();
    if (!SYMBOL_SHAPE.test(symbol)) {
      throw new ApiError('NOT_FOUND', `${symbol || 'That'} is not a ticker I can look up.`);
    }

    const p = await panels();
    if (kind === 'quote') {
      const r = await p.quoteCard(symbol);
      if (!r.ok) throw new ApiError('NOT_FOUND', r.plain);
      return ok(QuoteCardResponse.parse(r.value));
    }
    if (kind === 'earnings') {
      const r = await p.earnings(symbol);
      if (!r.ok) throw new ApiError('NOT_FOUND', r.plain);
      return ok(EarningsPanelResponse.parse(r.value));
    }
    const r = await p.optionsChain(symbol);
    if (!r.ok) throw new ApiError('NOT_FOUND', r.plain);
    return ok(OptionsChainResponse.parse(r.value));
  }
);
