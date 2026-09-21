/**
 * PROOF FOR THE WORKSPACE PANELS — quote card, earnings, options ladder.
 *
 *   cd apps/api && npx tsx scripts/panels-test.mts
 *
 * No network, no database, no model, no credits. Every loader is driven with
 * stubbed reads through `makePanelLoaders`, every tool through
 * `runPanelToolWith`, and every output is put through the shared zod schema the
 * route parses with — so "the phone can read what the server sends" is checked
 * here rather than discovered on a device.
 *
 * What is guarded, and why each one matters:
 *
 *  1. A FINISHED SESSION IS NEVER CALLED TODAY. The quote card's range says
 *     which session it belongs to; a Friday range on a Monday morning labelled
 *     "today so far" is the lie a freshness label exists to prevent.
 *  2. A HOLE STAYS A HOLE. No bars → nulls, not zeros. No next report date →
 *     null plus a sentence, never an estimate. No option prices → the ladder
 *     has no price field at all.
 *  3. A RECORDED OPTION PRICE LANDS ON ITS OWN CONTRACT, and only there —
 *     matched by the OCC symbol, not by the display strings it was stored with.
 *  4. THE TOOLS READ, AND ONLY READ, and each carries the honest sentence.
 *  5. KAI CAN OPEN EVERY PANEL, and nothing he can open is unchecked.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EarningsPanelResponse,
  KAI_OFFERED_ACTIONS,
  OptionsChainResponse,
  QuoteCardResponse,
  WorkspaceSurfaceKind,
  type MarketQuote,
} from '@shared/api';
import { makePanelLoaders, parseOcc, type PanelDeps } from '../src/lib/market/panels.ts';
import { PANEL_TOOLS, runPanelToolWith } from '../src/lib/kai/tools-panels.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
let passes = 0;
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

/* ==================================================================== */
/* Stubs                                                                */
/* ==================================================================== */

// Monday 21 Sep 2026, 10:30 ET.
const NOW = new Date('2026-09-21T14:30:00Z');

const quote = (over: Partial<MarketQuote> = {}): MarketQuote => ({
  symbol: 'NVDA',
  price: 181.2,
  source_ts: '2026-09-21T14:29:50Z',
  received_ts: '2026-09-21T14:30:00Z',
  freshness: 'live',
  delay_reason: null,
  prev_close: 179.5,
  change: 1.7,
  change_pct: 0.95,
  label_plain: 'Live · last trade 10:29 AM ET',
  session: 'open',
  ...over,
});

const DAILY = [
  { ts: '2026-09-17T04:00:00.000Z', o: 176, h: 178.4, l: 175.1, c: 177.9, v: 150_000_000 },
  { ts: '2026-09-18T04:00:00.000Z', o: 178, h: 180.3, l: 177.2, c: 179.5, v: 171_000_000 },
];

const LADDER = (() => {
  const out: { ticker: string; type: 'call' | 'put'; strike: number; expiry: string }[] = [];
  for (const expiry of ['2026-09-25', '2026-10-02']) {
    for (let k = 160; k <= 205; k += 2.5) {
      const occ = `${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}`;
      const strike = String(Math.round(k * 1000)).padStart(8, '0');
      out.push({ ticker: `O:NVDA${occ}C${strike}`, type: 'call', strike: k, expiry });
      out.push({ ticker: `O:NVDA${occ}P${strike}`, type: 'put', strike: k, expiry });
    }
  }
  return out;
})();

const FLOW = [
  {
    recorded_at: '2026-09-21T13:52:00Z',
    options: [
      // On the ladder: nearest expiry, 182.5 call.
      { option_symbol: 'O:NVDA260925C00182500', label: 'The contract the flow bought', bid: 2.1, ask: 2.18, volume: 8123, open_interest: 1400, iv: 0.41, expiry: 'Sep 25', strike: '182.5' },
      // Off the ladder's expiry.
      { option_symbol: 'O:NVDA261002P00170000', label: 'Named by the engine', bid: 1.02, ask: 1.07, volume: 900, open_interest: 5000, iv: 0.44 },
      // Already expired — history, not a chain.
      { option_symbol: 'O:NVDA260918C00180000', label: 'The contract the flow bought', bid: 0.5, ask: 0.55, volume: 10, open_interest: 10, iv: 0.3 },
      // Another underlying — must never appear on this one.
      { option_symbol: 'O:AMD260925C00150000', label: 'The contract the flow bought', bid: 1, ask: 1.1, volume: 1, open_interest: 1, iv: 0.3 },
    ],
  },
  {
    // An OLDER reading of the same 182.5 call: the newer one wins.
    recorded_at: '2026-09-18T14:00:00Z',
    options: [{ option_symbol: 'O:NVDA260925C00182500', label: 'old', bid: 9, ask: 9.5, volume: 1, open_interest: 1, iv: 0.9 }],
  },
];

function deps(over: Partial<PanelDeps> = {}): PanelDeps & { calls: string[] } {
  const calls: string[] = [];
  const d: PanelDeps = {
    quote: async (s) => { calls.push(`quote:${s}`); return { quote: quote({ symbol: s }), daily: DAILY, degraded: false, degraded_reason: null }; },
    sessionBar: async (s) => { calls.push(`sessionBar:${s}`); return { open: 180.1, high: 182.4, low: 179.8, volume: 21_500_000, vwap: 181.0412 }; },
    name: async () => 'NVIDIA Corp',
    financials: async () => ({
      degraded: false,
      quarters: [
        { fiscal_period: 'Q2', fiscal_year: '2027', end_date: '2026-07-26', filing_date: '2026-08-26', revenue: 46.7e9, net_income: 26.4e9, eps_diluted: 1.08 },
        { fiscal_period: 'Q1', fiscal_year: '2027', end_date: '2026-04-26', filing_date: '2026-05-28', revenue: 44.1e9, net_income: 18.8e9, eps_diluted: 0.76 },
        { fiscal_period: 'Q4', fiscal_year: '2026', end_date: '2026-01-25', filing_date: '2026-02-26', revenue: 39.3e9, net_income: 22.1e9, eps_diluted: 0.89 },
        { fiscal_period: 'Q3', fiscal_year: '2026', end_date: '2025-10-26', filing_date: '2025-11-20', revenue: 35.1e9, net_income: 19.3e9, eps_diluted: 0.78 },
        { fiscal_period: 'Q2', fiscal_year: '2026', end_date: '2025-07-27', filing_date: '2025-08-27', revenue: 30.0e9, net_income: 16.6e9, eps_diluted: 0.67 },
      ],
    }),
    earningsHint: async () => ({ date: '2026-11-19', recorded_at: '2026-09-21T13:52:00Z' }),
    optionContracts: async () => ({ contracts: LADDER, degraded: false, reason: null }),
    flowRecords: async () => FLOW,
    now: () => NOW,
    ...over,
  };
  return Object.assign(d, { calls });
}

/* ==================================================================== */
/* 1. The quote card                                                    */
/* ==================================================================== */

console.log('\nQUOTE CARD');
{
  const r = await makePanelLoaders(deps()).quoteCard('nvda');
  check('it answers', r.ok);
  if (r.ok) {
    const v = r.value;
    check('and parses with the shared schema', QuoteCardResponse.safeParse(v).success, QuoteCardResponse.safeParse(v).error?.issues);
    check('the symbol is normalised', v.symbol === 'NVDA');
    check('price, change and previous close are the quote\'s own', v.quote.price === 181.2 && v.quote.change === 1.7 && v.quote.prev_close === 179.5);
    check('while open, the range is today\'s running bar', v.day.basis === 'session_so_far' && v.day.high === 182.4 && v.day.low === 179.8);
    check('labelled as today so far', v.day.basis_plain === 'Today so far');
    check('with today\'s ET date on it', v.day.session_date === '2026-09-21');
    check('volume is carried as measured', v.day.volume === 21_500_000);
  }
}
{
  const d = deps({
    quote: async (s) => ({ quote: quote({ symbol: s, session: 'closed', freshness: 'delayed', delay_reason: 'market_closed', label_plain: 'Market closed · last close Sep 18' }), daily: DAILY, degraded: false, degraded_reason: null }),
  });
  const r = await makePanelLoaders(d).quoteCard('NVDA');
  check('market shut: it still answers', r.ok);
  if (r.ok) {
    check('the running bar is not even asked for', !d.calls.includes('sessionBar:NVDA'), d.calls);
    check('the range is the newest FINISHED session', r.value.day.basis === 'last_session' && r.value.day.high === 180.3);
    check('named by its date, never "today"', r.value.day.basis_plain === 'Sep 18 session' && !/today/i.test(r.value.day.basis_plain));
  }
}
{
  const r = await makePanelLoaders(
    deps({ quote: async (s) => ({ quote: quote({ symbol: s, session: 'pre' }), daily: [], degraded: false, degraded_reason: null }) }),
  ).quoteCard('NVDA');
  check('no bars at all: the range is null, not zero', r.ok && r.value.day.high === null && r.value.day.low === null && r.value.day.volume === null);
  check('and it says so', r.ok && r.value.day.basis === 'none' && /not known/.test(r.value.day.basis_plain));
}
{
  const r = await makePanelLoaders(
    deps({ quote: async (s) => ({ quote: quote({ symbol: s, price: null }), daily: [], degraded: true, degraded_reason: 'x' }) }),
  ).quoteCard('ZZZZ');
  check('no price: a sentence, not a card', !r.ok && /could not get a price for ZZZZ/.test(r.ok ? '' : r.plain));
}

/* ==================================================================== */
/* 2. Earnings                                                          */
/* ==================================================================== */

console.log('\nEARNINGS');
{
  const r = await makePanelLoaders(deps()).earnings('NVDA');
  check('it answers', r.ok);
  if (r.ok) {
    const v = r.value;
    check('and parses with the shared schema', EarningsPanelResponse.safeParse(v).success, EarningsPanelResponse.safeParse(v).error?.issues);
    check('four quarters at most', v.quarters.length === 4);
    check('newest first, as reported', v.quarters[0].fiscal_period === 'Q2' && v.quarters[0].eps_diluted === 1.08);
    check('a future date with a source becomes the next report', v.next?.date === '2026-11-19');
    check('counted in days from today', v.next?.days_away === 59, v.next?.days_away);
    check('and says where it came from', /options-flow feed/.test(v.next?.source_plain ?? ''));
    check('no beat/miss: the estimates sentence is there', /no beat or miss/.test(v.estimates_plain));
    check('and no estimate field exists to be filled', !('estimate' in (v.quarters[0] as object)));
  }
}
{
  const r = await makePanelLoaders(deps({ earningsHint: async () => ({ date: '2026-08-26', recorded_at: '2026-08-01T13:00:00Z' }) })).earnings('NVDA');
  check('a date that has passed is not a next date', r.ok && r.value.next === null);
  check('and the gap is explained, not estimated', r.ok && /left blank rather than guessed/.test(r.value.next_plain));
}
{
  const r = await makePanelLoaders(deps({ earningsHint: async () => null })).earnings('NVDA');
  check('no source: next is null', r.ok && r.value.next === null);
}
{
  const r = await makePanelLoaders(deps({ earningsHint: async () => null, financials: async () => ({ quarters: [], degraded: false }) })).earnings('SPY');
  check('nothing at all: a sentence, not an empty table', !r.ok && /no reported quarters on file for SPY/.test(r.ok ? '' : r.plain));
}
{
  const r = await makePanelLoaders(deps({ financials: async () => { throw new Error('boom'); } })).earnings('NVDA');
  check('a failed financials read is degraded, not thrown', r.ok && r.value.degraded && r.value.quarters.length === 0 && r.value.next !== null);
}

/* ==================================================================== */
/* 3. The options ladder                                                */
/* ==================================================================== */

console.log('\nOPTIONS');
check('an OCC symbol is read', JSON.stringify(parseOcc('O:NVDA260925C00182500')) === JSON.stringify({ root: 'NVDA', expiry: '2026-09-25', type: 'call', strike: 182.5 }));
check('without the prefix too', parseOcc('NVDA261002P00170000')?.type === 'put');
check('and nonsense is nothing', parseOcc('NVDA Sep 25 180C') === null);
{
  const r = await makePanelLoaders(deps()).optionsChain('NVDA');
  check('it answers', r.ok);
  if (r.ok) {
    const v = r.value;
    check('and parses with the shared schema', OptionsChainResponse.safeParse(v).success, OptionsChainResponse.safeParse(v).error?.issues);
    check('the ladder is drawn for the nearest expiry', v.expiry === '2026-09-25');
    check('and names the next ones', v.expiries[1] === '2026-10-02');
    check('eleven strikes around the money', v.rows.length === 11, v.rows.length);
    const atm = v.rows.filter((row) => row.nearest_the_money);
    check('exactly one is nearest the money', atm.length === 1 && atm[0].strike === 180, atm.map((x) => x.strike));
    check('both sides are listed by their real tickers', v.rows.every((row) => row.call?.startsWith('O:NVDA') && row.put?.startsWith('O:NVDA')));
    const k = v.rows.find((row) => row.strike === 182.5);
    check('a recorded price lands on its own contract', k?.call_flow?.ask === 2.18 && k.call_flow.bid === 2.1);
    check('the NEWER reading of that contract wins', k?.call_flow?.label === 'The contract the flow bought');
    check('and only on that side', k?.put_flow === null);
    check('no other row carries a price', v.rows.filter((row) => row.call_flow || row.put_flow).length === 1);
    check('a row has no price field of its own to fill', !('bid' in (v.rows[0] as object)) && !('last' in (v.rows[0] as object)));
    check('an off-ladder flow contract is still listed', v.flow.some((f) => f.expiry === '2026-10-02' && f.type === 'put' && f.strike === 170));
    check('an expired contract is not', !v.flow.some((f) => f.expiry === '2026-09-18'));
    check('another underlying never appears', !v.flow.some((f) => f.option_symbol.includes('AMD')));
    check('every flow price carries when it was recorded', v.flow.every((f) => !!f.recorded_at));
    check('the standing sentence says there are no live prices', /not on this app's market-data plan/.test(v.prices_plain));
  }
}
{
  const r = await makePanelLoaders(deps({ quote: async (s) => ({ quote: quote({ symbol: s, price: null }), daily: [], degraded: true, degraded_reason: null }) })).optionsChain('NVDA');
  check('no underlying price: a sentence, not a guessed ladder', !r.ok && /cannot say which strikes/.test(r.ok ? '' : r.plain));
}
{
  const r = await makePanelLoaders(deps({ optionContracts: async () => ({ contracts: [], degraded: true, reason: 'rate_limited' }), flowRecords: async () => [] })).optionsChain('NVDA');
  check('contracts failed and no flow: said as a failure, not as "no options"', !r.ok && /did not load just now/.test(r.ok ? '' : r.plain));
}
{
  const r = await makePanelLoaders(deps({ optionContracts: async () => ({ contracts: [], degraded: false, reason: null }), flowRecords: async () => [] })).optionsChain('XYZ');
  check('genuinely nothing listed: said as that', !r.ok && /may not have listed options/.test(r.ok ? '' : r.plain));
}
{
  const r = await makePanelLoaders(deps({ optionContracts: async () => ({ contracts: [], degraded: true, reason: 'rate_limited' }) })).optionsChain('NVDA');
  check('contracts failed but flow exists: the flow still shows, marked degraded', r.ok && r.value.rows.length === 0 && r.value.flow.length > 0 && r.value.degraded);
}

/* ==================================================================== */
/* 4. The tools                                                         */
/* ==================================================================== */

console.log('\nTOOLS');
check('three panel tools', PANEL_TOOLS.length === 3, PANEL_TOOLS.map((t) => t.name));
const FORBIDDEN = ['place', 'submit', 'buy', 'sell', 'order', 'cancel', 'execute', 'close', 'create', 'write', 'post', 'delete', 'update', 'send', 'arm'];
for (const t of PANEL_TOOLS) {
  const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  check(`${t.name} takes exactly one input, the symbol`, JSON.stringify(Object.keys(schema.properties ?? {})) === '["symbol"]' && schema.required?.[0] === 'symbol');
  check(`${t.name} refuses extra inputs`, schema.additionalProperties === false && (t as { strict?: boolean }).strict === true);
  check(`${t.name} does not act`, !FORBIDDEN.some((v) => t.name.includes(v)));
  check(`${t.name} says when to call it`, (t.description ?? '').length > 120);
}

const L = makePanelLoaders(deps());
{
  const out = await runPanelToolWith(L, 'read_quote_card', { symbol: 'nvda' });
  check('quote card: found', out?.found === true);
  check('quote card: the range and its session travel together', out?.day_high === 182.4 && out?.range_is_for === 'Today so far');
  check('quote card: the freshness is Kai\'s to repeat', out?.how_fresh_plain === 'Live · last trade 10:29 AM ET' && /Say which session/.test(String(out?.must_say)));
}
{
  const out = await runPanelToolWith(L, 'read_earnings_history', { symbol: 'NVDA' });
  check('earnings: found', out?.found === true);
  check('earnings: the next date comes with its source', (out?.next_report as { where_this_date_came_from?: string })?.where_this_date_came_from?.includes('options-flow') === true);
  check('earnings: Kai is told there is no beat/miss', /no beat or miss/.test(String(out?.must_say)));
  const none = await runPanelToolWith(makePanelLoaders(deps({ earningsHint: async () => null })), 'read_earnings_history', { symbol: 'NVDA' });
  check('earnings: with no date, Kai is told not to guess one', none?.next_report === null && /rather than guessing/.test(String(none?.must_say)));
}
{
  const out = await runPanelToolWith(L, 'read_options_chain', { symbol: 'NVDA' });
  check('options: found', out?.found === true);
  const strikes = out?.listed_strikes as { strike: number }[];
  check('options: the listed strikes carry no price', Array.isArray(strikes) && strikes.every((s) => Object.keys(s).every((k) => !/bid|ask|price|premium|last/.test(k))));
  const flow = out?.recorded_flow as { ask_when_recorded: number; recorded_at: string }[];
  check('options: a recorded price says it was WHEN RECORDED', flow?.[0]?.ask_when_recorded === 2.18 && !!flow[0].recorded_at);
  check('options: the no-live-prices sentence is Kai\'s to say', /not on this app's market-data plan/.test(String(out?.must_say)));
}
{
  const nf = await runPanelToolWith(makePanelLoaders(deps({ quote: async (s) => ({ quote: quote({ symbol: s, price: null }), daily: [], degraded: true, degraded_reason: null }) })), 'read_quote_card', { symbol: 'ZZZZ' });
  check('a loader\'s refusal reaches Kai as found:false with its sentence', nf?.found === false && /ZZZZ/.test(String(nf?.plain)));
  const blank = await runPanelToolWith(L, 'read_quote_card', { symbol: '' });
  check('no ticker: found:false, no lookup', blank?.found === false);
  check('a name it does not own falls through', (await runPanelToolWith(L, 'read_watchlist', {})) === null);
}

/* ==================================================================== */
/* 5. Read-only, structurally                                           */
/* ==================================================================== */

console.log('\nREAD-ONLY');
{
  const WRITES = /\.(insert|update|upsert|delete|rpc)\(|method:\s*['"](POST|PUT|PATCH|DELETE)/;
  for (const f of ['src/lib/market/panels.ts', 'src/lib/kai/tools-panels.ts', 'src/app/api/v1/symbols/[symbol]/panel/route.ts']) {
    check(`${f} contains no write`, !WRITES.test(read(f)));
  }
  const route = read('src/app/api/v1/symbols/[symbol]/panel/route.ts');
  check('the route exports GET and nothing else', /export const GET/.test(route) && !/export const (POST|PUT|PATCH|DELETE)/.test(route));
  check('the route parses every answer with the shared schema',
    route.includes('QuoteCardResponse.parse') && route.includes('EarningsPanelResponse.parse') && route.includes('OptionsChainResponse.parse'));
  check('the route and the tools share one loader', route.includes('panels()') && read('src/lib/kai/tools-panels.ts').includes('livePanels()'));
}

/* ==================================================================== */
/* 6. Kai can open every panel                                          */
/* ==================================================================== */

console.log('\nWORKSPACE');
{
  const { readWorkspaceAction, resolveWorkspaceAction, renderWorkspace, WORKSPACE_PROTOCOL } = await import('../src/lib/kai/workspace.ts');
  for (const a of ['show_quote', 'show_earnings', 'show_options', 'show_watchlist', 'show_portfolio'] as const) {
    check(`${a} is offered`, (KAI_OFFERED_ACTIONS as readonly string[]).includes(a));
    check(`${a} is named in the protocol`, WORKSPACE_PROTOCOL.includes(a));
  }
  for (const k of ['quote', 'earnings', 'options', 'watchlist', 'portfolio']) {
    check(`'${k}' is a surface kind`, WorkspaceSurfaceKind.safeParse(k).success);
  }
  check('show_quote parses', readWorkspaceAction('{"type":"show_quote","symbol":"NVDA"}')?.type === 'show_quote');
  check('show_quote without a symbol is nothing', readWorkspaceAction('{"type":"show_quote"}') === null);
  check('show_watchlist needs nothing', readWorkspaceAction('{"type":"show_watchlist"}')?.type === 'show_watchlist');

  // The resolver opens a client up front; none of the panel branches query it,
  // so an unreachable address is enough and proves they do not.
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'proof-no-database';
  const ctx = { userId: '00000000-0000-0000-0000-000000000000', requestId: 'proof' };
  const q = await resolveWorkspaceAction({ type: 'show_options', symbol: ' nvda ' } as never, ctx);
  check('a panel symbol is normalised on the way out', (q as { symbol?: string } | null)?.symbol === 'NVDA');
  check('a symbol not shaped like one is dropped', (await resolveWorkspaceAction({ type: 'show_earnings', symbol: 'drop table' } as never, ctx)) === null);
  check('their own desk resolves with no id to check', (await resolveWorkspaceAction({ type: 'show_portfolio' } as never, ctx))?.type === 'show_portfolio');

  const line = renderWorkspace({
    active_surface: 'options', symbol: 'NVDA', timeframe: null,
    open_surfaces: ['quote', 'options'], setup_id: null, alert_id: null, room_id: null,
  });
  check('Kai is told a panel is in front of them, in words', line.includes('the listed options for NVDA'), line);
}

console.log(failures === 0 ? `\nALL PASS (${passes})\n` : `\n${failures} FAILURE(S), ${passes} passed\n`);
process.exit(failures === 0 ? 0 : 1);
