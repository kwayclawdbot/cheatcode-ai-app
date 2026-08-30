/**
 * Every chart command the server can send must PLAN to something.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. `planCommand` returned `null` for five of the sixteen
 * commands — the camera moves LIVE-1 added — and null means the portal does
 * nothing at all. No error, no log, no missing import: the frame arrived, was
 * accepted, and vanished. It went unnoticed for a release because the four
 * commands anyone tested by hand ("mark the trigger", "switch to the hourly")
 * were all in the eleven that worked.
 *
 * A DIRECTED ANSWER IS MOSTLY THE FIVE THAT DID NOT. The director's commonest
 * cue by a wide margin is the cursor travelling to the level being spoken, which
 * is `pointer_hint`. An answer that called nine actions performed two, and the
 * feature read as "barely anything happens".
 *
 * So the assertion is coverage, not behaviour: every name in
 * `CHART_COMMAND_NAMES` plans to something. It is deliberately blunt, because
 * the failure it guards is a case falling off the end of a switch, and the next
 * command anyone adds will fail this the moment it is added rather than a
 * release later.
 */
import { planCommand } from '../src/features/portal/plan-command';
import { CHART_COMMAND_NAMES } from '../src/features/portal/types';
import type { ChartCommand, ChartCommandName } from '../src/features/portal/types';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/** A server frame carrying a persisted annotation, as `readCommand` shapes it. */
const served = [{
  id: 'ann-1', symbol: 'NVDA', timeframe: '1d', kind: 'trigger', price: 227.92,
  price2: null, ts_from: null, ts_to: null, text: 'Trigger', reason: 'why',
  provenance: 'kai', status: 'valid',
}];

/** Enough of a portal for the commands that read one. */
const portal = {
  symbol: 'NVDA',
  chart: { timeframe: 'D', timeframes: ['5m', '1h', 'D'], focus_ts: '2026-08-27T00:00:00.000Z' },
  alert: { id: 'alert-1' },
  plan: { id: 'plan-1', entry: 227.92, stop: 207.25, targets: [{ price: 250 }] },
  community: { level: 220 },
} as never;

/**
 * And the same run against a portal that is missing blocks it is typed to have.
 * `planCommand` is fed whatever the screen is holding, which during a reload or
 * a degraded fetch is not always the full object. It must not THROW: a throw
 * from here rejects the answer runner's promise and abandons every action after
 * it, so one soft field turns into a chart that stopped halfway through.
 */
const thinPortal = { symbol: 'NVDA' } as never;

const PAYLOAD: Partial<Record<ChartCommandName, Record<string, unknown>>> = {
  set_timeframe: { timeframe: '1h' },
  mark_level: { level: 'trigger', price: 227.92, annotations: served },
  show_invalidation: { price: 207.25, annotations: served },
  mark_plan: { entry: 227.92, stop: 207.25, targets: [250], annotations: served },
  zoom_trigger: { level: 'trigger', focus_ts: '2026-08-27T00:00:00.000Z' },
  compare_prior: { range: { from: '2026-08-27', to: '2026-08-27' } },
  highlight_community: { price: 220, annotations: served },
  annotation_remove: { annotation_id: 'ann-1' },
  annotation_explain: { annotation_id: 'ann-1', annotations: served },
  alert_from_level: { price: 227.92, route: '/alert/new' },
  prepare_trade: { route: '/order/new', entry: 227.92, stop: 207.25 },
  zoom_range: { from: '2026-04-02T04:00:00.000Z', to: '2026-08-28T20:00:00.000Z', padding: 0.08 },
  scroll_bars: { bars: -40 },
  scroll_to_now: {},
  flash_annotation: { annotation_id: 'ann-1', pulses: 2 },
  pointer_hint: { price: 227.92, linger: true },
};

console.log('\nEvery command the server can send plans to something');
const dead: string[] = [];
for (const command of CHART_COMMAND_NAMES) {
  const c: ChartCommand = { command, payload: PAYLOAD[command] ?? {}, narration: null };
  const plan = planCommand(c, portal, []);
  if (!plan) dead.push(command);
}
ok('no command falls through to `default: return null`', dead.length === 0, { dead });

const threw: string[] = [];
for (const command of CHART_COMMAND_NAMES) {
  const c: ChartCommand = { command, payload: PAYLOAD[command] ?? {}, narration: null };
  try { planCommand(c, thinPortal, []); } catch { threw.push(command); }
  try { planCommand({ ...c, payload: {} }, thinPortal, []); } catch { threw.push(`${command} (bare)`); }
}
ok('and none throws on a portal missing the blocks it is typed to have', threw.length === 0, { threw });

console.log('\nThe camera commands specifically — the five that were dropped');
for (const command of ['pointer_hint', 'flash_annotation', 'zoom_range', 'scroll_bars', 'scroll_to_now'] as const) {
  const plan = planCommand({ command, payload: PAYLOAD[command] ?? {}, narration: null }, portal, []);
  ok(`${command} plans`, plan !== null);
}

console.log('\nA camera move changes no annotation — it only moves the view');
{
  const plan = planCommand({ command: 'pointer_hint', payload: PAYLOAD.pointer_hint!, narration: null }, portal, []);
  ok('nothing is drawn', plan !== null && plan.upsert.length === 0 && plan.remove.length === 0, plan);
  ok('and no route is pushed', plan?.route === null, plan?.route);
}

console.log('\nA served annotation is still drawn exactly as the server sent it');
{
  const plan = planCommand({ command: 'mark_level', payload: PAYLOAD.mark_level!, narration: null }, portal, []);
  ok('the persisted row is upserted', plan?.upsert.length === 1, plan?.upsert);
  ok('at the price the server resolved', plan?.upsert[0]?.price === 227.92, plan?.upsert[0]?.price);
  ok('keeping the id, so a later flash can find it', plan?.upsert[0]?.id === 'ann-1', plan?.upsert[0]?.id);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
