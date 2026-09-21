/**
 * PROOF FOR KAI'S MARKET-INTELLIGENCE TOOLS — no network, no database, no model.
 *
 * `fetch` is replaced before anything runs. Every Polygon and Unusual Whales
 * answer below is a RECORDED response (scripts/fixtures/kai-intel, captured
 * 2026-09-21 10:12–10:16 ET, trimmed); the database is answered by the tools'
 * own `deps` seam. So this costs nothing and proves:
 *
 *   1. The pure arithmetic — ranking, breadth, sector matching, the regime read,
 *      the options and earnings shaping, the track record.
 *   2. Every tool end to end through `runKaiTool`, on recorded data.
 *   3. Sharing: three market-wide tools, one snapshot request — including when
 *      two of them are asked for at the same moment.
 *   4. Honesty: an unconfigured source, a plan refusal and a 429 each come back
 *      as a sentence, never a throw and never a number.
 *   5. READ-ONLY: not one non-GET request leaves the process.
 *   6. The definitions: strict schemas, stable text (nothing per-request in a
 *      description), and their size — which is what they add to Kai's prompt.
 *
 * Run: npx tsx scripts/kai-intel-tools-test.mts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Stub credentials BEFORE any module reads them. None of these reach a network.
process.env.POLYGON_API_KEY = 'test-polygon';
process.env.UNUSUAL_WHALES_TOKEN = 'test-uw';
process.env.SUPABASE_URL = 'https://stub.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub';

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kai-intel');
const fx = (name: string) => JSON.parse(readFileSync(join(FX, name), 'utf8'));

const SNAP = fx('polygon-snapshot-all.json');
const G5 = fx('polygon-grouped-g5.json');
const G21 = fx('polygon-grouped-g21.json');
const DAILY: Record<string, unknown> = {
  SPY: fx('polygon-daily-SPY.json'),
  NVDA: fx('polygon-daily-NVDA.json'),
  XLK: fx('polygon-daily-XLK.json'),
};
const NEWS = fx('polygon-news-NVDA.json');
const REF = fx('polygon-reference-NVDA.json');
const UW_VOL = fx('uw-options-volume-NVDA.json');
const UW_FLOW = fx('uw-flow-alerts-NVDA.json');
const UW_EARN: Record<string, unknown> = { NVDA: fx('uw-earnings-NVDA.json'), AAPL: fx('uw-earnings-AAPL.json') };

/* ------------------------------------------------------------------ */
/* The fake network                                                    */
/* ------------------------------------------------------------------ */

type Log = { method: string; host: string; path: string };
const sent: Log[] = [];
let polygonMode: 'ok' | 'forbidden' = 'ok';
let uwMode: 'ok' | '429' = 'ok';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  sent.push({ method, host: url.host, path: url.pathname });

  if (url.host === 'api.polygon.io') {
    if (polygonMode === 'forbidden') return json({ status: 'NOT_AUTHORIZED' }, 403);
    const p = url.pathname;
    if (p === '/v2/snapshot/locale/us/markets/stocks/tickers') {
      const want = url.searchParams.get('tickers');
      if (!want) return json(SNAP);
      const set = new Set(want.split(','));
      return json({ ...SNAP, tickers: SNAP.tickers.filter((t: { ticker: string }) => set.has(t.ticker)) });
    }
    const g = p.match(/^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/(\d{4}-\d{2}-\d{2})$/);
    if (g) {
      // The nearer date is "five sessions back", the farther one "a month back".
      const ageDays = (Date.parse('2026-09-21') - Date.parse(g[1])) / 86_400_000;
      return json(ageDays <= 14 ? G5 : G21);
    }
    const a = p.match(/^\/v2\/aggs\/ticker\/([^/]+)\/range\/1\/day\//);
    if (a) return DAILY[a[1]] ? json(DAILY[a[1]]) : json({ results: [] });
    if (p === '/v2/reference/news') return json(NEWS);
    if (p.startsWith('/v3/reference/tickers/')) return p.endsWith('/NVDA') ? json(REF) : json({ status: 'NOT_FOUND' }, 404);
    return json({ status: 'ERROR' }, 404);
  }
  if (url.host === 'api.unusualwhales.com') {
    if (uwMode === '429') return json({ code: 'rate_limited' }, 429);
    const p = url.pathname;
    if (p === '/api/stock/NVDA/options-volume') return json(UW_VOL);
    if (p === '/api/stock/NVDA/flow-alerts') return json(UW_FLOW);
    const e = p.match(/^\/api\/earnings\/([A-Z.]+)$/);
    if (e) return UW_EARN[e[1]] ? json(UW_EARN[e[1]]) : json({ data: [] });
    return json({ data: [] });
  }
  // Anything else (a database) answers empty. A write would be recorded above.
  return json([]);
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/* Modules under test — imported after the stubs are in place          */
/* ------------------------------------------------------------------ */

const scan = await import('../src/lib/market/scan.ts');
const uw = await import('../src/lib/market/uw.ts');
const poly = await import('../src/lib/market/polygon.ts');
const intel = await import('../src/lib/kai/tools-intel.ts');
const { runKaiTool, KAI_TOOLS } = await import('../src/lib/kai/tools.ts');

let failures = 0;
let passes = 0;
/** SHOW=1 prints each tool's answer, trimmed — what Kai would actually read. */
const show = (label: string, v: unknown) => {
  if (process.env.SHOW) console.log(`      ${label}: ${JSON.stringify(v).slice(0, 1500)}`);
};
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  ${JSON.stringify(detail).slice(0, 400)}`}`);
}
const CTX = { userId: 'user-1', mode: 'swing' as const, requestId: 'proof' };
const FIXED_NOW = Date.parse('2026-09-21T14:15:00Z');
intel.deps.now = () => FIXED_NOW;

function resetAll() {
  scan.resetScanCaches();
  uw.resetUwCaches();
  poly.resetMarketCaches();
  poly.resetPolygonCalls();
  sent.length = 0;
  polygonMode = 'ok';
  uwMode = 'ok';
}

/* ------------------------------------------------------------------ */
/* 1. Pure arithmetic                                                  */
/* ------------------------------------------------------------------ */

console.log('\nMOVERS');
const rows = (SNAP.tickers as Parameters<typeof scan.toRow>[0][]).map(scan.toRow).filter(Boolean) as ReturnType<typeof scan.toRow>[] & object[];
const all = rows as NonNullable<ReturnType<typeof scan.toRow>>[];
const top = scan.rankMovers(all, scan.MOVER_DEFAULTS);
check('ranks at most twelve', top.length > 0 && top.length <= 12, top.length);
check(
  'ranked by |move| x shares, biggest first',
  top.every((r, i) => i === 0 || Math.abs(top[i - 1].change_pct!) * top[i - 1].volume >= Math.abs(r.change_pct!) * r.volume)
);
check('every row clears the default filters', top.every((r) => r.price >= 5 && r.volume >= 500_000 && Math.abs(r.change_pct!) >= 2));
check('warrants and rights are excluded (SATLW, NBRGR, .WS)', !top.some((r) => /^[A-Z]{4}[WRU]$|\./.test(r.symbol)));
check(
  'a four-letter name ending in W is still a stock (SNOW)',
  scan.rankMovers([{ symbol: 'SNOW', price: 200, prev_close: 190, change_pct: 5.2, open: 191, high: 201, low: 190, volume: 9e6, prev_volume: 5e6, ts: null }], scan.MOVER_DEFAULTS).length === 1
);
const ups = scan.rankMovers(all, { ...scan.MOVER_DEFAULTS, direction: 'up' });
const downs = scan.rankMovers(all, { ...scan.MOVER_DEFAULTS, direction: 'down' });
check('direction up returns only gainers', ups.length > 0 && ups.every((r) => r.change_pct! > 0));
check('direction down returns only losers', downs.every((r) => r.change_pct! < 0));
const opts = intel.moverOpts({ direction: 'sideways', min_change_pct: -5, min_price: null, min_volume: '1000' });
check('nonsense inputs fall back or clamp', opts.direction === 'both' && opts.minChangePct === 0 && opts.minPrice === 5 && opts.minVolume === 1000, opts);

console.log('\nBREADTH + SECTORS');
const br = scan.breadthOf(all);
check('breadth counts only liquid common stocks', !!br && br.names_counted >= 50 && br.up + br.down === br.names_counted, br);
check('breadth share is a percentage', !!br && br.up_share_pct > 0 && br.up_share_pct < 100);
check('"tech" → XLK', scan.sectorEtfFor('tech') === 'XLK');
check('"Energy" → XLE', scan.sectorEtfFor('Energy') === 'XLE');
check('"xlre" → XLRE', scan.sectorEtfFor('xlre') === 'XLRE');
check('SIC "SEMICONDUCTORS & RELATED DEVICES" → XLK', scan.industryToEtf('SEMICONDUCTORS & RELATED DEVICES') === 'XLK');
check('SIC "NATIONAL COMMERCIAL BANKS" → XLF', scan.industryToEtf('NATIONAL COMMERCIAL BANKS') === 'XLF');
check('SIC "PHARMACEUTICAL PREPARATIONS" → XLV', scan.industryToEtf('PHARMACEUTICAL PREPARATIONS') === 'XLV');
check('an index ETF has no sector fund', scan.industryToEtf('Index ETF') === null);
check('an unknown word matches nothing', scan.sectorEtfFor('bananas') === null);
const snapMap = new Map(all.map((r) => [r.symbol, r]));
const board = intel.sectorBoard(snapMap, null, null);
check('the sector board has all eleven funds', board.length === 11, board.length);
check('ranked by today, best first', board.every((b, i) => i === 0 || (board[i - 1].today_pct ?? 0) >= (b.today_pct ?? 0)));
check('rotation reads offense vs defense', typeof scan.rotationOf(snapMap)?.plain === 'string');

console.log('\nREGIME READ');
const rising = Array.from({ length: 260 }, (_, i) => 500 + i);
const falling = Array.from({ length: 260 }, (_, i) => 800 - i);
const calm = scan.readRegime({ spyCloses: rising, spyNow: 761, spyChangePct: 0.4, vixyChangePct: -1, breadth: { names_counted: 3000, up: 2000, down: 1000, up_share_pct: 66.7, up_volume_share_pct: 60 } });
check('rising backbone + no stress = risk_on', calm.label === 'risk_on', calm);
const stressed = scan.readRegime({ spyCloses: rising, spyNow: 700, spyChangePct: -2.1, vixyChangePct: 9, breadth: { names_counted: 3000, up: 500, down: 2500, up_share_pct: 16.7, up_volume_share_pct: 10 } });
check('rising backbone + three stress signals = risk_off', stressed.label === 'risk_off', stressed);
const dip = scan.readRegime({ spyCloses: rising, spyNow: 745, spyChangePct: -0.6, vixyChangePct: 2, breadth: null });
check('rising backbone, under the 20-day = pullback', dip.label === 'pullback', dip);
const below = scan.readRegime({ spyCloses: falling, spyNow: 530, spyChangePct: 0.3, vixyChangePct: -2, breadth: null });
check('below a falling 200-day with a quiet day = chop', below.label === 'chop' || below.label === 'risk_off', below);
check('too little history = unknown, not a guess', scan.readRegime({ spyCloses: rising.slice(0, 50), spyNow: 560, spyChangePct: 0, vixyChangePct: 0, breadth: null }).label === 'unknown');
check('every read explains itself', calm.reasons.length > 0 && stressed.reasons.some((r) => r.includes('VIXY')));
check('never calls VIXY "the VIX"', !JSON.stringify(stressed).match(/the VIX\b(?! index)/));

console.log('\nOPTIONS + EARNINGS SHAPING');
const vol = uw.summarizeVolume(UW_VOL.data[0]);
check('call and put contracts carried', vol.call_contracts > 0 && vol.put_contracts > 0, vol);
check('puts per call is put ÷ call', vol.puts_per_call === Math.round((vol.put_contracts / vol.call_contracts) * 100) / 100);
check('premium is said as money', /^\$[\d.]+[KMB]?$/.test(String(vol.call_premium)), vol.call_premium);
const big = uw.biggestFlow(UW_FLOW.data, 5);
check('five biggest trades at most', big.length === 5, big.length);
check('biggest premium first', big.every((b, i) => i === 0 || parseFloat(String(big[i - 1].premium).slice(1)) * (String(big[i - 1].premium).endsWith('M') ? 1e3 : 1) >= parseFloat(String(b.premium).slice(1)) * (String(b.premium).endsWith('M') ? 1e3 : 1)));
check('every contract names strike AND expiry', big.every((b) => /^\d+(\.\d+)? (call|put) expiring \d{4}-\d{2}-\d{2}$/.test(b.contract)), big.map((b) => b.contract));
const en = uw.summarizeEarnings((UW_EARN.NVDA as { data: never }).data, '2026-09-21');
check('next NVDA report found', en.next?.date === '2026-11-18', en.next);
check('an estimated date is flagged unconfirmed', en.next?.date_confirmed === false);
check('last reports: four, newest first, with beat/miss', en.last_reports.length === 4 && en.last_reports[0].date === '2026-08-26' && en.last_reports[0].result === 'beat', en.last_reports[0]);
check('a report dated today still counts as upcoming', uw.summarizeEarnings([{ report_date: '2026-09-21', actual_eps: null }], '2026-09-21').next?.days_away === 0);

console.log('\nTRACK RECORD');
const TR: import('../src/lib/kai/tools-intel.ts').TrackRow[] = [
  { symbol: 'GME', mode: 'swing', intent: 'buy_to_open', state: 'expired', grade_display: 'A', created_at: '2026-09-11T12:36:27Z', call_price: null, entry_condition: { price: 22.1 }, quote_snapshot: null, score_components: { family: 'swing_long', outcome: { win_5d: true, gain_5d_pct: 6.39, mfe_5d_pct: 7.85 } }, peak_price: 24.3, peak_gain_pct: null, resolution_kind: 'target_met' },
  { symbol: 'SKHY', mode: 'swing', intent: 'buy_to_open', state: 'expired', grade_display: 'B', created_at: '2026-09-11T12:36:27Z', call_price: null, entry_condition: null, quote_snapshot: { price: 40 }, score_components: { family: 'swing_long', outcome: { win_5d: false, gain_5d_pct: -2.58, mfe_5d_pct: 0.25 }, family_performance: { plain: 'Of the last 230 long swing picks…' } }, peak_price: null, peak_gain_pct: null, resolution_kind: 'stop_met' },
  { symbol: 'P', mode: 'swing', intent: 'buy_to_open', state: 'ready', grade_display: 'A', created_at: '2026-09-21T12:33:04Z', call_price: null, entry_condition: { price: 105.86 }, quote_snapshot: null, score_components: { family: 'swing_long' }, peak_price: 111.59, peak_gain_pct: null, resolution_kind: null },
  { symbol: 'MU', mode: 'day_trade', intent: 'buy_to_open', state: 'closed', grade_display: null, created_at: '2026-09-15T13:40:00Z', call_price: 120, entry_condition: null, quote_snapshot: null, score_components: { family: 'uoa_day_trade', outcome: { win_5d: true, gain_5d_pct: 3.1, mfe_5d_pct: 4 } }, peak_price: null, peak_gain_pct: null, resolution_kind: 'contract_expired' },
];
const rec = intel.trackRecordFrom(TR);
check('calls counts every row, graded only the measured ones', rec.calls === 4 && rec.graded === 3, rec);
check('right % = right ÷ graded', rec.right_pct === 66.7, rec.right_pct);
check('average 5-session result', rec.avg_result_5d_pct === Math.round(((6.39 - 2.58 + 3.1) / 3) * 10) / 10, rec.avg_result_5d_pct);
check('families named in plain words', rec.by_family.some((f) => f.family === 'Day trade · unusual options'));
check('the engine\'s own stamped record travels', rec.by_family.some((f) => f.engine_record?.startsWith('Of the last 230')));
check('a running call says so and is not graded', rec.recent.some((r) => r.symbol === 'P' && r.how_it_ended === 'still running' && r.right === null));
check('called-at price falls back entry → snapshot', rec.recent.find((r) => r.symbol === 'SKHY')?.called_at === 40);
check('how it ended is plain English', rec.recent.find((r) => r.symbol === 'GME')?.how_it_ended === 'reached its target');

/* ------------------------------------------------------------------ */
/* 2 + 3. Every tool end to end, and the shared snapshot               */
/* ------------------------------------------------------------------ */

console.log('\nEND TO END (recorded upstreams)');
resetAll();
intel.deps.trackRows = async () => TR;
intel.deps.latestSetup = async () => null;
intel.deps.uoaCalls = async () => [];
intel.deps.watchlistSymbols = async () => ['NVDA', 'AAPL'];

const movers = await runKaiTool('scan_movers', { direction: null, min_change_pct: null, min_price: null, min_volume: null }, CTX);
show('scan_movers', movers);
check('scan_movers answers', movers.found === true, movers.plain);
const mv = (movers.movers ?? []) as Record<string, unknown>[];
check('scan_movers returns ≤12 rows with price and move', mv.length > 0 && mv.length <= 12 && mv.every((m) => typeof m.price === 'number'));
check('headlines are fenced as untrusted', mv.slice(0, 5).some((m) => String(m.latest_headline).startsWith('<untrusted_content>')), mv[0]);
check('only the top five carry a headline', mv.slice(5).every((m) => m.latest_headline === undefined));
check('it says a mover is not a trade idea', String(movers.must_say).includes('not trade ideas'));

const snapCalls = () => sent.filter((s) => s.host === 'api.polygon.io' && s.path === '/v2/snapshot/locale/us/markets/stocks/tickers').length;
const beforeCtx = snapCalls();
const ctxOut = await runKaiTool('read_market_context', {}, CTX);
const sectorsOut = await runKaiTool('read_sectors', { sector: null }, CTX);
check('market context + sectors after a scan cost ZERO extra snapshot calls', snapCalls() === beforeCtx, { before: beforeCtx, after: snapCalls() });

show('read_market_context', ctxOut);
show('read_sectors', sectorsOut);
check('read_market_context answers', ctxOut.found === true, ctxOut.plain);
check('indexes include SPY, QQQ, IWM, DIA', JSON.stringify(ctxOut.indexes).includes('"SPY"') && JSON.stringify(ctxOut.indexes).includes('"DIA"'));
check('VIXY is labelled as not the VIX index', JSON.stringify(ctxOut.cross_market).includes('not the VIX index itself'));
const regime = ctxOut.regime as { read: string; because?: string[] };
check('the regime read is one of the four labels', ['risk_on', 'pullback', 'risk_off', 'chop'].includes(regime.read), regime);
check('the regime read gives its reasons', (regime.because ?? []).length > 0);
check('breadth is a sentence with counts', /\d+ liquid stocks are up and \d+ are down/.test(String((ctxOut.breadth as { plain: string }).plain)));

check('read_sectors ranks eleven funds', (sectorsOut.ranked_today as unknown[]).length === 11, sectorsOut);
check('five-day and one-month changes measured', (sectorsOut.ranked_today as { five_days_pct: number | null; one_month_pct: number | null }[]).every((b) => b.five_days_pct !== null && b.one_month_pct !== null));
const tech = await runKaiTool('read_sectors', { sector: 'tech' }, CTX);
check('read_sectors "tech" reads XLK\'s biggest names', tech.found === true && tech.fund === 'XLK' && (tech.leaders as unknown[]).length === 5, tech);
check('it says the list is fixed, not the whole sector', String(tech.covers).includes('fixed list'));
const banana = await runKaiTool('read_sectors', { sector: 'bananas' }, CTX);
check('an unknown sector lists the ones it knows', banana.found === false && String(banana.plain).includes('Technology (XLK)'));

resetAll();
const [a, b] = await Promise.all([
  runKaiTool('scan_movers', { direction: 'up', min_change_pct: null, min_price: null, min_volume: null }, CTX),
  runKaiTool('read_market_context', {}, CTX),
]);
check('two tools asked at the same moment share ONE snapshot request', a.found && b.found && snapCalls() === 1, snapCalls());

const today = await runKaiTool('read_stock_today', { symbol: 'nvda' }, CTX);
show('read_stock_today', today);
check('read_stock_today answers for NVDA', today.found === true, today.plain);
const moves = today.moves as { what: string; five_days_pct: number | null }[];
check('it compares NVDA, SPY and its sector fund', moves.length === 3 && moves[2].what.startsWith('XLK'), moves.map((m) => m.what));
check('multi-day moves are measured', moves.every((m) => m.five_days_pct !== null), moves);
const nvdaBars = (DAILY.NVDA as { results: { t: number; h: number }[] }).results;
const friday = nvdaBars.find((b) => new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === '2026-09-18');
const pdh = [...(today.support_below as { level: string; price: number }[]), ...(today.resistance_above as { level: string; price: number }[])].find((l) => l.level === 'prior_day_high');
check('during the session "prior day" is the session before today (Fri 09-18)', !!friday && !!pdh && pdh.price === Math.round(friday.h * 100) / 100, { pdh, friday: friday?.h });
check('volume ratios read "<0.1x" rather than "0x"', scan.ratioPlain(3, 100) === '<0.1x' && scan.ratioPlain(250, 100) === '2.5x' && scan.ratioPlain(1, null) === null);
check('support and resistance come from the level engine', (today.support_below as unknown[]).length > 0 || (today.resistance_above as unknown[]).length > 0, today);
check('no graded setup → it says there is no entry/stop/target', String(today.must_say).includes('no graded setup'));
check('earnings more than 14 days away are not flagged', today.earnings_soon === null);

const opt = await runKaiTool('read_options_flow', { symbol: 'NVDA' }, CTX);
show('read_options_flow', opt);
check('read_options_flow answers', opt.found === true, opt.plain);
check('it carries session activity and ≤5 trades', !!opt.session_activity && (opt.biggest_recent_trades as unknown[]).length <= 5);
check('it says activity is not a forecast', String(opt.must_say).includes('not where the stock will go'));

const earn = await runKaiTool('read_earnings', { symbols: ['NVDA', 'AAPL'] }, CTX);
const cos = earn.companies as { symbol: string; next_report: { date: string } | null }[];
show('read_earnings', earn);
check('read_earnings answers for the tickers asked', earn.found === true && cos.length === 2, earn);
check('soonest report first (AAPL before NVDA)', cos[0].symbol === 'AAPL' && cos[1].symbol === 'NVDA', cos.map((c) => [c.symbol, c.next_report?.date]));
const wlEarn = await runKaiTool('read_earnings', { symbols: null }, CTX);
check('null symbols reads their watchlist', wlEarn.found === true && wlEarn.source === 'their watchlist');
intel.deps.watchlistSymbols = async () => [];
const emptyWl = await runKaiTool('read_earnings', { symbols: null }, CTX);
check('an empty watchlist is a plain answer, not a failure', emptyWl.found === false && String(emptyWl.plain).includes('empty'));

const tr = await runKaiTool('read_track_record', { symbol: null, mode: null, days: null }, CTX);
show('read_track_record', tr);
check('read_track_record answers', tr.found === true && tr.graded === 3, tr);
check('it defines "right" and asks for the graded count', String(tr.must_say).includes('five sessions later') && String(tr.must_say).includes('graded count'));
let asked: { symbol: string | null; mode: string | null; sinceIso: string } | null = null;
intel.deps.trackRows = async (o) => { asked = o; return []; };
const trEmpty = await runKaiTool('read_track_record', { symbol: 'xyz', mode: 'swing', days: 9999 }, CTX);
check('days are capped at 180 and the ticker normalised', asked !== null && (asked as { symbol: string }).symbol === 'XYZ' && Date.parse((asked as { sinceIso: string }).sinceIso) === FIXED_NOW - 180 * 86_400_000, asked);
check('no calls in the window is a plain answer', trEmpty.found === false && String(trEmpty.plain).includes('no calls'));

/* ------------------------------------------------------------------ */
/* 4. Honest failures                                                  */
/* ------------------------------------------------------------------ */

console.log('\nHONEST FAILURES');
resetAll();
polygonMode = 'forbidden';
const refused = await runKaiTool('scan_movers', { direction: null, min_change_pct: null, min_price: null, min_volume: null }, CTX);
check('a plan refusal is a sentence', refused.found === false && String(refused.plain).includes('does not include'), refused);
const refusedCtx = await runKaiTool('read_market_context', {}, CTX);
check('…for market context too', refusedCtx.found === false && typeof refusedCtx.plain === 'string');

resetAll();
uwMode = '429';
const throttled = await runKaiTool('read_options_flow', { symbol: 'NVDA' }, CTX);
check('a 429 from the options source is a sentence', throttled.found === false && String(throttled.plain).includes('throttling'), throttled);

resetAll();
const saved = process.env.UNUSUAL_WHALES_TOKEN;
delete process.env.UNUSUAL_WHALES_TOKEN;
const unconfigured = await runKaiTool('read_options_flow', { symbol: 'NVDA' }, CTX);
check('no token = "not connected", with zero requests sent', unconfigured.found === false && String(unconfigured.plain).includes('not connected') && !sent.some((s) => s.host === 'api.unusualwhales.com'), unconfigured);
const earnNoTok = await runKaiTool('read_earnings', { symbols: ['NVDA'] }, CTX);
check('earnings without a token say so', earnNoTok.found === false && String(earnNoTok.plain).includes('not connected'));
const todayNoTok = await runKaiTool('read_stock_today', { symbol: 'NVDA' }, CTX);
check('read_stock_today still answers, and says earnings are unknown', todayNoTok.found === true && String(todayNoTok.earnings_unknown).includes('not connected'));
process.env.UNUSUAL_WHALES_TOKEN = saved;

const noSym = await runKaiTool('read_stock_today', { symbol: '' }, CTX);
check('no ticker is a sentence', noSym.found === false);
intel.deps.trackRows = async () => null;
const dbDown = await runKaiTool('read_track_record', { symbol: null, mode: null, days: null }, CTX);
check('a failed history read is a sentence', dbDown.found === false && String(dbDown.plain).includes('could not read'));

/* ------------------------------------------------------------------ */
/* 5. Read-only                                                        */
/* ------------------------------------------------------------------ */

console.log('\nREAD-ONLY');
resetAll();
intel.deps.trackRows = async () => TR;
intel.deps.watchlistSymbols = async () => ['NVDA'];
for (const t of intel.INTEL_TOOLS) {
  await runKaiTool(t.name, { symbol: 'NVDA', symbols: null, sector: null, direction: null, min_change_pct: null, min_price: null, min_volume: null, mode: null, days: null }, CTX);
}
const writes = sent.filter((s) => s.method !== 'GET');
check('every tool ran and not one non-GET request left the process', sent.length > 0 && writes.length === 0, writes);

/* ------------------------------------------------------------------ */
/* 6. The definitions                                                  */
/* ------------------------------------------------------------------ */

console.log('\nDEFINITIONS');
check('seven tools', intel.INTEL_TOOLS.length === 7);
check('all registered in KAI_TOOLS', intel.INTEL_TOOLS.every((t) => KAI_TOOLS.some((k) => k.name === t.name)));
for (const t of intel.INTEL_TOOLS) {
  const s = t.input_schema as unknown as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
  check(
    `${t.name}: strict, closed, every property required`,
    t.strict === true && s.additionalProperties === false && Object.keys(s.properties).every((k) => s.required.includes(k))
  );
  check(`${t.name}: description is stable text (no dates, no clock)`, !/\d{4}-\d{2}-\d{2}|today is|as of/i.test(t.description ?? ''));
}
const defChars = JSON.stringify(intel.INTEL_TOOLS).length;
const allChars = JSON.stringify(KAI_TOOLS).length;
console.log(`      intel definitions: ${defChars} chars ≈ ${Math.round(defChars / 3.6)} tokens (all ${KAI_TOOLS.length} tools: ${allChars} chars ≈ ${Math.round(allChars / 3.6)} tokens)`);
check('the seven add under 2,000 tokens to the cached prefix', defChars / 3.6 < 2000, defChars);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASS'}  (${passes} assertions)`);
process.exit(failures ? 1 : 0);
