/**
 * PROOF FOR THE KAI WORKSPACE BUS.
 *
 *   cd apps/mobile && npx tsx scripts/kai-workspace-test.mts
 *
 * No React, no network, no model. The store is a plain object with a
 * subscription — `useSyncExternalStore` is only touched inside the hook — so the
 * behaviour that decides what is on screen can be driven directly.
 *
 * Five things, and every one of them is a phone-shaped mistake waiting to
 * happen:
 *
 *  1. ONE CHART, NOT A ROW OF THEM. "Pull up NVDA" then "pull up AMD" is one
 *     chart that changed symbol. Two chart chips in a strip is a member having
 *     to remember which is which.
 *  2. THE STACK IS CAPPED. A long conversation that opens six things must not
 *     leave a strip nobody will scroll.
 *  3. COLLAPSE IS NOT CLOSE. Swiping back to read what Kai said has not
 *     finished with the chart; re-opening it from the strip must not cost a
 *     reload.
 *  4. THE NONCE MOVES ON A SUBJECT CHANGE AND ONLY THEN. The host keys the
 *     surface on it, so a wrong answer here is either a chart that will not
 *     walk to a new ticker or a WebView that reloads every time you tap a chip.
 *  5. WHAT KAI IS TOLD MATCHES WHAT IS ON SCREEN. `toState` is the whole
 *     pronoun mechanism: get it wrong and "build it" builds the wrong thing.
 *
 * The source checks at the end are structural. A workspace that started
 * navigating, or a surface that rendered a placeholder, would each undo the
 * point of the feature while still compiling.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspace, MAX_SURFACES } from '../src/features/kai-workspace/store';
import type { KaiWorkspaceAction } from '@cheatcode/shared';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}
function head(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

const chart = (symbol: string, timeframe: string | null = null): KaiWorkspaceAction =>
  ({ type: 'open_chart', symbol, timeframe, setup_id: null }) as KaiWorkspaceAction;

/* ==================================================================== */

head('Kai opens things, and the canvas follows');
workspace.reset();
ok('the resting state is a conversation with nothing over it', workspace.get().activeId === null);
ok('and no surfaces at all', workspace.get().surfaces.length === 0);

workspace.apply(chart('NVDA', '4h'));
ok('a chart becomes the active surface', workspace.get().activeId === 'chart');
ok('carrying its symbol', workspace.get().surfaces[0]?.symbol === 'NVDA');
ok('and its timeframe', workspace.get().surfaces[0]?.timeframe === '4h');

head('The same kind is one surface, not two');
const firstNonce = workspace.get().surfaces[0]!.nonce;
workspace.apply(chart('AMD'));
ok('walking to another ticker does not open a second chart', workspace.get().surfaces.length === 1);
ok('it is the same surface, on the new symbol', workspace.get().surfaces[0]?.symbol === 'AMD');
ok('and the nonce moved, so the host remounts it', workspace.get().surfaces[0]!.nonce !== firstNonce);

const amdNonce = workspace.get().surfaces[0]!.nonce;
workspace.apply(chart('AMD'));
ok('re-opening the SAME chart does not remount it', workspace.get().surfaces[0]!.nonce === amdNonce);

head('More than one thing open');
workspace.apply({ type: 'show_news', symbol: 'AMD' } as KaiWorkspaceAction);
ok('news joins the chart rather than replacing it', workspace.get().surfaces.length === 2);
ok('and is the one on the canvas', workspace.get().activeId === 'news');
ok('the chart is still there, one tap away', workspace.get().surfaces.some((s) => s.id === 'chart'));

ok('focus brings one forward', workspace.apply({ type: 'focus_surface', surface_id: 'chart' } as KaiWorkspaceAction) && workspace.get().activeId === 'chart');
ok('focusing something that is not open changes nothing',
  !workspace.apply({ type: 'focus_surface', surface_id: 'training' } as KaiWorkspaceAction));

head('Collapse is not close');
workspace.collapse();
ok('the conversation takes the canvas back', workspace.get().activeId === null);
ok('but nothing was thrown away', workspace.get().surfaces.length === 2);
workspace.focus('chart');
ok('and the chart comes straight back', workspace.get().activeId === 'chart');

head('The strip is capped');
workspace.reset();
workspace.apply(chart('NVDA'));
workspace.apply({ type: 'show_news', symbol: 'NVDA' } as KaiWorkspaceAction);
workspace.apply({ type: 'show_setup', setup_id: 's1', symbol: 'NVDA' } as KaiWorkspaceAction);
workspace.apply({ type: 'show_alert', alert_id: 'a1' } as KaiWorkspaceAction);
workspace.apply({ type: 'show_web', url: 'https://reuters.com/x', title: null } as KaiWorkspaceAction);
ok(`no more than ${MAX_SURFACES} survive`, workspace.get().surfaces.length === MAX_SURFACES, workspace.get().surfaces.map((s) => s.id));
ok('the oldest is the one that fell off', !workspace.get().surfaces.some((s) => s.id === 'chart'));
ok('and the newest is on the canvas', workspace.get().activeId === 'web');

head('What Kai is told is what is on screen');
workspace.reset();
workspace.apply(chart('NVDA', '1h'));
workspace.apply({ type: 'show_setup', setup_id: 'setup-9', symbol: 'NVDA' } as KaiWorkspaceAction);
const st = workspace.toState();
ok('the active surface is named', st.active_surface === 'setup');
ok('the symbol travels', st.symbol === 'NVDA');
ok('the chart timeframe travels even from another surface', st.timeframe === '1h');
ok('so does the id "build it" would need', st.setup_id === 'setup-9');
ok('and everything open is listed', st.open_surfaces.includes('chart') && st.open_surfaces.includes('setup'));

workspace.reset();
const empty = workspace.toState();
ok('an empty workspace is still reported, not omitted', empty.active_surface === null && empty.open_surfaces.length === 0);

head('Closing');
workspace.apply(chart('NVDA'));
workspace.apply({ type: 'show_news', symbol: 'NVDA' } as KaiWorkspaceAction);
workspace.close('news');
ok('the surface goes', !workspace.get().surfaces.some((s) => s.id === 'news'));
ok('and the canvas falls back to what is left', workspace.get().activeId === 'chart');
workspace.close('chart');
ok('closing the last one returns the conversation', workspace.get().activeId === null);

head('Subscribers are told');
workspace.reset();
let fired = 0;
const off = workspace.subscribe(() => { fired += 1; });
workspace.apply(chart('SPY'));
ok('an action notifies', fired === 1);
off();
workspace.apply(chart('QQQ'));
ok('and unsubscribing stops it', fired === 1);

/* ==================================================================== */

head('The workspace does not navigate, and does not invent');
{
  const host = read('src/features/kai-workspace/WorkspaceHost.tsx');
  const surfaces = read('src/features/kai-workspace/surfaces/objects.tsx');
  const chartSurface = read('src/features/kai-workspace/surfaces/ChartSurface.tsx');
  const runtime = read('src/features/kai-workspace/chart-runtime.ts');

  /**
   * THE ONE THING THAT WOULD UNDO THE WHOLE FEATURE. A host that pushed a route
   * would take the member out of the conversation that asked for the surface —
   * which is the app this replaced.
   */
  ok('the host never pushes a route itself', !/router\.push/.test(host));
  ok('and renders nothing at all when nothing is open', host.includes('if (!active) return null'));
  ok('a surface with no data yet says so rather than drawing one',
    surfaces.includes('Loading the setup…') && surfaces.includes('I could not load that alert'));
  ok('and separates "still loading" from "there is nothing"',
    surfaces.includes('loading: boolean; missing: string | null'));

  /**
   * THE CHART IS ONE IMPLEMENTATION. `ChartSurface` composes `SymbolChart` and
   * the shared runtime; it must not grow a second copy of either.
   */
  ok('the chart surface owns no data of its own', !/usePortal\(/.test(chartSurface));
  ok('it mounts the shared chart', chartSurface.includes('SymbolChart'));
  ok('on the shared runtime', chartSurface.includes('useChartRuntime'));
  ok('navigation is a prop, not a decision', runtime.includes('onRoute?:'));
  ok('and the runtime still commits state AFTER the choreography',
    runtime.includes('.then(commit, commit)'));
}

head('Trade and Home run the same chart');
{
  const portal = read('src/features/portal2/TradePortalV2.tsx');
  ok('Trade uses the shared runtime', portal.includes('useChartRuntime'));
  ok('and no longer keeps its own copy of the applier', !portal.includes('const applyCommand = useCallback'));
  ok('nor its own reveal set', !portal.includes('const [revealed, setRevealed]'));
  ok('nor its own candle fetch', !/usePortalCandles\(/.test(portal));
}

head('Home hosts it without stopping being a conversation');
{
  const home = read('src/app/(tabs)/home.tsx');
  ok('Home mounts the workspace', home.includes('<WorkspaceHost'));
  ok('and hands Kai what is on screen', home.includes('useWorkspaceBridge'));
  ok('the bridge reaches the wall', /useKaiWall\(mode, seed, target, bridge\)/.test(home));
  ok('a new conversation clears the desk', home.includes('workspace.reset()'));
}

head('A directed answer is not dropped on the floor');
{
  const bridge = read('src/features/kai-workspace/bridge.ts');
  /**
   * THE TRAP. A directed answer's prose rides INSIDE the `chart_answer` frame
   * and is deliberately not also streamed as `text_delta`. A host that handles
   * only text gets a moving chart and a silent conversation.
   */
  ok('the bridge handles chart_answer', bridge.includes("=== 'chart_answer'"));
  ok('and puts its words into the conversation', bridge.includes('onAnswer'));
  ok('it handles a single chart_command too', bridge.includes("=== 'chart_command'"));
  ok('a new question abandons a running performance', bridge.includes('beginTurn'));
  ok('and so does unmounting', bridge.includes('run.current?.cancel()'));
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
