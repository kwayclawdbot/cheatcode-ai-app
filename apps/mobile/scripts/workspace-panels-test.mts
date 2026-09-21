/**
 * PROOF FOR THE WORKSPACE PANELS ON THE PHONE.
 *
 *   cd apps/mobile && npx tsx scripts/workspace-panels-test.mts
 *
 * No React render, no network, no model. The store is driven directly, the
 * readers are pure, and the rest are structural checks on the source — the
 * same method `kai-workspace-test.mts` uses, for the same reason: every rule
 * here is one a screen can break while still compiling.
 *
 *  1. EVERY PANEL KAI CAN OPEN, THE PHONE CAN DRAW. An offered action with no
 *     store case, no label or no renderer is Kai saying "here it is" over an
 *     empty canvas.
 *  2. ONE PANEL PER KIND. A quote card for NVDA then AMD is one card that
 *     walked, not two chips to tell apart.
 *  3. NULL IS NEVER ZERO. The readers keep a missing number missing.
 *  4. EXAMPLE CONTENT ONLY BEHIND THE FLAG, line by line.
 *  5. THE MEMBER CAN OPEN AND CLOSE THEM WITHOUT KAI, and doing so navigates
 *     nowhere.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspace } from '../src/features/kai-workspace/store';
import {
  PanelShapeError, bigMoney, compact, fixtureWorkspaceTurn, rangePosition, readEarnings,
  readOptionsChain, readQuoteCard, readWatchlist, shortDate, strikeLabel, usd, bidAsk,
} from '../src/features/kai-workspace/panels-read';
import type { KaiWorkspaceAction } from '@cheatcode/shared';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const SHARED = readFileSync(path.join(ROOT, '../../packages/shared/api.ts'), 'utf8');

let failures = 0;
let passes = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { passes += 1; console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}
function head(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}
const act = (a: unknown) => a as KaiWorkspaceAction;

/* ==================================================================== */

const OFFERED = (/export const KAI_OFFERED_ACTIONS = \[([\s\S]*?)\] as const/.exec(SHARED)?.[1] ?? '')
  .match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
const PANEL_ACTIONS: Record<string, { kind: string; action: KaiWorkspaceAction }> = {
  show_quote: { kind: 'quote', action: act({ type: 'show_quote', symbol: 'nvda' }) },
  show_earnings: { kind: 'earnings', action: act({ type: 'show_earnings', symbol: 'nvda' }) },
  show_options: { kind: 'options', action: act({ type: 'show_options', symbol: 'nvda' }) },
  show_watchlist: { kind: 'watchlist', action: act({ type: 'show_watchlist' }) },
  show_portfolio: { kind: 'portfolio', action: act({ type: 'show_portfolio' }) },
};

head('Every panel Kai can open, the phone can draw');
{
  const host = read('src/features/kai-workspace/WorkspaceHost.tsx');
  for (const [name, { kind, action }] of Object.entries(PANEL_ACTIONS)) {
    ok(`${name} is offered to Kai`, OFFERED.includes(name));
    workspace.reset();
    ok(`${name} opens a surface`, workspace.apply(action) && workspace.get().activeId === kind, workspace.get());
    ok(`the host renders '${kind}'`, host.includes(`case '${kind}':`));
    ok(`the strip has a name for '${kind}'`, new RegExp(`\\n\\s+${kind}: '[A-Z]`).test(host));
  }
  // Every offered show_* action at all — not only the panels — has a store case.
  const store = read('src/features/kai-workspace/store.ts');
  for (const a of OFFERED) ok(`the store handles ${a}`, store.includes(`case '${a}':`));
}

head('One panel per kind, walking to a new subject');
{
  workspace.reset();
  workspace.apply(act({ type: 'show_quote', symbol: 'nvda' }));
  const n1 = workspace.get().surfaces[0]!.nonce;
  ok('the symbol is upper-cased', workspace.get().surfaces[0]?.symbol === 'NVDA');
  workspace.apply(act({ type: 'show_quote', symbol: 'AMD' }));
  ok('a second quote is the same card', workspace.get().surfaces.length === 1 && workspace.get().surfaces[0]?.symbol === 'AMD');
  ok('and it remounts for the new ticker', workspace.get().surfaces[0]!.nonce !== n1);
  const n2 = workspace.get().surfaces[0]!.nonce;
  workspace.apply(act({ type: 'show_quote', symbol: 'AMD' }));
  ok('the same ticker again does not reload it', workspace.get().surfaces[0]!.nonce === n2);

  workspace.apply(act({ type: 'show_options', symbol: 'AMD' }));
  workspace.apply(act({ type: 'show_watchlist' }));
  ok('panels stack beside each other', workspace.get().surfaces.map((s) => s.id).join(',') === 'quote,options,watchlist');
  const w = workspace.get().surfaces.find((s) => s.id === 'watchlist')!;
  ok('the watchlist carries no subject', w.symbol === null);
  const wn = w.nonce;
  workspace.apply(act({ type: 'show_quote', symbol: 'AMD' }));
  workspace.apply(act({ type: 'show_watchlist' }));
  ok('re-opening the watchlist brings it forward without a reload', workspace.get().surfaces.find((s) => s.id === 'watchlist')!.nonce === wn && workspace.get().activeId === 'watchlist');

  workspace.apply(act({ type: 'show_earnings', symbol: 'AMD' }));
  const st = workspace.toState();
  ok('Kai is told a panel is active', st.active_surface === 'earnings');
  ok('and which ticker it is on', st.symbol === 'AMD');
  ok('and everything else that is open', ['quote', 'options', 'watchlist', 'earnings'].every((k) => st.open_surfaces.includes(k as never)));

  workspace.apply(act({ type: 'show_portfolio' }));
  ok('the strip still caps at four, dropping the oldest', workspace.get().surfaces.length === 4 && !workspace.get().surfaces.some((s) => s.id === 'options'), workspace.get().surfaces.map((s) => s.id));
  ok('on their own positions there is no ticker to talk about', workspace.toState().symbol === null);

  workspace.close('portfolio');
  ok('closing the active panel falls back to the last one', workspace.get().activeId === 'earnings');
}

head('The readers keep a missing number missing');
{
  const q = readQuoteCard({ kind: 'quote', symbol: 'NVDA', quote: { price: 181.2, freshness: 'live', label_plain: 'Live', session: 'open' }, day: { basis: 'none' } }, 'NVDA');
  ok('a range that was not sent is null', q.day.high === null && q.day.low === null && q.day.volume === null);
  ok('and the previous close too', q.quote.prev_close === null);
  ok('the basis falls to "none", with words', q.day.basis === 'none' && q.day.basis_plain.length > 0);
  ok('a numeric string is read as a number', readQuoteCard({ kind: 'quote', quote: { price: '12.5' }, day: {} }, 'X').quote.price === 12.5);
  ok('unknown freshness is never promoted to live', readQuoteCard({ kind: 'quote', quote: { price: 1, freshness: 'fresh!' }, day: {} }, 'X').quote.freshness === 'stale');

  let threw: unknown = null;
  try { readQuoteCard({ kind: 'earnings' }, 'X'); } catch (e) { threw = e; }
  ok('a payload of the wrong kind is refused with a sentence', threw instanceof PanelShapeError && /could not read/.test((threw as Error).message));

  const e = readEarnings({ kind: 'earnings', quarters: [{ fiscal_period: 'Q2', fiscal_year: '2027', eps_diluted: null, revenue: 46.7e9 }], next: null, next_plain: 'Not known.' }, 'NVDA');
  ok('no next date stays null', e.next === null && e.next_plain === 'Not known.');
  ok('an EPS that was not reported stays null', e.quarters[0].eps_diluted === null);

  const o = readOptionsChain({
    kind: 'options', spot: 181, rows: [
      { strike: 180, call: { option_symbol: 'X260925C00180000', bid: '3.20', ask: 3.3, last: null, volume: 11762, open_interest: 3196, iv: 0.33, last_trade_at: '2026-09-21T14:51:46Z' }, put: null, nearest_the_money: true, call_flow: null, put_flow: null },
      { strike: 'junk' },
    ], flow: [{ type: 'call', strike: 182.5, expiry: '2026-09-25', option_symbol: 'O:X', recorded_at: '2026-09-21T13:52:00Z', bid: null, ask: 2.18 }],
    prices_as_of: '2026-09-21T14:51:46Z',
  }, 'X');
  ok('a row without a strike is dropped, not drawn at zero', o.rows.length === 1);
  ok('an unlisted side stays unlisted', o.rows[0].put === null);
  ok('a priced side keeps its UW numbers', o.rows[0].call?.bid === 3.2 && o.rows[0].call.ask === 3.3 && o.rows[0].call.volume === 11762);
  ok('a last price that was not sent is null, not $0.00', o.rows[0].call?.last === null);
  ok('the time of the prices is kept', o.prices_as_of === '2026-09-21T14:51:46Z');
  ok('a side with no contract symbol is not listed', readOptionsChain({ kind: 'options', rows: [{ strike: 1, call: { bid: 1 } }] }, 'X').rows[0].call === null);
  ok('bid / ask prints the way a chain does', bidAsk({ bid: 3.2, ask: 3.3 }) === '3.20 / 3.30');
  ok('a missing half says so, and both missing is nothing', bidAsk({ bid: null, ask: 0.05 }) === 'not known / 0.05' && bidAsk({ bid: null, ask: null }) === null);
  ok('a recorded bid that was not sent is null, not $0.00', o.flow[0].bid === null && o.flow[0].ask === 2.18);
  ok('a flow print without its time is dropped', readOptionsChain({ kind: 'options', rows: [], flow: [{ type: 'call', strike: 1, expiry: 'x', option_symbol: 'y' }] }, 'X').flow.length === 0);

  const w = readWatchlist({ items: [{ symbol: 'NVDA', quote: null }, { name: 'no symbol' }], name: 'Mine' });
  ok('a watchlist row with no quote keeps no quote', w.items.length === 1 && w.items[0].quote === null);

  ok('usd(null) is null', usd(null) === null && usd(0) === '$0.00');
  ok('compact reads volume the way people say it', compact(21_461_659) === '21.5M' && compact(8123) === '8,123' && compact(null) === null);
  ok('bigMoney reads revenue', bigMoney(46.7e9) === '$46.7B' && bigMoney(null) === null);
  ok('shortDate names a day', shortDate('2026-09-25') === 'Sep 25' && shortDate(null) === null);
  ok('strikes drop trailing zeros', strikeLabel(180) === '180' && strikeLabel(182.5) === '182.5');
  ok('a range with no width has no position', rangePosition(10, 10, 10) === null && rangePosition(null, 12, 11) === null);
  ok('and a price inside it sits inside it', rangePosition(10, 20, 15) === 0.5);
}

head('Example content only behind the flag');
{
  const data = read('src/features/kai-workspace/panels-data.ts');
  const lines = data.split('\n');
  const unguarded = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /fixture[A-Z]\w*\(|tradeApi\.positions/.test(l) && !/^\s*(import|\*|\/\/)/.test(l))
    .filter(({ l, i }) => /fixture[A-Z]\w*\(/.test(l) ? !/env\.FIXTURES/.test(l) : !/env\.FIXTURES|requireLive\(\)/.test(lines.slice(Math.max(0, i - 2), i + 1).join('\n')));
  ok('every fixture return is on an env.FIXTURES line', unguarded.length === 0, unguarded.map((u) => `line ${u.i + 1}: ${u.l.trim()}`));
  ok('without the flag and without a service, it refuses instead', /function requireLive/.test(data) && (data.match(/requireLive\(\);/g) ?? []).length === 5);
  ok('it is never keyed on offlineMode', !/offlineMode/.test(data));
  const panels = read('src/features/kai-workspace/surfaces/panels.tsx');
  ok('the surfaces never reach a fixture themselves', !/fixture/i.test(panels.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('and never turn a missing number into zero', !/\?\?\s*0\b/.test(panels));
}

head('The panels are honest on the panel itself');
{
  const panels = read('src/features/kai-workspace/surfaces/panels.tsx');
  ok('each loads, fails and empties out loud',
    ['Loading the price card', 'Loading the options', "earnings…", 'Loading your watchlist', 'Loading your positions'].every((s) => panels.includes(s))
      && (panels.match(/testID="panel-failed"/g) ?? []).length === 5
      && (panels.match(/testID="panel-empty"/g) ?? []).length === 2);
  ok('a failure prints the server\'s own sentence when there is one', /e instanceof Error && e\.message/.test(panels));
  ok('a missing number reads "not known"', (panels.match(/not known/g) ?? []).length >= 4);
  ok('the options panel says where its prices come from and how fresh', panels.includes('testID="options-prices-source"') && panels.includes('d.prices_plain') && panels.includes('d.prices_as_of'));
  ok('the old "no live prices" caveat is gone from panel and fixtures', !/no live option prices/i.test(panels) && !/market-data plan/.test(read('src/features/kai-workspace/panels-read.ts')));
  ok('a recorded option price says it was recorded', panels.includes('recorded') && panels.includes('etStampOf(f.recorded_at)'));
  ok('the earnings panel states there are no estimates', panels.includes('testID="earnings-no-estimates"'));
  ok('and an unknown next date is said, not blank', panels.includes('testID="earnings-next-unknown"'));
  ok('the quote card names the session its range is from', panels.includes('Day range · ${label}'));
  ok('positions say they are paper', /Practice money/.test(panels));
  ok('tickers always carry their mark', (panels.match(/<Ticker\b/g) ?? []).length >= 5);
  ok('the panels navigate nowhere on their own', !/router\.push|useRouter/.test(panels));
}

head('The member opens and closes them without Kai');
{
  const launcher = read('src/features/kai-workspace/PanelLauncher.tsx');
  const host = read('src/features/kai-workspace/WorkspaceHost.tsx');
  const home = read('src/app/(tabs)/home.tsx');
  ok('Home has the launcher', home.includes('<PanelLauncherButton') && home.includes('<PanelLauncher '));
  ok('it applies the same actions Kai emits', launcher.includes('workspace.apply(e.action(sym))'));
  ok('it offers all five panels', ['show_quote', 'show_earnings', 'show_options', 'show_watchlist', 'show_portfolio'].every((a) => launcher.includes(`'${a}'`)));
  ok('a symbol panel waits for a ticker shaped like one', launcher.includes('if (e.needsSymbol && !valid) return'));
  ok('it starts from the ticker already on screen', launcher.includes('workspace.toState().symbol'));
  ok('and it navigates nowhere', !/router|navigate/.test(launcher.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('the host has a close button for the active surface', host.includes('testID="workspace-close"') && host.includes('close(active.id)'));
  ok('the host still never pushes a route', !/router\.push/.test(host));
  ok('inside a panel, the member can walk to the next one', read('src/features/kai-workspace/surfaces/panels.tsx').includes('function Jumps'));
}

head('Fixtures mode can drive the real workspace path');
{
  ok('earnings words open earnings', fixtureWorkspaceTurn('show me NVDA earnings')?.action.type === 'show_earnings');
  ok('on the ticker named', (fixtureWorkspaceTurn('show me AMD earnings')?.action as { symbol?: string }).symbol === 'AMD');
  ok('options words open options', fixtureWorkspaceTurn('what options are there on TSLA')?.action.type === 'show_options');
  ok('watchlist words open the watchlist', fixtureWorkspaceTurn("what's on my watchlist")?.action.type === 'show_watchlist');
  ok('position words open the portfolio', fixtureWorkspaceTurn('how are my positions doing')?.action.type === 'show_portfolio');
  ok('anything else keeps the old canned reply', fixtureWorkspaceTurn('hello there') === null);
  const useKai = read('src/lib/useKai.ts');
  ok('the fixture turn goes through the same onWorkspaceAction the live frame does',
    useKai.includes('if (canned.workspace) optsRef.current.onWorkspaceAction?.(canned.workspace)'));
}

console.log(failures ? `\n${failures} failed, ${passes} passed\n` : `\nall passed (${passes})\n`);
process.exit(failures ? 1 : 0);
